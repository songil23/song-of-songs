# -*- coding: utf-8 -*-
# 악보/*.md → web/src/data.js (생성물). 데이터 계약은 `코드변환기 계획.md` §2.
# usage: python web/tools/parse.py        (어느 폴더에서 실행해도 됨)
# 게이트에 걸린 곡은 제외하고 보고한다(2026-09-04: 049 063 206 208 211 — md 수정 뒤 재실행).
# 포함 기준: 곡목록.md 상태가 '완료'인 곡만. 나머지는 보고서에 이유와 함께 적는다.
import re, io, sys, json, unicodedata
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
SRC, LIST, OUT = ROOT / "악보", ROOT / "곡목록.md", ROOT / "web" / "src" / "data.js"
W = lambda s: sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in s)
cols = lambda s: [W(s[:i]) for i, c in enumerate(s) if c == "|"]
# 코드 문법: 루트[#b]? 접미 (괄호)? (/베이스)?   예: A/C#  Bm(G)  C(add2)  F7(sus4)  Ebm(maj7)  A7/E  A/C#m
CHORD = re.compile(r"^[A-G][#b]?[A-Za-z0-9+]*(?:\([^()]+\))?(?:/[A-G][#b]?[a-z0-9]*)?$")
BOILER = "코드는 해당 글자 위에"
ACC = {"♭": "b", "♯": "#", "b": "b", "#": "#", "": ""}

# ---- 2줄 형식 → 인라인 (tools/to_inline.py의 merge와 동일. 검증된 코드라 손대지 않는다)
def col_map(s):
    m, w = {}, 0
    for i, c in enumerate(s):
        m.setdefault(w, i)
        w += 2 if unicodedata.east_asian_width(c) in "WF" else 1
    m.setdefault(w, len(s))
    return m

def merge(ch, ly):
    end = "||" if ly.rstrip().endswith("||") else "|"
    chords = [(W(ch[:m.start()]), m.group()) for m in re.finditer(r"\S+", ch) if m.group() not in ("|", "||")]
    cm = col_map(ly)
    ins = {}
    for col, c in chords:
        i = cm.get(col)
        if i is None:
            i = max(v for k, v in cm.items() if k <= col)
        ins.setdefault(i, []).append(c)
    out = ""
    for i, c in enumerate(ly):
        for c2 in ins.get(i, []):
            out += "[" + c2 + "]"
        out += c
    for i in sorted(k for k in ins if k >= len(ly)):
        out += "".join("[" + c + "]" for c in ins[i])
    parts = [p.strip() for p in out.rstrip().rstrip("|").split("|")]
    return " | ".join(p for p in parts if p) + " " + end

def split_segs(inline):
    """인라인 한 줄 → cells[[{c,t}…]…], end"""
    end = "||" if inline.rstrip().endswith("||") else "|"
    cells = []
    for m in [x.strip() for x in inline.rstrip().rstrip("|").split("|") if x.strip()]:
        segs = []
        for tok in re.split(r"(\[[^\]]+\])", m):
            if not tok: continue
            if tok.startswith("["): segs.append({"c": tok[1:-1], "t": ""})
            elif segs: segs[-1]["t"] += tok
            else: segs.append({"c": None, "t": tok})
        for s in segs: s["t"] = s["t"].strip()
        cells.append(segs)
    return cells, end

