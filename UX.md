# The board, the badges, and why people send them to their friends

## What changed

The leaderboard was a column of emoji animals. They went, and two things replaced them.

**Crests.** Two letters of your handle on a colour that handle will always get — same crest on every
device, every board, forever. It reads as a professional product rather than a children's app, but
the real argument is different: an emoji fox says nothing about you. It was *handed* to you. A
leaderboard is a status object and every pixel on it should be something earned. You can pick the
colour, which is enough ownership to matter and small enough that the board still reads as one
object.

**Badges, one of each kind per row.** A title and a trait, never two of a kind, because a row
showing two titles has quietly dropped the funnier half — and the funnier half is the part that gets
screenshotted.

## Titles — scarce on purpose

| Badge | Who holds it |
|---|---|
| BEST IN THE WORLD | exactly one person |
| WORLD TOP 3 | two more |
| WORLD TOP 100 | ninety-seven more |
| BEST IN LOS ANGELES | one per city |
| LOS ANGELES TOP 10 | nine more per city |

Scarcity is the entire mechanism. A badge everybody has is decoration; a badge one person has is a
thing to take off them. City titles matter more than world titles for growth, because being 41st in
the world is abstract and being first in Los Angeles is a text you send your brother — and there
are thousands of cities, so thousands of people get to hold a No.1 that means something to the
people who actually know them.

Titles are held, not awarded. They move the moment somebody plays better, which is what makes
losing one a reason to open the app.

## Traits — earned, funny, and slightly insulting

Ordered by rarity so a board never ends up with four people wearing the same one.

| Badge | What it means | Earned at |
|---|---|---|
| MOST BULLIED | the table eats well when this one calls | misses 55% of calls, min 20 |
| NOBODY CALLS | so frightening that nobody pays to play | 30% of your hands draw no callers |
| CALLING STATION | has never once believed a word of it | calls 85% of hands faced |
| THE ROCK | folds more than anybody at the table | folds 42% of hands faced |
| BUST ARTIST | has run the bankroll to nothing, repeatedly | 10 busts |
| BEST BLUFFER | sets words the table cannot crack | 55% of your words survive |
| SAFE HANDS | folds the ones that were going to hurt | 75% good laydowns |
| BIG POT | took a pot most people never see | a 400+ pot |
| IRON STREAK | six wins without sitting down | best streak of 6 |

Every one needs a real sample before it can be earned, so it is a verdict rather than noise. Every
one is worded to sting slightly and be funny — that combination is what gets a badge pasted into a
group chat, and the group chat is the growth channel.

## The psychology, stated plainly

**People do not screenshot numbers. They screenshot a number with a title attached**, because the
title is the part their friends can argue with. "412" is nothing. "412 — BEST IN LOS ANGELES,
NOBODY CALLS" is a claim, and a claim invites a challenge.

**Losing a title is a stronger pull than gaining one.** The app does not need to nag somebody who is
first in their city; it needs to tell them when they stop being.

**The insult badges do more work than the flattering ones.** Nobody forwards "SAFE HANDS". Everybody
forwards being called MOST BULLIED, especially to the person who did the bullying.

**Rivalry beats ranking.** A global board makes 99.9% of players feel average. The same six deals
against three people you actually know makes everybody feel like they are in a fight. Friends first,
city second, world third — that is the order of the tabs and the order of the notifications.

## Wired

The server sends `world`, `cityRank`, `cityName` and the trait stats with every board row, and the
badges are computed from those rather than from anything the client claims. City comes from
Cloudflare's coarse geo on the request — no GPS, no permission prompt, nothing new in the privacy
labels. A city board needs 20 players before it appears at all, or the first player in a small town
is permanently first and it reads as broken rather than as an achievement. `node board.js` proves
the ranks, the floor and the badge thresholds against real rows.

---

# Every emoji is gone

The board was the loud case, and fixing it exposed the general one. An emoji is not a picture — it
is a *different* picture on every device. Apple's trophy is not Google's trophy is not Samsung's,
none of them is drawn in our weight or our palette, none of them sits on our baseline, and on
something older you get a tofu box. That is why a screenshot with emoji in it reads as unfinished
even when nobody can point at why.

So there are now sixteen drawn marks — sound, mute, book, bolt, chest, cup, globe, bulb, gift, peek,
seat, redeal, scramble, dice, clock — each one path, stroked in `currentColor`. A mark inside a gold
heading is gold without anyone saying so, and it scales with the type it sits next to. Adding one is
a line in the `MARK` object.

**The one deliberate exception is the share strip.** 👑🟩🟥⬜ stays, because that string is not going
into our app — it is going into somebody's Messages, a tweet, a group chat, where we control nothing
and a drawn mark is not an option. A coloured square is legible in every text field on earth, and a
row of them is the only part of a result anyone actually reads.

The prize strip's medal is the same turning conic-gradient metal as the leaderboard's first, second
and third discs, at eleven pixels — so the mark that says *top three* and the medals that show it are
visibly the same object.
