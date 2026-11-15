# 바뀐 점

버전은 `src-tauri/tauri.conf.json`·`src-tauri/Cargo.toml`의 version. 배포판 `README.txt`의 "바뀐 점"과 같은 내용이다.

## 0.16.21

- 에뮬레이터 자동 지정 순서를 콘솔마다 에뮬레이션 정확도 순으로 바꿨습니다.
  (예: N64 ares › simple64 › gopher64 › RMG › … › Project64, PS1 Mednafen › DuckStation › …)
  이미 직접 고른 콘솔은 그대로입니다. 새 순서를 쓰려면 에뮬레이터 탭의 [모두 자동 지정으로 되돌리기]를 누르세요.
- simple64X.exe 같은 simple64 변형판을 알아봅니다. gopher64, Mupen64Plus, NanoBoyAdvance, SkyEmu, BGB, Gambatte,
  WideMelon, Panda3DS, PCSX-Redux, Play!, ClownMDEmu, Ymir, Hollycast, Geargrafx도 새로 알아봅니다.
- 실행 파일의 버전 정보(제품 이름·설명)도 봅니다.
  · 이름표에 없는 exe라도 설명에 "emulator"가 있으면 "자동 추정" 에뮬레이터로 넣고, 설명의 낱말로 콘솔을 추정합니다.
    콘솔을 모르면 에뮬레이터 탭에서 고르면 되고, 빼면 다음 스캔에서 다시 넣지 않습니다.
  · 같은 에뮬레이터가 여럿이면 제품 이름이 정확히 같은 본체를 고릅니다.
- PS2 게임이 TeknoParrot 폴더의 PCSX2x6(System 246용)로 실행되던 문제 수정. TeknoParrot 안의 에뮬레이터는
  다른 곳에 같은 에뮬레이터가 없을 때만 씁니다.

## 0.16.20

- 필터 "커버 없는 것만"에 Switch·3DS처럼 롬 속 아이콘으로 그려지는 게임이 섞여 나오던 문제 수정.
  아이콘이 있는 게임은 "커버 있는 것만" 쪽에만 나옵니다.

## 0.16.19

- BizHawk PC엔진 코어 고르기: 에뮬레이터 탭의 BizHawk 카드에서 TurboNyma·HyperNyma·PCEHawk 중 고르면,
  PC엔진·슈퍼그래픽스·CD-ROM² 게임을 실행할 때 BizHawk config.ini의 PreferredCores에 적습니다.

## 0.16.18

- Mednafen은 CHD를 읽지 못합니다 ("maximum allowed size of 67108864 bytes exceeded" 오류).
  CHD 게임은 콘솔 기본값이 Mednafen이어도 CHD를 읽는 다음 에뮬레이터로 자동 실행하고,
  게임별로 Mednafen을 직접 고른 경우에는 정보 창에 경고를 띄웁니다.

## 0.16.17

- Neko Project 21/W: haxm·whpx 폴더의 하드웨어 가속판 대신 맨 위 폴더의 보통판(np21x64w.exe)을 고릅니다
  (가속판은 드라이버가 없으면 시작할 때 "Failed to initialize the HAX device" 창이 뜸).

## 0.16.16

- Neko Project: 같은 폴더에 np2x64w(II)와 np21x64w(21/W)가 같이 있으면 np21x64w를 고릅니다.

## 0.16.15

- PC-98 하드디스크 게임(.hdi 등)이 "システムディスクをセットしてください"로 멈추던 문제 수정.
  Neko Project는 명령줄 이미지를 모두 플로피로 넣기 때문에, 하드디스크 이미지는 실행 직전에
  ini의 HDD1FILE에 적고 지난번 플로피를 비운 뒤 실행합니다. 다음에 플로피 게임을 실행하면 원래 값으로 되돌립니다.
- ini에 적는 경로는 Windows 시스템 코드 페이지로 적어서 한글·일본어 경로도 그대로 씁니다.

## 0.16.14

