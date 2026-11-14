# 從 Enka.Network 官方 API-docs 的 store/gi 產生 enka-data.js (角色、技能圖示、繁中名稱、五星副詞條 ID 對照)
# 用法：
#   git clone --depth 1 https://github.com/EnkaNetwork/API-docs /tmp/enka-docs
#   python3 scripts/build_enka_data.py /tmp/enka-docs
# 遊戲改版有新角色時重跑一次，再執行 python3 build.py
import json
import sys
from pathlib import Path

src = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/enka-docs") / "store" / "gi"
out = Path(__file__).resolve().parent.parent / "enka-data.js"

avatars = json.loads((src / "avatars.json").read_text(encoding="utf-8"))
loc = json.loads((src / "locs.json").read_text(encoding="utf-8"))["zh-tw"]
affixes = json.loads((src / "affixes.json").read_text(encoding="utf-8"))


def base(path, prefix):
    # "/ui/UI_AvatarIcon_Side_Xiao.png" → "Xiao"
    name = path.rsplit("/", 1)[-1].removesuffix(".png")
    return name.removeprefix(prefix)


chars = {}
for key, a in avatars.items():
    if "NameTextMapHash" not in a or not a.get("SideIconName"):
        continue
    order = a.get("SkillOrder", [])
    chars[key] = {
        "n": loc.get(str(a["NameTextMapHash"]), ""),
        "e": a.get("Element", "None"),
        "q": 5 if a.get("QualityType", "").startswith("QUALITY_ORANGE") else 4,
        "i": base(a["SideIconName"], "UI_AvatarIcon_Side_"),
        "s": order,
        "k": [base(a["Skills"].get(str(s), ""), "") for s in order],
        "p": [a.get("ProudMap", {}).get(str(s)) for s in order],
        "c": {cid: base(c.get("SideIcon", ""), "UI_AvatarIcon_Side_") for cid, c in (a.get("Costumes") or {}).items()},
    }

# 五星副詞條：ID → [PropType, 第幾檔 1..4, 數值]，給測試核對 ID 解碼用
affix5 = {k: [v["PropType"], v["Position"], v["Value"]] for k, v in affixes.items() if k.startswith("501")}

data = {"chars": chars, "loc": loc, "affix5": affix5}
js = (
    "/* Enka.Network 資料 (由 scripts/build_enka_data.py 產生，不要手改) */\n"
    "(function (root) {\n  const data = "
    + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    + ";\n  if (typeof module !== 'undefined' && module.exports) module.exports = data;\n"
    "  else root.EnkaData = data;\n})(typeof window !== 'undefined' ? window : this);\n"
)
out.write_text(js, encoding="utf-8")
print(f"wrote {out.name}: {len(chars)} chars, {len(loc)} loc, {len(affix5)} affixes, {len(js) // 1024} KB")
