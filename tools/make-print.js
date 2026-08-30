/*
 * 印刷用のマーカーPDFを作る。
 *   node tools/make-print.js
 *
 * A4に1枚ずつ、大きさの違うマーカーを並べる（既定は 150 / 100 / 60 mm）。
 * どの大きさなら何メートル離れて読めるかを、実物で測るための紙。
 * 各ページに公開URLのQRコードを入れる。
 *
 *   --sizes 150,100,60   マーカーの一辺(mm)
 *   --url   https://...  QRコードにするURL
 *   --out   print/markers.pdf
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('./_playwright');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

const SIZES = opt('sizes', '150,100,60').split(',').map((v) => parseFloat(v.trim()));
const URL_  = opt('url', 'https://gearbox00.github.io/ar/marker/');
const OUT   = path.resolve(opt('out', path.join(ROOT, 'print', 'markers.pdf')));
const MARKER = path.join(ROOT, 'marker', 'assets', 'marker.png');

if (!fs.existsSync(MARKER)) {
  console.error('マーカー画像が見つかりません: ' + MARKER);
  console.error('先に node tools/gen-marker.js を実行してください。');
  process.exit(1);
}

const markerDataUri = 'data:image/png;base64,' + fs.readFileSync(MARKER).toString('base64');
const qrLib = fs.readFileSync(path.join(__dirname, 'vendor', 'qrcode.js'), 'utf8');

function buildHtml() {
  const pages = SIZES.map((mm) => `
    <section class="page">
      <header>
        <div class="title">
          <h1>ARマーカー</h1>
          <p class="size">一辺 ${mm} mm</p>
        </div>
        <div class="qr">
          <div class="qr-img" data-url="${URL_}"></div>
          <p class="qr-cap">読み取ってページを開く</p>
        </div>
      </header>

      <div class="marker-wrap">
        <div class="cut" style="width:${mm + 10}mm; height:${mm + 10}mm;">
          <img class="marker" src="${markerDataUri}" style="width:${mm}mm; height:${mm}mm;" alt="">
        </div>
        <p class="cut-note">点線で切り取ると一辺 ${mm + 10} mm になります</p>
      </div>

      <footer>
        <div class="notes">
          <p><b>印刷するとき</b></p>
          <p>1. 用紙サイズはA4、倍率は「実際のサイズ（100%）」にしてください。「用紙に合わせる」にすると寸法が変わります。</p>
          <p>2. 光沢紙は照明が反射して読み取りにくくなります。ふつうのコピー用紙かマット紙をお使いください。</p>
          <p>3. 平らな面に置いてください。丸まった紙は歪んで認識しにくくなります。</p>
        </div>
        <div class="record">
          <p><b>認識できた距離の記録</b></p>
          <p>もっとも遠くで認識できた距離　　　　　 m</p>
          <p>斜めから認識できた角度　　　　　　　　 度</p>
          <p>試した端末　　　　　　　　　　　　　　　　</p>
        </div>
      </footer>
      <p class="url">${URL_}</p>
    </section>`).join('\n');

  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Yu Gothic", "Meiryo", system-ui, sans-serif; color: #111; }
  .page {
    width: 210mm; height: 297mm; padding: 14mm 14mm 10mm;
    display: flex; flex-direction: column; page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }
  header { display: flex; justify-content: space-between; align-items: flex-start; }
  h1 { font-size: 15pt; margin: 0 0 1mm; }
  .size { font-size: 11pt; margin: 0; color: #444; }
  .qr { text-align: center; }
  .qr-img svg { width: 24mm; height: 24mm; display: block; }
  .qr-cap { font-size: 7.5pt; margin: 1mm 0 0; color: #444; }

  .marker-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .cut {
    border: 1px dashed #999; display: flex; align-items: center; justify-content: center;
  }
  .marker { display: block; }
  .cut-note { font-size: 8pt; color: #666; margin: 3mm 0 0; }

  footer { display: flex; gap: 8mm; border-top: 0.4mm solid #ddd; padding-top: 4mm; }
  footer p { margin: 0 0 1.5mm; font-size: 8.5pt; line-height: 1.7; }
  .notes { flex: 1.5; }
  .record { flex: 1; }
  .record p { border-bottom: 0.3mm solid #ccc; padding-bottom: 1mm; }
  .record p:first-child { border-bottom: none; }
  .url { font-size: 7.5pt; color: #888; margin: 3mm 0 0; text-align: right; }
</style></head>
<body>
${pages}
<script>${qrLib}</script>
<script>
  document.querySelectorAll('.qr-img').forEach(function (el) {
    var qr = qrcode(0, 'M');
    qr.addData(el.dataset.url);
    qr.make();
    el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  });
  window.__qrReady = true;
</script>
</body></html>`;
}

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const html = buildHtml();
  const htmlPath = path.join(path.dirname(OUT), 'markers.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__qrReady === true, { timeout: 15000 });

  // 寸法が指定どおりに出ているかを、描画結果から測る（96dpi換算 1mm = 3.7795px）
  const measured = await page.evaluate(() =>
    [...document.querySelectorAll('.marker')].map((m) => +(m.getBoundingClientRect().width / 3.779527559).toFixed(2)));

  await page.pdf({ path: OUT, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await browser.close();

  console.log('出力: ' + OUT + '  (' + fs.statSync(OUT).size + ' bytes)');
  console.log('中間のHTML: ' + htmlPath);
  console.log('指定した大きさ: ' + SIZES.join(', ') + ' mm');
  console.log('描画された大きさ: ' + measured.join(', ') + ' mm');
  console.log('QRコードのURL: ' + URL_);
})();
