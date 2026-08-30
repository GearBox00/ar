/*
 * 床に置く用のロゴ3Dモデルを作る。
 *   node tools/make-logo-model.js
 *
 * place/assets/ に glb と usdz を出す。
 * iPhoneの「ARで見る」はusdzを使い、Androidはglbを使うため、両方が要る。
 *
 * 作り方: three.js の書き出し機能をこのPCのブラウザで走らせている。
 * Blenderも外部サービスも使わない。
 *
 *   --radius 0.25    コインの半径(m)
 *   --thickness 0.06 コインの厚み(m)
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('./_playwright');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const R = parseFloat(opt('radius', '0.25'));
const T = parseFloat(opt('thickness', '0.06'));

const STATIC = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };

function serve(root) {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
      // 配信フォルダの外は読ませない
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
  const { server, port } = await serve(ROOT);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto(`http://127.0.0.1:${port}/tools/model-builder.html`);
  await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });

  const out = await page.evaluate((o) => window.buildAndExport(o), {
    discUrl: `http://127.0.0.1:${port}/place/assets/logo-disc.png`,
    wordUrl: `http://127.0.0.1:${port}/place/assets/logo-lockup.png`,
    coinRadius: R,
    coinThickness: T,
  });

  await browser.close();
  server.close();
  if (errs.length) console.error('ページ内のエラー:\n' + errs.join('\n'));

  const glbPath  = path.join(ROOT, 'place', 'assets', 'gearbox-logo.glb');
  const usdzPath = path.join(ROOT, 'place', 'assets', 'gearbox-logo.usdz');
  fs.writeFileSync(glbPath, Buffer.from(out.glb, 'base64'));
  fs.writeFileSync(usdzPath, Buffer.from(out.usdz, 'base64'));

  console.log('出力:');
  console.log('  ' + glbPath  + '  (' + fs.statSync(glbPath).size + ' bytes)');
  console.log('  ' + usdzPath + '  (' + fs.statSync(usdzPath).size + ' bytes)');
  console.log('実寸: 幅 ' + out.size.w + ' m / 高さ ' + out.size.h + ' m / 奥行 ' + out.size.d + ' m');
  console.log('部品の数: ' + out.meshes);
})();
