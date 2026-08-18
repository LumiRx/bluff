"""What a rewarded ad actually looks like, in three frames.

The middle frame is not ours. Once `BluffAds.rewarded()` is called, the whole
screen belongs to Google's rewarded unit and we get it back when it closes.
So it is drawn here as what it is — Google's chrome around an advertiser's
creative — rather than as a design we could change. The advertiser's content is
a neutral placeholder because we do not choose it and cannot preview it.
"""
import json, os
W, H = 414, 896
HERE = os.path.dirname(os.path.abspath(__file__))

AD = """<!doctype html><meta charset=utf-8>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:%(W)spx;height:%(H)spx;overflow:hidden;background:#000}
body{font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;position:relative;color:#fff}
/* the advertiser's creative — we neither choose it nor see it in advance */
.creative{position:absolute;inset:0;background:
  linear-gradient(160deg,#2b3550,#161b28 55%%,#0d1017);
  display:flex;align-items:center;justify-content:center;flex-direction:column}
.creative .ph{width:150px;height:150px;border-radius:32px;
  background:linear-gradient(140deg,#3d4a66,#2a3244);border:1px solid #46536e;
  display:flex;align-items:center;justify-content:center;
  font-size:13px;letter-spacing:.14em;color:#7d8aa6;text-align:center;padding:0 14px}
.creative p{margin-top:26px;font-size:15px;color:#69748e;letter-spacing:.05em}
/* Google's chrome, drawn as it behaves rather than as we would like it */
.top{position:absolute;top:0;left:0;right:0;height:58px;display:flex;
  align-items:center;justify-content:space-between;padding:0 14px;
  background:linear-gradient(rgba(0,0,0,.55),transparent)}
.badge{font-size:11px;font-weight:800;letter-spacing:.1em;background:#f5c518;
  color:#111;padding:3px 7px;border-radius:3px}
.reward{font-size:13px;color:#e7e9ee;background:rgba(0,0,0,.45);
  padding:6px 12px;border-radius:16px}
.x{width:30px;height:30px;border-radius:50%%;background:rgba(0,0,0,.5);
  display:flex;align-items:center;justify-content:center;font-size:17px;color:#dfe3ea}
.bottom{position:absolute;left:0;right:0;bottom:0;padding:20px 18px 34px;
  background:linear-gradient(transparent,rgba(0,0,0,.8) 45%%)}
.cta{display:block;width:100%%;padding:15px;border-radius:10px;background:#1a73e8;
  color:#fff;font-size:16px;font-weight:700;text-align:center}
.bar{position:absolute;left:0;bottom:0;height:3px;background:#f5c518;width:%(PROG)s%%}
.note{position:absolute;left:0;right:0;bottom:118px;text-align:center;
  font-size:11px;letter-spacing:.16em;color:#8a93a8}
</style>
<div class=creative><div class=ph>ADVERTISER<br>CREATIVE</div>
  <p>chosen by Google, not by us</p></div>
<div class=top><span class=badge>AD</span>
  <span class=reward>%(REWARD)s</span><span class=x>&times;</span></div>
<div class=note>GOOGLE ADMOB REWARDED &middot; FULL SCREEN</div>
<div class=bottom><span class=cta>Install</span></div>
<div class=bar></div>
"""

if __name__ == "__main__":
    plan = []
    for i, (reward, prog) in enumerate(
            [("Reward in 0:23", 22), ("Reward in 0:04", 87)], 1):
        html = AD % dict(W=W, H=H, REWARD=reward, PROG=prog)
        page = os.path.join(HERE, f"ad-{i}.html")
        open(page, "w").write(html)
        plan.append({"page": page, "w": W, "h": H,
                     "out": os.path.join(HERE, f"ux-ad-{i}.png")})
    open(os.path.join(HERE, "adplan.json"), "w").write(json.dumps(plan))
    print(f"{len(plan)} ad frames")
