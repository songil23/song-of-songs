// usage: node web/tools/test_engine.js   (의존성 0. data.js가 먼저 있어야 한다: python web/tools/parse.py)
'use strict';
globalThis.window = globalThis;
require('../src/data.js');
const E = require('../src/engine.js');
const SONGS = globalThis.SONGS;
let fail = 0;
function eq(a, b, msg) { if (a !== b) { fail++; console.log('FAIL', msg, '→', a, '≠', b); } }

eq(E.transposeChord('A/C#', 2, 'sharp'), 'B/D#', '슬래시');
eq(E.transposeChord('Bm(G)', 2, 'sharp'), 'C#m(A)', '괄호 코드');
eq(E.transposeChord('C(add2)', 1, 'flat'), 'Db(add2)', '괄호 접미');
eq(E.transposeChord('F7(sus4)', 7, 'sharp'), 'C7(sus4)', 'sus');
eq(E.transposeChord('Ebm(maj7)', 1, 'sharp'), 'Em(maj7)', 'maj7');
eq(E.transposeChord('A/C#m', 3, 'flat'), 'C/Em', '베이스 뒤 접미');
eq(E.transposeChord('G#dim', 10, 'keep'), 'F#dim', 'keep ♯ 유지');
eq(E.transposeChord('Bb', 2, 'keep'), 'C', 'keep 자연음');
eq(E.transposeChord('-', 3, 'sharp'), '-', '대시');
eq(E.display('Bbm/Db'), 'B♭m/D♭', '글리프');
eq(E.keyLabel({ key: 'D', minor: false }, 2), 'E', '조 이름');
eq(E.keyLabel({ key: 'D', minor: false }, 1), 'E♭', '♭조');
eq(E.keyLabel({ key: 'A', minor: true }, 3), 'Cm', '단조');
eq(E.keyLabel({ key: 'E', minor: false }, 2), 'F♯', '6반음은 F♯');
eq(E.keyKorean({ key: 'Bb', minor: false }, 0), 'B♭장조', '한글 조');

// 책의 모든 코드: 파싱 성공 + 12오프셋 왕복
const chords = new Set();
for (const s of SONGS) for (const sec of s.sections) for (const sy of sec.systems) for (const c of sy.cells) for (const g of c) if (g.c) chords.add(g.c);
for (const c of chords) for (let n = 0; n < 12; n++) {
  const back = E.transposeChord(E.transposeChord(c, n, 'sharp'), (12 - n) % 12, 'sharp');
  eq(back, E.transposeChord(c, 0, 'sharp'), '왕복 ' + c + ' +' + n);
}
// 쌓기 모델: 묶인 절들의 모든 세그먼트 코드가 첫 절과 같아야 한다(코드·가사 정확 일치 원칙)
let stackSongs = 0, mism = 0;
for (const s of SONGS) {
  const g = E.stackGroups(s);
  if (g.some(b => b.type === 'stack')) stackSongs++;
  for (const b of g) if (b.type === 'stack') {
    const base = b.verses[0];
    for (const v of b.verses) v.systems.forEach((sy, i) => sy.cells.forEach((cell, j) => cell.forEach((seg, k) => {
      if (seg.c !== base.systems[i].cells[j][k].c) mism++;
    })));
  }
}
eq(mism, 0, '쌓기 코드 불일치');
console.log(`곡 ${SONGS.length} · 코드 ${chords.size}종 · 쌓기 가능 ${stackSongs}곡 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
