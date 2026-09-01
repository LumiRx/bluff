/* Taking money, and the four ways somebody would try not to.

   The purchase path is the only place in this product where a lie by the client
   turns into value, so it gets tested like it matters. Apple and Google are
   stood up as fakes here — not to avoid the network, but so a *forged* receipt
   can be presented and the refusal observed, which is impossible against the
   real thing.

   node pay.js
*/
const { DatabaseSync } = require('node:sqlite');

let pass = 0; const problems = [];
const ok = m => { pass++; console.log('   · ' + m); };
const bad = m => { problems.push(m); console.log('   ✗ ' + m); };
const is = (a, b, m) => (a === b ? ok(m) : bad(`${m} — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`));

function storage() {
  const db = new DatabaseSync(':memory:');
  return { db, sql: { exec(q, ...p) {
    const st = db.prepare(q);
    if (/^\s*(SELECT|PRAGMA|WITH)/i.test(q)) { const r = st.all(...p); return { toArray: () => r }; }
    st.run(...p); return { toArray: () => [] };
  } } };
}

const b64url = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jws = payload => `x.${b64url(payload)}.y`;

/* a key that is real enough to sign with, generated here so no secret is
   involved and the test is self-contained */
const { generateKeyPairSync } = require('node:crypto');
const ASC_KEY = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  .privateKey.export({ type: 'pkcs8', format: 'pem' });
const PLAY_SA = JSON.stringify({
  client_email: 'bluff@bluff.iam.gserviceaccount.com',
  private_key: generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' }),
});

const ENV = { ASC_KEY, ASC_KEY_ID: 'ABC1234567', ASC_ISSUER: 'iss-uuid',
              BUNDLE_ID: 'gg.bluff.app' };

/* ── Apple and Google, as they behave from the outside ────────────────────── */
const SOLD = new Map();          // txid -> product, what the store believes
const CONSUMED = [];
function appleFake(url, init) {
  const txid = decodeURIComponent(url.split('/transactions/')[1] || '');
  const rec = SOLD.get(txid);
  if (!rec) return Promise.resolve({ ok: false, status: 404 });
  return Promise.resolve({ ok: true, status: 200, json: async () => ({
    signedTransactionInfo: jws({
      transactionId: txid, bundleId: rec.bundleId || 'gg.bluff.app',
      productId: rec.product, type: 'Consumable',
      revocationDate: rec.refunded ? Date.now() : undefined,
    }) }) });
}
function googleFake(url, init) {
  if (url.includes('oauth2.googleapis.com'))
    return Promise.resolve({ ok: true, json: async () => ({ access_token: 'fake-token' }) });
  if (url.endsWith(':consume')) { CONSUMED.push(url); return Promise.resolve({ ok: true }); }
  const tok = decodeURIComponent(url.split('/tokens/')[1] || '');
  const rec = SOLD.get(tok);
  if (!rec) return Promise.resolve({ ok: false, status: 404 });
  return Promise.resolve({ ok: true, json: async () => ({
    purchaseState: rec.pending ? 4 : 0, orderId: rec.order }) });
}

