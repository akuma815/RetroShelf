/* RetroShelf — 콘솔·에뮬레이터 정의와 스캔 분류 로직 (DOM과 무관) */

/* h: 실제 케이스 높이(cm), aspect: 앞면 가로/세로, thick: 책등 두께(cm), kind: 케이스 재질, media: 내용물 */
const MAKERS = ['Nintendo','Sony','Sega','NEC','SNK','Bandai','Atari','MSX','Microsoft','아케이드'];
/* 실물 기기 기준으로 나눈다. h: 실제 케이스 높이(cm), aspect: 앞면 가로/세로, thick: 책등 두께(cm), kind: 케이스 재질, media: 내용물 */
const CONSOLES = [
  /* Nintendo */
  {id:'nes',   maker:'Nintendo', name:'NES / 패미컴',        short:'NES',  exts:['nes','unf','unif'], aliases:['nes','famicom','fc','nintendoentertainmentsystem'], h:17.8, aspect:.72, thick:2.6, kind:'box', media:'cart', cart:[.74,.6,'#8f9198'], band:'#b8322b', prefer:['mesen','punes','nestopia','retroarch:mesen','retroarch:nestopia','ares','mednafen','retroarch:fceumm','fceux','retroarch:quicknes','bizhawk']},
  {id:'fds',   maker:'Nintendo', name:'패미컴 디스크 시스템', short:'FDS',  exts:['fds'], aliases:['fds','famicomdisksystem','disksystem'], h:13, aspect:.75, thick:1.6, kind:'box', media:'cart', cart:[.5,.56,'#d8b32a'], band:'#c9a227', prefer:['mesen','punes','nestopia','retroarch:mesen','retroarch:nestopia','ares','mednafen','retroarch:fceumm','fceux','retroarch:quicknes','bizhawk']},
  {id:'snes',  maker:'Nintendo', name:'SNES / 슈퍼패미컴',    short:'SNES', exts:['sfc','smc'], aliases:['snes','superfamicom','sfc','supernintendo'], h:13.3, aspect:1.38, thick:3.2, kind:'box', media:'cart', cart:[.62,.66,'#a3a5ac'], band:'#5b4a9e', prefer:['bsnes','ares','mesen','retroarch:bsnes','mesens','snes9x','retroarch:snes9x','mednafen','bizhawk']},
  {id:'vb',    maker:'Nintendo', name:'버추얼 보이',          short:'VB',   exts:['vb','vboy'], aliases:['virtualboy','vb'], h:18, aspect:.8, thick:3, kind:'box', media:'cart', cart:[.5,.5,'#2a2a2e'], band:'#b0101a', prefer:['mednafen','retroarch:mednafen_vb','bizhawk']},
  {id:'n64',   maker:'Nintendo', name:'Nintendo 64',         short:'N64',  exts:['n64','z64','v64'], aliases:['n64','nintendo64'], h:13.3, aspect:1.38, thick:3.2, kind:'box', media:'cart', cart:[.56,.62,'#6c6f77'], band:'#1f7a3d', prefer:['ares','simple64','gopher64','rmg','mupen64plus','retroarch:mupen64plus_next','retroarch:parallel_n64','project64','bizhawk']},
  {id:'gb',    maker:'Nintendo', name:'게임보이',             short:'GB',   exts:['gb'], aliases:['gb','gameboy'], h:12, aspect:.9, thick:2.4, kind:'box', media:'cart', cart:[.5,.6,'#b9b8b0'], notch:true, band:'#6d7a2c', prefer:['sameboy','retroarch:sameboy','bgb','mesen','gambatte','retroarch:gambatte','mgba','retroarch:mgba','skyemu','ares','mesens','mednafen','vbam','bizhawk']},
  {id:'gbc',   maker:'Nintendo', name:'게임보이 컬러',         short:'GBC',  exts:['gbc'], aliases:['gbc','gameboycolor'], h:12, aspect:.9, thick:2.4, kind:'box', media:'cart', cart:[.5,.6,'rgba(122,82,170,.92)'], notch:true, band:'#2f8a7a', prefer:['sameboy','retroarch:sameboy','bgb','mesen','gambatte','retroarch:gambatte','mgba','retroarch:mgba','skyemu','ares','mesens','mednafen','vbam','bizhawk']},
  {id:'gba',   maker:'Nintendo', name:'게임보이 어드밴스',     short:'GBA',  exts:['gba'], aliases:['gba','gameboyadvance'], h:12.7, aspect:1.05, thick:2.4, kind:'box', media:'cart', cart:[.58,.36,'#45464f'], band:'#3f4fa8', prefer:['nanoboyadvance','mgba','retroarch:mgba','mesen','skyemu','ares','vbam','retroarch:vbam','nogba','mednafen','retroarch:gpsp','bizhawk']},
  {id:'nds',   maker:'Nintendo', name:'닌텐도 DS',            short:'NDS',  exts:['nds'], aliases:['nds','nintendods','ds'], h:13.7, aspect:.91, thick:1.4, kind:'clam', media:'cart', cart:[.32,.3,'#2b2c34'], band:'#6a6f7a', prefer:['melonds','retroarch:melondsds','retroarch:melonds','widemelon','desmume','retroarch:desmume','skyemu','nogba','bizhawk']},
  {id:'3ds',   maker:'Nintendo', name:'닌텐도 3DS',           short:'3DS',  exts:['3ds','cci','cxi','cia','3dsx','zcci','zcxi','z3dsx'], aliases:['3ds','nintendo3ds','n3ds'], h:13.7, aspect:.91, thick:1.4, kind:'clam', media:'cart', cart:[.32,.3,'#e6e6e6'], notch:true, band:'#c8202a', prefer:['azahar','lime3ds','citra','retroarch:azahar','retroarch:citra','panda3ds']},
  {id:'gc',    maker:'Nintendo', name:'게임큐브',              short:'GC',   exts:['gcm','gcz','rvz'], aliases:['gc','gamecube','ngc'], h:19, aspect:.7, thick:1.4, kind:'dvd', media:'mini', band:'#5a3f99', bandh:'13cqi', prefer:['dolphin','retroarch:dolphin']},
  {id:'wii',   maker:'Nintendo', name:'Wii',                  short:'WII',  exts:['wbfs','wad','rvz'], aliases:['wii'], h:19, aspect:.7, thick:1.4, kind:'dvd', media:'disc', band:'#8a919c', bandh:'13cqi', prefer:['dolphin','retroarch:dolphin']},
  {id:'wiiu',  maker:'Nintendo', name:'Wii U',                short:'WIIU', exts:['wud','wux','wua'], aliases:['wiiu','nintendowiiu'], h:19, aspect:.71, thick:1.4, kind:'dvd', media:'disc', band:'#1da1d6', bandh:'13cqi', prefer:['cemu']},
  {id:'switch',maker:'Nintendo', name:'Nintendo Switch',      short:'NSW',  exts:['nsp','xci','nsz','xcz','nro'], aliases:['switch','nintendoswitch','nsw','nx'], h:17, aspect:.62, thick:1.1, kind:'clam', media:'cart', cart:[.34,.3,'#2b2c34'], notch:true, band:'#d3302c', bandh:'13cqi', prefer:['ryujinx','kenjinx','eden','citron','yuzu','eglantine','lichii']},
  {id:'switch2',maker:'Nintendo',name:'Nintendo Switch 2',    short:'NS2',  exts:['nup','nsp','xci','nsz','xcz'], aliases:['switch2','nintendoswitch2','ns2','nx2','sw2'], h:17, aspect:.62, thick:1.1, kind:'clam', media:'cart', cart:[.34,.3,'#c9302c'], notch:true, band:'#7d1d2b', bandh:'13cqi', prefer:['eglantine','lichii']},
  /* Sony */
  {id:'ps1',   maker:'Sony', name:'PlayStation',      short:'PS1',  exts:['pbp'], aliases:['ps1','psx','playstation','psone'], h:12.5, aspect:1.12, thick:1.0, kind:'jewel', media:'disc', band:'#2a2d36', prefer:['mednafen','duckstation','retroarch:mednafen_psx_hw','retroarch:mednafen_psx','retroarch:swanstation','pcsxredux','retroarch:pcsx_rearmed','epsxe','ares','bizhawk']},
  {id:'ps2',   maker:'Sony', name:'PlayStation 2',    short:'PS2',  exts:[], aliases:['ps2','playstation2'], h:19, aspect:.7, thick:1.4, kind:'dvd', media:'disc', band:'#1d3f8f', bandh:'13cqi', prefer:['pcsx2','retroarch:pcsx2','play','retroarch:play']},
  {id:'ps3',   maker:'Sony', name:'PlayStation 3',    short:'PS3',  exts:[], aliases:['ps3','playstation3'], h:17, aspect:.79, thick:1.4, kind:'dvd', media:'disc', band:'#222328', bandh:'12cqi', prefer:['rpcs3']},
  {id:'ps4',   maker:'Sony', name:'PlayStation 4',    short:'PS4',  exts:[], aliases:['ps4','playstation4'], h:17, aspect:.79, thick:1.4, kind:'dvd', media:'disc', band:'#1e4fa3', bandh:'12cqi', prefer:['shadps4','kyty']},
  {id:'ps5',   maker:'Sony', name:'PlayStation 5',    short:'PS5',  exts:[], aliases:['ps5','playstation5'], h:17, aspect:.79, thick:1.4, kind:'dvd', media:'disc', band:'#3a4a78', bandh:'12cqi', prefer:['kyty']},
  {id:'psp',   maker:'Sony', name:'PSP',              short:'PSP',  exts:['cso'], aliases:['psp','playstationportable'], h:17.6, aspect:.59, thick:1.4, kind:'dvd', media:'umd', band:'#3a3d46', bandh:'13cqi', prefer:['ppsspp','retroarch:ppsspp']},
  {id:'psvita',maker:'Sony', name:'PS Vita',          short:'VITA', exts:['vpk'], aliases:['psvita','vita','psv','playstationvita'], h:13.5, aspect:.78, thick:1.1, kind:'clam', media:'cart', cart:[.3,.3,'#1d1e24'], notch:true, band:'#1f3f8f', bandh:'13cqi', prefer:['vita3k']},
  /* Sega */
  {id:'sg1000',maker:'Sega', name:'SG-1000',          short:'SG',   exts:['sg','sc'], aliases:['sg1000','sg3000','segasg1000'], h:13, aspect:.72, thick:2.2, kind:'box', media:'cart', cart:[.6,.42,'#2a2a2e'], band:'#3c3c44', prefer:['retroarch:genesis_plus_gx','mesen','ares','retroarch:gearsystem','bluemsx','fusion','bizhawk']},
  {id:'sms',   maker:'Sega', name:'마스터 시스템 / 마크 III', short:'SMS', exts:['sms'], aliases:['sms','mastersystem','segamastersystem','markiii','segamark3'], h:19, aspect:.72, thick:2.2, kind:'clam', media:'cart', cart:[.66,.48,'#1d1e22'], band:'#b02a2a', prefer:['retroarch:genesis_plus_gx','mesen','ares','retroarch:gearsystem','mednafen','retroarch:smsplus','fusion','retroarch:picodrive','bizhawk']},
  {id:'gg',    maker:'Sega', name:'게임 기어',          short:'GG',   exts:['gg'], aliases:['gg','gamegear','segagamegear'], h:12, aspect:.75, thick:1.8, kind:'clam', media:'cart', cart:[.5,.4,'#202125'], band:'#2d2d55', prefer:['retroarch:genesis_plus_gx','mesen','ares','retroarch:gearsystem','mednafen','retroarch:smsplus','fusion','bizhawk']},
  {id:'md',    maker:'Sega', name:'메가드라이브 / 제네시스', short:'MD', exts:['md','gen','smd'], aliases:['md','megadrive','genesis','segagenesis'], h:19, aspect:.72, thick:2.2, kind:'clam', media:'cart', cart:[.76,.5,'#25262c'], band:'#20232b', prefer:['blastem','retroarch:genesis_plus_gx','ares','clownmdemu','retroarch:clownmdemu','retroarch:blastem','mednafen','fusion','retroarch:picodrive','bizhawk']},
  {id:'segacd',maker:'Sega', name:'메가 CD / 세가 CD',  short:'MCD',  exts:[], aliases:['segacd','megacd','segamegacd','mcd'], h:14, aspect:1, thick:1.2, kind:'jewel', media:'disc', band:'#1f2a7a', prefer:['retroarch:genesis_plus_gx','ares','clownmdemu','retroarch:clownmdemu','fusion','retroarch:picodrive','bizhawk']},
  {id:'32x',   maker:'Sega', name:'슈퍼 32X',          short:'32X',  exts:['32x'], aliases:['32x','sega32x','super32x'], h:19, aspect:.72, thick:2.2, kind:'clam', media:'cart', cart:[.76,.5,'#1d1e22'], band:'#a82222', prefer:['ares','retroarch:picodrive','fusion','bizhawk']},
  {id:'saturn',maker:'Sega', name:'세가 새턴',          short:'SAT',  exts:[], aliases:['saturn','segasaturn'], h:12.5, aspect:1.12, thick:1.0, kind:'jewel', media:'disc', band:'#2b4f7a', prefer:['mednafen','retroarch:mednafen_saturn','ymir','retroarch:kronos','retroarch:yabasanshiro','retroarch:yabause','bizhawk']},
  {id:'dreamcast',maker:'Sega',name:'드림캐스트',        short:'DC',   exts:['cdi','gdi'], aliases:['dreamcast','dc','segadreamcast'], h:12.5, aspect:1.12, thick:1.0, kind:'jewel', media:'disc', band:'#d9541e', prefer:['flycast','retroarch:flycast','hollycast','redream']},
  {id:'naomi', maker:'Sega', name:'NAOMI',             short:'NAOMI',exts:[], aliases:['naomi','seganaomi'], h:19, aspect:.72, thick:2.6, kind:'box', media:'pcb', cart:[.8,.5,'#1f3f6e'], band:'#3b5aa8', prefer:['flycast','retroarch:flycast','hollycast']},
  {id:'naomi2',maker:'Sega', name:'NAOMI 2',           short:'NAOMI2',exts:[], aliases:['naomi2','seganaomi2'], h:19, aspect:.72, thick:2.6, kind:'box', media:'pcb', cart:[.8,.5,'#1a2f55'], band:'#2c3f7a', prefer:['flycast','retroarch:flycast','hollycast']},
  {id:'model1',maker:'Sega',name:'Model 1',             short:'M1',   exts:[], aliases:['model1','segamodel1'], h:19, aspect:.72, thick:2.6, kind:'box', media:'pcb', cart:[.8,.5,'#3a3a46'], band:'#4a6a9c', prefer:['sm2emu','mame']},
  {id:'model2',maker:'Sega',name:'Model 2',             short:'M2',   exts:[], aliases:['model2','segamodel2','m2emulator','model2emulator'], h:19, aspect:.72, thick:2.6, kind:'box', media:'pcb', cart:[.8,.5,'#3a3a46'], band:'#3b5aa8', prefer:['sm2emu','m2emu','mame']},
  {id:'model3',maker:'Sega',name:'Model 3',             short:'M3',   exts:[], aliases:['model3','segamodel3','supermodel'], h:19, aspect:.72, thick:2.6, kind:'box', media:'pcb', cart:[.8,.5,'#3a3a46'], band:'#1d6fb8', prefer:['supermodel','mame']},
  {id:'atomiswave',maker:'Sega',name:'아토미스웨이브',    short:'AW',   exts:[], aliases:['atomiswave','aw','sammyatomiswave'], h:19, aspect:.72, thick:2.6, kind:'box', media:'pcb', cart:[.8,.5,'#5e2a14'], band:'#c24a1a', prefer:['flycast','retroarch:flycast','hollycast']},
  /* NEC */
  {id:'pce',   maker:'NEC', name:'PC엔진 / 터보그래픽스-16', short:'PCE', exts:['pce'], aliases:['pce','pcengine','turbografx','turbografx16','tg16'], h:12.5, aspect:1.12, thick:1.0, kind:'jewel', media:'cart', cart:[.62,.4,'#e9e6dc'], band:'#c46a1d', prefer:['mednafen','mesen','ares','retroarch:mednafen_pce','geargrafx','retroarch:geargrafx','retroarch:mednafen_pce_fast','bizhawk']},
  {id:'sgx',   maker:'NEC', name:'PC엔진 슈퍼그래픽스', short:'SGX',  exts:['sgx'], aliases:['supergrafx','sgx','pcenginesupergrafx'], h:12.5, aspect:1.12, thick:1.0, kind:'jewel', media:'cart', cart:[.62,.4,'#d8d4c8'], band:'#5a4a8a', prefer:['mednafen','mesen','ares','retroarch:mednafen_supergrafx','retroarch:mednafen_pce','geargrafx','bizhawk']},
  {id:'pcecd', maker:'NEC', name:'PC엔진 CD-ROM² / 터보그래픽스-CD', short:'PCECD', exts:[], aliases:['pcecd','pcenginecd','pcenginecdrom','turbografxcd','tgcd','cdrom2','supercdrom'], h:12.5, aspect:1.12, thick:1.0, kind:'jewel', media:'disc', band:'#d07a2a', prefer:['mednafen','mesen','ares','retroarch:mednafen_pce','geargrafx','retroarch:geargrafx','retroarch:mednafen_pce_fast','bizhawk']},
  {id:'pcfx',  maker:'NEC', name:'PC-FX',              short:'PCFX', exts:[], aliases:['pcfx','necpcfx'], h:12.5, aspect:1.12, thick:1.0, kind:'jewel', media:'disc', band:'#7a2a5a', prefer:['mednafen','retroarch:mednafen_pcfx']},
  /* PC-98: 플로피(.fdi .d88 .hdm .nfd …)·하드디스크(.hdi .nhd .thd) 이미지. .d88은 PC-88 등과 같이 쓰니 폴더 이름이 우선 */
  {id:'pc98',  maker:'NEC', name:'PC-9801 / PC-9821',   short:'PC98', exts:['hdi','fdi','d98','98d','hdm','nfd','nhd','thd','fdd','tfd','d88','88d'], aliases:['pc98','pc9801','pc9821','pc98x1','necpc98','pc9800'], h:19, aspect:.72, thick:2.6, kind:'box', media:'cart', cart:[.62,.62,'#1d1d22'], band:'#2f6d9a', prefer:['np2','retroarch:np2kai']},
  /* SNK */
  {id:'neocd', maker:'SNK', name:'네오지오 CD',          short:'NGCD', exts:[], aliases:['neogeocd','neocd','snkneogeocd'], h:12.5, aspect:1.12, thick:1.0, kind:'jewel', media:'disc', band:'#8a1c1c', prefer:['retroarch:neocd']},
  {id:'ngp',   maker:'SNK', name:'네오지오 포켓',        short:'NGP',  exts:['ngp'], aliases:['ngp','neogeopocket'], h:11, aspect:.8, thick:1.8, kind:'box', media:'cart', cart:[.42,.32,'#2b2b2b'], band:'#3a3a3a', prefer:['mednafen','ares','retroarch:mednafen_ngp','retroarch:race','bizhawk']},
  {id:'ngpc',  maker:'SNK', name:'네오지오 포켓 컬러',   short:'NGPC', exts:['ngc'], aliases:['ngpc','neogeopocketcolor'], h:11, aspect:.8, thick:1.8, kind:'box', media:'cart', cart:[.42,.32,'#3b3b46'], band:'#2a5aa8', prefer:['mednafen','ares','retroarch:mednafen_ngp','retroarch:race','bizhawk']},
  /* Bandai */
  {id:'ws',    maker:'Bandai', name:'원더스완',          short:'WS',   exts:['ws'], aliases:['ws','wonderswan'], h:11, aspect:.8, thick:1.8, kind:'box', media:'cart', cart:[.46,.34,'#3a3a40'], band:'#5a6a7a', prefer:['mesen','ares','mednafen','retroarch:mednafen_wswan','bizhawk']},
  {id:'wsc',   maker:'Bandai', name:'원더스완 컬러',      short:'WSC',  exts:['wsc'], aliases:['wsc','wonderswancolor','swancrystal'], h:11, aspect:.8, thick:1.8, kind:'box', media:'cart', cart:[.46,.34,'#2d3a5a'], band:'#2a7aa8', prefer:['mesen','ares','mednafen','retroarch:mednafen_wswan','bizhawk']},
  /* Atari */
  {id:'a2600', maker:'Atari', name:'아타리 2600',        short:'2600', exts:['a26'], aliases:['atari2600','a2600','2600','vcs'], h:19, aspect:.72, thick:2.6, kind:'box', media:'cart', cart:[.6,.5,'#2a2420'], band:'#7a4a1a', prefer:['stella','retroarch:stella','ares','retroarch:stella2014','bizhawk']},
  {id:'a7800', maker:'Atari', name:'아타리 7800',        short:'7800', exts:['a78'], aliases:['atari7800','a7800','7800'], h:19, aspect:.72, thick:2.6, kind:'box', media:'cart', cart:[.6,.5,'#2a2a2e'], band:'#8a2a2a', prefer:['retroarch:prosystem','bizhawk']},
  {id:'lynx',  maker:'Atari', name:'아타리 링크스',      short:'LYNX', exts:['lnx'], aliases:['lynx','atarilynx'], h:17, aspect:.72, thick:2.2, kind:'box', media:'cart', cart:[.5,.3,'#5a5a60'], band:'#444a55', prefer:['retroarch:holani','mednafen','retroarch:mednafen_lynx','retroarch:handy','bizhawk']},
  /* MSX (규격별로 나눔) */
  {id:'msx',   maker:'MSX', name:'MSX',               short:'MSX',  exts:['mx1'], aliases:['msx','msx1'], h:17, aspect:.72, thick:2.2, kind:'box', media:'cart', cart:[.6,.42,'#2a2a2e'], band:'#2a5aa8', prefer:['openmsx','bluemsx','retroarch:bluemsx','ares','fmsx','retroarch:fmsx']},
  {id:'msx2',  maker:'MSX', name:'MSX2 / MSX2+',      short:'MSX2', exts:['mx2'], aliases:['msx2','msx2plus'], h:17, aspect:.72, thick:2.2, kind:'box', media:'cart', cart:[.6,.42,'#2a2a2e'], band:'#7a2a9a', prefer:['openmsx','bluemsx','retroarch:bluemsx','ares','fmsx','retroarch:fmsx']},
  {id:'turbor',maker:'MSX', name:'MSX turbo R',       short:'TR',   exts:[], aliases:['turbor','msxturbor'], h:17, aspect:.72, thick:2.2, kind:'box', media:'cart', cart:[.6,.42,'#2a2a2e'], band:'#b02a6a', prefer:['openmsx','bluemsx']},
  /* Microsoft */
  {id:'xbox',  maker:'Microsoft', name:'Xbox',         short:'XBOX', exts:['xbe'], aliases:['xbox','microsoftxbox','xb'], h:19, aspect:.71, thick:1.4, kind:'dvd', media:'disc', band:'#2d7d2d', bandh:'13cqi', prefer:['xemu','cxbx']},
  {id:'xbox360',maker:'Microsoft',name:'Xbox 360',     short:'X360', exts:['xex','zar'], aliases:['xbox360','x360'], h:19, aspect:.71, thick:1.4, kind:'dvd', media:'disc', band:'#5fa33a', bandh:'13cqi', prefer:['xenia']},
  /* 아케이드 */
  {id:'arcade',maker:'아케이드', name:'아케이드 (MAME·FBNeo)', short:'ARC', exts:[], aliases:['arcade','mame','fbneo','fba','neogeo','cps1','cps2','cps3'], h:19, aspect:.72, thick:2.6, kind:'box', media:'pcb', cart:[.8,.5,'#1f5e3a'], band:'#8f2a5e', prefer:['mame','retroarch:mame','fbneo','retroarch:fbneo','bizhawk']},
  /* PC 기반 아케이드: 게임은 TeknoParrot의 UserProfiles 프로필로 등록된다 */
  {id:'teknoparrot',maker:'아케이드', name:'PC 기반 아케이드 (TeknoParrot)', short:'TP', exts:[], aliases:[], h:19, aspect:.72, thick:2.6, kind:'box', media:'pcb', cart:[.8,.5,'#3a2a10'], band:'#b8860b', prefer:['teknoparrot']},
];
const UNKNOWN = {id:'unknown', maker:'', name:'미분류', short:'???', exts:[], aliases:[], h:17, aspect:.75, thick:2, kind:'box', media:'disc', band:'#555a66', prefer:[]};
const CONS = Object.fromEntries([...CONSOLES, UNKNOWN].map(c=>[c.id,c]));
const AMBIG = ['iso','chd','cue','bin','img','zip','7z','m3u','ccd','mdf','rom','dsk','cas'];
const IMAGE_EXT = ['png','jpg','jpeg','webp'];
const EXTMAP = {};
CONSOLES.forEach(c=>c.exts.forEach(e=>(EXTMAP[e]=EXTMAP[e]||[]).push(c.id)));

