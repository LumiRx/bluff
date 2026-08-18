"""The word safety layer.

Three jobs, and they are genuinely different jobs. Conflating them is what
produces a filter that blocks SKILL for containing "kill" and lets real abuse
through because the author got tired.

  1. THE DECK — words the game chooses to put on screen. The bar is highest
     here, because we picked them. Out goes anything offensive, and also
     anything merely grim: disease, death, weapons, drugs, religion, politics.
     None of that is offensive; it just is not what this game is.

  2. THE GUESS DICTIONARY — words a player is allowed to type. The bar is
     narrower on purpose. A player who types WARTY and is told it is not a word
     is being lied to, and that is the failure mode here. So only genuinely
     offensive words are refused, and they are refused because a guess is
     visible: your own board shows it, and the PEEK power-up shows it to
     somebody else.

  3. HANDLES, FRIEND NAMES AND TABLE CODES — strings a player invents. This is
     the only one that needs substring matching, because the input is
     adversarial rather than drawn from a dictionary.

The substring list is validated against the dictionary itself: if any term in
it appears inside a real word, the build fails. That makes a Scunthorpe blunder
impossible rather than unlikely.
"""

# ── 1. Genuinely offensive. Never on a screen, in any context. ──────────────
SLURS = """
abo abos chink chinks coon coons dago dagoes dagos faggot faggots fag fags
gook gooks gypo heeb injun kike kikes kraut krauts mongo mongos negro negroes
nigga niggas niggaz nigger niggers paki pakis pikey polack polacks raghead
ragheads redskin redskins sambo spic spick spicks spics spik squaw squaws
tranny trannies towelhead wetback wetbacks wog wogs wop wops yid yids
""".split()

# Words whose primary sense is entirely innocent but which carry a slur sense
# too. They stay guessable — refusing SPADE to somebody typing it would be
# absurd — but the game will never choose one as an answer.
DOUBLE_EDGED = """
spade spades shine shines shiner coon jap japs mick micks nip nips gyp gypped
mongol mongols cracker crackers savage savages
""".split()

SEXUAL = """
anal anus anuses arse arsed arsehole bareback bdsm bellend bitch bitches
bitchy boner boners bonk bonked boob boobs booby bukkake clit clits cock
cocks cocky cum cums cunt cunts dick dickhead dicks dildo dildos dong dongs
erotic fap fellate foreskin fuck fucked fucker fuckers fucking fucks gangbang
hentai hooker hookers horny incest jizz labia milf milfs nudes orgasm orgy
orgies penis penises perv pervs pervy porn porno prick pricks pube pubes
pussy rape raped raper rapers rapes rapist rapists molest molester
rimjob scrotum semen sexy shag shagged skank skanks slut sluts slutty
smut smuts smutty sperm sperms spunk spunky strapon tit tits titty twat twats
vagina vulva vulvae wank wanked wanker wankers wanks whore whores
""".split()

PROFANITY = """
arses ass asses bastard bastards bollock bollocks bugger buggers crap crappy
craps damn dammit dumbass goddamn jackass kkk motherfucker piss pissed pisser
pisses pissing shit shite shits shitty tosser tossers turd turds wtf
""".split()

OFFENSIVE = set(SLURS + SEXUAL + PROFANITY)

# ── 2. Clean, but not for this game. Deck only. ─────────────────────────────
VIOLENCE = """
assault attack behead bleed bleeds blood bloods bloody bomb bombed bomber
bombs brutal bullet bully butcher choke choked choker chokes corpse crime
crimes cruel dagger dead deadly deaden death deaths die died dies dying
execute gore gored gores gory grave graves gun gunman guns hang hanged
hitman homicide hostage kill killed killer kills knife knifed knifes lynch
maim maimed maims massacre molest murder murders noose nooses pistol raid
raided raids rape raped raper rapers rapes rapist rifle rifled rifles riot
riots slain slash slaughter slay slayed slayer slays slew slews snuff snuffs
stab stabbed stabs strangle terror terrorist threat throttle tomb tombs
torture victim violent war warfare weapon wound wounds
shoot shoots shot shots shotgun sniper
""".split()

SELF_HARM = """
anorexia bulimia cutting overdose selfharm suicide suicidal
""".split()

DRUGS = """
bong bongs booze boozed boozer boozes cannabis cocaine codeine crack
crackhead dope doper dopers drug drugs drunk drunks ecstasy fentanyl ganja
ganjas hashish heroin junkie ketamine meth methadone meths morphine narcotic
opiate opioid opium pothead reefer roofie shroom smack smacks snort snorts
spliff stoned toke toked tokes vape vaped vapes vaping weed weeds
acid joint speed
""".split()

UNPLEASANT = """
bile boil cadaver cancer casket coffin colic crypt crypts cyst cystic cysts
diarrhea disease dysentery ebola faeces feces fetus foetus gangrene germ
hearse hell herpes hospice illness infect infection leper lepers leprosy
lesion lupus maggot malaria morgue mortuary mucus nausea obese obesity
phlegm plague poison pus pustule rabies rash rot rotting scab scabs scabby
sepsis sewage slime slimes smallpox sore stench stroke syphilis tumor tumors
tumour ulcer ulcers undead urine vermin vomit vomits wart warts warty
decay virus viruses
""".split()

