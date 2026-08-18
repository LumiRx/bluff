/* Signing in with a phone number, against the real code and a real database.

   The Durable Object's storage is SQLite, so this runs the actual statements in
   accounts.js against node:sqlite rather than a shim that agrees with whatever
   the code happens to do. Two things are worth proving beyond "the happy path
   works", and they are the two that would matter if this ever went wrong:

     · the number the player typed is nowhere in the database afterwards
     · a copy of the database does not let you sign in as anybody

   Everything else here is the boring half: limits that hold, codes that expire,
   a record that follows a person to a second phone, and a delete that deletes.

   node auth.js
*/
const { DatabaseSync } = require('node:sqlite');

let pass = 0; const problems = [];
const ok = m => { pass++; console.log('   · ' + m); };
const bad = m => { problems.push(m); console.log('   ✗ ' + m); };
const is = (a, b, m) => (a === b ? ok(m) : bad(`${m} — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`));

/* the storage interface a Durable Object hands you: exec(sql, ...args) with
   .toArray() on the result. node:sqlite underneath, so the SQL is really run. */
function storage() {
  const db = new DatabaseSync(':memory:');
  return {
    db,
    sql: {
      exec(q, ...p) {
        const st = db.prepare(q);
        const reads = /^\s*(SELECT|PRAGMA|WITH)/i.test(q);
        if (reads) { const rows = st.all(...p); return { toArray: () => rows }; }
        st.run(...p);
        return { toArray: () => [] };
      },
    },
    dump() {
      const names = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
      let all = '';
      for (const n of names) all += JSON.stringify(db.prepare(`SELECT * FROM ${n}`).all());
      return all;
    },
  };
}

const ENV = { SMS_PROVIDER: 'log', PHONE_PEPPER: 'test-pepper-not-the-real-one',
              SMS_COUNTRIES: '+1,+44' };

