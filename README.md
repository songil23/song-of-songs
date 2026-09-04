# 2026 서초지역 대학청년 찬송집 — 웹 악보

`index.html` 한 파일. 이조(반음 단위) · 절 쌓기/구분 보기 · 자동 스크롤(속도 1~15) · 즐겨찾기(브라우저 저장) · 글자 크기 · 화이트/블랙.

- 사이트: <https://songil23.github.io/song-of-songs/>
- GitHub: <https://github.com/songil23/song-of-songs>

## 갱신
```
python web/tools/parse.py      # ../악보/*.md(곡목록 '완료'만) → src/data.js
node   web/tools/test_engine.js
python web/tools/build.py      # src/* → index.html
git add -A && git commit -m "update" && git push
```

현재 `build.py`만 실행하면 Markdown을 다시 파싱하지 않는다. 악보를 수정한 뒤에는 위 세 명령을 순서대로 실행해야 한다. 원인, 미반영 범위, 자동화 후속 설계는 `CODEX.md`에 기록했다.

설계와 규칙: `../코드변환기 계획.md`. 소스는 `src/`, `index.html`과 `src/data.js`는 생성물이라 직접 고치지 않는다.

© 2026 Seocho Church Youth. Personal worship use only; redistribution not permitted.
