#!/usr/bin/env bash
# 計測API を Xサーバーへ転送する
#
#   bash server/deploy.sh          … 何をするかを表示するだけ（転送しない）
#   bash server/deploy.sh --apply  … 実際に転送する
#
# 注意（filedrop案件で踏んだ罠）:
#   - scp のポート指定は -P（大文字）。ssh の -p を使い回すと失敗する
#   - サーバーに rsync は入っていないので scp を使う
#   - 設定ファイル（塩と閲覧キー）は public_html の外に置く

set -euo pipefail

KEY="/c/lanch/.ssh/d2diver.key"
HOST="d2diver@d2diver.xsrv.jp"
PORT="10022"

APP_DIR="/home/d2diver/gearbox-app-origin.net/public_html/ar-api"
DATA_DIR="/home/d2diver/gearbox-app-origin.net/ar-data"
URL_BASE="https://gearbox-app-origin.net/ar-api/"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPLY=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    *) echo "不明なオプション: $arg" >&2; exit 1 ;;
  esac
done

SSH="ssh -i $KEY -p $PORT -o BatchMode=yes"
SCP="scp -i $KEY -P $PORT -o BatchMode=yes -q"

if [ ! -f "$ROOT/server/config.local.php" ]; then
  echo "server/config.local.php がありません。server/config.sample.php をコピーして作ってください。" >&2
  exit 1
fi

# 本番用の設定: 手元確認用の localhost の行は外す
PROD_CONF="$(mktemp)"
grep -v "localhost" "$ROOT/server/config.local.php" > "$PROD_CONF"

echo "== 転送するもの =="
echo "  $ROOT/server/ar-api/{track.php,stats.php,.htaccess}  ->  $HOST:$APP_DIR/"
echo "  $ROOT/server/config.local.php（localhost行を除く）      ->  $HOST:$DATA_DIR/config.php"
echo "  公開URL: ${URL_BASE}track.php（送信先） / ${URL_BASE}stats.php?key=...（集計）"
echo

if [ "$APPLY" -ne 1 ]; then
  echo "確認のみです。実際に転送するには --apply を付けてください。"
  rm -f "$PROD_CONF"
  exit 0
fi

echo "[1/4] フォルダを用意"
$SSH "$HOST" "mkdir -p '$APP_DIR' '$DATA_DIR' && chmod 700 '$DATA_DIR'"

echo "[2/4] 既存を退避"
$SSH "$HOST" "
  if [ -f '$APP_DIR/track.php' ]; then
    mkdir -p '$DATA_DIR/backup' && cp -a '$APP_DIR' '$DATA_DIR/backup/ar-api_\$(date +%Y%m%d-%H%M%S)'
  fi
"

echo "[3/4] 転送"
$SCP "$ROOT/server/ar-api/track.php" "$ROOT/server/ar-api/stats.php" "$ROOT/server/ar-api/.htaccess" "$HOST:$APP_DIR/"
$SCP "$PROD_CONF" "$HOST:$DATA_DIR/config.php"
$SSH "$HOST" "chmod 600 '$DATA_DIR/config.php' && chmod 644 '$APP_DIR/track.php' '$APP_DIR/stats.php' '$APP_DIR/.htaccess'"
rm -f "$PROD_CONF"

echo "[4/4] 動作確認"
printf "  GETで叩く（405のはず）       -> "; curl -s -o /dev/null -w "%{http_code}\n" "${URL_BASE}track.php"
printf "  許可外Originで送る（403）    -> "; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Origin: https://evil.example" --data '{"ev":"view","page":"index","sid":"abcdef0123456789abcdef01"}' "${URL_BASE}track.php"
printf "  正規Originで送る（204）      -> "; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Origin: https://gearbox00.github.io" -H "Content-Type: text/plain" --data '{"ev":"view","page":"index","sid":"deploycheck00000000000001","extra":"deploy"}' "${URL_BASE}track.php"
printf "  集計をキー無しで（404）      -> "; curl -s -o /dev/null -w "%{http_code}\n" "${URL_BASE}stats.php"
printf "  キャッシュ無効の確認         -> "; curl -s -D - -o /dev/null "${URL_BASE}stats.php" | grep -i "cache-control" | tr -d '\r'
echo
echo "完了。集計画面は ${URL_BASE}stats.php?key=（config.local.php の stats_key）"
