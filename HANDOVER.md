# RetroShelf 인계 문서

> 이 문서는 지금까지(0.16.19, 2026-11-15) 대화형 세션에서 만든 내용을 정리한 것이다.
> 앞으로 Claude Code에서 이어서 작업할 때 가장 먼저 읽는다.
> 사용자 기능 설명은 `README.md`, 버전별 변경은 `CHANGELOG.md`에 있다.

---

## 1. 무엇을 하는 프로그램인가

RetroShelf는 **Windows용 멀티 에뮬레이터 프론트엔드**다. 게임 롬을 "게임 케이스 진열장"처럼 보여 준다.

- 등록한 폴더를 스캔해서 롬 파일과 에뮬레이터 실행 파일을 함께 찾는다.
  - 롬은 확장자와 폴더 이름으로 기종(콘솔)을 정한다.
  - 에뮬레이터는 실행 파일 이름으로 알아본다.
- 콘솔마다 쓸 에뮬레이터를 우선순위에 따라 자동으로 지정한다. 게임별로도 바꿀 수 있다.
- 게임은 진열장 선반에 케이스 모양으로 놓인다. 보기는 앞면 진열 / 책등 보관 / 목록 세 가지다.
  - 케이스를 누르면 FLIP 애니메이션으로 열린다.
  - 열린 케이스에는 설명서, 매체(카트리지·디스크·플로피), 정보 창이 보인다.
- 매체를 누르거나 [실행]을 누르면 에뮬레이터를 실행한다.
  - 필요한 경우 에뮬레이터 설정 파일을 실행 직전에 고친다.
- 커버 그림은 여러 곳에서 가져온다.
  - libretro-thumbnails에서 받기
  - 롬 안의 아이콘 꺼내기 (3DS, Switch, NDS 등)
  - 에뮬레이터 covers 폴더
  - 웹 이미지 검색
- 그 밖의 기능: 플레이 시간과 통계, 컬렉션, 지역판 묶기(1G1R), 아케이드 원본·클론 묶기, 한국어판 표시, 가격표, 테마, 거실 모드(패드 조작).
- UI는 전부 한국어다. 사용자는 한국어로 대화한다(답변도 한국어).

## 2. 기술 구성

| 층 | 내용 |
|---|---|
| 셸 | **Tauri 2** (Rust). 창은 `main.rs`의 `setup`에서 직접 만든다. WebView 데이터를 실행 폴더 쪽에 두기 위해서다 |
| 화면 | **번들러 없는 순수 JS**. `src/`를 그대로 `frontendDist`로 쓴다. 빌드 단계가 없다 |
| 화면↔Rust | `withGlobalTauri: true`. `src/bridge.js`가 `window.__TAURI__.core.invoke`를 감싼 `api` 객체를 만든다 |
| 그림 파일 | asset 프로토콜(`convertFileSrc`). 범위는 `**`. CSP의 img-src에 `https:` 허용(웹 커버 미리보기용) |
| 저장 | 실행 파일 옆 `RetroShelfData/` 폴더(포터블). 쓸 수 없는 위치면 AppData 쪽 |
| 네트워크 | `ureq` 2. Windows에서는 native-tls(SChannel)를 쓰고, 그 밖에서는 rustls를 쓴다 |

### 파일 지도