(async () => {
  const A = await import('./server/src/accounts.js');
  const { Players } = await import('./server/src/players.js');

  /* a Players object over our storage, exactly as the runtime builds one */
  const make = () => {
    const st = storage();
    const p = new Players({ storage: { sql: st.sql } }, ENV);
    return { p, st, sql: st.sql };
  };
  const call = (p, path, body, headers) => p.fetch(new Request('https://players' + path, {
    method: 'POST', body: JSON.stringify(body || {}),
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
  })).then(r => r.json());

  const PHONE = '+14155550142';
  const OTHER = '+14155550188';

  console.log('\n1. asking for a code');
  {
    const { sql } = make();
    const r = await A.start(sql, ENV, { phone: PHONE }, '1.2.3.4');
    is(r.ok, true, 'a served number gets a code');
    is(r.last4, '0142', 'the screen is told the last four digits and nothing more');
    is(/^\d{6}$/.test(r.dev || ''), true, 'six digits');
    is(r.sent, false, 'log mode says plainly that nothing was delivered');

    const bad1 = await A.start(sql, ENV, { phone: '415 555 0142' }, '1.2.3.4');
    is(bad1.ok, false, 'a number without a country code is refused rather than guessed');
    const bad2 = await A.start(sql, ENV, { phone: '+919876543210' }, '1.2.3.4');
    is(bad2.error, 'we cannot send a code to that country yet',
       'an unserved country is refused before anything costs money');
  }

  console.log('\n2. what the database knows');
  {
    const { sql, st } = make();
    const r = await A.start(sql, ENV, { phone: PHONE }, '1.2.3.4');
    await A.verify(sql, ENV, { phone: PHONE, code: r.dev, device: 'dev-' + 'x'.repeat(16) });
    const dump = st.dump();
    is(dump.includes(PHONE), false, 'the number is not in the database');
    is(dump.includes('4155550142'), false, 'nor is it in there without the plus');
    is(dump.includes('0142'), true, 'the last four are, deliberately, so a screen can show them');
    is(dump.includes(r.dev), false, 'the code is not in the database either');

    /* the session the player holds is not the row the database holds */
    const s = await A.verify(sql, ENV, { phone: PHONE, code: '000000' });
    is(s.ok, false, 'a used code cannot be used twice');
  }

  console.log('\n3. getting the code wrong');
  {
    const { sql } = make();
    const r = await A.start(sql, ENV, { phone: PHONE }, '1.2.3.4');
    const wrong = r.dev === '111111' ? '222222' : '111111';
    let last;
    for (let i = 0; i < A.CODE_TRIES; i++) last = await A.verify(sql, ENV, { phone: PHONE, code: wrong });
    is(last.ok, false, `${A.CODE_TRIES} wrong guesses are refused`);
    const after = await A.verify(sql, ENV, { phone: PHONE, code: r.dev });
    is(after.ok, false, 'and the right code no longer works — the code is burned, not slowed');

    const st2 = make();
    const r2 = await A.start(st2.sql, ENV, { phone: PHONE }, '1.2.3.4');
    const late = await A.verify(st2.sql, ENV, { phone: PHONE, code: r2.dev },
                                Date.now() + A.CODE_TTL + 1000);
    is(late.error, 'that code has expired', 'a code older than ten minutes is refused');
  }

  console.log('\n4. limits that cost money');
  {
    const { sql } = make();
    const t0 = Date.now();
    const first = await A.start(sql, ENV, { phone: PHONE }, '9.9.9.9', t0);
    is(first.ok, true, 'first message goes');
    const soon = await A.start(sql, ENV, { phone: PHONE }, '9.9.9.9', t0 + 5000);
    is(soon.ok, false, 'a second message inside thirty seconds does not');
    let n = 1, t = t0;
    for (let i = 0; i < 8; i++) {
      t += A.SEND_GAP + 1000;
      if ((await A.start(sql, ENV, { phone: PHONE }, '9.9.9.9', t)).ok) n++;
    }
    is(n, A.SEND_HOUR, `a number gets ${A.SEND_HOUR} codes an hour and no more`);

    /* and a bot walking through numbers is stopped by the address, not the number */
    const st2 = make();
    let sent = 0, tt = t0;
    for (let i = 0; i < A.IP_HOUR + 6; i++) {
      tt += A.SEND_GAP + 1000;
      const p = '+1415555' + String(1000 + i);
      if ((await A.start(st2.sql, ENV, { phone: p }, '5.5.5.5', tt)).ok) sent++;
    }
    is(sent, A.IP_HOUR, `one address gets ${A.IP_HOUR} codes an hour across all numbers`);

    /* the seam that used to be here: an hourly bucket resets on the hour, so a
       bot that waits for :59 gets two hours of messages in two minutes */
    const st3 = make();
    const onTheHour = Math.floor(t0 / 3600000) * 3600000;
    let across = 0, u = onTheHour - 5 * 60000;          // five minutes before it
    for (let i = 0; i < A.IP_HOUR + 8; i++) {
      u += A.SEND_GAP + 1000;
      const ph = '+1415556' + String(1000 + i);
      if ((await A.start(st3.sql, ENV, { phone: ph }, '6.6.6.6', u)).ok) across++;
    }
    is(across, A.IP_HOUR, 'and the limit does not reset just because the clock struck the hour');
  }

  console.log('\n5. the record follows the person');
  {
    const { p, sql } = make();
    const devA = 'phoneA' + 'a'.repeat(16), devB = 'phoneB' + 'b'.repeat(16);

    /* somebody who has been playing already, signed out, with a name */
    const claimed = await call(p, '/claim', { device: devA, handle: 'VIV' });
    is(claimed.ok, true, 'a signed-out device can still claim a handle, as before');

    const c1 = await A.start(sql, ENV, { phone: PHONE }, '1.1.1.1');
    const v1 = await A.verify(sql, ENV, { phone: PHONE, code: c1.dev, device: devA });
    is(v1.ok, true, 'signing in works');
    is(v1.fresh, true, 'and knows this is a new account');
    is(v1.handle, 'VIV', 'signing in adopts the handle the device already owned');

    await A.save(sql, ENV, v1.session, { profile: { rating: 1612, bankroll: 8450, w: 14, l: 7 } });
    const again = await A.save(sql, ENV, v1.session, { profile: { rating: 1620, bankroll: 8600 } });
    is(again.rev, 2, 'every save moves the revision on, so a second device can tell it is behind');

    /* the same person, a new phone, nothing but the number */
    const c2 = await A.start(sql, ENV, { phone: PHONE }, '1.1.1.1', Date.now() + 60000);
    const v2 = await A.verify(sql, ENV, { phone: PHONE, code: c2.dev, device: devB });
    is(v2.account, v1.account, 'the same number is the same account, not a second one');
    is(v2.fresh, false, 'and it knows the account is not new');
    is(v2.handle, 'VIV', 'the handle came with them');
    is(v2.profile && v2.profile.rating, 1620, 'so did the rating');
    is(v2.session === v1.session, false, 'a new sign-in is a new session, not the old one reissued');

    const mine = await A.load(sql, ENV, v2.session);
    is(mine.last4, '0142', 'the account screen can show the last four');

    const nobody = await A.load(sql, ENV, 'not-a-real-session');
    is(nobody.ok, false, 'a made-up session is nobody');

    /* the row in the table is a hash of the token; holding the row is not
       holding the token */
    const rows = sql.exec('SELECT thash FROM sessions').toArray();
    const stolen = await A.load(sql, ENV, rows[0].thash);
    is(stolen.ok, false, 'a session row copied out of the database does not sign you in');
  }

  console.log('\n6. deleting it means deleting it');
  {
    const { p, sql, st } = make();
    const dev = 'gone' + 'g'.repeat(18);
    await call(p, '/claim', { device: dev, handle: 'ODDS' });
    const c = await A.start(sql, ENV, { phone: OTHER }, '2.2.2.2');
    const v = await A.verify(sql, ENV, { phone: OTHER, code: c.dev, device: dev });
    await A.save(sql, ENV, v.session, { profile: { rating: 1500 } });

    const del = await A.erase(sql, ENV, v.session);
    is(del.ok, true, 'the account deletes');
    is(del.erased.includes('ODDS'), true, 'and says which handles it released');
    is(sql.exec('SELECT * FROM accounts').toArray().length, 0, 'no account row left');
    is(sql.exec('SELECT * FROM profiles').toArray().length, 0, 'no profile left');
    is(sql.exec('SELECT * FROM sessions').toArray().length, 0, 'no session left');
    is(st.dump().includes('0142'), false, 'nothing of the number survives');
    const after = await A.load(sql, ENV, v.session);
    is(after.ok, false, 'the session it was using is dead');

    const someoneElse = await call(p, '/claim', { device: 'new' + 'n'.repeat(18), handle: 'ODDS' });
    is(someoneElse.ok, true, 'and the handle really is back on the shelf');
  }

  console.log('\n7. sign-in switched off');
  {
    const { sql } = make();
    const r = await A.start(sql, { PHONE_PEPPER: 'x' }, { phone: PHONE }, '1.1.1.1');
    is(r.ok, false, 'with no provider configured it says so rather than pretending');
  }

  console.log('\n--- problems ---');
  if (problems.length) { problems.forEach(p => console.log('  ' + p)); process.exit(1); }
  console.log(`  none · ${pass} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
