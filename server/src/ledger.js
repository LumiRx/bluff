/* ══════════ THE STAR LEDGER ══════════

   Every star that ever exists is a row. Nothing is ever edited and nothing is
   ever deleted; a balance is `SELECT SUM(delta)`. That is the whole design, and
   it is the design because the alternative — a `balance` column somebody
   updates — cannot answer the only question that matters after something goes
   wrong, which is *where did this come from*.

   What this can and cannot do, stated plainly, because a security control that
   is oversold is worse than one that is absent:

     · **The daily is verifiable.** Its deals come from a seed everybody shares,
       so the server re-plays the decisions and computes the score itself. A
       forged daily is not detected, it is impossible. That already worked.

     · **A cash match is not verifiable.** It runs on the player's own device
       against bots, from a random seed nobody else holds. There is no way to
       re-derive it, and any claim otherwise would be a lie. What the server can
       do is *bound* it — a hand cannot swing more than the rules allow, a match
       is six hands, a human cannot play forty matches in an hour — and compare
       what the client thinks it has against what the ledger says it should.

   So: prevention where prevention is possible, detection everywhere else, and
   an honest record either way. A flagged account is not banned by this file.
   It is flagged, because deciding what to do about it is a judgement call and
   automatic bans on heuristics punish the wrong people. */

export const HAND_MAX = 700;              // biggest legal swing on one hand
export const HANDS = 6;
export const MATCH_MAX = HAND_MAX * HANDS;
export const MATCH_HOUR = 30;             // a six-hand match is not a ten-second job
export const MATCH_DAY = 200;
export const DRIFT_OK = 250;              // offline play the server has not seen yet

export const KINDS = new Set([
  'purchase',    // money, verified against Apple or Google
  'ad',          // a rewarded video
  'timer',       // the free stake
  'match',       // a cash or speed table settling
  'daily',       // the daily board's prize
  'store',       // spent on a cosmetic
  'chest',       // collected from the chest
  'adjust',      // us, by hand, and it says who
]);

export function schema(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS ledger(
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    account TEXT NOT NULL,
    kind    TEXT NOT NULL,
    delta   INTEGER NOT NULL,
    ref     TEXT,
    at      TEXT NOT NULL,
    day     TEXT NOT NULL
  )`);
  sql.exec(`CREATE INDEX IF NOT EXISTS ledger_acct ON ledger(account, id)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS ledger_day ON ledger(account, day)`);
  /* one row per (account, ref) for anything that must never be counted twice */
  sql.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ledger_once
            ON ledger(account, kind, ref) WHERE ref IS NOT NULL`);
  sql.exec(`CREATE TABLE IF NOT EXISTS flags(
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    account TEXT NOT NULL,
    code    TEXT NOT NULL,
    detail  TEXT,
    at      TEXT NOT NULL,
    seen    INTEGER NOT NULL DEFAULT 0
  )`);
  sql.exec(`CREATE INDEX IF NOT EXISTS flags_acct ON flags(account, id)`);
}

const iso = () => new Date().toISOString();
const dayOf = () => iso().slice(0, 10);

export function balance(sql, account) {
  const r = sql.exec('SELECT COALESCE(SUM(delta),0) b FROM ledger WHERE account = ?',
                     account).toArray()[0];
  return r ? Number(r.b) : 0;
}

export function flag(sql, account, code, detail) {
  sql.exec('INSERT INTO flags(account,code,detail,at) VALUES(?,?,?,?)',
           account, code, detail == null ? null : String(detail).slice(0, 300), iso());
  return { code, detail };
}

export function flagsFor(sql, account, all) {
  return sql.exec(
    `SELECT code, detail, at, seen FROM flags WHERE account = ?
     ${all ? '' : 'AND seen = 0'} ORDER BY id DESC LIMIT 100`, account).toArray();
}

/* Anything with a ref is written once and only once. A retry, a double tap, a
   client that lost the response — all land on the same row. */
export function post(sql, account, kind, delta, ref) {
  if (!account) return { ok: false, error: 'signed out' };
  if (!KINDS.has(kind)) return { ok: false, error: 'unknown kind' };
  const d = Math.round(Number(delta) || 0);
  if (!Number.isFinite(d)) return { ok: false, error: 'not a number' };
  if (ref) {
    const seen = sql.exec(
      'SELECT id, delta FROM ledger WHERE account = ? AND kind = ? AND ref = ?',
      account, kind, String(ref)).toArray()[0];
    if (seen) return { ok: true, already: true, delta: Number(seen.delta),
                       balance: balance(sql, account) };
  }
  sql.exec('INSERT INTO ledger(account,kind,delta,ref,at,day) VALUES(?,?,?,?,?,?)',
           account, kind, d, ref ? String(ref).slice(0, 80) : null, iso(), dayOf());
  return { ok: true, delta: d, balance: balance(sql, account) };
}

/* ── a table settling ─────────────────────────────────────────────────────── */