/* 에뮬레이터: re는 확장자를 뺀 실행 파일 이름에 대해 검사, args는 기본 실행 인수 */
/* 에뮬레이터: re는 확장자를 뺀 실행 파일 이름, args는 기본 실행 인수.
   에뮬레이터 자체 설정(전체화면, 해상도, 조작 등)을 덮어쓰는 인수는 넣지 않는다.
   -batch / -b / --no-gui 는 게임을 끄면 에뮬레이터도 닫히게 해서 플레이 시간을 잴 수 있게 하는 것뿐이다. */
const EMUS = {
  retroarch:{name:'RetroArch',  re:/^retroarch$/i, consoles:[], args:'-L "{core}" "{rom}"'},
  duckstation:{name:'DuckStation', re:/^duckstation/i, consoles:['ps1'], args:'-batch -- "{rom}"'},
  pcsx2:{name:'PCSX2', re:/^pcsx2/i, consoles:['ps2'], args:'-batch -- "{rom}"'},
  rpcs3:{name:'RPCS3', re:/^rpcs3$/i, consoles:['ps3'], args:'--no-gui "{rom}"'},
  /* Kyty: --game 뒤에 게임 폴더(eboot.bin·sce_sys가 있는 곳)를 준다 */
  kyty:{name:'Kyty', re:/^kyty(_emulator)?$/i, consoles:['ps4','ps5'], args:'--game "{game}"'},
  shadps4:{name:'shadPS4', re:/^shadps4$/i, consoles:['ps4'], args:'-g "{rom}"'},
  dolphin:{name:'Dolphin', re:/^dolphin$/i, consoles:['gc','wii'], args:'-b -e "{rom}"'},
  /* Vita3K: .vpk·게임 폴더는 경로로 넘기면 설치 후 실행, 이미 설치된 게임은 -r 타이틀ID */
  vita3k:{name:'Vita3K', re:/^vita3k$/i, consoles:['psvita'], args:'{vitaboot}'},
  ppsspp:{name:'PPSSPP', re:/^ppsspp/i, consoles:['psp'], args:'"{rom}"'},
  mgba:{name:'mGBA', re:/^mgba(-qt)?$/i, consoles:['gb','gbc','gba'], args:'"{rom}"'},
  sameboy:{name:'SameBoy', re:/^sameboy$/i, consoles:['gb','gbc'], args:'"{rom}"'},
  melonds:{name:'melonDS', re:/^melonds$/i, consoles:['nds'], args:'"{rom}"'},
  desmume:{name:'DeSmuME', re:/^desmume/i, consoles:['nds'], args:'"{rom}"'},
  ryujinx:{name:'Ryujinx', re:/^ryujinx(\.ava)?$/i, consoles:['switch'], args:'"{rom}"'},
  kenjinx:{name:'KenjiNX', re:/^kenji-?nx$/i, consoles:['switch'], args:'"{rom}"'},
  eden:{name:'Eden', re:/^eden$/i, consoles:['switch'], args:'-g "{rom}"'},
  citron:{name:'Citron', re:/^citron$/i, consoles:['switch'], args:'-g "{rom}"'},
  yuzu:{name:'yuzu 계열', re:/^(yuzu|suyu|sudachi|torzu)$/i, consoles:['switch'], args:'-g "{rom}"'},
  eglantine:{name:'Eglantine', re:/^eglantine/i, consoles:['switch2','switch'], args:'"{rom}"'},
  lichii:{name:'Lichii', re:/^lichii$/i, consoles:['switch2','switch'], args:'"{rom}"'},
  xemu:{name:'xemu', re:/^xemu$/i, consoles:['xbox'], args:'-dvd_path "{rom}"'},
  cxbx:{name:'Cxbx-Reloaded', re:/^cxbx/i, consoles:['xbox'], args:'"{rom}"'},
  xenia:{name:'Xenia', re:/^xenia(_canary)?$/i, consoles:['xbox360'], args:'"{rom}"'},
  mesen:{name:'Mesen', re:/^mesen$/i, consoles:['nes','fds','snes','gb','gbc','gba','pce','sgx','pcecd','sg1000','sms','gg','ws','wsc'], args:'"{rom}"'},
  fceux:{name:'FCEUX', re:/^fceux/i, consoles:['nes','fds'], args:'"{rom}"'},
  snes9x:{name:'Snes9x', re:/^snes9x/i, consoles:['snes'], args:'"{rom}"'},
  bsnes:{name:'bsnes', re:/^bsnes/i, consoles:['snes'], args:'"{rom}"'},
  project64:{name:'Project64', re:/^project64$/i, consoles:['n64'], args:'"{rom}"'},
  simple64:{name:'simple64', re:/^simple64(x)?(-gui)?$/i, consoles:['n64'], args:'"{rom}"'},
  gopher64:{name:'gopher64', re:/^gopher64$/i, consoles:['n64'], args:'"{rom}"'},
  mupen64plus:{name:'Mupen64Plus', re:/^mupen64plus(-ui-console)?$/i, consoles:['n64'], args:'"{rom}"'},
  rmg:{name:"Rosalie's Mupen GUI (RMG)", re:/^rmg$/i, consoles:['n64'], args:'"{rom}"'},
  blastem:{name:'BlastEm', re:/^blastem$/i, consoles:['md'], args:'"{rom}"'},
  mednafen:{name:'Mednafen', re:/^mednafen$/i, consoles:['pce','sgx','pcecd','pcfx','saturn','ps1','md','sms','gg','gb','gbc','gba','nes','fds','snes','vb','ngp','ngpc','ws','wsc','lynx'], args:'"{rom}"'},
  /* Flycast: 드림캐스트, NAOMI, NAOMI 2, 아토미스웨이브 */
  flycast:{name:'Flycast', re:/^flycast$/i, consoles:['dreamcast','naomi','naomi2','atomiswave'], args:'"{rom}"'},
  /* Supermodel: Sega Model 3. 설정(Config\\Supermodel.ini)과 Games.xml은 exe 폴더 기준이라 그대로 쓴다 */
  /* Model 2 Emulator (ElSemi): 롬셋 이름만 받고 EMULATOR.INI [RomDirs]의 폴더에서 찾는다. exe 이름이 흔해서 폴더 이름도 본다 */
  /* sm2-emu: Model 1·2 에뮬레이터. 사용법: sm2-emu [options] [rom.zip] — 롬 파일 경로를 그대로 받는다.
     설정(sm2-emu.ini)은 exe 폴더 기준. 같은 폴더의 games.xml에 제목·원본/클론·연도가 있다 */
  sm2emu:{name:'sm2-emu', re:/^sm2-emu$/i, consoles:['model2','model1'], args:'"{rom}"'},
  m2emu:{name:'Model 2 Emulator', re:/^emulator(_multicpu)?$/i, dirRe:/model\s*2|m2\s*emu|m2emulator/i, consoles:['model2'], args:'{lname}'},
  /* Neko Project II 계열: np2·np21·np21w·np21x64w·np2nt·np2kai·sdlnp21kai … 인자로 준 이미지를 FDD1·FDD2 (하드디스크 이미지는 HDD)로 연다 */
  np2:{name:'Neko Project', re:/^(sdl)?np2(1)?(x64)?(w|nt|kai)?(x64)?$/i, consoles:['pc98'], args:'"{rom}" {rom2}'},
  supermodel:{name:'Supermodel', re:/^supermodel$/i, consoles:['model3'], args:'"{rom}"'},
  redream:{name:'Redream', re:/^redream$/i, consoles:['dreamcast'], args:'"{rom}"'},
  cemu:{name:'Cemu', re:/^cemu$/i, consoles:['wiiu'], args:'-g "{rom}"'},
  azahar:{name:'Azahar', re:/^azahar(-qt)?$/i, consoles:['3ds'], args:'"{rom}"'},
  lime3ds:{name:'Lime3DS', re:/^lime3ds(-gui|-qt)?$/i, consoles:['3ds'], args:'"{rom}"'},
  citra:{name:'Citra', re:/^citra(-qt)?$/i, consoles:['3ds'], args:'"{rom}"'},
  /* MSX: 파일을 그대로 넘기면 확장자로 카트리지·디스크·테이프를 알아서 넣는다 */
  openmsx:{name:'openMSX', re:/^openmsx$/i, consoles:['msx','msx2','turbor'], args:'"{rom}"'},
  bluemsx:{name:'blueMSX', re:/^bluemsx$/i, consoles:['msx','msx2','turbor','sg1000'], args:'"{rom}"'},
  /* TeknoParrot: UserProfiles 안의 프로필 이름으로 실행 */
  teknoparrot:{name:'TeknoParrot', re:/^teknoparrotui$/i, consoles:['teknoparrot'], args:'--profile={profile}'},
  stella:{name:'Stella', re:/^stella$/i, consoles:['a2600'], args:'"{rom}"'},
  /* MAME: 게임 폴더를 mame.ini의 rompath 앞에 붙여서 기존 ROM 경로(BIOS 등)도 그대로 쓴다 */
  mame:{name:'MAME', re:/^mame(ui)?(64)?$/i, consoles:['arcade','model1','model2','model3'], args:'-rompath "{dir};{inirompath}" {name}'},
  /* FBNeo 단독판은 파일 경로를 받지 않고 드라이버 이름(예: sf2)만 받는다. ROM은 FBNeo에 등록된 ROM 폴더에서 찾는다 */
  fbneo:{name:'FBNeo', re:/^fbneo(64)?$/i, consoles:['arcade'], args:'{lname}'},
  /* ares: 여러 기종. {sys}는 --system "기종 이름"으로 바뀐다 (.cue·.bin처럼 확장자로 기종을 모를 때 필요) */
  ares:{name:'ares', re:/^ares$/i, consoles:['nes','fds','snes','n64','gb','gbc','gba','sg1000','sms','gg','md','segacd','32x','pce','sgx','pcecd','ngp','ngpc','ws','wsc','msx','msx2','ps1','a2600'], args:'{sys} "{rom}"',
    sys:{nes:['--system','Famicom'],fds:['--system','Famicom Disk System'],snes:['--system','Super Famicom'],n64:['--system','Nintendo 64'],gb:['--system','Game Boy'],gbc:['--system','Game Boy Color'],gba:['--system','Game Boy Advance'],
      sg1000:['--system','SG-1000'],sms:['--system','Master System'],gg:['--system','Game Gear'],md:['--system','Mega Drive'],segacd:['--system','Mega CD'],'32x':['--system','Mega 32X'],pce:['--system','PC Engine'],sgx:['--system','SuperGrafx'],pcecd:['--system','PC Engine CD'],
      ngp:['--system','Neo Geo Pocket'],ngpc:['--system','Neo Geo Pocket Color'],ws:['--system','WonderSwan'],wsc:['--system','WonderSwan Color'],msx:['--system','MSX'],msx2:['--system','MSX2'],ps1:['--system','PlayStation'],a2600:['--system','Atari 2600']}},
  /* Kega Fusion: 기종 스위치(-gen/-scd/-32x/-sms/-gg) 뒤에 파일. exe 이름(Fusion)이 흔해서 폴더 이름도 본다 */
  fusion:{name:'Kega Fusion', re:/^fusion$/i, dirRe:/fusion|kega/i, consoles:['sg1000','sms','gg','md','segacd','32x'], args:'{sys} "{rom}"',
    sys:{sg1000:['-sms'],sms:['-sms'],gg:['-gg'],md:['-gen'],segacd:['-scd'],'32x':['-32x']}},
  mesens:{name:'Mesen-S', re:/^mesen-s$/i, consoles:['snes','gb','gbc'], args:'"{rom}"'},
  vbam:{name:'VisualBoyAdvance-M', re:/^(visualboyadvance-m|vbam)$/i, consoles:['gb','gbc','gba'], args:'"{rom}"'},
  nogba:{name:'NO$GBA', re:/^no\$gba$/i, consoles:['gba','nds'], args:'"{rom}"'},
  nestopia:{name:'Nestopia', re:/^nestopia$/i, consoles:['nes','fds'], args:'"{rom}"'},
  punes:{name:'puNES', re:/^punes(64)?$/i, consoles:['nes','fds'], args:'"{rom}"'},
  epsxe:{name:'ePSXe', re:/^epsxe$/i, consoles:['ps1'], args:'-nogui -loadbin "{rom}"'},
  fmsx:{name:'fMSX', re:/^fmsx$/i, consoles:['msx','msx2'], args:'"{rom}"'},
  /* 정확도가 높은 단독 에뮬레이터들 (0.16.21). 실행 인수는 롬 경로 하나를 받는 보통 방식으로 두었다 */
  bgb:{name:'BGB', re:/^bgb(64)?$/i, consoles:['gb','gbc'], args:'"{rom}"'},
  gambatte:{name:'Gambatte', re:/^gambatte(_qt)?(_nonpsr)?$/i, consoles:['gb','gbc'], args:'"{rom}"'},
  nanoboyadvance:{name:'NanoBoyAdvance', re:/^nanoboyadvance/i, consoles:['gba'], args:'"{rom}"'},
  skyemu:{name:'SkyEmu', re:/^skyemu$/i, consoles:['gb','gbc','gba','nds'], args:'"{rom}"'},
  widemelon:{name:'WideMelon', re:/^widemelon/i, consoles:['nds'], args:'"{rom}"'},
  panda3ds:{name:'Panda3DS', re:/^(alber|panda3ds)$/i, consoles:['3ds'], args:'"{rom}"'},
  pcsxredux:{name:'PCSX-Redux', re:/^pcsx-redux/i, consoles:['ps1'], args:'-run -iso "{rom}"'},
  play:{name:'Play!', re:/^play$/i, dirRe:/play|purei/i, consoles:['ps2'], args:'--disc "{rom}"'},
  clownmdemu:{name:'ClownMDEmu', re:/^clownmdemu/i, consoles:['md','segacd'], args:'"{rom}"'},
  ymir:{name:'Ymir', re:/^ymir(-sdl3)?$/i, consoles:['saturn'], args:'"{rom}"'},
  hollycast:{name:'Hollycast', re:/^hollycast$/i, consoles:['dreamcast','naomi','naomi2','atomiswave'], args:'"{rom}"'},
  geargrafx:{name:'Geargrafx', re:/^geargrafx$/i, consoles:['pce','sgx','pcecd'], args:'"{rom}"'},
  /* BizHawk: 파일 경로를 마지막 인수로 받는다 (File > Open과 같음) */
  bizhawk:{name:'BizHawk', re:/^emuhawk$/i, consoles:['nes','fds','snes','gb','gbc','gba','n64','nds','vb','sg1000','sms','gg','md','segacd','32x','saturn','pce','sgx','pcecd','ps1','ngp','ngpc','ws','wsc','a2600','a7800','lynx','msx','3ds','arcade'], args:'"{rom}"'},
};
const CORES = {
  mesen:['nes','fds'], nestopia:['nes','fds'], fceumm:['nes','fds'], snes9x:['snes'], bsnes:['snes'], gambatte:['gb','gbc'], sameboy:['gb','gbc'],
  mgba:['gb','gbc','gba'], mupen64plus_next:['n64'], parallel_n64:['n64'], melonds:['nds'], desmume:['nds'], citra:['3ds'], mednafen_vb:['vb'],
  genesis_plus_gx:['md','segacd','sms','gg','sg1000'], picodrive:['md','segacd','32x','sms'], gearsystem:['sms','gg','sg1000'], smsplus:['sms','gg'],
  mednafen_pce_fast:['pce','pcecd'], mednafen_pce:['pce','pcecd','sgx'], mednafen_supergrafx:['sgx','pce','pcecd'], mednafen_pcfx:['pcfx'],
  mednafen_saturn:['saturn'], yabasanshiro:['saturn'], flycast:['dreamcast','naomi','naomi2','atomiswave'],
  mednafen_psx_hw:['ps1'], swanstation:['ps1'], pcsx_rearmed:['ps1'], pcsx2:['ps2'], ppsspp:['psp'], dolphin:['gc','wii'],
  neocd:['neocd'], mednafen_ngp:['ngp','ngpc'], race:['ngp','ngpc'], mednafen_wswan:['ws','wsc'],
  handy:['lynx'], mednafen_lynx:['lynx'], stella:['a2600'], stella2014:['a2600'], prosystem:['a7800'],
  np2kai:['pc98'],
  bluemsx:['msx','msx2','turbor','sg1000'], fmsx:['msx','msx2'],
  mame:['arcade'], fbneo:['arcade'],
  /* 이름이 다른 판·후속 코어 */
  quicknes:['nes'], 'mesen-s':['snes','gb','gbc'], snes9x2010:['snes'], snes9x2005:['snes'], snes9x2005_plus:['snes'], snes9x2002:['snes'],
  bsnes_hd_beta:['snes'], bsnes2014_accuracy:['snes'], bsnes2014_balanced:['snes'], bsnes2014_performance:['snes'], bsnes_mercury_accuracy:['snes'], bsnes_mercury_balanced:['snes'], bsnes_mercury_performance:['snes'],
  gearboy:['gb','gbc'], tgbdual:['gb','gbc'], vbam:['gb','gbc','gba'], vba_next:['gba'], gpsp:['gba'], mednafen_gba:['gba'], mupen64plus:['n64'],
  melondsds:['nds'], desmume2015:['nds'], azahar:['3ds'], genesis_plus_gx_wide:['md','segacd','sms','gg','sg1000'], blastem:['md'], clownmdemu:['md','segacd'],
  mednafen_psx:['ps1'], duckstation:['ps1'], play:['ps2'], kronos:['saturn'], yabause:['saturn'], geargrafx:['pce','sgx','pcecd'], holani:['lynx'],
  mame2003_plus:['arcade'], mame2003:['arcade'], mame2010:['arcade'], mame2015:['arcade'], mame2016:['arcade'], mame2000:['arcade'], fbalpha2012:['arcade'],
};
for(const c of CONSOLES){
  const extra=[...Object.entries(EMUS).filter(([k,e])=>k!=='retroarch'&&e.consoles.includes(c.id)).map(([k])=>k),
    ...Object.entries(CORES).filter(([,v])=>v.includes(c.id)).map(([k])=>'retroarch:'+k)].filter(k=>!c.prefer.includes(k));
  const bi=c.prefer.indexOf('bizhawk'); if(bi>=0) c.prefer.splice(bi,0,...extra.filter(k=>k!=='bizhawk')); else c.prefer.push(...extra);
}
const EXEC_EXT = ['exe','appimage',''];

