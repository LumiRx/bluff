#!/usr/bin/env python3
"""Drive an App Store Connect release from the terminal.

asc.py reads; this one writes. It creates the version record, attaches the
build, sets the copyright and the release notes, answers the age rating, and
submits for review -- each step printed before it happens and each one
idempotent, so a re-run after a failure picks up where it stopped.

  python3 tools/appstore/release.py status                 what is on the record now
  python3 tools/appstore/release.py stage 1.1.3 202609081409
  python3 tools/appstore/release.py submit 1.1.3
  python3 tools/appstore/release.py withdraw            pull the queued submission back
  python3 tools/appstore/release.py rename 1.1.4 1.1.5  renumber a version that never shipped
  python3 tools/appstore/release.py notes 1.1.5 tools/appstore/review-notes-1.1.5.txt

`submit` asks for the word yes unless --yes is passed, and `withdraw` does the
same, because both change what Apple is looking at.
"""
import json, os, sys, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asc

BUNDLE = "gg.bluff.app"
API = "https://api.appstoreconnect.apple.com/v1"


def api(method, path, body=None, params=None, fatal=True):
    key_id, issuer = asc.load()
    url = (path if path.startswith("http") else API + path)
    if params:
        url += ("&" if "?" in url else "?") + "&".join(f"{k}={v}" for k, v in params.items())
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + asc.mint(key_id, issuer),
        "Accept": "application/json",
        "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        try:
            errs = json.loads(e.read().decode()).get("errors", [])
            detail = " | ".join(f"{x.get('title')}: {x.get('detail')}" for x in errs)
        except Exception:
            detail = str(e)
        msg = f"{method} {path} -> {e.code}\n       {detail}"
        if fatal:
            asc.die(msg)
        print("  ! " + msg)
        return None


def app_id():
    apps = api("GET", "/apps", params={"limit": "200"})["data"]
    a = next((x for x in apps if x["attributes"].get("bundleId") == BUNDLE), None)
    if not a:
        asc.die(f"no app with bundle id {BUNDLE}")
    return a["id"], a["attributes"].get("name")


def versions(aid):
    return api("GET", f"/apps/{aid}/appStoreVersions", params={"limit": "10"})["data"]


def build_id(aid, number):
    rows = api("GET", f"/apps/{aid}/builds", params={"limit": "50"})["data"]
    b = next((x for x in rows if x["attributes"].get("version") == str(number)), None)
    if not b:
        asc.die(f"no build {number} on this app — `asc.py builds {BUNDLE}` lists them")
    return b["id"], b["attributes"].get("processingState")


def status():
    aid, name = app_id()
    print(f"app  {name}  ({BUNDLE})  id {aid}")
    for v in versions(aid):
        a = v["attributes"]
        print(f"\nversion {a['versionString']}  [{a['appStoreState']}]  "
              f"release {a.get('releaseType')}  id {v['id']}")
        print(f"  copyright: {a.get('copyright')!r}")
        b = api("GET", f"/appStoreVersions/{v['id']}/build", fatal=False)
        bd = (b or {}).get("data")
        print(f"  build: {bd['attributes']['version'] if bd else '— none attached —'}")
        locs = api("GET", f"/appStoreVersions/{v['id']}/appStoreVersionLocalizations",
                   params={"limit": "10"}, fatal=False) or {"data": []}
        for l in locs["data"]:
            la = l["attributes"]
            wn = (la.get("whatsNew") or "").replace("\n", " ")
            print(f"  {la['locale']}: whatsNew {len(wn)} chars — {wn[:90]!r}")
        ar = api("GET", f"/appStoreVersions/{v['id']}/ageRatingDeclaration", fatal=False)
        if ar and ar.get("data"):
            d = ar["data"]["attributes"]
            on = {k: x for k, x in d.items() if x not in (None, False, "NONE")}
            print(f"  age rating id {ar['data']['id']}; non-default answers: {on or '{} (all clear)'}")
        rd = api("GET", f"/appStoreVersions/{v['id']}/appStoreReviewDetail", fatal=False)
        if rd and rd.get("data"):
            d = rd["data"]["attributes"]
            print(f"  review contact: {d.get('contactFirstName')} {d.get('contactLastName')} "
                  f"{d.get('contactEmail')} {d.get('contactPhone')}")
            if d.get("demoAccountRequired"):
                print("  ! a demo account is marked required")
        ph = api("GET", f"/appStoreVersions/{v['id']}/appStoreVersionPhasedRelease", fatal=False)
        if ph and ph.get("data"):
            print(f"  phased release: {ph['data']['attributes'].get('phasedReleaseState')}")
    subs = api("GET", f"/apps/{aid}/reviewSubmissions", params={"limit": "5"}, fatal=False)
    for s in (subs or {}).get("data", []):
        print(f"\nreview submission {s['id']}: state {s['attributes'].get('state')} "
              f"submitted {s['attributes'].get('submittedDate')}")