def parse_song(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    errs, notes, sections = [], [], []
    song = {"id": path.name[:3], "page": None, "title": lines[0].lstrip("# ").strip(), "sub": None,
            "key": None, "minor": False, "time": None, "pickup": False, "bars": None, "notes": notes, "sections": sections}
    i = 1
    while i < len(lines) and not lines[i].strip(): i += 1
    info = lines[i] if i < len(lines) else ""
    sub, verse = [], []
    for it in [p.strip() for p in info.split("·")]:
        m = re.match(r"책\s*(\d+)쪽", it)
        if m: song["page"] = int(m.group(1)); continue
        m = re.match(r"([A-G])([♭♯#b]?)(장조|단조)", it)
        if m: song["key"] = m.group(1) + ACC[m.group(2)]; song["minor"] = m.group(3) == "단조"; continue
        if re.fullmatch(r"\d+/\d+", it): song["time"] = it; continue
        if "못갖춘" in it: song["pickup"] = True; continue
        m = re.match(r"(\d+)마디$", it)
        if m: song["bars"] = int(m.group(1)); continue
        (verse if re.search(r"절|후렴|가사|구절|2부", it) else sub).append(it)
    song["sub"] = " · ".join(sub) or None
    for f in ("page", "key", "time"):
        if song[f] is None: errs.append(f"정보 줄에 {f} 없음: {info}")
    i += 1
    while i < len(lines) and not lines[i].startswith("## "):
        s = lines[i].strip()
        if s and BOILER not in s and not s.startswith("<!--"): notes.append(s)
        i += 1
    cur, infence, block, text = None, False, [], []
    def flush_text():
        if cur is not None and text: cur["text"] = "\n".join(text); text.clear()
    # 보표 블록 = 펜스 안에서 빈 줄로 나뉜 연속 줄. 1줄 코드, 2줄 가사, 3줄부터는 같은 코드 아래 동시에 부르는 추가 가사행(206 둘째 성부·211 에코).
    def flush_block():
        if not block: return
        n = len(cur["systems"]) + 1
        if len(block) < 2:
            errs.append(f"{cur['label']} 보표 {n}: 코드 줄만 있고 가사 줄 없음"); block.clear(); return
        ch, ly, extras = block[0], block[1], block[2:]
        if cols(ch) != cols(ly): errs.append(f"{cur['label']} 보표 {n}: 마디선 열 불일치")
        cells, end = split_segs(merge(ch, ly))
        for cell in cells:
            if not cell: errs.append(f"{cur['label']} 보표 {n}: 빈 마디")
            for s in cell:
                c = s["c"]
                if c and c != "-":
                    core = c[1:-1] if c.startswith("(") and c.endswith(")") else c   # (D)처럼 괄호로 감싼 선택 코드 허용
                    if not CHORD.match(core): errs.append(f"코드 문법: {c}")
        system = {"cells": cells, "end": end}
        if extras:
            system["extra"] = []
            for ex in extras:
                if cols(ex) != cols(ly): errs.append(f"{cur['label']} 보표 {n}: 추가 가사행 마디선 열 불일치")
                parts = [x.strip() for x in ex.rstrip().rstrip("|").split("|")]
                if len(parts) != len(cells): errs.append(f"{cur['label']} 보표 {n}: 추가 가사행 마디 수 {len(parts)} ≠ {len(cells)}")
                system["extra"].append(parts)
        cur["systems"].append(system); block.clear()
    for ln in lines[i:]:
        if ln.startswith("## "):
            flush_block(); flush_text()
            cur = {"label": ln[3:].strip(), "kind": None, "num": None, "lang": None, "systems": [], "text": None}
            sections.append(cur); infence = False; continue
        if cur is None: continue
        if ln.startswith("```"):
            flush_block(); infence = not infence; continue
        if infence:
            if not ln.strip(): flush_block()
            elif "|" in ln: block.append(ln)
        else:
            s = ln.strip()
            if s and not s.startswith("<!--"): text.append(s)
    flush_block(); flush_text()
    for sec in sections:
        m = re.match(r"(\d+)절", sec["label"])
        sec["kind"] = "verse" if m else ("chorus" if sec["label"].startswith("후렴") else "other")
        sec["num"] = int(m.group(1)) if m else None
        has_ko = any(re.search(r"[가-힣]", s["t"]) for sy in sec["systems"] for c in sy["cells"] for s in c) \
                 or bool(sec["text"] and re.search(r"[가-힣]", sec["text"]))
        sec["lang"] = "en" if ("영문" in sec["label"] or not has_ko) else "ko"
    if not any(sec["systems"] or sec["text"] for sec in sections): errs.append("절이 하나도 없음")
    if "||" not in "".join(lines): print(f"  경고 {song['id']}: '||' 끝표시 없음")
    return song, errs

def struct(sec):
    return [[[s["c"] for s in cell] for cell in sy["cells"]] for sy in sec["systems"]]

def stack_report(song):
    """한글 verse들의 코드 구조가 같은지. 다르면 첫 불일치 위치를 돌려준다(계획 §F3 데이터 패스용)."""
    ko = [s for s in song["sections"] if s["kind"] == "verse" and s["lang"] == "ko" and s["systems"]]
    if len(ko) < 2: return None
    base = struct(ko[0])
    for s in ko[1:]:
        st = struct(s)
        if st == base: continue
        if len(st) != len(base): return f"{ko[0]['label']} 보표 {len(base)}개 vs {s['label']} {len(st)}개"
        for i, (a, b) in enumerate(zip(base, st)):
            if a != b:
                for j, (x, y) in enumerate(zip(a, b)):
                    if x != y: return f"{ko[0]['label']}·{s['label']} 보표 {i+1} 마디 {j+1}: {x} vs {y}"
                return f"{ko[0]['label']}·{s['label']} 보표 {i+1}: 마디 수 {len(a)} vs {len(b)}"
    return "ok"

def main():
    status = {}
    for ln in LIST.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\|\s*(\d{3})\s*\|[^|]*\|[^|]*\|[^|]*\|\s*([^|]*)\|", ln)
        if m: status[m.group(1)] = m.group(2).strip()
    songs, skipped, failed, unstack = [], [], [], []
    for path in sorted(SRC.glob("*.md")):
        sid = path.name[:3]
        if "완료" not in status.get(sid, ""):
            skipped.append(f"{sid}({status.get(sid) or '곡목록에 없음'})"); continue
        song, errs = parse_song(path)
        if errs:
            failed.append(sid); print(f"✗ {sid} {song['title']}"); [print("   ", e) for e in errs]; continue
        r = stack_report(song)
        if r and r != "ok": unstack.append(f"{sid}: {r}")
        songs.append(song)
    nsys = sum(len(sec["systems"]) for s in songs for sec in s["sections"])
    chords = {s["c"] for s in songs for sec in s["sections"] for sy in sec["systems"] for c in sy["cells"] for s in c if s["c"]}
    print(f"포함 {len(songs)}/{len(status)} · 게이트 실패 {len(failed)} · 제외 {len(skipped)}: {' '.join(skipped)}")
    print(f"보표 {nsys} · 코드 {len(chords)}종 · 쌓기 불가 {len(unstack)}곡")
    for u in unstack: print("  ", u)
    if failed: print("게이트 실패 곡은 제외(md 수정 필요, 계획 §F3 데이터 패스):", " ".join(failed))
    if not songs: sys.exit(1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("// 생성물 — 직접 수정 금지. 만든 곳: web/tools/parse.py (입력: 악보/*.md, 곡목록.md 상태 '완료'만)\n"
                   "window.SONGS=" + json.dumps(songs, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print("written:", OUT, OUT.stat().st_size // 1024, "KB")

if __name__ == "__main__":
    main()
