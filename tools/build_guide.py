"""guide/doday6-help.txt 를 서버가 읽는 lib/guide.js 로 바꾼다.

사용 안내 글을 고친 뒤 저장소 맨 위 폴더에서 실행:
    python3 tools/build_guide.py
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
text = (root / "guide" / "doday6-help.txt").read_text(encoding="utf-8").strip()
(root / "lib" / "guide.js").write_text(
    "// tools/build_guide.py 가 guide/doday6-help.txt 에서 만든 파일. 직접 고치지 말 것.\n"
    "export const GUIDE = " + json.dumps(text, ensure_ascii=False) + ";\n",
    encoding="utf-8",
)
print(f"lib/guide.js 저장 ({len(text):,}자)")