def stage(version, build, whatsnew_file=None, copyright_txt=None):
    aid, _ = app_id()
    bid, state = build_id(aid, build)
    print(f"build {build} is {state} (id {bid})")
    if state != "VALID":
        asc.die(f"build {build} is {state} — wait for VALID before attaching it")
    v = next((x for x in versions(aid) if x["attributes"]["versionString"] == version), None)
    editable = {"PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED",
                "METADATA_REJECTED", "INVALID_BINARY"}
    if v and v["attributes"]["appStoreState"] not in editable:
        asc.die(f"version {version} is {v['attributes']['appStoreState']} — not editable")
    if not v:
        print(f"creating version {version}")
        v = api("POST", "/appStoreVersions", {"data": {
            "type": "appStoreVersions",
            "attributes": {"platform": "IOS", "versionString": version,
                           "releaseType": "AFTER_APPROVAL"},
            "relationships": {"app": {"data": {"type": "apps", "id": aid}}}}})["data"]
    vid = v["id"]
    print(f"version {version} id {vid} [{v['attributes']['appStoreState']}]")
    if copyright_txt:
        api("PATCH", f"/appStoreVersions/{vid}", {"data": {
            "type": "appStoreVersions", "id": vid,
            "attributes": {"copyright": copyright_txt}}})
        print(f"  copyright -> {copyright_txt}")
    print("  attaching the build")
    api("PATCH", f"/appStoreVersions/{vid}/relationships/build",
        {"data": {"type": "builds", "id": bid}})
    if whatsnew_file:
        text = open(whatsnew_file).read().strip()
        locs = api("GET", f"/appStoreVersions/{vid}/appStoreVersionLocalizations",
                   params={"limit": "10"})["data"]
        for l in locs:
            api("PATCH", f"/appStoreVersionLocalizations/{l['id']}", {"data": {
                "type": "appStoreVersionLocalizations", "id": l["id"],
                "attributes": {"whatsNew": text}}})
            print(f"  what's new -> {l['attributes']['locale']} ({len(text)} chars)")


def agerating(version, **answers):
    """Answer the age-rating questionnaire. Field names differ by API vintage,
    so unknown keys are reported rather than silently dropped."""
    aid, _ = app_id()
    v = next((x for x in versions(aid) if x["attributes"]["versionString"] == version), None)
    if not v:
        asc.die(f"no version {version}")
    ar = api("GET", f"/appStoreVersions/{v['id']}/ageRatingDeclaration")["data"]
    known = set(ar["attributes"].keys())
    unknown = [k for k in answers if k not in known]
    if unknown:
        print(f"  ! this API vintage has no field(s) {unknown}")
        print(f"    it has: {sorted(known)}")
        answers = {k: x for k, x in answers.items() if k in known}
    if not answers:
        return
    api("PATCH", f"/ageRatingDeclarations/{ar['id']}", {"data": {
        "type": "ageRatingDeclarations", "id": ar["id"], "attributes": answers}})
    for k, x in answers.items():
        print(f"  age rating {k} -> {x}")


def notes(version, path):
    """Put the review notes on the version record.

    Apple shows these to the reviewer beside the build. They are where an
    optional sign-in, an absent advertising SDK and a deletion path get
    explained before somebody has to guess."""
    aid, _ = app_id()
    v = next((x for x in versions(aid) if x["attributes"]["versionString"] == version), None)
    if not v:
        asc.die(f"no version {version} on the record")
    text = open(path).read().strip()
    if len(text) > 4000:
        asc.die(f"review notes are {len(text)} characters; Apple's limit is 4000")
    d = api("GET", f"/appStoreVersions/{v['id']}/appStoreReviewDetail", fatal=False)
    did = ((d or {}).get("data") or {}).get("id")
    if did:
        api("PATCH", f"/appStoreReviewDetails/{did}", {"data": {
            "type": "appStoreReviewDetails", "id": did,
            "attributes": {"notes": text}}})
    else:
        api("POST", "/appStoreReviewDetails", {"data": {
            "type": "appStoreReviewDetails",
            "attributes": {"notes": text},
            "relationships": {"appStoreVersion": {
                "data": {"type": "appStoreVersions", "id": v["id"]}}}}})
    print(f"review notes -> {version} ({len(text)} chars, {len(text.splitlines())} lines)")
    first = next((l for l in text.splitlines() if l.strip()), "")
    print(f"  opens with: {first[:78]}")


def rename(old, new):
    """Renumber a version record that has not shipped.

    Only one version can sit in PREPARE_FOR_SUBMISSION at a time, so when a
    release is withdrawn and replaced by a better one, the record is renumbered
    rather than abandoned — otherwise the new version cannot be created at all."""
    aid, _ = app_id()
    v = next((x for x in versions(aid) if x["attributes"]["versionString"] == old), None)
    if not v:
        asc.die(f"no version {old} on the record")
    st = v["attributes"]["appStoreState"]
    editable = {"PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED",
                "METADATA_REJECTED", "INVALID_BINARY"}
    if st not in editable:
        asc.die(f"version {old} is {st} — withdraw it first, and give Apple a minute to finish")
    if any(x["attributes"]["versionString"] == new for x in versions(aid)):
        asc.die(f"version {new} already exists")
    api("PATCH", f"/appStoreVersions/{v['id']}", {"data": {
        "type": "appStoreVersions", "id": v["id"],
        "attributes": {"versionString": new}}})
    print(f"version {old} is now {new} (id {v['id']}, was {st})")