```
src/
  index.html      화면 뼈대 (탭, 사이드바, #main, 오버레이, 토스트)
  bridge.js       api = { scan, launch, readText, … } → Rust 명령 이름과 1:1
  data.js         정적 데이터·순수 함수 (DOM 없음, node로 바로 시험 가능)
                  CONSOLES(기종 정의), EMUS(에뮬레이터 정의), CORES(RetroArch 코어→기종),
                  parseName(파일 이름 해석), scanFiles(스캔 결과 → roms/emus), isKor(한국어판),
                  THUMB_SYS(libretro 시스템 이름), MODEL2/3_TITLES, GENRE_KO, tokenize 등
  app.js          화면 전체 (상태 S, 렌더, 이벤트, 실행 파이프라인, 각 기능)
  carts.js        카트리지·플로피 SVG 모양 (window.cartShape)
  styles.css      전체 스타일 (테마는 :root[data-shelf=…] 토큰)
  logo.svg
src-tauri/
  src/main.rs     Tauri 명령 대부분 (저장, 스캔, 실행·중지, ini/설정 고치기, 아이콘, 정리, …)
  src/thumbs.rs   libretro-thumbnails 목록·받기, 퍼지 매칭 보조, 웹 이미지 검색(DuckDuckGo/Bing)
  src/meta.rs     libretro-database 메타(CRC→이름·장르·연도·제작사), CRC 계산·캐시
  src/arcade.rs   FBNeo DAT, MAME -listfull/-listclones → 원본·클론 정보
  src/icons.rs    NDS·GBA 등 아이콘 / SFO 등 (콘솔별 롬 속 그림)
  src/nxicon.rs   3DS(SMDH) · Switch(NSP/XCI/NSZ/XCZ, prod.keys로 NCA 복호화) 아이콘
  src/cemu.rs     Wii U 타이틀 ID, Cemu 그래픽 팩(rules.txt) 목록, settings.xml 고치기
  tauri.conf.json / Cargo.toml / capabilities/default.json
.github/workflows/build.yml   태그(v*) 푸시 시 windows-latest에서 cargo tauri build
dev/                           시험용 스크립트 (아래 7장)
docs/manual.md, docs/images/   사용 설명서와 화면 그림 (실제 라이브러리에서 찍고 경로는 D:\Games\… 예시로 가림)
```

코드 스타일은 이렇다.
- `app.js`와 `data.js`는 한 줄이 긴 압축형 스타일이 많다. 줄 수에 비해 내용이 많다.
- 주석은 한국어다. 새 코드도 같은 결을 따른다.

## 3. 데이터와 상태

### 저장 위치 `RetroShelfData/`

| 경로 | 내용 |
|---|---|
| `library.json` | 상태 `S` 전체. 저장은 `save()`가 디바운스해서 `store_save`로 처리한다 |
| `boxart/` | libretro에서 받은 커버 `{id}.png`, `{id}.title.png`, `{id}.snap.png`, 웹에서 고른 커버 `{id}.cover.{stamp}.{ext}`. `_index/`에 시스템별 목록 캐시 |
| `covers/` | 파일에서 직접 고른 커버 |
| `icons/` | 롬에서 꺼낸 아이콘 (`.png`/`.jpg`). 실패 표시는 `.none`(내용 `v2`). Switch는 실패 표시를 남기지 않는다 |
| `crc-cache.tsv` | CRC 캐시 (경로·크기·수정시각 → CRC) |
| `webview/` | WebView 데이터 (숨은 DuckDuckGo 검색 창 포함) |

### 상태 `S` (app.js)

주요 키는 이렇다.
- `roms`: 게임 배열
- `emus`: 스캔으로 찾은 에뮬레이터
- `customEmus`, `manualEmus`: 직접 고른 에뮬레이터
- `map`: 콘솔 → `{id, auto}`
- `emuPath`: 에뮬레이터 실행 파일 덮어쓰기
- `emuArgs`: 실행 인수 덮어쓰기
- `roots`: 스캔 폴더
- `excludeDirs`, `consoleDirs`, `emuRomDirs`
- `settings`, `flt`, `sort`/`sortDir`, `view`, `ch`(선반 높이)
- `groupPick`(1G1R 대표 고정), `syscards`
- `np2Orig`: Neko Project ini 원래 값 기억
- `log`, `lastScan`

`settings` 주요 항목:
- `rescanOnStart`, `boxart`, `identify`, `oneG`, `regionPref`
- `shelf`(테마), `anim`(속도/끔), `priceTags`, `minimize`
- `nxKeys`(prod.keys 경로)
- `np2Font`(Neko Project 기본 폰트)
- `bizhawkPce`(BizHawk PC엔진 코어)
- `randUnplayed`

### 게임 한 개(rom)의 필드