- PC-98 폰트를 게임별로: 게임 정보 창의 "폰트 BMP"에서 게임마다 고릅니다.
  에뮬레이터 폴더와 Font 폴더의 BMP가 목록에 나오고, 다른 파일도 고를 수 있어요.
  에뮬레이터 탭의 폰트는 "기본 폰트"(게임별로 정하지 않은 게임용)가 됐습니다.
  폰트를 정하지 않은 게임을 실행하면 ini의 fontfile을 처음 값으로 되돌립니다.

## 0.16.13

- PC-98 .hdi·.d88 등을 스캔에서 빠뜨리던 문제 수정 (스캔이 미리 정한 확장자만 모으고 있었음).
  이제 콘솔 목록의 확장자를 스캔에 그대로 넘겨서, 새 기종을 넣어도 빠지지 않습니다.
- Neko Project 폰트 BMP: 에뮬레이터 탭에서 고르면 실행할 때마다 ini의 fontfile에 적습니다.
- PC-98 압축 파일(zip 등)은 Neko Project가 열지 못한다고 정보 창에서 알려 줍니다.

## 0.16.12

- PC-98 (PC-9801 / PC-9821) 지원
  · .hdi .fdi .d88 .hdm .nfd .nhd .thd .fdd .tfd .d98 이미지, PC-98·PC9801·PC9821 폴더를 알아봅니다.
  · Neko Project 계열(np2, np21w, np21x64w, np2kai, sdlnp21kai 등)과 RetroArch np2kai 코어에 자동 연결.
  · 여러 장짜리((Disk A)/(Disk B), (Disk 1 of 3) 등)는 한 게임으로 묶고, 디스크 1·2를 FDD1·FDD2에 넣어 실행합니다.
  · 매체는 5.25인치 플로피 모양으로, 박스아트는 libretro "NEC - PC-98"에서 찾습니다.

## 0.16.11

- "한글패치"를 "한국어판"으로 바꿨습니다. 정식 한국판과 한글패치를 이름만으로 가릴 수 없어서 함께 한국어판으로 봅니다.
  알아보는 표기: kor, korea, korean, T-Kor, (K), (En,Ja,Ko)의 Ko, 한글, 한국어, 한국판, 한패
  선반 이름·필터(한국어판만)·정보 창 표시도 바뀌었습니다. 다시 스캔하면 새 기준으로 표시됩니다.

## 0.16.10

- Switch·Switch 2: 커버 없이 아이콘만 있는 게임을 패키지 앞면처럼 보여 줍니다.
  위쪽 흰 라벨(NINTENDO SWITCH, 빨간 띠) + 폭 가득 큰 아이콘 + 아래쪽에 흐린 배경과 제목.
- 가격표를 단 앞면 진열에서는 그림 커버 위의 콘솔 이름 띠를 빼고 그림을 꽉 채웁니다 (가격표에 콘솔 이름이 있어서).

## 0.16.9

- 콘솔 화면 위쪽에 [직접 정한 커버 N개 되돌리기] 버튼: 그 콘솔에서 직접 정한 커버를 한 번에 기본으로 (두 번 눌러 확인).
  쓰지 않게 된 그림 파일은 자동으로 지웁니다.
- Switch·Switch 2 화면에 [아이콘 꺼내기] 버튼: 아이콘이 없는 게임의 타이틀 아이콘을 한 번에 꺼냅니다.

## 0.16.8

- 커버를 직접 정해 둔 게임도 타이틀 아이콘을 꺼냅니다 ([다시 꺼내기]가 실패하던 문제 수정).
  화면에는 정한 커버가 먼저 나오고, 커버를 기본으로 되돌리면 꺼내 둔 아이콘이 바로 나옵니다.

## 0.16.7

- Switch 타이틀 아이콘을 실제 게임에서 못 꺼내던 문제 수정 ("control에 RomFS가 없음").
  NCA 섹션 머리글에서 RomFS 표시를 엉뚱한 바이트에서 읽고 있었습니다.

