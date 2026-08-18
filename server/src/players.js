/* ══════════ WHO SOMEBODY IS ══════════

   The daily board never needed to know who anybody was. It takes a device
   token, re-scores a transcript, and sorts. Two players called VIV are just
   two rows.

   Friends need more than that. "Add VIV" has to mean one particular person, or
   the feature is a lie — and inviting VIV to a table has to reach that person
   rather than derive a code and hope. So handles become claimed: first device
   to take one owns it.

   What this deliberately is not: an account. There is no email, no password,
   nothing to verify and nothing to recover. A device makes up a random token,
   claims a name with it, and that is the whole of identity. The cost is honest
   and worth stating — lose the device and you lose the handle, because there is
   nothing else that could prove it was yours.

   One object for the whole game rather than one per day. Handles have to be
   unique across all time, which is exactly the kind of thing a single object is
   for, and the write rate is one row per player ever. */

import * as accounts from './accounts.js';
import * as pay from './purchases.js';
import * as ledger from './ledger.js';

export class Players {
  constructor(state, env) {
    this.sql = state.storage.sql;
    this.env = env || {};
    this.sql.exec(`CREATE TABLE IF NOT EXISTS players(
      device  TEXT PRIMARY KEY,
      handle  TEXT NOT NULL,
      push    TEXT,
      platform TEXT,
      made    TEXT NOT NULL,
      seen    TEXT NOT NULL
    )`);
    /* the uniqueness is the whole point, so the database enforces it rather
       than the code remembering to check */
    this.sql.exec(`CREATE UNIQUE INDEX IF NOT EXISTS one_handle ON players(handle)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS invites(
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      fromh   TEXT NOT NULL,
      toh     TEXT NOT NULL,
      day     TEXT NOT NULL,
      code    TEXT NOT NULL,
      at      TEXT NOT NULL,
      seen    INTEGER NOT NULL DEFAULT 0
    )`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS invites_to ON invites(toh, day)`);
    this.sql.exec(`CREATE UNIQUE INDEX IF NOT EXISTS one_invite
                   ON invites(fromh, toh, day)`);
    accounts.schema(this.sql);
    pay.schema(this.sql);
    ledger.schema(this.sql);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const body = request.method === 'POST' ? await request.json() : {};
    const q = url.searchParams;
    /* the session lives in a header so it never lands in a log line or a
       referrer the way a query parameter does */
    const tok = (request.headers.get('authorization') || '').replace(/^Bearer /i, '') || null;
    const ip = request.headers.get('cf-connecting-ip') || q.get('ip') || '';
    switch (url.pathname) {
      case '/auth/start':  return json(await accounts.start(this.sql, this.env, body, ip));
      case '/auth/verify': return json(await accounts.verify(this.sql, this.env, body));
      case '/account':     return json(await accounts.load(this.sql, this.env, tok));
      case '/account/save':   return json(await accounts.save(this.sql, this.env, tok, body));
      case '/account/delete': return json(await accounts.erase(this.sql, this.env, tok));
      case '/purchase/verify': {
        const who = await accounts.whoIs(this.sql, this.env, tok);
        return json(await pay.redeem(this.sql, this.env, who && who.account, body));
      }
      case '/purchase/claim': {
        const who = await accounts.whoIs(this.sql, this.env, tok);
        const r = pay.claim(this.sql, who && who.account);
        /* the ledger is where a star comes into existence; the purchase table
           is the receipt that justifies it */
        if (r.ok && r.stars > 0)
          for (const it of r.items)
            ledger.post(this.sql, who.account, 'purchase', pay.CATALOG[it].stars,
                        'claim:' + it + ':' + Date.now());
        return json(Object.assign(r, { balance: ledger.balance(this.sql, who.account) }));
      }
      case '/stars/settle': {
        const who = await accounts.whoIs(this.sql, this.env, tok);
        if (!who) return json({ ok: false, error: 'signed out' });
        const r = ledger.settle(this.sql, who.account, body);
        /* reconcile in the same breath: the moment after a match is the moment
           a divergence is cheapest to notice */
        if (r.ok && body && body.claim != null)
          Object.assign(r, ledger.reconcile(this.sql, who.account, body.claim, 'a match'));
        return json(r);
      }
      case '/stars/sync': {
        const who = await accounts.whoIs(this.sql, this.env, tok);
        if (!who) return json({ ok: false, error: 'signed out' });
        return json(ledger.reconcile(this.sql, who.account, body && body.claim, 'a sync'));
      }
      case '/stars/audit': {
        const who = await accounts.whoIs(this.sql, this.env, tok);
        if (!who) return json({ ok: false, error: 'signed out' });
        return json(ledger.audit(this.sql, who.account));
      }
      case '/claim':   return json(await this.claim(body, tok));
      case '/push':    return json(this.push(body));
      case '/lookup':  return json(this.lookup((q.get('handles') || '').split(',')));
      case '/invite':  return json(this.invite(body));
      case '/invites': return json(this.pending(q.get('device'), q.get('day')));
      case '/seen':    return json(this.markSeen(body));
      case '/tokens':  return json(this.tokens((q.get('handles') || '').split(',')));
      default:         return json({ error: 'not found' }, 404);
    }
  }

  now() { return new Date().toISOString(); }

  row(device) {
    const r = this.sql.exec('SELECT * FROM players WHERE device = ?', device).toArray();
    return r.length ? r[0] : null;
  }

  /* ── claiming a name ──
     Idempotent on purpose: a device re-claiming the handle it already owns is
     the normal case on every launch, not an error. */
  async claim(e, tok) {
    const device = String(e.device || '');
    const handle = String(e.handle || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9);
    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(device)) return { ok: false, error: 'bad device token' };
    if (handle.length < 2) return { ok: false, error: 'handle too short' };

    const mine = this.row(device);
    if (mine && mine.handle === handle) {
      this.sql.exec('UPDATE players SET seen = ? WHERE device = ?', this.now(), device);
      return { ok: true, handle, yours: true };
    }

    const held = this.sql.exec('SELECT device FROM players WHERE handle = ?', handle).toArray();
    if (held.length && held[0].device !== device)
      return { ok: false, taken: true, handle, suggest: this.suggest(handle) };

    /* a signed-in player's name belongs to the account, so it survives the
       phone; a signed-out one still belongs to the device, exactly as before */
    const who = tok ? await accounts.whoIs(this.sql, this.env, tok) : null;
    const acct = who ? who.account : null;
    if (mine) this.sql.exec('UPDATE players SET handle = ?, seen = ?, account = ? WHERE device = ?',
                            handle, this.now(), acct || mine.account || null, device);
    else this.sql.exec('INSERT INTO players(device,handle,made,seen,account) VALUES(?,?,?,?,?)',
                       device, handle, this.now(), this.now(), acct);
    return { ok: true, handle, yours: true, account: acct };
  }

  /* Somebody who cannot have the name they wanted should be offered names they
     can have, not sent away to guess again. */
  suggest(handle) {
    const base = handle.slice(0, 8).replace(/[0-9]+$/, '') || handle.slice(0, 8);
    const out = [];
    for (const suffix of ['1', '2', '7', '9', 'X', 'Z', '99', '77']) {
      const c = (base + suffix).slice(0, 9);
      if (c === handle) continue;
      const taken = this.sql.exec('SELECT 1 FROM players WHERE handle = ?', c).toArray();
      if (!taken.length) out.push(c);
      if (out.length === 3) break;
    }
    return out;
  }

  push(e) {
    const device = String(e.device || '');
    if (!this.row(device)) return { ok: false, error: 'claim a handle first' };
    this.sql.exec('UPDATE players SET push = ?, platform = ?, seen = ? WHERE device = ?',
                  e.token ? String(e.token).slice(0, 200) : null,
                  e.platform ? String(e.platform).slice(0, 12) : null,
                  this.now(), device);
    return { ok: true };
  }

  /* Which of these handles are real people? Used before adding a friend, so
     nobody ends up with a list of names that never existed. */
  lookup(handles) {
    const want = handles.map(h => String(h).toUpperCase().replace(/[^A-Z0-9]/g, ''))
      .filter(h => h.length >= 2).slice(0, 50);
    if (!want.length) return { found: [] };
    const marks = want.map(() => '?').join(',');
    const rows = this.sql.exec(
      `SELECT handle FROM players WHERE handle IN (${marks})`, ...want).toArray();
    return { found: rows.map(r => r.handle) };
  }

  /* push tokens for a set of handles — never leaves the Worker */
  tokens(handles) {
    const want = handles.map(h => String(h).toUpperCase()).filter(Boolean).slice(0, 20);
    if (!want.length) return { rows: [] };
    const marks = want.map(() => '?').join(',');
    return { rows: this.sql.exec(
      `SELECT handle, push, platform FROM players WHERE handle IN (${marks}) AND push IS NOT NULL`,
      ...want).toArray() };
  }

  invite(e) {
    const me = this.row(String(e.device || ''));
    if (!me) return { ok: false, error: 'claim a handle first' };
    const to = String(e.to || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!to || to === me.handle) return { ok: false, error: 'that is you' };
    const they = this.sql.exec('SELECT handle FROM players WHERE handle = ?', to).toArray();
    if (!they.length) return { ok: false, error: 'nobody plays under that name' };
    const day = String(e.day || '').slice(0, 10);
    const code = String(e.code || '').toUpperCase().slice(0, 8);
    /* one invite per pair per day: a challenge resolves to the same table all
       day, so sending it twice is the same invitation, not a second one */
    this.sql.exec(
      `INSERT INTO invites(fromh,toh,day,code,at) VALUES(?,?,?,?,?)
       ON CONFLICT(fromh,toh,day) DO UPDATE SET at = excluded.at`,
      me.handle, to, day, code, this.now());
    return { ok: true, from: me.handle, to, code, day };
  }

  pending(device, day) {
    const me = this.row(String(device || ''));
    if (!me) return { invites: [] };
    const rows = this.sql.exec(
      `SELECT fromh, code, day, seen FROM invites
       WHERE toh = ? AND day = ? ORDER BY at DESC LIMIT 20`,
      me.handle, String(day || '').slice(0, 10)).toArray();
    return { handle: me.handle, invites: rows };
  }

  markSeen(e) {
    const me = this.row(String(e.device || ''));
    if (!me) return { ok: false };
    this.sql.exec('UPDATE invites SET seen = 1 WHERE toh = ? AND day = ?',
                  me.handle, String(e.day || '').slice(0, 10));
    return { ok: true };
  }
}

const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'Content-Type': 'application/json' }
});
