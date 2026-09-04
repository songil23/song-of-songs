// 화면 로직. 엔진(engine.js)이 준 모델을 DOM으로 그린다. 데이터 계약: 코드변환기 계획.md §2
// 화면 2개(목록·곡)를 display로만 바꾸고 URL은 #025. 기록은 localStorage 'hymn.prefs' {theme,fontPx,speed}.
(function () {
  'use strict';
  var E = window.Engine, SONGS = window.SONGS || [];
  var $ = function (s) { return document.querySelector(s); };
  var PREF = 'hymn.prefs', prefs = { theme: 'light', fontPx: 16, speed: 3 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF) || '{}')); } catch (e) {}
  if (prefs.theme !== 'light' && prefs.theme !== 'dark') prefs.theme = 'light';
  if (typeof prefs.fontPx !== 'number' || !isFinite(prefs.fontPx)) prefs.fontPx = 16;
  prefs.fontPx = Math.min(24, Math.max(12, prefs.fontPx));
  if (typeof prefs.speed !== 'number' || !isFinite(prefs.speed)) prefs.speed = 3;
  prefs.speed = Math.min(10, Math.max(1, Math.round(prefs.speed)));
  function save() { try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch (e) {} }
  var st = { song: null, offset: 0, stacked: false, playing: false };
  function el(tag, cls, text) { var d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; }
  // 시스템 글꼴의 ♭ 왼쪽 여백이 커서 B ♭처럼 보이는 것을 막는다. 데이터·엔진 문자열은 그대로 두고 표시 글리프만 감싼다.
  function musicText(node, text) {
    node.textContent = '';
    String(text || '').split(/([♯♭])/).forEach(function (part) {
      if (!part) return;
      node.appendChild(part === '♭' || part === '♯' ? el('span', 'accidental ' + (part === '♭' ? 'flat' : 'sharp'), part) : document.createTextNode(part));
    });
    return node;
  }
  // slash 앞의 본 코드만 첫 가사 음절 중심에 놓고, /베이스는 그 오른쪽으로 흘린다.
  function chordText(node, text) {
    var slash = text.indexOf('/'), mainText = slash < 0 ? text : text.slice(0, slash);
    var main = musicText(el('span', 'chord-main'), mainText);
    if (slash >= 0) {
      main.appendChild(musicText(el('span', 'chord-bass'), text.slice(slash)));
      node.appendChild(musicText(el('span', 'chord-bass-space'), text.slice(slash)));
    }
    node.insertBefore(main, node.firstChild);
    return node;
  }

  // ---- 목록
  function renderList(q) {
    q = (q || '').trim().toLowerCase();
    var ul = $('#songs'); ul.textContent = '';
    SONGS.forEach(function (s) {
      if (q && s.id.indexOf(q) < 0 && String(+s.id).indexOf(q) < 0 && s.title.toLowerCase().indexOf(q) < 0) return;
      var li = el('li'), b = el('button');
      b.appendChild(el('span', 'n', String(+s.id)));
      b.appendChild(el('span', 't', s.title));
      b.appendChild(musicText(el('span', 'k'), E.keyLabel(s, 0) + ' · ' + s.time));
      b.onclick = function () { location.hash = s.id; };
      li.appendChild(b); ul.appendChild(li);
    });
  }

  // ---- 라우팅
  function route() {
    var id = location.hash.slice(1), s = null;
    SONGS.forEach(function (x) { if (x.id === id) s = x; });
    stopScroll(); closeKeys(false);
    if (s) openSong(s);
    else { st.song = null; $('#song').hidden = true; $('#bar').hidden = true; $('#list').hidden = false; }
  }
  function openSong(s) {
    st.song = s; st.offset = 0; st.stacked = false;      // 곡별 이조 기억은 v2(계획 §7)
    $('#list').hidden = true; $('#song').hidden = false; $('#bar').hidden = false;
    $('#title').textContent = s.title; $('#sub').textContent = s.sub || ''; $('#sub').hidden = !s.sub;
    $('#stackbtn').disabled = !E.stackable(s);          // 쌓을 수 없는 곡은 비활성(감추지 않는다)
    renderSong(); window.scrollTo(0, 0);
  }

  // ---- 곡 본문
  function renderSong() {
    var s = st.song, off = st.offset, sp = E.spellingFor(s, off);
    musicText($('#meta'), E.keyKorean(s, off) + (off ? ' (원조 ' + E.keyLabel(s, 0) + ')' : '') + ' · ' + s.time +
      (s.pickup ? ' · 못갖춘마디' : '') + (s.bars ? ' · ' + s.bars + '마디' : ''));
    musicText($('#keyname'), E.keyLabel(s, off));
    $('#stackbtn').classList.toggle('on', st.stacked);
    $('#stackbtn').setAttribute('aria-pressed', String(st.stacked));
    var body = $('#body'); body.textContent = ''; body.style.fontSize = BASE_FONT_PX + 'px';
    // 쌓기: 실제 악보처럼 절들이 쌓이고 후렴은 그 아래 한 번. 구분: 연주 순서(절 → 후렴 → 절 → 후렴 …)
    var blocks = st.stacked ? E.stackGroups(s) : E.playOrder(s).map(function (x) { return { type: 'single', section: x }; });
    blocks.forEach(function (b) {
      var sec = el('section');
      if (b.type === 'stack') {
        sec.appendChild(el('h2', null, b.label));
        b.verses[0].systems.forEach(function (sy, i) {
          sec.appendChild(systemTable(sy, b.verses.map(function (v) { return { num: v.num, sys: v.systems[i] }; }), sp, b.lang === 'en'));
        });
      } else {
        var x = b.section; sec.appendChild(el('h2', null, x.label));
        x.systems.forEach(function (sy) { sec.appendChild(systemTable(sy, [{ num: null, sys: sy }], sp, x.lang === 'en')); });
        if (x.text) sec.appendChild(el('p', 'txt', x.text));
      }
      body.appendChild(sec);
    });
    // 사용자가 고른 확대 크기에서 긴 영문을 먼저 판정해야 확대 뒤에도 한 줄이 화면 밖으로 밀리지 않는다.
    body.style.fontSize = prefs.fontPx + 'px';
    splitLongEnglish(); fit();
  }
  // 보표 하나 = 표. 첫 행 코드, 다음 행들 가사(쌓기면 절마다 한 행). 세그먼트 = 열이라 코드가 그 음절 위에 정확히 온다.
  function systemTable(cs, rows, sp, english) {
    var wrap = el('div', 'sys' + (english ? ' en' : '')), t = el('table'), tr = el('tr', 'ch');
    if (english) wrap._score = { sys: cs, rows: rows, spelling: sp };
    tr.appendChild(el('td', 'vn'));
    cs.cells.forEach(function (cell, ci) { cell.forEach(function (seg, si) {
      var chord = el('td', cls(cs, ci, si));
      if (seg.c) chordText(chord, E.display(E.transposeChord(seg.c, st.offset, sp)));
      tr.appendChild(chord);
    }); });
    t.appendChild(tr);
    rows.forEach(function (r) {
      var lr = el('tr', 'ly'); lr.appendChild(el('td', 'vn', r.num == null ? '' : String(r.num)));
      r.sys.cells.forEach(function (cell, ci) { cell.forEach(function (seg, si) { lr.appendChild(el('td', cls(r.sys, ci, si), seg.t)); }); });
      t.appendChild(lr);
    });
    wrap.appendChild(t); return wrap;
  }
  function sliceSystem(sys, from, to, last) {
    return { cells: sys.cells.slice(from, to), end: last ? sys.end : '|' };
  }
  // 영어 보표가 화면보다 길 때 원본 마디 경계 중 양쪽 폭이 가장 비슷한 곳에서 정확히 두 줄로 나눈다.
  function splitLongEnglish() {
    Array.prototype.forEach.call(document.querySelectorAll('.sys.en'), function (wrap) {
      var score = wrap._score, cells = score.sys.cells, table = wrap.firstChild;
      if (cells.length < 2 || table.offsetWidth <= wrap.clientWidth + 1) return;
      var codeCells = table.rows[0].cells, widths = [], col = 1;
      cells.forEach(function (measure) {
        var width = 0;
        measure.forEach(function () { width += codeCells[col++].getBoundingClientRect().width; });
        widths.push(width);
      });
      var total = widths.reduce(function (sum, width) { return sum + width; }, 0), left = 0, split = 1, best = Infinity;
      for (var i = 1; i < widths.length; i++) {
        left += widths[i - 1];
        var widest = Math.max(left, total - left);
        if (widest < best) { best = widest; split = i; }
      }
      function part(from, to, last) {
        var sys = sliceSystem(score.sys, from, to, last);
        var rows = score.rows.map(function (row) { return { num: row.num, sys: sliceSystem(row.sys, from, to, last) }; });
        var piece = systemTable(sys, rows, score.spelling, false);
        piece.classList.add('english-part');
        return piece;
      }
      wrap.parentNode.insertBefore(part(0, split, false), wrap);
      wrap.parentNode.insertBefore(part(split, cells.length, true), wrap);
      wrap.parentNode.removeChild(wrap);
    });
  }
  function cls(sys, ci, si) {
    var c = si === 0 ? (ci === 0 ? 'b b0' : 'b') : '';
    if (ci === sys.cells.length - 1 && si === sys.cells[ci].length - 1) c += sys.end === '||' ? ' e2' : ' e';
    return c;
  }

  // ---- 가로 자동 맞춤: 비율이 크기보다 중요하다(사용자 지시 2026-09-04). 보표마다 따로 줄이면 줄마다 글자 크기가 달라져
  // 악보의 비율이 깨지므로, 16px 악보가 가장 긴 보표에 맞는 비율을 먼저 구한 뒤 사용자 A−/A+ 비율을 별도로 곱한다.
  // 둘을 한 계산에 넣으면 A+로 키운 만큼 다시 자동 축소되어 버튼이 안 듣는 것처럼 보인다. 바닥 아래는 보표만 가로 스크롤한다.
  var BASE_FONT_PX = 16, FLOOR_PX = 10, fittedPx = BASE_FONT_PX;
  function chordVisualBounds(main) {
    var rect = main.getBoundingClientRect(), left = rect.left, right = rect.right;
    Array.prototype.forEach.call(main.querySelectorAll('*'), function (part) {
      var partRect = part.getBoundingClientRect();
      left = Math.min(left, partRect.left); right = Math.max(right, partRect.right);
    });
    return { left: left, right: right };
  }
  function setChordColumnInset(table, index, px) {
    Array.prototype.forEach.call(table.rows, function (row) {
      var cell = row.cells[index];
      if (!cell) return;
      cell.dataset.chordInset = (px / BASE_FONT_PX).toFixed(5);
      cell.style.setProperty('--chord-column-inset', px.toFixed(3) + 'px');
    });
  }
  // Centered chord labels can extend beyond their cells. Reserve that visual width in the
  // following column so long suffixes and slash bass notes cannot collide with the next chord.
  function reserveChordColumns(list) {
    var clearance = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chord-column-clearance')) || 0;
    Array.prototype.forEach.call(list, function (wrap) {
      var table = wrap.firstChild, row = table && table.querySelector('tr.ch');
      if (!row) return;
      Array.prototype.forEach.call(table.querySelectorAll('[data-chord-inset]'), function (cell) {
        cell.removeAttribute('data-chord-inset'); cell.style.removeProperty('--chord-column-inset');
      });
      var previousRight = -Infinity;
      Array.prototype.forEach.call(row.querySelectorAll('.chord-main'), function (main) {
        var bounds = chordVisualBounds(main), cell = main.closest('td'), inset = 0, tries = 0;
        while (previousRight > -Infinity && bounds.left < previousRight + clearance - 0.01 && tries++ < 3) {
          inset += previousRight + clearance - bounds.left;
          setChordColumnInset(table, cell.cellIndex, inset);
          bounds = chordVisualBounds(main);
        }
        previousRight = Math.max(previousRight, bounds.right);
      });
    });
  }
  function protectChordEdges(list) {
    var safety = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chord-edge-safety')) || 0;
    Array.prototype.forEach.call(list, function (wrap) { wrap.style.paddingInlineStart = '0px'; });
    Array.prototype.forEach.call(list, function (wrap) {
      var edge = wrap.getBoundingClientRect().left, left = edge;
      Array.prototype.forEach.call(wrap.querySelectorAll('.chord-main'), function (main) {
        left = Math.min(left, main.getBoundingClientRect().left);
        Array.prototype.forEach.call(main.querySelectorAll('*'), function (part) { left = Math.min(left, part.getBoundingClientRect().left); });
      });
      var overhang = edge - left;
      if (overhang > 0.01) {
        var font = parseFloat(getComputedStyle(wrap).fontSize) || BASE_FONT_PX;
        wrap.style.paddingInlineStart = ((overhang + safety) / font).toFixed(3) + 'em';
      }
    });
  }
  function fit() {
    var body = $('#body'); body.style.fontSize = BASE_FONT_PX + 'px';
    var list = document.querySelectorAll('.sys'), i, r = 1;
    reserveChordColumns(list);
    protectChordEdges(list);
    for (i = 0; i < list.length; i++) {
      var inset = parseFloat(getComputedStyle(list[i]).paddingLeft) || 0;
      r = Math.min(r, (list[i].clientWidth - inset - 1) / list[i].firstChild.offsetWidth);   // 읽기만(레이아웃 반복 방지)
    }
    fittedPx = Math.max(BASE_FONT_PX * r, FLOOR_PX);
    applyFont();
  }
  function shownFont(pref) { return Math.max(fittedPx * pref / BASE_FONT_PX, FLOOR_PX); }
  function nextFontPref(direction) {
    var current = shownFont(prefs.fontPx), candidate = prefs.fontPx;
    while (true) {
      var next = Math.min(24, Math.max(12, candidate + direction * 2));
      if (Math.abs(next - candidate) < 0.001) return null;
      candidate = next;
      if (Math.abs(shownFont(candidate) - current) >= 0.01) return candidate;
    }
  }
  function applyFont() {
    var body = $('#body'), shown = shownFont(prefs.fontPx);
    body.style.fontSize = shown.toFixed(2) + 'px';
    Array.prototype.forEach.call(document.querySelectorAll('[data-chord-inset]'), function (cell) {
      cell.style.setProperty('--chord-column-inset', (parseFloat(cell.dataset.chordInset) * shown).toFixed(3) + 'px');
    });
    $('#fminus').disabled = nextFontPref(-1) == null;
    $('#fplus').disabled = nextFontPref(1) == null;
  }
  var tm, layoutWidth = window.innerWidth; window.addEventListener('resize', function () {
    clearTimeout(tm); tm = setTimeout(function () {
      if (window.innerWidth === layoutWidth) return;
      layoutWidth = window.innerWidth;
      if (st.song) renderSong();
    }, 150);
  });

  // ---- 조 선택: 세로 12버튼, C 맨 위. 원조는 '원조' 표시, 현재 조만 강조.
  function closeKeys(restoreFocus) {
    $('#keys').hidden = true;
    $('#keybtn').setAttribute('aria-expanded', 'false');
    if (restoreFocus) $('#keybtn').focus();
  }
  function renderKeys() {
    var p = $('#keys'), s = st.song, base = E.noteIndex(s.key); p.textContent = '';
    E.KEY_LABELS.forEach(function (lab, i) {
      var off = (i - base + 12) % 12, b = el('button', off === st.offset ? 'on' : '');
      b.setAttribute('aria-pressed', String(off === st.offset));
      b.appendChild(musicText(el('span'), s.minor ? lab.replace(/([A-G][♯♭]?)/g, '$1m') : lab));
      b.appendChild(el('span', 'o', off === 0 ? '원조' : ''));
      b.onclick = function () { stopScroll(); st.offset = off; closeKeys(true); renderSong(); };
      p.appendChild(b);
    });
  }
  $('#keybtn').onclick = function () {
    var p = $('#keys'); stopScroll();
    if (p.hidden) {
      renderKeys(); p.hidden = false; this.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(function () { var current = p.querySelector('.on'); if (current) current.focus(); });
    } else closeKeys(true);
  };
  document.addEventListener('click', function (e) { var p = $('#keys'); if (!p.hidden && !e.target.closest('#keys, #keybtn')) closeKeys(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('#keys').hidden) { e.preventDefault(); closeKeys(true); return; }
    var interactive = e.target.closest && e.target.closest('button,input');
    if (st.playing && ['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '].indexOf(e.key) >= 0 && !interactive) stopScroll();
  });

  $('#stackbtn').onclick = function () { stopScroll(); st.stacked = !st.stacked; renderSong(); };
  $('#back').onclick = function () { location.hash = ''; };
  $('#fminus').onclick = function () { stepFont(-1); };
  $('#fplus').onclick = function () { stepFont(1); };
  function stepFont(direction) { var next = nextFontPref(direction); if (next != null) { stopScroll(); setFont(next, true, true); } }
  function setFont(px, persist, reflow) {
    prefs.fontPx = Math.min(24, Math.max(12, px));
    if (persist !== false) save();
    if (reflow && st.song) renderSong(); else applyFont();
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', prefs.theme);
    Array.prototype.forEach.call(document.querySelectorAll('.theme'), function (b) {
      b.setAttribute('aria-pressed', String(prefs.theme === 'dark'));
      b.setAttribute('aria-label', prefs.theme === 'dark' ? '밝은 테마로 전환' : '어두운 테마로 전환');
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('.theme'), function (b) {
    b.onclick = function () { prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; save(); applyTheme(); };
  });

  // ---- 자동 스크롤. 390px의 001·026·112 실측 보표 간격은 53.66·56.94·50.03px(평균 53.54px).
  // 느린 찬송 기준 보표당 약 12초가 되도록 px/s = 1.5×속도: 기본 3은 4.5px/s, 평균 11.90초/보표(2026-09-04 CDP 보정).
  var SCROLL_PX_PER_SPEED = 1.5, raf = null, last = 0, acc = 0, lock = null, playGeneration = 0;
  function step(ts) {
    if (!st.playing) return;
    if (last) { acc += (ts - last) / 1000 * prefs.speed * SCROLL_PX_PER_SPEED; var px = Math.floor(acc); if (px) { acc -= px; window.scrollBy(0, px); } }
    last = ts;
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1) return stopScroll();
    raf = requestAnimationFrame(step);
  }
  function startScroll() {
    var generation = ++playGeneration;
    st.playing = true; last = 0; acc = 0; $('#play').classList.add('on'); playIcon(true); showSpeed(true);
    raf = requestAnimationFrame(step);
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) {
      if (!st.playing || generation !== playGeneration) { l.release().catch(function () {}); return; }
      lock = l;
    }).catch(function () {}); } catch (e) {}
  }
  function stopScroll() {
    playGeneration++;
    if (st.playing) {
      st.playing = false; if (raf != null) cancelAnimationFrame(raf); raf = null;
      $('#play').classList.remove('on'); playIcon(false); showSpeed(false);
    }
    if (lock) { lock.release().catch(function () {}); lock = null; }
  }
  function playIcon(on) {
    $('#ic-play').hidden = on; $('#ic-stop').hidden = !on; $('#play-l').textContent = on ? '정지' : '재생';
    $('#play').setAttribute('aria-pressed', String(on));
    $('#play').setAttribute('aria-label', on ? '자동 스크롤 정지' : '자동 스크롤 재생');
  }
  function showSpeed(on) {
    ['#sminus', '#splus'].forEach(function (s) { $(s).hidden = !on; });
    ['#fminus', '#fplus'].forEach(function (s) { $(s).hidden = on; });
    $('#splus').querySelector('.l').textContent = '빠르게 ' + prefs.speed;   // 현재 속도는 빠르게 라벨 옆에
    $('#sminus').disabled = prefs.speed <= 1; $('#splus').disabled = prefs.speed >= 10;
    $('#sminus').setAttribute('aria-label', '속도 낮추기, 현재 ' + prefs.speed);
    $('#splus').setAttribute('aria-label', '속도 높이기, 현재 ' + prefs.speed);
  }
  $('#play').onclick = function () { if (st.playing) stopScroll(); else startScroll(); };
  $('#sminus').onclick = function () { prefs.speed = Math.max(1, prefs.speed - 1); save(); showSpeed(true); };
  $('#splus').onclick = function () { prefs.speed = Math.min(10, prefs.speed + 1); save(); showSpeed(true); };
  // 두 손가락 확대는 본문 글자 비율로 바꾸고 손을 뗀 크기를 저장한다. 툴바는 main 밖이라 확대되지 않는다.
  var pinch = null, pinchFrame = null, pendingFont = prefs.fontPx;
  function touchDistance(touches) {
    var x = touches[0].clientX - touches[1].clientX, y = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(x * x + y * y);
  }
  function drawPinch() { pinchFrame = null; setFont(pendingFont, false, false); }
  $('#song').addEventListener('touchstart', function (e) {
    stopScroll();
    if (e.touches.length === 2) {
      var distance = touchDistance(e.touches);
      if (distance < 1) return;
      e.preventDefault();
      pinch = { distance: distance, font: prefs.fontPx };
    }
  }, { passive: false });
  $('#song').addEventListener('touchmove', function (e) {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault(); pendingFont = pinch.font * touchDistance(e.touches) / pinch.distance;
    if (pinchFrame == null) pinchFrame = requestAnimationFrame(drawPinch);
  }, { passive: false });
  function finishPinch(e) {
    if (!pinch || e.touches.length >= 2) return;
    if (pinchFrame != null) { cancelAnimationFrame(pinchFrame); drawPinch(); }
    pinch = null; prefs.fontPx = Math.round(prefs.fontPx * 100) / 100; save();
    if (st.song) renderSong();
  }
  $('#song').addEventListener('touchend', finishPinch, { passive: true });
  $('#song').addEventListener('touchcancel', finishPinch, { passive: true });
  window.addEventListener('wheel', stopScroll, { passive: true });

  $('#q').oninput = function () { renderList(this.value); };
  window.addEventListener('hashchange', route);
  applyTheme(); renderList(''); showSpeed(false); route();
})();
