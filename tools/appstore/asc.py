#!/usr/bin/env python3
"""App Store Connect, from the command line. One file, no dependencies.

    python3 asc.py                  install a key and verify it
    python3 asc.py whoami           check the installed key still works
    python3 asc.py apps             bundle ids and app ids
    python3 asc.py builds BUNDLE    uploaded builds and their processing state
    python3 asc.py token            a 20-minute bearer token, for curl

Standard library plus the `openssl` already on every Mac — no pip, no Ruby,
nothing to keep up to date. For a tool that handles a signing key, the fewer
third-party packages that ever touch it the better.

Run with no arguments and it asks the questions rather than taking arguments.
That is deliberate: arguments end up in ~/.zsh_history and in `ps`, and it means
there is no placeholder to copy wrong. (`<issuer-id>` pasted into zsh is a
redirect, not a word — the shell gives up before the script ever runs.)

The .p8 is a private key: whoever holds it can act on your developer account,
and Apple issues it once. It belongs on this Mac and in your password manager,
and nowhere else.
"""
import base64, glob, json, os, re, subprocess, sys, time, urllib.request, urllib.error

HOME = os.path.expanduser("~")
CONF_DIR = os.path.join(HOME, ".appstoreconnect")
KEY_DIR = os.path.join(CONF_DIR, "private_keys")
CONF = os.path.join(CONF_DIR, "config")
API = "https://api.appstoreconnect.apple.com/v1"

UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
                  r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
KEYID = re.compile(r"^[A-Z0-9]{8,12}$")


def die(msg, code=1):
    print(f"\nerror: {msg}", file=sys.stderr)
    sys.exit(code)


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def clean(v):
    """Strip what people paste by accident: quotes, angle brackets from a
    placeholder, backslash-escapes from a Finder drag, stray whitespace."""
    v = (v or "").strip()
    for a, b in (('"', '"'), ("'", "'"), ("<", ">")):
        if v.startswith(a) and v.endswith(b) and len(v) > 1:
            v = v[1:-1]
    return v.replace("\\ ", " ").strip()