## 0.16.6

- Switch 게임 정보 창에 "타이틀 아이콘" 줄 추가: 아이콘을 못 꺼낸 이유, 쓰고 있는 prod.keys 위치, [다시 꺼내기] 버튼.
- 커버·아이콘 그림 파일을 손으로 지웠으면 그 기록을 지워서, 아이콘을 다시 꺼내고 박스아트를 다시 받습니다.

## 0.16.5

- Switch 타이틀 아이콘
  · 한 번 실패한 게임을 다시 시도하지 않던 문제 수정 (실패 기록 때문에 prod.keys를 넣어도 계속 건너뜀).
  이제 아이콘을 못 꺼낸 Switch 게임은 실행할 때마다 다시 시도합니다.
  · NSZ·XCZ(압축) 파일에서도 아이콘을 꺼냅니다.
  · 게임에 필요한 키가 prod.keys에 없으면 빠진 키 이름을 로그에 적습니다.
  · 한국어 아이콘이 있으면 먼저 씁니다.
- 안 쓰는 그림 자동 정리: 게임이 목록에서 빠지거나 커버를 기본으로 되돌리면
  어떤 게임도 쓰지 않는 그림(boxart·covers·icons)을 지웁니다.

## 0.16.4

- 창 제목과 앱 위쪽 로고 옆에 버전(예: v0.16.4)을 표시합니다.

## 0.16.3

- 통계 탭: 화면 배율이 높거나 창이 좁을 때 "최근 플레이" 표가 카드 밖으로 넘치던 문제 수정. 긴 제목은 …으로 줄입니다.

## 0.16.2

- 고정한 검색·필터 줄이 게임을 열었을 때 그 위로 겹쳐 보이던 문제 수정.

## 0.16.1

- 라이브러리 위쪽의 검색창·정렬·필터·보기 줄을 고정했습니다. 아래로 내려도 그 자리에 남아 바로 검색하고 필터를 바꿀 수 있어요.

## 0.16.0

- Wii U(Cemu) 그래픽 팩: 게임 정보 창에서 이 게임에 맞는 그래픽 팩을 켜고 끄고, 해상도·FPS 같은 프리셋을 고를 수 있습니다.
  바꾸는 즉시 Cemu settings.xml에 저장됩니다 (처음 한 번 settings.xml.retroshelf.bak으로 백업).
  Cemu가 켜져 있을 때는 바꿀 수 없어요.

## 0.15.11

- 앞면 진열: 선반에 남는 폭을 케이스 사이 간격으로 고르게 나눕니다. 한쪽만 비어 보이지 않고,
  같은 콘솔의 마지막 줄도 윗줄과 열이 맞습니다.

## 0.15.10

- FBNeo IPS 패치: 정보 창에서 원본·클론 판을 바꾸면 "IPS 패치 목록을 읽는 중…"에서 멈추던 문제 수정.
  목록을 읽지 못하면 이유를 보여 줍니다.

## 0.15.9

- 에뮬레이터 인식 전반 점검
  · 스캔 폴더 밖 기본 설치 위치(C:\Program Files 등)의 openMSX·blueMSX·Project64·Dolphin·PCSX2·PPSSPP·mGBA 등도 찾습니다.
  · 새로 알아보는 에뮬레이터: ares, Kega Fusion, Mesen-S, VisualBoyAdvance-M, NO$GBA, Nestopia, puNES, ePSXe, fMSX
  · 지원 기종 보강: Mednafen(GB·GBC), Mesen(SG-1000), blueMSX(turbo R·SG-1000), BizHawk(MSX·3DS)
  · Ryujinx.Ava.exe, mameui64.exe 이름도 알아봅니다.
  · RetroArch 코어 추가: melondsds, mesen-s, geargrafx, vbam, gpsp, kronos, mame2003_plus 등
  · 기종을 지원하는 에뮬레이터는 모두 우선순위 목록에 들어가서, 있으면 자동 지정됩니다.

