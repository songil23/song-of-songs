# -*- coding: utf-8 -*-
# src/app.html + app.css + engine.js + data.js + app.js → web/index.html (한 파일, 외부 참조 0)
# usage: python web/tools/build.py
import re, io, sys
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
WEB = Path(__file__).resolve().parents[1]; SRC = WEB / "src"
read = lambda name: (SRC / name).read_text(encoding="utf-8")
html = read("song of songs.html")
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: "<style>\n" + read(m.group(1)) + "</style>", html)
html = re.sub(r'<script src="([^"]+)"></script>', lambda m: "<script>\n" + read(m.group(1)).replace("</script", "<\\/script") + "</script>", html)
bad = re.findall(r'(?:src|href)="(?:https?:)?//[^"]*"', html)
assert not bad, f"외부 참조 발견: {bad}"
assert "window.SONGS=" in html, "data.js가 비어 있음 — parse.py를 먼저 돌릴 것"
html = html.replace("<!doctype html>\n", "<!doctype html>\n<!-- 생성물 — 직접 수정 금지. web/tools/build.py (원본: web/src/) -->\n", 1)
(WEB / "index.html").write_text(html, encoding="utf-8")
print("written: web/index.html", len(html.encode("utf-8")) // 1024, "KB · 외부 참조 0")
