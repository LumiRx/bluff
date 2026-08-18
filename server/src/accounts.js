/* ══════════ ACCOUNTS ══════════

   Until now identity was a random token a device made up. That was honest and
   it cost nothing, and it had exactly one failure: lose the phone and you lose
   the name, the rating and the record, with nothing that could prove any of it
   was yours. Phone numbers fix that, and they buy the thing a device token can
   never buy — two people who know each other's number can find each other.

   The number is the most linkable thing most people own, so:

   **We never store it.** Not encrypted, not "hashed for safety" with a fixed
   algorithm anyone can rainbow-table — a 10-digit number space is small enough
   to brute force in minutes. What is stored is HMAC-SHA256(E.164, PHONE_PEPPER)
   where the pepper is a Worker secret that never enters the database. A dump of
   the storage is a column of numbers nobody can reverse without also stealing a
   secret that lives somewhere else. Sending a message needs the plaintext, and
   we have it at that moment because the player just typed it. We do not need it
   afterwards, so we do not keep it. The last four digits are kept, on their
   own, so the screen can say "code sent to ••••4471".

   **The code is stored the same way.** A stored plaintext OTP is a login
   credential sitting in a table.

   **Nothing here is reachable without a country you chose to serve.** SMS
   pumping is not a hypothetical: bots request codes to premium ranges and
   somebody collects the carrier revenue. An allowlist is the only defence that
   works before the message costs money.

   Deleting an account really deletes it, because Apple requires that of any app
   that lets you make one, and because a promise about a phone number that
   cannot be withdrawn is not a promise worth making. */

import * as sms from './sms.js';

export const CODE_TTL = 10 * 60 * 1000;   // ten minutes to type six digits
export const CODE_TRIES = 5;              // then the code is burned, not slowed
export const SEND_GAP = 30 * 1000;        // no second message inside thirty seconds
export const SEND_HOUR = 4;               // per number, per hour
export const IP_HOUR = 12;                // per address, per hour

