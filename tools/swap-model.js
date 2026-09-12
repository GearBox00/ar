/*
 * ②「床に置く」の中身を、別の3Dモデルへ差し替える。
 *   node tools/swap-model.js 手持ちのモデル.glb
 *   node tools/swap-model.js chair.glb --name chair --height 0.85 --label "サンプルの椅子"
 *
 * やること:
 *   1. GLBを place/assets/ へコピー
 *   2. iPhoneのAR表示に要る usdz を作る（three.js の書き出し機能をこのPCで走らせる）
 *   3. place/models.json（置くものの一覧）に加える。ページはこの一覧から読む
 *
 *   --height  いちばん長い辺を何メートルにするか（省略すると元の寸法のまま）
 *   --name    出力するファイル名（既定は元のファイル名）
 *   --label   一覧に出す名前
 *   --default 最初に選ばれた状態にする
 *   --dry     一覧を書き換えずに、変換結果だけ見る
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('./_playwright');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes('--' + n);

const input = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
if (!input) {
  console.error('使い方: node tools/swap-model.js <モデル.glb> [--height 0.85] [--name chair] [--label "説明"]');
  process.exit(1);
}
if (!fs.existsSync(input)) { console.error('見つかりません: ' + input); process.exit(1); }
if (path.extname(input).toLowerCase() !== '.glb') {
  console.error('glb形式のファイルを渡してください（gltfやfbxは未対応です）。');
  console.error('Blenderをお使いの場合は「glTF Binary (.glb)」で書き出してください。');
  process.exit(1);
}

const NAME   = opt('name', path.basename(input, '.glb'));
const HEIGHT = opt('height', null);
const LABEL  = opt('label', null);
const ASSETS = path.join(ROOT, 'place', 'assets');

const STATIC = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.glb': 'model/gltf-binary' };

function serve(root) {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
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
  fs.mkdirSync(ASSETS, { recursive: true });
  const glbOut  = path.join(ASSETS, NAME + '.glb');
  const usdzOut = path.join(ASSETS, NAME + '.usdz');
  fs.copyFileSync(input, glbOut);

  const { server, port } = await serve(ROOT);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto(`http://127.0.0.1:${port}/tools/converter.html`);
  await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });

  let out;
  try {
    out = await page.evaluate(([u, h]) => window.convert(u, h),
      [`http://127.0.0.1:${port}/place/assets/${NAME}.glb`, HEIGHT ? parseFloat(HEIGHT) : null]);
  } catch (e) {
    console.error('変換に失敗しました: ' + e.message);
    if (errs.length) console.error(errs.join('\n'));
    await browser.close(); server.close();
    process.exit(1);
  }
  await browser.close();
  server.close();

  fs.writeFileSync(usdzOut, Buffer.from(out.usdz, 'base64'));

  console.log('変換しました');
  console.log('  ' + glbOut  + '  (' + fs.statSync(glbOut).size + ' bytes)');
  console.log('  ' + usdzOut + '  (' + fs.statSync(usdzOut).size + ' bytes)');
  console.log('  元の寸法  : 幅 ' + out.before.w + ' / 高さ ' + out.before.h + ' / 奥行 ' + out.before.d + ' m');
  console.log('  置いた寸法: 幅 ' + out.after.w + ' / 高さ ' + out.after.h + ' / 奥行 ' + out.after.d + ' m');
  console.log('  部品 ' + out.meshes + '個（うち模様つき ' + out.textured + '個）');

  if (flag('dry')) { console.log('\n--dry のため、ページは書き換えていません。'); return; }

  // 置くものの一覧（place/models.json）に加える。ページは一覧から読むので、ここに足せば選べるようになる
  const listPath = path.join(ROOT, 'place', 'models.json');
  let list = [];
  if (fs.existsSync(listPath)) { try { list = JSON.parse(fs.readFileSync(listPath, 'utf8')); } catch (e) { list = []; } }
  const entry = {
    name: NAME,
    label: LABEL || NAME,
    glb: './assets/' + NAME + '.glb',
    usdz: './assets/' + NAME + '.usdz',
    size: out.after,
    note: '幅' + out.after.w + 'm × 高さ' + out.after.h + 'm × 奥行' + out.after.d + 'm',
  };
  const idx = list.findIndex((e) => e.name === NAME);
  if (idx >= 0) list[idx] = entry; else list.push(entry);
  if (flag('default')) { list = [entry].concat(list.filter((e) => e.name !== NAME)); }
  fs.writeFileSync(listPath, JSON.stringify(list, null, 2) + String.fromCharCode(10), 'utf8');
  console.log('');
  console.log('place/models.json に「' + entry.label + '」を加えました（' + list.length + '件）。');
  if (!flag('default')) console.log('最初に選ばれた状態にするには --default を付けてください。');
  console.log('公開するには: git add -A && git commit && git push');
})();
