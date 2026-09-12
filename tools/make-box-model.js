/*
 * パッケージ（箱）の3Dモデルを作る。印刷会社向けの「刷り上がりを原寸で置く」用。
 *   node tools/make-box-model.js                       → 小・中・大の3つを作る
 *   node tools/make-box-model.js --one 0.3,0.2,0.12 --name box-custom --label "化粧箱"
 *
 * 出力は place/assets/<name>.glb と .usdz。
 * あわせて place/models.json に項目を足す（同じ名前があれば置き換える）。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('./_playwright');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'place', 'assets');
const LIST = path.join(ROOT, 'place', 'models.json');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

// 既定の3種類（幅, 高さ, 奥行 m）
const DEFAULTS = [
  { name: 'box-s', label: '小箱（名刺サイズ）', w: 0.12, h: 0.06, d: 0.08 },
  { name: 'box-m', label: '中箱（ギフト箱）',   w: 0.25, h: 0.10, d: 0.18 },
  { name: 'box-l', label: '大箱（配送箱）',     w: 0.40, h: 0.25, d: 0.30 },
];
let jobs = DEFAULTS;
if (opt('one', null)) {
  const [w, h, d] = opt('one').split(',').map(Number);
  jobs = [{ name: opt('name', 'box-custom'), label: opt('label', 'パッケージ'), w, h, d }];
}

const STATIC = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
function serve(root) {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
      let p = null;
      try {
        const BS = String.fromCharCode(92);
        let u = decodeURIComponent(req.url.split('?')[0]).split(BS).join('/');
        while (u.startsWith('/')) u = u.slice(1);
        const r = path.resolve(root, '.' + path.sep + u);
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

  let list = [];
  if (fs.existsSync(LIST)) { try { list = JSON.parse(fs.readFileSync(LIST, 'utf8')); } catch (e) { list = []; } }

  for (const j of jobs) {
    const out = await page.evaluate((o) => window.buildBoxAndExport(o), {
      wordUrl: `http://127.0.0.1:${port}/place/assets/logo-lockup.png`,
      w: j.w, h: j.h, d: j.d, name: j.name,
    });
    const glb = path.join(ASSETS, j.name + '.glb');
    const usdz = path.join(ASSETS, j.name + '.usdz');
    fs.writeFileSync(glb, Buffer.from(out.glb, 'base64'));
    fs.writeFileSync(usdz, Buffer.from(out.usdz, 'base64'));
    console.log(`${j.label}: ${out.size.w} x ${out.size.h} x ${out.size.d} m  glb ${fs.statSync(glb).size}B / usdz ${fs.statSync(usdz).size}B`);

    const entry = { name: j.name, label: j.label, glb: `./assets/${j.name}.glb`, usdz: `./assets/${j.name}.usdz`,
      size: out.size, note: `幅${out.size.w}m × 高さ${out.size.h}m × 奥行${out.size.d}m` };
    const i = list.findIndex((e) => e.name === j.name);
    if (i >= 0) list[i] = entry; else list.push(entry);
  }
  await browser.close();
  server.close();
  if (errs.length) console.error('ページ内のエラー:\n' + errs.join('\n'));

  fs.writeFileSync(LIST, JSON.stringify(list, null, 2) + '\n', 'utf8');
  console.log('models.json を更新しました（' + list.length + '件）');
})();