/* ---------- 유틸 ---------- */
/* 실행 파일 고르기 점수: 64비트 우선, ARM64·디버그·명령줄 전용판은 뒤로 */
/* 에뮬레이터 본체가 아닌 실행 파일 (업데이터·설치·제거·충돌 보고 등) */
const HELPER_EXE=/(^|[-_ .])(updater|update|autoupdate|uninst(all)?|unins\d*|setup|install(er)?|crashpad|crash_?handler|crashreport(er)?|reporter|helper|service|vcredist)([-_ .\d]|$)/i;
function exeScore(base){let s=0; const b=base.toLowerCase(); if(/multicpu/.test(b))s+=2;
  if(/arm64|aarch64/.test(b))s-=10; if(/headless|nogui|-cli|_cli|debug|sdl2?$/.test(b))s-=4; if(/64/.test(b))s+=2; if(/qt/.test(b))s+=1; if(/^(sdl)?np21/.test(b))s+=3;  /* Neko Project: II보다 21(/W) */ return s}
/* 버전 정보의 파일 이름에서 확장자 떼기 (NOTEPAD.EXE.MUI → NOTEPAD) */
const exeStem=s=>String(s).trim().replace(/\.mui$/i,'').replace(/\.(exe|dll|appimage)$/i,'');
/* 같은 에뮬레이터 후보가 여럿일 때: 버전 정보의 제품 이름이 에뮬레이터 이름과 똑같으면 본체로 보고 앞으로,
   이름 뒤에 뭔가 더 붙은 파생판(PCSX2 → PCSX2x6 SYSTEM246 등)은 뒤로 */
