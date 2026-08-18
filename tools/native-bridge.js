/* The two functions the game asks the native shell for, and nothing else.
 *
 * index.html never imports a store SDK or an ad SDK. It looks for exactly this:
 *
 *     window.BluffIAP.buy(productId) -> Promise<{store, transactionId|token, product}>
 *     window.BluffAds.rewarded()     -> Promise<boolean>   true only if watched
 *
 * Keeping the surface at two functions is what lets the same single file be the
 * web build, the PWA and the app: in a browser neither object exists, `Pay.live`
 * and `Ads.live` are false, the star shelf does not render and the ad button is
 * not offered. No stubs, no dead price tags, no branching in the game.
 *
 * Add to the Capacitor app on the Mac:
 *
 *     npm i cordova-plugin-purchase @capacitor-community/admob
 *     npx cap sync
 *
 * then load this file after the game in ios/App/App/public/index.html, or add
 * it to `dist/` and let `npx cap copy` carry it across.
 *
 * The product identifiers must match server/src/purchases.js, App Store Connect
 * and Play Console character for character. They are the contract; the star
 * amounts are not — those live only on the server, so a patched client can ask
 * to be given a pack and cannot ask to be given forty thousand stars for $1.99.
 */
(function () {
  var IDS = ['gg.bluff.stars.handful', 'gg.bluff.stars.stack', 'gg.bluff.stars.vault'];
  var iap = window.CdvPurchase;
  var admob = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob;
  var isIOS = !!(window.Capacitor && window.Capacitor.getPlatform
                 && window.Capacitor.getPlatform() === 'ios');

  /* ── purchases ─────────────────────────────────────────────────────────── */
  if (iap) {
    var store = iap.store, PT = iap.ProductType, PL = iap.Platform;
    var platform = isIOS ? PL.APPLE_APPSTORE : PL.GOOGLE_PLAY;
    IDS.forEach(function (id) {
      store.register([{ id: id, type: PT.CONSUMABLE, platform: platform }]);
    });

    var pending = {};    // productId -> resolve, so the callback can answer buy()
    store.when()
      .approved(function (tx) {
        /* Do NOT finish the transaction here. It is finished after our server
           has credited it, so a crash between the two means the purchase is
           still owed and still arrives. */
        var id = (tx.products && tx.products[0] && tx.products[0].id) || '';
        var done = pending[id];
        if (!done) return;
        delete pending[id];
        done(isIOS
          ? { store: 'apple', transactionId: String(tx.transactionId || tx.purchaseId || '') }
          : { store: 'google', product: id, token: String(tx.purchaseToken || '') });
        /* the game calls back into here once the server has said yes */
        window.__bluffFinish = function () { try { tx.finish(); } catch (e) {} };
      })
      .receiptUpdated(function () { /* restore path — the server dedupes */ });

    store.error(function (e) {
      Object.keys(pending).forEach(function (k) { var f = pending[k]; delete pending[k]; f(null); });
      console.log('[iap] ' + (e && e.message));
    });
    store.initialize([platform]);

    window.BluffIAP = {
      buy: function (id) {
        return new Promise(function (resolve, reject) {
          var offer = store.get(id, platform) && store.get(id, platform).getOffer();
          if (!offer) return reject(new Error('that pack is not available right now'));
          pending[id] = resolve;
          offer.order().catch(function (e) { delete pending[id]; reject(e); });
        });
      },
      /* called by the game once /v1/purchase/verify has credited the stars */
      finish: function () { if (window.__bluffFinish) window.__bluffFinish(); },
    };
  }

  /* ── rewarded video ────────────────────────────────────────────────────── */
  if (admob) {
    /* Test ids. Swap for the real unit ids before shipping — a live build
       serving test ads earns nothing, and a test build serving live ads is how
       an AdMob account gets suspended for invalid traffic. */
    var UNIT = isIOS ? 'ca-app-pub-3940256099942544/1712485313'
                     : 'ca-app-pub-3940256099942544/5224354917';
    var started = admob.initialize({ initializeForTesting: false }).catch(function () {});

    /* Apple's tracking prompt, asked once, at the only moment it is ever going
     * to be said yes to: the player has just chosen to watch an ad in exchange
     * for a stake, so the ask has a reason attached to it. Firing it at cold
     * launch is what drives opt-in into the teens — the prompt arrives before
     * the person knows what the app is, and No is the safe answer to a stranger.
     *
     * A No is fine. AdMob serves non-personalised ads instead, which pay less
     * and still pay; nothing in the game is gated on the answer. The one thing
     * that must not happen is asking twice, which iOS ignores anyway but which
     * looks broken. */
    var asked = null;
    function askOnce() {
      if (!isIOS || !admob.requestTrackingAuthorization) return Promise.resolve();
      if (!asked) asked = admob.trackingAuthorizationStatus()
        .then(function (s) {
          return s && s.status === 'notDetermined'
            ? admob.requestTrackingAuthorization() : null;
        })
        .catch(function () {});
      return asked;
    }

    window.BluffAds = {
      rewarded: function () {
        return started.then(askOnce).then(function () {
          return admob.prepareRewardVideoAd({ adId: UNIT })
            .then(function () { return admob.showRewardVideoAd(); })
            /* the resolve carries the reward only when it was actually earned;
               closing early resolves without one, and the game pays nothing */
            .then(function (r) { return !!(r && (r.type || r.amount)); })
            .catch(function () { return false; });
        });
      },
    };
  }
})();
