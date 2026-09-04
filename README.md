# 2026 서초지역 대학청년 찬송집 — 웹 악보

`index.html` 한 파일. 이조(반음 단위) · 절 쌓기/구분 보기 · 자동 스크롤(속도 1~15) · 즐겨찾기와 전용 필터(브라우저 저장) · 글자 크기 · 화이트/블랙.

- 사이트: <https://songil23.github.io/song-of-songs/>
- GitHub: <https://github.com/songil23/song-of-songs>

## 갱신
```
python web/tools/build.py      # 악보/*.md 파싱 → 게이트 → 엔진 테스트 → index.html (한 번에)
git add -A && git commit -m "update" && git push
```
`build.py`는 곡목록.md 상태가 '완료'인 곡만 넣는다. 게이트에 걸린 곡이 있으면 index.html을 만들지 않고 멈춘다(`--force`로 제외한 채 빌드, `--skip-parse`로 화면 파일만 인라인). 사이트에는 push 뒤 반영된다.

설계와 규칙: `../코드변환기 계획.md`. 소스는 `src/`, `index.html`과 `src/data.js`는 생성물이라 직접 고치지 않는다.

© 2026 Seocho Church Youth. Personal worship use only; redistribution not permitted.