function infoScore(inf,name){
  if(!inf||!inf.product) return 0;
  const p=norm(inf.product), n=norm(name);
  if(!n) return 0;
  if(p===n) return 3;
  if(p.startsWith(n)&&/^[a-z0-9]/.test(p.slice(n.length))) return -2;
  return 0;
}
/* 에뮬레이터가 아닌 도구 (프런트엔드·런처·관리자·변환기 등) */
const EMU_TOOL=/front-?end|launcher|manager|download|convert|patch|tool|utilit|setup|install|config|server|room|debug|test|benchmark|bootstrap|editor|viewer|dumper|extract|decrypt|packer|\bgui for\b/i;
/* 설명·제품 이름의 기종 낱말 → 콘솔. 위에서부터 보고, 더 구체적인 이름(슈퍼패미컴, 게임보이 어드밴스…)을 먼저 지운다 */
const TEXT_CONSOLES=[
  [/super\s*(nintendo|famicom)|\bsnes\b|\bsfc\b/,['snes']],
  [/famicom\s*disk|\bfds\b/,['fds']],
  [/nintendo\s*64|\bn64\b|mupen/,['n64']],
  [/game\s*boy\s*advance|\bgba\b/,['gba']],
  [/game\s*boy\s*colou?r|\bgbc\b/,['gbc']],
  [/game\s*boy|\bgb\b/,['gb','gbc']],
  [/\b3ds\b/,['3ds']],
  [/nintendo\s*ds|\bnds\b/,['nds']],
  [/\bnes\b|famicom|nintendo\s*entertainment/,['nes','fds']],
  [/virtual\s*boy/,['vb']],
  [/gamecube|game\s*cube/,['gc']],
  [/\bwii\s*u\b/,['wiiu']],
  [/\bwii\b/,['wii']],
  [/switch\s*2/,['switch2']],
  [/\bswitch\b/,['switch']],
  [/playstation\s*portable|\bpsp\b/,['psp']],
  [/playstation\s*vita|\bps\s*vita\b|\bvita\b/,['psvita']],
  [/playstation\s*2|\bps2\b/,['ps2']],
  [/playstation\s*3|\bps3\b/,['ps3']],
  [/playstation\s*4|\bps4\b/,['ps4']],
  [/playstation\s*5|\bps5\b/,['ps5']],
  [/playstation|\bpsx\b|\bps1\b/,['ps1']],
  [/sega\s*cd|mega\s*cd/,['segacd']],
  [/\b32x\b/,['32x']],
  [/mega\s*drive|genesis/,['md']],
  [/master\s*system|\bsms\b/,['sms']],
  [/game\s*gear/,['gg']],
  [/sg-?1000/,['sg1000']],
  [/saturn/,['saturn']],
  [/dreamcast/,['dreamcast']],
  [/naomi\s*2/,['naomi2']],
  [/naomi/,['naomi']],
  [/atomiswave/,['atomiswave']],
  [/supergrafx/,['sgx']],
  [/pc\s*engine|turbo\s*grafx|\bpce\b/,['pce','pcecd']],
  [/pc-?fx/,['pcfx']],
  [/pc-?98|pc-?98[02]1/,['pc98']],
  [/wonder\s*swan/,['ws','wsc']],
  [/neo\s*geo\s*pocket|\bngpc?\b/,['ngp','ngpc']],
  [/neo\s*geo\s*cd/,['neocd']],
  [/lynx/,['lynx']],
  [/atari\s*2600|\bvcs\b/,['a2600']],
  [/atari\s*7800/,['a7800']],
  [/\bmsx\s*2|\bmsx2\b/,['msx2']],
  [/\bmsx\b/,['msx','msx2']],
  [/xbox\s*360/,['xbox360']],
  [/xbox/,['xbox']],
  [/arcade|\bmame\b/,['arcade']],
];
function consolesFromText(text){
  let t=' '+text.toLowerCase()+' '; const out=[];
  for(const [re,ids] of TEXT_CONSOLES){ const g=new RegExp(re.source,'g'); if(g.test(t)){ ids.forEach(i=>{if(!out.includes(i))out.push(i)}); t=t.replace(g,' ') } }
  return out.filter(id=>CONSOLES.some(c=>c.id===id));
}
/* 이름표(EMUS)에 없는 실행 파일 가운데 버전 정보에 "emulator"가 들어 있는 것을 에뮬레이터로 추정한다.
   기종은 설명·제품 이름·파일 이름·폴더 이름의 낱말로 고르고, 모르면 빈 목록(사용자가 에뮬레이터 탭에서 고름) */
