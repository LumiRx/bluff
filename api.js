/* Exercises the Worker's request handling in-process. wrangler is not
   installable here, so the Durable Object and the platform bits are stubbed and
   the routing, validation and — the part that matters — the refusal to ever
   trust a submitted score are tested directly. */
const E = require('./server/src/engine.js');

// ── a stand-in for the Durable Object, same interface, in memory
class Board {
  constructor() { this.rows = new Map(); }
  submit(e) {
    if (this.rows.has(e.device)) {
      const prev = this.rows.get(e.device);
      return { ok: true, already: true, score: prev.score, rank: this.rank(e.device) };
    }
    this.rows.set(e.device, Object.assign({ at: Date.now() + this.rows.size }, e));
    return { ok: true, score: e.score, rank: this.rank(e.device), players: this.rows.size };
  }
  rank(device) {
    const me = this.rows.get(device); if (!me) return null;
    let above = 0; for (const r of this.rows.values()) if (r.score > me.score) above++;
    return above + 1;
  }
  board(n) {
    const rows = [...this.rows.values()].sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, n).map(r => ({ handle: r.handle, score: r.score, chips: r.chips, eligible: r.eligible ? 1 : 0 }));
    return { players: this.rows.size, rows };
  }
}

// ── the Worker, loaded by turning its ESM syntax into something Node can run
const fs = require('fs'), vm = require('vm');
let src = fs.readFileSync('./server/src/index.js', 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/^export \{[^}]*\}[^;]*;?$/gm, '')
  .replace(/^export default /m, 'const WORKER = ')
  .replace(/^export (async function|function|const)/gm, '$1');
const ctx = { runDaily: E.runDaily, HANDS: E.HANDS, Response, Request, URL, Date, JSON,
              console, Set, Array, String, Number, Object };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src + '\n;globalThis.__worker = WORKER;', ctx);
const WORKER = ctx.__worker;

const boards = new Map();
const env = { BOARD: {
  idFromName: n => n,
  get: n => ({ fetch: async (url, init) => {
    if (!boards.has(n)) boards.set(n, new Board());
    const b = boards.get(n), u = new URL(url);
    const out = u.pathname === '/submit' ? b.submit(JSON.parse(init.body))
                                         : b.board(+u.searchParams.get('n') || 100);
    return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
  } })
} };

const today = new Date().toISOString().slice(0, 10);
const post = (path, body, headers) => WORKER.fetch(new Request('https://api.webluff.com' + path, {
  method: 'POST', body: JSON.stringify(body),
  headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {})
}), env);
const get = path => WORKER.fetch(new Request('https://api.webluff.com' + path), env);

// a legal transcript for today
function legal(seed) {
  const d = E.setupDay(today);
  const word = d.script[0].cards[0];
  const t = E.withRng(E.mulberry32(seed || 3), () => E.offerTells(word));
  const tell = t.find(x => x.n <= 200) || t[0];
  const out = [{ word, tell: { k: tell.k, c: tell.c, i: tell.i }, stake: 25 }];
  for (let h = 1; h < 6; h++) out.push({ call: false });
  return out;
}

