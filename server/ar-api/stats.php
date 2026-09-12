<?php
/*
 * 計測の集計を見る画面。
 *   GET /ar-api/stats.php?key=（設定ファイルの閲覧キー）
 *   GET /ar-api/stats.php?key=...&json=1   … JSONで返す
 *
 * 閲覧キーは ar-data/config.php にだけある。URLに付けて共有する（営業デモ用の簡易な守り）。
 */
declare(strict_types=1);

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');

$config = require dirname(__DIR__, 2) . '/ar-data/config.php';

$key = (string)($_GET['key'] ?? '');
// 比較は時間差で当てられない方法で行う
if ($key === '' || !hash_equals((string)$config['stats_key'], $key)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'not found';
    exit;
}

$days = (int)($_GET['days'] ?? 30);
if ($days < 1 || $days > 365) $days = 30;

$dbPath = dirname(__DIR__, 2) . '/ar-data/events.sqlite';
$out = ['days' => [], 'totals' => [], 'by_dev' => [], 'by_model' => [], 'sessions' => 0, 'range_days' => $days];

if (is_file($dbPath)) {
    try {
        $db = new PDO('sqlite:' . $dbPath);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $since = "datetime('now', '-" . $days . " days')";

        $st = $db->query("SELECT date(ts) AS d, ev, COUNT(*) AS n FROM events WHERE ts >= $since GROUP BY date(ts), ev ORDER BY d");
        $byDay = [];
        foreach ($st as $r) { $byDay[$r['d']][$r['ev']] = (int)$r['n']; }
        foreach ($byDay as $d => $evs) { $out['days'][] = ['date' => $d] + $evs; }

        $st = $db->query("SELECT ev, COUNT(*) AS n FROM events WHERE ts >= $since GROUP BY ev");
        foreach ($st as $r) { $out['totals'][$r['ev']] = (int)$r['n']; }

        $st = $db->query("SELECT dev, COUNT(*) AS n FROM events WHERE ts >= $since AND ev = 'view' GROUP BY dev");
        foreach ($st as $r) { $out['by_dev'][$r['dev']] = (int)$r['n']; }

        $st = $db->query("SELECT extra, COUNT(*) AS n FROM events WHERE ts >= $since AND ev = 'model_pick' AND extra <> '' GROUP BY extra ORDER BY n DESC");
        foreach ($st as $r) { $out['by_model'][$r['extra']] = (int)$r['n']; }

        $st = $db->query("SELECT COUNT(DISTINCT sid) FROM events WHERE ts >= $since");
        $out['sessions'] = (int)$st->fetchColumn();
    } catch (Throwable $e) {
        http_response_code(500);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'error';
        exit;
    }
}

if (isset($_GET['json'])) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
}

// 人が見る画面
header('Content-Type: text/html; charset=utf-8');
$h = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
$EV_LABEL = ['view' => '開いた', 'found' => 'マーカー認識', 'shot' => '撮影', 'share' => '共有', 'save' => '保存',
             'ar_open' => 'ARで見る', 'model_pick' => '商品切替', 'error' => 'エラー'];
$t = $out['totals'];
$pct = function ($a, $b) { return $b > 0 ? round($a / $b * 100) . '%' : '-'; };
?>
<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>AR 計測</title>
<style>
  body{margin:0;padding:22px 16px 40px;font-family:system-ui,"Hiragino Kaku Gothic ProN",sans-serif;line-height:1.7;background:#f6f7f9;color:#16181d}
  .wrap{max-width:760px;margin:0 auto}
  h1{font-size:19px;margin:0 0 4px} .sub{font-size:13px;opacity:.75;margin:0 0 18px}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:22px}
  .tile{background:#fff;border:1px solid rgba(128,128,128,.25);border-radius:10px;padding:12px 14px}
  .tile b{display:block;font-size:24px} .tile span{font-size:12.5px;opacity:.75}
  table{border-collapse:collapse;width:100%;font-size:13px;background:#fff}
  th,td{border:1px solid rgba(128,128,128,.3);padding:6px 8px;text-align:right} th:first-child,td:first-child{text-align:left}
  h2{font-size:15px;margin:22px 0 8px}
</style></head><body><div class="wrap">
<h1>AR 計測</h1>
<p class="sub">直近 <?= $h($days) ?> 日 ／ 集計時刻 <?= $h(gmdate('Y-m-d H:i')) ?> UTC ／ 個人を特定する情報は保存していません</p>

<div class="tiles">
  <div class="tile"><b><?= $h($out['sessions']) ?></b><span>訪問（端末×回）</span></div>
  <div class="tile"><b><?= $h($t['view'] ?? 0) ?></b><span>ページを開いた</span></div>
  <div class="tile"><b><?= $h($t['found'] ?? 0) ?></b><span>マーカー認識 <?= $h($pct($t['found'] ?? 0, $t['view'] ?? 0)) ?></span></div>
  <div class="tile"><b><?= $h($t['shot'] ?? 0) ?></b><span>撮影 <?= $h($pct($t['shot'] ?? 0, $t['found'] ?? 0)) ?></span></div>
  <div class="tile"><b><?= $h(($t['share'] ?? 0) + ($t['save'] ?? 0)) ?></b><span>共有・保存</span></div>
  <div class="tile"><b><?= $h($t['ar_open'] ?? 0) ?></b><span>ARで見る（床置き）</span></div>
</div>

<h2>日別</h2>
<table><tr><th>日付</th><?php foreach ($EV_LABEL as $k => $l) echo '<th>' . $h($l) . '</th>'; ?></tr>
<?php foreach ($out['days'] as $d): ?>
<tr><td><?= $h($d['date']) ?></td><?php foreach ($EV_LABEL as $k => $l) echo '<td>' . $h($d[$k] ?? 0) . '</td>'; ?></tr>
<?php endforeach; if (!$out['days']): ?><tr><td colspan="9" style="text-align:center">まだ記録がありません</td></tr><?php endif; ?>
</table>

<h2>端末の種類（開いた回数）</h2>
<table><tr><th>種類</th><th>回数</th></tr>
<?php foreach ($out['by_dev'] as $k => $n) echo '<tr><td>' . $h($k) . '</td><td>' . $h($n) . '</td></tr>'; ?>
</table>

<h2>床置きで選ばれたもの</h2>
<table><tr><th>名前</th><th>回数</th></tr>
<?php foreach ($out['by_model'] as $k => $n) echo '<tr><td>' . $h($k) . '</td><td>' . $h($n) . '</td></tr>'; ?>
</table>
</div></body></html>