def withdraw(yes=False):
    """Cancel the review submission that is queued but not yet being reviewed.

    Apple lets a submission be cancelled right up until a reviewer opens it;
    after that the browser is the only way. Cancelling returns every version in
    the submission to PREPARE_FOR_SUBMISSION, which is what makes it possible to
    supersede one release with a better one instead of shipping both."""
    aid, _ = app_id()
    subs = api("GET", f"/apps/{aid}/reviewSubmissions", params={"limit": "10"},
               fatal=False) or {"data": []}
    live = [s for s in subs["data"]
            if s["attributes"].get("state") in
            ("WAITING_FOR_REVIEW", "READY_FOR_REVIEW", "UNRESOLVED_ISSUES")]
    if not live:
        print("nothing queued — no submission to withdraw")
        return
    for sub in live:
        st = sub["attributes"].get("state")
        items = api("GET", f"/reviewSubmissions/{sub['id']}/items",
                    params={"limit": "10", "include": "appStoreVersion"}, fatal=False) or {}
        names = [i["attributes"].get("versionString", "?")
                 for i in (items.get("included") or [])]
        print(f"submission {sub['id']} is {st}" + (f" — holding {', '.join(names)}" if names else ""))
        if st == "IN_REVIEW":
            print("  a reviewer already has it; cancel this one in the browser")
            continue
        if not yes:
            if input("  type yes to pull it back: ").strip().lower() != "yes":
                print("  left alone")
                continue
        r = api("PATCH", f"/reviewSubmissions/{sub['id']}", {"data": {
            "type": "reviewSubmissions", "id": sub["id"],
            "attributes": {"canceled": True}}}, fatal=False)
        state = ((r or {}).get("data", {}).get("attributes", {}) or {}).get("state")
        print(f"  withdrawn: state {state or 'unknown — re-run status to confirm'}")


def submit(version, yes=False):
    aid, _ = app_id()
    v = next((x for x in versions(aid) if x["attributes"]["versionString"] == version), None)
    if not v:
        asc.die(f"no version {version} on the record")
    st = v["attributes"]["appStoreState"]
    if st not in ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED",
                  "METADATA_REJECTED", "INVALID_BINARY"):
        asc.die(f"version {version} is {st} — nothing to submit")
    b = api("GET", f"/appStoreVersions/{v['id']}/build", fatal=False)
    bd = (b or {}).get("data")
    if not bd:
        asc.die("no build is attached — run `stage` first")
    print(f"about to submit {version} with build {bd['attributes']['version']} for review.")
    if not yes:
        if input("type yes to send it: ").strip().lower() != "yes":
            print("not submitted")
            return
    subs = api("GET", f"/apps/{aid}/reviewSubmissions", params={"limit": "10"},
               fatal=False) or {"data": []}
    open_sub = next((s for s in subs["data"]
                     if s["attributes"].get("state") in ("READY_FOR_REVIEW", "UNRESOLVED_ISSUES")), None)
    if open_sub:
        sid = open_sub["id"]
        print(f"re-using open review submission {sid}")
    else:
        sid = api("POST", "/reviewSubmissions", {"data": {
            "type": "reviewSubmissions",
            "attributes": {"platform": "IOS"},
            "relationships": {"app": {"data": {"type": "apps", "id": aid}}}}})["data"]["id"]
        print(f"review submission {sid} created")
    items = api("GET", f"/reviewSubmissions/{sid}/items", params={"limit": "10"},
                fatal=False) or {"data": []}
    if not items["data"]:
        api("POST", "/reviewSubmissionItems", {"data": {
            "type": "reviewSubmissionItems",
            "relationships": {
                "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sid}},
                "appStoreVersion": {"data": {"type": "appStoreVersions", "id": v["id"]}}}}})
        print(f"  version {version} added to the submission")
    r = api("PATCH", f"/reviewSubmissions/{sid}", {"data": {
        "type": "reviewSubmissions", "id": sid, "attributes": {"submitted": True}}})
    print(f"  submitted: state {r['data']['attributes'].get('state')}")
    print("\nWatch it at https://appstoreconnect.apple.com/apps")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "status":
        status()
    elif cmd == "stage":
        stage(sys.argv[2], sys.argv[3],
              whatsnew_file=(sys.argv[4] if len(sys.argv) > 4 else None),
              copyright_txt=(sys.argv[5] if len(sys.argv) > 5 else None))
    elif cmd == "agerating":
        agerating(sys.argv[2], **json.loads(sys.argv[3]))
    elif cmd == "submit":
        submit(sys.argv[2], yes="--yes" in sys.argv)
    elif cmd == "withdraw":
        withdraw(yes="--yes" in sys.argv)
    elif cmd == "rename":
        rename(sys.argv[2], sys.argv[3])
    elif cmd == "notes":
        notes(sys.argv[2], sys.argv[3])
    else:
        print(__doc__)