(async () => {
  const errs = [];
  const bad = m => { errs.push(m); console.log('   ✗ ' + m); };
  const ok = m => console.log('   · ' + m);
  const dev = n => ('device-' + n).padEnd(20, 'x');

  console.log('\n1. it answers');
  let r = await get('/v1/health'); let j = await r.json();
  if (!j.ok) bad('health check failed'); else ok(`health: day ${j.day}`);
  r = await get('/v1/nope');
  if (r.status !== 404) bad('unknown routes do not 404'); else ok('unknown routes 404');

  console.log('\n2. a real submission');
  r = await post('/v1/daily/submit',
    { day: today, device: dev(1), handle: 'VIV', age18: true, decisions: legal() },
    { 'cf-ipcountry': 'US' });
  j = await r.json();
  const truth = E.runDaily(today, legal());
  if (j.score !== truth.score) bad(`the server scored ${j.score}, the engine says ${truth.score}`);
  else ok(`accepted and scored server-side: ${j.score} points, rank ${j.rank}`);

  console.log('\n3. a score cannot be sent in');
  r = await post('/v1/daily/submit',
    { day: today, device: dev(2), handle: 'CHEAT', age18: true, score: 999999, chips: 99999,
      decisions: legal() }, { 'cf-ipcountry': 'US' });
  j = await r.json();
  if (j.score !== truth.score)
    bad(`a submitted score changed the result: got ${j.score}`);
  else ok(`a claimed 999999 is ignored — the server computed ${j.score} from the decisions`);

  console.log('\n4. what it turns away');
  const REJECTS = [
    ['a forged transcript', { day: today, device: dev(3), handle: 'XY', decisions:
      (() => { const d = legal(); d[0].word = 'ZEBRA'; return d; })() }, 422],
    ['the wrong number of hands', { day: today, device: dev(4), handle: 'XY', decisions: legal().slice(0, 4) }, 400],
    ['a day that is not a day', { day: 'tomorrow', device: dev(5), handle: 'XY', decisions: legal() }, 400],
    ['a closed day', { day: '2020-01-01', device: dev(6), handle: 'XY', decisions: legal() }, 409],
    ['no device token', { day: today, device: 'x', handle: 'XY', decisions: legal() }, 400],
    ['a one-letter handle', { day: today, device: dev(7), handle: 'A', decisions: legal() }, 400]
  ];
  for (const [what, body, code] of REJECTS) {
    const res = await post('/v1/daily/submit', body, { 'cf-ipcountry': 'US' });
    if (res.status !== code) bad(`${what}: got ${res.status}, expected ${code}`);
    else ok(`${what} → ${code} ${(await res.json()).error}`);
  }

  console.log('\n5. one entry per person per day');
  r = await post('/v1/daily/submit',
    { day: today, device: dev(1), handle: 'VIV', age18: true, decisions: legal(9) },
    { 'cf-ipcountry': 'US' });
  j = await r.json();
  if (!j.already) bad('a second attempt was allowed to overwrite the first');
  else ok(`a second attempt is refused — the first score of ${j.score} stands`);

  console.log('\n6. eligibility is recorded with the entry');
  const CASES = [
    ['US/NY, 18+', { c: 'US', reg: 'NY', age: true }, 1],
    ['US/TN, 18+', { c: 'US', reg: 'TN', age: true }, 0],
    ['US/NY, under 18', { c: 'US', reg: 'NY', age: false }, 0],
    ['GB, 18+', { c: 'GB', reg: null, age: true }, 1]
  ];
  let n = 20;
  for (const [what, cf, want] of CASES) {
    const req = new Request('https://api.webluff.com/v1/daily/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-ipcountry': cf.c },
      body: JSON.stringify({ day: today, device: dev(n++), handle: 'P' + n, age18: cf.age,
                             decisions: legal() })
    });
    req.cf = { regionCode: cf.reg };
    await WORKER.fetch(req, env);
  }
  const bd = await (await get('/v1/daily/board')).json();
  const got = bd.rows.filter(x => /^P2/.test(x.handle)).map(x => x.eligible);
  if (got.length !== 4) bad(`expected 4 test entries on the board, found ${got.length}`);
  CASES.forEach(([what, , want], i) => {
    const row = bd.rows.find(x => x.handle === 'P' + (21 + i));
    if (!row) return bad(`${what}: no entry landed`);
    if (row.eligible !== want) bad(`${what}: eligible ${row.eligible}, expected ${want}`);
    else ok(`${what} → ${want ? 'eligible for cash' : 'stars only'}`);
  });

  console.log('\n7. the board');
  if (!bd.rows.length) bad('the board came back empty');
  else {
    const sorted = bd.rows.every((r, i) => i === 0 || bd.rows[i - 1].score >= r.score);
    if (!sorted) bad('the board is not in score order');
    else ok(`${bd.players} players, top score ${bd.rows[0].score}, ordered`);
  }

  console.log('\n--- problems ---');
  console.log(errs.length ? errs.map(e => '  ' + e).join('\n') : '  none');
  process.exit(errs.length ? 1 : 0);
})();