| 분류 | 필드 |
|---|---|
| 기본 | `id`(경로 해시), `title`, `console`, `files[{path,size,disc}]`, `discs`, `dir`, `folder`, `region`, `variant`, `size` |
| 메타 | `crc`, `genre`, `year`, `maker`, `dev`, `kor`(한국어판), `arcName`/`arcParent`/`arcDesc`(아케이드) |
| 그림 | `cover`(직접 고름), `autoCover`(에뮬레이터 covers 폴더), `boxart`, `titleShot`, `snapShot`, `icon`, `iconV`, `iconErr`, `thumbName`, `boxartTried`, `shotTried` |
| 실행 | `emu`(게임별 에뮬레이터), `dirEmu`(ROM 폴더 지정), `syscard`(PCE CD), `ips`(FBNeo), `np2Font`(PC-98) |
| 기록 | `plays`, `playSeconds`, `sessions`, `firstPlayed`, `lastPlayed`, `lastLog`, `fav` |

다시 스캔할 때(`rescan`)는 새 스캔 결과와 예전 rom을 `id`로 합친다. 사용자가 정한 값(커버, 에뮬레이터, 폰트 등)은 그대로 넘긴다. 새 필드를 추가할 때는 `rescan()` 안의 합치는 줄(`…syscard:o.syscard,ips:o.ips,np2Font:o.np2Font,…`)에도 넣어야 한다. 빠뜨리면 다시 스캔할 때 사라진다.

## 4. 동작 흐름

### 4.1 시작

1. Rust `setup`: 데이터 폴더를 정하고 main 창을 만든다. prod.keys 후보를 미리 읽는다(Switch 아이콘용).
2. `app.js` 초기화:
   - `store_load_text`로 `S`를 불러온다.
   - 테마와 애니메이션을 적용하고 렌더한다.
   - `rescanOnStart`면 `rescan()`을 실행한다.
   - 아니면 아이콘 꺼내기 → 게임 확인(CRC) → 박스아트 받기 → 그림 정리(`pruneSoon`) 순서로 돈다.

### 4.2 스캔 `rescan()`

1. `scanPlan()`: 스캔 폴더, 콘솔별 ROM 폴더, 에뮬레이터별 ROM 폴더를 모은다. 다른 폴더 안에 든 폴더는 빼서 중복을 없앤다.
2. Rust `scan(roots, exclude, shallow, exts)`:
   - 폴더를 돌며 관심 확장자 파일과 실행 파일을 모은다.
   - 관심 확장자는 `INTERESTING` 목록과 `CONSOLES`의 모든 확장자를 합친 것이다. 화면 쪽이 `exts`로 넘긴다.
   - 새 기종을 `data.js`에 추가하면 스캔에도 자동으로 들어간다.
3. `scanFiles(files)` (data.js, 순수 함수):
   - **에뮬레이터 찾기**:
     - `EMUS[k].re`가 실행 파일 이름(확장자 뺀 것)과 맞으면 그 에뮬레이터다. `dirRe`가 있으면 폴더 이름도 맞아야 한다.
     - 업데이터·런처 같은 도우미 exe는 `HELPER_EXE`로 뺀다.
     - 같은 에뮬레이터가 여럿이면 `exeScore`가 높은 쪽을 고른다. 64비트, 멀티CPU, Pre-release·Nightly 폴더, np21 계열은 점수를 더한다. NP21/W의 haxm·whpx 폴더는 점수를 깎는다.
     - RetroArch는 `cores/*_libretro.dll`도 모은다.
   - **롬 분류**: 확장자로 기종을 정하되, 폴더 이름 별칭(`aliases`)이 우선한다. `.zip`, `.bin`, `.iso`처럼 여러 기종이 쓰는 확장자는 폴더 이름으로 판단한다.
   - **이름 해석**(`parseName`):
     - 지역, 버전, 디스크 번호를 읽는다. 디스크 번호는 `(Disc 1)`, `(Disk A)`, `(Disk 1 of 3)`, `[Disk2]` 꼴이다.
     - 디스크가 여러 장이면 한 게임으로 묶는다.
   - **특수 형식**: PS3·PS4·PS5·Vita 폴더 게임, Wii U 폴더, Switch NSP 등은 따로 처리한다.
   - **한국어판**: `isKor()`가 파일·폴더 이름의 kor·korea·korean·T-Kor·(K)·Ko 언어 코드·한글·한국어 등을 본다.