# ── installing ──────────────────────────────────────────────────────────────
def install():
    print("\n  App Store Connect API key")
    print("  " + "─" * 25)

    found = sorted(
        (p for d in ("Downloads", "Desktop", ".")
         for p in glob.glob(os.path.join(HOME, d, "AuthKey_*.p8"))),
        key=lambda p: -os.path.getmtime(p))
    src = ""
    if found:
        print(f"\n  Found: {found[0]}")
        if input("  Use this key? [Y/n] ").strip().lower() not in ("n", "no"):
            src = found[0]
    if not src:
        print("\n  Drag the AuthKey_XXXXXXXXXX.p8 file into this window, press return.")
        src = clean(input("  Key file: "))
        src = os.path.expanduser(src)
    if not src:
        die("no key file given")
    if not os.path.isfile(src):
        die(f"no file at: {src}")
    with open(src, "rb") as f:
        if b"BEGIN PRIVATE KEY" not in f.read(400):
            die(f"{src} is not a PEM private key. Is it the .p8 Apple gave you?")

    # the Key ID is in the filename, so nobody should have to retype it
    m = re.match(r"^AuthKey_([A-Z0-9]{8,12})\.p8$", os.path.basename(src))
    if m:
        key_id = m.group(1)
        print(f"  Key ID:  {key_id}  (read from the filename)")
    else:
        key_id = clean(input("\n  Key ID (10 characters, from the KEY ID column): "))
    if not KEYID.match(key_id):
        die(f"'{key_id}' does not look like a Key ID — 10 characters, capitals and digits")

    print("\n  Now the Issuer ID. It is at the top of the same App Store Connect")
    print("  page (Users and Access > Integrations), above the list of keys, and")
    print("  looks like 69a6de7f-1a2b-47e3-e053-5b8c7c11a4d1 — paste it whole.")
    issuer = clean(input("  Issuer ID: "))
    if not issuer or re.search(r"issuer|key.?id|xxxx", issuer, re.I):
        die("that looks like the placeholder from the instructions rather than\n"
            "       your Issuer ID. The real one is a UUID — five groups of hex\n"
            "       separated by hyphens. Run this again and paste that.")
    if not UUID.match(issuer):
        die(f"'{issuer}' is not an Issuer ID. It is a UUID: five groups of hex\n"
            "       separated by hyphens. It is NOT the Key ID and NOT your Team ID.")

    os.makedirs(KEY_DIR, exist_ok=True)
    os.chmod(CONF_DIR, 0o700)
    os.chmod(KEY_DIR, 0o700)
    dest = os.path.join(KEY_DIR, f"AuthKey_{key_id}.p8")
    if os.path.exists(dest) and open(dest, "rb").read() != open(src, "rb").read():
        die(f"a different key is already installed at\n       {dest}\n"
            "       Move it aside first if you meant to replace it.")
    with open(src, "rb") as a, open(dest, "wb") as b:
        b.write(a.read())
    os.chmod(dest, 0o600)

    # Key ID and Issuer ID are identifiers, not secrets — useless without the
    # key — but they live beside it rather than in any repo.
    with open(CONF, "w") as f:
        f.write(f"# App Store Connect credentials. The private key is {dest}\n"
                f"# — never commit it, never paste it anywhere.\n"
                f"ASC_KEY_ID={key_id}\nASC_ISSUER_ID={issuer}\n")
    os.chmod(CONF, 0o600)

    print(f"\n  installed  {dest}  (mode 600)")
    print(f"  wrote      {CONF}")

    # fastlane and xcrun also look in ~/private_keys; a symlink keeps one copy
    # of the secret on disk rather than two
    alt_dir = os.path.join(HOME, "private_keys")
    alt = os.path.join(alt_dir, f"AuthKey_{key_id}.p8")
    if not os.path.exists(alt):
        os.makedirs(alt_dir, exist_ok=True)
        os.chmod(alt_dir, 0o700)
        os.symlink(dest, alt)
        print(f"  linked     ~/private_keys/AuthKey_{key_id}.p8 -> the same file")

    print()
    whoami(key_id, issuer)
    print("\n  Put the .p8 in your password manager if you have not already —")
    print("  Apple will not issue it again.\n")


# ── talking to the API ──────────────────────────────────────────────────────
def load():
    cfg = {}
    if os.path.exists(CONF):
        for line in open(CONF):
            if "=" in line and not line.startswith("#"):
                k, _, v = line.strip().partition("=")
                cfg[k.strip()] = v.strip().strip("\"'")
    key_id = os.environ.get("ASC_KEY_ID") or cfg.get("ASC_KEY_ID")
    issuer = os.environ.get("ASC_ISSUER_ID") or cfg.get("ASC_ISSUER_ID")
    if not key_id or not issuer:
        die("no key installed yet. Run this script with no arguments:\n"
            f"       python3 {sys.argv[0]}")
    return key_id, issuer


def key_path(key_id):
    p = os.path.join(KEY_DIR, f"AuthKey_{key_id}.p8")
    if not os.path.exists(p):
        die(f"no private key at {p}\n       run this script with no arguments to install it")
    if os.stat(p).st_mode & 0o077:
        die(f"{p} is readable by others. Run: chmod 600 '{p}'")
    return p


def der_to_raw(der: bytes) -> bytes:
    """openssl emits DER; JWS wants raw R||S, 32 bytes each for P-256."""
    if der[0] != 0x30:
        raise ValueError("not a DER sequence")
    i = 2 + ((der[1] & 0x7F) if der[1] & 0x80 else 0)
    out = b""
    for _ in range(2):
        if der[i] != 0x02:
            raise ValueError("expected a DER integer")
        n = der[i + 1]
        out += der[i + 2:i + 2 + n].lstrip(b"\x00").rjust(32, b"\x00")
        i += 2 + n
    return out