export function schema(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS accounts(
    id      TEXT PRIMARY KEY,
    phash   TEXT NOT NULL,
    last4   TEXT NOT NULL,
    cc      TEXT,
    made    TEXT NOT NULL,
    seen    TEXT NOT NULL
  )`);
  sql.exec(`CREATE UNIQUE INDEX IF NOT EXISTS one_phone ON accounts(phash)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS otp(
    phash   TEXT PRIMARY KEY,
    chash   TEXT NOT NULL,
    made    INTEGER NOT NULL,
    tries   INTEGER NOT NULL DEFAULT 0,
    last    INTEGER NOT NULL
  )`);
  /* A counter bucketed by the clock hour resets at the hour, so somebody who
     waits until :59 gets two hours' worth of messages in two minutes. Rows
     with timestamps and a sliding window do not have that seam. */
  sql.exec(`CREATE TABLE IF NOT EXISTS sendlog(
    who     TEXT NOT NULL,
    at      INTEGER NOT NULL
  )`);
  sql.exec(`CREATE INDEX IF NOT EXISTS sendlog_who ON sendlog(who, at)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS sessions(
    thash   TEXT PRIMARY KEY,
    account TEXT NOT NULL,
    device  TEXT,
    made    TEXT NOT NULL,
    seen    TEXT NOT NULL
  )`);
  sql.exec(`CREATE INDEX IF NOT EXISTS sessions_acct ON sessions(account)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS profiles(
    account TEXT PRIMARY KEY,
    body    TEXT NOT NULL,
    rev     INTEGER NOT NULL,
    at      TEXT NOT NULL
  )`);
  /* a handle used to belong to a device; now it can belong to an account, and
     the old rows keep working with account NULL until their owner signs in */
  const cols = sql.exec(`PRAGMA table_info(players)`).toArray().map(c => c.name);
  if (cols.length && !cols.includes('account'))
    sql.exec(`ALTER TABLE players ADD COLUMN account TEXT`);
}

/* ── the number ──────────────────────────────────────────────────────────── */

/* Deliberately not a phone-number library. We accept E.164 and nothing else:
   a leading +, a country code we serve, and 6 to 14 digits after it. Anything
   cleverer guesses, and a guess here sends a message to a stranger. */
export function normalize(raw) {
  const s = String(raw || '').replace(/[\s()\-.]/g, '');
  if (!/^\+[1-9][0-9]{7,14}$/.test(s)) return null;
  return s;
}

export function countryOf(e164) {
  /* enough of the ITU list to gate on; anything unlisted is refused rather than
     guessed, which is the safe direction for a thing that costs money */
  const three = ['+1242', '+1246', '+1264', '+1268', '+1284', '+1340', '+1345',
                 '+1441', '+1473', '+1649', '+1664', '+1670', '+1671', '+1684',
                 '+1721', '+1758', '+1767', '+1784', '+1809', '+1829', '+1849',
                 '+1868', '+1869', '+1876', '+1939'];
  for (const p of three) if (e164.startsWith(p)) return p;
  for (const p of ['+20', '+27', '+30', '+31', '+32', '+33', '+34', '+36', '+39',
                   '+40', '+41', '+43', '+44', '+45', '+46', '+47', '+48', '+49',
                   '+51', '+52', '+53', '+54', '+55', '+56', '+57', '+58',
                   '+60', '+61', '+62', '+63', '+64', '+65', '+66',
                   '+81', '+82', '+84', '+86', '+90', '+91', '+92', '+93', '+94',
                   '+95', '+98', '+212', '+213', '+216', '+218', '+220', '+233',
                   '+234', '+254', '+255', '+256', '+27', '+351', '+352', '+353',
                   '+354', '+355', '+356', '+357', '+358', '+359', '+370', '+371',
                   '+372', '+373', '+374', '+375', '+376', '+377', '+378', '+380',
                   '+381', '+385', '+386', '+387', '+389', '+420', '+421', '+423',
                   '+852', '+853', '+855', '+856', '+880', '+886', '+960', '+961',
                   '+962', '+963', '+964', '+965', '+966', '+967', '+968', '+970',
                   '+971', '+972', '+973', '+974', '+975', '+976', '+977', '+992',
                   '+993', '+994', '+995', '+996', '+998'])
    if (e164.startsWith(p)) return p;
  if (e164.startsWith('+7')) return '+7';
  if (e164.startsWith('+1')) return '+1';
  return null;
}

export function served(env, cc) {
  const list = String(env.SMS_COUNTRIES || '+1').split(',').map(s => s.trim()).filter(Boolean);
  return !!cc && list.includes(cc);
}

/* ── hashing ─────────────────────────────────────────────────────────────── */

async function mac(env, s) {
  const pepper = env.PHONE_PEPPER;
  if (!pepper) throw new Error('PHONE_PEPPER is not set');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(s));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* both strings are our own hex of the same length, so this is a real
   constant-time compare rather than a decorative one */
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function token(bytes = 32) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function digits(n) {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return String(b[0] % 10 ** n).padStart(n, '0');
}

const iso = () => new Date().toISOString();
const HOUR = 3600000;
/* how many messages this key has had in the last hour, whenever "now" is */
function recent(sql, who, now) {
  sql.exec('DELETE FROM sendlog WHERE at < ?', now - HOUR);
  return Number(sql.exec('SELECT COUNT(*) n FROM sendlog WHERE who = ? AND at > ?',
                         who, now - HOUR).toArray()[0].n);
}

/* ── asking for a code ───────────────────────────────────────────────────── */

export async function start(sql, env, body, ip, now = Date.now()) {
  if (!sms.configured(env)) return { ok: false, error: 'sign-in is not switched on yet' };
  const e164 = normalize(body && body.phone);
  if (!e164) return { ok: false, error: 'that does not look like a phone number' };
  const cc = countryOf(e164);
  if (!served(env, cc))
    return { ok: false, error: 'we cannot send a code to that country yet' };

  const key = 'ip:' + String(ip || 'unknown').slice(0, 64);
  const phash = await mac(env, e164);
  if (recent(sql, key, now) >= IP_HOUR)
    return { ok: false, error: 'too many codes from this connection, try later' };
  if (recent(sql, 'ph:' + phash, now) >= SEND_HOUR)
    return { ok: false, error: 'too many codes for that number this hour' };

  const prev = sql.exec('SELECT * FROM otp WHERE phash = ?', phash).toArray()[0];
  if (prev && now - prev.last < SEND_GAP)
    return { ok: false, error: 'hold on a moment', retryIn: Math.ceil((SEND_GAP - (now - prev.last)) / 1000) };

  const code = digits(6);
  const chash = await mac(env, e164 + ':' + code);
  if (prev) sql.exec('UPDATE otp SET chash = ?, made = ?, tries = 0, last = ? WHERE phash = ?',
                     chash, now, now, phash);
  else sql.exec('INSERT INTO otp(phash,chash,made,tries,last) VALUES(?,?,?,0,?)',
                phash, chash, now, now);
  sql.exec('INSERT INTO sendlog(who,at) VALUES(?,?)', key, now);
  sql.exec('INSERT INTO sendlog(who,at) VALUES(?,?)', 'ph:' + phash, now);

  const out = await sms.send(env, e164,
    `${code} is your BLUFF code. It works for ten minutes. We will never ask you for it.`);
  return {
    ok: true, last4: e164.slice(-4), sent: !!out.delivered,
    /* in log mode the client is told plainly that nothing left the building,
       rather than being left to wait for a message that is not coming */
    dev: sms.provider(env) === 'log' ? code : undefined,
    retryIn: Math.ceil(SEND_GAP / 1000),
  };
}

/* ── typing it in ────────────────────────────────────────────────────────── */

export async function verify(sql, env, body, now = Date.now()) {
  const e164 = normalize(body && body.phone);
  const code = String((body && body.code) || '').replace(/\D/g, '');
  if (!e164 || code.length !== 6) return { ok: false, error: 'check the number and the code' };

  const phash = await mac(env, e164);
  const row = sql.exec('SELECT * FROM otp WHERE phash = ?', phash).toArray()[0];
  if (!row) return { ok: false, error: 'ask for a code first' };
  if (now - row.made > CODE_TTL) {
    sql.exec('DELETE FROM otp WHERE phash = ?', phash);
    return { ok: false, error: 'that code has expired' };
  }
  if (row.tries >= CODE_TRIES) {
    sql.exec('DELETE FROM otp WHERE phash = ?', phash);
    return { ok: false, error: 'too many attempts, ask for a new code' };
  }

  const chash = await mac(env, e164 + ':' + code);
  if (!same(chash, row.chash)) {
    sql.exec('UPDATE otp SET tries = tries + 1 WHERE phash = ?', phash);
    return { ok: false, error: 'that code is wrong', left: CODE_TRIES - row.tries - 1 };
  }
  sql.exec('DELETE FROM otp WHERE phash = ?', phash);   // one code, one use

  let acct = sql.exec('SELECT * FROM accounts WHERE phash = ?', phash).toArray()[0];
  const fresh = !acct;
  if (!acct) {
    const id = 'a_' + token(12);
    sql.exec('INSERT INTO accounts(id,phash,last4,cc,made,seen) VALUES(?,?,?,?,?,?)',
             id, phash, e164.slice(-4), countryOf(e164), iso(), iso());
    acct = { id, phash, last4: e164.slice(-4) };
  } else {
    sql.exec('UPDATE accounts SET seen = ? WHERE id = ?', iso(), acct.id);
  }

  /* Somebody who has been playing on this device already owns a handle and a
     record. Signing in must adopt them, not start them over — the whole point
     of the change is that the record stops being disposable. */
  const device = String((body && body.device) || '').slice(0, 64);
  let handle = sql.exec('SELECT handle FROM players WHERE account = ? LIMIT 1', acct.id)
    .toArray().map(r => r.handle)[0] || null;
  if (!handle && device) {
    const mine = sql.exec('SELECT handle, account FROM players WHERE device = ?', device)
      .toArray()[0];
    if (mine && !mine.account) {
      sql.exec('UPDATE players SET account = ? WHERE device = ?', acct.id, device);
      handle = mine.handle;
    }
  }

  const tok = token();
  sql.exec('INSERT INTO sessions(thash,account,device,made,seen) VALUES(?,?,?,?,?)',
           await mac(env, tok), acct.id, device || null, iso(), iso());

  const prof = sql.exec('SELECT body, rev FROM profiles WHERE account = ?', acct.id).toArray()[0];
  return {
    ok: true, session: tok, account: acct.id, last4: acct.last4, fresh,
    handle, profile: prof ? JSON.parse(prof.body) : null, rev: prof ? prof.rev : 0,
  };
}

/* ── being signed in ─────────────────────────────────────────────────────── */

export async function whoIs(sql, env, tok) {
  if (!tok) return null;
  const row = sql.exec('SELECT * FROM sessions WHERE thash = ?', await mac(env, tok)).toArray()[0];
  if (!row) return null;
  sql.exec('UPDATE sessions SET seen = ? WHERE thash = ?', iso(), row.thash);
  return row;
}

export const MAX_PROFILE = 16 * 1024;

export async function save(sql, env, tok, body) {
  const s = await whoIs(sql, env, tok);
  if (!s) return { ok: false, error: 'signed out' };
  const text = JSON.stringify((body && body.profile) || {});
  if (text.length > MAX_PROFILE) return { ok: false, error: 'profile too large' };
  const cur = sql.exec('SELECT rev FROM profiles WHERE account = ?', s.account).toArray()[0];
  const rev = (cur ? cur.rev : 0) + 1;
  /* last write wins, but the client is told the revision it landed on so a
     second device can notice it is behind rather than silently clobber */
  sql.exec(`INSERT INTO profiles(account,body,rev,at) VALUES(?,?,?,?)
            ON CONFLICT(account) DO UPDATE SET body = excluded.body,
            rev = excluded.rev, at = excluded.at`, s.account, text, rev, iso());
  return { ok: true, rev };
}

export async function load(sql, env, tok) {
  const s = await whoIs(sql, env, tok);
  if (!s) return { ok: false, error: 'signed out' };
  const p = sql.exec('SELECT body, rev FROM profiles WHERE account = ?', s.account).toArray()[0];
  const h = sql.exec('SELECT handle FROM players WHERE account = ? LIMIT 1', s.account).toArray()[0];
  const a = sql.exec('SELECT last4 FROM accounts WHERE id = ?', s.account).toArray()[0];
  return { ok: true, account: s.account, last4: a ? a.last4 : null,
           handle: h ? h.handle : null,
           profile: p ? JSON.parse(p.body) : null, rev: p ? p.rev : 0 };
}

/* Required of every app that lets you make an account, and the only honest end
   to a promise about a phone number. The handle goes back on the shelf. */
export async function erase(sql, env, tok) {
  const s = await whoIs(sql, env, tok);
  if (!s) return { ok: false, error: 'signed out' };
  sql.exec('DELETE FROM profiles WHERE account = ?', s.account);
  const mine = sql.exec('SELECT handle FROM players WHERE account = ?', s.account).toArray();
  for (const r of mine) {
    sql.exec('DELETE FROM invites WHERE fromh = ? OR toh = ?', r.handle, r.handle);
    sql.exec('DELETE FROM players WHERE handle = ?', r.handle);
  }
  sql.exec('DELETE FROM sessions WHERE account = ?', s.account);
  sql.exec('DELETE FROM accounts WHERE id = ?', s.account);
  return { ok: true, erased: mine.map(r => r.handle) };
}
