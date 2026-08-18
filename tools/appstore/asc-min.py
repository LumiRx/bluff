import base64, glob, json, os, re, subprocess, sys, time
import urllib.request as U, urllib.error as E
H = os.path.expanduser("~"); D = H + "/.appstoreconnect"; K = D + "/private_keys"
b = lambda x: base64.urlsafe_b64encode(x).rstrip(b"=").decode()
tidy = lambda s: s.strip().strip('"').strip("'").lstrip("<").rstrip(">").replace("\\ ", " ").strip()

hits = sorted(glob.glob(H + "/Downloads/AuthKey_*.p8") + glob.glob(H + "/Desktop/AuthKey_*.p8"),
              key=lambda p: -os.path.getmtime(p))
src = hits[0] if hits else os.path.expanduser(tidy(input("Drag the .p8 file here: ")))
if not os.path.isfile(src): sys.exit("no file at: " + src)
m = re.match(r"AuthKey_([A-Z0-9]{8,12})\.p8$", os.path.basename(src))
kid = m.group(1) if m else tidy(input("Key ID: "))
print("  key file:", src)
print("  Key ID:  ", kid)

iss = tidy(input("  Issuer ID (the UUID at the top of the Integrations page): "))
if not re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", iss, re.I):
    sys.exit("  '%s' is not the Issuer ID. It is a UUID — five groups of hex separated by\n"
             "  hyphens. It is not the Key ID and not your Team ID." % iss)

os.makedirs(K, exist_ok=True); os.chmod(D, 0o700); os.chmod(K, 0o700)
dst = "%s/AuthKey_%s.p8" % (K, kid)
open(dst, "wb").write(open(src, "rb").read()); os.chmod(dst, 0o600)
open(D + "/config", "w").write("ASC_KEY_ID=%s\nASC_ISSUER_ID=%s\n" % (kid, iss))
os.chmod(D + "/config", 0o600)
print("\n  installed", dst, "(mode 600)")

n = int(time.time())
j = lambda o: b(json.dumps(o, separators=(",", ":")).encode())
si = j({"alg": "ES256", "kid": kid, "typ": "JWT"}) + "." + \
     j({"iss": iss, "iat": n, "exp": n + 1200, "aud": "appstoreconnect-v1"})
p = subprocess.run(["openssl", "dgst", "-sha256", "-sign", dst], input=si.encode(), capture_output=True)
if p.returncode: sys.exit("  openssl could not sign with that key: " + p.stderr.decode())
d = p.stdout; i = 2 + ((d[1] & 0x7f) if d[1] & 0x80 else 0); raw = b""
for _ in range(2):
    L = d[i + 1]; raw += d[i + 2:i + 2 + L].lstrip(b"\0").rjust(32, b"\0"); i += 2 + L

try:
    q = U.Request("https://api.appstoreconnect.apple.com/v1/apps?limit=1",
                  headers={"Authorization": "Bearer " + si + "." + b(raw)})
    total = json.load(U.urlopen(q, timeout=30))["meta"]["paging"]["total"]
    print("  ✓ key works — %s app(s) on this account" % total)
    if not total: print("    create the app record in App Store Connect next")
except E.HTTPError as e:
    print("  App Store Connect returned", e.code)
    print("  401 = the Issuer ID and the key belong to different accounts, or the key was revoked")
    print("  403 = the key's role is too weak; it needs App Manager")
except Exception as e:
    print("  key installed, but the check could not run:", e)
