# RetroShelf — Claude Code 작업 안내

- 먼저 `HANDOVER.md`를 읽는다 (구조·동작 흐름·확인 안 된 것).
- 사용자와는 **한국어**로 대화한다. UI 문구·코드 주석도 한국어.
- 화면은 번들러 없는 순수 JS(`src/`), 셸은 Tauri 2(`src-tauri/`). 화면에서 Rust를 부르는 명령은 `bridge.js`와 `generate_handler!` 두 곳에 같이 등록한다.
- rom에 새 필드를 넣으면 `rescan()`의 합치는 줄에도 넣는다 (안 그러면 다시 스캔할 때 사라짐).
- 버전을 올릴 때는 `src-tauri/tauri.conf.json`과 `src-tauri/Cargo.toml`을 같이 고치고, `CHANGELOG.md`와 `README.md` 해당 절을 갱신한다.
- 사용자에게 보이는 기능·문구가 바뀌면 `docs/manual.md`의 해당 절도 고친다 (화면이 크게 바뀌면 `docs/images/` 그림도).

## 자주 쓰는 명령

```
cd src-tauri && cargo test --release                 # 단위 시험
node -e "global.window={};const d=require('./src/data.js'); …"   # data.js 순수 함수 시험
node dev/ui-harness.example.js                       # 화면 시험 틀 (Playwright)
cd src-tauri && cargo tauri build                    # Windows 빌드 (Windows에서)
```
