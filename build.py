# 產生 GitHub Pages 用的單檔網頁
# - index.html：page.html + engine.js (期望抽數計算)
# - artifact.html：artifact-page.html + artifact-engine.js + enka-data.js (聖遺物重塑計算與角色展示)，共用樣式從 page.html 的 SHARED 區塊帶入
# page.html 同時是 Claude Artifact 的原始檔，所以本身不含 <!doctype>/<head>/<body>，由這裡補上
from pathlib import Path

here = Path(__file__).parent

RESET = """<style>
:root { color-scheme: light; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
body { margin: 0; font-size: 14px; font-family: system-ui, sans-serif; }
img { max-width: 100%; }
[hidden] { display: none !important; }
</style>"""


# 內容安全政策：只允許自己網站、Google Fonts、Enka 圖片與自己的 Worker，萬一有內容被注入，也載不到外部腳本、送不出資料
CSP = ('<meta http-equiv="Content-Security-Policy" content="'
       "default-src 'self'; "
       "script-src 'self' 'unsafe-inline'; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com data:; "
       "img-src 'self' data: blob: https://enka.network https://enka-proxy.twl-benchen.workers.dev; "
       "connect-src https://enka-proxy.twl-benchen.workers.dev; "
       "object-src 'none'; base-uri 'none'\">")


def wrap(page: str) -> str:
    # <title>、字型連結與 <style> 放進 <head>，其餘放進 <body>
    cut = page.index("</style>") + len("</style>")
    head, body = page[:cut], page[cut:]
    return f"""<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{CSP}
{RESET}
{head.strip()}
</head>
<body>
{body.strip()}
</body>
</html>
"""


def read(name: str) -> str:
    return (here / name).read_text(encoding="utf-8")


# 期望抽數計算
page = read("page.html")
assert "/*ENGINE*/" in page, "page.html 裡找不到 /*ENGINE*/ 佔位符"
a, b = page.index("/*SHARED-START*/"), page.index("/*SHARED-END*/")
shared = page[a + len("/*SHARED-START*/"):b].strip()
seg = read("seg-slide.js")  # 兩頁共用的分段按鈕滑動動畫
assert "/*SEG-SLIDE*/" in page, "page.html 裡找不到 /*SEG-SLIDE*/ 佔位符"
(here / "index.html").write_text(wrap(page.replace("/*ENGINE*/", read("engine.js")).replace("/*SEG-SLIDE*/", seg)), encoding="utf-8")

# 聖遺物重塑計算
art = read("artifact-page.html")
assert all(k in art for k in ("/*ENGINE*/", "/*SHARED*/", "/*ENKA-DATA*/", "/*SEG-SLIDE*/")), "artifact-page.html 缺少佔位符"
art = art.replace("/*SHARED*/", shared).replace("/*ENGINE*/", read("artifact-engine.js")).replace("/*ENKA-DATA*/", read("enka-data.js")).replace("/*SEG-SLIDE*/", seg)
(here / "artifact.html").write_text(wrap(art), encoding="utf-8")

print("built index.html, artifact.html")