4. 스캔 뒤 처리:
   - 아케이드: MAME·FBNeo 정보로 원본·클론을 묶는다(`applyArcade`).
   - Model 1·2: sm2-emu `games.xml`로 제목을 채운다(`applySm2Db`).
   - Wii U 제목, PS 계열 SFO·param 제목을 읽는다.
   - 콘솔별 자동 지정(`autoAssign`)을 한다.
   - 이어서 아이콘 꺼내기 → CRC 확인 → 박스아트 받기 → 그림 정리를 한다.

### 4.3 에뮬레이터 고르기

- `options(console)`: 그 기종을 지원하는 에뮬레이터 목록이다. `EMUS[k].consoles`와 RetroArch 코어의 `CORES`로 정한다.
- `autoAssign()`: `CONSOLES[i].prefer` 순서로 정한다.
  - 지원은 하는데 `prefer`에 없는 에뮬레이터는 data.js 끝에서 자동으로 뒤에 붙는다. BizHawk는 항상 맨 뒤다.
  - 자동(`auto:true`)으로 정한 것만 다시 정한다.
- `emuFor(rom)`: 우선순위는 게임별(`rom.emu`) → ROM 폴더 지정(`rom.dirEmu`) → 콘솔 기본값이다.
  - `EMU_NOEXT`에 따라 그 파일을 못 읽는 에뮬레이터는 기본값에서 건너뛴다. 지금은 Mednafen × `.chd` 하나다.
- `launchSpec(rom)`: 실행 파일, 인수 배열, 화면용 명령 문자열을 만든다.
  - 인수 템플릿은 `EMUS[k].args`이고, 사용자가 덮어쓴 값이 있으면 `S.emuArgs`를 쓴다.
  - 자리표시자:

| 자리표시자 | 뜻 |
|---|---|
| `{rom}` | 롬 경로 |
| `{rom2}` | 두 번째 디스크. 없으면 그 토큰을 뺀다 |
| `{lname}` | 확장자 없는 롬 이름 (MAME·FBNeo·Model 2) |
| `{core}` | RetroArch 코어 경로 |
| `{sys}` | ares의 `--system 이름`, Kega Fusion의 `-gen` 등. `EMUS[k].sys[console]` |
| `{vitaboot}` | Vita3K 부팅 인수 |
| `{dir}` 등 | 그 밖은 `vars`를 참고 |

### 4.4 실행 `runGame(id)`

실행 직전에 에뮬레이터 설정을 고치는 단계가 있다. 이 프로그램의 핵심 중 하나다.

| 대상 | 무엇을 | 어디서 |
|---|---|---|
| PC엔진 CD + Mednafen | 게임별 System Card를 `pgconfig/<게임>.pce.cfg`에 적는다 | `syncSyscard`, `write_pgconfig` |
| PC엔진 CD + BizHawk | System Card를 `config.ini`의 `FirmwareUserSpecifications`에 적었다가, 끝나면 되돌린다 | `bizhawk_firmware` |
| PC엔진 계열 + BizHawk | `config.ini`의 `PreferredCores`(PCE·PCECD·SGX·SGXCD)를 TurboNyma 등으로 정한다 | `bizhawk_cores` |
| PC-98 + Neko Project | 폰트(`fontfile`), 하드디스크(`HDD1FILE`·`HDD2FILE`), 지난 플로피 비우기(`FDD1FILE`·`FDD2FILE`)를 exe 옆 `<exe이름>.ini`에 적는다. 바꾼 키는 원래 값을 `S.np2Orig`에 기억했다가, 그 값이 필요 없는 게임을 실행할 때 되돌린다. 값은 시스템 ANSI 코드 페이지로 적는다 | `np2Prepare`, `np2_ini_set`, `np2_set_font` |
| FBNeo | 게임별 IPS 패치를 명령줄 `-ips`로 넘긴다. 롬 폴더가 FBNeo 설정에 없으면 추가 | `loadIps`, `fbneoAddPath` |
| Model 2 (ElSemi) | `EMULATOR.INI`의 `[RomDirs]`에 롬 폴더 추가 (CRLF 유지) | `m2AddPath` |
| Wii U + Cemu | 그래픽 팩은 정보 창에서 바꾸는 즉시 `settings.xml`에 적는다 (실행 때가 아님) | `cemu.rs` |

