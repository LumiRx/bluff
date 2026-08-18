import base64, json, os, subprocess, sys, time
import urllib.request as U, urllib.error as E
H = os.path.expanduser("~"); D = H + "/.appstoreconnect"
cfg = dict(l.strip().split("=", 1) for l in open(D + "/config")
           if "=" in l and not l.startswith("#"))
kid, iss = cfg["ASC_KEY_ID"], cfg["ASC_ISSUER_ID"]
b = lambda x: base64.urlsafe_b64encode(x).rstrip(b"=").decode()
j = lambda o: b(json.dumps(o, separators=(",", ":")).encode())
n = int(time.time())
si = j({"alg": "ES256", "kid": kid, "typ": "JWT"}) + "." + \
     j({"iss": iss, "iat": n, "exp": n + 1200, "aud": "appstoreconnect-v1"})
p = subprocess.run(["openssl", "dgst", "-sha256", "-sign",
                    "%s/private_keys/AuthKey_%s.p8" % (D, kid)],
                   input=si.encode(), capture_output=True)
d = p.stdout; i = 2 + ((d[1] & 0x7f) if d[1] & 0x80 else 0); raw = b""
for _ in range(2):
    L = d[i + 1]; raw += d[i + 2:i + 2 + L].lstrip(b"\0").rjust(32, b"\0"); i += 2 + L
tok = si + "." + b(raw)


def get(path):
    q = U.Request("https://api.appstoreconnect.apple.com/v1" + path,
                  headers={"Authorization": "Bearer " + tok})
    try:
        return json.load(U.urlopen(q, timeout=30))
    except E.HTTPError as e:
        sys.exit("App Store Connect returned %s: %s" % (e.code, e.read().decode()[:300]))
    except E.URLError as e:
        sys.exit("could not reach App Store Connect: %s" % e.reason)


apps = get("/apps?limit=200").get("data", [])
if not apps:
    sys.exit("no apps on this account yet — create the app record first")
for a in apps:
    at = a["attributes"]
    print("  %-30s %s" % (at.get("bundleId"), at.get("name")))
    for bd in get("/apps/%s/builds?limit=5" % a["id"]).get("data", []):
        s = bd["attributes"]
        print("      build %-8s %-12s %s" % (s.get("version"), s.get("processingState"),
                                             s.get("uploadedDate") or ""))