def mint(key_id, issuer, minutes=20):
    now = int(time.time())
    head = {"alg": "ES256", "kid": key_id, "typ": "JWT"}
    body = {"iss": issuer, "iat": now, "exp": now + minutes * 60,
            "aud": "appstoreconnect-v1"}
    j = lambda o: b64(json.dumps(o, separators=(",", ":")).encode())
    signing_input = j(head) + "." + j(body)
    p = subprocess.run(["openssl", "dgst", "-sha256", "-sign", key_path(key_id)],
                       input=signing_input.encode(), capture_output=True)
    if p.returncode != 0:
        die("openssl could not sign with that key:\n       " + p.stderr.decode().strip())
    return signing_input + "." + b64(der_to_raw(p.stdout))


def call(path, key_id, issuer, params=None, fatal=True):
    url = API + path + ("?" + "&".join(f"{k}={v}" for k, v in params.items()) if params else "")
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + mint(key_id, issuer), "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            errs = json.loads(e.read().decode()).get("errors", [])
            detail = "; ".join(f"{x.get('title')}: {x.get('detail')}" for x in errs)
        except Exception:
            detail = str(e)
        if e.code == 401:
            detail += ("\n       A 401 almost always means the Issuer ID and the key "
                       "belong to\n       different accounts, or the key was revoked.")
        if e.code == 403:
            detail += "\n       A 403 means the key's role is too weak — it needs App Manager."
        (die if fatal else print)(f"App Store Connect returned {e.code}\n       {detail}")
    except urllib.error.URLError as e:
        (die if fatal else print)(f"could not reach App Store Connect: {e.reason}")
    return None


def whoami(key_id=None, issuer=None):
    key_id, issuer = (key_id, issuer) if key_id else load()
    data = call("/apps", key_id, issuer, {"limit": "1"}, fatal=False)
    if data is None:
        print("\n  The key is installed, but that call did not succeed. Fix the above")
        print("  and check again with:  python3 " + sys.argv[0] + " whoami")
        return False
    n = data.get("meta", {}).get("paging", {}).get("total", "?")
    print(f"  ✓ key {key_id} works")
    print(f"    issuer {issuer}")
    print(f"    {n} app(s) on this account"
          + ("  — create the app record next" if n == 0 else ""))
    return True


def main():
    if len(sys.argv) < 2:
        return install()
    cmd = sys.argv[1]
    if cmd in ("install", "setup"):
        return install()
    key_id, issuer = load()

    if cmd == "token":
        print(mint(key_id, issuer))
    elif cmd == "whoami":
        whoami(key_id, issuer)
    elif cmd == "apps":
        rows = call("/apps", key_id, issuer, {"limit": "200"}).get("data", [])
        if not rows:
            return print("no apps yet — create the app record in App Store Connect first")
        for a in rows:
            at = a["attributes"]
            print(f"  {at.get('bundleId'):<38} {at.get('name')}  [{a['id']}]")
    elif cmd == "builds":
        if len(sys.argv) < 3:
            die("usage: asc.py builds <bundle-id>")
        bundle = sys.argv[2]
        apps = call("/apps", key_id, issuer, {"limit": "200"}).get("data", [])
        app = next((a for a in apps if a["attributes"].get("bundleId") == bundle), None)
        if not app:
            die(f"no app with bundle id {bundle} — run `asc.py apps` to see what is there")
        rows = call(f"/apps/{app['id']}/builds", key_id, issuer, {"limit": "20"}).get("data", [])
        if not rows:
            return print("no builds uploaded yet")
        for b in rows:
            at = b["attributes"]
            print(f"  {at.get('version'):<10} {at.get('processingState'):<12} "
                  f"uploaded {at.get('uploadedDate')}")
    else:
        die(f"unknown command {cmd!r}. Try: whoami, apps, builds <bundle-id>, token, "
            "or no argument at all to install a key")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\ncancelled")
