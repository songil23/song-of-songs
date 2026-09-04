// 이조 · 조 이름 · 절 쌓기 판정. 화면(DOM)은 모른다. 브라우저에서는 window.Engine, node에서는 module.exports.
// 규칙은 `코드변환기 계획.md` §F1·§F3. 테스트: node web/tools/test_engine.js
(function (root) {
  'use strict';
  var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var KEY_LABELS = ['C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭', 'B']; // 조 버튼, C 맨 위
  var FLAT_KEYS = { 5: 1, 10: 1, 3: 1, 8: 1, 1: 1 };  // F B♭ E♭ A♭ D♭ → ♭ 표기. 6(F♯/G♭)은 ♯로 통일(계획 §7). G♭을 원하면 6:1 추가
  var RE = /^([A-G])([#b]?)(.*)$/;

  function noteIndex(name) {
    var i = SHARP.indexOf(name); if (i < 0) i = FLAT.indexOf(name);
    if (i < 0) throw new Error('음이름 아님: ' + name);
    return i;
  }
  // 목표 조의 표기 방식: 'sharp' | 'flat' | 'keep'(C장조·A단조: 원본 코드의 임시표 종류 유지)
  function spellingFor(song, offset) {
    var tonic = (noteIndex(song.key) + offset) % 12;
    var major = song.minor ? (tonic + 3) % 12 : tonic;
    return major === 0 ? 'keep' : (FLAT_KEYS[major] ? 'flat' : 'sharp');
  }
  function spell(idx, spelling, acc) {
    if (spelling === 'flat') return FLAT[idx];
    if (spelling === 'sharp') return SHARP[idx];
    return acc === 'b' ? FLAT[idx] : SHARP[idx];
  }
  // 코드 하나 이조. offset은 원조 기준 반음(0~11) — 누적하지 않고 항상 원본 코드에서 계산한다.
  function transposeChord(chord, offset, spelling) {
    if (!chord || chord === '-') return chord;
    if (chord.charAt(0) === '(' && chord.charAt(chord.length - 1) === ')') return '(' + transposeChord(chord.slice(1, -1), offset, spelling) + ')';   // (D): 괄호 선택 코드
    var m = RE.exec(chord); if (!m) throw new Error('코드 아님: ' + chord);
    var root = spell((noteIndex(m[1] + m[2]) + offset) % 12, spelling, m[2]);
    var rest = m[3]
      .replace(/\/([A-G])([#b]?)/g, function (_, n, a) { return '/' + spell((noteIndex(n + a) + offset) % 12, spelling, a); })
      .replace(/\(([A-G])([#b]?)([^)]*)\)/g, function (_, n, a, s) { return '(' + spell((noteIndex(n + a) + offset) % 12, spelling, a) + s + ')'; }); // (G)·(Em)은 코드, (add2)·(sus4)는 그대로
    return root + rest;
  }
  function display(chord) { return chord ? chord.replace(/([A-G])#/g, '$1♯').replace(/([A-G])b/g, '$1♭') : chord; }
  function keyLabel(song, offset) {
    var m = RE.exec(song.key), t = (noteIndex(song.key) + offset) % 12;
    return display(spell(t, spellingFor(song, offset), m[2])) + (song.minor ? 'm' : '');
  }
  function keyKorean(song, offset) { return keyLabel(song, offset).replace(/m$/, '') + (song.minor ? '단조' : '장조'); }

  // ---- 절 쌓기: 마디별 코드 이름 열이 정확히 같은 보표끼리만 겹친다. 기준 절 = 가장 긴 절.
  // 짧은 절은 기준 절 안에서 구조가 일치하는 구간이 하나뿐일 때 그 자리에 놓는다(둘 이상이면 모호 → 따로 보여 정확성을 지킨다).
  function sysSig(sy) { return JSON.stringify(sy.cells.map(function (c) { return c.map(function (s) { return s.c; }); })); }
  function placeIn(base, v) {
    var b = base.systems.map(sysSig), s = v.systems.map(sysSig), found = -1;
    for (var k = 0; k + s.length <= b.length; k++) {
      var ok = true;
      for (var i = 0; i < s.length; i++) if (s[i] !== b[k + i]) { ok = false; break; }
      if (ok) { if (found >= 0) return -1; found = k; }
    }
    return found;
  }
  function labelOf(run) {
    var n = run.map(function (s) { return s.num; }), seq = n.every(function (x, i) { return i === 0 || x === n[i - 1] + 1; });
    return (seq && n.length > 1 ? n[0] + '~' + n[n.length - 1] : n.join('·')) + '절' + (run[0].lang === 'en' ? '(영문)' : '');
  }
  // → [{type:'stack', label, lang, systems:[{chords:보표, rows:[{num, sys}]}]} | {type:'single', section}] 순서대로
  function stackGroups(song) {
    var out = [], i = 0, secs = song.sections;
    while (i < secs.length) {
      var s = secs[i];
      if (!(s.kind === 'verse' && s.systems.length)) { out.push({ type: 'single', section: s }); i++; continue; }
      var run = [], j = i;
      while (j < secs.length && secs[j].kind === 'verse' && secs[j].lang === s.lang && secs[j].systems.length) run.push(secs[j++]);
      var base = run[0];
      run.forEach(function (v) { if (v.systems.length > base.systems.length) base = v; });
      var members = [], rest = [];
      run.forEach(function (v) { var k = v === base ? 0 : placeIn(base, v); (k >= 0 ? members : rest).push({ v: v, k: k }); });
      if (members.length < 2) { run.forEach(function (v) { out.push({ type: 'single', section: v }); }); i = j; continue; }
      var systems = base.systems.map(function (sy, idx) {
        var rows = [];
        members.forEach(function (m) { var r = idx - m.k; if (r >= 0 && r < m.v.systems.length) rows.push({ num: m.v.num, sys: m.v.systems[r] }); });
        return { chords: sy, rows: rows };
      });
      out.push({ type: 'stack', label: labelOf(members.map(function (m) { return m.v; })), lang: s.lang, systems: systems });
      rest.forEach(function (r) { out.push({ type: 'single', section: r.v }); });
      i = j;
    }
    return out;
  }
  function stackable(song) { return stackGroups(song).some(function (b) { return b.type === 'stack'; }); }

  // ---- 절 구분 보기의 연주 순서: 후렴을 해당 절 뒤마다 끼운다(사용자 지시 2026-09-04 "그래야 연주가 가능").
  // '후렴'·'후렴(영문)' → 같은 언어의 모든 절 뒤. '후렴(1·2절)'·'후렴(1~3절)'·'후렴(영문, 4절)' → 그 번호 절 뒤.
  // '괄호'(볼타)·'처음'·'반복'·A/B/C처럼 절 번호가 없는 후렴과 other는 md 위치 그대로.
  function chorusTargets(sec) {
    var l = sec.label;
    if (/괄호|처음|반복/.test(l)) return null;
    if (/^후렴(\(영문\))?$/.test(l)) return 'all';
    var nums = [], m, re = /(\d+)\s*~\s*(\d+)/g;
    while ((m = re.exec(l))) for (var k = +m[1]; k <= +m[2]; k++) nums.push(k);
    l.replace(/(\d+)\s*~\s*(\d+)/g, '').replace(/(\d+)/g, function (_, n) { nums.push(+n); });
    return nums.length ? nums : null;
  }
  function playOrder(song) {
    var secs = song.sections, target = {}, pushed = {}, res = [];
    secs.forEach(function (c, i) { if (c.kind === 'chorus') { var t = chorusTargets(c); if (t) target[i] = t; } });
    secs.forEach(function (s, i) {
      if (s.kind === 'verse') {
        res.push(s);
        secs.forEach(function (c, ci) {
          var t = target[ci];
          if (t && c.lang === s.lang && (t === 'all' || t.indexOf(s.num) >= 0)) { res.push(c); pushed[ci] = 1; }
        });
      } else if (!target[i]) res.push(s);           // 절 번호가 없는 후렴·other는 원래 자리
    });
    secs.forEach(function (c, i) { if (target[i] && !pushed[i]) res.push(c); });   // 맞는 절이 없던 후렴은 잃지 않고 끝에
    return res;
  }

  var Engine = { SHARP: SHARP, FLAT: FLAT, KEY_LABELS: KEY_LABELS, noteIndex: noteIndex, spellingFor: spellingFor,
    transposeChord: transposeChord, display: display, keyLabel: keyLabel, keyKorean: keyKorean, stackGroups: stackGroups, stackable: stackable, playOrder: playOrder };
  root.Engine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
