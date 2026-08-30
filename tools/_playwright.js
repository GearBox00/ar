// このPCにはarフォルダ用のnode_modulesを置いていないため、
// 既存プロジェクトのplaywrightを探して読み込む。
const CANDIDATES = [
  'playwright',
  'E:/claude_projects/app_demo_video/node_modules/playwright',
];
let mod = null;
for (const c of CANDIDATES) {
  try { mod = require(c); break; } catch (e) {}
}
if (!mod) {
  console.error('playwrightが見つかりません。次のいずれかに入れてください:\n' + CANDIDATES.join('\n'));
  process.exit(1);
}
module.exports = mod;
