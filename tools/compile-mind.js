/*
 * 画像から MindAR の認識ファイル(.mind)を作る。
 *   node tools/compile-mind.js path/to/marker.png
 *   node tools/compile-mind.js a.png b.png --out marker/assets/targets.mind
 *
 * 変換処理はMindAR本体（tools/vendor/）をこのPCのブラウザで走らせて行う。
 * 外部の変換サイトへ画像を送らないため、未公開の素材でも使える。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('./_playwright');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const OUT = path.resolve(outIdx >= 0 ? argv[outIdx + 1] : path.join(ROOT, 'marker', 'assets', 'targets.mind'));
const inputs = argv.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || (i !== outIdx + 1)));

if (inputs.length === 0) {
  console.error('使い方: node tools/compile-mind.js <画像ファイル...> [--out 出力先.mind]');
  process.exit(1);
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const STATIC = { '.html': 'text/html', '.js': 'text/javascript', '.mind': 'application/octet-stream' };

// 変換ページはモジュールを読むため、file:// では動かない。専用の簡易サーバーを立てる。
function serve(root) {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
      // 公開フォルダの外を読ませない（serve-https.js と同じ理由）
      let p = null;
      try {
        const BS = String.fromCharCode(92);
        let d = decodeURIComponent(req.url.split('?')[0]).split(BS).join('/');
        while (d.startsWith('/')) d = d.slice(1);
        const r = path.resolve(root, '.' + path.sep + d);
        if (r === root || r.startsWith(root + path.sep)) p = r;
      } catch (e) {}
      if (p === null) { rq.writeHead(404); return rq.end('nf'); }
      fs.readFile(p, (e, buf) => {
        if (e) { rq.writeHead(404); return rq.end('nf'); }
        rq.writeHead(200, { 'Content-Type': STATIC[path.extname(p)] || 'application/octet-stream' });
        rq.end(buf);
      });
    });
    s.listen(0, '127.0.0.1', () => res({ server: s, port: s.address().port }));
  });
}

(async () => {
  for (const f of inputs) {
    if (!fs.existsSync(f)) { console.error('見つかりません: ' + f); process.exit(1); }
  }
  const sources = inputs.map((f) => {
    const ext = path.extname(f).toLowerCase();
    if (!MIME[ext]) { console.error('対応していない形式です: ' + f); process.exit(1); }
    return 'data:' + MIME[ext] + ';base64,' + fs.readFileSync(f).toString('base64');
  });

  const { server, port } = await serve(ROOT);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(`http://127.0.0.1:${port}/tools/compiler.html`);
  await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });

  console.log('変換中… 画像1枚あたり数十秒かかります');
  const result = await page.evaluate((s) => window.compile(s), sources);

  await browser.close();
  server.close();

  if (pageErrors.length) console.error('ページ内のエラー:\n' + pageErrors.join('\n'));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(result.base64, 'base64'));

  console.log('\n出力: ' + OUT + '  (' + fs.statSync(OUT).size + ' bytes)');
  console.log('\n認識点の数（多いほど、また各段階に散らばっているほど認識しやすい）');
  result.stats.forEach((st, i) => {
    console.log(`  [${i}] ${path.basename(inputs[i])}  ${st.size}  合計 ${st.total}点`);
    console.log('       段階別: ' + st.scales.map((s) => s.points).join(', '));
  });
})();
