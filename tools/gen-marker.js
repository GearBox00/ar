/*
 * ARマーカー用の画像を作る。
 *   node tools/gen-marker.js            → marker/assets/generated/ に3種類を出力
 *   node tools/gen-marker.js --text GEARBOX --seed 7
 *
 * 認識しやすい絵の条件（模様が細かい・非対称・コントラストが強い）を満たすように
 * 図形を配置している。左右対称や単色の広い面は意図的に避けている。
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('./_playwright');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const TEXT = opt('text', 'GEARBOX');
const SEED = parseInt(opt('seed', '20260830'), 10);
const SIZE = parseInt(opt('size', '1024'), 10);
const OUT = path.resolve(opt('out', path.join(__dirname, '..', 'marker', 'assets', 'generated')));

// 同じ種を渡せば同じ絵になる擬似乱数（作り直しの再現性のため）
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const INK = '#111111';
const ACC = '#c8102e';
const SUB = '#2b6cb0';

// 共通の枠。3隅だけに印を置いて、向きが一意に決まるようにする（左右対称を避ける）
function frame(S) {
  const b = S * 0.045;
  return `
    <rect x="0" y="0" width="${S}" height="${S}" fill="#ffffff"/>
    <rect x="${b}" y="${b}" width="${S - b * 2}" height="${S - b * 2}"
          fill="none" stroke="${INK}" stroke-width="${S * 0.028}"/>
    <path d="M${b * 1.9} ${b * 1.9} h${S * 0.16} v${S * 0.034} h-${S * 0.126} v${S * 0.126} h-${S * 0.034} Z" fill="${INK}"/>
    <path d="M${S - b * 1.9} ${b * 1.9} h-${S * 0.10} v${S * 0.034} h${S * 0.066} v${S * 0.082} h${S * 0.034} Z" fill="${ACC}"/>
    <circle cx="${b * 2.6}" cy="${S - b * 2.6}" r="${S * 0.038}" fill="${SUB}"/>
  `;
}

// A: 幾何パターン型
function designA(S) {
  const r = rng(SEED);
  let s = frame(S);
  for (let i = 0; i < 46; i++) {
    const x = S * (0.12 + r() * 0.76), y = S * (0.12 + r() * 0.76);
    const w = S * (0.02 + r() * 0.085);
    const kind = Math.floor(r() * 3);
    const col = [INK, ACC, SUB][Math.floor(r() * 3)];
    if (kind === 0) s += `<rect x="${x}" y="${y}" width="${w}" height="${w * (0.4 + r())}" fill="${col}" transform="rotate(${r() * 90} ${x} ${y})"/>`;
    else if (kind === 1) s += `<circle cx="${x}" cy="${y}" r="${w * 0.5}" fill="none" stroke="${col}" stroke-width="${S * 0.012}"/>`;
    else s += `<path d="M${x} ${y} l${w} ${w * 0.3} l-${w * 0.4} ${w} Z" fill="${col}"/>`;
  }
  s += `<rect x="${S * 0.10}" y="${S * 0.44}" width="${S * 0.80}" height="${S * 0.13}" fill="${INK}"/>`;
  s += `<text x="${S * 0.5}" y="${S * 0.535}" font-family="Arial Black, Arial, sans-serif"
        font-size="${S * 0.093}" font-weight="900" fill="#ffffff" text-anchor="middle"
        letter-spacing="${S * 0.012}">${TEXT}</text>`;
  return s;
}

// B: 高密度ノイズ型（模様が細かいほど認識点は増える）
function designB(S) {
  const r = rng(SEED + 101);
  let s = frame(S);
  const cell = S / 22;
  for (let gy = 2; gy < 20; gy++) {
    for (let gx = 2; gx < 20; gx++) {
      const v = r();
      if (v < 0.42) continue;
      const col = v > 0.86 ? ACC : (v > 0.72 ? SUB : INK);
      const pad = cell * (r() * 0.28);
      s += `<rect x="${gx * cell + pad}" y="${gy * cell + pad}"
             width="${cell - pad * 2}" height="${cell - pad * 2}" fill="${col}"
             transform="rotate(${(r() - 0.5) * 24} ${gx * cell + cell / 2} ${gy * cell + cell / 2})"/>`;
    }
  }
  s += `<rect x="${S * 0.08}" y="${S * 0.40}" width="${S * 0.62}" height="${S * 0.14}" fill="#ffffff" stroke="${INK}" stroke-width="${S * 0.014}"/>`;
  s += `<text x="${S * 0.39}" y="${S * 0.497}" font-family="Arial Black, Arial, sans-serif"
        font-size="${S * 0.088}" font-weight="900" fill="${INK}" text-anchor="middle">${TEXT}</text>`;
  return s;
}

// C: 帯とロゴ型（見た目を整えたい場合向け。認識点はAとBより少なめになりやすい）
function designC(S) {
  const r = rng(SEED + 202);
  let s = frame(S);
  for (let i = 0; i < 13; i++) {
    const y = S * (0.10 + i * 0.062);
    const h = S * (0.008 + r() * 0.03);
    const x = S * (0.08 + r() * 0.16);
    s += `<rect x="${x}" y="${y}" width="${S * (0.28 + r() * 0.55)}" height="${h}" fill="${i % 4 === 0 ? ACC : INK}"/>`;
  }
  for (let i = 0; i < 16; i++) {
    const x = S * (0.14 + r() * 0.7), y = S * (0.14 + r() * 0.7);
    s += `<circle cx="${x}" cy="${y}" r="${S * (0.008 + r() * 0.02)}" fill="${SUB}"/>`;
  }
  s += `<rect x="${S * 0.12}" y="${S * 0.60}" width="${S * 0.66}" height="${S * 0.17}" fill="${INK}"/>`;
  s += `<text x="${S * 0.45}" y="${S * 0.715}" font-family="Arial Black, Arial, sans-serif"
        font-size="${S * 0.105}" font-weight="900" fill="#ffffff" text-anchor="middle">${TEXT}</text>`;
  return s;
}

const DESIGNS = { a: designA, b: designB, c: designC };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
  const made = [];
  for (const [key, fn] of Object.entries(DESIGNS)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${fn(SIZE)}</svg>`;
    const file = path.join(OUT, `marker-${key}.svg`);
    fs.writeFileSync(file, svg);
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    const png = path.join(OUT, `marker-${key}.png`);
    await page.screenshot({ path: png, clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
    made.push(png);
    console.log('作成: ' + png);
  }
  await browser.close();
  console.log('\n次にこれを .mind へ変換します:\n  node tools/compile-mind.js ' + made.map(m => '"' + m + '"').join(' '));
})();
