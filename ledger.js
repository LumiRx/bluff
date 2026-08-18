/* The star ledger, and the ways somebody would try to mint stars.

   The honest framing this suite is written against: a cash match runs on the
   player's own device from a seed nobody else holds, so it cannot be re-derived
   and therefore cannot be *verified*. What can be done is bound it, rate-limit
   it, and reconcile it — and then be able to prove, afterwards, exactly where
   every star came from. These tests are about that boundary: what the server
   catches, and what it honestly only records.

   node ledger.js
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

(async () => {
  const L = await import('./server/src/ledger.js');
  const A = 'acct-A', B = 'acct-B';

  console.log('\n1. every star is a row');
  const { sql } = storage(); L.schema(sql);
  {
    L.post(sql, A, 'purchase', 5000, 'tx-1');
    L.post(sql, A, 'timer', 1000, 'timer-1');
    L.post(sql, A, 'store', -2500, 'felt-emerald');
    is(L.balance(sql, A), 3500, 'the balance is the sum and nothing else');
    const twice = L.post(sql, A, 'purchase', 5000, 'tx-1');
    is(twice.already, true, 'the same reference is never counted twice');
    is(L.balance(sql, A), 3500, 'so a retried purchase does not double the stars');
    is(L.post(sql, A, 'wishful', 999).ok, false, 'a kind we do not recognise is refused');
  }

  console.log('\n2. results the rules do not allow');
  {
    const huge = L.settle(sql, A, { match: 'm-big', delta: 999999 });
    is(huge.ok, false, 'a match claiming a million stars is refused outright');
    is(huge.flags[0].code, 'impossible_swing', 'and flagged by name');
    is(L.balance(sql, A), 3500, 'nothing was credited');

    const edge = L.settle(sql, A, { match: 'm-edge', delta: L.MATCH_MAX });
    is(edge.ok, true, 'the biggest legal result is still allowed through');
    is(L.balance(sql, A), 3500 + L.MATCH_MAX, 'and credited');

    const noid = L.settle(sql, A, { delta: 50 });
    is(noid.ok, false, 'a settle with no match id is refused — nothing to reconcile against');
  }

  console.log('\n3. nobody plays that fast');
  {
    const s = storage(); L.schema(s.sql);
    let refused = 0, taken = 0;
    for (let i = 0; i < L.MATCH_HOUR + 8; i++) {
      const r = L.settle(s.sql, A, { match: 'burst-' + i, delta: 40 });
      r.ok ? taken++ : refused++;
    }
    is(taken, L.MATCH_HOUR, `${L.MATCH_HOUR} matches an hour go through`);
    is(refused > 0, true, 'and the rest are refused rather than quietly counted');
    const f = L.flagsFor(s.sql, A).map(x => x.code);
    is(f.includes('match_velocity'), true, 'with a velocity flag on the account');
  }

  console.log('\n4. a client that invented stars');
  {
    const s = storage(); L.schema(s.sql);
    L.post(s.sql, B, 'purchase', 5000, 'tx-9');

    const honest = L.reconcile(s.sql, B, 5000, 'a match');
    is(honest.drift, 0, 'a client that agrees with the ledger causes nothing to happen');

    const offline = L.reconcile(s.sql, B, 5000 + 180, 'two offline matches');
    is(offline.corrected, false, 'a small gap is treated as honest offline play');
    is(offline.balance, 5180, 'and adopted, because a plane is not an attack');

    const liar = L.reconcile(s.sql, B, 4000000, 'a match');
    is(liar.corrected, true, 'four million stars is not adopted');
    is(liar.balance, 5180, 'the ledger balance is what the account actually has');
    const f = L.flagsFor(s.sql, B).map(x => x.code);
    is(f.includes('stars_from_nowhere'), true, 'and the attempt is on the record');
    is(L.balance(s.sql, B), 5180, 'nothing was minted');
  }

  console.log('\n5. spending what you never had');
  {
    const s = storage(); L.schema(s.sql);
    L.post(s.sql, A, 'timer', 1000, 't1');
    const r = L.settle(s.sql, A, { match: 'm-1', delta: -3000 });
    is(r.ok, true, 'the result is still recorded — refusing it would lose the evidence');
    is(r.flags.some(f => f.code === 'overdrawn'), true, 'but the account is flagged overdrawn');
    is(L.balance(s.sql, A), -2000, 'and the books show the hole rather than hiding it');
    is(L.anomalies(s.sql).negative.length, 1, 'so the sweep finds it');
  }

  console.log('\n6. what an operator sees');
  {
    const a = L.audit(sql, A);
    is(a.balance, L.balance(sql, A), 'the audit agrees with the balance');
    const kinds = a.byKind.map(k => k.kind).sort().join(',');
    is(kinds, 'match,purchase,store,timer', 'broken down by where it came from');
    is(a.flags.length > 0, true, 'with every flag ever raised, not just the new ones');
    is(a.recent.length > 0, true, 'and the recent rows to read');
    const sweep = L.anomalies(sql);
    is(sweep.flagged.length > 0, true, 'the daily sweep groups flags by account and code');
  }

  console.log('\n7. signed out');
  {
    is(L.post(sql, null, 'purchase', 5000).ok, false, 'nothing posts without an account');
    is(L.settle(sql, null, { match: 'x', delta: 1 }).ok, false, 'nothing settles either');
    is(L.reconcile(sql, null, 100).ok, false, 'and nothing reconciles');
  }

  console.log('\n--- problems ---');
  if (problems.length) { problems.forEach(p => console.log('  ' + p)); process.exit(1); }
  console.log(`  none · ${pass} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