그 뒤의 흐름:
1. Rust `launch`가 프로세스를 띄운다. 작업 폴더는 exe 폴더다.
2. 앱 창 최소화는 설정에 따른다.
3. 프로세스가 끝나면 플레이 시간을 기록한다(`addSession`). BizHawk 펌웨어처럼 되돌릴 것이 있으면 되돌린다.
4. 바로 꺼지면 실행 실패로 보고 실행 로그를 보여 준다.

### 4.5 그림(커버) 우선순위

`coverOf(rom)`은 `cover`(직접 고름) → `autoCover` → `boxart` 순서다. 하나도 없으면 아래를 쓴다.
- `icon`이 있으면 아이콘을 넣은 케이스. Switch는 패키지 모양(`nxArt`: 흰 NINTENDO SWITCH 라벨, 큰 아이콘, 흐린 배경, 제목)이다.
- 그 밖에는 기기 아이콘과 색 그라데이션이다.

가격표를 단 앞면 진열에서는 그림 커버 위의 콘솔 띠를 숨긴다(가격표에 콘솔 이름이 있으므로).

**그림 정리**(`pruneSoon` → `prune_images`):
- `boxart/`, `covers/`, `icons/` 바로 아래 그림 가운데 어떤 rom도 가리키지 않는 것을 지운다.
- 비교는 "하위폴더/파일이름"으로 한다. 데이터 폴더가 옮겨졌을 때 잘못 지우는 것을 막기 위해서다.
- 그림을 받거나 꺼내는 중이면 미룬다.
- `dropMissingImages()`는 사용자가 손으로 지운 그림을 가리키는 필드를 비운다.

### 4.6 롬 속 아이콘 (`extractRomIcons` → Rust `extract_icons`)

- 종류: NDS·GBA 등은 `icons.rs`, 3DS·Switch는 `nxicon.rs`.
- **3DS**: CIA meta, NoCrypto NCCH, 3DSX의 SMDH를 읽는다. 48×48 그림이 Morton 순서의 RGB565로 들어 있다.
- **Switch** (NSP/XCI/NSZ/XCZ):
  1. **키 읽기**: prod.keys를 읽는다. 후보 순서는 사용자 지정 → Eden, Ryujinx, yuzu 계열 기본 위치 → 에뮬레이터 폴더다.
  2. **control NCA 찾기**: PFS0(NSP) 또는 HFS0(XCI의 secure 파티션)에서 NCA를 크기순으로 최대 64개 본다.
  3. **헤더 풀기**: NCA 헤더를 header_key로 AES-XTS 복호화한다. 트윅은 섹터 번호를 big-endian으로 쓴다.
  4. **섹션 키 얻기**:
     - 키 영역 방식: `key_area_key_application_XX`로 키 영역을 푼다.
     - 티켓 방식: `.tik`의 title key를 `titlekek_XX`로 푼다.
  5. **RomFS 찾기**: 섹션 헤더의 **FsType은 바이트 0x2**(0=RomFS)다. 한때 0x3(HashType)을 읽던 버그가 있었다. IVFC 6단계가 실제 RomFS다. 데이터는 AES-CTR로 푼다.
  6. **아이콘 고르기**: `icon_*.dat`(JPEG)를 고른다. 순서는 한국어 > 미국 영어 > 일본어 > 그 밖이다.
  7. **NCZ**: 0x4000부터 `NCZSECTN` 표가 있고, 그 뒤가 zstd 스트림 또는 `NCZBLOCK` 블록이다. 이미 평문이다(ruzstd).
  8. **결과 전달**: 실패 원인을 문자열로 돌려준다(`?이유`, `!키이름`, `!`=키 없음). 정보 창의 "타이틀 아이콘" 줄에 표시된다.
- 커버를 직접 정한 게임도 아이콘은 꺼내 둔다. 화면에는 커버가 먼저 나온다.