(async () => {
  const P = await import('./server/src/purchases.js');
  const HANDFUL = 'gg.bluff.stars.handful', VAULT = 'gg.bluff.stars.vault';

  console.log('\n1. an honest purchase');
  const st = storage(); P.schema(st.sql);
  {
    SOLD.set('tx-1001', { product: HANDFUL });
    const r = await P.redeem(st.sql, ENV, 'acct-A',
      { store: 'apple', transactionId: 'tx-1001' }, appleFake);
    is(r.ok, true, 'apple confirms it and the stars are credited');
    is(r.stars, P.CATALOG[HANDFUL].stars, 'the amount comes from our catalogue, not the request');
  }

  console.log('\n2. the four things somebody would try');
  {
    /* asking for more than you paid for */
    SOLD.set('tx-1002', { product: HANDFUL });
    const greedy = await P.redeem(st.sql, ENV, 'acct-A',
      { store: 'apple', transactionId: 'tx-1002', stars: 999999, product: VAULT }, appleFake);
    is(greedy.stars, P.CATALOG[HANDFUL].stars,
       'a request naming a bigger pack still gets the pack that was actually bought');

    /* a receipt nobody ever bought */
    const forged = await P.redeem(st.sql, ENV, 'acct-A',
      { store: 'apple', transactionId: 'tx-made-up' }, appleFake);
    is(forged.ok, false, 'a forged transaction id is refused');
    is(forged.error, 'apple would not confirm that purchase', 'and says why');

    /* the same receipt twice */
    const again = await P.redeem(st.sql, ENV, 'acct-A',
      { store: 'apple', transactionId: 'tx-1001' }, appleFake);
    is(again.already, true, 'a replay is recognised rather than paid out twice');
    const total = st.sql.exec('SELECT SUM(stars) s FROM purchases').toArray()[0].s;
    is(total, P.CATALOG[HANDFUL].stars * 2, 'two real purchases, two credits, no third');

    /* somebody else's receipt */
    const theft = await P.redeem(st.sql, ENV, 'acct-B',
      { store: 'apple', transactionId: 'tx-1001' }, appleFake);
    is(theft.stars, 0, "another account presenting the same receipt is credited nothing");
    const mine = st.sql.exec('SELECT account FROM purchases WHERE txid = ?', 'tx-1001')
      .toArray()[0].account;
    is(mine, 'acct-A', 'and the purchase still belongs to whoever made it');
  }

  console.log('\n3. receipts that are real but not valid');
  {
    SOLD.set('tx-other-app', { product: HANDFUL, bundleId: 'com.someone.else' });
    const wrongApp = await P.redeem(st.sql, ENV, 'acct-A',
      { store: 'apple', transactionId: 'tx-other-app' }, appleFake);
    is(wrongApp.error, 'that receipt belongs to a different app',
       'a genuine receipt from another app is refused');

    SOLD.set('tx-refunded', { product: HANDFUL, refunded: true });
    const back = await P.redeem(st.sql, ENV, 'acct-A',
      { store: 'apple', transactionId: 'tx-refunded' }, appleFake);
    is(back.error, 'that purchase was refunded', 'a refunded purchase grants nothing');

    SOLD.set('tx-unknown-sku', { product: 'gg.bluff.stars.mystery' });
    const sku = await P.redeem(st.sql, ENV, 'acct-A',
      { store: 'apple', transactionId: 'tx-unknown-sku' }, appleFake);
    is(sku.error, 'we do not sell that', 'a product we never listed is refused');

    const out = await P.redeem(st.sql, ENV, null,
      { store: 'apple', transactionId: 'tx-1002' }, appleFake);
    is(out.error, 'signed out', 'and nothing at all happens without a session');
  }

  console.log('\n4. google');
  {
    const genv = Object.assign({ PLAY_SA }, ENV);
    SOLD.set('play-token-1', { order: 'GPA.1234-5678' });
    const g = await P.redeem(st.sql, genv, 'acct-C',
      { store: 'google', product: HANDFUL, token: 'play-token-1' }, googleFake);
    is(g.ok, true, 'a play purchase is confirmed against google');
    is(CONSUMED.length, 1, 'and consumed, so the player can buy the same pack again');

    /* the token can be re-presented; the order id is what is unique */
    const twice = await P.redeem(st.sql, genv, 'acct-C',
      { store: 'google', product: HANDFUL, token: 'play-token-1' }, googleFake);
    is(twice.already, true, 're-presenting the same token pays out once');

    SOLD.set('play-pending', { order: 'GPA.9999', pending: true });
    const pend = await P.redeem(st.sql, genv, 'acct-C',
      { store: 'google', product: HANDFUL, token: 'play-pending' }, googleFake);
    is(pend.ok, false, 'a pending purchase is not a purchase yet');
  }

  console.log('\n5. collecting what was bought');
  {
    const first = P.claim(st.sql, 'acct-A');
    is(first.stars, P.CATALOG[HANDFUL].stars * 2, 'everything unclaimed arrives at once');
    const second = P.claim(st.sql, 'acct-A');
    is(second.stars, 0, 'and does not arrive a second time');
    const other = P.claim(st.sql, 'acct-C');
    is(other.stars, P.CATALOG[HANDFUL].stars, "claiming does not touch anybody else's");
    is(P.history(st.sql, 'acct-A').rows.length, 2, 'the receipt history survives the claim');
  }

  console.log('\n6. switched off');
  {
    const s2 = storage(); P.schema(s2.sql);
    const r = await P.redeem(s2.sql, { BUNDLE_ID: 'gg.bluff.app' }, 'acct-A',
      { store: 'apple', transactionId: 'tx-1001' }, appleFake);
    is(r.ok, false, 'with no App Store key it says purchases are not on yet');
    is(s2.sql.exec('SELECT * FROM purchases').toArray().length, 0, 'and grants nothing');
  }

  console.log('\n--- problems ---');
  if (problems.length) { problems.forEach(p => console.log('  ' + p)); process.exit(1); }
  console.log(`  none · ${pass} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
