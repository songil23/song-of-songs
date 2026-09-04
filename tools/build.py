# -*- coding: utf-8 -*-
# 단일 진입점: 악보/*.md → data.js(parse.py) → 엔진 테스트(test_engine.js) → index.html 인라인.
# usage: python web/tools/build.py [--force] [--skip-parse]
#   어느 단계든 실패하면 기존 index.html을 덮어쓰지 않는다. 파서가 곡을 제외(게이트 실패)하면 기본은 중단 — 조용한 누락 방지.
#   --force      : 게이트 실패 곡을 제외한 채로 빌드(경고는 그대로 출력)
#   --skip-parse : data.js를 다시 만들지 않고 화면 파일만 인라인(화면 작업 중 빠른 반복용)
import re, io, sys, subprocess, shutil
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
WEB = Path(__file__).resolve().parents[1]; SRC = WEB / "src"; TOOLS = WEB / "tools"
force, skip_parse = "--force" in sys.argv, "--skip-parse" in sys.argv

def run(cmd, label):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=str(WEB))
    out = (r.stdout or "") + (r.stderr or "")
    print(f"── {label}"); print(out.rstrip())
    return r.returncode, out

if not skip_parse:
    code, out = run([sys.executable, str(TOOLS / "parse.py")], "parse.py")
    if code != 0: sys.exit("parse.py 실패 → index.html 유지")
    m = re.search(r"게이트 실패 (\d+)", out)
    if m and int(m.group(1)) > 0 and not force:
        sys.exit(f"게이트 실패 {m.group(1)}곡이 제외됨 → md를 고치거나 --force. index.html 유지")
code, _ = run(["node", str(TOOLS / "test_engine.js")], "test_engine.js")
if code != 0: sys.exit("엔진 테스트 실패 → index.html 유지")

read = lambda name: (SRC / name).read_text(encoding="utf-8")
html = read("song of songs.html")
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: "<style>\n" + read(m.group(1)) + "</style>", html)
html = re.sub(r'<script src="([^"]+)"></script>', lambda m: "<script>\n" + read(m.group(1)).replace("</script", "<\\/script") + "</script>", html)
bad = re.findall(r'(?:src|href)="(?:https?:)?//[^"]*"', html)
assert not bad, f"외부 참조 발견: {bad}"
assert "window.SONGS=" in html, "data.js가 비어 있음"
html = html.replace("<!doctype html>\n", "<!doctype html>\n<!-- 생성물 — 직접 수정 금지. web/tools/build.py (원본: web/src/) -->\n", 1)
tmp = WEB / "index.html.tmp"; tmp.write_text(html, encoding="utf-8"); shutil.move(str(tmp), str(WEB / "index.html"))
print(f"── written: web/index.html {len(html.encode('utf-8')) // 1024} KB · 외부 참조 0")
