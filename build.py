# 把 engine.js 內嵌進 page.html，輸出完整的單檔網頁 index.html (GitHub Pages 直接用)
# page.html 同時是 Claude Artifact 的原始檔，所以本身不含 <!doctype>/<head>/<body>，由這裡補上
from pathlib import Path

here = Path(__file__).parent
page = (here / "page.html").read_text(encoding="utf-8")
engine = (here / "engine.js").read_text(encoding="utf-8")
assert "/*ENGINE*/" in page, "page.html 裡找不到 /*ENGINE*/ 佔位符"
page = page.replace("/*ENGINE*/", engine)

# <title>、字型連結與 <style> 放進 <head>，其餘放進 <body>
cut = page.index("</style>") + len("</style>")
head, body = page[:cut], page[cut:]

RESET = """<style>
:root { color-scheme: light; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
body { margin: 0; font-size: 14px; font-family: system-ui, sans-serif; }
img { max-width: 100%; }
[hidden] { display: none !important; }
</style>"""

html = f"""<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{RESET}
{head.strip()}
</head>
<body>
{body.strip()}
</body>
</html>
"""
(here / "index.html").write_text(html, encoding="utf-8")
print("built index.html")