### 4.7 박스아트·게임 확인·웹 검색

- **박스아트**(`fetchBoxarts`):
  - 시스템 목록은 thumbnails.libretro.com 목록에서 가져온다. 안 되면 GitHub API, 그것도 안 되면 libretro-database 이름을 쓴다.
  - 이름을 맞출 때 쓰는 것: `thumbKey`·`thumbWords`, 로마숫자→숫자, Dice 점수, 접두 보너스, 속편 번호 불일치 감점, 지역·TOSEC 태그 점수.
  - 그림은 raw.githubusercontent에서 받는다.
- **게임 확인**(`identifyRoms`):
  - CRC32를 계산한다. NES·FDS·Lynx·7800·SNES 복사기 헤더는 떼고, zip이면 안의 파일로 계산한다.
  - libretro-database의 no-intro·redump·genre·releaseyear·developer·publisher와 맞춘다.
- **웹 이미지 검색**(`web_images`): 순서는 아래와 같다.
  1. **숨은 WebView 창으로 DuckDuckGo**: 진짜 브라우저라 봇 차단(202)을 피한다. 결과는 `https://retroshelf.invalid/r?d=…`로 이동하려는 것을 `on_navigation`에서 가로챈다.
  2. **직접 요청 DuckDuckGo**: vqd 토큰을 얻은 뒤 `i.js`를 부른다.
  3. **Bing**: 실패 이유를 `note`로 함께 보여 준다.

## 5. 기종·에뮬레이터 추가하는 법

1. `data.js`의 `CONSOLES`에 기종 항목을 넣는다. 필드:
   - `id`, `maker`, `name`, `short`, `exts`, `aliases`(폴더 이름)
   - `h`·`aspect`·`thick`(케이스 크기), `kind`(케이스 모양 계열), `media`(`cart`/`disc`/…)
   - `cart`, `band`(색), `prefer`(에뮬레이터 우선순위)
2. 에뮬레이터는 `EMUS`에 넣는다. 필드: `name`, `re`(exe 이름), `dirRe`(선택), `consoles`, `args`(템플릿), 필요하면 `sys`. RetroArch 코어는 `CORES`에 `코어이름:[기종]`으로 넣는다.
3. 박스아트용 libretro 시스템 이름은 `THUMB_SYS`에 넣는다.
4. 카트 모양이 따로 필요하면 `carts.js`에 SVG를 추가하고 기종 매핑에 넣는다.
5. 실행 전에 설정 파일을 고쳐야 하면 4.4의 패턴을 따른다. Rust 명령을 추가하면 `generate_handler!`와 `bridge.js` 둘 다에 넣는다.
6. `README.md`의 해당 절과 `CHANGELOG.md`를 갱신한다.

**버전 올리기**: `src-tauri/tauri.conf.json`과 `src-tauri/Cargo.toml` 두 곳을 같이 고친다. 앱은 `info` 명령으로 버전을 읽어 창 제목과 로고 옆 꼬리표에 보여 준다.

## 6. 빌드

### Windows에서 (공식)
```
cargo install tauri-cli --version "^2" --locked
cd src-tauri
cargo tauri build          # → target/release/retroshelf.exe, bundle/nsis/*.exe
```
GitHub Actions(`.github/workflows/build.yml`)는 `v*` 태그를 푸시하면 같은 빌드를 돌린다.

### Linux에서 교차 빌드 (지금까지 쓴 방법)
```
# mingw-w64, rust-src 필요. Windows 표준 라이브러리를 소스에서 빌드한다
cd src-tauri
RUSTC_BOOTSTRAP=1 CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc \
  cargo build --release --target x86_64-pc-windows-gnu -Zbuild-std=std,panic_abort
```
배포 묶음 구성: `RetroShelf/RetroShelf.exe`, `WebView2Loader.dll`, `README.txt`(바뀐 점 포함).

주의할 점:
- `devUrl`이 없어서 화면 파일(`src/`)은 이 명령으로도 exe 안에 들어간다. 지금까지 배포한 0.15~0.16 빌드는 모두 이 명령으로 만들었다.
- 빌드가 실패해도 이전 exe가 남는다. 묶기 전에 exe가 새로 만들어졌는지 확인한다.

