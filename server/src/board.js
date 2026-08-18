/* ══════════ ONE DAY'S BOARD ══════════
   A Durable Object per day key. Everybody who plays 2026-08-08 lands on the
   same object, so ranking is a sort of a list rather than a distributed
   problem, and the day rolls over by simply addressing a different object.

   The object stores scores. It does not compute them and it cannot be told
   one — every score arriving here has already been produced by the engine from
   the player's decisions. */
export class DailyBoard {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS entries(
      device TEXT PRIMARY KEY,
      handle TEXT NOT NULL,
      score  INTEGER NOT NULL,
      chips  INTEGER NOT NULL,
      region TEXT,
      city   TEXT,
      stats  TEXT,
      eligible INTEGER NOT NULL DEFAULT 0,
      at     TEXT NOT NULL
    )`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS by_score ON entries(score DESC)`);
    /* the city board is a second sort of the same rows, so it needs its own
       index or every city page walks the whole day */
    this.sql.exec(`CREATE INDEX IF NOT EXISTS by_city ON entries(city, score DESC)`);
    for (const c of ['city', 'stats']) {
      const has = this.sql.exec(`PRAGMA table_info(entries)`).toArray().some(x => x.name === c);
      if (!has) this.sql.exec(`ALTER TABLE entries ADD COLUMN ${c} TEXT`);
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/submit') return this.submit(await request.json());
    if (url.pathname === '/board')
      return json(this.board(+url.searchParams.get('n') || 100,
                             url.searchParams.get('city') || null));
    if (url.pathname === '/scores')
      return json(this.scores((url.searchParams.get('handles') || '').split(',')));
    return json({ error: 'not found' }, 404);
  }

  submit(e) {
    /* One entry per device per day, and the first one stands. Letting a better
       score replace an earlier one turns a contest of skill into a contest of
       attempts, which is exactly what the rules promise it is not. */
    const seen = this.sql.exec('SELECT score, chips, eligible FROM entries WHERE device = ?',
      e.device).toArray();
    if (seen.length)
      return json({ ok: true, already: true, score: seen[0].score, chips: seen[0].chips,
        eligible: !!seen[0].eligible, rank: this.rankOf(e.device), players: this.count() });

    this.sql.exec(
      `INSERT INTO entries(device,handle,score,chips,region,city,stats,eligible,at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      e.device, e.handle, e.score, e.chips, e.region || null, e.city || null,
      e.stats ? JSON.stringify(e.stats).slice(0, 400) : null,
      e.eligible ? 1 : 0, new Date().toISOString()
    );
    return json({ ok: true, score: e.score, chips: e.chips, eligible: !!e.eligible,
      rank: this.rankOf(e.device), players: this.count(),
      city: e.city || null, cityRank: this.rankOf(e.device, e.city),
      cityPlayers: e.city ? this.count(e.city) : 0 });
  }

  /* Scores for named people. The friends board needs somebody who came 900th
     just as much as it needs the leader, so it cannot read the top-100 list. */
  scores(handles) {
    const want = handles.filter(h => h);
    if (!want.length) return { scores: {} };
    const marks = want.map(() => '?').join(',');
    const rows = this.sql.exec(
      `SELECT handle, score, chips FROM entries WHERE handle IN (${marks})`, ...want).toArray();
    const out = {};
    for (const r of rows) out[r.handle] = { score: r.score, chips: r.chips };
    return { scores: out, players: this.count() };
  }

  count(city) {
    return city
      ? this.sql.exec('SELECT COUNT(*) AS n FROM entries WHERE city = ?', city).toArray()[0].n
      : this.sql.exec('SELECT COUNT(*) AS n FROM entries').toArray()[0].n;
  }

  rankOf(device, city) {
    const me = this.sql.exec('SELECT score, city FROM entries WHERE device = ?', device).toArray();
    if (!me.length) return null;
    if (city === undefined) city = null;
    const above = city
      ? this.sql.exec('SELECT COUNT(*) AS n FROM entries WHERE city = ? AND score > ?',
                      city, me[0].score).toArray()[0].n
      : this.sql.exec('SELECT COUNT(*) AS n FROM entries WHERE score > ?',
                      me[0].score).toArray()[0].n;
    return above + 1;
  }

  /* A city board is only shown once enough people are on it. The first player
     in a small town being permanently first reads as broken rather than as an
     achievement, and it makes the title worthless to everyone who comes after. */
  static CITY_FLOOR = 20;

  board(n, city) {
    if (city && this.count(city) < DailyBoard.CITY_FLOOR)
      return { players: this.count(city), rows: [], thin: true,
               floor: DailyBoard.CITY_FLOOR, city };
    const rows = city
      ? this.sql.exec(
          `SELECT handle, score, chips, city, stats, eligible FROM entries
           WHERE city = ? ORDER BY score DESC, at ASC LIMIT ?`, city, Math.min(500, n)).toArray()
      : this.sql.exec(
          `SELECT handle, score, chips, city, stats, eligible FROM entries
           ORDER BY score DESC, at ASC LIMIT ?`, Math.min(500, n)).toArray();
    /* the badges are computed from what the row already carries, so the client
       never has to be trusted about who is first in the world */
    return { players: this.count(city), city: city || null,
             rows: rows.map((r, i) => ({
               handle: r.handle, score: r.score, chips: r.chips, eligible: r.eligible,
               world: city ? null : i + 1,
               cityRank: city ? i + 1 : null,
               cityName: r.city || null,
               stats: r.stats ? JSON.parse(r.stats) : null,
             })) };
  }
}

const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'Content-Type': 'application/json' }
});