export function settle(sql, account, e) {
  if (!account) return { ok: false, error: 'signed out' };
  const delta = Math.round(Number(e && e.delta) || 0);
  const ref = String((e && e.match) || '').slice(0, 60);
  if (!ref) return { ok: false, error: 'a match needs an id' };

  const found = [];

  /* 1. is this physically possible under the rules of the game? */
  if (Math.abs(delta) > MATCH_MAX) {
    found.push(flag(sql, account, 'impossible_swing',
      `${delta} on one match, the rules cap it at ${MATCH_MAX}`));
    return { ok: false, error: 'that result is not possible', flags: found,
             balance: balance(sql, account) };
  }

  /* 2. is anybody actually sitting there? six hands take minutes, not seconds */
  const hour = sql.exec(
    `SELECT COUNT(*) n FROM ledger WHERE account = ? AND kind = 'match'
     AND at > ?`, account, new Date(Date.now() - 3600e3).toISOString()).toArray()[0].n;
  if (hour >= MATCH_HOUR) {
    found.push(flag(sql, account, 'match_velocity', `${hour} matches in an hour`));
    return { ok: false, error: 'slow down', flags: found, balance: balance(sql, account) };
  }
  const today = sql.exec(
    `SELECT COUNT(*) n FROM ledger WHERE account = ? AND kind = 'match' AND day = ?`,
    account, dayOf()).toArray()[0].n;
  if (today >= MATCH_DAY)
    found.push(flag(sql, account, 'match_volume', `${today} matches today`));

  /* 3. you cannot lose more than you had */
  const before = balance(sql, account);
  if (delta < 0 && before + delta < -DRIFT_OK)
    found.push(flag(sql, account, 'overdrawn', `${before} then ${delta}`));

  const r = post(sql, account, 'match', delta, ref);
  return { ok: true, already: !!r.already, balance: r.balance,
           flags: found, delta: r.delta };
}

/* ── reconciliation ───────────────────────────────────────────────────────── */

/* Called after every match and after every purchase. The client says what it
   thinks it has; the ledger says what it should have. They will not always
   agree — somebody who played six matches on a plane is legitimately ahead of
   the server — so a gap inside the drift allowance is closed silently and a gap
   outside it is recorded and the ledger wins.

   The ledger winning is the point. A client that has decided it has four
   million stars gets told, politely, that it has what it earned. */
export function reconcile(sql, account, claim, why) {
  if (!account) return { ok: false, error: 'signed out' };
  const truth = balance(sql, account);
  const said = Math.round(Number(claim));
  if (!Number.isFinite(said)) return { ok: true, balance: truth, drift: 0 };
  const drift = said - truth;

  if (Math.abs(drift) > DRIFT_OK) {
    flag(sql, account, drift > 0 ? 'stars_from_nowhere' : 'stars_missing',
         `client said ${said}, ledger says ${truth}${why ? ' after ' + why : ''}`);
    /* the difference is not credited and not deducted — it is simply not real */
    return { ok: true, balance: truth, drift, corrected: true };
  }
  if (drift !== 0) {
    /* inside the allowance: the client played while the server could not hear,
       so the ledger adopts it rather than robbing somebody of an honest run */
    post(sql, account, 'adjust', drift, 'drift:' + Date.now());
    return { ok: true, balance: balance(sql, account), drift, corrected: false };
  }
  return { ok: true, balance: truth, drift: 0, corrected: false };
}

/* What an operator needs to see, on one account, in one call. */
export function audit(sql, account) {
  const rows = sql.exec(
    `SELECT kind, SUM(delta) total, COUNT(*) n FROM ledger WHERE account = ?
     GROUP BY kind ORDER BY kind`, account).toArray();
  return {
    ok: true, account, balance: balance(sql, account),
    byKind: rows.map(r => ({ kind: r.kind, total: Number(r.total), n: Number(r.n) })),
    flags: flagsFor(sql, account, true),
    recent: sql.exec(
      `SELECT kind, delta, ref, at FROM ledger WHERE account = ? ORDER BY id DESC LIMIT 40`,
      account).toArray(),
  };
}

/* The sweep: every account whose books do not add up, or that tripped
   something, since a given point. Meant for a cron, not a request. */
export function anomalies(sql, since) {
  const cut = since || new Date(Date.now() - 86400e3).toISOString();
  const flagged = sql.exec(
    `SELECT account, code, COUNT(*) n, MAX(at) last FROM flags WHERE at > ?
     GROUP BY account, code ORDER BY n DESC LIMIT 200`, cut).toArray();
  /* an account that has spent far more than it ever took in is either a bug in
     our arithmetic or somebody minting stars, and both want looking at */
  const negative = sql.exec(
    `SELECT account, SUM(delta) b FROM ledger GROUP BY account
     HAVING b < -${DRIFT_OK} ORDER BY b ASC LIMIT 100`).toArray();
  return { ok: true, since: cut, flagged, negative };
}
