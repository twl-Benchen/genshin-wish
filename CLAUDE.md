# genshin-wish

原神機率工具網站，兩個頁面用左上角的圓形按鈕互相切換：期望抽數計算 (`index.html`) 與聖遺物重塑計算 (`artifact.html`)。開始任何工作前先讀 `HANDOFF.md`，裡面有抽卡規則、計算方法、驗證數值、已知問題與待辦。

## 工作流程

- 只改 `engine.js`、`page.html` (抽卡) 與 `artifact-engine.js`、`artifact-page.html` (聖遺物)，`index.html` 和 `artifact.html` 是建置產物，不要手改。
- `enka-data.js` 由 `scripts/build_enka_data.py` 從 Enka 官方 API-docs 產生，不要手改；遊戲改版有新角色時重新產生。
- 改完執行 `python3 build.py` 重新產生兩個頁面。兩頁共用的樣式 (主題色、外框、左上角切換鈕) 寫在 `page.html` 的 `/*SHARED-START*/` 到 `/*SHARED-END*/` 之間，聖遺物頁透過 `/*SHARED*/` 帶入。
- 動到聖遺物計算時執行 `node test-artifact.js`，驗證案例全部要通過。
- 動到抽卡計算邏輯時執行 `node test.js`，精確值和蒙地卡羅結果要對得上 (平均差距約 0.2 抽以內)，`HANDOFF.md` 裡的驗證數值也要一起更新。
- `engine.js` 與 `artifact-engine.js` 要同時能在瀏覽器 (`window.GachaEngine`、`window.ArtifactEngine`) 和 Node (`module.exports`) 使用。
- 網頁是純前端單檔，不加建置工具、不加後端，外部資源只用 Google Fonts。例外只有聖遺物頁的「角色展示」：資料經過自己的 Cloudflare Worker (`worker/enka-proxy.js`，網址 https://enka-proxy.twl-benchen.workers.dev) 向 Enka.Network 查詢，圖片直接用 `https://enka.network/ui/`。不要再加其他後端或外部來源。

## 規則與資料

- 逐抽機率是社群擬合，不是官方數字。新增或修改規則時，先查證來源並寫進 `HANDOFF.md` 的資料來源。
- 捕獲明光的中間狀態官方沒公開，維持可切換的模型，預設用保守模型 (長期勝率約 55.6%，最接近官方 55%)。

## 寫作風格

- 介面文字與文件用繁體中文。
- 用半形括號 ()，不用全形括號（）。
- 中文句子用全形逗號 ，不用半形逗號 ,。
- 不要用破折號 —— 這類常見於 AI 文字的符號。