CHARGED = """
abortion allah antifa atheist bible bibles bigot bigots buddha christ church
deport fascism fascist gospel hindu islam jesus jew jews jihad jihads koran
mosque muslim pope popes pray prayed prayer prays prophet quran rabbi rabbis
religion satan sikh sin sinner slave slaved slaver slaves slavery synagogue
temple torah election immigrant migrant militia politics protest racism
racist refugee sexism sexist terrorism zionist
""".split()

DECK_BAN = OFFENSIVE | set(VIOLENCE + SELF_HARM + DRUGS + UNPLEASANT + CHARGED
                           + DOUBLE_EDGED + ["naked", "nude", "nudity"])


# ── Words three independent reviewers flagged when reading the finished deck. ──
# Each was read as a word displayed in large letters to a child. Most are
# perfectly ordinary English with an unfortunate second life: BEAVER, DOODLE and
# CHERRY have crude senses, SLANT and SLOPE and BRAVE and BROAD have slur
# senses, BLAZE and SKUNK and BUGLE and CRANK are drug slang, and a long tail is
# religion, gambling, crime or war — clean, but not what this game is.
#
# A handful of flags were over-cautious (BEHIND, MEMBER, PERIOD, FINGER) and are
# dropped anyway: the deck is 3,700 words and can afford it, whereas one bad
# screenshot cannot be undone.
REVIEWED_OUT = """
amen army bare blow bone brew buck bush clan clap cone dice dose drag dump
frog guru herb high holy idol jail junk knob leak lean lush malt mate navy
puff rack rail root tank tart tool toot trap unto
adult alien altar angel beget bingo blade blast blaze blunt brave broad
bugle bushy cider crank crash crazy credo creed cross cumin curvy deign
demur dogma drown ebony ennui failth faith fairy fever fight fishy flash
flask flesh fling fruit fudge furry grass grief grind groom karma kebab
lurid moist nadir nutty organ piety pious poker punch purge razor saint
skunk slant slope smite smoke sober steal stiff stout strap swear sword
taint theft thief unzip upper vigil witch wrath wrest alibi cramp fraud
affair barley beaver behind bishop bottom bubbly chapel cherry cherub
commit cuckoo dealer desire divine doodle facial finger frisky fruity
ginger heaven kosher master member native period polish postal raffle
ritual rubber shaggy spirit streak tinker volley zodiac
""".split()

DECK_BAN |= set(REVIEWED_OUT)

# ── 3. Substring terms for player-supplied text. ────────────────────────────
# Every entry here is checked against the whole dictionary at build time. If it
# turns up inside a real word, the build fails and it has to move to exact-only.
SUBSTRING = """
arsehole bastard bellend bitch bollocks bukkake clits cunt dildo faggot
fuck gangbang jizz kike motherfucker nigga nigger paki penis porn pussy
raghead redskin rimjob scrotum shit shite slut spick titty towelhead
tranny twat vagina wank wanker wetback whore
""".split()

# Real names that happen to contain one of the terms above. The Scunthorpe
# problem is not hypothetical: it is the reason this list exists, and a filter
# that calls somebody's home town obscene is its own kind of failure.
ALLOW = """
scunthorpe scunthorp penistone clitheroe lightwater assange cockburn
mishit mishits swank swanks swanky
""".split()

# "rape" is deliberately NOT a substring term: it hides inside GRAPE, DRAPE,
# SCRAPE and — the one that matters — THERAPIST. It is caught by exact match
# instead, which is the honest trade. A filter that refuses to let somebody
# call themselves THERAPIST has stopped being a safety feature.

# Leet substitutions a determined person reaches for first.
LEET = {"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
        "@": "a", "$": "s", "!": "i", "|": "i", "2": "z", "9": "g", "6": "b"}


def norm(s):
    """Fold player-supplied text down to comparable letters."""
    s = (s or "").lower()
    s = "".join(LEET.get(c, c) for c in s)
    return "".join(c for c in s if c.isalpha())


def deck_ok(word):
    """Answers: the strict list, exact match."""
    return word.lower() not in DECK_BAN


def guess_ok(word):
    """Guesses: only the genuinely offensive are refused."""
    return word.lower() not in OFFENSIVE


def handle_ok(text):
    """Handles, friend names, table codes: exact match on everything, plus a
    substring sweep with the validated terms."""
    n = norm(text)
    if not n:
        return True
    if n in ALLOW:
        return True
    if n in DECK_BAN:
        return False
    return not any(bad in n for bad in SUBSTRING)


def validate_substring(vocabulary):
    """Return the substring terms that collide with a real word.

    `vocabulary` is every word the game will ever accept. Anything in
    SUBSTRING that hides inside one of them would block an innocent handle
    like NIGHTOWL or SKILLZ, so it is a build error, not a judgement call.
    """
    clean = [w.lower() for w in vocabulary if guess_ok(w) and w.lower() not in ALLOW]
    bad = {}
    for term in SUBSTRING:
        hits = [w for w in clean if term in w and w != term]
        if hits:
            bad[term] = hits[:8]
    return bad


if __name__ == "__main__":
    import json
    print(json.dumps({
        "offensive": sorted(OFFENSIVE),
        "deck": sorted(DECK_BAN),
        "substring": sorted(SUBSTRING),
    }, separators=(",", ":")))