function guessEmu(p,inf){
  if(!inf||HELPER_EXE.test(p.base)||EMU_TOOL.test(p.base)) return null;
  const meta=[inf.product,inf.desc].filter(Boolean).join(' · ');
  if(!/emulat/i.test(meta)||EMU_TOOL.test(meta)) return null;
  const name=[inf.product,inf.desc,p.base].filter(Boolean).sort((a,b)=>a.length-b.length)[0];
  return {name, desc:meta, consoles:consolesFromText(meta+' '+p.base+' '+(p.dirs[p.dirs.length-1]||''))};
}
function hashStr(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let a=seed;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const norm = s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
function splitPath(p){const parts=p.replace(/\\/g,'/').split('/');const file=parts.pop();const dot=file.lastIndexOf('.');
  return {dir:parts.join('/'),dirs:parts,file,base:dot>0?file.slice(0,dot):file,ext:dot>0?file.slice(dot+1).toLowerCase():''}}
function fileUrl(p){
  const s=p.replace(/\\/g,'/');
  const enc=s.split('/').map((seg,i)=>(i===0&&/^[A-Za-z]:$/.test(seg))?seg:encodeURIComponent(seg)).join('/');
  return s.startsWith('/') ? 'file://'+enc : 'file:///'+enc;
}
/* 따옴표를 지원하는 인수 분해: -L "{core}" "{rom}" → ['-L','{core}','{rom}'] */
function tokenize(s){const out=[];const re=/"([^"]*)"|(\S+)/g;let m;while((m=re.exec(s)))out.push(m[1]!==undefined?m[1]:m[2]);return out}

const ALIASES = CONSOLES.flatMap(c=>c.aliases.map(a=>({a,id:c.id}))).sort((x,y)=>y.a.length-x.a.length);
/* 가장 깊은 폴더부터 이름으로 콘솔을 추정 */
function consoleFromDirs(dirs){
  for(let i=dirs.length-1;i>=0;i--){
    const raw=dirs[i]; const n=norm(raw); const toks=raw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    for(const {a,id} of ALIASES){ if(a.length<4 ? (toks.includes(a)||n===a) : n.includes(a)) return id; }
  }
  return null;
}
/* 파일 이름에서 제목/지역/디스크 번호 추출 */
function parseName(base){
  const dm = base.match(/[\(\[](?:disc|disk|cd)\s*([0-9]+|[a-h])(?![a-z0-9])/i);
  const disc = dm ? (/^\d+$/.test(dm[1]) ? dm[1] : String(dm[1].toLowerCase().charCodeAt(0)-96)) : null;
  const tagStr = [...base.matchAll(/\(([^)]*)\)/g)].map(m=>m[1].toLowerCase()).join(',');
  const R=[];
  if(/japan/.test(tagStr))R.push('JP'); if(/usa/.test(tagStr))R.push('US'); if(/europe/.test(tagStr))R.push('EU'); if(/korea/.test(tagStr))R.push('KR'); if(/world/.test(tagStr))R.push('WW');
  // 지역·언어·디스크가 아닌 표기는 버전으로 (Beta 1, Rev 1, Proto, Hack 등)
  const REGION=/^(usa|japan|europe|world|korea|asia|australia|brazil|canada|china|france|germany|hong kong|italy|netherlands|spain|sweden|taiwan|uk|[a-z]{1,3})(,\s*(usa|japan|europe|world|korea|asia|australia|brazil|canada|china|france|germany|hong kong|italy|netherlands|spain|sweden|taiwan|uk|[a-z]{1,3}))*$/i;
  const variant=[...base.matchAll(/[\(\[]([^\)\]]*)[\)\]]/g)].map(m=>m[1].trim())
    .filter(v=>v&&!/^(disc|disk|cd)\s*([0-9]+|[a-h])(?![a-z0-9])/i.test(v)&&!REGION.test(v)&&!/^[A-Z][a-z]([,+][A-Z][a-z])*$/.test(v)&&!/^!$/.test(v)&&!/^[0-9A-F]{16}$/i.test(v)&&!/^v\d+$/i.test(v)).join(', ');
  const discless=base.replace(/\s*[\(\[](disc|disk|cd)\s*([0-9]+|[a-h])(?![a-z0-9])[^\)\]]*[\)\]]/ig,'').trim();
  let t=base.replace(/\s*[\(\[][^\)\]]*[\)\]]/g,'').replace(/_/g,' ').replace(/\s+/g,' ').trim();
  const the=t.match(/^(.*), (The|A|An)(\b.*)$/); if(the) t=`${the[2]} ${the[1]}${the[3]}`;
  return {title:t||base, region:R.join('·'), disc:disc?+disc:null, variant, discless};
}

/* 한국어판 판별: 파일·폴더 이름에 한국어를 뜻하는 표기가 있으면 한국어판으로 본다 (정식 한국판·한글패치를 가리지 않는다)
   예: (Korea) (Korean) (Kor) [T-Kor] (K) (En,Ja,Ko) [한글] (한글패치) 한국어 한국판 */
const KOR_RE=/(?:^|[^a-z])(?:kor(?:ea|ean)?|t[-+ ]?kor(?:ean)?)(?![a-z])|한글|한국어|한국판|한국\s*정발|한패|[\[(]\s*k\s*[\])]|[\[(](?:[^\])]*[^a-z\])])?ko(?![a-z])[^\])]*[\])]/i;
function isKor(base,dirs){ return KOR_RE.test(base)||(dirs||[]).some(d=>KOR_RE.test(d)) }

/* Switch 업데이트·DLC 판별: 타이틀 ID 끝 3자리가 800이면 업데이트, 000이 아니면 DLC. 이름에 [UPD]·[DLC]·Update 등이 있어도 제외 */
function switchExtra(base){
  const id=(base.match(/(?:^|[^0-9A-F])(0100[0-9A-F]{12})(?![0-9A-F])/i)||[])[1];
  if(id){ const t=id.slice(-3).toUpperCase(); if(t==='800') return 'update'; if(t!=='000') return 'dlc'; return null; }
  if(/[\[\(]\s*(upd|update|dlc|patch|add-?on)\b[^\]\)]*[\]\)]/i.test(base)) return 'extra';
  if(/\b(update|dlc)\b/i.test(base)) return 'extra';
  return null;
}