### Linux에서 개발·시험
- `cargo build --release`로 Linux판을 만든다. Xvfb 위에서 실행할 수 있다.
- `cargo test --release`로 단위 시험을 돌린다. 지금 있는 시험:
  - 웹 검색 파싱
  - Cemu 팩·settings.xml
  - 그림 정리
  - Neko Project ini
  - BizHawk 코어
  - Switch 아이콘(`NX_TEST_DIR` 필요)

## 7. 시험 방법 (`dev/`)

- **화면 시험**:
  - Playwright로 `src/index.html`을 직접 연다.
  - `window.__TAURI__`를 가짜로 넣어 `invoke`를 흉내 낸다.
  - 게임과 에뮬레이터 상태를 주입해서 렌더와 동작을 확인한다.
  - 예시는 `dev/ui-harness.example.js`.
- **data.js 시험**: DOM이 없으니 `node -e "global.window={}; const d=require('./src/data.js'); …"`로 `scanFiles`, `parseName`, `isKor` 등을 바로 시험한다.
- **Switch 아이콘 시험 파일**:
  - `dev/make_nx_fixtures.py <출력폴더> <jpg>`를 실행하면 가짜 키와 함께 NSP(키 영역·티켓 방식), NSZ(스트림·블록)를 만든다.
  - `NX_TEST_DIR=<출력폴더> cargo test --release nx_files -- --nocapture`로 돌린다.
  - 시험 파일이 실제 형식과 같은 실수를 하지 않도록 주의한다. FsType 버그가 바로 그 경우였다.

## 8. 아직 실제로 확인하지 못한 것 (중요)

개발은 Linux 샌드박스에서 했고, 실제 Windows에서는 일부만 확인했다. 아래는 코드와 시험으로만 맞춘 부분이다. 사용자 보고가 오면 여기부터 의심한다.

| 기능 | 확인 안 된 점 |
|---|---|
| 웹 이미지 검색 | 숨은 WebView 방식이 실제 Windows에서 DuckDuckGo 결과를 받는지 (샌드박스는 DDG 차단) |
| Cemu 그래픽 팩 | Cemu가 우리가 적은 `settings.xml` `<GraphicPack><Entry filename=…>` 형식을 그대로 읽는지. `.wua` 안 타이틀 ID 읽기(ZArchive 꼬리 구조) |
| PC-98 / Neko Project | 하드디스크 이미지를 `HDD1FILE`로 넣었을 때 부팅까지는 확인(MS-DOS 6.20 부팅 화면). 폰트 `fontfile` 반영, IDE 종류 설정 영향은 미확인 |
| BizHawk | `PreferredCores` 키 이름(PCE·PCECD·SGX·SGXCD)과 값(TurboNyma 등)이 실제 버전과 맞는지 |
| ares / Kega Fusion | `{sys}` 인수 이름(`--system "Mega CD"`, `-scd` 등) |
| 기본 설치 위치 탐색 | `installed_emus`가 실제 경로를 찾는지 |
| Switch 아이콘 | FsType 수정(0.16.7) 뒤 실제 Windows에서 아이콘이 나오는 것은 확인. NSZ·XCZ는 가짜 파일로만 확인 |
| sm2-emu | 실행(`sm2-emu.exe "롬.zip"`)과 games.xml 읽기는 실제 sm2-emu 파일로 확인. 실제 플레이는 미확인 |

## 9. 앞으로 할 만한 일

- 실제 Windows에서 8장 항목 확인하기.
- `app.js`가 커졌다(2,000줄+, 긴 줄). 기능별 파일로 나누면 좋다. 예: `launch.js`, `covers.js`, `np2.js`, `cemu.js`. 번들러가 없으므로 `<script>` 순서와 전역 이름에 주의한다.
- PC-98 기종·CPU를 게임별로 정하기(사용자에게 제안해 둔 것). `pc_model`, `cpu_fami` 등 ini 키, `np2Prepare` 패턴.
- 배포 준비: 서명, NSIS 설치판 문구, 자동 업데이트 여부 결정.
