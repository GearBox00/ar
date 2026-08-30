/*
 * スマホの実機で確認するためのhttps配信。
 *   node tools/serve-https.js
 *
 * カメラを使うページは、httpsでないとブラウザが拒否する。
 * Tailscaleが発行した証明書を使うため、「安全ではありません」の警告は出ない。
 * 同じTailscaleに入っている端末からのみ見られる。
 * 端末名は tools/host.txt に書く（Gitには入れない）。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.env.PORT || '8851', 10);

// 端末名は公開したくないので、リポジトリには入れず tools/host.txt から読む。
// 環境変数 AR_HOST でも渡せる。
const HOST_FILE = path.join(__dirname, 'host.txt');
const HOST = (process.env.AR_HOST || (fs.existsSync(HOST_FILE) ? fs.readFileSync(HOST_FILE, 'utf8') : '')).trim();
if (!HOST) {
  console.error('配信するホスト名が分かりません。');
  console.error('  tools/host.txt.example を tools/host.txt にコピーし、');
  console.error('  ご自分のTailscaleの端末名（例: 端末名.テイルネット名.ts.net）を1行で書いてください。');
  console.error('  端末名は tailscale status で確認できます。');
  process.exit(1);
}

const CERT_DIR = process.env.AR_CERT_DIR || 'E:/claude_projects';
const CERT = path.join(CERT_DIR, HOST + '.crt');
const KEY  = path.join(CERT_DIR, HOST + '.key');

for (const f of [CERT, KEY]) {
  if (!fs.existsSync(f)) {
    console.error('証明書が見つかりません: ' + f);
    console.error('発行する場合: tailscale cert ' + HOST);
    process.exit(1);
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.usdz': 'model/vnd.usdz+zip',
  '.mind': 'application/octet-stream',
};

// このフォルダの外を読ませない。
// URLに .. を混ぜると上位フォルダのファイルが読めてしまう事故があったため、
// 解決後のパスがROOTの内側にあることを必ず確かめる。
function resolveInsideRoot(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch (e) { return null; }
  if (decoded.indexOf(String.fromCharCode(0)) !== -1) return null;
  const BS = String.fromCharCode(92);
  let clean = decoded.split(BS).join('/');
  while (clean.startsWith('/')) clean = clean.slice(1);
  const p = path.resolve(ROOT, '.' + path.sep + clean);
  if (p !== ROOT && !p.startsWith(ROOT + path.sep)) return null;
  return p;
}

// 待ち受けはTailscaleのアドレスだけに絞る。
// 0.0.0.0 で待つと、同じ無線LANにいる他人の端末からも届いてしまう。
function listenAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ni.address)) {
        return { host: ni.address, scope: 'Tailscale内のみ (' + name + ')' };
      }
    }
  }
  return { host: '127.0.0.1', scope: 'このPC内のみ（Tailscaleが見つかりませんでした）' };
}

const server = https.createServer(
  { cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) },
  (req, res) => {
    const deny = () => {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('見つかりません');
    };
    let p = resolveInsideRoot(req.url.split('?')[0]);
    if (p === null) return deny();
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    fs.readFile(p, (e, buf) => {
      if (e) return deny();
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(buf);
    });
  });

const addr = listenAddress();
server.listen(PORT, addr.host, () => {
  console.log('配信を開始しました（' + addr.scope + '）');
  console.log('  スマホから: https://' + HOST + ':' + PORT + '/');
  console.log('  このPCから: https://' + addr.host + ':' + PORT + '/');
  console.log('止めるときは Ctrl+C');
});
