# Connection, players, and what it costs

## The game itself is still static, and that is still the good news

The whole game is one HTML file. Every player runs their own copy; the daily table is identical for
everybody because it is **derived from the date**, not fetched. A friend challenge produces the same
five-character code on both phones because it is derived from the two handles, not exchanged.

So serving the game to a million concurrent players costs the same as serving it to one. Cloudflare
Pages serves static assets with unlimited requests and unlimited bandwidth on the free plan, and the
game is a 238 KB file that a service worker caches on first visit — so the second visit costs
nothing at all.

The only thing that talks to a server is the daily board, and it does so **twice per player per
day**: once to submit a run, once to read the board.

| | Concurrent players | Monthly cost |
|---|---|---|
| The game itself, static | no practical ceiling | **$0** |
| The daily board, as built | ~50,000 daily players | **~$5** |
| With live 6-handed tables (not built) | ~60,000 concurrent (10,000 tables) | ~$80 |

---

## The daily board: built

**You cannot pay the top three of a board that is not real.** That was the one blocking dependency
for cash prizes, and it is now closed. `server/` is the whole thing, and it is small on purpose.

**1. It accepts decisions, not a score.** `POST /v1/daily/submit` carries the day, a device token, a
handle, and six hands as they were played: which card was set, which clue, which price, whether each
other hand was called or folded, and every guess.

**2. It scores them itself.** The daily is deterministic, so the server knows exactly what the six
deals were. `runDaily` replays the transcript through the same engine the game runs and produces the
score from scratch. **There is no field in the request for a score.** A fabricated transcript comes
back 422 naming the rule it broke — a word that was not dealt, a clue that is not true of the word,
a price over the cap for that clue, a fifth guess, a guess that is not a word, play continuing after
the word fell, or the wrong number of hands.

This is the difference between "we validate the score" and "there is no score to forge", and it is
worth being precise about which one you have. It is the second.

**3. It ranks and publishes.** One Durable Object per day key, addressed by the date string, holding
a SQLite table. Everyone playing 2026-08-08 lands on the same object, so ranking is a sort rather
than a distributed problem, and the day rolls over by addressing a different object. The board is
the same object for everybody, so the edge caches it for 20 seconds.

**4. One entry per device per day, first one stands.** Letting a better score replace an earlier one
turns a contest of skill into a contest of attempts, which is exactly what the official rules
promise it is not.

**5. Eligibility is recorded with the entry**, from `cf-ipcountry` and `request.cf.regionCode` at
submission time, rather than reconstructed months later at payout.

### What it deliberately does not have

No login, no password, no email, no personal data. A device generates its own random token and that
token is the only thing tying today's entry to the same person. That is weaker than accounts against
a determined multi-accounter — and the right trade, because identity only actually matters at the
moment you send somebody money, and that is where to verify it. Tightening entry-time identity
instead would cost every honest player a signup to solve a problem you can solve once, at payout,
for the three people a day who win.

### What it costs

Durable Objects require the Workers Paid plan, so the floor is **$5/month**. Against the included
1M requests and 400,000 GB-s:

| Daily players | Requests/month | Estimated cost |
|---|---|---|
| 1,000 | 60k | **$5** — the plan floor, nothing else |
| 50,000 | 3M | **$5–7** |
| 500,000 | 30M | **~$20** |

A submit is one request plus one Durable Object request; a board read is usually served from cache.
This is cheap because the game does almost nothing over the network — the expensive part of a
multiplayer game is the part that is still a local deterministic script.

### The failure mode it is built around

A player finishing a run on a train must not lose it. If the submission cannot be delivered, the run
is queued in the profile and sent automatically on next launch, and the summary says so in plain
words rather than claiming a prize the board never received. `link.js` plays a real match with the
network pulled, checks the run is kept, checks nothing advertises money, then restores the network
and checks the run goes up by itself.

---

## Live multiplayer, when you want it

Six humans at one table, server-authoritative so the word never reaches a client. Durable Objects
are the right tool and you are already on Cloudflare.

**One Durable Object per table.** The object holds the word, the clue, the stakes and the seat
states. Players connect over WebSocket. The word exists only inside the object — a client that
inspects its own traffic sees the clue and the other players' guesses, which is exactly what it
would see sitting at the table.

**Use the WebSocket Hibernation API.** Without it, an object stays in memory for as long as anyone is
connected and you pay duration the whole time. With it, the object is evicted between messages and
its connections survive. For a turn-based game where players spend most of a hand thinking, this is
the difference between a rounding error and a real bill.

### What it costs

Cloudflare bills Durable Objects on requests and on duration (GB-seconds). Incoming WebSocket
messages are billed at **20:1** — 100 messages count as 5 requests.

Take a match: 6 players, six hands, about 8 minutes, maybe 400 inbound messages in total.

- **Requests:** 400 messages ÷ 20 = 20 billable requests per match.
- **Duration:** at 128 MB and 8 minutes of wall time, roughly 60 GB-s per match — and materially
  less with hibernation, since a table sits idle while people think.

| Matches / month | Players served | Requests | GB-s | Estimated cost |
|---|---|---|---|---|
| 6,600 | ~40,000 | 132k | 400k | **$0** — inside the included amounts |
| 100,000 | ~600,000 | 2M | 6M | **~$75** + $0.15 requests |
| 1,000,000 | ~6,000,000 | 20M | 60M | **~$750** + $2.85 requests |

That is roughly **$0.00013 per player-session** at scale — about one eighth of a cent to serve
somebody a full six-handed match.

### Where the ceiling actually is

- **Per object:** Cloudflare's soft throughput limit is around **1,000 requests/second per object**.
  A 6-player table peaks at maybe 5 messages/second. You are three orders of magnitude clear.
- **The daily board is one object per day**, and it takes one write per player. At 50,000 players
  spread over 24 hours that is under one write per second; even if half the world plays in the same
  hour it is around 7/second. Comfortable. If it ever were not, shard by hashing the device token
  into N objects and merge N sorted lists at read time.
- **Number of objects:** unlimited within a namespace. Tables do not contend with each other.
- **The real constraint for live tables is matchmaking**, not the tables. One object holding the
  lobby queue *would* hit the 1,000/s limit at scale — shard it by rating band and region, which you
  want anyway because the ladder already seats people against nearby ratings.

### What it would take to build

Two to four weeks. One Durable Object class, a lobby shard, a reconnect path, and bot backfill so
nobody ever stares at an empty table. The game logic already exists and is already deterministic,
which is most of the work most people underestimate.

---

## The order I would do it in

1. ~~Daily-score server with transcript verification.~~ **Done.** Deploy it (`DEPLOY.md`).
2. **Ship the single-player app to both stores.** It is finished. Live multiplayer is not a
   prerequisite for a good launch and waiting for it costs you months of learning.
3. **Live tables**, once you know whether people play the daily twice.

Building multiplayer before you know whether anyone folds is the expensive version of this.
