/* 5arz verification — TOURNAMENT ENTRY GATE ONLY.
 *
 * Scope (Viv, 2026-08-16): used only to gate entry to verified/competitive
 * tournaments. Never in the free signup path, never on the casual daily.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ READ THIS BEFORE TRUSTING A CREDENTIAL
 *
 * The 5arz partner flow proves LIVENESS, not UNIQUENESS.
 *
 * On the partner Didit path, `unique_human: true` is a HARDCODED LITERAL in
 * bindProviderResultToPartner — 5arz never computes a document hash there, so
 * it cannot and does not check whether this person already verified under a
 * different ref. Confirmed by reading the deployed worker bundle:
 *
 *     uniqueHuman:!0            // literal, not a computed result
 *
 * Consequences, all verified against the deployed code:
 *   - sub_hash = sha256("<agentId>:<ref>")  → derived from OUR ref, so one
 *     human with two BLUFF accounts produces two different sub_hashes.
 *   - agent_humans.subject_hash is NULL for every Didit-flow row.
 *   - The webhook returns only {ref, jti, assurance, credential_type,
 *     pop_jwt, jwks_url}. Nothing stable across refs.
 *   - The same person verifying twice succeeds silently, twice, with two
 *     valid credentials both claiming unique_human:true. No flag, no log.
 *
 * THEREFORE: a 5arz credential alone CANNOT stop one person entering a
 * tournament under five accounts. This module never reports otherwise — see
 * tournamentGate(), which returns `sybilChecked: false` and requires the
 * caller to enforce uniqueness against an identifier BLUFF owns.
 *
 * Fixing this properly is a small change on the 5arz side (5arz is ours):
 * see claude/bluff-5arz-and-signin.md § "What 5arz must change".
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Inert unless env.FIVEARZ_ENABLED === "1".
 * Secrets: FIVEARZ_AGENT_ID, FIVEARZ_API_KEY, FIVEARZ_WEBHOOK_SECRET.
 */

const API = 'https://api.5arz.com';
const JWKS_URL = `${API}/.well-known/jwks.json`;
const ISSUER = 'https://5arz.com';
const VCT_PERSONHOOD = 'https://5arz.com/credentials/proof-of-personhood';

export function enabled(env) {
  return env.FIVEARZ_ENABLED === '1' && !!env.FIVEARZ_API_KEY && !!env.FIVEARZ_AGENT_ID;
}

const auth = env => ({
  'Authorization': `Bearer ${env.FIVEARZ_API_KEY}`,
  'Content-Type': 'application/json'
});

/* ── Start verification for a tournament entrant ───────────────────────────
   `ref` is our stable per-player id. Must not contain ':' (5arz packs it into
   "agt:<agentId>:<ref>"), keep <= 80 chars, and NEVER pass a raw phone number
   or email — pass an opaque player id or a hash. */
export async function startVerification(env, { ref, returnUrl }) {
  if (!enabled(env)) return { ok: false, error: 'fivearz_disabled' };
  if (!ref || String(ref).includes(':')) return { ok: false, error: 'bad_ref' };

  const r = await fetch(`${API}/api/agents/verify-link`, {
    method: 'POST',
    headers: auth(env),
    body: JSON.stringify({ ref: String(ref).slice(0, 80), returnUrl })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, error: body.error || 'provider_error' };
  return { ok: true, url: body.url, linkId: body.linkId, ref: body.ref };
}

/* ── Reconciliation poll — the source of truth ─────────────────────────────
   Webhooks are fire-and-forget with no retry. Always reconcile with this.
   Do NOT use /api/verify/status/:jti — partner-flow credentials live in
   agent_humans only, so it reports "unknown" for a valid pohf_ jti. */
export async function pollHuman(env, ref) {
  if (!enabled(env)) return { ok: false, error: 'fivearz_disabled' };
  const r = await fetch(`${API}/api/agents/humans/${encodeURIComponent(ref)}`, {
    headers: { 'Authorization': `Bearer ${env.FIVEARZ_API_KEY}` }
  });
  if (r.status === 404) return { ok: true, found: false, status: 'unknown' };
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, error: body.error || 'provider_error' };
  const h = body.human || {};
  return {
    ok: true, found: true, status: h.status, jti: h.jti,
    assurance: h.assurance, verifiedAt: h.verified_at, provider: h.provider
  };
}

/* ── Offline credential verification ───────────────────────────────────────
   ES256 / P-256. The JWKS publishes exactly ONE key with no kid history, so a
   rotation on the 5arz side invalidates in-flight 90-day credentials. */
let _jwks = { at: 0, keys: null };

async function jwks() {
  const now = Date.now();
  if (_jwks.keys && now - _jwks.at < 3600_000) return _jwks.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error(`jwks ${r.status}`);
  const { keys } = await r.json();
  if (!Array.isArray(keys) || !keys.length) throw new Error('jwks_empty');
  _jwks = { at: now, keys };
  return keys;
}