## 0.15.8

- Nintendo 64: RMG(Rosalie's Mupen GUI, RMG.exe)를 찾아 자동 지정합니다.
- simple64는 simple64-gui.exe뿐 아니라 simple64.exe 이름도 알아봅니다.
  우선순위: Project64 → simple64 → RMG → RetroArch → BizHawk (콘솔 탭에서 바꿀 수 있어요)
- shadPS4는 PS4 전용으로 고쳤습니다. PS5에는 더 이상 연결되지 않습니다(PS5는 Kyty).

## 0.15.7

- 웹 이미지 검색: DuckDuckGo가 직접 요청에 202(봇 차단)를 돌려주는 문제 대응.
  앱 안의 숨은 브라우저 창으로 DuckDuckGo 이미지 페이지를 열어 결과를 받아 옵니다.

## 0.15.6

- sm2-emu 지원: 스캔 폴더 안의 sm2-emu.exe를 Model 2·Model 1 게임에 자동 연결하고
  sm2-emu.exe "롬경로\vf2.zip" 처럼 롬 파일 경로를 넘겨 실행합니다. 클론은 부모 롬이 같은 폴더에 있어야 합니다.
- sm2-emu의 games.xml로 제목·버전·연도·제조사를 채우고, Model 1 게임은 새 Model 1 칸에 진열합니다.
- 웹 이미지 검색: DuckDuckGo 접속을 Windows 자체 TLS로 바꾸고 한 번 더 시도합니다.
  그래도 Bing으로 넘어가면 실패 이유를 보여 주고 [DuckDuckGo로 다시 시도] 버튼을 띄웁니다.

## 0.15.5

- Sega Model 2 추가: 'Model 2' 이름이 들어간 폴더의 .zip을 Model 2 게임으로 분류하고
  vf2·daytona 같은 롬셋 이름을 실제 제목으로 표시합니다.
- Model 2 Emulator(emulator_multicpu.exe / emulator.exe)를 자동으로 찾아 실행합니다. 없으면 MAME.
  게임 폴더가 EMULATOR.INI [RomDirs]에 없으면 정보 창의 버튼으로 바로 추가할 수 있습니다.

## 0.15.4

- 자동으로 찾은 에뮬레이터도 실행 파일 바꾸기

## 0.15.3 이전 (요약)

대화형 세션에서 만든 기능들. 자세한 설명은 README.md 각 절.

- 기본 골격:
  - 폴더 스캔, 롬과 에뮬레이터 자동 인식
  - 콘솔별·게임별 에뮬레이터 지정
  - 진열장 화면(앞면 진열, 책등 보관, 목록), 케이스 열기 FLIP 애니메이션
  - 플레이 시간 기록
- 목록 머리 정렬, 필터, BIOS 제외
- Model 3(Supermodel)과 Kyty 지원
- 박스아트 받기(libretro-thumbnails, A/B 퍼지 매칭), 실행 실패 알림, PS5 DLC 처리
- 지역판 묶기(1G1R), 내 컬렉션, 거실 모드(패드), 케이스 뒷면, 오늘의 게임(무작위)
- 아케이드 원본·클론 계층, 온라인 커버 찾기, 진열장 앱 아이콘
- GBA 설명서·뒷면, 애니메이션 속도·끄기, 카트 라벨의 타이틀 그림
- 한글패치 배지(0.16.11부터 한국어판), CRC로 No-Intro 확인, 장르·연도 메타, 통계 탭, 진열장 테마와 앱 전체 테마
- 실제 기기 모양 카트, 케이스 색, CD 라벨 그림
- 3DS·Switch 롬 속 아이콘
- PS5·PS4·Vita 게임이 빠지던 문제 수정, 가격표, prod.keys 위치 기억
- "커버 없는 것만" 필터, 앱 안 웹 이미지 검색
- Lichii·shadPS4 exe 인식, 에뮬레이터 실행 파일 직접 바꾸기, Model 2(ElSemi)
