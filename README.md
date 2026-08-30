# AR試作

ブラウザだけで動くAR。アプリのインストールは不要。

| フォルダ | 方式 | ライブラリ |
| --- | --- | --- |
| `marker/` | 画像マーカー型 | MindAR 1.2.5 + A-Frame 1.5.0（CDN） |
| `place/` | 平面設置型 | Google model-viewer 4.0.0（CDN） |

## 動かすための条件

カメラを使うため、**https で配信されたページ**でないとブラウザが拒否する。
`index.html` をダブルクリックで開いても、http で開いても動かない。

httpで開いた場合、以前は MindAR の読み込みアニメーションのまま黙って止まっていた。
2026-08-30に、理由を画面に出すよう直した。

### スマホの実機で確認する（Tailscale経由・公開しない）

初回だけ、端末名を書いた設定ファイルを用意する。

```
copy tools\host.txt.example tools\host.txt
```

`tools/host.txt` に、自分のTailscaleの端末名を1行だけ書く（`tailscale status` で確認できる）。
このファイルはGitに入れない。環境変数 `AR_HOST` でも渡せる。

```
node tools/serve-https.js
```

起動すると、開くべきURLが画面に出る。同じTailscaleに入っている端末からのみ見える。
待ち受けはTailscaleのアドレスだけに絞ってあるので、同じ無線LANにいる他人の端末からは届かない。

証明書は `E:/claude_projects/<端末名>.crt` / `.key` を読む（`AR_CERT_DIR` で場所を変えられる）。
期限が切れたら `tailscale cert <端末名>` で取り直す。

### そのほかの配信先

1. GitHub Pages（gearbox00）
2. Xサーバー（gearbox-app-origin.net 等）
3. PCで `localhost` を立てて、PCのブラウザで開く（スマホからは不可）

## ① マーカーを自分で作る

外部の変換サイトを使わず、このPCの中だけで完結する。未公開の素材でも外へ出ない。

### マーカー画像を生成する

```
node tools/gen-marker.js --text GEARBOX --seed 20260830
```

`marker/assets/generated/` に3種類（a/b/c）のPNGとSVGが出る。
`--text` で入れる文字、`--seed` で模様の並びが変わる。同じ種を渡せば同じ絵になる。

| 種類 | 見た目 | 認識点 |
| --- | --- | --- |
| a 幾何パターン型 | 図形が散った絵。デザインと認識のバランス型 | 2,043点 |
| b 高密度ノイズ型 | 細かい四角が敷き詰められた絵 | 3,284点 |
| c 帯とロゴ型 | 線とロゴ中心。見た目は整うが点は少ない | 1,318点 |

（比較用）MindAR公式サンプルの `card.png` は588点。ただしこれは372x674と解像度が低いので、
数字の差がそのまま認識性能の差ではない。同じ1024x1024どうしのa/b/cの比較が意味を持つ。

現在 `marker/assets/marker.png` として使っているのは **b** である。

### 画像を .mind に変換する

```
node tools/compile-mind.js marker/assets/marker.png --out marker/assets/targets.mind
```

手持ちの写真やロゴでも同じように変換できる（png / jpg / webp）。
変換には1枚あたり数十秒かかる。認識点の数が段階別に表示されるので、
複数の候補を並べて比較できる。

複数のマーカーを1つの `.mind` にまとめる場合は、ファイルを並べて渡す。
その場合 `marker/index.html` の `targetIndex` で何番目かを指定する。

### 仕組み

`tools/compiler.html` が MindAR本体（`tools/vendor/`）をこのPCのブラウザで動かし、
Playwright越しに結果を受け取って `.mind` を書き出している。
公式のオンライン変換ページと同じ処理を、手元で走らせている形。

### マーカーに向かない画像

単色の面が広い、左右対称、グラデーションのみ、QRコードそのもの。

## 重ねる中身を差し替える

`place/assets/Astronaut.glb` がサンプル（model-viewer公式のもの）。
自作する場合は Blender から glTF Binary (.glb) で書き出す。
iPhoneの「ARで見る」には `.usdz` も要る（`ios-src`）。Reality Converter や
Blenderの USDZ アドオンで変換できる。

## 素材の出どころ

| ファイル | 出どころ | ライセンス |
| --- | --- | --- |
| `marker/assets/marker.png` / `targets.mind` | 自作（`tools/gen-marker.js` で生成） | 自社 |
| `marker/assets/card.png` / `card.mind` | MindAR公式サンプル（比較用に残してある） | MindAR（MIT）のexamples |
| `place/assets/Astronaut.glb` / `.usdz` | Poly by Google | **CC-BY 2.0**（表示が必要） |

Astronautモデルの表記:
Astronaut by Poly (Google), licensed under CC-BY 2.0
https://creativecommons.org/licenses/by/2.0/

差し替えるときは、ページ内の表記も一緒に消すこと。

いずれも動作確認用のサンプル。実案件で使う前に差し替えること。

## 端末ごとの対応

| 端末 | ① マーカー型 | ② 平面設置型 |
| --- | --- | --- |
| iPhone (Safari) | 動く | 動く（AR Quick Look） |
| Android (Chrome) | 動く | ARCore対応機種のみ |
| PC | カメラがあれば動く | ARなし。3D表示のみ |

## 確認した内容（2026-08-30）

Playwrightで、カード画像を映した疑似カメラをChromiumに食わせて検証した。
検証スクリプトは一時フォルダに置いたもので、リポジトリには含めていない。

| 項目 | 結果 |
| --- | --- |
| ① マーカー認識（targetFound発火） | 成功。「マーカーを認識しました」に切り替わる |
| ① 自作マーカー(marker.png)での認識 | 成功 |
| ① .mindのローカル生成 | 成功（a/b/c と公式サンプルの計4枚を変換） |
| ① 3Dモデルの読み込み | 成功（mesh生成を確認） |
| ① カメラ映像の取得 | 640x480を取得 |
| ② モデル読み込み・表示 | 成功（スクリーンショットで目視） |
| 両ページのJSエラー | なし |
| https配信＋カメラあり | 認識成功。カメラ映像の上にモデルが立つ |
| httpで開いた場合 | 「httpsでないため、カメラを使えません」と表示（黙って止まらない） |
| カメラが使えない場合 | 「ARを開始できませんでした」と表示（arError: VIDEO_FAIL） |
| 違う絵を映した場合 | 15秒後にヒントを表示（見本と見比べる案内） |
| **iPhone実機（Safari・Tailscale https）** | **成功。マーカーの上にモデルが立つのを目視（2026-08-30 11:05）** |

## 未確認事項

1. Android実機での動作（iPhoneでは確認済み）
2. ②「床に置く」の実機でのAR起動（iPhoneのAR Quick Look / AndroidのScene Viewer）
3. 印刷した紙のマーカーでの認識（確認できているのはPC画面に表示した絵まで）
4. 印刷したマーカーの実用的な認識距離
   → 紙のサイズと照明に依存するため、実物での確認が要る

## つまずいた点（同じことを繰り返さないために）

1. httpで開くと、MindARの読み込みアニメーションのまま黙って止まる。
   カメラが使えない理由を画面に出すようにした
2. 探しているマーカーと、画面に映した絵が別物でも、何も起きないだけで理由が分からない。
   画面の左下に「探している絵」の見本を常に出し、15秒たったらヒントを出すようにした