/* BIOS·펌웨어 파일 판별: [BIOS] 표기, bios·firmware 폴더, 알려진 BIOS 파일 이름 */
/* Sega Model 2: 롬셋 이름 → 제목, 지역, 버전 */
const MODEL2_TITLES={
  daytona:['Daytona USA','',''], daytonas:['Daytona USA','','Special'], daytonat:['Daytona USA','','Turbo'], daytonam:['Daytona USA','','Mini'],
  vf2:['Virtua Fighter 2','',''], vf2a:['Virtua Fighter 2','','Rev A'], vf2b:['Virtua Fighter 2','','Rev B'], vf2o:['Virtua Fighter 2','','Old'],
  vcop:['Virtua Cop','',''], vcopa:['Virtua Cop','','Rev A'], vcop2:['Virtua Cop 2','',''], vstriker:['Virtua Striker','',''], vstrikero:['Virtua Striker','','Old'],
  srallyc:['Sega Rally Championship','',''], srallycb:['Sega Rally Championship','','Rev B'], srallycc:['Sega Rally Championship','','Rev C'], srallyp:['Sega Rally Championship','','Prototype'],
  stcc:['Sega Touring Car Championship','',''], stcca:['Sega Touring Car Championship','','Rev A'], stccb:['Sega Touring Car Championship','','Rev B'],
  dynamcop:['Dynamite Cop','',''], dyndeka2:['Dynamite Deka 2','JP',''], dynamcopc:['Dynamite Cop','','Model 2C'],
  doa:['Dead or Alive','',''], doaa:['Dead or Alive','','Rev A'], fvipers:['Fighting Vipers','',''], fvipersb:['Fighting Vipers','','Rev B'],
  hotd:['The House of the Dead','',''], hotdp:['The House of the Dead','','Prototype'], lastbrnx:['Last Bronx','',''], lastbrnxj:['Last Bronx','JP',''], lastbrnxu:['Last Bronx','US',''],
  motoraid:['Motor Raid','',''], overrev:['Over Rev','',''], overrevb:['Over Rev','','Model 2B'], pltkids:['Pilot Kids','',''], pltkidsa:['Pilot Kids','','Rev A'],
  sgt24h:['Super GT 24h','',''], skisuprg:['Sega Ski Super G','',''], skytargt:['Sky Target','',''], topskatr:['Top Skater','',''], topskatru:['Top Skater','US',''],
  waverunr:['Wave Runner','',''], zerogun:['Zero Gunner','',''], zeroguna:['Zero Gunner','','Rev A'], zerogunj:['Zero Gunner','JP',''],
  manxtt:['Manx TT Superbike','',''], manxttc:['Manx TT Superbike','','Twin'], indy500:['Indy 500','',''], indy500d:['Indy 500','','Deluxe'], indy500to:['Indy 500','','Twin Old'],
  desert:['Desert Tank','',''], gunblade:['Gunblade NY','',''], bel:['Behind Enemy Lines','',''], rchase2:['Rail Chase 2','',''],
  dynabb:['Dynamite Baseball','JP',''], dynabb97:['Dynamite Baseball 97','JP',''], schamp:['Sonic Championship','',''], sfight:['Sonic the Fighters','',''],
  von:['Cyber Troopers Virtual-On','',''], vonj:['Cyber Troopers Virtual-On','JP',''], vonr:['Cyber Troopers Virtual-On','','Rev'], wingwar:['Wing War','',''], wingwaru:['Wing War','US',''], wingwarj:['Wing War','JP',''],
  segawski:['Sega Water Ski','',''], hpyagu98:['Nekketsu Pro Yakyuu Gekitou League 98','JP',''], dyndeka2b:['Dynamite Deka 2','JP','Rev B'],
};
/* Sega Model 3: MAME·Supermodel 롬셋 이름 → 제목, 지역, 버전 */
const MODEL3_TITLES={
  vf3:['Virtua Fighter 3','',''], vf3a:['Virtua Fighter 3','','Rev A'], vf3c:['Virtua Fighter 3','','Rev C'], vf3tb:['Virtua Fighter 3 Team Battle','',''],
  bass:['Sega Bass Fishing','',''], getbass:['Get Bass','JP',''],
  scud:['Scud Race','EU',''], scuda:['Scud Race','EU','Twin/DX'], scudj:['Scud Race','JP',''], scudau:['Scud Race','AU',''], scudplus:['Scud Race Plus','',''], scudplusa:['Scud Race Plus','','Rev A'],
  lostwsga:['The Lost World: Jurassic Park','',''], lostwsgp:['The Lost World: Jurassic Park','','Prototype'],
  vs215:['Virtua Striker 2 Ver. 1997','',''], vs215o:['Virtua Striker 2 Ver. 1997','','Old'], vs29815:['Virtua Striker 2 Ver. 1998','',''],
  lemans24:['Le Mans 24','',''], vs2:['Virtua Striker 2','',''], harley:['Harley-Davidson & L.A. Riders','',''], harleyb:['Harley-Davidson & L.A. Riders','','Rev B'],
  skichamp:['Ski Champ','',''], srally2:['Sega Rally 2','',''], srally2x:['Sega Rally 2 DX','',''], srally2p:['Sega Rally 2','','Prototype'], srally2pa:['Sega Rally 2','','Prototype A'],
  von2:['Virtual On 2: Oratorio Tangram','',''], von254g:['Virtual On 2: Oratorio Tangram','','Ver. 5.4g'], von2a:['Virtual On 2: Oratorio Tangram','','Rev A'], von2o:['Virtual On 2: Oratorio Tangram','','Old'],
  fvipers2:['Fighting Vipers 2','',''], fvipers2o:['Fighting Vipers 2','','Old'],
  vs298:['Virtua Striker 2 Ver. 1998','',''], vs2v991:['Virtua Striker 2 Ver. 1999.1','',''], vs299:['Virtua Striker 2 Ver. 1999','',''], vs299a:['Virtua Striker 2 Ver. 1999','','Rev A'], vs299b:['Virtua Striker 2 Ver. 1999','','Rev B'], vs299j:['Virtua Striker 2 Ver. 1999','JP',''],
  dayto2pe:['Daytona USA 2 Power Edition','',''], daytona2:['Daytona USA 2: Battle on the Edge','',''],
  dirtdvls:['Dirt Devils','',''], dirtdvlsa:['Dirt Devils','AU',''], dirtdvlsj:['Dirt Devils','JP',''], dirtdvlsg:['Dirt Devils','','Ver. G'],
  swtrilgy:['Star Wars Trilogy Arcade','',''], swtrilgya:['Star Wars Trilogy Arcade','','Rev A'], swtrilgyp:['Star Wars Trilogy Arcade','','Prototype'],
  spikeout:['Spikeout','',''], spikeofe:['Spikeout Final Edition','',''],
  eca:['Emergency Call Ambulance','',''], ecau:['Emergency Call Ambulance','US',''], ecaj:['Emergency Call Ambulance','JP',''], ecap:['Emergency Call Ambulance','','Prototype'],
  oceanhun:['The Ocean Hunter','',''], oceanhuna:['The Ocean Hunter','','Rev A'],
  magtruck:['Magical Truck Adventure','',''], magtrucka:['Magical Truck Adventure','','Rev A'],
};
/* 박스아트: 콘솔 → libretro-thumbnails 시스템 이름 (아케이드는 롬셋 이름이 짧은 이름이라 뺀다) */
const THUMB_SYS={nes:'Nintendo - Nintendo Entertainment System',fds:'Nintendo - Family Computer Disk System',snes:'Nintendo - Super Nintendo Entertainment System',
  vb:'Nintendo - Virtual Boy',n64:'Nintendo - Nintendo 64',gb:'Nintendo - Game Boy',gbc:'Nintendo - Game Boy Color',gba:'Nintendo - Game Boy Advance',
  pc98:'NEC - PC-98',nds:'Nintendo - Nintendo DS','3ds':'Nintendo - Nintendo 3DS',gc:'Nintendo - GameCube',wii:'Nintendo - Wii',wiiu:'Nintendo - Wii U',
  ps1:'Sony - PlayStation',ps2:'Sony - PlayStation 2',ps3:'Sony - PlayStation 3',ps4:'Sony - PlayStation 4',psp:'Sony - PlayStation Portable',psvita:'Sony - PlayStation Vita',
  sg1000:'Sega - SG-1000',sms:'Sega - Master System - Mark III',gg:'Sega - Game Gear',md:'Sega - Mega Drive - Genesis',segacd:'Sega - Mega-CD - Sega CD',
  '32x':'Sega - 32X',saturn:'Sega - Saturn',dreamcast:'Sega - Dreamcast',
  pce:'NEC - PC Engine - TurboGrafx 16',sgx:'NEC - PC Engine SuperGrafx',pcecd:'NEC - PC Engine CD - TurboGrafx-CD',pcfx:'NEC - PC-FX',
  neocd:'SNK - Neo Geo CD',ngp:'SNK - Neo Geo Pocket',ngpc:'SNK - Neo Geo Pocket Color',ws:'Bandai - WonderSwan',wsc:'Bandai - WonderSwan Color',
  a2600:'Atari - 2600',a7800:'Atari - 7800',lynx:'Atari - Lynx',msx:'Microsoft - MSX',msx2:'Microsoft - MSX2',turbor:'Microsoft - MSX2',
  xbox:'Microsoft - Xbox',xbox360:'Microsoft - Xbox 360',arcade:'MAME'};
