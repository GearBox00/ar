/*
 * 計測を送る。読み込むだけで「開いた(view)」を送り、window.arTrack(種類, 補足) で他の出来事を送る。
 *   <script src="../assets/track.js" data-page="marker"></script>
 *
 * 送るのは「何が・どのページで・どの訪問で」だけ。氏名や端末IDは送らない。
 * 訪問の識別子はブラウザを閉じると消える（sessionStorage）。
 * 送り先が無いとき（手元で開いたとき等）は黙って何もしない。
 */
(function () {
  var script = document.currentScript;
  var PAGE = (script && script.getAttribute('data-page')) || 'index';
  var EP = (typeof window.AR_TRACK_ENDPOINT === 'string')
    ? window.AR_TRACK_ENDPOINT
    : 'https://gearbox-app-origin.net/ar-api/track.php';

  function rand() {
    var a = new Uint8Array(12);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    var s = '';
    for (var j = 0; j < a.length; j++) s += (a[j] < 16 ? '0' : '') + a[j].toString(16);
    return s;
  }
  var sid = '';
  try {
    sid = sessionStorage.getItem('ar_sid') || '';
    if (!sid) { sid = rand(); sessionStorage.setItem('ar_sid', sid); }
  } catch (e) { sid = rand(); }

  var once = {};
  var sent = [];   // 検証用に、送った内容を控えておく

  window.arTrack = function (ev, extra, opts) {
    if (!EP) return;
    extra = extra || '';
    if (opts && opts.once) {
      var k = ev + '|' + extra;
      if (once[k]) return;
      once[k] = true;
    }
    var body = JSON.stringify({ ev: ev, page: PAGE, sid: sid, extra: extra });
    sent.push({ ev: ev, extra: extra });
    try {
      // Content-Type を text/plain にすると、ブラウザが事前確認(preflight)を送らずに済む
      fetch(EP, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body,
                  keepalive: true, mode: 'cors', credentials: 'omit' }).catch(function () {});
    } catch (e) {}
  };
  window.__arTrackLog = sent;

  window.arTrack('view');
})();