const b64u = s => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(p + '='.repeat((4 - p.length % 4) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const txt = u8 => new TextDecoder().decode(u8);

async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyCredential(env, jwt, { expectedRef } = {}) {
  const parts = String(jwt || '').split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };

  let header, claims;
  try {
    header = JSON.parse(txt(b64u(parts[0])));
    claims = JSON.parse(txt(b64u(parts[1])));
  } catch { return { valid: false, reason: 'undecodable' }; }

  if (header.alg !== 'ES256') return { valid: false, reason: 'bad_alg' };

  const keys = await jwks();
  const jwk = keys.find(k => k.kid === header.kid) || (keys.length === 1 ? keys[0] : null);
  if (!jwk) return { valid: false, reason: 'no_key_for_kid' };

  const key = await crypto.subtle.importKey(
    'jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
  );
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, key,
    b64u(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!ok) return { valid: false, reason: 'bad_signature' };

  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== ISSUER)                return { valid: false, reason: 'bad_issuer' };
  if (claims.vct !== VCT_PERSONHOOD)        return { valid: false, reason: 'wrong_credential_type' };
  if (!claims.exp || claims.exp <= now)     return { valid: false, reason: 'expired' };
  if (claims.iat && claims.iat > now + 300) return { valid: false, reason: 'issued_in_future' };

  // A test-mode credential is validly signed. It must never grant real standing.
  const isTest = claims.test === true || claims.env === 'test';
  if (isTest && env.FIVEARZ_ALLOW_TEST !== '1') return { valid: false, reason: 'test_credential' };

  // Binds the credential to THIS player. Without it, a valid credential minted
  // for another player could be replayed onto this account.
  if (expectedRef) {
    const want = await sha256Hex(`${env.FIVEARZ_AGENT_ID}:${expectedRef}`);
    if (claims.sub_hash !== want) return { valid: false, reason: 'subject_mismatch' };
  }

  return {
    valid: true,
    jti: claims.jti,
    liveness: claims.liveness === true,
    assurance: claims.assurance,
    subHash: claims.sub_hash,          // ref-scoped. NOT a human identifier.
    expiresAt: claims.exp,
    test: isTest,
    // Deliberately NOT surfaced as `uniqueHuman`. On the partner path this is a
    // hardcoded literal and asserts nothing. Kept only for auditing.
    uniqueHumanClaimed: claims.unique_human === true,
    uniqueHumanVerified: false
  };
}

/* ── THE TOURNAMENT GATE ───────────────────────────────────────────────────
   Returns what 5arz can actually prove, and states plainly what it cannot.

   `localUniquenessOk` is supplied BY THE CALLER and is where real sybil
   resistance lives. Suggested identifier, strongest first:
     1. verified payment-instrument fingerprint (entry fee does double duty)
     2. phone number with your own OTP  — note 5arz has NO phone verification
        of any kind, so this is entirely ours to build
     3. at minimum, a one-entry-per-jti ledger, which stops credential reuse
        but not a determined multi-accounter

   Never call the entrant "verified unique" in the UI on the strength of 5arz
   alone. "ID-verified" is the honest label for what this returns. */
export async function tournamentGate(env, { ref, jwt, localUniquenessOk = null }) {
  if (!enabled(env)) return { eligible: false, reason: 'fivearz_disabled' };

  let cred = null;
  if (jwt) {
    cred = await verifyCredential(env, jwt, { expectedRef: ref });
  } else {
    const p = await pollHuman(env, ref);
    if (!p.ok) return { eligible: false, reason: p.error || 'poll_failed' };
    if (!p.found || p.status !== 'verified') {
      return { eligible: false, reason: 'not_verified', status: p.found ? p.status : 'unknown' };
    }
    cred = { valid: true, jti: p.jti, liveness: p.assurance === 'direct_document_liveness',
             assurance: p.assurance, uniqueHumanVerified: false };
  }

  if (!cred.valid) return { eligible: false, reason: cred.reason };
  if (!cred.liveness) return { eligible: false, reason: 'no_liveness' };

  return {
    eligible: localUniquenessOk === true,
    reason: localUniquenessOk === true ? null
          : localUniquenessOk === false ? 'duplicate_entrant'
          : 'local_uniqueness_not_evaluated',
    proven: { idDocument: true, liveness: true, boundToThisPlayer: !!ref },
    notProven: { uniqueHuman: true },
    sybilChecked: false,          // 5arz cannot do this on the partner path
    jti: cred.jti,
    expiresAt: cred.expiresAt,
    label: 'ID-verified'          // NOT "verified unique"
  };
}

/* ── Webhook receiver ──────────────────────────────────────────────────────
   X-5arz-Signature: sha256=<hex HMAC-SHA256 of the RAW body>. Constant-time
   compare. The webhook is a nudge; the JWT and the poll are the truth. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handleWebhook(request, env) {
  if (!enabled(env) || !env.FIVEARZ_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'not_configured' }), { status: 503 });
  }
  const raw = await request.text();
  const sent = (request.headers.get('X-5arz-Signature') || '').replace(/^sha256=/, '');

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.FIVEARZ_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const want = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (!timingSafeEqual(sent, want)) {
    return new Response(JSON.stringify({ ok: false, error: 'bad_signature' }), { status: 401 });
  }

  let evt = {};
  try { evt = JSON.parse(raw); } catch {
    return new Response(JSON.stringify({ ok: false, error: 'bad_json' }), { status: 400 });
  }
  if (evt.event !== 'credential.issued') {
    return new Response(JSON.stringify({ ok: true, ignored: evt.event }), { status: 200 });
  }

  const d = evt.data || {};
  const check = await verifyCredential(env, d.pop_jwt, { expectedRef: d.ref });
  if (!check.valid) {
    return new Response(JSON.stringify({ ok: false, error: check.reason }), { status: 400 });
  }

  return new Response(JSON.stringify({
    ok: true, ref: d.ref, jti: check.jti,
    liveness: check.liveness, subHash: check.subHash,
    expiresAt: check.expiresAt, sybilChecked: false
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

/* ── Mount (3 lines in server/src/index.js) ────────────────────────────────
 *   import { handleWebhook } from './fivearz.js';
 *   if (url.pathname === '/v1/5arz/webhook' && request.method === 'POST')
 *     return handleWebhook(request, env);
 *
 * With FIVEARZ_ENABLED unset, that route 503s and nothing else changes.
 */