/* 제목 비교용: 괄호 표기, 관사, 기호를 뺀다 */
function thumbKey(s){
  return String(s).toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g,' ').replace(/&/g,' and ').replace(/^\s*the\s+|,\s*the\b/g,' ')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,'');
}
const THUMB_REG_ORDER=['WW','US','EU','JP','KR'];
const THUMB_BAD=/\((beta|proto|prototype|demo|sample|kiosk|promo|pirate|hack|unl|aftermarket|homebrew)[^)]*\)/i;
/* 받을 이름 후보: 파일 이름 그대로 → 디스크 표기를 뺀 이름 → 목록에서 제목이 같은 것 중 지역이 잘 맞는 것 */
function thumbNames(rom,idx){
  const out=[]; const add=n=>{ if(n&&!out.includes(n)&&(!idx||idx.weak||idx.set.has(n)||idx.set.has(thumbSafe(n)))) out.push(n) };
  // 아케이드: libretro 'MAME' 목록은 롬셋 설명(제목) 이름이다. 클론은 원본 설명도 시도
  if(rom.arcName){ if(rom.arcDesc) add(rom.arcDesc); if(rom.arcParentDesc) add(rom.arcParentDesc); if(!idx) return out.slice(0,3); }
  else if(rom.console==='arcade') return out;
  const f=rom.files?.[0]?.path||''; let base=f.split(/[\\/]/).pop().replace(/\.[^.]+$/,'');
  if(rom.dbName&&!rom.kor&&rom.dbMatch!=='title') add(rom.dbName);
  if(!rom.folder){ add(base); add(base.replace(/\s*\((disc|disk|cd)\s*\d+[^)]*\)/i,'').trim()); }
  if(idx){
    let list=idx.byKey.get(thumbKey(rom.title))||[];
    // 제목이 똑같은 것이 없으면 단어가 많이 겹치는 이름 (점수 0.8 이상만 자동으로 쓴다)
    if(!list.length&&idx.words){ const fz=thumbFuzzy(rom.title,idx); if(fz.length&&fz[0].s>=.8){ const top=fz[0].s; list=fz.filter(x=>x.s>=top-.02).map(x=>x.n) } }
    const want=(rom.region||'').split('·').filter(Boolean);
    const score=n=>thumbScore(n,want,!!rom.variant);
    [...list].sort((a,b)=>score(b)-score(a)).slice(0,2).forEach(add);
  }
  return out.slice(0,4);
}
const thumbSafe=n=>n.replace(/[&*/:`<>?\\|"]/g,'_');
/* 같은 제목의 여러 그림 중 고르기: 지역이 맞는 것, No-Intro식 이름, 해킹·배드 덤프·재발매판은 뒤로 */
const TOSEC_REG={us:'US',usa:'US',jp:'JP',ja:'JP',eu:'EU',de:'EU',fr:'EU',uk:'EU',gb:'EU',it:'EU',es:'EU',kr:'KR',ko:'KR',as:'AS'};
function thumbRegions(n){
  const r=parseName(n).region.split('·').filter(Boolean);
  for(const m of n.matchAll(/\(([a-z]{2}(?:-[a-z]{2})*)\)/gi)) for(const c of m[1].toLowerCase().split('-')) if(TOSEC_REG[c]&&!r.includes(TOSEC_REG[c])) r.push(TOSEC_REG[c]);
  return r;
}
function thumbScore(n,want,variant){
  const r=thumbRegions(n); let sc=0;
  if(want.length&&r.some(x=>want.includes(x))) sc+=50;
  sc-=Math.min(...r.map(x=>{const i=THUMB_REG_ORDER.indexOf(x);return i<0?9:i}),9)*3;
  if(/\((USA|Europe|Japan|World|Korea|Asia)[,)]/.test(n)) sc+=8;
  if(!variant&&(THUMB_BAD.test(n)||/\[(b|h|p|t|a|o|f|cr|tr|hack)\d*[^\]]*\]|\(proto\)/i.test(n))) sc-=40;
  if(/PlayChoice|Virtual Console|Collector|Collection|Anniversary|GameCube Edition|Switch Online|Classic Mini|Evercade|Arcade Archives|Retro-Bit|Limited Run|Capcom Town|Namco Museum|Mini Console/i.test(n)) sc-=15;
  if(/\(rev|\(v\d/i.test(n)) sc-=1;
  return sc-n.length/100;
}
/* 느슨한 비교용 낱말: 괄호 표기·관사를 빼고, 로마 숫자는 아라비아 숫자로 */
const ROMAN={i:'1',ii:'2',iii:'3',iv:'4',v:'5',vi:'6',vii:'7',viii:'8',ix:'9',x:'10',xi:'11',xii:'12',xiii:'13'};
const STOPW=new Set(['the','a','an','of','and','de','no','to']);
function thumbWords(s){
  const w=String(s).toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g,' ').replace(/&/g,' and ').replace(/'/g,'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(x=>ROMAN[x]||x).filter(x=>!STOPW.has(x));
  return [...new Set(w)];
}
/* 제목과 목록 이름의 닮은 정도: 겹치는 낱말 비율(다이스 계수) + 앞부분이 같으면 가산 */
function thumbFuzzy(title,idx,limit=12){
  const tw=thumbWords(title); if(!tw.length) return [];
  // 가장 드문 낱말 둘로 후보를 줄인다
  const seeds=[...tw].sort((a,b)=>(idx.words.get(a)?.length||1e9)-(idx.words.get(b)?.length||1e9)).slice(0,2);
  const cand=new Set(); for(const w of seeds) for(const i of idx.words.get(w)||[]) cand.add(i);
  const tk=tw.join(' '); const out=[];
  for(const i of cand){ const nw=idx.tok[i]; let inter=0; for(const w of nw) if(tw.includes(w)) inter++;
    let sc=2*inter/(tw.length+nw.length); const nk=nw.join(' ');
    if(nk.startsWith(tk)||tk.startsWith(nk)) sc=Math.max(sc,Math.min(tw.length,nw.length)>=2?.85:sc);
    // 숫자(속편 번호)가 다르면 다른 게임
    const nt=tw.filter(x=>/^\d+$/.test(x)).join(), nn=nw.filter(x=>/^\d+$/.test(x)).join(); if(nt!==nn) sc-=.3;
    if(sc>.3) out.push({n:idx.names[i],s:sc}) }
  return out.sort((a,b)=>b.s-a.s).slice(0,limit);
}
function thumbIndex(names,weak){ const byKey=new Map(), words=new Map(), tok=[];
  names.forEach((n,i)=>{ const k=thumbKey(n); if(k) (byKey.get(k)||byKey.set(k,[]).get(k)).push(n); const w=thumbWords(n); tok.push(w); for(const x of w) (words.get(x)||words.set(x,[]).get(x)).push(i) });
  return {set:new Set(names),byKey,words,tok,names,weak:!!weak} }
/* 장르 이름 (libretro-database) → 한글 */
const GENRE_KO={'action':'액션','action rpg':'액션 RPG','adventure':'어드벤처','beat\'em up':'벨트 액션','board game':'보드 게임','card game':'카드 게임','casino':'카지노','compilation':'모음집','driving':'드라이빙',
  'educational':'교육','fighting':'대전 격투','flight simulator':'비행 시뮬','game show':'게임 쇼','light-gun shooter':'건 슈팅','mahjong':'마작','maze':'미로','mini-games':'미니 게임','music':'음악','party':'파티',
  'pinball':'핀볼','platform':'플랫포머','puzzle':'퍼즐','quiz':'퀴즈','racing':'레이싱','role-playing (rpg)':'RPG','rpg':'RPG','shoot\'em up':'슈팅','shooter':'슈팅','simulation':'시뮬레이션','sports':'스포츠',
  'strategy':'전략','tactics':'전술','visual novel':'비주얼 노벨','miscellaneous':'기타','misc':'기타','pachinko':'파친코','horror':'호러','stealth':'잠입','sandbox':'샌드박스','rhythm':'리듬','trivia':'퀴즈',
  'run & gun':'런앤건','first-person shooter':'FPS','third-person shooter':'TPS','sports - soccer':'축구','sports - baseball':'야구','sports - golf':'골프'};
const genreKo=g=>{ if(!g) return ''; const k=g.trim().toLowerCase(); return GENRE_KO[k]||GENRE_KO[k.replace(/\s*\(.*\)$/,'')]||g };
/* 파일 내용(CRC)으로 확인할 콘솔: 카트리지·작은 롬. 디스크는 이름·시리얼로만 맞춘다 */
const CRC_CONSOLES=new Set(['nes','fds','snes','vb','n64','gb','gbc','gba','nds','sg1000','sms','gg','md','32x','pce','sgx','ngp','ngpc','ws','wsc','a2600','a7800','lynx','msx','msx2']);
const PS_EXTRA_DIR=/([-_ ](patch|ac|addcont|dlc|upd|update)\d*$)|\b(update|dlc|addcont)\b|\[(upd|dlc)\]/i;
const BIOS_DIRS=['bios','bioses','firmware','firmwares'];
const BIOS_NAMES=/^(scph[-_ ]?\d+.*|ps[12x]?[-_ ]?bios.*|psxonpsp660|ps3updat|gba_bios|gb_bios|gbc_bios|sgb_bios|bios[79]|bios7_.*|bios9_.*|firmware|dc_(boot|flash|bios)|naomi2?|naomigd|awbios|hod2bios|neogeo|neocdz|pgm|stvbios|skns|qsound|cpzn[12]|decocass|isgsm|nmk004|ym2608|sega_101|mpr-1793[34]|saturn_bios|syscard[0-9]*|gexpress|disksys|lynxboot|5200|7800 ?bios.*|msx2?(ext|p|pext|pmus)?|fmpac|kanji|panafz\d+.*|kick\d+.*|bios_cd_[a-z]|sega cd bios.*|mega-cd.*bios.*|segacd_bios.*)$/i;
function isBios(base,dirs){
  if(dirs.some(d=>BIOS_DIRS.includes(d.toLowerCase()))) return true;
  if(/[\[\(]\s*bios\s*[\]\)]/i.test(base)||/\bbios\b/i.test(base)) return true;
  return BIOS_NAMES.test(base.trim());
}

/* ---------- 스캔 결과 분류 ---------- */
function scanFiles(files,opts={}){
  const allow=(opts.allow||[]).map(d=>d.replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase());
  const emus=[]; const cores=[]; const emuDirs=[];
  // 실행 파일 버전 정보 (경로 소문자 → {product,desc,orig,internal}). 없으면 이름만 본다
  const exeInfo=opts.exeInfo||{};
  const guesses=[]; const dirKeys=new Map();   // 폴더 → 그 폴더에서 이름표로 알아본 에뮬레이터들
  // TeknoParrot 폴더 안에는 아케이드 기판용으로 고친 에뮬레이터들(PCSX2x6, RPCS3, Play!, Tekno* …)이 들어 있다.
  // 같은 에뮬레이터가 다른 곳에 있으면 그쪽을 쓰고, 이름표에 없는 것은 추정하지 않는다
  const tpDirs=files.map(f=>splitPath(f.path)).filter(p=>/^teknoparrotui$/i.test(p.base)&&EXEC_EXT.includes(p.ext)).map(p=>p.dir.toLowerCase());
  const inTp=dir=>{const d=dir.toLowerCase(); return tpDirs.some(t=>d===t||d.startsWith(t+'/'))};
  for(const f of files){
    const p=splitPath(f.path);
    const cm=p.file.match(/^(.+)_libretro\.(dll|so|dylib)$/i);
    if(cm){cores.push({name:cm[1].toLowerCase(),path:f.path});continue}
    if(!EXEC_EXT.includes(p.ext)) continue;
    const inf=exeInfo[f.path.toLowerCase()]||null;
    // 파일 이름이 바뀐 판도 알아보도록 버전 정보의 원래 파일 이름·내부 이름·제품 이름도 맞춰 본다
    const names=[p.base,...(inf?[inf.orig,inf.internal,inf.product].filter(Boolean).map(exeStem):[])];
    let known=false;
    for(const [key,d] of Object.entries(EMUS)){
      if(names.some(n=>d.re.test(n))&&(!d.dirRe||d.dirRe.test(p.dir))&&!HELPER_EXE.test(p.base)&&!/launcher/i.test(p.base)){
        known=true;
        const ex=emus.find(e=>e.key===key);
        // 버전별 폴더가 여럿이면 Pre-release·Nightly 쪽을 고른다 (shadPS4 versions\\Pre-release 등)
        // NP21/W의 haxm·whpx 폴더는 하드웨어 가속판(드라이버가 없으면 시작할 때 오류 창) → 맨 위 폴더의 보통판을 고른다
        // 백업·예전 판 폴더(Backups, *_old, *-previous)는 뒤로, 같은 점수면 얕은 폴더 쪽
        const sc=exeScore(p.base)+(/pre-?release|nightly|latest/i.test(p.dir)?1:0)-(/[\\/](haxm|whpx)$/i.test(p.dir)?5:0)
          +infoScore(inf,d.name)-(/(^|[\\/])(backups?|old|previous)([\\/]|$)|[-_](old|previous|backup)\b/i.test(p.dir+'/'+p.base)?3:0)-p.dirs.length*0.01
          -(key!=='teknoparrot'&&inTp(p.dir)?8:0);
        if(!ex){emus.push({key,name:d.name,path:f.path,cores:[],score:sc});emuDirs.push(p.dir.toLowerCase())}
        else if(sc>ex.score){ex.path=f.path;ex.score=sc;emuDirs.push(p.dir.toLowerCase())}
        const dl=p.dir.toLowerCase(); if(!dirKeys.has(dl)) dirKeys.set(dl,new Set()); dirKeys.get(dl).add(key);
        break;
      }
    }
    if(!known&&!inTp(p.dir)){ const g=guessEmu(p,inf); if(g) guesses.push({...g,path:f.path,dir:p.dir.toLowerCase(),text:norm(g.name+' '+p.base)}) }
  }
  // 이름표에 없지만 버전 정보로 보아 에뮬레이터인 것. 이미 알아본 에뮬레이터 폴더 안의 같은 이름 변형판(디버그판·예전 판)은 뺀다
  const guessEmus=guesses.filter(g=>![...(dirKeys.get(g.dir)||[])].some(k=>g.text.includes(norm(EMUS[k].name))))
    .map(({text,dir,...g})=>g);
  const ra=emus.find(e=>e.key==='retroarch'); if(ra) ra.cores=cores.filter(c=>CORES[c.name]);

  // 커버 이미지 색인: "폴더|파일이름" → 경로
  const images={}; const sfos={};
  for(const f of files){const p=splitPath(f.path); if(IMAGE_EXT.includes(p.ext)) images[(p.dir+'|'+p.base).toLowerCase()]=f.path; else if(p.ext==='sfo'||p.file.toLowerCase()==='param.json') sfos[(p.dir+'/'+p.file).toLowerCase()]=f.path}

  /* 폴더째 들어 있는 게임: PS3(PS3_GAME/USRDIR/EBOOT.BIN), PS4·PS5(eboot.bin), Xbox(default.xbe), Xbox 360(default.xex) */
  const folderGames=[]; const fgRoots=new Set(); let extras=0;
  const underEmu=dl=>!allow.some(a=>dl===a||dl.startsWith(a+'/'))&&emuDirs.some(d=>dl===d||dl.startsWith(d+'/'));
  for(const f of files){
    const p=splitPath(f.path); const fl=p.file.toLowerCase(); const d=p.dirs; const n=d.length;
    let root, title, cons;
    if(fl==='eboot.bin'){
      if(n>=2&&d[n-1].toLowerCase()==='usrdir'){ const ri=(n>=3&&d[n-2].toLowerCase()==='ps3_game')?n-3:n-2; if(ri<0)continue; root=d.slice(0,ri+1).join('/'); title=d[ri]; cons='ps3'; }
      else if(n>=1){ root=p.dir; title=d[n-1]; const fa=consoleFromDirs(d.slice(0,-1)); cons=fa==='ps5'?'ps5':fa==='psvita'?'psvita':'ps4';
        // 덤프 도구의 폴더 이름: 게임은 -app0, 업데이트는 -patch0, 추가 콘텐츠는 -ac
        if(cons!=='psvita'&&PS_EXTRA_DIR.test(title)){ extras++; fgRoots.add(root.toLowerCase()); continue; }
        title=title.replace(/[-_ ]app\d*$/i,''); }
      else continue;
    } else if(fl==='default.xbe'&&n>=1){ root=p.dir; title=d[n-1]; cons='xbox'; }
    else if(fl==='default.xex'&&n>=1){ root=p.dir; title=d[n-1]; cons='xbox360'; }
    else if(p.ext==='rpx'&&n>=2&&d[n-1].toLowerCase()==='code'){
      root=d.slice(0,-1).join('/'); title=d[n-2]; cons='wiiu';
      // Wii U 업데이트(0005000e)·DLC(0005000c) 폴더나 이름에 Update/DLC가 붙은 폴더는 게임이 아니다
      if(/\/0005000[ec]\//i.test('/'+p.dir+'/')||/\b(update|dlc)\b|\[(upd|dlc)\]/i.test(title)){ extras++; fgRoots.add(root.toLowerCase()); continue; }
    }
    else continue;
    if(underEmu(root.toLowerCase())||fgRoots.has(root.toLowerCase())) continue;
    const nat=f.path.slice(0,f.path.length-(p.dir.length-root.length)-p.file.length-1).replace(/[\\/]$/,'');
    folderGames.push({root,rootNative:nat,title,cons,path:f.path,size:f.size||0}); fgRoots.add(root.toLowerCase());
  }
  const inFolderGame=dl=>{ if(!fgRoots.size)return false; let x=dl; while(x){ if(fgRoots.has(x))return true; const i=x.lastIndexOf('/'); if(i<0)break; x=x.slice(0,i) } return false };

  const byDir={};
  for(const f of files){const p=splitPath(f.path); if(p.dirs.some(d=>d.startsWith('.')))continue;
    const dl=p.dir.toLowerCase();
    if(underEmu(dl)||inFolderGame(dl))continue;
    (byDir[p.dir]=byDir[p.dir]||[]).push({...f,...p});}
  const groups={}; let skipped=0, unknown=0, bios=0;
  for(const [dir,list] of Object.entries(byDir)){
    const hasCue=list.some(x=>x.ext==='cue'||x.ext==='gdi');
    const m3uBases=list.filter(x=>x.ext==='m3u').map(x=>parseName(x.base).discless.toLowerCase());
    const dirCons=consoleFromDirs(list[0].dirs);
    for(const x of list){
      const known=EXTMAP[x.ext]; const amb=AMBIG.includes(x.ext);
      if(!known && !amb) continue;
      if(x.ext==='bin' && hasCue){skipped++;continue}
      if(isBios(x.base,x.dirs)){bios++;continue}
      const pn=parseName(x.base);
      if(x.ext!=='m3u' && m3uBases.includes(pn.discless.toLowerCase())){skipped++;continue}
      let cons;
      if(dirCons && ((known&&known.includes(dirCons))||amb)) cons=dirCons;
      else if(known) cons=known[0];
      else cons='unknown';
      if((cons==='switch'||cons==='switch2')&&x.ext!=='nup'&&switchExtra(x.base)){extras++;continue}
      if(cons==='unknown')unknown++;
      const key=(cons+'|'+dir+'|'+pn.discless).toLowerCase();
      const legacy=(cons+'|'+dir+'|'+pn.title).toLowerCase();   // 예전 버전의 묶음 기준 (기록을 이어받기 위해)
      const m3=cons==='model3'?MODEL3_TITLES[x.base.toLowerCase()]:cons==='model2'?MODEL2_TITLES[x.base.toLowerCase()]:null;
      const g=groups[key]||(groups[key]={id:'r'+hashStr(key).toString(36),legacy,title:m3?m3[0]:pn.title,region:m3?(m3[1]||pn.region):pn.region,variant:m3?(m3[2]||pn.variant):pn.variant,console:cons,files:[],size:0,discs:0,dir,m3u:false,kor:false});
      if(isKor(x.base,x.dirs)) g.kor=true;
      g.files.push({path:x.path,disc:pn.disc}); g.size+=x.size||0; if(pn.disc)g.discs++;
      if(x.ext==='m3u')g.m3u=true;
      if(!g.region&&pn.region)g.region=pn.region;
      if(!g.autoCover){
        const cands=[x.base,pn.title];
        const dirs=[dir,dir+'/covers',dir+'/boxart',dir+'/media/covers',dir+'/media/box2dfront',dir+'/images'];
        outer: for(const d of dirs) for(const b of cands){const hit=images[(d+'|'+b).toLowerCase()]; if(hit){g.autoCover=hit;break outer}}
      }
    }
  }
  for(const fg of folderGames){
    const pn=parseName(fg.title); const key=(fg.cons+'|'+fg.root).toLowerCase();
    const r=fg.root;
    const icon=[r+'/PS3_GAME|ICON0',r+'|ICON0',r+'/sce_sys|icon0'].map(k=>images[k.toLowerCase()]).find(Boolean);
    const sfo=(fg.cons==='ps5'?[r+'/sce_sys/param.json',r+'/sce_sys/param.sfo']:[r+'/PS3_GAME/PARAM.SFO',r+'/sce_sys/param.sfo',r+'/PARAM.SFO',r+'/sce_sys/param.json']).map(k=>sfos[k.toLowerCase()]).find(Boolean);
    groups[key]={id:'r'+hashStr(key).toString(36),title:pn.title,region:pn.region,console:fg.cons,files:[{path:fg.path,disc:null}],size:fg.size,discs:0,dir:fg.rootNative,m3u:false,folder:true,autoCover:icon||undefined,sfo:sfo||undefined};
  }
  // 예전 버전에서 하나로 묶였던 게임들: 대표 1개(버전 표기 없는 것 우선)가 예전 ID를 이어받는다
  const byLegacy={};
  for(const g of Object.values(groups)) if(g.legacy)(byLegacy[g.legacy]=byLegacy[g.legacy]||[]).push(g);
  for(const [lk,list] of Object.entries(byLegacy)){
    list.sort((a,b)=>(a.variant?1:0)-(b.variant?1:0)||(a.region==='US'?-1:0)-(b.region==='US'?-1:0)||a.files[0].path.localeCompare(b.files[0].path));
    list[0].id='r'+hashStr(lk).toString(36);
    for(const g of list) delete g.legacy;
  }
  const roms=Object.values(groups).map(g=>{
    // m3u가 있으면 m3u 하나로 실행, 없으면 디스크 순서대로
    g.files.sort((a,b)=>(/\.m3u$/i.test(b.path)?1:0)-(/\.m3u$/i.test(a.path)?1:0)||(a.disc||0)-(b.disc||0));
    g.discs=Math.max(g.discs,g.files.length>1?g.files.length:0); return g});
  return {emus,guessEmus,roms,skipped,unknown,extras,bios,dirCount:Object.keys(byDir).length};
}

/* 예시 데이터 (실제 파일은 없음) */
function sampleFiles(){
  const R='D:\\Games\\'; const MB=1048576;
  const L=[
    ['Emulators\\RetroArch\\retroarch.exe',9],['Emulators\\RetroArch\\cores\\mesen_libretro.dll',4],['Emulators\\RetroArch\\cores\\snes9x_libretro.dll',3],
    ['Emulators\\RetroArch\\cores\\genesis_plus_gx_libretro.dll',5],['Emulators\\RetroArch\\cores\\mupen64plus_next_libretro.dll',12],
    ['Emulators\\RetroArch\\cores\\mednafen_pce_fast_libretro.dll',2],['Emulators\\RetroArch\\cores\\gambatte_libretro.dll',1],
    ['Emulators\\DuckStation\\duckstation-qt-x64-ReleaseLTCG.exe',18],['Emulators\\PCSX2\\pcsx2-qt.exe',30],['Emulators\\Dolphin\\Dolphin.exe',22],
    ['Emulators\\PPSSPP\\PPSSPPWindows64.exe',14],['Emulators\\mGBA\\mGBA.exe',6],['Emulators\\melonDS\\melonDS.exe',8],
    ['ROMs\\NES\\Super Mario Bros. 3 (USA).nes',.38],['ROMs\\NES\\Legend of Zelda, The (USA).nes',.13],['ROMs\\NES\\Mega Man 2 (USA).nes',.25],['ROMs\\NES\\Kirby\'s Adventure (USA).nes',.75],
    ['ROMs\\SNES\\Chrono Trigger (USA).sfc',4],['ROMs\\SNES\\Super Metroid (Japan, USA).sfc',3],['ROMs\\SNES\\EarthBound (USA).sfc',3],['ROMs\\SNES\\Seiken Densetsu 3 (Japan).sfc',4],
    ['ROMs\\GameBoy\\Tetris (World).gb',.03],['ROMs\\GameBoy\\Pokemon - Crystal Version (USA).gbc',2],
    ['ROMs\\GBA\\Advance Wars (USA).gba',8],['ROMs\\GBA\\Golden Sun (USA).gba',8],['ROMs\\GBA\\Metroid Fusion (USA).gba',8],
    ['ROMs\\N64\\Super Mario 64 (USA).z64',8],['ROMs\\N64\\Legend of Zelda, The - Ocarina of Time (USA).z64',32],
    ['ROMs\\NDS\\Pokemon - HeartGold Version (USA).nds',128],
    ['ROMs\\MegaDrive\\Sonic The Hedgehog 2 (World).md',1],['ROMs\\MegaDrive\\Streets of Rage 2 (USA).md',2],
    ['ROMs\\PCEngine\\Bonk\'s Adventure (USA).pce',.38],
    ['ROMs\\PS1\\Final Fantasy VII (USA) (Disc 1).chd',420],['ROMs\\PS1\\Final Fantasy VII (USA) (Disc 2).chd',430],['ROMs\\PS1\\Final Fantasy VII (USA) (Disc 3).chd',410],
    ['ROMs\\PS1\\Crash Bandicoot (USA).chd',380],
    ['ROMs\\PS2\\Shadow of the Colossus (USA).iso',3800],['ROMs\\PS2\\Okami (USA).chd',2900],
    ['ROMs\\GameCube\\Metroid Prime (USA).rvz',1100],['ROMs\\Wii\\Xenoblade Chronicles (USA).wbfs',7000],
    ['ROMs\\PSP\\Monster Hunter Portable 3rd (Japan).cso',880],
    ['ROMs\\Saturn\\Radiant Silvergun (Japan).chd',350],
  ];
  return L.map(([p,m])=>({path:R+p,size:Math.round(m*MB)}));
}

if(typeof module!=='undefined') module.exports={isBios,switchExtra,MAKERS,CONSOLES,CONS,EMUS,CORES,scanFiles,parseName,consoleFromDirs,tokenize,fileUrl,sampleFiles,exeScore};
