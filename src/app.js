/* RetroShelf — 화면(렌더러) */
const api = window.shelf;
const $ = s=>document.querySelector(s);
const esc = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtSize = b=>b>=1073741824?(b/1073741824).toFixed(2)+' GB':b>=1048576?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB';
const fmtDur = s=>!s?'—':s<60?`${s}초`:s<3600?`${Math.round(s/60)}분`:`${Math.floor(s/3600)}시간 ${Math.round(s%3600/60)}분`;
const fmtNum = n=>n.toLocaleString('ko-KR');
function timeAgo(t){if(!t)return '—';const m=Math.round((Date.now()-t)/60000);if(m<1)return '방금';if(m<60)return m+'분 전';const h=Math.round(m/60);if(h<24)return h+'시간 전';return Math.round(h/24)+'일 전'}
/* 애니메이션 속도: 끄기 / 빠르게 / 보통 / 느리게 */
const ANIMS={off:['끄기',0],fast:['빠르게',.5],normal:['보통',1],slow:['느리게',1.4]};
const AF=()=>{ const a=ANIMS[(typeof S!=='undefined'&&S.settings?.anim)||'fast']; return a?a[1]:.5 };
const reduced = ()=>AF()===0||matchMedia('(prefers-reduced-motion: reduce)').matches;
const ms=n=>Math.round(n*AF());
const SHELVES={default:['기본 (시스템)'],oak:['원목'],walnut:['월넛'],glass:['검은 유리'],dark:['어두운 방'],shop:['게임숍']};
function applyShelf(){ document.documentElement.dataset.shelf=S.settings?.shelf||'default' }
function applyAnim(){ const f=AF(); document.documentElement.style.setProperty('--af',String(f||0.001)); document.documentElement.dataset.anim=f?'on':'off' }
const sep = p=>p.includes('\\')?'\\':'/';
const dirname = p=>p.slice(0,p.lastIndexOf(sep(p)));
const basename = p=>p.slice(p.lastIndexOf(sep(p))+1);
const collator = new Intl.Collator('ko',{numeric:true,sensitivity:'base'});

/* ===================== 상태 ===================== */
let S; let openId=null; let scanning=null; const runningIds=new Set();
function blank(){return {tab:'lib',filter:'all',q:'',sort:'name',view:'front',ch:200,roots:[],emus:[],manualEmus:[],customEmus:[],roms:[],map:{},emuArgs:{},emuPath:{},emuRomDirs:{},syscards:[],excludeDirs:[],consoleDirs:{},sortDir:1,flt:{},fltOpen:false,
  settings:{minimize:true,rescanOnStart:true,boxart:true,anim:'fast',priceTags:true,shelf:'default',identify:true,oneG:true,regionPref:['KR','JP','US','EU','WW'],randUnplayed:false},cols:[],groupPick:{},log:[],lastScan:null,isSample:false}}
let saveT;
function save(){VERS=null;clearTimeout(saveT);saveT=setTimeout(()=>{api.save({...S,log:S.log.slice(-80)}).catch(()=>toast('라이브러리를 저장하지 못했어요'))},800)}
function log(t,c){S.log.push({t,c,at:Date.now()})}

/* ===================== 에뮬레이터 ===================== */
/* 종류: 스캔으로 찾은 것(emus), 이름으로 알아본 수동 추가(manualEmus), 아무 실행 파일이나 직접 지정한 것(customEmus) */
function allEmus(){const m=new Map();const ov=S.emuPath||{};S.emus.forEach(e=>m.set(e.key,ov[e.key]?{...e,path:ov[e.key],autoPath:e.path,overridden:true}:e));S.manualEmus.forEach(e=>m.set(e.key,e));S.customEmus.forEach(e=>m.set(e.key,e));return [...m.values()]}
const findEmu = key=>allEmus().find(e=>e.key===key);
function emuConsoles(e){
  if(e.custom) return e.consoles;
  if(e.key==='retroarch') return [...new Set(e.cores.flatMap(c=>CORES[c.name]||[]))];
  return EMUS[e.key]?.consoles||[];
}
function options(cid){
  const out=[];
  for(const e of allEmus()){
    if(e.key==='retroarch'&&!e.custom){ for(const c of e.cores) if((CORES[c.name]||[]).includes(cid)) out.push({id:'retroarch:'+c.name,label:'RetroArch · '+c.name}); }
    else if(emuConsoles(e).includes(cid)) out.push({id:e.key,label:e.custom?`${e.name} (직접 지정)`:e.name});
  }
  return out;
}
function optLabel(id){if(!id)return null;if(id.startsWith('retroarch:'))return 'RetroArch · '+id.slice(10);const e=findEmu(id);return e?e.name:(EMUS[id]?.name||id)}
function autoAssign(force){
  for(const c of CONSOLES){
    const ids=options(c.id).map(o=>o.id); const cur=S.map[c.id];
    if(force||!cur||cur.auto||!ids.includes(cur.id)) S.map[c.id]={id:c.prefer.find(p=>ids.includes(p))||ids[0]||null,auto:true};
  }
}
/* 에뮬레이터가 못 읽는 파일 형식 (Mednafen은 CHD를 모른다 → HuCard 롬으로 읽다가 64MB 제한 오류) */
const EMU_NOEXT={mednafen:['chd']};
const romExt=rom=>(rom.files[0].path.match(/\.([^.\\/]+)$/)||[])[1]?.toLowerCase()||'';
const emuCantRead=(id,rom)=>(EMU_NOEXT[kindOf(id)]||[]).includes(romExt(rom));
function emuFor(rom){
  const ok=id=>id&&options(rom.console).some(o=>o.id===id);
  if(ok(rom.emu)) return rom.emu;   // 게임별로 직접 고른 것은 그대로 (정보 창에서 경고)
  if(ok(rom.dirEmu)&&!emuCantRead(rom.dirEmu,rom)) return rom.dirEmu;
  const def=S.map[rom.console]?.id||null;
  if(def&&emuCantRead(def,rom)){
    // 기본값이 이 파일을 못 읽으면 우선순위에서 읽을 수 있는 다음 에뮬레이터
    const ids=options(rom.console).map(o=>o.id);
    const alt=[...(CONS[rom.console]?.prefer||[]),...ids].find(p=>ids.includes(p)&&!emuCantRead(p,rom));
    if(alt) return alt;
  }
  return def;
}
/* ---------- 에뮬레이터별 ROM 폴더 ---------- */
function emuDirList(){const out=[]; for(const [k,list] of Object.entries(S.emuRomDirs||{})) for(const d of list||[]) out.push({k,d}); return out}
/* 스캔할 폴더: 등록 폴더 + 에뮬레이터 ROM 폴더 (다른 폴더 안에 들어 있는 폴더는 빼서 중복 스캔을 막는다) */
/* 콘솔별 ROM 폴더: {콘솔: [{path, recursive}]} */
function consoleDirList(){const out=[]; for(const [c,list] of Object.entries(S.consoleDirs||{})) for(const x of list||[]) out.push({c,path:x.path,recursive:x.recursive!==false}); return out}
/* 스캔할 폴더 목록 [{path, recursive}]. 하위까지 보는 폴더 안에 들어 있는 폴더는 빼서 중복 스캔을 막는다 */
function scanPlan(){
  const all=[...S.roots.map(p=>({path:p,recursive:true})),...emuDirList().map(x=>({path:x.d,recursive:true})),...consoleDirList().map(x=>({path:x.path,recursive:x.recursive}))];
  const m=new Map();
  for(const x of all){const n=normDir(x.path); const o=m.get(n); if(!o) m.set(n,{...x}); else if(x.recursive) o.recursive=true}
  const keys=[...m.keys()];
  return keys.filter(k=>!keys.some(o=>o!==k&&m.get(o).recursive&&k.startsWith(o+'\\'))).map(k=>m.get(k));
}
function scanRoots(){ return scanPlan().map(x=>x.path) }
/* 콘솔 ROM 폴더 적용: 그 폴더의 게임은 그 콘솔로, 폴더를 지정한 콘솔은 그 폴더의 게임만 남긴다 */
function applyConsoleDirs(roms){
  const dirs=consoleDirList().map(x=>({c:x.c,d:normDir(x.path),rec:x.recursive})).sort((a,b)=>b.d.length-a.d.length);
  if(!dirs.length) return {roms,dropped:0};
  const inDir=(gd,x)=>gd===x.d||(x.rec&&gd.startsWith(x.d+'\\'));
  for(const r of roms){
    const gd=normDir(r.folder&&r.dir?dirname(r.dir):dirname(r.files[0].path));
    const hit=dirs.find(x=>inDir(gd,x)); if(!hit) continue;
    const ext=(r.files[0].path.match(/\.([^.\\/]+)$/)||[])[1]?.toLowerCase()||'';
    const owners=EXTMAP[ext]||[];
    // 다른 기기 전용 확장자(예: NES 폴더 안의 .gba)는 그대로 두고, 나머지는 지정한 콘솔로
    if(!owners.length||owners.includes(hit.c)||r.console==='unknown') r.console=hit.c;
    r.inConsoleDir=true;
  }
  const restricted=new Set(dirs.map(x=>x.c));
  const keep=roms.filter(r=>!restricted.has(r.console)||dirs.some(x=>x.c===r.console&&inDir(normDir(r.folder&&r.dir?dirname(r.dir):dirname(r.files[0].path)),x)));
  return {roms:keep,dropped:roms.length-keep.length};
}
/* ROM 폴더에 들어 있는 게임은 그 에뮬레이터가 돌리는 기기로 분류하고, 그 에뮬레이터로 실행한다 */
function applyEmuDirs(roms){
  const dirs=emuDirList().map(x=>({k:x.k,d:normDir(x.d)})).sort((a,b)=>b.d.length-a.d.length);
  if(!dirs.length) return 0; let n=0;
  for(const r of roms){
    const p=normDir(r.files[0].path); const hit=dirs.find(x=>p.startsWith(x.d+'\\')); if(!hit) continue;
    const e=findEmu(hit.k); if(!e) continue; const cons=emuConsoles(e); if(!cons.length) continue;
    if(!cons.includes(r.console)){
      const ext=(r.files[0].path.match(/\.([^.\\/]+)$/)||[])[1]?.toLowerCase()||'';
      const byExt=cons.filter(c=>CONS[c].exts.includes(ext));
      r.console=byExt[0]||(cons.length===1||r.console==='unknown'?cons[0]:r.console);
    }
    r.dirEmu = e.key==='retroarch'&&!e.custom ? (options(r.console).find(o=>o.id.startsWith('retroarch:'))?.id||null) : e.key;
    n++;
  }
  return n;
}
/* 직접 지정한 실행 파일도 이름으로 알아볼 수 있으면(예: fbneo64.exe) 그 에뮬레이터의 실행 방식을 따른다 */
function detectKind(path){const base=basename(path).replace(/\.(exe|appimage)$/i,''); return Object.keys(EMUS).find(k=>EMUS[k].re.test(base))||null}
function kindOf(id){ if(!id)return null; if(id.startsWith('retroarch:'))return 'retroarch'; const e=findEmu(id); if(!e)return null; return e.custom?(e.kind||null):e.key }
function defaultArgs(key){const e=findEmu(key); if(e?.custom) return e.kind&&e.kind!=='retroarch'?EMUS[e.kind].args:(e.args||'"{rom}"'); return EMUS[key]?.args||'"{rom}"'}
const argTemplate = key=>S.emuArgs[key]??defaultArgs(key);
const NP2_HDD=/\.(hdi|nhd|thd|hdd|vhd|hdn|slh)$/i;   // PC-98 하드디스크 이미지
/* 실행할 프로그램, 인수 배열, 화면용 명령 문자열 */
function launchSpec(rom){
  const id=emuFor(rom); if(!id) return null;
  const romPath=rom.files[0].path; const base=basename(romPath).replace(/\.[^.]+$/,'');
  let exe, key, core='';
  if(id.startsWith('retroarch:')){
    const ra=allEmus().find(e=>e.key==='retroarch'&&!e.custom); const c=ra?.cores.find(x=>x.name===id.slice(10)); if(!ra||!c)return null;
    exe=ra.path; key='retroarch'; core=c.path;
  } else { const e=findEmu(id); if(!e)return null; exe=e.path; key=id; }
  const info=emuInfo.get(exe)||{};
  const game=rom.folder&&rom.dir?rom.dir:romPath;
  let rom2=rom.files?.[1]&&!/\.m3u$/i.test(rom.files[0].path)?rom.files[1].path:'';   // 두 번째 디스크 (PC-98 FDD2 등)
  // Neko Project는 명령줄 이미지를 모두 FDD로 넣는다 → 하드디스크 이미지는 빼고(ini의 HDD1FILE로 넣는다) 플로피만 넘긴다
  let fdRom=romPath, np2=kindOf(id)==='np2';
  if(np2){ const fd=rom.files.filter(f=>!NP2_HDD.test(f.path)); fdRom=fd[0]?.path||''; rom2=fd[1]?.path||'' }
  const vars={rom:fdRom,rom2,core,dir:dirname(romPath),name:base,lname:base.toLowerCase(),inirompath:info.rompath||'roms',game,profile:rom.tpProfile||basename(romPath)};
  const vitaboot=rom.vitaId?['-r',rom.vitaId]:[game];
  const sysOpt=EMUS[kindOf(id)]?.sys?.[rom.console]||[];   // ares·Kega Fusion: 기종 지정
  const args=tokenize(argTemplate(key)).flatMap(t=>t==='{vitaboot}'?vitaboot:t==='{sys}'?sysOpt:t==='{rom2}'?(rom2?[rom2]:[]):np2&&t==='{rom}'&&!fdRom?[]:[t.replace(/\{(\w+)\}/g,(m,k)=>vars[k]??m)]);
  // FBNeo IPS 패치: 게임 이름 뒤에 -ips a.dat,b.dat (FBNeo가 support\ips\게임이름\ 에서 찾는다)
  if(kindOf(id)==='fbneo'&&rom.ips?.length) args.push('-ips',rom.ips.join(','));
  let display=`"${exe}" `+args.map(a=>/[\s"]/.test(a)?`"${a}"`:a).join(' ');
  if(kindOf(id)==='bizhawk'&&S.settings.bizhawkPce&&['pce','sgx','pcecd'].includes(rom.console)) display+=`\n(BizHawk 코어: ${S.settings.bizhawkPce})`;
  if(np2){ const hd=rom.files.filter(f=>NP2_HDD.test(f.path)); if(hd.length) display+=`\n(ini: ${hd.map((f,i)=>`HDD${i+1}FILE=${f.path}`).join(', ')})` }
  return {exe,args,cwd:dirname(exe),display,emuName:optLabel(id),kind:kindOf(id)};
}

/* ---------- 에뮬레이터 자체 설정 읽기 (원본 설정을 존중하기 위해) ---------- */
const emuInfo=new Map();   // exe 경로 → {rompath(MAME), romPaths(FBNeo), iniPath}
const isAbs=p=>/^[A-Za-z]:[\\/]|^[\\/]/.test(p);
const normDir=p=>p.replace(/\//g,'\\').replace(/\\+$/,'').toLowerCase();
async function loadEmuInfo(spec){
  if(!spec||!api.readText) return null;
  const dir=dirname(spec.exe); const s=sep(spec.exe); const info={};
  if(spec.kind==='mame'){
    for(const p of [dir+s+'mame.ini', dir+s+'ini'+s+'mame.ini']){
      const t=await api.readText(p).catch(()=>null); if(!t)continue;
      const m=t.match(/^\s*rompath\s+(.+?)\s*$/m); if(m){info.rompath=m[1].replace(/^"|"$/g,''); info.iniPath=p; break}
    }
  }
  if(spec.kind==='fbneo'){
    const stem=basename(spec.exe).replace(/\.exe$/i,'');
    const p=dir+s+'config'+s+stem+'.ini'; info.iniPath=p;
    const t=await api.readText(p).catch(()=>null);
    info.iniFound=!!t;
    const ipsm=t&&t.match(/^szAppIpsPath[ \t]+(.+?)\s*$/m); const ipsv=ipsm?ipsm[1].replace(/^"|"$/g,''):'support/ips/';
    info.ipsPath=(isAbs(ipsv)?ipsv:dir+s+ipsv).replace(/[\\/]+$/,'').replace(/[\\/]/g,s);
    info.romPaths=t?[...t.matchAll(/^szAppRomPaths\[\d+\][ \t]+(.+?)\s*$/gm)].map(m=>m[1].replace(/^"|"$/g,'')).map(v=>isAbs(v)?v:dir+s+v):[];
  }
  if(spec.kind==='m2emu'){
    // Model 2 Emulator: EMULATOR.INI의 [RomDirs] Dir1=… Dir2=…
    for(const n of ['EMULATOR.INI','emulator.ini','Emulator.ini']){
      const p=dir+s+n; const t=await api.readText(p).catch(()=>null); if(!t) continue;
      info.iniPath=p; info.iniFound=true;
      const sec=(t.split(/^\s*\[/m).find(x=>/^RomDirs\]/i.test(x))||'');
      info.romPaths=[...sec.matchAll(/^\s*Dir\d+\s*=\s*(.+?)\s*$/gmi)].map(m=>m[1].replace(/^"|"$/g,'')).filter(Boolean).map(v=>isAbs(v)?v:dir+s+v);
      break;
    }
    if(!info.iniFound){ info.iniPath=dir+s+'EMULATOR.INI'; info.romPaths=[dir+s+'roms'] }
  }
  emuInfo.set(spec.exe,info); return info;
}
/* ---------- FBNeo IPS 패치 ---------- */
const ipsCache=new Map();   // "exe|게임이름" → {dir, list:[{file,desc}], active:[]}
function ipsDesc(text,file){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
  for(const lang of ['ko_KR','en_US','ja_JP','zh_TW','zh_CN']){
    const i=lines.findIndex(l=>l.startsWith('['+lang+']')); if(i<0) continue;
    const out=[]; for(let j=i+1;j<lines.length&&!lines[j].startsWith('[');j++){ const v=lines[j].trim(); if(v) out.push(v) }
    if(out.length) return out.join(' ');
  }
  return file.replace(/\.dat$/i,'');
}
async function loadIps(rom,spec){
  const s=sep(spec.exe); const drv=basename(rom.files[0].path).replace(/\.[^.]+$/,'').toLowerCase();
  const info=emuInfo.get(spec.exe);
  if(!info?.ipsPath||!api.listFiles){ const entry={dir:'',list:[],active:[],err:'FBNeo 설정에서 IPS 폴더를 알 수 없어요'}; ipsCache.set(spec.exe+'|'+drv,entry); return entry }
  const dir=info.ipsPath+s+drv;
  const files=await api.listFiles(dir,'dat').catch(()=>[]);
  const list=[];
  for(const f of files.slice(0,120)){ const file=basename(f.path); const t=await api.readText(f.path).catch(()=>null); list.push({file,desc:t?ipsDesc(t,file):file}) }
  // FBNeo에서 마지막으로 켜 둔 패치 (config\ips\게임이름.ini)
  const act=await api.readText(dirname(spec.exe)+s+'config'+s+'ips'+s+drv+'.ini').catch(()=>null);
  const active=act?act.split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&!l.startsWith('//')):[];
  const entry={dir,list,active}; ipsCache.set(spec.exe+'|'+drv,entry);
  if(rom.ips===undefined&&active.length){ rom.ips=active.filter(a=>list.some(x=>x.file.toLowerCase()===a.toLowerCase())); }
  return entry;
}
/* 열린 게임에 필요한 에뮬레이터 정보(시스템 카드, MAME·FBNeo 설정, IPS 목록)를 읽고 다시 그린다.
   케이스를 열 때, 다른 판으로 바꿀 때, 에뮬레이터를 바꿀 때 모두 이것을 부른다 */
function loadOpenExtras(r){
  if(syscardMode(r)) loadSyscards(launchSpec(r)).then(()=>{ if(openId===r.id) refreshOpen() }).catch(()=>{});
  const sp=launchSpec(r);
  if(sp?.kind==='cemu') loadCemuPacks(r,sp).then(()=>{ if(openId===r.id) refreshOpen() });
  if(sp?.kind==='np2'&&r.console==='pc98') loadNp2Fonts(sp.exe).then(()=>{ if(openId===r.id) refreshOpen() });
  if(sp&&(sp.kind==='mame'||sp.kind==='fbneo'||sp.kind==='m2emu'))
    loadEmuInfo(sp).then(()=>sp.kind==='fbneo'?loadIps(r,sp):null)
      .catch(e=>{ if(sp.kind==='fbneo'){ const drv=basename(r.files[0].path).replace(/\.[^.]+$/,'').toLowerCase(); ipsCache.set(sp.exe+'|'+drv,{dir:'',list:[],active:[],err:String(e?.message||e)}) } })
      .then(()=>{ if(openId===r.id) refreshOpen() });
}
/* ---------- Cemu 그래픽 팩 (게임별) ----------
   Cemu 폴더의 graphicPacks에서 이 게임 타이틀 ID의 팩을 찾고, 켜기·프리셋을 Cemu settings.xml 에 바로 쓴다 */
const gpCache=new Map();
const gpKey=(r,spec)=>spec.exe+'|'+r.files[0].path;
async function loadCemuPacks(r,spec){
  try{ gpCache.set(gpKey(r,spec),{res:await api.cemuPacks(spec.exe,r.files[0].path)}) }
  catch(e){ gpCache.set(gpKey(r,spec),{err:String(e?.message||e)}) }
}
const cemuRunning=()=>[...runningIds].some(id=>{const x=S.roms.find(y=>y.id===id); return x&&launchSpec(x)?.kind==='cemu'});
function cemuHTML(r,spec){
  if(spec?.kind!=='cemu') return '';
  const e=gpCache.get(gpKey(r,spec)); if(!e) return '<p class="note">그래픽 팩 목록을 읽는 중…</p>';
  if(e.err) return `<div class="field"><label>그래픽 팩</label><p class="note">${esc(e.err)}</p></div>`;
  const R=e.res;
  if(!R.packs.length) return `<div class="field"><label>그래픽 팩</label><p class="note">${R.pack_dirs?`이 게임(<span class="mono">${esc(R.title_id.toUpperCase())}</span>)에 맞는 그래픽 팩이 없어요.`:'Cemu에 그래픽 팩이 없어요. Cemu의 <b>옵션 → 그래픽 팩 → 최신 그래픽 팩 다운로드</b>를 한 번 해 주세요.'}</p></div>`;
  const on=R.packs.filter(p=>p.enabled).length;
  const groups=new Map();
  R.packs.forEach((p,i)=>{ const seg=p.path.split('/'); const g=seg.length>1?seg[1]:'기타'; if(!groups.has(g)) groups.set(g,[]); groups.get(g).push([p,i]) });
  const nameOf=p=>{ const seg=p.path.split('/'); return seg.length>2?seg.slice(2).join(' / '):p.name };
  return `<div class="field"><label>그래픽 팩 <span class="muted">· ${R.packs.length}개 중 ${on}개 켜짐 · Cemu 설정에 바로 저장해요</span></label>
    <div class="ipslist gplist">${[...groups].map(([g,list])=>`<div class="gph">${esc(g)}</div>${list.map(([p,i])=>`<div class="ips gp${p.enabled?' on':''}"><input type="checkbox" id="gp${i}" data-gp="${i}" ${p.enabled?'checked':''}><span><label for="gp${i}"><b>${esc(nameOf(p))}</b></label>${p.description?`<small title="${esc(p.description)}">${esc(p.description.split('\n')[0].slice(0,110))}</small>`:''}${p.enabled&&p.categories.length?`<span class="gpsel">${p.categories.map(c=>`<span class="gpc">${c.name?`<small>${esc(c.name)}</small>`:''}<select data-gpc="${i}" data-cat="${esc(c.name)}" aria-label="${esc(c.name||'프리셋')}">${c.presets.map(x=>`<option ${x.name===c.selected?'selected':''}>${esc(x.name)}</option>`).join('')}</select></span>`).join('')}</span>`:''}</span></div>`).join('')}`).join('')}</div>
    <p class="muted csnote">Cemu가 켜져 있을 때는 바꿀 수 없어요 (Cemu가 닫힐 때 설정을 덮어써요). 원래 설정은 settings.xml.retroshelf.bak 에 한 번 저장해 둬요.</p></div>`;
}
async function cemuApply(rom,i){
  const spec=launchSpec(rom); const e=gpCache.get(gpKey(rom,spec)); const p=e?.res?.packs[i]; if(!p) return;
  if(cemuRunning()){ toast('Cemu를 닫은 뒤에 바꿔 주세요'); refreshOpen(); return }
  const box=document.querySelector(`.info input[data-gp="${i}"]`); const en=box?box.checked:p.enabled;
  document.querySelectorAll(`.info select[data-gpc="${i}"]`).forEach(sel=>{ const c=p.categories.find(c=>c.name===sel.dataset.cat); if(c) c.selected=sel.value });
  try{ await api.cemuSetPack(spec.exe,p.file,en,p.categories.map(c=>[c.name,c.selected])); const was=p.enabled; p.enabled=en; toast(was===en?`${p.name} 프리셋을 바꿨어요`:`${p.name} ${en?'켰어요':'껐어요'}`) }
  catch(err){ toast(String(err?.message||err)) }
  refreshOpen();
}
function ipsHTML(r,spec){
  if(spec?.kind!=='fbneo') return '';
  const drv=basename(r.files[0].path).replace(/\.[^.]+$/,'').toLowerCase();
  const e=ipsCache.get(spec.exe+'|'+drv); if(!e) return '<p class="note">IPS 패치 목록을 읽는 중…</p>';
  if(e.err) return `<div class="field"><label>IPS 패치</label><p class="note">패치 목록을 읽지 못했어요: <span class="mono">${esc(e.err)}</span></p></div>`;
  if(!e.list.length) return `<div class="field"><label>IPS 패치</label><p class="note">이 게임의 패치가 없어요. FBNeo의 <span class="mono">${esc(e.dir)}</span> 폴더에 .dat 파일을 넣으면 여기에 나와요.</p></div>`;
  const on=new Set((r.ips||[]).map(x=>x.toLowerCase()));
  return `<div class="field"><label>IPS 패치 <span class="muted">· ${e.list.length}개 · 고른 패치를 적용해서 실행해요</span></label>
    <div class="ipslist">${e.list.map(p=>`<label class="ips"><input type="checkbox" data-ips="${esc(p.file)}" ${on.has(p.file.toLowerCase())?'checked':''}><span><b>${esc(p.desc)}</b><small class="mono">${esc(p.file)}</small></span></label>`).join('')}</div>
    ${on.size?'<button class="btn sm" data-act="ipsclear" style="margin-top:6px">모두 해제</button>':''}</div>`;
}
/* ---------- PC엔진 CD System Card (게임별) ----------
   Mednafen만 지원: 게임별 설정 파일 pgconfig\<파일이름>.pce.cfg 에 pce.cdbios 를 적는다.
   Mednafen은 이 파일을 고쳐 쓰지 않으므로 전체 설정(mednafen.cfg)은 바뀌지 않는다. */
const SYSCARD_MARK='; RetroShelf: System Card';
const SYSCARD_EMUS={mednafen:'Mednafen',bizhawk:'BizHawk'};
const BIZHAWK_PCECD_KEY='PCECD+Bios';
function syscardMode(rom){ if(rom.console!=='pcecd') return null; const k=kindOf(emuFor(rom)); return SYSCARD_EMUS[k]?k:null }
const sysFound=new Map();   // Mednafen exe → 폴더에서 찾은 System Card 파일들
async function loadSyscards(spec){
  if(!api.listFiles||!spec) return;
  const s=sep(spec.exe); const dir=dirname(spec.exe); const out=[];
  for(const d of [dir+s+'firmware',dir]) for(const e of ['pce','bin','rom']) for(const f of await api.listFiles(d,e).catch(()=>[])){ if(/syscard|system|card|cd/i.test(basename(f.path))||e==='pce') out.push(f.path) }
  sysFound.set(spec.exe,[...new Set(out)]);
}
function syscardOptions(spec){
  const seen=new Set(); const out=[];
  for(const p of [...S.syscards,...(sysFound.get(spec?.exe)||[])]){ const k=p.toLowerCase(); if(!seen.has(k)){seen.add(k); out.push(p)} }
  return out;
}
async function syncSyscard(rom){
  if(syscardMode(rom)!=='mednafen') return true;   // BizHawk는 실행할 때만 바꾼다
  const spec=launchSpec(rom); if(!spec||!api.writePgconfig) return true;
  const s=sep(spec.exe); const base=basename(rom.files[0].path).replace(/\.[^.]+$/,'');
  for(const mod of ['pce','pce_fast']){
    const p=dirname(spec.exe)+s+'pgconfig'+s+base+'.'+mod+'.cfg';
    const cur=(await api.readText(p).catch(()=>null))||'';
    const lines=cur.split(/\r?\n/); const keep=[];
    for(let i=0;i<lines.length;i++){ if(lines[i]===SYSCARD_MARK){i++;continue} keep.push(lines[i]) }
    while(keep.length&&!keep[keep.length-1].trim()) keep.pop();
    if(rom.syscard) keep.push(SYSCARD_MARK,`${mod}.cdbios ${rom.syscard}`);
    try{ await api.writePgconfig(p,keep.join('\r\n')+(keep.length?'\r\n':'')) }catch(e){ toast('System Card 설정을 쓰지 못했어요: '+e); return false }
  }
  return true;
}
function syscardHTML(r,spec){
  if(r.console!=='pcecd') return '';
  const mode=syscardMode(r);
  if(!mode){
    const has=options('pcecd').find(o=>SYSCARD_EMUS[kindOf(o.id)]);
    return `<div class="field"><label>System Card</label><p class="note">System Card를 게임마다 고르는 기능은 ${Object.values(SYSCARD_EMUS).join(', ')}에서만 쓸 수 있어요.${has?' 위에서 이 게임의 에뮬레이터를 '+esc(has.label)+'(으)로 바꾸면 고를 수 있어요.':' 지금 지정된 에뮬레이터는 실행할 때 System Card를 바꿀 수 없어요.'}</p></div>`;
  }
  const opts=syscardOptions(spec); const cur=r.syscard||'';
  if(cur&&!opts.some(p=>p.toLowerCase()===cur.toLowerCase())) opts.unshift(cur);
  return `<div class="field"><label for="dsys">System Card <span class="muted">· ${mode==='mednafen'?'Mednafen 게임별 설정으로 적용':'BizHawk 실행할 때만 적용'}</span></label>
    <select class="sel" id="dsys"><option value="">에뮬레이터 기본값 (${esc(SYSCARD_EMUS[mode])} 설정)</option>${opts.map(p=>`<option value="${esc(p)}" ${p.toLowerCase()===cur.toLowerCase()?'selected':''}>${esc(basename(p))} — ${esc(dirname(p))}</option>`).join('')}<option value="__add">System Card 파일 추가…</option></select>
    <p class="note" style="margin-top:6px">${cur?`이 게임은 <b>${esc(basename(cur))}</b>로 실행해요. `:''}${mode==='mednafen'
      ?'Mednafen의 <span class="mono">pgconfig</span> 폴더에 이 게임 전용 설정으로 적어서, 다른 게임과 Mednafen 전체 설정은 그대로예요.'
      :'게임을 실행하는 동안만 BizHawk 펌웨어 설정(PCECD Bios)을 이 파일로 바꾸고, 게임을 끄면 원래대로 돌려놔요.'}</p></div>`;
}
function fbneoMissing(rom,spec){
  if(spec?.kind!=='fbneo'&&spec?.kind!=='m2emu')return false; const info=emuInfo.get(spec.exe); if(!info)return false;
  const want=normDir(dirname(rom.files[0].path));
  return !info.romPaths.some(p=>normDir(p)===want);
}
async function m2AddPath(rom,spec,info){
  const text=await api.readText(info.iniPath).catch(()=>null);
  if(!text){toast('Model 2 Emulator 설정 파일(EMULATOR.INI)이 없어요. 에뮬레이터를 한 번 직접 켰다 끈 뒤 다시 눌러 주세요');return}
  const dir=dirname(rom.files[0].path); const eol=text.includes('\r\n')?'\r\n':'\n';
  let next;
  const empty=/^([ \t]*Dir(\d+)[ \t]*=)[ \t]*(\r?)$/mi;
  const sec=text.match(/^\s*\[RomDirs\][^\[]*/mi);
  if(sec&&empty.test(sec[0])){ next=text.replace(sec[0],sec[0].replace(empty,(m,a,n,cr)=>a+dir+cr)) }
  else if(sec){ const n=Math.max(0,...[...sec[0].matchAll(/^\s*Dir(\d+)\s*=/gmi)].map(m=>+m[1]))+1; const body=sec[0].replace(/\s*$/,''); next=text.replace(sec[0],body+eol+`Dir${n}=${dir}`+eol+eol) }
  else next=text.replace(/\s*$/,'')+eol+eol+'[RomDirs]'+eol+`Dir1=${dir}`+eol;
  try{await api.writeIni(info.iniPath,next)}catch(e){toast('Model 2 Emulator 설정을 고치지 못했어요: '+e);return}
  await loadEmuInfo(spec); log(`Model 2 Emulator ROM 폴더에 추가: ${dir}`,'ok'); save(); refreshOpen();
  toast('Model 2 Emulator ROM 폴더에 이 폴더를 추가했어요 (원래 설정은 .bak으로 남겨 뒀어요)');
}
async function fbneoAddPath(rom){
  const spec=launchSpec(rom); const info=spec&&emuInfo.get(spec.exe); if(!info)return;
  if(spec.kind==='m2emu') return m2AddPath(rom,spec,info);
  const text=await api.readText(info.iniPath).catch(()=>null);
  if(!text){toast('FBNeo 설정 파일이 아직 없어요. FBNeo를 한 번 직접 켰다 끈 뒤 다시 눌러 주세요');return}
  const dir=dirname(rom.files[0].path)+'\\';
  const re=/^(szAppRomPaths\[(\d+)\])[ \t]*\r?$/m;
  const m=text.match(re);
  if(!m){toast('FBNeo ROM 경로 칸(최대 20개)이 모두 차 있어요. FBNeo에서 하나를 비워 주세요');return}
  const eol=text.includes('\r\n')?'\r':'';
  const next=text.replace(re,`${m[1]} ${dir}${eol}`);
  try{await api.writeIni(info.iniPath,next)}catch(e){toast('FBNeo 설정을 고치지 못했어요: '+e);return}
  await loadEmuInfo(spec); log(`FBNeo ROM 경로에 추가: ${dir}`,'ok'); save(); refreshOpen();
  toast('FBNeo ROM 경로에 이 폴더를 추가했어요 (원래 설정은 .ini.bak으로 남겨 뒀어요)');
}
/* 아무 실행 파일이나 골라 그 콘솔의 에뮬레이터로 등록 */
async function pickCustomFor(cid){
  const p=await api.pickExe(); if(!p) return null;
  const low=p.toLowerCase();
  let e=S.customEmus.find(x=>x.path.toLowerCase()===low);
  if(e){ if(cid&&!e.consoles.includes(cid)) e.consoles.push(cid); }
  else{
    const base=basename(p).replace(/\.(exe|appimage)$/i,'');
    const known=detectKind(p); const k=known==='retroarch'?null:known;
    e={key:'c'+hashStr(low).toString(36),name:k?EMUS[k].name:base,path:p,consoles:cid?[cid]:[],custom:true,kind:k,cores:[]};
    S.customEmus.push(e);
  }
  return e;
}

/* ===================== 그림 ===================== */
function hueOf(t){return hashStr(t)%360}
const artCache=new Map();
function artBg(title){
  let v=artCache.get(title); if(v) return v;
  const r=rng(hashStr(title)); const h=Math.floor(r()*360); const h2=(h+60+Math.floor(r()*180))%360; const h3=(h+170+Math.floor(r()*40))%360;
  const c1=`hsl(${h} 62% 24%)`, c2=`hsl(${h2} 72% 56%)`, c3=`hsl(${h3} 70% 72%)`;
  const k=Math.floor(r()*5), x=20+Math.floor(r()*60), y=22+Math.floor(r()*40);
  const vig='radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(0,0,0,.45))';
  if(k===0) v=`${vig}, radial-gradient(circle at ${x}% ${y}%, ${c3} 0 17%, transparent 17.5%), repeating-linear-gradient(0deg, rgba(0,0,0,.25) 0 2px, transparent 2px 8px) bottom / 100% 45% no-repeat, linear-gradient(180deg, ${c1}, ${c2})`;
  else if(k===1){const a=Math.floor(r()*180);v=`${vig}, repeating-linear-gradient(${a}deg, ${c2} 0 14px, ${c1} 14px 30px, ${c3} 30px 34px, ${c1} 34px 48px)`}
  else if(k===2) v=`${vig}, repeating-radial-gradient(circle at ${x}% ${y}%, ${c2} 0 9px, ${c1} 9px 20px, ${c3} 20px 22px, ${c1} 22px 30px)`;
  else if(k===3){const s=16+Math.floor(r()*22);v=`${vig}, radial-gradient(circle at ${x}% ${y}%, ${c3} 0 12%, transparent 12.5%), conic-gradient(${c2} 0 25%, ${c1} 0 50%, ${c2} 0 75%, ${c1} 0) 0 0 / ${s}px ${s}px`}
  else {const f=Math.floor(r()*360); v=`${vig}, repeating-conic-gradient(from ${f}deg at ${x}% ${y}%, ${c2} 0 9deg, ${c1} 9deg 22deg)`}
  artCache.set(title,v); return v;
}
/* ---------- 기기 아이콘 (박스아트가 없을 때) ----------
   실제 로고 대신 기기 형태를 단순한 선으로 그린다 */
const ICON_SVG={
  home:'<rect x="8" y="24" width="48" height="24" rx="4"/><rect x="20" y="17" width="24" height="9" rx="1.5"/><path d="M14 40h8"/><circle cx="46" cy="38" r="2.4"/><circle cx="40" cy="41" r="1.9"/>',
  disc:'<rect x="7" y="18" width="50" height="30" rx="5"/><circle cx="32" cy="33" r="9.5"/><circle cx="32" cy="33" r="2"/><path d="M13 42h6"/>',
  handheld:'<rect x="18" y="5" width="28" height="54" rx="4"/><rect x="23" y="10" width="18" height="17" rx="1.5"/><path d="M24 39h7M27.5 35.5v7"/><circle cx="39" cy="38" r="2"/><circle cx="35" cy="42.5" r="2"/>',
  wide:'<rect x="3" y="19" width="58" height="27" rx="10"/><rect x="20" y="23.5" width="24" height="18" rx="1.5"/><path d="M8 32.5h7M11.5 29v7"/><circle cx="53" cy="30" r="2"/><circle cx="49" cy="35" r="2"/>',
  dual:'<rect x="14" y="4" width="36" height="26" rx="3"/><rect x="19" y="8" width="26" height="18" rx="1"/><rect x="14" y="33" width="36" height="27" rx="3"/><rect x="24" y="37" width="16" height="13" rx="1"/><path d="M17 46h5M19.5 43.5v5"/><circle cx="46" cy="45" r="1.6"/>',
  hybrid:'<rect x="15" y="17" width="34" height="30" rx="2"/><rect x="19" y="21" width="26" height="22" rx="1"/><path d="M15 17h-4a5 5 0 0 0-5 5v20a5 5 0 0 0 5 5h4zM49 17h4a5 5 0 0 1 5 5v20a5 5 0 0 1-5 5h-4z"/><circle cx="10.5" cy="26" r="1.8"/><circle cx="53.5" cy="38" r="1.8"/>',
  arcade:'<path d="M18 4h28l-2 13 6 8v35H14V25l6-8z"/><rect x="21" y="8" width="22" height="13" rx="1"/><path d="M14 30h36"/><path d="M25 37v-5"/><circle cx="25" cy="38" r="2.2"/><circle cx="37" cy="37" r="1.7"/><circle cx="42.5" cy="37" r="1.7"/>',
  computer:'<rect x="4" y="24" width="56" height="22" rx="3"/><rect x="42" y="18" width="13" height="6" rx="1"/><path d="M9 30h4M16 30h4M23 30h4M30 30h4M37 30h4M44 30h4M51 30h4M10 35h4M17 35h4M24 35h4M31 35h4M38 35h4M45 35h4M18 40h28"/>',
};
const ICON_OF={nes:'home',fds:'home',snes:'home',vb:'home',n64:'home',md:'home',sms:'home',sg1000:'home','32x':'home',pce:'home',sgx:'home',a2600:'home',a7800:'home',
  gb:'handheld',gbc:'handheld',gba:'wide',gg:'wide',psp:'wide',psvita:'wide',lynx:'wide',ngp:'wide',ngpc:'wide',ws:'wide',wsc:'wide',
  nds:'dual','3ds':'dual',switch:'hybrid',switch2:'hybrid',arcade:'arcade',naomi:'arcade',naomi2:'arcade',atomiswave:'arcade',model1:'arcade',model2:'arcade',model3:'arcade',teknoparrot:'arcade',
  msx:'computer',msx2:'computer',turbor:'computer'};
function consoleIcon(cid){return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_SVG[ICON_OF[cid]||'disc']}</svg>`}
function iconArt(cid){const c=CONS[cid]||UNKNOWN; return `<div class="art icon">${consoleIcon(c.id)}<span class="ic-name">${esc(c.short)}</span></div>`}
/* 롬 파일 안에서 꺼낸 타이틀 이미지(아이콘)를 기기 색 바탕 가운데에 놓는다 */
function embArt(rom){const c=CONS[rom.console]||UNKNOWN; return `<div class="art icon emb${rom.console==='nds'?' px':''}"><img src="${esc(api.fileSrc(rom.icon))}" alt="" loading="lazy" decoding="async" draggable="false" data-c="${esc(rom.console)}"><span class="ic-name">${esc(c.short)}</span></div>`}
function nxArt(rom){const src=esc(api.fileSrc(rom.icon)); return `<div class="art nxart"><img class="bg" src="${src}" alt="" loading="lazy" decoding="async" draggable="false"><img class="fg" src="${src}" alt="" loading="lazy" decoding="async" draggable="false"></div>`}
function coverOf(rom){const p=rom.cover||rom.autoCover||rom.boxart; if(!p)return null; return /^(https?|asset|data|file):/i.test(p)?p:api.fileSrc(p)}
function boxHTML(rom,{mini}={}){
  const c=CONS[rom.console]||UNKNOWN; const unk=rom.console==='unknown'; const cv=coverOf(rom);
  const style=`aspect-ratio:${c.aspect};--band:${c.band};${c.bandh?`--bandh:${c.bandh};`:''}`;
  // Switch는 커버가 없고 아이콘만 있으면 패키지처럼: 흰 라벨 + 빨간 띠 + 아이콘을 꽉 채운 그림
  const nxPkg=!cv&&rom.icon&&(rom.console==='switch'||rom.console==='switch2');
  const art = cv ? `<img class="art" src="${esc(cv)}" alt="" data-c="${esc(rom.console)}" loading="lazy" decoding="async" draggable="false">` : unk ? `` : nxPkg ? nxArt(rom) : rom.icon ? embArt(rom) : iconArt(rom.console);
  const band = nxPkg ? `<div class="band nxband"><span class="n1">NINTENDO</span><span class="n2">SWITCH${rom.console==='switch2'?'<b>2</b>':''}</span></div>` : `<div class="band">${esc(c.short)}</div>`;
  return `<div class="box k-${c.kind}${cv?' hasimg':''}${nxPkg?' nxpkg hasimg':''}${unk?' unk':''}" style="${style}">
    ${band}${art}
    ${!mini&&rom.region?`<span class="rg">${esc(rom.region)}</span>`:''}
    ${!mini&&rom.discs>1?`<span class="disc-n">${rom.discs} DISC</span>`:''}
    ${mini?'':`<div class="cap"><div class="ttl">${esc(rom.title)}</div>${rom.variant?`<div class="var">${esc(rom.variant)}</div>`:''}</div>`}
    <div class="gloss"></div><div class="rim"></div>
  </div>`;
}
document.addEventListener('error',e=>{const t=e.target; if(t.tagName==='IMG'&&t.classList.contains('art')){const d=document.createElement('div');d.innerHTML=iconArt(t.dataset.c||'unknown');t.closest('.box')?.classList.remove('hasimg');t.replaceWith(d.firstChild)}},true);

const effCh=()=>couch?Math.max(S.ch,Math.min(300,Math.round(innerHeight*.3))):S.ch;
function caseSize(rom){const c=CONS[rom.console]; const ch=effCh(); const h=Math.round(ch*c.h/19);
  return S.view==='spine' ? {w:Math.max(22,Math.round(c.thick*ch/19*1.7)),h} : {w:Math.round(h*c.aspect),h}}
function spineHTML(rom){const c=CONS[rom.console];
  return `<div class="spine" style="width:100%;height:100%;--band:${c.band};--sp:hsl(${hueOf(rom.title)} 38% 24%)"><span class="sb">${esc(c.short)}</span><span class="st">${esc(rom.title)}</span><span class="sr">${esc((rom.region||'').split('·')[0])}</span></div>`}
function mediaHTML(rom){
  const c=CONS[rom.console]; const bg=`radial-gradient(circle at 50% 30%, rgba(255,255,255,.22), transparent 60%), linear-gradient(160deg, color-mix(in srgb, ${c.band} 80%, white), color-mix(in srgb, ${c.band} 70%, black))`; const run=runningIds.has(rom.id)?' running':'';
  const art=coverOf(rom)||(rom.icon?api.fileSrc(rom.icon):null);
  // 디스크 라벨: 커버 그림을 원판에 인쇄한 것처럼 (가운데 구멍·투명 고리는 위에 겹친다)
  const disc=(cls='')=>`<button class="disc ${cls}${run}${art?' art':''}" data-act="run" aria-label="${esc(rom.title)} 실행"><span class="lab" style="background:${bg}">${art?`<img class="dimg" src="${esc(art)}" alt="" draggable="false">`:''}${rom.discs>1?'<span class="ds">DISC 1</span>':''}${art?'':`<span class="dt">${esc(rom.title)}</span>`}</span><span class="ring"></span><span class="hub"></span></button>`;
  if(c.media==='disc') return disc();
  if(c.media==='mini') return disc('mini');
  if(c.media==='umd') return `<div class="umd">${disc()}</div>`;
  const cs=window.cartShape?.(rom,c);
  if(cs){ const {key,sh,color}=cs; const [W,H]=sh.vb; const l=sh.lab;
    const pct=(v,t)=>(v/t*100).toFixed(2)+'%';
    return `<button class="cart2 s-${key}" data-act="run" aria-label="${esc(rom.title)} 실행" style="--cw:calc(var(--w) * ${sh.fw});--ar:${W}/${H};--arn:${(W/H).toFixed(4)};--cb:${color}">
      <svg viewBox="0 0 ${W} ${H}" aria-hidden="true" preserveAspectRatio="none">${sh.svg()}</svg>
      <span class="cl${art?' has':''}" style="left:${pct(l[0],W)};top:${pct(l[1],H)};width:${pct(l[2],W)};height:${pct(l[3],H)};border-radius:${l[4]/W*100}% / ${l[4]/H*100}%;background:${bg}">${art?`<img class="clbg" src="${esc(art)}" alt=""><img class="clim" src="${esc(art)}" alt="">`:`<span>${esc(rom.title)}</span>`}</span></button>`; }
  const [fw,fh,col]=c.cart;
  return `<button class="cart${c.notch?' notch':''}${c.media==='pcb'?' pcb':''}" data-act="run" aria-label="${esc(rom.title)} 실행" style="--cw:calc(var(--w) * ${fw});--chh:calc(var(--h) * ${fh});--cb:${col}">
    <span class="cl${coverOf(rom)?' has':''}" style="background:${bg}">${coverOf(rom)?`<img class="clbg" src="${esc(coverOf(rom))}" alt=""><img class="clim" src="${esc(coverOf(rom))}" alt="">`:`<span>${esc(rom.title)}</span>`}</span><span class="rd"></span></button>`;
}
/* 케이스 플라스틱 색: 실제 케이스에 맞춘다 [바깥, 안쪽 받침] */
const CASE_COL={ps2:['#141518','#0c0d0f'],gc:['#141518','#0c0d0f'],wii:['#eef0f2','#d9dce1'],wiiu:['#e4eef6','#c9d8e6'],xbox:['#1d3a22','#132717'],xbox360:['#4c9a43','#2f6d2a'],
  ps3:['#2a5aa8','#1d4384'],ps4:['#1f4f9e','#173c7a'],ps5:['#f1f3f6','#dfe3e9'],psp:['#d3d7de','#b9bfc9'],switch:['#c8102e','#8f0b21'],switch2:['#c8102e','#8f0b21'],'3ds':['#eceef1','#d4d8de'],
  nds:['#1b1c20','#111215'],psvita:['#2e4566','#21334d'],md:['#16171a','#0d0e10'],'32x':['#16171a','#0d0e10'],sms:['#16171a','#0d0e10'],gg:['#16171a','#0d0e10'],
  ps1:['#0c0d10','#16181d'],saturn:['#0c0d10','#16181d'],segacd:['#0c0d10','#16181d'],dreamcast:['#e7e8ea','#cfd2d6'],pcecd:['#0c0d10','#16181d'],neocd:['#0c0d10','#16181d'],pce:['#0c0d10','#16181d'],sgx:['#0c0d10','#16181d'],pcfx:['#0c0d10','#16181d']};
function caseHTML(rom){
  const c=CONS[rom.console]; const cc=CASE_COL[rom.console];
  return `<div class="case3d"${cc?` style="--cc:${cc[0]};--cc2:${cc[1]}"`:''}>
    <div class="base t-${c.kind}">${rom.console==='unknown'?'<span class="note" style="color:#bbb">콘솔을 먼저 지정하세요</span>':mediaHTML(rom)}</div>
    <div class="lid">
      <div class="face front">${boxHTML(rom)}</div>
      <div class="face inner i-${c.kind}"><div class="manual"><div class="mart" style="--band:${c.band}">${coverOf(rom)?`<img class="mimg" src="${esc(coverOf(rom))}" alt="">`:rom.icon?embArt(rom):iconArt(rom.console)}</div><b>${esc(rom.title)}</b><span>${esc(c.name)}${rom.region?' · '+esc(rom.region):''}</span><div class="lines"></div><i>취급설명서</i></div></div>
    </div></div>`;
}

/* ===================== 목록 계산 ===================== */
/* ---------- 정렬 ---------- */
const SORTS={name:'이름',console:'콘솔',region:'지역',emu:'에뮬레이터',plays:'플레이 시간',recent:'최근 실행',year:'발매연도',size:'크기'};
const SORT_DEFAULT_DIR={name:1,console:1,region:1,emu:1,plays:-1,recent:-1,year:1,size:-1};
const consoleOrder=Object.fromEntries([...CONSOLES,UNKNOWN].map((c,i)=>[c.id,i]));
function sortCmp(key){
  const byName=(a,b)=>collator.compare(a.title,b.title)||collator.compare(a.variant||'',b.variant||'');
  switch(key){
    case 'console': return (a,b)=>consoleOrder[a.console]-consoleOrder[b.console];
    case 'region': return (a,b)=>(!a.region)-(!b.region)||collator.compare(a.region||'',b.region||'');
    case 'emu': return (a,b)=>collator.compare(optLabel(emuFor(a))||'\uffff',optLabel(emuFor(b))||'\uffff');
    case 'plays': return (a,b)=>(a.playSeconds||0)-(b.playSeconds||0);
    case 'recent': return (a,b)=>(a.lastPlayed||0)-(b.lastPlayed||0);
    case 'size': return (a,b)=>(a.size||0)-(b.size||0);
    case 'year': return (a,b)=>(parseInt(a.year)||9999)-(parseInt(b.year)||9999);
    default: return byName;
  }
}
/* ---------- 필터 ---------- */
const FLT_REGIONS=['JP','US','EU','KR','WW','기타'];
const decadeOf=y=>{ const n=parseInt(y); if(!n||n<1970) return '정보 없음'; return n<2000?`${String(n).slice(2,3)}0년대`:`${String(n).slice(0,3)}0년대` };
const FLT_TOGGLES={kor:'한국어판만',official:'정식판만 (베타·프로토 제외)',runnable:'실행 가능한 것만',covered:'커버 있는 것만',nocover:'커버 없는 것만',played:'플레이한 것만',unplayed:'안 해 본 것만'};
function fltCount(){const f=S.flt||{}; return (f.regions||[]).length+(f.genres||[]).length+(f.decades||[]).length+Object.keys(FLT_TOGGLES).filter(k=>f[k]).length}
function applyFlt(r){
  const f=S.flt||{};
  if(f.regions?.length) r=r.filter(x=>{const rg=(x.region||'').split('·').filter(Boolean); return f.regions.some(g=>g==='기타'?!rg.some(v=>['JP','US','EU','KR','WW'].includes(v)):rg.includes(g))});
  if(f.kor) r=r.filter(x=>x.kor);
  if(f.genres?.length) r=r.filter(x=>f.genres.includes(genreKo(x.genre)||'정보 없음'));
  if(f.decades?.length) r=r.filter(x=>f.decades.includes(decadeOf(x.year)));
  if(f.official) r=r.filter(x=>!x.variant);
  if(f.runnable) r=r.filter(x=>emuFor(x));
  if(f.covered) r=r.filter(x=>x.cover||x.autoCover||x.boxart||x.icon);
  if(f.nocover) r=r.filter(x=>!x.cover&&!x.autoCover&&!x.boxart);
  if(f.played) r=r.filter(x=>(x.plays||0)>0||(x.playSeconds||0)>0);
  if(f.unplayed) r=r.filter(x=>!(x.plays||0)&&!(x.playSeconds||0));
  return r;
}
/* ---------- 지역판 묶기 (1G1R): 같은 콘솔·같은 제목의 지역판·리비전을 케이스 하나로 ---------- */
let VERS=null, REPN=new Map();
const verKey=r=>r.console==='unknown'||r.console==='teknoparrot'?'#'+r.id:r.arcName?r.console+'|'+(r.arcParent||r.arcName):r.console+'|'+(thumbKey(r.title)||r.id);
function versMap(){ if(VERS) return VERS; VERS=new Map(); for(const r of S.roms){ const k=verKey(r); const a=VERS.get(k); if(a) a.push(r); else VERS.set(k,[r]) } return VERS }
function versionsOf(r){ return versMap().get(verKey(r))||[r] }
function regionRank(r){ const pref=S.settings.regionPref||[]; const rg=(r.region||'').split('·').filter(Boolean); let best=pref.length+1;
  for(const x of rg){ const i=pref.indexOf(x); if(i>=0&&i<best) best=i; else if(i<0&&best>pref.length) best=pref.length } return best }
function verCmp(a,b){ return (!!a.arcParent)-(!!b.arcParent) || (!!b.kor)-(!!a.kor) || (!!a.variant)-(!!b.variant) || regionRank(a)-regionRank(b) || (!emuFor(a))-(!emuFor(b)) || (b.lastPlayed||0)-(a.lastPlayed||0) || a.files[0].path.length-b.files[0].path.length }
function pickRep(list){ const k=verKey(list[0]); const p=S.groupPick?.[k]; return list.find(x=>x.id===p)||[...list].sort(verCmp)[0] }
function groupVersions(list){
  REPN=new Map(); if(S.settings.oneG===false) return list;
  const by=new Map(); for(const r of list){ const k=verKey(r); const a=by.get(k); if(a) a.push(r); else by.set(k,[r]) }
  const out=[]; for(const a of by.values()){ const rep=a.length>1?pickRep(a):a[0]; const n=versionsOf(rep).length; if(n>1) REPN.set(rep.id,n); out.push(rep) }
  return out;
}
const colOf=id=>(S.cols||[]).find(c=>c.id===id);
function visibleRoms(){
  let r=S.roms;
  if(S.filter.startsWith('col:')){ const c=colOf(S.filter.slice(4)); const set=new Set(c?.ids||[]); r=r.filter(x=>set.has(x.id)) }
  else if(S.filter==='fav') r=r.filter(x=>x.fav);
  else if(S.filter==='kor') r=r.filter(x=>x.kor);
  else if(S.filter==='recent') r=r.filter(x=>x.lastPlayed);
  else if(S.filter!=='all') r=r.filter(x=>x.console===S.filter);
  if(S.q){const q=S.q.toLowerCase();r=r.filter(x=>x.title.toLowerCase().includes(q)||x.files[0].path.toLowerCase().includes(q))}
  r=groupVersions(applyFlt(r));
  const key=S.filter==='recent'?'recent':(SORTS[S.sort]?S.sort:'name');
  const dir=S.filter==='recent'?-1:(S.sortDir||SORT_DEFAULT_DIR[key]);
  const main=sortCmp(key), byName=sortCmp('name');
  return [...r].sort((a,b)=>dir*main(a,b)||byName(a,b));
}
function counts(){const m={};for(const r of S.roms)m[r.console]=(m[r.console]||0)+1;return m}

/* ===================== 보이는 부분만 그리기 =====================
   선반(또는 목록 줄)의 위치와 높이를 먼저 계산해 두고, 화면 근처에 있는 것만 DOM으로 만든다. */
let VL=null; let lastRange='';
function buildShelfLayout(list){
  // 선반 한 칸의 실제 안쪽 너비 (진열장 테두리·선반 여백을 뺀 값)
  const rowPad=innerWidth<=760?24:40; const cab=$('.cabinet');
  const avail=Math.max(200,(cab?cab.clientWidth:(($('#main').clientWidth||800)-28-20))-rowPad);
  const gap=S.view==='spine'?3:16; const front=S.view!=='spine';
  let groups;
  if(S.filter==='all'&&!S.q&&S.sort==='name'&&(S.sortDir||1)===1){
    const by={}; for(const r of list)(by[r.console]=by[r.console]||[]).push(r);
    groups=[...CONSOLES,UNKNOWN].filter(c=>by[c.id]).map(c=>({c,items:by[c.id]}));
  } else groups=[{c:CONS[S.filter]||null,items:list}];
  const items=[]; let top=0;
  for(const g of groups){
    let cur=[]; let w=0; let maxH=0; let first=true;
    // 같은 크기 케이스만 있는 묶음은 열 수를 정해 격자로 놓는다 → 남는 폭이 간격으로 고르게 나뉘고 마지막 줄도 열이 맞는다
    const sz=g.items.length?caseSize(g.items[0]):null;
    const uniform=front&&sz&&g.items.every(r=>{const t=caseSize(r);return t.w===sz.w&&t.h===sz.h});
    const cols=uniform?Math.max(1,Math.floor((avail+gap)/(sz.w+gap))):0;
    const flush=(full)=>{ if(!cur.length)return; const h=maxH+48+(priceTags()?TAG_H:0);
      const plate = first ? (g.c ? `<b>${esc(g.c.name)}</b> · ${fmtNum(g.items.length)} · ${esc(optLabel(S.map[g.c.id]?.id)||(g.c.id==='unknown'?'콘솔 지정 필요':'에뮬레이터 없음'))}`
        : `<b>${esc(filterName())}${S.q?' · 검색 결과':''}</b> · ${fmtNum(g.items.length)}`) : '';
      items.push({top,h,row:cur,plate,cols,cw:uniform?sz.w:0,full:front&&!uniform&&full}); top+=h; first=false; cur=[]; w=0; maxH=0; };
    for(const r of g.items){const s=caseSize(r); if(cur.length&&(uniform?cur.length>=cols:w+gap+s.w>avail)) flush(true); cur.push([r,s]); w+=(cur.length>1?gap:0)+s.w; if(s.h>maxH)maxH=s.h}
    flush();
  }
  return {kind:'shelf',items,total:top};
}
/* 앞면 진열: 선반 앞쪽 레일에 끼운 가격표 모양 이름표 */
const TAG_H=40;
const priceTags=()=>S.view!=='spine'&&S.settings.priceTags!==false;
function priceTagHTML(r){
  const c=CONS[r.console]||UNKNOWN; const yr=parseInt(r.year)||'';
  return `<span class="ptag" style="--tagc:${c.band}" aria-hidden="true"><span class="pt-top"><b>${esc(c.short)}</b><span>${esc([r.region,yr].filter(Boolean).join(' · '))}</span></span><span class="pt-name">${r.kor?'<i>한</i>':''}${esc(r.title)}</span></span>`;
}
function shelfRowHTML(it){
  const sp=S.view==='spine'; const tg=priceTags();
  const lay=it.cols?`;display:grid;grid-template-columns:repeat(${it.cols},${it.cw}px);justify-content:space-between;align-items:end;column-gap:0`:it.full?';justify-content:space-between':'';
  return `<div class="srow ${sp?'spines':'front'}${tg?' tags':''}" style="top:${it.top}px;height:${it.h}px${lay}">${it.row.map(([r,s])=>`<button class="case${sp?' sp':''}${r.id===openId?' out':''}" data-id="${r.id}" aria-label="${esc(r.title)}" title="${esc(r.title)}" style="width:${s.w}px;height:${s.h}px">${sp?spineHTML(r):boxHTML(r)}${r.fav&&!sp?'<span class="badge">⭐</span>':''}${r.kor?`<span class="korb${sp?' sp':''}" title="한국어판">한</span>`:''}${REPN.get(r.id)&&!sp?`<span class="vers" title="지역판·버전 ${REPN.get(r.id)}개">+${REPN.get(r.id)-1}</span>`:''}${emuFor(r)?'':'<span class="nogo" title="실행할 에뮬레이터 없음"></span>'}${runningIds.has(r.id)&&!sp?'<span class="run">실행 중</span>':''}${r.offline&&!sp?'<span class="off">연결 안 됨</span>':''}${tg?priceTagHTML(r):''}</button>`).join('')}${it.plate?`<span class="plate">${it.plate}</span>`:''}</div>`;
}
const EXPAND=new Set();
function buildListLayout(list){
  const items=[]; let y=0;
  for(const r of list){ items.push({top:y,h:58,rom:r}); y+=58;
    if(REPN.get(r.id)&&EXPAND.has(verKey(r))) for(const v of [...versionsOf(r)].sort(verCmp)) if(v!==r){ items.push({top:y,h:50,rom:v,child:true,last:false}); y+=50 }
  }
  for(let i=0;i<items.length;i++) if(items[i].child&&!items[i+1]?.child) items[i].last=true;
  return {kind:'list',items,total:y}}
function listRowHTML(it){const r=it.rom; const n=REPN.get(r.id); const k=n?verKey(r):''; const ex=n&&EXPAND.has(k);
  const tw=it.child?`<span class="tw leaf" aria-hidden="true">${it.last?'└':'├'}</span>`:n?`<span class="tw" data-act="expand" data-k="${esc(k)}" role="button" aria-label="${ex?'접기':'펼치기'}" aria-expanded="${!!ex}">${ex?'▾':'▸'}</span>`:'';
  return `<button class="row${r.id===openId?' out':''}${it.child?' child':''}${ex?' expanded':''}" data-id="${r.id}" style="top:${it.top}px;height:${it.h}px">${boxHTML(r,{mini:true})}<span class="t">${tw}${r.fav?'⭐ ':''}${esc(it.child&&r.arcName?(r.arcParent?'클론':'원본')+' · '+r.arcName:r.title)}${r.variant?` <span class="muted">(${esc(r.variant)})</span>`:''}${r.discs>1?` <span class="muted mono">(${r.discs}장)</span>`:''}${r.kor?' <span class="pill kor">한글</span>':''}${n?` <span class="pill mut">${r.arcName?`클론 ${n-1}개`:`${n}개 판`}</span>`:''}${runningIds.has(r.id)?' <span class="pill ok">실행 중</span>':''}</span><span class="c">${esc(CONS[r.console].name)}</span><span class="r">${esc(r.region||'—')}</span><span class="e">${emuFor(r)?esc(optLabel(emuFor(r))):'<span style="color:var(--bad)">없음</span>'}</span><span class="s">${fmtDur(r.playSeconds)}</span></button>`}
function updateVisible(force){
  const host=$('#vhost'); if(!host||!VL)return;
  const r=host.getBoundingClientRect(); const vt=-r.top-700, vb=-r.top+innerHeight+700;
  const its=VL.items; let lo=0, hi=its.length;
  while(lo<hi){const m=(lo+hi)>>1; if(its[m].top+its[m].h<vt) lo=m+1; else hi=m}
  let end=lo; while(end<its.length&&its[end].top<vb) end++;
  const key=lo+':'+end; if(!force&&key===lastRange)return; lastRange=key;
  const fn=VL.kind==='shelf'?shelfRowHTML:listRowHTML;
  let h=''; for(let i=lo;i<end;i++) h+=fn(its[i]);
  host.innerHTML=h;
}
let scrollRaf=0;
// 본문과 사이드바가 따로 스크롤되므로 캡처 단계에서 모든 스크롤을 받는다
document.addEventListener('scroll',()=>{if(scrollRaf)return;scrollRaf=requestAnimationFrame(()=>{scrollRaf=0;updateVisible()})},{passive:true,capture:true});

/* ===================== 렌더 ===================== */
function renderStats(){
  const cn=counts(); const nc=Object.keys(cn).filter(k=>k!=='unknown').length;
  $('#stats').innerHTML = scanning ? `<span class="busy">스캔 중 · 폴더 ${fmtNum(scanning.dirs)} · 파일 ${fmtNum(scanning.files)}</span>`
    : `ROM ${fmtNum(S.roms.length)} · 콘솔 ${nc} · 에뮬레이터 ${allEmus().length}${runningIds.size?` · <span class="busy">실행 중 ${runningIds.size}</span>`:''}`;
  $('#rescanBtn').disabled=!!scanning||!scanRoots().length;
  $('#addBtn').disabled=!!scanning;
}
function render(){
  document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected',t.dataset.tab===S.tab));
  renderStats();
  $('#app').classList.toggle('noside',S.tab!=='lib');
  $('#side').hidden=S.tab!=='lib';
  if(S.tab==='lib'){renderSide();renderLib()} else {VL=null; if(S.tab==='emu') renderEmu(); else if(S.tab==='stats') renderPlayStats(); else renderScan();}
}
function renderSide(){
  const cn=counts();
  const nav=(id,label,n,sw,extra='',col)=>`<button class="nav${col?' colnav':''}" data-f="${id}" aria-current="${S.filter===id}">${col?'<span class="colico" aria-hidden="true">▤</span>':''}${sw?`<span class="sw" style="background:${sw}"></span>`:''}<span>${esc(label)}</span>${extra}<span class="n">${fmtNum(n)}</span></button>`;
  let h=nav('all','전체 진열장',S.roms.length)+nav('fav','즐겨찾기',S.roms.filter(r=>r.fav).length)+nav('recent','최근 실행',S.roms.filter(r=>r.lastPlayed).length);
  { const k=S.roms.filter(r=>r.kor).length; if(k) h+=nav('kor','한국어판',k,null,'<span class="korb inl" aria-hidden="true">한</span>'); }
  const ids=new Set(S.roms.map(r=>r.id));
  h+=`<h4 class="colh">내 컬렉션<button class="coladd" data-act="coladd" title="새 컬렉션 만들기" aria-label="새 컬렉션 만들기">+</button></h4>`;
  if(!(S.cols||[]).length) h+=`<p class="colempty">게임을 꺼내서 [컬렉션]에 넣으면 여기에 선반이 생겨요</p>`;
  for(const c of S.cols||[]) h+=nav('col:'+c.id,c.name,c.ids.filter(i=>ids.has(i)).length,null,'',true);
  let maker='';
  for(const c of CONSOLES){ if(!cn[c.id])continue;
    if(c.maker!==maker){maker=c.maker; h+=`<h4>${esc(maker)}</h4>`}
    h+=nav(c.id,c.name,cn[c.id],c.band,S.map[c.id]?.id?'':'<span class="warnico" title="실행할 에뮬레이터 없음">●</span>'); }
  if(cn.unknown) h+='<h4>확인 필요</h4>'+nav('unknown','미분류',cn.unknown,UNKNOWN.band);
  $('#side').innerHTML=h;
}
function renderShelf(){
  const el=$('#shelf'); if(!el)return;
  const list=visibleRoms(); lastRange='';
  if(!S.roms.length){VL=null; el.innerHTML=`<div class="empty"><b>진열장이 비어 있어요</b>에뮬레이터와 ROM이 들어 있는 폴더를 추가하면 자동으로 찾아서 진열해요.<br>폴더를 여러 개 추가해도 되고, 상위 폴더 하나(예: D:\\Games)만 골라도 돼요.<div class="scanrow" style="justify-content:center"><button class="btn primary" data-act="add">폴더 추가</button><button class="btn" data-act="sample">예시 데이터로 둘러보기</button></div></div>`; return}
  if(!list.length){VL=null; el.innerHTML=`<div class="empty"><b>조건에 맞는 게임이 없어요</b>검색어나 왼쪽 선반을 바꿔 보세요.</div>`; return}
  if(S.view==='list'){
    VL=buildListLayout(list);
    el.innerHTML=`<div class="list"><div class="row listhead"><span></span>${[['name','제목'],['console','콘솔'],['region','지역'],['emu','에뮬레이터'],['plays','플레이']].map(([k,l])=>{const on=S.sort===k; const d=S.sortDir||SORT_DEFAULT_DIR[k]; return `<button class="hsort${on?' on':''}${k==='plays'?' r':''}" data-sort="${k}" aria-sort="${on?(d>0?'ascending':'descending'):'none'}">${l}${on?(d>0?' ▲':' ▼'):''}</button>`}).join('')}</div><div class="vhost" id="vhost" style="height:${VL.total}px"></div></div>`;
  } else {
    VL=buildShelfLayout(list);
    el.innerHTML=`<div class="cabinet"><div class="vhost" id="vhost" style="height:${VL.total}px"></div></div>`;
  }
  updateVisible(true);
}
function fltBarHTML(){
  const f=S.flt||{}; const base=(()=>{const keep=S.flt; S.flt={}; const n=visibleRoms().length; S.flt=keep; return n})();
  return `<div class="fltbar">
    <div class="fltrow"><span class="fltlbl">지역</span>${FLT_REGIONS.map(g=>`<button class="chip tog${(f.regions||[]).includes(g)?' on':''}" data-flt="region:${g}" aria-pressed="${(f.regions||[]).includes(g)}">${g}</button>`).join('')}</div>
    ${(()=>{ const keep=S.flt; S.flt={...keep,genres:[],decades:[]}; const base=visibleRoms(); S.flt=keep;
      const gc={}, dc={}; for(const r of base){ const g=genreKo(r.genre)||'정보 없음'; gc[g]=(gc[g]||0)+1; const d=decadeOf(r.year); dc[d]=(dc[d]||0)+1 }
      const known=Object.keys(gc).filter(g=>g!=='정보 없음'); if(!known.length&&!(f.genres||[]).length) return '';
      const gs=Object.entries(gc).sort((a,b)=>(a[0]==='정보 없음')-(b[0]==='정보 없음')||b[1]-a[1]).slice(0,16);
      const ds=Object.entries(dc).sort((a,b)=>(a[0]==='정보 없음')-(b[0]==='정보 없음')||a[0].localeCompare(b[0]));
      const chip=(kind,v,n)=>{ const on=(f[kind]||[]).includes(v); return `<button class="chip tog${on?' on':''}" data-flt="${kind}:${esc(v)}" aria-pressed="${on}">${esc(v)} <small>${fmtNum(n)}</small></button>` };
      return `<div class="fltrow"><span class="fltlbl">장르</span>${gs.map(([g,n])=>chip('genres',g,n)).join('')}</div><div class="fltrow"><span class="fltlbl">연대</span>${ds.map(([d,n])=>chip('decades',d,n)).join('')}</div>`; })()}
    <div class="fltrow"><span class="fltlbl">조건</span>${Object.entries(FLT_TOGGLES).map(([k,l])=>`<button class="chip tog${f[k]?' on':''}" data-flt="${k}" aria-pressed="${!!f[k]}">${l}</button>`).join('')}</div>
    <div class="fltrow fltfoot"><span class="muted">${fmtNum(visibleRoms().length)} / ${fmtNum(base)}개 표시</span>${fltCount()?'<button class="btn sm" data-act="fltclear">필터 지우기</button>':''}</div></div>`;
}
function renderLib(){
  const title = filterName(); const col=S.filter.startsWith('col:')?colOf(S.filter.slice(4)):null;
  const m=S.map[S.filter]; let sub='';
  if(CONS[S.filter]&&S.filter!=='unknown') sub = m?.id?`실행 에뮬레이터: <b>${esc(optLabel(m.id))}</b> ${m.auto?'<span class="pill mut">자동</span>':'<span class="pill ok">직접 지정</span>'}`:`<span class="pill bad">실행할 에뮬레이터가 없어요</span> <button class="btn sm" data-act="pickfor" data-c="${S.filter}">실행 파일 직접 지정</button>`;
  if(CONS[S.filter]&&S.filter!=='unknown'){
    const cdl=(S.consoleDirs||{})[S.filter]||[];
    sub+=` <span class="cdhint">${cdl.length?`· ROM 폴더 ${cdl.length}개만 진열 중`:'· ROM 폴더 지정 안 함'} <button class="btn sm" data-act="cdpick" data-c="${S.filter}">ROM 폴더 ${cdl.length?'추가':'지정'}</button>${cdl.length?' <button class="btn sm" data-tab="scan">관리</button>':''}</span>`;
  }
  if(CONS[S.filter]&&S.filter!=='unknown'){
    const inC=S.roms.filter(r=>r.console===S.filter);
    const nCov=inC.filter(r=>r.cover).length;
    const nx=S.filter==='switch'||S.filter==='switch2';
    const nNoIcon=nx?inC.filter(r=>!r.icon).length:0;
    if(nCov||nx) sub+=` <span class="cdhint">·${nCov?` <button class="btn sm" data-act="uncoverall" data-c="${S.filter}" data-n="${nCov}" title="이 콘솔에서 직접 정한 커버를 모두 지우고 박스아트·아이콘으로 되돌려요">직접 정한 커버 ${fmtNum(nCov)}개 되돌리기</button>`:''}${nx?` <button class="btn sm" data-act="iconall" data-c="${S.filter}" ${iconBusy?'disabled':''} title="롬 파일에서 타이틀 아이콘을 꺼내요 (prod.keys 필요)">${nNoIcon?`아이콘 없는 ${fmtNum(nNoIcon)}개 아이콘 꺼내기`:'아이콘 모두 다시 꺼내기'}</button>`:''}</span>`;
  }
  if(S.filter==='unknown') sub='확장자와 폴더 이름만으로는 콘솔을 알 수 없는 파일이에요. 꺼내서 콘솔을 지정하세요.';
  if(col) sub=`<span class="colbar"><input class="colname" id="colname" value="${esc(col.name)}" aria-label="컬렉션 이름" maxlength="40"> <button class="btn sm danger" data-act="coldel" data-col="${col.id}">컬렉션 지우기</button> <span class="muted">게임을 꺼내서 정보 창의 [컬렉션]에서 넣고 뺄 수 있어요. 컬렉션을 지워도 게임은 그대로예요.</span></span>`;
  let h='';
  if(S.isSample) h+=`<div class="banner"><span><b>예시 진열장</b> · 실제 파일이 없는 예시라 실행은 안 돼요. 내 폴더를 추가하면 이 예시는 지워져요.</span><button class="btn" data-act="add">폴더 추가</button></div>`;
  h+=`<h2 class="h2">${col?'<span class="colico" aria-hidden="true">▤</span> ':''}${esc(title)}</h2><p class="sub">${sub||`케이스를 누르면 꺼내서 열어 볼 수 있어요.`}</p>`;
  h+=`<div class="libtop"><div class="toolbar">
    <input class="search" id="q" type="search" placeholder="제목이나 파일 경로로 찾기  (Ctrl+F)" value="${esc(S.q)}">
    <div class="seg sortbox"><select class="sel" id="sort" aria-label="정렬">${Object.entries(SORTS).map(([k,l])=>`<option value="${k}">${l}순</option>`).join('')}</select><button class="btn sortdir" data-act="sortdir" title="정렬 방향 바꾸기" aria-label="정렬 방향">${(S.sortDir||SORT_DEFAULT_DIR[S.sort]||1)>0?'↑':'↓'}</button></div>
    <button class="btn${S.fltOpen||fltCount()?' fltact':''}" data-act="fltopen" aria-expanded="${!!S.fltOpen}">필터${fltCount()?` <span class="fltn">${fltCount()}</span>`:''}</button>
    <button class="btn${S.settings.oneG!==false?' fltact':''}" data-act="onegtog" aria-pressed="${S.settings.oneG!==false}" title="같은 게임의 지역판·리비전, 아케이드 원본과 클론을 케이스 하나로 묶어요">판 묶기</button>
    <div class="seg randbox"><button class="btn" data-act="random" title="지금 선반에서 아무 게임이나 꺼내요">🎲 오늘의 게임</button><button class="btn rtog${S.settings.randUnplayed?' on':''}" data-act="randtog" aria-pressed="${!!S.settings.randUnplayed}" title="안 해 본 게임 중에서만 골라요">안 해 본 것만</button></div>
    <button class="btn" data-act="couch" title="패드로 조작하는 전체 화면 (F11)">🎮 거실 모드</button>
    <div class="seg" role="group" aria-label="보기"><button data-view="front" aria-pressed="${S.view==='front'}">앞면 진열</button><button data-view="spine" aria-pressed="${S.view==='spine'}">책등 보관</button><button data-view="list" aria-pressed="${S.view==='list'}">목록</button></div>
    ${S.view!=='list'?`<label class="size">선반 높이<input type="range" id="ch" min="140" max="300" step="10" value="${S.ch}"></label>`:''}
  </div>${S.fltOpen?fltBarHTML():''}</div><div id="shelf"></div>`;
  $('#main').innerHTML=h;
  $('#sort').value=SORTS[S.sort]?S.sort:'name';
  watchLibTop();
  renderShelf();
}
/* 검색·필터 줄은 #main 위에 붙어 있다. 그 높이를 scroll-padding으로 줘서 스크롤로 맞출 때 가려지지 않게 하고,
   붙어 있을 때만 그림자를 단다 */
let libTopRO=null;
function watchLibTop(){
  const t=$('.libtop'), m=$('#main'); if(!t) return;
  libTopRO?.disconnect(); libTopRO=new ResizeObserver(()=>m.style.scrollPaddingTop=(t.offsetHeight+8)+'px'); libTopRO.observe(t);
}
document.addEventListener('scroll',e=>{ if(e.target.id!=='main') return; const t=$('.libtop'); if(t) t.classList.toggle('stuck',t.getBoundingClientRect().top<=e.target.getBoundingClientRect().top+1&&e.target.scrollTop>40) },true);
function emuSelect(cid,cur,attr){
  const opts=options(cid);
  return `<select class="sel" ${attr} aria-label="${esc(CONS[cid].name)} 에뮬레이터">${opts.map(o=>`<option value="${o.id}" ${o.id===cur?'selected':''}>${esc(o.label)}</option>`).join('')}<option value="__pick">다른 실행 파일 직접 고르기…</option></select>`;
}
function renderEmu(){
  const cn=counts(); let rows='';
  const sorted=[...CONSOLES].sort((a,b)=>(cn[b.id]?1:0)-(cn[a.id]?1:0));
  for(const c of sorted){
    const opts=options(c.id); const m=S.map[c.id]||{}; const n=cn[c.id]||0;
    const status = !m.id ? '<span class="pill bad">에뮬레이터 없음</span>' : m.auto ? '<span class="pill mut">자동</span>' : '<span class="pill ok">직접 지정</span>';
    const sel = opts.length ? emuSelect(c.id,m.id,`data-map="${c.id}"`)
      : `<button class="btn sm" data-act="pickfor" data-c="${c.id}">실행 파일 직접 지정</button> <span class="note">또는 설치 후 다시 스캔: ${c.prefer.slice(0,3).map(p=>esc(optLabel(p))).join(', ')}</span>`;
    rows+=`<tr class="${n?'':'dim'}"><td><span class="cons"><span class="sw" style="background:${c.band}"></span>${esc(c.name)}</span></td><td class="num">${fmtNum(n)}</td><td>${sel}</td><td>${status}</td></tr>`;
  }
  const card=e=>{
    const custom=!!e.custom; const customArgs=S.emuArgs[e.key]!==undefined;
    const cons=emuConsoles(e);
    const consHTML = custom
      ? `<div class="lbl">실행할 콘솔 (눌러서 켜고 끄기)</div><div>${CONSOLES.map(c=>`<button class="chip tog${cons.includes(c.id)?' on':''}" data-act="ctog" data-key="${e.key}" data-c="${c.id}" aria-pressed="${cons.includes(c.id)}">${esc(c.short)}</button>`).join('')}</div>`
      : `<div>${cons.map(id=>`<span class="chip">${esc(CONS[id].short)}</span>`).join('')}</div>`;
    return `<div class="emu${custom?' custom':''}">
      ${custom?`<input class="ename" data-cname="${e.key}" value="${esc(e.name)}" aria-label="에뮬레이터 이름" spellcheck="false"> <span class="pill mut">직접 지정</span>`:`<b>${esc(e.name)}</b> ${e.manual?'<span class="pill mut">직접 추가</span>':e.overridden?'<span class="pill ok">실행 파일 직접 지정</span>':'<span class="pill mut">자동</span>'}`}
      <div class="p mono">${esc(e.path)}</div>
      ${e.overridden?`<p class="note">자동으로 찾은 파일: <span class="mono">${esc(e.autoPath)}</span></p>`:''}
      ${consHTML}
      ${e.key==='retroarch'&&!custom?`<p class="note" style="margin-top:6px">코어 ${e.cores.length}개: ${e.cores.map(c=>esc(c.name)).join(', ')||'없음'}</p>`:''}
      ${(e.key==='bizhawk'||e.kind==='bizhawk')?`<div class="lbl">PC엔진 코어 <span class="muted">· PC엔진·슈퍼그래픽스·CD-ROM² 게임을 실행할 때 BizHawk 설정(config.ini)에 적어요</span></div>
      <select class="sel" data-bhpce style="margin-top:4px">${[['','BizHawk 설정 그대로'],['TurboNyma','TurboNyma (Mednafen 기반, 정확도 높음)'],['HyperNyma','HyperNyma (Mednafen pce_fast 기반, 빠름)'],['PCEHawk','PCEHawk (BizHawk 자체 코어)']].map(([v,t])=>`<option value="${v}" ${(S.settings.bizhawkPce||'')===v?'selected':''}>${t}</option>`).join('')}</select>`:''}
      ${(e.key==='np2'||e.kind==='np2')?`<div class="lbl">기본 폰트 BMP <span class="muted">· 게임별로 정하지 않은 PC-98 게임에 써요 (게임 정보 창에서 게임마다 고를 수 있어요). 실행할 때 ${esc(basename(e.path).replace(/\.exe$/i,''))}.ini의 fontfile에 적어요</span></div>
      <div class="argrow" style="margin-top:4px"><span class="mono" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${S.settings.np2Font?esc(S.settings.np2Font):'<span class="muted">지정 안 함 (에뮬레이터 설정 그대로)</span>'}</span><button class="btn sm" data-act="np2font">고르기</button>${S.settings.np2Font?'<button class="btn sm" data-act="np2fontclear">지우기</button>':''}</div>`:''}
      <div class="lbl">ROM 폴더 <span class="muted">· 이 폴더의 게임은 ${esc(e.name)}로 실행해요</span></div>
      <div class="romdirs">${(S.emuRomDirs[e.key]||[]).map(d=>`<div class="romdir"><span class="mono">${esc(d)}</span><button class="btn sm" data-act="rmromdir" data-key="${e.key}" data-path="${esc(d)}" aria-label="ROM 폴더 빼기">빼기</button></div>`).join('')}<button class="btn sm" data-act="addromdir" data-key="${e.key}">ROM 폴더 추가</button></div>
      <div class="lbl">실행 인수</div>
      <div class="argrow" style="margin-top:4px"><input id="arg-${e.key}" data-arg="${e.key}" value="${esc(argTemplate(e.key))}" spellcheck="false" aria-label="${esc(e.name)} 실행 인수">${customArgs?`<button class="btn sm" data-act="argreset" data-key="${e.key}">기본값</button>`:''}</div>
      <div class="actions" style="margin-top:8px"><button class="btn sm" data-act="reveal" data-path="${esc(e.path)}">위치 열기</button>${custom?`<button class="btn sm" data-act="crepath" data-key="${e.key}">파일 바꾸기</button>`:`<button class="btn sm" data-act="epath" data-key="${e.key}">실행 파일 바꾸기</button>`}${e.overridden?`<button class="btn sm" data-act="epathreset" data-key="${e.key}">자동으로 되돌리기</button>`:''}${custom||e.manual?`<button class="btn sm danger" data-act="rmemu" data-key="${e.key}">빼기</button>`:''}</div></div>`;
  };
  const list=allEmus();
  $('#main').innerHTML=`<h2 class="h2">에뮬레이터</h2><p class="sub">콘솔마다 찾은 에뮬레이터 중 우선순위가 가장 높은 것을 자동으로 붙여요. 목록에 없는 프로그램도 실행 파일을 직접 골라 쓸 수 있어요. 직접 바꾼 설정은 다시 스캔해도 유지돼요.</p>
  <div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px"><h3>콘솔별 실행 에뮬레이터</h3><button class="btn" data-act="reauto">모두 자동 지정으로 되돌리기</button></div>
  <div class="tblwrap"><table><thead><tr><th>콘솔</th><th>ROM</th><th>실행 에뮬레이터</th><th>상태</th></tr></thead><tbody>${rows}</tbody></table></div></div>
  <div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h3>에뮬레이터 ${list.length}개</h3><button class="btn" data-act="addemu">실행 파일 직접 추가</button></div>
  <p class="note" style="margin:4px 0 12px">실행 인수의 <span class="mono">{rom}</span>은 게임 파일, <span class="mono">{core}</span>는 RetroArch 코어, <span class="mono">{dir}</span>은 게임 폴더, <span class="mono">{name}</span>은 확장자를 뺀 파일 이름으로 바뀌어요. 예: <span class="mono">-f "{rom}"</span></p>
  ${list.length?`<div class="emus">${list.map(card).join('')}</div>`:'<div class="empty">아직 에뮬레이터가 없어요. 에뮬레이터가 있는 폴더를 추가하거나 실행 파일을 직접 추가하세요.</div>'}</div>`;
}
function renderScan(){
  const rules=CONSOLES.filter(c=>c.exts.length).map(c=>`<div><span class="mono">.${c.exts.join(' .')}</span><span class="muted">${esc(c.short)}</span></div>`).join('');
  const roots=S.roots.map(r=>`<div class="root"><span class="mono">${esc(r)}</span><button class="btn sm" data-act="reveal" data-path="${esc(r)}">열기</button><button class="btn sm danger" data-act="rmroot" data-path="${esc(r)}">빼기</button></div>`).join('');
  $('#main').innerHTML=`<h2 class="h2">스캔·설정</h2><p class="sub">등록한 폴더 안의 에뮬레이터 실행 파일과 ROM을 모두 찾아 진열해요. 폴더 안의 하위 폴더까지 살펴봐요.</p>
  <div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h3>스캔할 폴더 ${S.roots.length}개</h3>
    <div class="actions"><button class="btn" data-act="rescan" ${scanRoots().length&&!scanning?'':'disabled'}>전체 다시 스캔</button><button class="btn primary" data-act="add" ${scanning?'disabled':''}>폴더 추가</button></div></div>
    ${S.roots.length?`<div class="rootlist">${roots}</div>`:'<p class="note" style="margin-top:8px">아직 등록한 폴더가 없어요.</p>'}
    <div class="lbl" style="margin-top:14px;font-size:12px;color:var(--muted)">스캔에서 뺄 폴더 ${(S.excludeDirs||[]).length}개 <span>· 이 폴더와 그 아래 파일은 스캔하지 않아요</span></div>
    <div class="rootlist">${(S.excludeDirs||[]).map(r=>`<div class="root excl"><span class="mono">${esc(r)}</span><button class="btn sm" data-act="reveal" data-path="${esc(r)}">열기</button><button class="btn sm danger" data-act="rmexcl" data-path="${esc(r)}">빼기</button></div>`).join('')}
      <div class="actions"><button class="btn sm primary" data-act="excltree" ${scanning||!scanRoots().length?'disabled':''}>폴더 트리에서 여러 개 고르기</button><button class="btn sm" data-act="addexcl" ${scanning?'disabled':''}>폴더 하나 직접 추가</button></div></div>
    <div id="excltree"></div>
    ${scanning?'<div class="progress"><i></i></div>':''}
    <p class="note" style="margin-top:10px">마지막 스캔: ${S.lastScan?timeAgo(S.lastScan):'—'}</p>
    <div class="log mono" id="log">${S.log.map(l=>`<div class="${l.c||''}">${esc(l.t)}</div>`).join('')||'<span class="muted">스캔 기록이 여기에 표시돼요.</span>'}</div>
  </div>
  <div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h3>콘솔별 ROM 폴더</h3>
      <div class="actions"><select class="sel" id="cdcons" aria-label="콘솔">${CONSOLES.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><button class="btn sm primary" data-act="cdadd">폴더 지정</button></div></div>
    <p class="note" style="margin:4px 0 10px">ROM 폴더를 지정한 콘솔은 그 폴더에 있는 게임만 진열하고, 그 폴더의 파일은 폴더 이름과 상관없이 그 콘솔로 분류해요. 폴더마다 하위 폴더까지 볼지 고를 수 있어요.</p>
    ${consoleDirList().length?`<div class="cdlist">${CONSOLES.filter(c=>(S.consoleDirs[c.id]||[]).length).map(c=>`<div class="cdgroup"><div class="cdname"><span class="sw" style="background:${c.band}"></span>${esc(c.name)}</div>${S.consoleDirs[c.id].map(x=>`<div class="root"><span class="mono">${esc(x.path)}</span><label class="sub"><input type="checkbox" data-cdrec="${c.id}" data-path="${esc(x.path)}" ${x.recursive!==false?'checked':''}> 하위 폴더 포함</label><button class="btn sm" data-act="reveal" data-path="${esc(x.path)}">열기</button><button class="btn sm danger" data-act="cdrm" data-c="${c.id}" data-path="${esc(x.path)}">빼기</button></div>`).join('')}</div>`).join('')}</div>`:'<p class="note">아직 지정한 콘솔 ROM 폴더가 없어요.</p>'}
  </div>
  <div class="panel"><h3>설정</h3>
    <label class="setting"><input type="checkbox" id="set-boxart" ${S.settings.boxart!==false?'checked':''}><span>커버가 없는 게임은 박스아트를 인터넷에서 받기<small>스캔이 끝나면 libretro-thumbnails에서 파일 이름·제목이 맞는 박스아트를 받아 RetroShelfData 폴더의 boxart에 저장해요. PS5·Switch는 목록이 없어서 받지 않아요.</small></span></label>
    <div class="boxstat" id="boxstat">${boxStatusHTML()}</div>
    <label class="setting"><input type="checkbox" id="set-identify" ${S.settings.identify!==false?'checked':''}><span>파일 내용으로 게임 확인하고 장르·발매연도 받기<small>카트리지 롬은 CRC를 계산해 No-Intro 목록과 맞춰 정식 이름으로 보여 주고, libretro-database에서 장르·발매연도·개발사를 받아요. 처음 한 번은 파일을 모두 읽어서 시간이 걸리고, 그 뒤로는 바뀐 파일만 읽어요.</small></span></label>
    ${S.roms.some(r=>r.console==='switch'||r.console==='switch2')?`<div class="setting"><span>Switch 아이콘용 prod.keys<small>Switch 롬의 아이콘은 암호화되어 있어 에뮬레이터가 쓰는 prod.keys가 있어야 꺼낼 수 있어요. Eden·yuzu·Ryujinx 폴더와 AppData에서 자동으로 찾아요. 키는 RetroShelf 밖으로 보내지 않아요.<br>${NXKEYS?`<span class="okmark">✓ 사용 중:</span> <span class="mono">${esc(NXKEYS)}</span>`:'<span style="color:var(--warn)">찾지 못했어요</span>'}</small></span><span class="actions" style="flex:none"><button class="btn sm" data-act="nxkeys">prod.keys 지정</button></span></div>`:''}
    <div class="setting themeset"><span>테마<small>앱 전체 색과 진열장의 선반·조명을 함께 바꿔요. 기본은 윈도우의 밝은·어두운 모드를 따라가요.</small>
      <span class="themes">${Object.entries(SHELVES).map(([k,[l]])=>`<button class="themebtn" data-act="shelf" data-s="${k}" ${k==='default'?'':`data-shelf-preview="${k}"`} aria-pressed="${(S.settings.shelf||'default')===k}"><span class="tsw" data-shelf-preview="${k}"><i></i><i></i><i></i></span>${l}</button>`).join('')}</span></span></div>
    <label class="setting"><input type="checkbox" id="set-ptags" ${S.settings.priceTags!==false?'checked':''}><span>앞면 진열에 가격표 달기<small>게임 가게 진열장처럼 선반 앞쪽에 게임 이름을 적은 가격표를 끼워요.</small></span></label>
    <div class="setting animset"><span>케이스 애니메이션<small>게임을 꺼내고 넣을 때, 케이스를 뒤집을 때의 속도예요. 끄면 바로 열리고 닫혀요.</small>
      <span class="seg animseg" role="group" aria-label="애니메이션 속도">${Object.entries(ANIMS).map(([k,[l]])=>`<button data-act="anim" data-a="${k}" aria-pressed="${(S.settings.anim||'fast')===k}">${l}</button>`).join('')}</span></span></div>
    <div class="setting rpref"><span>지역판 묶기 우선순위<small>같은 게임의 여러 판 중 이 순서대로 앞에 있는 지역판을 선반에 내놓아요. 누르면 한 칸 앞으로 옮겨요. 케이스를 꺼내서 다른 판을 고르면 그 판이 우선이에요.</small>
      <span class="rpchips">${(S.settings.regionPref||[]).map((g,i)=>`<button class="chip" data-act="rpup" data-rg="${g}" ${i?'':'disabled'}>${i+1}. ${g}</button>`).join('<span class="rparr">›</span>')}</span></span></div>
    <label class="setting"><input type="checkbox" id="set-min" ${S.settings.minimize?'checked':''}><span>게임을 실행하면 RetroShelf 창을 최소화<small>게임을 끄면 다시 앞으로 나와요.</small></span></label>
    <label class="setting"><input type="checkbox" id="set-rescan" ${S.settings.rescanOnStart?'checked':''}><span>시작할 때 등록한 폴더를 다시 스캔<small>새로 넣은 ROM과 에뮬레이터가 자동으로 진열돼요. 스캔은 뒤에서 진행되고, 그동안 저장된 진열장을 바로 쓸 수 있어요.</small></span></label>
    <div class="setting"><span>설정 저장 위치 ${dataInfo?.portable?'<span class="pill ok">포터블</span>':'<span class="pill mut">사용자 폴더</span>'}<small class="mono">${esc(dataInfo?.data_dir||'—')}</small><small>${dataInfo?.portable?'RetroShelf.exe 옆 RetroShelfData 폴더에 라이브러리·커버·로그를 저장해요. 폴더째 옮겨도 그대로 써요.':'실행 폴더에 쓸 수 없어서 사용자 폴더에 저장하고 있어요. 쓰기 가능한 폴더로 옮기면 포터블로 바뀌어요.'}</small></span>${dataInfo?.data_dir?`<button class="btn sm" data-act="reveal" data-path="${esc(dataInfo.data_dir)}" style="margin-left:auto">열기</button>`:''}</div>
    <div class="setting"><span>진열장 비우기<small>즐겨찾기, 플레이 기록, 직접 지정한 설정까지 모두 지워요.</small></span><button class="btn danger sm" data-act="clear" style="margin-left:auto">비우기</button></div>
  </div>
  <div class="panel"><h3>분류 규칙</h3>
    <p class="note">고유 확장자는 바로 콘솔을 정해요. <span class="mono">.iso .chd .cue .bin .zip .7z .m3u</span>처럼 여러 콘솔이 쓰는 확장자는 가장 가까운 폴더 이름(예: <span class="mono">PS2</span>, <span class="mono">Saturn</span>, <span class="mono">MAME</span>)으로 판단하고, 그래도 모르면 미분류로 둬요. <span class="mono">.cue</span>가 있는 폴더의 <span class="mono">.bin</span>은 건너뛰고, <span class="mono">(Disc 1)</span>, <span class="mono">(Disc 2)</span>는 한 게임으로 묶어요. 같은 이름의 이미지가 게임 폴더나 <span class="mono">covers</span>, <span class="mono">boxart</span>, <span class="mono">media\\covers</span> 폴더에 있으면 커버로 써요.</p>
    <div class="rules">${rules}</div></div>`;
  const l=$('#log'); if(l)l.scrollTop=l.scrollHeight;
  renderExclTree();
}

/* ===================== 제외 폴더 트리 =====================
   등록한 스캔 폴더 아래 하위 폴더를 펼쳐 보이고, 체크한 폴더를 한 번에 제외한다.
   부모를 체크하면 그 아래는 자동으로 함께 제외된다. */
let XT=null;   // {kids: Map(norm → [{path,name,has_children}]), open:Set(norm), checked:Map(norm → 원래 경로)}
async function xtLoad(path){ const k=normDir(path); if(!XT.kids.has(k)) XT.kids.set(k, await api.listDirs(path).catch(()=>[])); }
async function openExclTree(){
  XT={kids:new Map(),open:new Set(),checked:new Map((S.excludeDirs||[]).map(p=>[normDir(p),p])),busy:true};
  renderExclTree();
  for(const r of scanRoots()){ XT.open.add(normDir(r)); await xtLoad(r); }
  XT.busy=false; renderExclTree();
}
const xtAncestorChecked=n=>{ for(const c of XT.checked.keys()) if(n!==c&&n.startsWith(c+'\\')) return true; return false };
function xtNode(path,name,hasKids,depth,isRoot){
  const n=normDir(path); const open=XT.open.has(n); const inh=xtAncestorChecked(n); const on=inh||XT.checked.has(n);
  const kids=XT.kids.get(n);
  let h=`<div class="tnode${on?' on':''}" style="--d:${depth}">
    ${hasKids?`<button class="tcaret" data-act="xttoggle" data-path="${esc(path)}" aria-label="${open?'접기':'펼치기'}">${open?'▾':'▸'}</button>`:'<span class="tcaret"></span>'}
    <label><input type="checkbox" data-xt="${esc(path)}" ${on?'checked':''} ${inh?'disabled':''}><span class="${isRoot?'mono root-name':''}">${esc(isRoot?path:name)}</span>${inh?'<small> 위 폴더와 함께 제외</small>':''}</label></div>`;
  if(open&&hasKids){
    if(!kids) h+=`<div class="tnode" style="--d:${depth+1}"><span class="tcaret"></span><small class="muted">불러오는 중…</small></div>`;
    else if(!kids.length) h+=`<div class="tnode" style="--d:${depth+1}"><span class="tcaret"></span><small class="muted">하위 폴더 없음</small></div>`;
    else for(const k of kids) h+=xtNode(k.path,k.name,k.has_children,depth+1,false);
  }
  return h;
}
function renderExclTree(){
  const el=$('#excltree'); if(!el) return;
  if(!XT){el.innerHTML='';return}
  const box=el.querySelector('.tree'); const st=box?box.scrollTop:0;
  const picked=[...XT.checked.keys()].filter(k=>!xtAncestorChecked(k));
  el.innerHTML=`<div class="treepanel">
    <div class="treehead"><b>제외할 폴더 고르기</b><span class="muted">체크한 폴더와 그 아래는 스캔하지 않아요. ▸를 누르면 하위 폴더가 펼쳐져요.</span></div>
    <div class="tree">${XT.busy&&!XT.kids.size?'<p class="note">폴더를 읽는 중…</p>':scanRoots().map(r=>xtNode(r,r,true,0,true)).join('')}</div>
    <div class="actions treefoot"><span class="muted">${picked.length}개 선택</span><span style="flex:1"></span>
      <button class="btn sm" data-act="xtclear">모두 해제</button><button class="btn sm" data-act="xtcancel">취소</button>
      <button class="btn sm primary" data-act="xtapply">적용하고 다시 스캔</button></div></div>`;
  const nb=el.querySelector('.tree'); if(nb) nb.scrollTop=st;
}

/* ===================== 스캔 ===================== */
async function rescan({quiet}={}){
  const roots=scanRoots();
  if(scanning||!roots.length)return;
  ARCDB=null;
  scanning={dirs:0,files:0}; render();
  const t0=Date.now();
  if(!quiet) log(`▸ 스캔 시작 · 폴더 ${roots.length}곳`,'a');
  let res;
  try{res=await api.scan(roots,S.excludeDirs||[],scanPlan().filter(x=>!x.recursive).map(x=>x.path))}catch(err){scanning=null;log('스캔에 실패했어요: '+err,'w');render();return}
  // 스캔 폴더 밖 기본 설치 위치(Program Files 등)의 에뮬레이터도 찾는다. 스캔 폴더 쪽이 먼저라 그쪽이 우선
  try{ const inst=(await api.installedEmus?.())||[]; if(inst.length) res.files=res.files.concat(inst.map(path=>({path,size:0}))) }catch(e){}
  const r=scanFiles(res.files,{allow:emuDirList().map(x=>x.d)});
  const vita=[...r.emus,...S.manualEmus,...S.customEmus].find(e=>e.key==='vita3k'||e.kind==='vita3k');
  if(vita){ try{ r.roms.push(...await vitaInstalled(vita.path)) }catch(e){} }
  for(const tp of [...r.emus,...S.manualEmus,...S.customEmus].filter(e=>e.key==='teknoparrot'||e.kind==='teknoparrot')){ try{ r.roms.push(...await tpProfiles(tp.path)) }catch(e){} }
  const ov=S.emuPath||{}; const scanEmus=r.emus.map(e=>ov[e.key]?{...e,path:ov[e.key]}:e);
  try{ await emuCovers(r.roms,[...scanEmus,...S.manualEmus,...S.customEmus]) }catch(e){}
  try{ await wiiuTitles(r.roms) }catch(e){}
  try{ await applyArcade(r.roms,[...scanEmus,...S.manualEmus,...S.customEmus]) }catch(e){ console.warn(e) }
  try{ await applySm2Db(r.roms,[...scanEmus,...S.manualEmus,...S.customEmus]) }catch(e){ console.warn(e) }
  const withSfo=r.roms.filter(x=>x.sfo);
  if(withSfo.length){
    // param.sfo / param.json: 실제 제목, 그리고 패치·추가 콘텐츠는 게임이 아니라서 뺀다
    const t=await api.paramInfos(withSfo.map(x=>x.sfo)).catch(()=>[]); const drop=new Set();
    // 업데이트를 합친 덤프나 설치본은 본편 폴더에도 패치의 param.sfo(CATEGORY gp)가 들어 있다.
    // 그래서 패치는 같은 타이틀 ID의 본편이 따로 있을 때만 빼고, 그 하나뿐이면 게임으로 둔다
    const games=new Set(); withSfo.forEach((x,i)=>{ const p=t[i]; if(p&&p.category==='game'&&p.title_id) games.add(x.console+'|'+p.title_id) });
    withSfo.forEach((x,i)=>{ const p=t[i]; if(!p) return; if(p.title) x.title=p.title; if(p.title_id) x.titleId=p.title_id;
      if(x.console==='ps3'||x.console==='ps5') return;
      if(p.category==='addcont') drop.add(x);
      else if(p.category==='patch'&&p.title_id&&games.has(x.console+'|'+p.title_id)) drop.add(x); });
    if(drop.size){ r.roms=r.roms.filter(x=>!drop.has(x)); r.extras=(r.extras||0)+drop.size }
  }
  const missing=res.missing.map(m=>m.toLowerCase());
  const underMissing=p=>missing.some(m=>p.toLowerCase().startsWith(m));
  const keptEmus=S.emus.filter(e=>underMissing(e.path)&&!r.emus.some(x=>x.key===e.key));
  S.emus=[...r.emus,...keptEmus];
  const viaDir=applyEmuDirs(r.roms);
  const cd=applyConsoleDirs(r.roms); r.roms=cd.roms;
  const old=new Map(S.roms.map(x=>[x.id,x]));
  const next=r.roms.map(n=>{const o=old.get(n.id); if(!o)return n;
    return {...n,fav:o.fav,plays:o.plays,lastPlayed:o.lastPlayed,playSeconds:o.playSeconds,cover:o.cover,emu:o.emu,icon:o.icon,iconV:o.iconV,iconErr:o.iconErr,boxart:o.boxart,boxartGuess:o.boxartGuess,genre:o.genre,year:n.year||o.year,dev:o.dev,pub:o.pub,dbName:o.dbName,dbMatch:o.dbMatch,crc:o.crc,crcBare:o.crcBare,sessions:o.sessions,firstPlayed:o.firstPlayed,boxartTried:o.boxartTried,thumbName:o.thumbName,titleShot:o.titleShot,snapShot:o.snapShot,shotTried:o.shotTried,syscard:o.syscard,ips:o.ips,np2Font:o.np2Font,
      console:o.consoleManual?o.console:n.console,consoleManual:o.consoleManual}});
  const ids=new Set(next.map(x=>x.id));
  const kept=S.roms.filter(o=>!ids.has(o.id)&&underMissing(o.files[0].path)).map(o=>({...o,offline:true}));
  const removed=S.roms.filter(o=>!ids.has(o.id)&&!underMissing(o.files[0].path)).length;
  const added=next.filter(n=>!old.has(n.id)).length;
  // 직접 지정한 에뮬레이터는 스캔 결과와 상관없이 유지
  S.roms=[...next,...kept]; S.isSample=false;
  autoAssign(false);
  S.lastScan=Date.now(); scanning=null;
  const sec=((Date.now()-t0)/1000).toFixed(1);
  log(`  폴더 ${fmtNum(res.dirs)}개, 관련 파일 ${fmtNum(res.files.length)}개 확인 (${sec}초)${res.truncated?' · 파일이 너무 많아 일부만 확인':''}`);
  r.emus.forEach(e=>log(`  에뮬레이터: ${e.name}${e.cores.length?` (코어 ${e.cores.length}개)`:''}`,'ok'));
  log(`  ROM ${fmtNum(S.roms.length)}개 · 새로 ${fmtNum(added)}개${removed?` · 사라진 파일 ${fmtNum(removed)}개 정리`:''}`,'ok');
  if(viaDir) log(`  에뮬레이터 ROM 폴더에서 ${fmtNum(viaDir)}개를 그 에뮬레이터로 지정`,'ok');
  if(cd.dropped) log(`  ROM 폴더를 지정한 콘솔이라 그 폴더 밖의 게임 ${fmtNum(cd.dropped)}개는 진열하지 않음`);
  if(r.bios) log(`  BIOS·펌웨어 파일 ${fmtNum(r.bios)}개는 게임이 아니라서 제외`);
  if(r.extras) log(`  업데이트·DLC 파일 ${fmtNum(r.extras)}개는 게임이 아니라서 제외`);
  if(r.skipped) log(`  중복 트랙·디스크 파일 ${fmtNum(r.skipped)}개 건너뜀`);
  if(r.unknown) log(`  콘솔을 알 수 없는 파일 ${fmtNum(r.unknown)}개 → 미분류`,'w');
  res.missing.forEach(m=>log(`  찾을 수 없는 폴더: ${m} (기존 목록은 유지)`,'w'));
  const none=CONSOLES.filter(c=>S.roms.some(x=>x.console===c.id)&&!S.map[c.id]?.id).map(c=>c.short);
  if(none.length) log(`  에뮬레이터 없는 콘솔: ${none.join(', ')}`,'w');
  save();
  // 바뀐 게 없으면 화면을 다시 그리지 않는다 (스크롤 위치 유지)
  if(added||removed||!quiet||S.tab!=='lib') render(); else renderStats();
  setTimeout(()=>extractRomIcons().then(()=>identifyRoms({quiet:true})).then(()=>{ if(S.settings.boxart!==false) return fetchBoxarts({quiet:true}) }).finally(()=>pruneSoon()),50);
  if(!quiet||added) toast(`스캔 완료 · ROM ${fmtNum(S.roms.length)}개${added?` (새로 ${fmtNum(added)}개)`:''}`);
}
/* ---------- DuckStation·PCSX2 covers 폴더 ----------
   에뮬레이터 폴더(포터블)나 문서\DuckStation, 문서\PCSX2 의 covers 에서 파일 이름·제목·시리얼로 찾는다 */
const COVER_EMUS={duckstation:{cons:['ps1'],doc:'DuckStation'},pcsx2:{cons:['ps2'],doc:'PCSX2'}};
const ckey=s=>s.toLowerCase().replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龥]/g,'');
function serialOf(name){const m=name.match(/\b(SLUS|SCUS|SLES|SCES|SLPS|SLPM|SCPS|SCAJ|SLKA|SCKA|SLAJ|PBPX|SCED|SLED|SIPS|SCPM)[-_ .]?(\d{3})[._]?(\d{2})\b/i); return m?(m[1]+m[2]+m[3]).toLowerCase():null}
async function emuCovers(roms,emus){
  const maps={};
  for(const e of emus){
    const k=e.custom?e.kind:e.key; const def=COVER_EMUS[k]; if(!def) continue;
    const s=sep(e.path); const dirs=[dirname(e.path)+s+'covers']; if(dataInfo?.documents) dirs.push(dataInfo.documents+s+def.doc+s+'covers');
    for(const d of dirs) for(const ext of ['jpg','jpeg','png','webp']) for(const f of await api.listFiles(d,ext).catch(()=>[])){
      const name=basename(f.path).replace(/\.[^.]+$/,'');
      for(const c of def.cons){ const m=maps[c]=maps[c]||new Map(); const kk=serialOf(name)||ckey(name); if(!m.has(kk)) m.set(kk,f.path); }
    }
  }
  if(!Object.keys(maps).length) return;
  for(const r of roms){
    const m=maps[r.console]; if(!m||r.autoCover) continue;
    const base=basename(r.files[0].path).replace(/\.[^.]+$/,'');
    const tries=[serialOf(base),ckey(base),ckey(base.replace(/\s*[\(\[](disc|cd)\s*\d+[^\)\]]*[\)\]]/ig,'')),ckey(r.title)].filter(Boolean);
    for(const t of tries){ const hit=m.get(t); if(hit){ r.autoCover=hit; break; } }
  }
}
/* Wii U 풀린 폴더: meta\meta.xml 의 영어 제목 */
async function wiiuTitles(roms){
  for(const r of roms){ if(r.console!=='wiiu'||!r.folder||!r.dir) continue; const s=sep(r.dir);
    const t=await api.readText(r.dir+s+'meta'+s+'meta.xml').catch(()=>null); const m=t&&t.match(/<longname_en[^>]*>([^<]+)<\/longname_en>/);
    if(m) r.title=m[1].replace(/\s*\n\s*/g,' ').replace(/&amp;/g,'&').trim(); }
}
/* ---------- 롬 파일 안의 타이틀 이미지 ----------
   NDS 아이콘, PSP ISO·CSO·PBP의 ICON0, Wii U meta\iconTex.tga 를 꺼내 RetroShelfData\icons 에 PNG로 저장 */
let iconBusy=false;
function iconJob(r){
  // 커버를 정해 둔 게임도 아이콘은 따로 꺼내 둔다 (화면에는 커버가 먼저 나온다). 커버를 기본으로 되돌리면 바로 아이콘을 쓴다
  const nx=r.console==='switch'||r.console==='switch2';
  // 꺼낸 적이 있으면 그만. 실패(null)는 Switch면 매번(키가 바뀌었을 수 있다), 그 밖은 추출 코드 판(ICON_V)이 바뀌면 다시
  if(r.icon) return null;
  if(r.icon===null&&!nx&&r.iconV===ICON_V) return null;
  const p=r.files[0].path; const ext=(p.match(/\.([^.\\/]+)$/)||[])[1]?.toLowerCase();
  if(ext==='nds') return {id:r.id,path:p,kind:'nds'};
  if(ext==='pbp') return {id:r.id,path:p,kind:'pbp'};
  if(r.console==='psp'&&ext==='iso') return {id:r.id,path:p,kind:'iso'};
  if(ext==='cso') return {id:r.id,path:p,kind:'cso'};
  if(['3ds','cci','cxi','cia','3dsx'].includes(ext)) return {id:r.id,path:p,kind:'3ds'};
  if(nx&&['nsp','xci','nsz','xcz'].includes(ext)) return {id:r.id,path:p,kind:'nx'};
  if(r.console==='wiiu'&&r.folder&&r.dir){const s=sep(r.dir); return {id:r.id,path:r.dir+s+'meta'+s+'iconTex.tga',kind:'tga'}}
  return null;
}
const ICON_V=2;
/* ---------- 안 쓰는 그림 정리 ----------
   게임을 지우거나 커버를 바꾸면 RetroShelfData의 boxart·covers·icons에 남는 그림을 지운다.
   그림을 받거나 꺼내는 중에는 미룬다 (막 받은 파일을 아직 게임에 적지 않았을 수 있다) */
let pruneT=null;
function pruneSoon(ms=4000){
  clearTimeout(pruneT);
  pruneT=setTimeout(async()=>{
    if(!api.pruneImages||!S.roms.length||S.isSample) return;
    if(iconBusy||boxBusy||scanning||shotBusy) return pruneSoon(5000);
    const keep=[]; for(const r of S.roms) for(const k of ['cover','autoCover','boxart','icon','titleShot','snapShot']) if(typeof r[k]==='string'&&r[k]) keep.push(r[k]);
    try{ const [n,b]=await api.pruneImages(keep,S.roms.map(r=>r.id)); if(n) log(`쓰지 않는 그림 ${fmtNum(n)}개를 지웠어요 (${fmtSize(b)})`) }catch(e){}
  },ms);
}
/* Switch 아이콘 복호화에 쓸 prod.keys 후보: 직접 지정 → 에뮬레이터 폴더 → 사용자 AppData */
let NXKEYS=null;
function nxKeyCandidates(){
  const out=[]; if(S.settings.nxKeys) out.push(S.settings.nxKeys);
  for(const e of allEmus()){ const k=e.kind||e.key||''; const cons=EMUS[k]?.consoles||[];
    if(!cons.includes('switch')&&!cons.includes('switch2')&&!/yuzu|eden|ryujinx|suyu|sudachi|citron|torzu/i.test(e.path||'')) continue;
    const d=e.path.replace(/[\\/][^\\/]*$/,''); const s=sep(d);
    out.push(d+s+'user'+s+'keys'+s+'prod.keys', d+s+'portable'+s+'system'+s+'prod.keys', d+s+'keys'+s+'prod.keys', d+s+'prod.keys', d+s+'system'+s+'prod.keys'); }
  if(dataInfo?.roaming){ const R=dataInfo.roaming, s=sep(R);
    for(const n of ['eden','yuzu','suyu','sudachi','citron','torzu']) out.push(R+s+n+s+'keys'+s+'prod.keys');
    out.push(R+s+'Ryujinx'+s+'system'+s+'prod.keys'); }
  return [...new Set(out)];
}
/* 그림 파일을 손으로 지웠으면 그 기록을 지운다 → 아이콘·박스아트를 다시 꺼내거나 받을 수 있게 */
async function dropMissingImages(){
  if(!api.exists) return;
  const refs=[]; for(const r of S.roms) for(const k of ['cover','autoCover','boxart','icon','titleShot','snapShot']) if(typeof r[k]==='string'&&r[k]&&!r.offline) refs.push([r,k]);
  for(let i=0;i<refs.length;i+=500){
    const part=refs.slice(i,i+500); const ok=await api.exists(part.map(([r,k])=>r[k])).catch(()=>null); if(!ok) return;
    part.forEach(([r,k],j)=>{ if(ok[j]) return; delete r[k]; if(k==='boxart'){ delete r.thumbName; delete r.boxTried } if(k==='titleShot'||k==='snapShot') delete r.shotTried });
  }
}
async function extractRomIcons(){
  if(iconBusy||!api.extractIcons) return; iconBusy=true;
  try{
    await dropMissingImages();
    const jobs=S.roms.map(iconJob).filter(Boolean); let found=0, needKeys=0, failed=0; const missKeys=new Map();
    if(jobs.some(j=>j.kind==='nx')&&api.switchKeys){ NXKEYS=await api.switchKeys(nxKeyCandidates()).catch(()=>null) }
    for(let i=0;i<jobs.length;i+=100){
      const part=jobs.slice(i,i+100); const res=await api.extractIcons(part).catch(()=>[]);
      part.forEach((j,k)=>{ const r=S.roms.find(x=>x.id===j.id); if(!r) return;
        const v=res[k];
        if(v===''||v==='!'){ needKeys++; r.icon=null; r.iconErr='prod.keys를 찾지 못했어요'; return }  // 다음에 다시
        if(typeof v==='string'&&v.startsWith('!')){ missKeys.set(v.slice(1),(missKeys.get(v.slice(1))||0)+1); r.icon=null; r.iconErr=`prod.keys에 ${v.slice(1)} 키가 없어요 (더 새 펌웨어의 키가 필요해요)`; return }
        if(typeof v==='string'&&v.startsWith('?')){ failed++; r.icon=null; r.iconErr=v.slice(1); return }
        r.icon=v||null; r.iconV=ICON_V; delete r.iconErr; if(v) found++; });
      refreshLib();
    }
    if(jobs.length){ save(); if(found) log(`롬 파일에서 타이틀 이미지 ${fmtNum(found)}개를 꺼냈어요`,'ok');
      if(needKeys) log(`Switch 게임 ${fmtNum(needKeys)}개는 prod.keys를 찾지 못해 아이콘을 꺼내지 못했어요. 스캔·설정 탭에서 prod.keys를 지정할 수 있어요`,'w');
      if(failed) log(`Switch 게임 ${fmtNum(failed)}개는 아이콘을 꺼내지 못했어요. 게임 정보 창에 이유가 나와요`,'w');
      for(const [k,n] of missKeys) log(`Switch 게임 ${fmtNum(n)}개는 prod.keys에 ${k} 키가 없어 아이콘을 꺼내지 못했어요. 더 새 펌웨어의 prod.keys가 필요해요`,'w'); }
  } finally { iconBusy=false; }
}
/* ---------- 박스아트 받기 (libretro-thumbnails) ---------- */
/* 박스아트 이름 목록: 썸네일 서버 목록 → 안 되면 libretro-database의 정식 이름 목록(No-Intro·Redump) */
const BOXIDX=new Map();
async function boxIndex(sys,refresh){
  if(!refresh&&BOXIDX.has(sys)) return BOXIDX.get(sys);
  let idx=null;
  try{ const l=await api.thumbIndex(sys,!!refresh); if(Array.isArray(l)&&l.length) idx=thumbIndex(l) }catch(e){}
  if(!idx&&sys!=='MAME'){ try{ const db=await metaFor(sys); idx=thumbIndex([...new Set([...db.name.values()].map(r=>r[1]))],true) }catch(e){} }
  BOXIDX.set(sys,idx); return idx;
}
let boxBusy=false, boxProg=null;
const needsBoxart=r=>!r.cover&&!r.autoCover&&!r.boxart&&!r.boxartTried&&!r.offline&&THUMB_SYS[r.console];
async function fetchBoxarts({quiet=false,retry=false}={}){
  if(boxBusy||!api.thumbFetch) return;
  if(retry) S.roms.forEach(r=>{ if(!r.boxart) delete r.boxartTried });
  const todo=S.roms.filter(needsBoxart); if(!todo.length){ if(!quiet) toast('박스아트를 찾을 게임이 없어요'); return }
  boxBusy=true; boxProg={done:0,total:todo.length,found:0}; renderBoxStatus();
  const bySys=new Map(); for(const r of todo){ const k=THUMB_SYS[r.console]; (bySys.get(k)||bySys.set(k,[]).get(k)).push(r) }
  let found=0, offline=0, done=0;
  try{
    for(const [sys,roms] of bySys){
      if(!boxBusy) break;
      const idx=await boxIndex(sys,retry); if(!idx) offline++;
      const jobs=[]; const tried=Date.now();
      for(const r of roms){ const names=thumbNames(r,idx); if(names.length) jobs.push({id:r.id,system:sys,names}); else r.boxartTried=tried }
      for(let i=0;i<jobs.length&&boxBusy;i+=60){
        const part=jobs.slice(i,i+60); const res=(await api.thumbFetch(part).catch(()=>null))||[];
        for(const g of res){ const r=S.roms.find(x=>x.id===g.id); if(!r) continue; if(g.path){ r.boxart=g.path; r.thumbName=g.name; found++;
          const base=basename(r.files[0].path).replace(/\.[^.]+$/,'');
          r.boxartGuess=!!g.name&&g.name!==base&&g.name!==r.dbName&&g.name!==r.arcDesc&&thumbKey(g.name)!==thumbKey(r.title) } else r.boxartTried=tried }
        refreshLib(); save();
      }
      done+=roms.length; boxProg={done,total:todo.length,found}; renderBoxStatus();
    }
  } finally {
    boxBusy=false; boxProg=null; save(); refreshLib(); renderBoxStatus();
  }
  if(found) log(`박스아트 ${fmtNum(found)}개를 받았어요 (libretro-thumbnails)`,'ok');
  if(offline&&!found) log('박스아트 목록을 받지 못했어요. 인터넷 연결을 확인해 주세요','w');
  if(!quiet||found) toast(found?`박스아트 ${fmtNum(found)}개를 받았어요`:offline?'박스아트 서버에 연결하지 못했어요':'새로 찾은 박스아트가 없어요');
}
function renderBoxStatus(){
  const el=$('#boxstat'); if(el) el.innerHTML=boxStatusHTML();
  const st=$('#stats'); if(st){ let b=st.querySelector('.boxprog'); if(boxProg){ if(!b){b=document.createElement('span');b.className='boxprog';st.prepend(b)} b.textContent=`박스아트 ${fmtNum(boxProg.done)}/${fmtNum(boxProg.total)} · `} else b?.remove() }
}
function boxStatusHTML(){
  const have=S.roms.filter(r=>r.boxart).length, miss=S.roms.filter(r=>!r.cover&&!r.autoCover&&!r.boxart&&r.boxartTried&&THUMB_SYS[r.console]).length;
  const wait=S.roms.filter(needsBoxart).length;
  return boxBusy?`<span class="pill">받는 중 ${boxProg?`${fmtNum(boxProg.done)} / ${fmtNum(boxProg.total)} · 찾음 ${fmtNum(boxProg.found)}`:''}</span> <button class="btn sm" data-act="boxstop">중지</button>`
    :`<span class="muted">받은 박스아트 ${fmtNum(have)}개 · 못 찾음 ${fmtNum(miss)}개 · 아직 안 찾아봄 ${fmtNum(wait)}개</span>
      <button class="btn sm" data-act="boxget" ${wait?'':'disabled'}>지금 받기</button> <button class="btn sm" data-act="boxretry" ${miss?'':'disabled'}>못 찾은 게임 다시 찾기</button>`;
}
/* TeknoParrot: UserProfiles 폴더의 프로필(.xml) 하나가 설정을 마친 게임 하나 */
async function tpProfiles(exe){
  if(!api.listFiles) return [];
  const s=sep(exe); const dir=dirname(exe); const pdir=dir+s+'UserProfiles';
  const files=await api.listFiles(pdir,'xml').catch(()=>[]); const out=[];
  const dec=v=>v.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").trim();
  for(const f of files){
    const t=await api.readText(f.path).catch(()=>null); const file=basename(f.path);
    const name=t&&(t.match(/<GameName>([^<]+)<\/GameName>/)||[])[1];
    const icon=t&&(t.match(/<IconName>([^<]+)<\/IconName>/)||[])[1];
    out.push({id:'r'+hashStr('tp|'+f.path.toLowerCase()).toString(36),title:name?dec(name):file.replace(/\.xml$/i,''),region:'',console:'teknoparrot',
      files:[{path:f.path,disc:null}],size:0,discs:0,dir:pdir,tpProfile:file,autoCover:icon?dir+s+dec(icon).replace(/[\\/]/g,s):undefined});
  }
  return out;
}
/* Vita3K에 이미 설치된 게임 (ux0/app/타이틀ID) */
async function vitaInstalled(exe){
  const s=sep(exe); const dir=dirname(exe); const prefs=[];
  const cfg=await api.readText(dir+s+'config.yml').catch(()=>null);
  const m=cfg&&cfg.match(/^pref-path:\s*"?([^"\r\n]*)"?\s*$/m); if(m&&m[1].trim()) prefs.push(m[1].trim().replace(/[\\/]+$/,''));
  prefs.push(dir); if(dataInfo?.roaming) prefs.push(dataInfo.roaming+s+'Vita3K'+s+'Vita3K');
  for(const pref of prefs){
    const appDir=pref+s+'ux0'+s+'app';
    const res=await api.scan([appDir]).catch(()=>null); if(!res||!res.files.length) continue;
    const by={}; for(const f of res.files) by[f.path.toLowerCase()]=f.path;
    const out=[];
    for(const f of res.files){
      const rel=f.path.slice(appDir.length+1); const parts=rel.split(/[\\/]/);
      if(parts.length!==2||parts[1].toLowerCase()!=='eboot.bin') continue;
      const id=parts[0]; const gdir=appDir+s+id;
      out.push({id:'r'+hashStr('psvita|installed|'+id.toLowerCase()).toString(36),title:id,region:'',console:'psvita',files:[{path:f.path,disc:null}],size:f.size||0,discs:0,dir:gdir,
        vitaId:id,installed:true,sfo:by[(gdir+s+'sce_sys'+s+'param.sfo').toLowerCase()],autoCover:by[(gdir+s+'sce_sys'+s+'icon0.png').toLowerCase()]});
    }
    if(out.length) return out;
  }
  return [];
}
api.onScanProgress(d=>{if(scanning){scanning=d;renderStats()}});
async function addFolders(){
  const picked=await api.pickFolders(); if(!picked.length)return;
  if(S.isSample){const keep={ch:S.ch,view:S.view,settings:S.settings};S={...blank(),...keep};}
  const low=S.roots.map(r=>r.toLowerCase());
  for(const p of picked) if(!low.includes(p.toLowerCase())) S.roots.push(p);
  save(); await rescan();
}
function loadSample(){
  const keep={ch:S.ch,view:S.view,settings:S.settings};
  S={...blank(),...keep,isSample:true};
  const r=scanFiles(sampleFiles()); S.emus=r.emus; S.roms=r.roms; autoAssign(true);
  const now=Date.now(); const mark=(t,p,ago,fav,sec)=>{const x=S.roms.find(y=>y.title.startsWith(t)); if(x){x.plays=p;x.lastPlayed=now-ago*60000;x.fav=fav;x.playSeconds=sec}};
  mark('Chrono Trigger',12,90,true,52000); mark('Final Fantasy VII',5,60*26,true,31000); mark('Metroid Prime',2,60*72,false,4200); mark('Advance Wars',7,15,false,9000);
  log('예시 데이터를 불러왔어요','a'); save(); render();
}

/* ===================== 꺼내 보기 ===================== */
function filterName(){
  if(S.filter.startsWith('col:')) return colOf(S.filter.slice(4))?.name||'컬렉션';
  return S.filter==='all'?'전체 진열장':S.filter==='fav'?'즐겨찾기':S.filter==='recent'?'최근 실행':S.filter==='kor'?'한국어판':CONS[S.filter]?.name||'';
}
const verLabel=r=>[r.region||'지역 없음',r.variant].filter(Boolean).join(' · ');
function versionsHTML(r){
  const vs=versionsOf(r); if(vs.length<2) return '';
  const k=verKey(r); const picked=S.groupPick?.[k];
  const arc=!!r.arcName;
  return `<div class="field"><label>${arc?`원본·클론 ${vs.length}개`:`지역판·버전 ${vs.length}개`} <span class="muted" style="font-weight:400">· 고른 판이 선반에 나와요</span></label>
    <div class="verlist${arc?' tree':''}">${[...vs].sort(verCmp).map(v=>`<button class="ver${v.id===r.id?' on':''}${arc&&v.arcParent?' clone':''}" data-act="pickver" data-id2="${v.id}" aria-pressed="${v.id===r.id}">
      ${arc?`<span class="vtag">${v.arcParent?'클론':'원본'}</span>`:''}<b>${esc(arc?(v.arcParent?(v.variant||v.arcName):(v.arcDesc||v.title)):verLabel(v))}</b><small>${esc(basename(v.files[0].path))}</small>${(v.playSeconds||v.plays)?`<small class="pl">${fmtDur(v.playSeconds)} 플레이</small>`:''}${v.id===picked?'<small class="pin">대표로 고정</small>':''}</button>`).join('')}</div></div>`;
}
function colsHTML(r){
  const cols=S.cols||[];
  return `<div class="field"><label>컬렉션</label><div class="colchips">${cols.map(c=>{const on=c.ids.includes(r.id);return `<button class="chip tog${on?' on':''}" data-act="coltog" data-col="${c.id}" aria-pressed="${on}">${on?'✓ ':''}${esc(c.name)}</button>`}).join('')}<button class="chip" data-act="colnew">+ 새 컬렉션</button></div></div>`;
}
function infoHTML(r){
  const c=CONS[r.console]; const opts=options(r.console); const def=S.map[r.console]?.id; const spec=launchSpec(r); const run=runningIds.has(r.id);
  return `<h2 class="dt2">${esc(r.title)}</h2>
    <dl class="kv">
      <dt>콘솔</dt><dd>${esc(c.name)}</dd>
      <dt>지역</dt><dd>${esc(r.region||'—')}</dd>
      ${r.variant?`<dt>버전</dt><dd>${esc(r.variant)}</dd>`:''}
      ${r.arcName?`<dt>롬셋</dt><dd class="mono">${esc(r.arcName)}${r.arcParent?` <span class="muted">← 원본 ${esc(r.arcParent)}</span>`:' <span class="muted">(원본)</span>'}</dd>`:''}
      ${r.year||r.maker?`<dt>${r.arcName?'제작':'발매'}</dt><dd>${esc([r.year,r.maker].filter(Boolean).join(' · '))}</dd>`:''}
      ${r.genre?`<dt>장르</dt><dd>${esc(genreKo(r.genre))}</dd>`:''}
      ${r.dev||r.pub?`<dt>개발·유통</dt><dd>${esc([...new Set([r.dev,r.pub].filter(Boolean))].join(' · '))}</dd>`:''}
      ${r.kor?`<dt>언어</dt><dd><span class="pill kor">한국어판</span></dd>`:''}
      ${r.crc?`<dt>파일 확인</dt><dd>${r.dbMatch==='crc'?`<span class="okmark">✓ 정식 덤프</span> <span class="muted">${esc(r.dbName)}</span>`:`<span class="muted">목록에 없는 파일이에요${r.kor?' (한국어판이면 목록에 없을 수 있어요)':' · 해킹·번역·배드 덤프일 수 있어요'}</span>`} <span class="mono muted">CRC ${esc(r.crc)}</span></dd>`:''}
      ${r.discs>1?`<dt>디스크</dt><dd>${r.discs}장${r.m3u?' (m3u)':''}</dd>`:''}
      <dt>크기</dt><dd class="mono">${fmtSize(r.size)}</dd>
      <dt>파일</dt><dd class="mono">${r.files.map(f=>esc(f.path)).join('<br>')}</dd>
      ${(r.console==='switch'||r.console==='switch2')&&!r.icon?`<dt>타이틀 아이콘</dt><dd>${r.iconErr?`<span class="warnmark">못 꺼냄</span> ${esc(r.iconErr)}`:'<span class="muted">아직 꺼내지 않았어요</span>'}<br><span class="muted">prod.keys: <span class="mono">${esc(NXKEYS||'찾지 못함')}</span></span> <button class="btn sm" data-act="iconretry">다시 꺼내기</button></dd>`:''}
      <dt>플레이</dt><dd>${r.plays||0}회 · ${fmtDur(r.playSeconds)} · 마지막 ${timeAgo(r.lastPlayed)}</dd>
    </dl>
    ${r.boxartGuess&&!r.cover&&!r.autoCover?`<p class="note">비슷한 제목으로 찾은 박스아트예요 (${esc(r.thumbName||'')}). 틀렸다면 아래의 <b>온라인에서 커버 찾기</b>로 바꿔 주세요.</p>`:''}
    ${versionsHTML(r)}
    ${colsHTML(r)}
    ${r.offline?'<p class="note" style="color:var(--warn)">이 게임이 있던 폴더를 찾을 수 없어요. 드라이브가 연결됐는지 확인하세요.</p>':''}
    <div class="field"><label for="dcons">콘솔 ${r.console==='unknown'?'<span class="pill warn">지정 필요</span>':''}</label>
      <select class="sel" id="dcons">${[...CONSOLES,UNKNOWN].map(x=>`<option value="${x.id}" ${x.id===r.console?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
    ${r.console!=='unknown'?`<div class="field"><label for="demu">이 게임의 에뮬레이터</label>
      <select class="sel" id="demu"><option value="">${(()=>{ const pick=r.emu?null:emuFor(r); const dirOk=r.dirEmu&&options(r.console).some(o=>o.id===r.dirEmu)&&!emuCantRead(r.dirEmu,r); return dirOk?`ROM 폴더 지정 (${esc(optLabel(r.dirEmu))})`:pick&&pick!==def?`자동 (${esc(optLabel(pick))} · ${esc(optLabel(def))}은 .${esc(romExt(r))} 못 읽음)`:`콘솔 기본값 (${esc(optLabel(def)||'없음')})` })()}</option>${opts.map(o=>`<option value="${o.id}" ${o.id===r.emu?'selected':''}>${esc(o.label)}${emuCantRead(o.id,r)?` — .${esc(romExt(r))} 못 읽음`:''}</option>`).join('')}<option value="__pick">다른 실행 파일 직접 고르기…</option></select></div>`:''}
    <div class="field"><label>실행 명령</label>
      ${spec&&emuCantRead(emuFor(r),r)?`<p class="note">${esc(spec.emuName)}은(는) .${esc(romExt(r))} 파일을 읽지 못해요. .cue·.bin으로 바꾸거나 위에서 다른 에뮬레이터(RetroArch의 mednafen_pce 코어, BizHawk 등)를 골라 주세요.</p>`:''}
      ${r.console==='pc98'&&/\.(zip|7z|rar)$/i.test(r.files[0].path)?'<p class="note">Neko Project는 압축 파일을 바로 열지 못해요. 압축을 풀어 .hdi·.fdi·.d88 같은 이미지 파일로 두세요.</p>':''}
      ${spec?`<div class="cmd mono">${esc(spec.display)}</div>${r.discs>1&&!r.m3u?(r.console==='pc98'?`<p class="note" style="margin-top:6px">플로피 디스크 1·2를 FDD1·FDD2에 넣고 시작해요.${r.discs>2?' 나머지 디스크는 에뮬레이터 메뉴에서 바꿔 넣어 주세요.':''}</p>`:'<p class="note" style="margin-top:6px">디스크 1로 시작해요. 같은 폴더에 .m3u 파일을 만들어 두면 디스크 교체가 쉬워요.</p>'):''}`:`<div class="cmd note">${r.console==='unknown'?'먼저 콘솔을 지정하세요.':'이 콘솔에 지정된 에뮬레이터가 없어요. 위에서 실행 파일을 직접 골라 주세요.'}</div>`}</div>
    ${fbneoMissing(r,spec)?(()=>{ const en=spec.kind==='m2emu'?'Model 2 Emulator':'FBNeo'; return `<div class="warnbox"><b>${en}가 이 게임을 찾지 못해요</b>${en}는 파일 경로 대신 롬셋 이름(<span class="mono">${esc(basename(r.files[0].path).replace(/\.[^.]+$/,'').toLowerCase())}</span>)만 받고, ${spec.kind==='m2emu'?'EMULATOR.INI의 [RomDirs]':'FBNeo에 등록된 ROM 폴더'}에서 게임을 찾아요. 이 게임 폴더가 아직 등록돼 있지 않아요.<div class="actions" style="margin-top:8px"><button class="btn sm primary" data-act="fbneoadd">${en} ROM 폴더에 추가</button></div></div>` })():''}
    ${ipsHTML(r,spec)}${cemuHTML(r,spec)}${np2FontHTML(r,spec)}
    ${syscardHTML(r,spec)}
    ${spec?.kind==='fbneo'&&emuInfo.get(spec.exe)&&!emuInfo.get(spec.exe).iniFound?'<p class="note" style="color:var(--warn)">FBNeo 설정 파일을 찾지 못했어요. FBNeo를 한 번 직접 켰다 끈 뒤 다시 열어 주세요.</p>':''}
    <div class="actions">
      ${run?'<button class="btn primary" data-act="stop">■ 게임 종료</button>':`<button class="btn primary" data-act="run" ${spec?'':'disabled'}>▶ 실행</button>`}
      <button class="btn" data-act="fav">${r.fav?'⭐ 즐겨찾기 해제':'☆ 즐겨찾기'}</button>
      <button class="btn" data-act="flip" title="케이스를 뒤집어 스크린샷과 플레이 기록을 봐요">${$('.flyer.back')?'↺ 앞면':'↻ 뒷면'}</button>
    </div>
    <div class="actions">
      <button class="btn sm" data-act="coversearch">🔎 온라인에서 커버 찾기</button>
      <button class="btn sm" data-act="cover">파일에서 커버 넣기</button>
      ${r.cover?'<button class="btn sm" data-act="uncover">기본 커버로</button>':''}
      <button class="btn sm" data-act="reveal" data-path="${esc(r.files[0].path)}">파일 위치 열기</button>
      ${spec?'<button class="btn sm" data-act="copycmd">명령 복사</button>':''}
      ${r.lastLog?`<button class="btn sm" data-act="reveal" data-path="${esc(r.lastLog)}">실행 로그 열기</button>`:''}
    </div>`;
}
function hintText(r){const m=CONS[r.console].media;if(r.console==='unknown')return '';if(runningIds.has(r.id))return '실행 중이에요';if(r.console==='pc98')return '플로피를 누르면 실행돼요';return (m==='disc'||m==='mini'||m==='umd')?'디스크를 누르면 실행돼요':'카트리지를 누르면 실행돼요'}
/* 설명서 그림: 폭에 맞춘 그림 전체가 들어갈 자리가 없으면 그림을 빼고 제목만 둔다 */
function fitManual(){
  const img=$('.flyer .manual .mimg'); if(!img) return;
  const check=()=>{ const box=img.parentElement; const man=box.closest('.manual'); if(!man||!img.naturalWidth) return;
    man.classList.remove('noart');
    const need=box.clientWidth*img.naturalHeight/img.naturalWidth;
    if(box.clientHeight<need*.92) man.classList.add('noart') };
  if(img.complete) check(); else img.addEventListener('load',check,{once:true});
}
function addSession(rom,meta,seconds){
  if(seconds<5) return; const at=meta?.at||Date.now()-seconds*1000;
  if(!rom.firstPlayed) rom.firstPlayed=at;
  rom.sessions=[...(rom.sessions||[]),{at,s:Math.round(seconds),e:meta?.emu||''}].slice(-30);
}
function sizeFlyer(r){
  const c=CONS[r.console]; const W=$('.stage').clientWidth;
  const maxH=Math.min(innerHeight*.6,460);
  let w=Math.min(320,(W-24)/2,maxH*c.aspect); w=Math.max(120,Math.floor(w)); const h=Math.round(w/c.aspect);
  const f=$('.flyer'); f.style.setProperty('--w',w+'px'); f.style.setProperty('--h',h+'px'); f.dataset.h=h;
  requestAnimationFrame(fitManual);
}
const sourceEl=id=>document.querySelector(`#shelf [data-id="${id}"]`);
function flipRect(src){const b=src?.classList.contains('row')?src.querySelector('.box'):null; return (b||src).getBoundingClientRect()}
function flipFrames(A,B,spine){
  // 가로·세로를 같은 비율로 줄여서 케이스 모양이 늘어나지 않게 한다
  const s=spine?A.height/B.height:Math.min(A.height/B.height,A.width/B.width);
  const dx=spine?A.left-B.left:A.left+(A.width-B.width*s)/2-B.left;
  const dy=A.top+(A.height-B.height*s)/2-B.top;
  const lift=Math.min(30,Math.max(10,A.height*.25));
  return spine ? [`translate(${dx}px,${dy}px) scale(${s}) rotateY(-74deg)`,`translate(${dx}px,${dy-lift}px) scale(${s*1.05}) rotateY(-50deg)`]
               : [`translate(${dx}px,${dy}px) scale(${s})`,`translate(${dx}px,${dy-lift}px) scale(${s*1.05})`];
}
function openCase(id){
  const r=S.roms.find(x=>x.id===id); if(!r||openId)return;
  openId=id; openedAt=Date.now(); const src=sourceEl(id); const A=src?flipRect(src):null; const spine=src?.classList.contains('sp');
  $('#overlay').innerHTML=`<div class="ov" role="dialog" aria-modal="true" aria-label="${esc(r.title)}">
    <div class="scrim" data-act="close"></div>
    <div class="ovin"><div class="stage"><div class="flyer">${caseHTML(r)}</div><p class="hint">${hintText(r)}</p></div><aside class="info">${infoHTML(r)}</aside></div>
    <button class="ovx" data-act="close">닫고 선반에 넣기 (Esc)</button></div>`;
  document.body.classList.add('locked','modal');
  loadOpenExtras(r);
  const ov=$('.ov'); sizeFlyer(r);
  requestAnimationFrame(()=>ov.classList.add('show'));
  if(src) src.classList.add('out');
  const fl=$('.flyer'); const B=fl.getBoundingClientRect();
  const done=()=>{ov.classList.add('open');setTimeout(()=>$('.info .btn.primary')?.focus(),ms(500))}; renderCouchBar();
  if(!A||reduced()){done();return}
  const [from,lift]=flipFrames(A,B,spine);
  fl.animate([{transform:from},{transform:lift,offset:.28},{transform:'none'}],{duration:ms(700),easing:'cubic-bezier(.3,.7,.2,1)'}).onfinish=done;
}
function closeCase(){
  const ov=$('.ov'); if(!ov||ov.dataset.closing)return; ov.dataset.closing='1';
  const id=openId;
  const finish=()=>{$('#overlay').innerHTML='';document.body.classList.remove('locked','modal');openId=null;const s=sourceEl(id);if(s){s.classList.remove('out');s.focus({preventScroll:true})} renderCouchBar()};
  if(reduced()){finish();return}
  ov.classList.remove('open');
  setTimeout(()=>{
    const src=sourceEl(id); const fl=$('.flyer'); if(!fl){finish();return}
    ov.classList.remove('show');
    if(!src){fl.animate([{opacity:1},{opacity:0}],{duration:ms(250)}).onfinish=finish;return}
    const [to,lift]=flipFrames(flipRect(src),fl.getBoundingClientRect(),src.classList.contains('sp'));
    fl.animate([{transform:'none'},{transform:lift,offset:.72},{transform:to}],{duration:ms(600),easing:'cubic-bezier(.4,0,.3,1)',fill:'forwards'}).onfinish=finish;
  },ms(700));
}
function refreshOpen({rebuild}={}){
  const r=S.roms.find(x=>x.id===openId); if(!r||!$('.ov'))return;
  $('.info').innerHTML=infoHTML(r); $('.hint').textContent=hintText(r);
  if(rebuild){const fl=$('.flyer'); fl.classList.remove('back','shut'); fl.innerHTML=caseHTML(r);sizeFlyer(r); const b=$('.info [data-act="flip"]'); if(b) b.textContent='↻ 뒷면'}
  else{const d=$('.flyer .disc'); if(d)d.classList.toggle('running',runningIds.has(r.id))}
}
/* 진열장 일부만 갱신 (게임 하나가 바뀌었을 때) */
function refreshLib(){ if(S.tab==='lib'){renderSide(); updateVisible(true)} }

/* ===================== 실행 ===================== */
let toastT;
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,3200)}
async function runGame(id){
  const rom=S.roms.find(x=>x.id===id); if(!rom)return;
  if(runningIds.has(id)){toast('이미 실행 중이에요');return}
  let spec=launchSpec(rom);
  if(!spec){toast(rom.console==='unknown'?'먼저 콘솔을 지정하세요':'이 콘솔에 지정된 에뮬레이터가 없어요');return}
  if(spec.kind==='mame'||spec.kind==='fbneo'||spec.kind==='m2emu'){ await loadEmuInfo(spec); spec=launchSpec(rom); }
  if(!(await syncSyscard(rom))) return;
  // BizHawk: 실행하는 동안만 PC엔진 CD 펌웨어를 바꾼다
  let restore=null;
  if(syscardMode(rom)==='bizhawk'&&rom.syscard){
    try{ const prev=await api.bizhawkFirmware(spec.exe,BIZHAWK_PCECD_KEY,rom.syscard); restore={exe:spec.exe,prev:prev??null} }
    catch(e){ toast(String(e)); return }
  }
  if(fbneoMissing(rom,spec)){
    if(openId!==id) openCase(id);
    const en=spec.kind==='m2emu'?'Model 2 Emulator':'FBNeo';
    toast(`${en}는 등록된 ROM 폴더에서만 게임을 찾아요. 정보 창의 [${en} ROM 폴더에 추가]를 먼저 눌러 주세요`); refreshOpen(); return;
  }
  const cart=$('.flyer .cart, .flyer .cart2'); if(cart&&!reduced()){cart.classList.remove('go');void cart.offsetWidth;cart.classList.add('go')}
  // BizHawk: PC엔진 계열 코어(PCEHawk·TurboNyma·HyperNyma)를 config.ini의 PreferredCores에 적는다
  if(spec.kind==='bizhawk'&&S.settings.bizhawkPce&&['pce','sgx','pcecd'].includes(rom.console)&&api.bizhawkCores){
    const c=S.settings.bizhawkPce;
    try{ await api.bizhawkCores(spec.exe,['PCE','PCECD','SGX','SGXCD'].map(k=>[k,c])) }catch(e){ log('BizHawk 코어를 정하지 못했어요: '+e,'w'); toast('BizHawk 코어를 정하지 못했어요 (그대로 실행해요)') }
  }
  // Neko Project: 게임별(없으면 기본) 폰트 BMP를 ini의 fontfile= 에 적고 실행. 폰트를 정하지 않은 게임이면 처음 값으로 되돌린다
  if(spec.kind==='np2'&&api.np2SetFont) await np2Prepare(rom,spec.exe);
  launchMeta.set(id,{emu:spec.emuName,at:Date.now(),restore,cmd:spec.display,emuId:emuFor(rom)});
  const res=await api.launch({id,exe:spec.exe,args:spec.args,cwd:spec.cwd,minimize:S.settings.minimize});
  if(!res.ok&&restore) await api.bizhawkFirmware(restore.exe,BIZHAWK_PCECD_KEY,restore.prev).catch(()=>{});
  if(!res.ok){log(`실행 실패 · ${rom.title}: ${res.error}`,'w');save();showFail({rom,meta:launchMeta.get(id),error:res.error||'실행하지 못했어요'});return}
  runningIds.add(id); rom.plays=(rom.plays||0)+1; rom.lastPlayed=Date.now();
  toast(`${spec.emuName}(으)로 실행했어요`); save(); renderStats(); refreshLib(); refreshOpen();
}
const launchMeta=new Map();
/* ---------- Neko Project 폰트 (게임별) ----------
   rom.np2Font: 없음 → 기본 폰트(에뮬레이터 탭)·없으면 에뮬레이터 설정 그대로, '-' → 에뮬레이터 설정 그대로, 경로 → 그 폰트
   처음 바꿀 때 ini의 원래 값을 S.np2Orig[exe]에 적어 두고, '그대로'인 게임을 실행할 때 되돌린다 */
const np2FontOf=r=>r.np2Font==='-'?'':(r.np2Font||S.settings.np2Font||'');
/* 실행 전에 이 게임에 필요한 ini 값을 적는다: 폰트(fontfile), 하드디스크(HDD1FILE·HDD2FILE, 저장된 FDD 비우기).
   처음 바꾸는 키는 원래 값을 S.np2Orig[exe][키]에 적어 두고, 그 값이 필요 없는 게임을 실행할 때 되돌린다 */
async function np2Prepare(rom,exe){
  S.np2Orig=S.np2Orig||{}; let orig=S.np2Orig[exe]; if(typeof orig==='string') orig={fontfile:orig}; orig=S.np2Orig[exe]=orig||{};
  const want={};
  const hd=rom.files.filter(f=>NP2_HDD.test(f.path));
  if(hd.length){ want.HDD1FILE=hd[0].path; if(hd[1]) want.HDD2FILE=hd[1].path; want.FDD1FILE=''; want.FDD2FILE='' }   // 지난번 플로피가 남아 있으면 그쪽으로 부팅하므로 비운다
  try{
    const font=np2FontOf(rom);
    if(font){ const [,prev]=await api.np2SetFont(exe,font); if(!('fontfile' in orig)) orig.fontfile=prev??'' }
    else if('fontfile' in orig){ await api.np2SetFont(exe,orig.fontfile,true); delete orig.fontfile }
    const keys=[...new Set([...Object.keys(want),...Object.keys(orig).filter(k=>k!=='fontfile')])];
    const pairs=keys.map(k=>[k,k in want?want[k]:orig[k]]);
    if(pairs.length){
      const prev=await api.np2IniSet(exe,pairs);
      keys.forEach((k,i)=>{ if(k in want){ if(!(k in orig)) orig[k]=prev[i]??'' } else delete orig[k] });
    }
    if(!Object.keys(orig).length) delete S.np2Orig[exe];
  }catch(e){ log('Neko Project 설정(ini)을 바꾸지 못했어요: '+e,'w'); toast('Neko Project 설정을 바꾸지 못했어요: '+e) }
}
const np2Fonts=new Map();   // exe → 에뮬레이터 폴더·Font 폴더의 BMP 목록
async function loadNp2Fonts(exe){
  if(np2Fonts.has(exe)||!api.listFiles) return; const d=dirname(exe), s=sep(exe); const out=[];
  for(const sub of ['','Font','font','Fonts','fonts']){ const dir=sub?d+s+sub:d; const fl=await api.listFiles(dir,'bmp').catch(()=>[]); for(const f of fl||[]) if(!out.some(x=>x.toLowerCase()===f.path.toLowerCase())) out.push(f.path) }
  np2Fonts.set(exe,out);
}
function np2FontHTML(r,spec){
  if(r.console!=='pc98'||spec?.kind!=='np2') return '';
  const list=np2Fonts.get(spec.exe)||[]; const cur=r.np2Font||'';
  const opts=[[ '', S.settings.np2Font?`기본 폰트 (${basename(S.settings.np2Font)})`:'에뮬레이터 설정 그대로' ]];
  if(S.settings.np2Font) opts.push(['-','에뮬레이터 설정 그대로']);
  for(const p of list) opts.push([p,basename(p)]);
  if(cur&&cur!=='-'&&!list.some(p=>p.toLowerCase()===cur.toLowerCase())) opts.push([cur,basename(cur)]);
  opts.push(['@pick','다른 BMP 파일 고르기…']);
  return `<div class="field"><label>폰트 BMP <span class="muted">· 이 게임을 실행할 때 쓸 폰트</span></label>
    <select data-np2font="${r.id}">${opts.map(([v,t])=>`<option value="${esc(v)}" ${v===cur?'selected':''}>${esc(t)}</option>`).join('')}</select>
    ${cur&&cur!=='-'?`<p class="muted csnote mono">${esc(cur)}</p>`:''}</div>`;
}
api.onGameExit(({id,seconds,code,log:logPath})=>{
  runningIds.delete(id); const rom=S.roms.find(x=>x.id===id); const meta=launchMeta.get(id)||{};
  if(meta.restore) api.bizhawkFirmware(meta.restore.exe,BIZHAWK_PCECD_KEY,meta.restore.prev).catch(e=>log('BizHawk 펌웨어 설정을 되돌리지 못했어요: '+e,'w'));
  if(rom){
    rom.lastLog=logPath||rom.lastLog;
    if(seconds<3){
      // 에뮬레이터가 게임을 열지 못하고 바로 닫힌 경우
      rom.plays=Math.max(0,(rom.plays||1)-1);
      log(`바로 종료 · ${rom.title} · ${meta.emu||''} · 종료 코드 ${code??'?'} · 로그 ${logPath||'-'}`,'w');
      showFail({rom,meta,code,logPath,seconds});
    } else if(code&&seconds<20){
      // 잠깐 돌다가 오류 코드로 꺼진 경우도 알려 준다 (시간은 기록)
      rom.playSeconds=(rom.playSeconds||0)+seconds; addSession(rom,meta,seconds); showFail({rom,meta,code,logPath,seconds});
    } else { rom.playSeconds=(rom.playSeconds||0)+seconds; addSession(rom,meta,seconds); if(seconds>=60)toast(`${rom.title} · ${fmtDur(seconds)} 플레이를 기록했어요`) }
  }
  save(); renderStats(); refreshLib(); refreshOpen();
});
/* ---------- 아케이드: 원본·클론, 실제 제목 (FBNeo DAT + MAME 목록) ---------- */
const ARC_REG=[[/\bworld\b/i,'WW'],[/\b(usa|us|america)\b/i,'US'],[/\bjapan\b/i,'JP'],[/\b(europe|euro|uk|germany|france|italy|spain)\b/i,'EU'],[/\bkorean?\b/i,'KR'],[/\b(asia|hong kong|taiwan|china)\b/i,'AS'],[/\b(brazil|hispanic|latin)\b/i,'LA']];
function arcParse(desc){
  const m=desc.match(/^(.*?)\s*((?:\([^)]*\)\s*)*)$/); const title=(m?.[1]||desc).trim();
  const parens=[...(m?.[2]||'').matchAll(/\(([^)]*)\)/g)].map(x=>x[1].trim()).filter(Boolean);
  const rg=[]; for(const p of parens) for(const [re,code] of ARC_REG) if(re.test(p)&&!rg.includes(code)) rg.push(code);
  return {title,variant:parens.join(' · '),region:rg.join('·')};
}
let ARCDB=null;
async function arcadeDb(emus){
  if(ARCDB) return ARCDB;
  const mame=(emus||allEmus()).find(e=>e.key==='mame'||e.kind==='mame');
  const rows=await api.arcadeDb(mame?.path||null).catch(e=>{ log(`아케이드 목록을 받지 못했어요: ${e}`,'w'); return null });
  if(!Array.isArray(rows)||!rows.length) return null;
  ARCDB=new Map(rows.map(r=>[r[0].toLowerCase(),r])); return ARCDB;
}
async function applyArcade(roms,emus){
  const arc=roms.filter(x=>x.console==='arcade'&&!x.folder); if(!arc.length) return;
  const db=await arcadeDb(emus); if(!db) return;
  let n=0, clones=0;
  for(const x of arc){
    const name=basename(x.files[0].path).replace(/\.[^.]+$/,'').toLowerCase(); const row=db.get(name); if(!row) continue;
    const p=arcParse(row[2]||name);
    Object.assign(x,{arcName:name,arcParent:(row[1]||'').toLowerCase(),arcDesc:row[2],arcParentDesc:row[1]?(db.get(row[1].toLowerCase())?.[2]||''):'',year:row[3]||'',maker:row[4]||'',title:p.title||x.title,region:p.region,variant:row[1]?p.variant:''});
    n++; if(row[1]) clones++;
  }
  if(n) log(`아케이드 ${fmtNum(n)}개의 제목을 찾았어요 (원본 ${fmtNum(n-clones)}개, 클론 ${fmtNum(clones)}개)`);
}

/* ---------- 온라인 커버 찾기: libretro-thumbnails 목록 검색 + 웹 검색 + 이미지 주소 ---------- */
const CS={rom:null,sys:'',folder:'Named_Boxarts',q:'',list:null,err:'',busy:false};
const SEARCHIDX=new Map();
const csNorm=s=>String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const csRepo=sys=>sys.replace(/ /g,'_');
const csUrl=(sys,folder,n)=>`https://raw.githubusercontent.com/libretro-thumbnails/${encodeURIComponent(csRepo(sys))}/master/${folder}/${encodeURIComponent(thumbSafe(n))}.png`;
async function csLoad(sys){
  if(SEARCHIDX.has(sys)) return SEARCHIDX.get(sys);
  const idx=await boxIndex(sys); if(!idx) throw new Error('목록을 받지 못했어요');
  const v=idx.names.map(n=>({n,k:csNorm(n)})); v.idx=idx; SEARCHIDX.set(sys,v); return v;
}
function csSearch(list,q,rom){
  const words=csNorm(q).split(' ').filter(Boolean); if(!words.length) return [];
  const qk=words.join(' '); const want=(rom?.region||'').split('·').filter(Boolean);
  const out=[];
  for(const it of list){
    if(!words.every(w=>it.k.includes(w))) continue;
    let sc=0; if(it.k.startsWith(qk)) sc+=50; if(it.k.replace(/ \w+( \w+)*$/,'')===qk) sc+=10;
    const rg=parseName(it.n).region.split('·'); if(want.some(w=>rg.includes(w))) sc+=15;
    if(THUMB_BAD.test(it.n)) sc-=20; sc-=it.n.length/40; out.push([sc,it.n]);
  }
  const res=out.sort((a,b)=>b[0]-a[0]).slice(0,60).map(x=>x[1]);
  // 결과가 적으면 단어가 비슷한 이름도 뒤에 붙인다
  if(res.length<12&&list.idx){ for(const x of thumbFuzzy(q,list.idx,40)) if(x.s>=.4&&!res.includes(x.n)) res.push(x.n) }
  return res.slice(0,60);
}
async function openCoverSearch(rom){
  CS.rom=rom; CS.sys=THUMB_SYS[rom.console]||Object.values(THUMB_SYS)[0]; CS.folder='Named_Boxarts';
  CS.q=rom.arcDesc?arcParse(rom.arcDesc).title:rom.title; CS.list=null; CS.err=''; CS.mode='lib'; CS.web=null; CS.wq=''; CS.werr='';
  renderCoverSearch(); await csRun();
  // libretro 목록에 맞는 그림이 없으면 바로 웹 이미지 검색으로
  if(CS.rom===rom&&(!CS.list?.length||(CS.err&&CS.list.length<=2))) csWebRun();
}
async function csRun(){
  CS.busy=true; CS.err=''; renderCoverSearch(true);
  CS.weak=false;
  try{ const idx=await csLoad(CS.sys); CS.list=csSearch(idx,CS.q,CS.rom); CS.weak=!!idx.idx?.weak }
  catch(e){ CS.err=String(e?.message||e);
    // 목록을 못 받아도 파일 이름·제목 그대로의 그림은 있을 수 있다
    CS.list=[...new Set([...(CS.sys===THUMB_SYS[CS.rom.console]?thumbNames(CS.rom,null):[]),CS.q].filter(Boolean))] }
  CS.busy=false; renderCoverSearch(true);
}
function renderCoverSearch(keepFocus){
  const el=$('#alert'); const r=CS.rom; if(!r) return;
  const act=document.activeElement?.id; const web=CS.mode==='web';
  const sysOpts=[...new Set(Object.values(THUMB_SYS))].sort((a,b)=>a.localeCompare(b));
  let res;
  if(web){
    res=CS.busy?'<p class="muted cswait">웹에서 찾는 중…</p>':CS.werr?`<div class="note csnote cswarn">웹 이미지 검색이 되지 않았어요. <span class="mono">${esc(CS.werr)}</span> <button class="btn sm" data-act="csddg">DuckDuckGo로 다시 시도</button><br>아래 [브라우저로 찾기]를 써도 돼요.</div>`
      :!CS.web?.length?'<p class="muted cswait">결과가 없어요. 검색어를 바꿔 보세요.</p>'
      :`${CS.wnote?`<div class="note csnote cswarn">DuckDuckGo에서 찾지 못해 <b>${esc(CS.wsrc)}</b> 결과를 보여 줘요. 이유: <span class="mono">${esc(CS.wnote.replace(/^DuckDuckGo: /,''))}</span> <button class="btn sm" data-act="csddg">DuckDuckGo로 다시 시도</button></div>`:`<p class="muted csnote">${esc(CS.wsrc||CS.web[0].source)} 이미지 검색 결과예요. 누르면 원본 그림을 받아 커버로 정해요.</p>`}<div class="csgrid web">${CS.web.map((x,i)=>`<button class="cstile" data-act="cswebpick" data-i="${i}" title="${esc(x.title)}"><img loading="lazy" referrerpolicy="no-referrer" src="${esc(x.thumb)}" alt=""><span>${esc(x.title||'')}${x.width?` <small>${x.width}×${x.height}</small>`:''}</span></button>`).join('')}</div>`;
  } else {
    const errNote=CS.weak&&!CS.err?'<p class="note csnote">박스아트 목록 서버에 연결하지 못해 게임 정보 목록(정식 이름)으로 찾았어요. 그림이 없는 이름은 자동으로 숨겨요.</p>':CS.err?`<p class="note csnote">libretro 목록을 받지 못해서 이름이 정확히 같은 그림만 보여 줘요 (${esc(CS.err)}). 없으면 [웹 이미지 검색]을 써 보세요.</p>`:'';
    res=CS.busy?'<p class="muted cswait">찾는 중…</p>':!CS.list?.length?'<p class="muted cswait">맞는 그림이 없어요. 검색어를 줄이거나 [웹 이미지 검색]으로 찾아보세요.</p>'
      :`${errNote}<div class="csgrid">${CS.list.map(n=>`<button class="cstile" data-act="cspick" data-n="${esc(n)}" title="${esc(n)}"><img loading="lazy" src="${esc(csUrl(CS.sys,CS.folder,n))}" alt=""><span>${esc(n)}</span></button>`).join('')}</div>`;
  }
  const qv=web?CS.wq:CS.q; const bq=encodeURIComponent(CS.wq||`${CS.q} ${consoleEn(r.console)} box art`);
  el.innerHTML=`<div class="alertbg" data-act="csclose"></div><div class="alertbox csbox" role="dialog" aria-modal="true" aria-labelledby="cst">
    <h3 id="cst">커버 찾기 · ${esc(r.title)}</h3>
    <div class="seg csmode" role="tablist" aria-label="찾는 곳"><button role="tab" data-act="csmode" data-m="lib" aria-pressed="${!web}">libretro 박스아트</button><button role="tab" data-act="csmode" data-m="web" aria-pressed="${web}">웹 이미지 검색</button></div>
    <form class="csbar" id="csform"><input id="csq" class="inp" value="${esc(qv||'')}" aria-label="검색어" autocomplete="off">
      ${web?'':`<select id="cssys" class="sel" aria-label="목록">${sysOpts.map(x=>`<option${x===CS.sys?' selected':''}>${esc(x)}</option>`).join('')}</select>`}
      <button class="btn primary" type="submit">찾기</button></form>
    ${web?'':`<div class="seg cstype" role="group" aria-label="그림 종류">${[['Named_Boxarts','박스아트'],['Named_Titles','타이틀 화면'],['Named_Snaps','게임 화면']].map(([f,l])=>`<button data-act="csfolder" data-f2="${f}" aria-pressed="${CS.folder===f}">${l}</button>`).join('')}</div>`}
    <div class="csres">${res}</div>
    <div class="csmore"><b>브라우저로 찾기</b> <span class="muted">기본 브라우저가 새 창으로 열려요</span>
      <div class="actions"><button class="btn sm" data-act="csweb" data-url="https://www.google.com/search?tbm=isch&q=${bq}">구글 이미지</button><button class="btn sm" data-act="csweb" data-url="https://duckduckgo.com/?ia=images&iax=images&q=${bq}">DuckDuckGo 이미지</button>
        <button class="btn sm" data-act="cover">파일에서 고르기</button></div>
      <form class="csbar" id="csurlform"><input id="csurl" class="inp" placeholder="브라우저에서 찾은 이미지 주소 붙여넣기 (https://…png, …jpg)" aria-label="이미지 주소" autocomplete="off"><button class="btn" type="submit">주소로 넣기</button></form></div>
    <div class="actions"><span style="flex:1"></span>${r.cover?'<button class="btn sm" data-act="uncover">기본 커버로</button>':''}<button class="btn sm" data-act="csclose">닫기</button></div></div>`;
  el.hidden=false; el.dataset.mode='cover';
  el.querySelector('.csgrid')?.addEventListener('error',e=>{ const t=e.target.closest?.('.cstile'); if(!t) return; t.classList.add('broken');
    // libretro 그림이 하나도 없으면 웹 이미지 검색으로 넘어간다
    const g=t.closest('.csgrid'); if(CS.mode==='lib'&&!CS.web&&g&&!g.querySelector('.cstile:not(.broken)')){ g.insertAdjacentHTML('afterend','<p class="muted cswait">libretro에 맞는 그림이 없어서 웹에서 찾아볼게요…</p>'); setTimeout(()=>{ if(CS.mode==='lib'&&!CS.web) csWebRun() },500) } },true);
  $('#csform').onsubmit=e=>{e.preventDefault(); if(CS.mode==='web'){ CS.wq=$('#csq').value.trim(); csWebRun() } else { CS.q=$('#csq').value.trim(); CS.sys=$('#cssys').value; csRun() } };
  if($('#cssys')) $('#cssys').onchange=()=>{CS.sys=$('#cssys').value; CS.q=$('#csq').value.trim(); csRun()};
  $('#csurlform').onsubmit=e=>{e.preventDefault(); const u=$('#csurl').value.trim(); if(u) csApply(u)};
  if(!keepFocus) $('#csq').select(); else if(act&&$('#'+act)) $('#'+act).focus();
}
/* 검색어용 영어 기기 이름: libretro 시스템 이름의 뒷부분 (없으면 짧은 이름) */
function consoleEn(id){ const sys=THUMB_SYS[id]; if(sys&&sys!=='MAME') return sys.split(' - ').slice(1).join(' ').replace(/ - .*$/,''); return id==='arcade'?'arcade':(CONS[id]?.short||'') }
/* 웹 이미지 검색 (앱 안에서) */
async function csWebRun(){
  if(!CS.wq) CS.wq=`${CS.q} ${consoleEn(CS.rom.console)} box art`.replace(/\s+/g,' ').trim();
  CS.mode='web'; CS.busy=true; CS.werr=''; renderCoverSearch(true);
  try{ const res=await api.webImages(CS.wq,CS.engine||null); CS.web=res?.items||[]; CS.wsrc=res?.source||''; CS.wnote=res?.note||'' }
  catch(e){ CS.web=[]; CS.wsrc=''; CS.wnote=''; CS.werr=String(e?.message||e) }
  CS.engine=null;
  CS.busy=false; renderCoverSearch(true);
}
async function csApplyWeb(i){
  const x=CS.web?.[i]; if(!x) return; const r=CS.rom; toast('원본 그림을 받는 중…');
  try{ await csApplyRaw(x.image) }
  catch(e){ // 원본 사이트가 막으면 검색 엔진의 작은 그림이라도
    try{ await csApplyRaw(x.thumb); toast('원본은 받지 못해 미리보기 그림으로 정했어요') }catch(e2){ toast(`그림을 받지 못했어요: ${e}`) } }
}
async function csApplyRaw(url){ const r=CS.rom; const p=await api.fetchImage(url,r.id); r.cover=p; save(); refreshLib(); if(openId===r.id) refreshOpen({rebuild:true}); closeFail(); toast('커버를 바꿨어요') }
async function csApply(url){
  const r=CS.rom; if(!r) return; toast('그림을 받는 중…');
  try{ const p=await api.fetchImage(url,r.id); r.cover=p; artCache?.delete?.(r.title); save(); refreshLib(); if(openId===r.id) refreshOpen({rebuild:true}); closeFail(); toast('커버를 바꿨어요') }
  catch(e){ toast(`그림을 받지 못했어요: ${e}`) }
}

/* ---------- 파일 내용(CRC)·게임 정보 (libretro-database) ---------- */
const METADB=new Map(); let idBusy=false;
async function metaFor(sys){
  if(METADB.has(sys)) return METADB.get(sys);
  const rows=await api.metaDb(sys,false); if(!Array.isArray(rows)||!rows.length) throw new Error('empty');
  const db={crc:new Map(),name:new Map(),serial:new Map(),key:new Map()};
  for(const r of rows){ if(r[0]) db.crc.set(r[0],r); { const k=r[1].toLowerCase(), ex=db.name.get(k); if(!ex||(!ex[2]&&!ex[3]&&(r[2]||r[3]))) db.name.set(k,r) }
    if(r[6]) for(const s of r[6].split(/[,\s]+/)) if(s) db.serial.set(s.toUpperCase().replace(/[-_ ]/g,''),r);
    const k=thumbKey(r[1]); const a=db.key.get(k); if(a) a.push(r); else db.key.set(k,[r]) }
  METADB.set(sys,db); return db;
}
const metaSys=c=>c==='arcade'?null:THUMB_SYS[c];
async function identifyRoms({quiet=false}={}){
  if(idBusy||S.settings.identify===false||!api.metaDb) return; idBusy=true;
  try{
    // 1) 카트리지 롬 CRC
    const cands=S.roms.filter(r=>CRC_CONSOLES.has(r.console)&&!r.folder&&!r.offline&&(r.size||0)<=128*1048576);
    if(cands.length){
      const t0=Date.now(); let shown=false;
      const off=await api.onCrcProgress?.(p=>{ if(Date.now()-t0>1500){ shown=true; setStatusLine(`파일 확인 중 ${fmtNum(p.done)} / ${fmtNum(p.total)}`) } });
      const res=await api.crcFiles(cands.map(r=>r.files[0].path)).catch(()=>[]);
      off?.(); if(shown) setStatusLine('');
      (res||[]).forEach((c,i)=>{ if(c){ cands[i].crc=c.full; cands[i].crcBare=c.bare||'' } });
    }
    // 2) 시스템별 목록과 맞추기
    const bySys=new Map(); for(const r of S.roms){ const k=metaSys(r.console); if(k) (bySys.get(k)||bySys.set(k,[]).get(k)).push(r) }
    let byCrc=0, renamed=0, withGenre=0, fail=0;
    for(const [sys,roms] of bySys){
      let db; try{ db=await metaFor(sys) }catch(e){ fail++; continue }
      for(const r of roms){
        const base=basename(r.files[0].path).replace(/\.[^.]+$/,''); let row=null, how='';
        if(r.crc&&(row=db.crc.get(r.crc)||(r.crcBare&&db.crc.get(r.crcBare)))) how='crc';
        if(!row){ const ser=(base.match(/\b([A-Z]{4})[-_ ]?(\d{3}\.?\d{2})\b/i)||[]); if(ser[1]){ row=db.serial.get((ser[1]+ser[2]).toUpperCase().replace('.','')); if(row) how='serial' } }
        if(!row){ row=db.name.get(base.toLowerCase())||db.name.get(parseName(base).discless.toLowerCase()); if(row) how='name' }
        if(!row){ const list=db.key.get(thumbKey(r.title)); if(list?.length){ const want=(r.region||'').split('·'); row=list.find(x=>parseName(x[1]).region.split('·').some(g=>want.includes(g)))||list[0]; how='title' } }
        if(!row){ r.dbMatch=''; continue }
        Object.assign(r,{dbName:row[1],dbMatch:how,genre:row[2]||r.genre||'',year:row[3]||r.year||'',dev:row[4]||'',pub:row[5]||''});
        if(how==='crc'){ byCrc++;
          // 정식 이름으로 (한국어판은 파일 이름을 그대로 둔다)
          if(!r.kor&&row[1]!==base){ const p=parseName(row[1]); r.title=p.title; r.region=p.region||r.region; r.variant=p.variant; renamed++ } }
        if(how!=='title'&&!r.boxart&&r.boxartTried) delete r.boxartTried;
        if(r.genre) withGenre++;
      }
    }
    VERS=null; save(); refreshLib(); if(S.tab==='lib') renderSide();
    if(byCrc||withGenre) log(`게임 정보: 파일 내용으로 ${fmtNum(byCrc)}개 확인${renamed?` (정식 이름으로 ${fmtNum(renamed)}개)`:''}, 장르 정보 ${fmtNum(withGenre)}개`,'ok');
    if(fail&&!byCrc&&!withGenre&&!quiet) log('게임 정보 목록을 받지 못했어요. 인터넷 연결을 확인해 주세요','w');
  } finally { idBusy=false }
}
function setStatusLine(t){ const st=$('#stats'); if(!st) return; let b=st.querySelector('.idprog'); if(!t){ b?.remove(); return } if(!b){ b=document.createElement('span'); b.className='idprog'; st.prepend(b) } b.textContent=t+' · ' }

/* ---------- 플레이 통계 ---------- */
function renderPlayStats(){
  const roms=S.roms; const played=roms.filter(r=>(r.playSeconds||0)>0||(r.plays||0)>0);
  const total=roms.reduce((a,r)=>a+(r.playSeconds||0),0), runs=roms.reduce((a,r)=>a+(r.plays||0),0);
  const sess=[]; for(const r of roms) for(const x of r.sessions||[]) sess.push({...x,r});
  sess.sort((a,b)=>b.at-a.at);
  const now=new Date(); const months=[]; for(let i=11;i>=0;i--){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push({y:d.getFullYear(),m:d.getMonth(),s:0}) }
  for(const x of sess){ const d=new Date(x.at); const mo=months.find(o=>o.y===d.getFullYear()&&o.m===d.getMonth()); if(mo) mo.s+=x.s }
  const thisMonth=months[11].s;
  const byCons={}, byGenre={}; for(const r of played){ byCons[r.console]=(byCons[r.console]||0)+(r.playSeconds||0); const g=genreKo(r.genre); if(g) byGenre[g]=(byGenre[g]||0)+(r.playSeconds||0) }
  const top=[...played].sort((a,b)=>(b.playSeconds||0)-(a.playSeconds||0)).slice(0,10);
  const tile=(l,v,sub)=>`<div class="stile"><span>${l}</span><b>${v}</b>${sub?`<small>${sub}</small>`:''}</div>`;
  const hbars=(list,label)=>{ const mx=Math.max(1,...list.map(x=>x[1])); return list.length?`<div class="hbars">${list.map(([k,v,extra])=>`<div class="hb" data-tip="${esc(k)} · ${esc(fmtDur(v))}"><span class="hbl">${k}</span><span class="hbt"><i style="width:${Math.max(1.5,v/mx*100)}%"></i></span><span class="hbv">${fmtDur(v)}${extra||''}</span></div>`).join('')}</div>`:`<p class="muted">${label}</p>` };
  const mx=Math.max(1,...months.map(o=>o.s));
  const h=`<div class="pstats">
    <h2 class="h2">플레이 통계</h2><p class="sub">RetroShelf로 실행한 게임의 기록이에요. 날짜별 기록은 0.12.0부터 쌓였어요.</p>
    <div class="stiles">${tile('총 플레이 시간',fmtDur(total)||'0분',`${fmtNum(runs)}번 실행`)}${tile('이번 달',fmtDur(thisMonth)||'0분',`${fmtNum(sess.filter(x=>new Date(x.at).getMonth()===now.getMonth()&&new Date(x.at).getFullYear()===now.getFullYear()).length)}번 플레이`)}${tile('해 본 게임',`${fmtNum(played.length)}개`,`진열장 ${fmtNum(roms.length)}개 중 ${roms.length?Math.round(played.length/roms.length*1000)/10:0}%`)}${tile('가장 오래 한 게임',top[0]?esc(top[0].title):'—',top[0]?fmtDur(top[0].playSeconds):'')}</div>
    <section class="pcard"><h3>월별 플레이 시간 <small>최근 12개월</small></h3>
      ${sess.length?`<div class="vbars" role="img" aria-label="월별 플레이 시간">${months.map((o,i)=>`<div class="vb${i===11?' cur':''}" data-tip="${o.y}년 ${o.m+1}월 · ${esc(fmtDur(o.s)||'0분')}"><span class="vbt"><i style="height:${o.s?Math.max(2,o.s/mx*100):0}%"></i></span><span class="vbl">${o.m+1}월</span></div>`).join('')}</div>`:'<p class="muted">아직 날짜별 기록이 없어요. 게임을 실행하면 여기에 쌓여요.</p>'}</section>
    <div class="pgrid">
      <section class="pcard"><h3>콘솔별</h3>${hbars(Object.entries(byCons).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([c,v])=>[esc(CONS[c]?.name||c),v]),'아직 플레이 기록이 없어요')}</section>
      <section class="pcard"><h3>장르별</h3>${hbars(Object.entries(byGenre).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([g,v])=>[esc(g),v]),'장르를 아는 게임의 기록이 아직 없어요')}</section>
    </div>
    <div class="pgrid">
      <section class="pcard"><h3>많이 한 게임</h3>${top.length?`<ol class="toplist">${top.map((r,i)=>`<li><button data-act="statopen" data-id2="${r.id}"><span class="rk">${i+1}</span><span class="tt">${esc(r.title)}<small>${esc(CONS[r.console]?.name||'')}</small></span><span class="tv">${fmtDur(r.playSeconds)}<small>${fmtNum(r.plays||0)}회</small></span></button></li>`).join('')}</ol>`:'<p class="muted">아직 플레이 기록이 없어요</p>'}</section>
      <section class="pcard"><h3>최근 플레이</h3>${sess.length?`<table class="ptable"><thead><tr><th>날짜</th><th>게임</th><th class="r">시간</th></tr></thead><tbody>${sess.slice(0,12).map(x=>`<tr><td class="mono">${fmtDate(x.at)}</td><td><button class="lnk" data-act="statopen" data-id2="${x.r.id}">${esc(x.r.title)}</button></td><td class="r mono">${fmtDur(x.s)}</td></tr>`).join('')}</tbody></table>`:'<p class="muted">아직 날짜별 기록이 없어요</p>'}</section>
    </div></div>`;
  $('#main').innerHTML=h;
}

/* ---------- sm2-emu games.xml: Model 1·2 제목, 원본·클론, 버전, 연도 ---------- */
async function applySm2Db(roms,emus){
  const list=roms.filter(x=>(x.console==='model2'||x.console==='model1')&&!x.folder); if(!list.length) return;
  const e=(emus||allEmus()).find(x=>x.key==='sm2emu'||x.kind==='sm2emu'); if(!e) return;
  const xml=await api.readText(dirname(e.path)+sep(e.path)+'games.xml').catch(()=>null); if(!xml) return;
  const db=new Map();
  for(const m of xml.matchAll(/<game\s([^>]*)>([\s\S]*?)<\/game>/g)){
    const at=Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));
    const tag=k=>{ const t=m[2].match(new RegExp(`<${k}>([\\s\\S]*?)</${k}>`)); return t?t[1].trim().replace(/&amp;/g,'&').replace(/&apos;/g,"'").replace(/&quot;/g,'"'):'' };
    if(at.name) db.set(at.name.toLowerCase(),{parent:(at.parent||'').toLowerCase(),board:at.board||'',title:tag('title'),version:tag('version'),year:tag('year'),maker:tag('manufacturer')});
  }
  let n=0;
  for(const x of list){
    const name=basename(x.files[0].path).replace(/\.[^.]+$/,'').toLowerCase(); const g=db.get(name); if(!g) continue;
    const p=g.parent?db.get(g.parent):null; const board=g.board||p?.board||'';
    Object.assign(x,{arcName:name,arcParent:g.parent,arcDesc:(g.title||p?.title||name)+(g.version?` (${g.version})`:''),
      title:g.title||p?.title||x.title,variant:g.parent?(g.version||''):'',year:g.year||p?.year||'',maker:g.maker||p?.maker||''});
    // 폴더 이름과 상관없이 실제 기판에 맞춘다
    if(/^model1/i.test(board)) x.console='model1'; else if(/^model2/i.test(board)) x.console='model2';
    n++;
  }
  if(n) log(`sm2-emu 게임 목록으로 Model 1·2 게임 ${fmtNum(n)}개의 제목을 맞췄어요`);
}

/* ---------- 컬렉션 ---------- */
function newCol(){ S.cols=S.cols||[]; let n=S.cols.length+1; while(S.cols.some(c=>c.name==='새 컬렉션 '+n)) n++;
  const c={id:'c'+Date.now().toString(36),name:'새 컬렉션 '+n,ids:[]}; S.cols.push(c); return c }

/* 열려 있는 케이스를 다른 판으로 바꾼다 */
function swapOpen(id){
  const r=S.roms.find(x=>x.id===id); if(!r||!$('.ov')) return;
  sourceEl(openId)?.classList.remove('out'); openId=id;
  const fl=$('.flyer'); fl.classList.remove('back','shut'); fl.innerHTML=caseHTML(r); sizeFlyer(r);
  $('.info').innerHTML=infoHTML(r); $('.hint').textContent=hintText(r); $('.ov').setAttribute('aria-label',r.title);
  requestAnimationFrame(()=>sourceEl(id)?.classList.add('out'));
  loadOpenExtras(r);
}

/* ---------- 케이스 뒷면: 스크린샷·타이틀 화면, 플레이 기록 ---------- */
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function shotHTML(path,label,cid){
  return `<figure class="shot">${path?`<img src="${esc(api.fileSrc(path))}" alt="${esc(label)}" draggable="false">`:`<div class="noshot">${consoleIcon(cid)}</div>`}<figcaption>${esc(label)}</figcaption></figure>`;
}
const fmtDate=(t,short)=>{ if(!t) return '—'; const d=new Date(t); const y=short?String(d.getFullYear()).slice(2):d.getFullYear(); return `${y}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}` };
function backCompact(){ return (+$('.flyer')?.dataset.h||999)<380 }
function metaLine(r){ const p=[r.year,genreKo(r.genre),r.dev||r.maker].filter(Boolean); return p.length||r.kor?`<div class="bmeta">${r.kor?'<span class="korb inl">한</span>':''}${p.map(esc).join(' · ')}</div>`:'' }
function historyHTML(r,n){
  const ss=[...(r.sessions||[])].reverse().slice(0,n);
  const longest=(r.sessions||[]).reduce((m,x)=>Math.max(m,x.s),0);
  const stat=(k,v)=>`<div><dt>${k}</dt><dd>${v}</dd></div>`;
  return `<dl class="bstats hist">
      ${stat('플레이',`${fmtNum(r.plays||0)}회`)}${stat('총 시간',fmtDur(r.playSeconds))}${stat('마지막',timeAgo(r.lastPlayed))}
      ${stat('처음',fmtDate(r.firstPlayed||(r.sessions?.[0]?.at),true))}${stat('가장 길게',longest?fmtDur(longest):'—')}${stat('평균',r.sessions?.length?fmtDur(Math.round(r.sessions.reduce((a,x)=>a+x.s,0)/r.sessions.length)):'—')}
    </dl>
    <div class="bsess"><b>최근 플레이</b>${ss.length?`<ol>${ss.map(x=>`<li><span>${fmtDate(x.at)}</span><span>${fmtDur(x.s)}</span></li>`).join('')}</ol>`:`<p>${r.plays?'이번 버전부터 플레이할 때마다 여기에 기록돼요':'아직 플레이하지 않았어요'}</p>`}</div>`;
}
function backHTML(r){
  const c=CONS[r.console]||UNKNOWN; const vs=versionsOf(r).length;
  const stat=(k,v)=>`<div><dt>${k}</dt><dd>${v}</dd></div>`;
  if(backCompact()) return `<div class="backcover compact" style="--band:${c.band}">
    <div class="bband"><span>${esc(c.short)}</span><span>${esc(c.name)}</span></div>
    <div class="btitle">${esc(r.title)}</div>
    ${metaLine(r)}
    ${historyHTML(r,3)}
    <div class="bfoot"><span class="barcode" aria-hidden="true"></span><span class="mono">${esc(r.region||'')}${vs>1?` · ${vs}개 판`:''}</span></div></div>`;
  return `<div class="backcover" style="--band:${c.band}">
    <div class="bband"><span>${esc(c.short)}</span><span>${esc(c.name)}</span></div>
    <div class="btitle">${esc(r.title)}${r.variant?`<small>${esc(r.variant)}</small>`:''}</div>
    ${metaLine(r)}
    <div class="shots">${shotHTML(r.titleShot,'타이틀 화면',r.console)}${shotHTML(r.snapShot,'게임 화면',r.console)}</div>
    <p class="shotnote" id="shotnote">${THUMB_SYS[r.console]?(r.shotTried&&!r.titleShot&&!r.snapShot?'스크린샷을 찾지 못했어요':(!r.shotTried?'스크린샷을 받는 중…':'')):''}</p>
    <dl class="bstats">
      ${stat('플레이',`${fmtNum(r.plays||0)}회`)}${stat('총 시간',fmtDur(r.playSeconds))}${stat('마지막',timeAgo(r.lastPlayed))}
      ${stat('지역',esc(r.region||'—'))}${stat('크기',fmtSize(r.size))}${stat(r.discs>1?'디스크':'판',r.discs>1?r.discs+'장':vs>1?vs+'개':'1개')}
    </dl>
    ${r.sessions?.length?`<div class="bsess"><b>최근 플레이</b><ol>${[...r.sessions].reverse().slice(0,2).map(x=>`<li><span>${fmtDate(x.at)}</span><span>${fmtDur(x.s)}</span></li>`).join('')}</ol></div>`:''}
    <div class="bfoot"><span class="barcode" aria-hidden="true"></span><span class="mono">${esc(r.id.toUpperCase())}</span></div>
  </div>`;
}
/* 뒷면의 최근 플레이 줄이 넘치면 넘치는 줄을 통째로 뺀다 */
function trimSessions(fl){ const b=fl.querySelector('.bsess'); if(!b) return; let li;
  while(b.scrollHeight>b.clientHeight+1&&(li=b.querySelectorAll('li')).length>1) li[li.length-1].remove() }
let shotBusy=0;
async function loadShots(r){
  if(r.shotTried||!THUMB_SYS[r.console]||!api.thumbFetch) return;
  const sys=THUMB_SYS[r.console]; let idx=null;
  try{ const l=await api.thumbIndex(sys,false); if(Array.isArray(l)) idx=thumbIndex(l) }catch(e){}
  const names=[...new Set([r.thumbName,...thumbNames(r,idx)].filter(Boolean))].slice(0,4);
  r.shotTried=Date.now();
  if(names.length){
    shotBusy++; const res=(await api.thumbFetch([{id:r.id,system:sys,names,folder:'Named_Titles',suffix:'.title'},{id:r.id,system:sys,names,folder:'Named_Snaps',suffix:'.snap'}]).catch(()=>null).finally(()=>shotBusy--))||[];
    for(const g of res){ if(!g.path) continue; if(g.path.endsWith('.title.png')) r.titleShot=g.path; else r.snapShot=g.path }
  }
  save();
}
let flipping=false;
async function flipCase(){
  const r=openId&&S.roms.find(x=>x.id===openId); const fl=$('.flyer'); if(!r||!fl||flipping) return;
  flipping=true; const toBack=!fl.classList.contains('back'); const quick=reduced();
  try{
    if(toBack){ fl.classList.add('shut'); if(!quick) await wait(ms(800)) }
    fl.style.transformOrigin='50% 50%';
    if(!quick) await fl.animate([{transform:'none'},{transform:'rotateY(90deg)'}],{duration:ms(200),easing:'ease-in'}).finished;
    if(toBack){ fl.innerHTML=backHTML(r); fl.classList.add('back'); trimSessions(fl) } else { fl.innerHTML=caseHTML(r); fl.classList.remove('back'); fl.classList.add('shut'); requestAnimationFrame(fitManual) }
    if(!quick) await fl.animate([{transform:'rotateY(-90deg)'},{transform:'none'}],{duration:ms(220),easing:'ease-out'}).finished;
    fl.style.transformOrigin='';
    if(!toBack){ void fl.offsetWidth; fl.classList.remove('shut') }
    const b=$('.info [data-act="flip"]'); if(b) b.textContent=toBack?'↺ 앞면':'↻ 뒷면';
  } finally { flipping=false }
  renderCouchBar();
  if(toBack&&!r.shotTried&&!backCompact()){ try{ await loadShots(r) }catch(e){} if(openId===r.id&&fl.classList.contains('back')){ fl.innerHTML=backHTML(r); trimSessions(fl) } }
}

/* ---------- 오늘의 게임: 지금 선반에서 무작위로 하나 꺼낸다 ---------- */
async function randomPick(){
  if(S.tab!=='lib'){ S.tab='lib'; render() }
  if(openId){ closeCase(); await wait(ms(1400)+50) }
  let list=visibleRoms(); const run=list.filter(r=>emuFor(r)&&!r.offline); if(run.length) list=run;
  if(S.settings.randUnplayed){ const u=list.filter(r=>!(r.plays||0)&&!(r.playSeconds||0)); if(u.length) list=u; else toast('안 해 본 게임이 없어서 전체에서 골랐어요') }
  if(!list.length){ toast('꺼낼 게임이 없어요'); return }
  const pick=list[Math.floor(Math.random()*list.length)];
  await revealRom(pick.id); const el=sourceEl(pick.id);
  if(el&&!reduced()){ el.classList.add('picked'); await wait(ms(700)); el.classList.remove('picked') }
  openCase(pick.id);
}
/* 가상 스크롤 선반에서 그 게임이 있는 줄로 스크롤 */
async function revealRom(id){
  if(!VL) return; const main=$('#main'), host=$('#vhost'); if(!host) return;
  const it=VL.items.find(x=>x.rom?x.rom.id===id:x.row.some(([r])=>r.id===id)); if(!it) return;
  const hostTop=host.getBoundingClientRect().top-main.getBoundingClientRect().top+main.scrollTop;
  const y=Math.max(0,hostTop+it.top-Math.max(80,(main.clientHeight-it.h)/2));
  if(Math.abs(main.scrollTop-y)>4){ main.scrollTo({top:y,behavior:reduced()?'auto':'smooth'}); await wait(reduced()?30:450) }
  updateVisible(true); sourceEl(id)?.focus({preventScroll:true});
}

/* ---------- 거실 모드 + 패드 ---------- */
let couch=false;
async function setCouch(on){
  couch=on; document.body.classList.toggle('couch',on);
  try{ await window.__TAURI__.window.getCurrentWindow().setFullscreen(on) }catch(e){ try{ on?await document.documentElement.requestFullscreen():document.fullscreenElement&&await document.exitFullscreen() }catch(_){} }
  if(on){ if(S.tab!=='lib'){ S.tab='lib' } if(S.view==='list') S.view='front'; render(); setTimeout(()=>{ updateVisible(true); focusFirstCase() },120);
    toast(padConnected()?'거실 모드 · Start 또는 Esc로 나가요':'거실 모드 · 패드를 연결하거나 방향키로 움직여요. Esc로 나가요') }
  else { render() }
  renderCouchBar();
}
function renderCouchBar(){
  let b=$('#couchbar'); if(!couch){ b?.remove(); return }
  if(!b){ b=document.createElement('div'); b.id='couchbar'; document.body.appendChild(b) }
  const r=openId&&S.roms.find(x=>x.id===openId);
  b.innerHTML=`<div class="cbname">${esc(filterName())}<small>${fmtNum(visibleRoms().length)}개</small></div><div class="cbkeys">${
    (r?[['A','실행'],['B','닫기'],['Y',$('.flyer.back')?'앞면':'뒷면'],['X','즐겨찾기'],['◀ ▶','다른 판']]:[['A','꺼내기'],['X','즐겨찾기'],['Y','오늘의 게임'],['LB RB','선반 바꾸기'],['Start','나가기']])
    .map(([k,l])=>`<span><kbd>${k}</kbd>${l}</span>`).join('')}</div>`;
}
function focusFirstCase(){
  const main=$('#main'); const mt=main.getBoundingClientRect().top;
  const el=[...document.querySelectorAll('#shelf .case, #shelf .row:not(.listhead)')].find(e=>e.getBoundingClientRect().bottom>mt+10);
  el?.focus(); return el;
}
function shelfList(){ const cn=counts(); return ['all','fav','recent',...(S.roms.some(r=>r.kor)?['kor']:[]),...(S.cols||[]).map(c=>'col:'+c.id),...CONSOLES.filter(c=>cn[c.id]).map(c=>c.id),...(cn.unknown?['unknown']:[])] }
function cycleShelf(d){
  const l=shelfList(); const i=Math.max(0,l.indexOf(S.filter)); S.filter=l[(i+d+l.length)%l.length]; save(); render(); $('#main').scrollTop=0;
  setTimeout(()=>{ updateVisible(true); focusFirstCase(); renderCouchBar() },60);
}
function navMove(key){
  const cur=document.activeElement;
  if(!cur?.matches('#shelf .case, #shelf .row')){ focusFirstCase(); return }
  cur.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
}
const padConnected=()=>[...(navigator.getGamepads?.()||[])].some(Boolean);
const PAD={prev:[],held:{},raf:0};
function padTick(){
  PAD.raf=0; const gp=[...(navigator.getGamepads?.()||[])].find(Boolean); if(!gp) return;
  PAD.raf=requestAnimationFrame(padTick);
  const b=gp.buttons.map(x=>x.pressed||x.value>.5); const ax=gp.axes||[];
  const dir={up:b[12]||ax[1]<-.55,down:b[13]||ax[1]>.55,left:b[14]||ax[0]<-.55,right:b[15]||ax[0]>.55};
  const now=performance.now(); const fire=[];
  b.forEach((p,i)=>{ if(p&&!PAD.prev[i]) fire.push(i) }); PAD.prev=b;
  for(const [k,on] of Object.entries(dir)){ const h=PAD.held[k]; if(!on){ delete PAD.held[k]; continue }
    if(!h){ PAD.held[k]={next:now+380}; fire.push(k) } else if(now>=h.next){ h.next=now+110; fire.push(k) } }
  // 게임이 실행 중이면 패드 입력은 에뮬레이터 몫이다
  if(!fire.length||runningIds.size||!document.hasFocus()) return;
  for(const f of fire) padAction(f);
}
function padAction(f){
  const alert=$('#alert'); if(alert&&!alert.hidden){ if(f===0||f===1) closeFail(); return }
  if(openId){
    if(f===0) return runGame(openId);
    if(f===1) return $('.flyer.back')?flipCase().then(renderCouchBar):closeCase();
    if(f===3) return flipCase().then(renderCouchBar);
    if(f===2){ const r=S.roms.find(x=>x.id===openId); if(r){ r.fav=!r.fav; save(); refreshLib(); refreshOpen(); toast(r.fav?'즐겨찾기에 넣었어요':'즐겨찾기에서 뺐어요') } return }
    if(f==='left'||f==='right'){ const r=S.roms.find(x=>x.id===openId); const vs=r?[...versionsOf(r)].sort(verCmp):[]; if(vs.length<2) return;
      const v=vs[(vs.indexOf(r)+(f==='right'?1:-1)+vs.length)%vs.length]; S.groupPick={...(S.groupPick||{}),[verKey(v)]:v.id}; save(); swapOpen(v.id); refreshLib(); toast(verLabel(v)); return }
    if(f==='up'||f==='down'){ const o=$('.ov'); o&&o.scrollBy({top:f==='down'?160:-160,behavior:'smooth'}) }
    return;
  }
  if(S.tab!=='lib'){ if(f===0||f===9){ S.tab='lib'; render() } return }
  if(f==='up') return navMove('ArrowUp'); if(f==='down') return navMove('ArrowDown');
  if(f==='left') return navMove('ArrowLeft'); if(f==='right') return navMove('ArrowRight');
  if(f===0){ const cur=document.activeElement; if(cur?.matches('#shelf [data-id]')) openCase(cur.dataset.id); else focusFirstCase(); return }
  if(f===2){ const cur=document.activeElement; const r=cur?.dataset?.id&&S.roms.find(x=>x.id===cur.dataset.id); if(r){ r.fav=!r.fav; save(); refreshLib(); toast(r.fav?'즐겨찾기에 넣었어요':'즐겨찾기에서 뺐어요'); setTimeout(()=>sourceEl(r.id)?.focus(),0) } return }
  if(f===3||f===8) return randomPick();
  if(f===4) return cycleShelf(-1); if(f===5) return cycleShelf(1);
  if(f===9) return setCouch(!couch);
  if(f===1&&couch) return setCouch(false);
}
window.addEventListener('gamepadconnected',e=>{ if(!PAD.raf) PAD.raf=requestAnimationFrame(padTick); toast(`패드 연결됨 · ${couch?'':'Start를 누르면 거실 모드예요'}`.replace(/ · $/,'')) });
setInterval(()=>{ if(!PAD.raf&&padConnected()) PAD.raf=requestAnimationFrame(padTick) },2000);

/* ---------- 실행 실패 알림: 로그에서 중요한 줄만 골라 보여 준다 ---------- */
const FAIL_KEY=/error|fail|fatal|exception|panic|abort|not found|cannot|can't|could not|couldn't|missing|invalid|must|unable|required|no such|denied|unsupported|crash|usage:/i;
function failHints(text,kind){
  const h=[];
  if(/must be provided|usage:|unknown (option|argument)|unrecognized (option|argument)|invalid (option|argument)/i.test(text)) h.push('에뮬레이터가 실행 인수를 알아듣지 못했어요. 에뮬레이터 탭에서 이 에뮬레이터의 실행 인수를 확인해 보세요.');
  if(/bios|firmware|prod\.keys|title\.keys|keys? (not found|missing)|syscard/i.test(text)) h.push('BIOS·펌웨어·키 파일이 없거나 위치가 다를 수 있어요. 에뮬레이터를 직접 켜서 설정을 확인해 보세요.');
  if(/vulkan|vk_|d3d1[12]|opengl|gpu|driver/i.test(text)&&FAIL_KEY.test(text)) h.push('그래픽 드라이버나 Vulkan 문제일 수 있어요. 그래픽 드라이버를 최신으로 올려 보세요.');
  if(/no such file|not found|cannot open|failed to (open|load)/i.test(text)) h.push('파일을 찾지 못했어요. 게임 파일이 옮겨졌다면 다시 스캔해 주세요.');
  if(kind==='fbneo'||kind==='mame') h.push('아케이드 롬셋은 에뮬레이터 버전과 롬셋 버전이 맞아야 실행돼요.');
  return h;
}
function pickLogLines(text){
  const lines=text.split(/\r?\n/).map(l=>l.replace(/\s+$/,'')).filter(l=>l.trim());
  if(lines.length<=14) return {key:[],tail:lines,total:lines.length};
  const key=[]; lines.forEach((l,i)=>{ if(key.length<6&&FAIL_KEY.test(l)) key.push(i) });
  const tailFrom=Math.max(0,lines.length-8);
  const keyLines=key.filter(i=>i<tailFrom).map(i=>lines[i]);
  if(!keyLines.length&&!FAIL_KEY.test(lines.slice(tailFrom).join('\n'))) keyLines.push(...lines.slice(0,3));
  return {key:keyLines,tail:lines.slice(tailFrom),total:lines.length};
}
async function showFail({rom,meta={},code,logPath,seconds,error}){
  let text='';
  if(logPath){ await new Promise(r=>setTimeout(r,250)); text=(await api.readText(logPath).catch(()=>null))||''; }
  const pk=pickLogLines(text); const hints=failHints(text+'\n'+(error||''),kindOf(meta.emuId));
  const line=l=>`<div class="${FAIL_KEY.test(l)?'hl':''}">${esc(l)}</div>`;
  const el=$('#alert');
  el.innerHTML=`<div class="alertbg" data-act="failclose"></div><div class="alertbox" role="alertdialog" aria-modal="true" aria-labelledby="failt">
    <h3 id="failt">${esc(meta.emu||'에뮬레이터')}가 게임을 열지 못했어요</h3>
    <p class="muted">${esc(rom.title)}${error?'':` · ${seconds!=null?(seconds<1?'1초도 안 돼서':fmtDur(seconds)+' 만에'):''} 종료 · 종료 코드 ${esc(String(code??'?'))}`}</p>
    ${hints.length?`<ul class="failhint">${hints.map(h=>`<li>${esc(h)}</li>`).join('')}</ul>`:''}
    ${error?`<pre class="faillog">${esc(error)}</pre>`:
      text.trim()?`<pre class="faillog">${pk.key.length?`${pk.key.map(line).join('')}<div class="gap">… ${fmtNum(pk.total-pk.key.length-pk.tail.length)}줄 생략 …</div>`:pk.total>pk.tail.length?`<div class="gap">… 앞 ${fmtNum(pk.total-pk.tail.length)}줄 생략 …</div>`:''}${pk.tail.map(line).join('')}</pre>`
      :'<p class="note">에뮬레이터가 로그를 남기지 않았어요. 에뮬레이터를 직접 켜서 이 게임을 열어 보면 원인을 알 수 있어요.</p>'}
    ${meta.cmd?`<details class="failcmd"><summary>실행한 명령</summary><code class="mono">${esc(meta.cmd)}</code></details>`:''}
    <div class="actions">
      ${logPath?`<button class="btn sm" data-act="reveal" data-path="${esc(logPath)}">로그 파일 열기</button>`:''}
      ${meta.cmd?'<button class="btn sm" data-act="failcopy">명령 복사</button>':''}
      <button class="btn sm" data-act="failemu">실행 인수 고치기</button>
      <span style="flex:1"></span><button class="btn sm primary" data-act="failclose">닫기</button></div></div>`;
  el.hidden=false; el.dataset.cmd=meta.cmd||''; el.querySelector('.btn.primary').focus();
}
function closeFail(){const el=$('#alert'); if(el&&!el.hidden){el.hidden=true;el.innerHTML='';return true} return false}
async function addEmuManually(){
  const p=await api.pickExe(); if(!p)return;
  const base=basename(p).replace(/\.(exe|appimage)$/i,'');
  const key=Object.keys(EMUS).find(k=>EMUS[k].re.test(base));
  if(key==='retroarch'){
    const res=await api.scan([dirname(p)]);
    const cores=scanFiles(res.files.filter(f=>/_libretro\.(dll|so|dylib)$/i.test(f.path)).concat([{path:p,size:0}])).emus[0]?.cores||[];
    S.manualEmus=S.manualEmus.filter(e=>e.key!=='retroarch').concat([{key:'retroarch',name:'RetroArch',path:p,cores,manual:true}]);
    autoAssign(false); save(); render(); toast(`RetroArch를 추가했어요 (코어 ${cores.length}개)`); return;
  }
  if(key==='fbneo'||key==='bizhawk'){
    // 여러 콘솔을 돌리는 프로그램은 어느 콘솔에 쓸지 직접 고르게 한다
    const low=p.toLowerCase(); if(!S.customEmus.some(y=>y.path.toLowerCase()===low)) S.customEmus.push({key:'c'+hashStr(low).toString(36),name:EMUS[key].name,path:p,consoles:key==='fbneo'?['arcade']:[],custom:true,kind:key,cores:[]});
    autoAssign(false); save(); render(); toast(`${EMUS[key].name}를 추가했어요. 실행할 콘솔을 눌러 켜 주세요`); return;
  }
  if(key){
    S.manualEmus=S.manualEmus.filter(e=>e.key!==key).concat([{key,name:EMUS[key].name,path:p,cores:[],manual:true}]);
    autoAssign(false); save(); render(); toast(`${EMUS[key].name}를 추가했어요`); return;
  }
  // 이름으로 알 수 없는 프로그램: 직접 지정 에뮬레이터로 넣고 콘솔은 사용자가 고른다
  const e=await (async()=>{const low=p.toLowerCase();let x=S.customEmus.find(y=>y.path.toLowerCase()===low);
    if(!x){x={key:'c'+hashStr(low).toString(36),name:base,path:p,consoles:[],custom:true,kind:null,cores:[]};S.customEmus.push(x)} return x})();
  save(); render(); toast(`${e.name}를 추가했어요. 실행할 콘솔을 눌러 켜 주세요`);
}
async function assignPicked(cid){
  const e=await pickCustomFor(cid); if(!e){render();return null}
  S.map[cid]={id:e.key,auto:false}; save(); render(); toast(`${CONS[cid].name} → ${e.name}`); return e;
}

/* ===================== 이벤트 ===================== */
document.addEventListener('click',async e=>{
  // 꺼내 보기 화면에서 케이스·정보 창 밖의 빈 곳을 누르면 선반으로 돌아간다
  if(openId&&e.target.closest('.ov')&&!e.target.closest('.flyer, .info, .ovx')){closeCase();return}
  const t=e.target.closest('[data-tab],[data-f],[data-view],[data-act],[data-sort],[data-flt],[data-id]'); if(!t)return;
  if(t.dataset.tab){S.tab=t.dataset.tab;save();render();($('#main').scrollTop=0);return}
  if(t.dataset.f){S.filter=t.dataset.f;save();render();($('#main').scrollTop=0);return}
  if(t.dataset.view){S.view=t.dataset.view;save();render();return}
  if(t.dataset.sort){const k=t.dataset.sort; if(S.sort===k) S.sortDir=-(S.sortDir||SORT_DEFAULT_DIR[k]); else {S.sort=k; S.sortDir=SORT_DEFAULT_DIR[k]} save(); renderLib(); return}
  if(t.dataset.flt){const v=t.dataset.flt; const f=S.flt=S.flt||{};
    if(v.startsWith('region:')){const g=v.slice(7); f.regions=(f.regions||[]).includes(g)?f.regions.filter(x=>x!==g):[...(f.regions||[]),g]}
    else if(v.startsWith('genres:')||v.startsWith('decades:')){ const i=v.indexOf(':'); const k=v.slice(0,i), g=v.slice(i+1); f[k]=(f[k]||[]).includes(g)?f[k].filter(x=>x!==g):[...(f[k]||[]),g] }
    else { f[v]=!f[v]; if(v==='played'&&f.played) f.unplayed=false; if(v==='unplayed'&&f.unplayed) f.played=false; if(v==='covered'&&f.covered) f.nocover=false; if(v==='nocover'&&f.nocover) f.covered=false; }
    save(); renderLib(); return}
  const act=t.dataset.act; let rom=openId&&S.roms.find(x=>x.id===openId);
  switch(act){
    case 'add': return addFolders();
    case 'rescan': return rescan();
    case 'sample': return loadSample();
    case 'addemu': return addEmuManually();
    case 'pickfor': return assignPicked(t.dataset.c);
    case 'reveal': return api.reveal(t.dataset.path);
    case 'rmroot': S.roots=S.roots.filter(r=>r!==t.dataset.path); save(); renderScan(); renderStats(); toast('폴더를 뺐어요. 다시 스캔하면 목록에서 정리돼요'); return;
    case 'rmemu': S.manualEmus=S.manualEmus.filter(x=>x.key!==t.dataset.key); S.customEmus=S.customEmus.filter(x=>x.key!==t.dataset.key); delete S.emuArgs[t.dataset.key]; autoAssign(false); save(); render(); return;
    case 'ctog': {const em=S.customEmus.find(x=>x.key===t.dataset.key); if(!em)return; const c=t.dataset.c;
      em.consoles=em.consoles.includes(c)?em.consoles.filter(x=>x!==c):[...em.consoles,c];
      if(em.consoles.includes(c)&&!S.map[c]?.id) S.map[c]={id:em.key,auto:false};
      autoAssign(false); save(); render(); return;}
    case 'crepath': {const em=S.customEmus.find(x=>x.key===t.dataset.key); const p=em&&await api.pickExe(); if(p){em.path=p;save();render()} return;}
    case 'epath': { const key=t.dataset.key; const p=await api.pickExe(); if(!p) return;
      const man=S.manualEmus.find(x=>x.key===key);
      if(man) man.path=p; else S.emuPath={...(S.emuPath||{}),[key]:p};
      save(); render(); toast('실행 파일을 바꿨어요. 다시 스캔해도 유지돼요'); return }
    case 'np2font': { const p=await api.pickFile('PC-98 기본 폰트 BMP 고르기','폰트 BMP',['bmp']); if(!p) return; S.settings.np2Font=p; save(); render(); toast('기본 폰트를 정했어요. 게임별로 정하지 않은 PC-98 게임에 써요'); return }
    case 'np2fontclear': delete S.settings.np2Font; save(); render(); return;
    case 'epathreset': { const o={...(S.emuPath||{})}; delete o[t.dataset.key]; S.emuPath=o; save(); render(); toast('자동으로 찾은 실행 파일로 되돌렸어요'); return }
    case 'argreset': delete S.emuArgs[t.dataset.key]; save(); render(); return;
    case 'reauto': autoAssign(true); save(); render(); toast('모든 콘솔을 자동 지정으로 되돌렸어요'); return;
    case 'clear':
      if(t.dataset.armed){const keep={settings:S.settings,ch:S.ch,view:S.view};S={...blank(),...keep,tab:'scan'};log('진열장을 비웠어요','w');save();render();toast('진열장을 비웠어요')}
      else{t.dataset.armed='1';t.textContent='한 번 더 누르면 비워요';setTimeout(()=>{if(t.isConnected){delete t.dataset.armed;t.textContent='비우기'}},3000)}
      return;
    case 'close': return closeCase();
    case 'run': return openId&&runGame(openId);
    case 'stop': return openId&&api.stop(openId);
    case 'copycmd': if(rom){await api.copy(launchSpec(rom).display);toast('실행 명령을 복사했어요')} return;
    case 'excltree': return openExclTree();
    case 'failclose': closeFail(); return;
    case 'boxget': fetchBoxarts(); return;
    case 'boxretry': fetchBoxarts({retry:true}); return;
    case 'boxstop': boxBusy=false; api.thumbCancel?.(); renderBoxStatus(); return;
    case 'failcopy': api.copy($('#alert').dataset.cmd||''); toast('실행 명령을 복사했어요'); return;
    case 'failemu': closeFail(); if(openId) closeCase(); S.tab='emu'; save(); render(); return;
    case 'sortdir': S.sortDir=-(S.sortDir||SORT_DEFAULT_DIR[S.sort]||1); save(); renderLib(); return;
    case 'fltopen': S.fltOpen=!S.fltOpen; save(); renderLib(); return;
    case 'fltclear': S.flt={}; save(); renderLib(); return;
    case 'cdadd': case 'cdpick': {
      const cid=act==='cdadd'?$('#cdcons').value:t.dataset.c; const picked=await api.pickFolders(); if(!picked.length) return;
      const list=S.consoleDirs[cid]=S.consoleDirs[cid]||[];
      for(const p of picked) if(!list.some(x=>normDir(x.path)===normDir(p))) list.push({path:p,recursive:true});
      if(S.isSample) S.isSample=false; save(); render(); toast(`${CONS[cid].name} ROM 폴더를 지정했어요. 다시 스캔할게요`); await rescan(); return;}
    case 'cdrm': {const cid=t.dataset.c; S.consoleDirs[cid]=(S.consoleDirs[cid]||[]).filter(x=>x.path!==t.dataset.path); if(!S.consoleDirs[cid].length) delete S.consoleDirs[cid];
      save(); render(); toast('ROM 폴더를 뺐어요. 다시 스캔할게요'); await rescan(); return;}
    case 'xttoggle': {const p=t.dataset.path; const n=normDir(p); if(XT.open.has(n)) XT.open.delete(n); else { XT.open.add(n); renderExclTree(); await xtLoad(p); } renderExclTree(); return;}
    case 'xtclear': XT.checked.clear(); renderExclTree(); return;
    case 'xtcancel': XT=null; renderExclTree(); return;
    case 'xtapply': {
      const list=[...XT.checked.entries()].filter(([k])=>!xtAncestorChecked(k)).map(([,p])=>p);
      const changed=list.length!==(S.excludeDirs||[]).length||list.some(p=>!(S.excludeDirs||[]).includes(p));
      S.excludeDirs=list; XT=null; save(); renderScan();
      if(changed){ toast(`제외 폴더 ${list.length}개를 적용했어요. 다시 스캔할게요`); await rescan(); } else toast('바뀐 제외 폴더가 없어요');
      return;}
    case 'addexcl': {const picked=await api.pickFolders(); if(!picked.length)return; S.excludeDirs=S.excludeDirs||[];
      for(const p of picked) if(!S.excludeDirs.some(x=>normDir(x)===normDir(p))) S.excludeDirs.push(p);
      save(); renderScan(); toast('제외 폴더를 추가했어요. 다시 스캔해서 정리할게요'); await rescan(); return;}
    case 'rmexcl': {S.excludeDirs=(S.excludeDirs||[]).filter(x=>x!==t.dataset.path); save(); renderScan(); toast('제외 폴더를 뺐어요. 다시 스캔할게요'); await rescan(); return;}
    case 'addromdir': {const k=t.dataset.key; const picked=await api.pickFolders(); if(!picked.length)return;
      const list=S.emuRomDirs[k]=S.emuRomDirs[k]||[]; for(const p of picked) if(!list.some(x=>normDir(x)===normDir(p))) list.push(p);
      if(S.isSample){S.isSample=false} save(); render(); toast(`${optLabel(k)} ROM 폴더를 추가했어요. 스캔할게요`); await rescan(); return;}
    case 'rmromdir': {const k=t.dataset.key; S.emuRomDirs[k]=(S.emuRomDirs[k]||[]).filter(x=>x!==t.dataset.path); if(!S.emuRomDirs[k].length) delete S.emuRomDirs[k];
      save(); render(); toast('ROM 폴더를 뺐어요. 다시 스캔하면 반영돼요'); return;}
    case 'ipsclear': if(rom){rom.ips=[];save();refreshOpen()} return;
    case 'fbneoadd': if(rom) await fbneoAddPath(rom); return;
    case 'fav': if(rom){rom.fav=!rom.fav;save();refreshLib();refreshOpen()} return;
    case 'pickver': if(rom){ const v=S.roms.find(x=>x.id===t.dataset.id2); if(!v||v.id===rom.id) return; S.groupPick={...(S.groupPick||{}),[verKey(v)]:v.id}; save(); swapOpen(v.id); refreshLib(); } return;
    case 'coltog': if(rom){ const c=colOf(t.dataset.col); if(!c) return; c.ids=c.ids.includes(rom.id)?c.ids.filter(i=>i!==rom.id):[...c.ids,rom.id]; save(); refreshOpen(); renderSide(); if(S.filter==='col:'+c.id) renderShelf(); } return;
    case 'colnew': if(rom){ const c=newCol(); c.ids.push(rom.id); save(); refreshOpen(); renderSide(); toast(`'${c.name}' 컬렉션을 만들어 넣었어요. 왼쪽에서 이름을 바꿀 수 있어요`); } return;
    case 'coladd': { const c=newCol(); S.filter='col:'+c.id; save(); render(); setTimeout(()=>{const i=$('#colname'); i?.focus(); i?.select()},30); } return;
    case 'uncoverall': {
      const cid=t.dataset.c, n=+t.dataset.n;
      if(!t.dataset.armed){ t.dataset.armed='1'; t.textContent=`한 번 더 누르면 커버 ${fmtNum(n)}개를 되돌려요`; setTimeout(()=>{ if(t.isConnected){ delete t.dataset.armed; t.textContent=`직접 정한 커버 ${fmtNum(n)}개 되돌리기` } },3000); return }
      let k=0; for(const r of S.roms) if(r.console===cid&&r.cover){ delete r.cover; artCache?.delete?.(r.title); k++ }
      save(); render(); pruneSoon(1500); toast(`${CONS[cid]?.name||''} 커버 ${fmtNum(k)}개를 기본으로 되돌렸어요`); return }
    case 'iconall': {
      const cid=t.dataset.c; if(iconBusy){ toast('아이콘을 꺼내는 중이에요'); return }
      const all=!S.roms.some(r=>r.console===cid&&!r.icon);
      for(const r of S.roms) if(r.console===cid&&(all||!r.icon)){ delete r.icon; delete r.iconErr }
      t.disabled=true; t.textContent='아이콘을 꺼내는 중…';
      await extractRomIcons();
      const list=S.roms.filter(r=>r.console===cid); const ok=list.filter(r=>r.icon).length; const bad=list.filter(r=>!r.icon);
      render();
      toast(bad.length?`아이콘 ${fmtNum(ok)}개 · 못 꺼낸 ${fmtNum(bad.length)}개 (게임 정보 창에 이유가 나와요)`:`아이콘 ${fmtNum(ok)}개를 모두 꺼냈어요`); return }
    case 'coldel': {
      if(!t.dataset.armed){ t.dataset.armed='1'; t.textContent='한 번 더 누르면 지워요'; setTimeout(()=>{ if(t.isConnected){ delete t.dataset.armed; t.textContent='컬렉션 지우기' } },3000); return }
      const c=colOf(t.dataset.col); S.cols=(S.cols||[]).filter(x=>x.id!==t.dataset.col); S.filter='all'; save(); render(); toast(`'${c?.name||''}' 컬렉션을 지웠어요`); } return;
    case 'flip': return flipCase();
    case 'shelf': S.settings.shelf=t.dataset.s; applyShelf(); save(); renderScan(); toast(`테마: ${SHELVES[S.settings.shelf][0]}`); return;
    case 'statopen': { const id=t.dataset.id2; S.tab='lib'; S.filter='all'; S.q=''; save(); render(); setTimeout(async()=>{ await revealRom(id); openCase(id) },60); return }
    case 'nxkeys': { const p=await api.pickFile('prod.keys 고르기','키 파일',['keys']); if(!p) return; S.settings.nxKeys=p+''; NXKEYS=await api.switchKeys(nxKeyCandidates()).catch(()=>null);
      if(NXKEYS!==S.settings.nxKeys){ save(); renderScan(); toast('이 파일에서 header_key를 찾지 못했어요. prod.keys가 맞는지 확인해 주세요'); return }
      S.roms.forEach(r=>{ if((r.console==='switch'||r.console==='switch2')&&!r.icon) delete r.icon }); save(); renderScan(); toast('prod.keys를 지정했어요. 아이콘을 꺼내는 중…'); extractRomIcons(); return }
    case 'anim': S.settings.anim=t.dataset.a; applyAnim(); save(); renderScan(); toast(`케이스 애니메이션: ${ANIMS[S.settings.anim][0]}`); return;
    case 'coversearch': if(rom) openCoverSearch(rom); return;
    case 'csclose': closeFail(); return;
    case 'csfolder': CS.folder=t.dataset.f2; renderCoverSearch(true); return;
    case 'cspick': return csApply(csUrl(CS.sys,CS.folder,t.dataset.n));
    case 'csweb': api.openUrl(t.dataset.url).catch(e=>toast(String(e))); return;
    case 'csmode': if(t.dataset.m==='web'){ if(!CS.web) csWebRun(); else { CS.mode='web'; renderCoverSearch(true) } } else { CS.mode='lib'; renderCoverSearch(true) } return;
    case 'cswebpick': return csApplyWeb(+t.dataset.i);
    case 'csddg': CS.engine='ddg'; return csWebRun();
    case 'expand': { const k=t.dataset.k; EXPAND.has(k)?EXPAND.delete(k):EXPAND.add(k); renderShelf(); return }
    case 'random': return randomPick();
    case 'randtog': S.settings.randUnplayed=!S.settings.randUnplayed; save(); renderLib(); return;
    case 'onegtog': S.settings.oneG=S.settings.oneG===false; save(); renderSide(); renderLib(); toast(S.settings.oneG?'같은 게임의 지역판을 케이스 하나로 묶었어요':'지역판을 모두 따로 진열해요'); return;
    case 'couch': return setCouch(!couch);
    case 'rpup': { const p=[...(S.settings.regionPref||[])]; const i=p.indexOf(t.dataset.rg); if(i>0){ [p[i-1],p[i]]=[p[i],p[i-1]]; S.settings.regionPref=p; save(); renderScan(); } } return;
    case 'cover': if(!rom&&CS.rom&&!$('#alert').hidden) rom=CS.rom; if(rom){const p=await api.pickImage(rom.id); if(p){rom.cover=p+'';artCache.delete(rom.title);save();refreshLib();refreshOpen({rebuild:true})}} return;
    case 'iconretry': if(rom){ delete rom.icon; delete rom.iconErr; toast('아이콘을 꺼내는 중…'); await extractRomIcons(); refreshOpen({rebuild:true}); toast(rom.icon?'아이콘을 꺼냈어요':'아이콘을 꺼내지 못했어요') } return;
    case 'uncover': if(!rom&&CS.rom&&!$('#alert').hidden) rom=CS.rom; if(rom){ if(!$('#alert').hidden) closeFail(); delete rom.cover;save();refreshLib();refreshOpen({rebuild:true});pruneSoon(1500)} return;
  }
  if(t.dataset.id&&!act) openCase(t.dataset.id);
});
// 케이스 더블클릭: 첫 클릭에 케이스가 열리므로, 열린 직후의 두 번째 클릭이면 바로 실행
let openedAt=0;
document.addEventListener('dblclick',e=>{
  const t=e.target.closest('#shelf [data-id]');
  if(t){e.preventDefault();runGame(t.dataset.id);return}
  if(openId&&Date.now()-openedAt<800&&!e.target.closest('.info')){e.preventDefault();runGame(openId)}
});
let qT;
document.addEventListener('input',e=>{
  if(e.target.id==='q'){clearTimeout(qT);qT=setTimeout(()=>{S.q=e.target.value;save();renderShelf()},160)}
  if(e.target.id==='ch'){S.ch=+e.target.value;renderShelf();save()}
});
document.addEventListener('change',async e=>{
  const el=e.target; const rom=openId&&S.roms.find(x=>x.id===openId);
  if(el.id==='sort'){S.sort=el.value;S.sortDir=SORT_DEFAULT_DIR[el.value];save();renderLib()}
  if(el.dataset.map){
    const cid=el.dataset.map;
    if(el.value==='__pick'){await assignPicked(cid);return}
    S.map[cid]={id:el.value,auto:false};save();render();toast(`${CONS[cid].name} → ${optLabel(el.value)}`)}
  if(el.dataset.arg){const k=el.dataset.arg; const v=el.value.trim(); if(!v||v===defaultArgs(k))delete S.emuArgs[k]; else S.emuArgs[k]=v; save(); render(); toast(`${optLabel(k)} 실행 인수를 저장했어요`)}
  if(el.dataset.cname){const em=S.customEmus.find(x=>x.key===el.dataset.cname); if(em&&el.value.trim()){em.name=el.value.trim();save();render()}}
  if(el.id==='dcons'&&rom){rom.console=el.value;rom.consoleManual=true;delete rom.emu;save();render();refreshOpen({rebuild:true})}
  if(el.dataset.xt!==undefined&&XT){ const p=el.dataset.xt; const n=normDir(p); if(el.checked) XT.checked.set(n,p); else XT.checked.delete(n); renderExclTree(); return; }
  if(el.dataset.cdrec){ const x=(S.consoleDirs[el.dataset.cdrec]||[]).find(y=>y.path===el.dataset.path); if(x){ x.recursive=el.checked; save(); toast(el.checked?'하위 폴더까지 스캔해요. 다시 스캔할게요':'이 폴더 바로 안의 파일만 스캔해요. 다시 스캔할게요'); await rescan(); } return; }
  if(el.id==='dsys'&&rom){
    if(window.__pickingSys) return;
    if(el.value==='__add'){ window.__pickingSys=true;
      const p=await api.pickFile('System Card 파일 선택','PC엔진 System Card',['pce','bin','rom']);
      window.__pickingSys=false;
      if(p){ if(!S.syscards.some(x=>x.toLowerCase()===p.toLowerCase())) S.syscards.push(p); rom.syscard=p; }
    } else { if(el.value) rom.syscard=el.value; else delete rom.syscard; }
    save(); await syncSyscard(rom); refreshOpen(); refreshLib();
    toast(rom.syscard?`이 게임은 ${basename(rom.syscard)}로 실행해요`:'이 게임은 에뮬레이터 기본 System Card로 실행해요'); return;
  }
  if(el.dataset.bhpce!==undefined){ if(el.value) S.settings.bizhawkPce=el.value; else delete S.settings.bizhawkPce; save(); toast(el.value?`PC엔진 게임은 BizHawk의 ${el.value} 코어로 실행해요`:'BizHawk 설정 그대로 실행해요'); return }
  if(el.dataset.np2font!==undefined&&rom){
    let v=el.value;
    if(v==='@pick'){ const p=await api.pickFile('이 게임에 쓸 폰트 BMP 고르기','폰트 BMP',['bmp']); if(!p){ refreshOpen(); return } v=p }
    if(v) rom.np2Font=v; else delete rom.np2Font;
    save(); refreshOpen(); toast(v==='-'?'이 게임은 에뮬레이터 설정 그대로 실행해요':v?`이 게임은 ${basename(v)} 폰트로 실행해요`:'이 게임은 기본 폰트로 실행해요'); return }
  if((el.dataset.gp!==undefined||el.dataset.gpc!==undefined)&&rom){ await cemuApply(rom,+(el.dataset.gp??el.dataset.gpc)); return }
  if(el.dataset.ips!==undefined&&rom){
    const boxes=[...document.querySelectorAll('.info input[data-ips]')]; rom.ips=boxes.filter(b=>b.checked).map(b=>b.dataset.ips);
    save(); refreshOpen(); return;
  }
  if(el.id==='demu'&&rom){ setTimeout(()=>loadOpenExtras(rom),0);
    if(el.value==='__pick'){const em=await pickCustomFor(rom.console); if(em){rom.emu=em.key;autoAssign(false);toast(`이 게임은 ${em.name}로 실행해요`)} save(); refreshLib(); refreshOpen(); return}
    if(el.value)rom.emu=el.value;else delete rom.emu;save();refreshLib();refreshOpen()}
  if(el.id==='set-min'){S.settings.minimize=el.checked;save()}
  if(el.id==='set-ptags'){S.settings.priceTags=el.checked;save()}
  if(el.id==='set-identify'){S.settings.identify=el.checked;save(); if(el.checked) identifyRoms()}
  if(el.id==='colname'){ const c=colOf(S.filter.slice(4)); const v=el.value.trim(); if(c&&v){ c.name=v; save(); renderSide(); $('.h2')&&($('.h2').lastChild.textContent=v) } }
  if(el.id==='set-boxart'){S.settings.boxart=el.checked;save(); if(el.checked) fetchBoxarts()}
  if(el.id==='set-rescan'){S.settings.rescanOnStart=el.checked;save()}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&closeFail()) return;
  if(e.key==='Escape'&&openId){ if($('.flyer.back')) flipCase(); else closeCase(); return}
  if(e.key==='Escape'&&couch){setCouch(false);return}
  if(e.key==='F11'){e.preventDefault();setCouch(!couch);return}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();if(S.tab!=='lib'){S.tab='lib';render()}$('#q')?.focus();return}
  if(e.key==='F5'){e.preventDefault();rescan();return}
  const cur=document.activeElement;
  if(!openId&&cur?.matches('#shelf .row[data-id]')&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){
    const r=S.roms.find(x=>x.id===cur.dataset.id); if(r&&REPN.get(r.id)){ const k=verKey(r); if(e.key==='ArrowRight') EXPAND.add(k); else EXPAND.delete(k); const id=r.id; renderShelf(); setTimeout(()=>sourceEl(id)?.focus(),0); e.preventDefault() } return;
  }
  if(!openId&&cur?.matches('#shelf .row')&&(e.key==='ArrowDown'||e.key==='ArrowUp')){
    const rows=[...document.querySelectorAll('#shelf .row[data-id]')]; const n=rows[rows.indexOf(cur)+(e.key==='ArrowDown'?1:-1)];
    if(n){n.focus();n.scrollIntoView({block:'nearest'});e.preventDefault()} return;
  }
  if(openId||!cur?.matches('#shelf .case'))return;
  const all=[...document.querySelectorAll('#shelf .case')]; const i=all.indexOf(cur);
  if(e.key==='ArrowRight'&&all[i+1]){all[i+1].focus();e.preventDefault()}
  if(e.key==='ArrowLeft'&&all[i-1]){all[i-1].focus();e.preventDefault()}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    const r=cur.getBoundingClientRect(); const cx=r.left+r.width/2; const down=e.key==='ArrowDown';
    const rows=[...document.querySelectorAll('#shelf .srow')].sort((a,b)=>a.offsetTop-b.offsetTop); const ri=rows.indexOf(cur.closest('.srow'));
    const target=rows[ri+(down?1:-1)];
    if(!target&&!down){ $('#main').scrollBy({top:-200}); }
    if(target){const pick=[...target.querySelectorAll('.case')].sort((a,b)=>{const qa=a.getBoundingClientRect(),qb=b.getBoundingClientRect();return Math.abs(qa.left+qa.width/2-cx)-Math.abs(qb.left+qb.width/2-cx)})[0];
      if(pick){pick.focus();pick.scrollIntoView({block:'nearest'});e.preventDefault()}}
  }
});
$('#addBtn').addEventListener('click',addFolders);
$('#rescanBtn').addEventListener('click',()=>rescan());

let lastW=0, rT;
new ResizeObserver(()=>{const w=$('#main').clientWidth; if(Math.abs(w-lastW)<8)return; lastW=w; clearTimeout(rT); rT=setTimeout(()=>{if(S.tab==='lib')renderShelf()},80)}).observe($('#main'));
window.addEventListener('resize',()=>{updateVisible(true);const r=openId&&S.roms.find(x=>x.id===openId); if(r&&$('.flyer'))sizeFlyer(r)});

/* ===================== 시작 ===================== */
let dataInfo=null;
/* USB 등으로 옮겨 드라이브 문자가 바뀌면, 예전 드라이브에 있던 경로를 새 드라이브로 바꾼다 */
function remapDrive(obj,from,to){
  const re=new RegExp('^'+from.replace(':','')+':(?=[\\\\/])','i'); let n=0;
  const walk=o=>{ if(Array.isArray(o)){o.forEach((v,i)=>{ if(typeof v==='string'){ if(re.test(v)){o[i]=v.replace(re,to);n++} } else if(v&&typeof v==='object') walk(v) })}
    else for(const k of Object.keys(o)){ if(k==='log')continue; const v=o[k]; if(typeof v==='string'){ if(re.test(v)){o[k]=v.replace(re,to);n++} } else if(v&&typeof v==='object') walk(v) } };
  walk(obj); return n;
}
(async()=>{
  const saved=await api.load().catch(()=>null);
  S = saved&&saved.roms ? {...blank(),...saved,settings:{...blank().settings,...(saved.settings||{})}} : blank();
  dataInfo=await api.info().catch(()=>null);
  if(dataInfo?.version){ const lg=$('.logo'); if(lg&&!lg.querySelector('.ver')) lg.insertAdjacentHTML('beforeend',`<span class="ver" title="RetroShelf 버전">v${esc(dataInfo.version)}</span>`); document.title=`RetroShelf ${dataInfo.version}` }
  const drv=((dataInfo?.exe_path||'').match(/^[A-Za-z]:/)||[])[0];
  if(drv){
    if(S.homeDrive&&S.homeDrive.toUpperCase()!==drv.toUpperCase()){ const n=remapDrive(S,S.homeDrive,drv); if(n) log(`드라이브 문자가 ${S.homeDrive} → ${drv}로 바뀌어 경로 ${fmtNum(n)}개를 고쳤어요`,'a'); }
    S.homeDrive=drv.toUpperCase();
  }
  // 직접 지정한 실행 파일도 새로 알게 된 에뮬레이터(예: Kyty)면 그 실행 방식을 쓴다
  for(const e of S.customEmus){ if(!e.kind){ const k=detectKind(e.path); e.kind=k==='retroarch'?null:k; if(e.kind){ delete e.args; if(S.emuArgs[e.key]==='"{rom}"') delete S.emuArgs[e.key]; } } }
  if((S.boxartAlgo||0)<2){ S.roms.forEach(r=>{ if(!r.boxart) delete r.boxartTried }); S.boxartAlgo=2 }
  // Switch 게임이 있으면 지정해 둔 prod.keys를 바로 읽어 둔다 (아이콘을 다 꺼낸 뒤에도 설정 화면에 보이게)
  if(api.switchKeys&&S.roms.some(r=>r.console==='switch'||r.console==='switch2')) api.switchKeys(nxKeyCandidates()).then(p=>{ NXKEYS=p; if(S.tab==='scan') renderScan() }).catch(()=>{});
  applyAnim(); applyShelf(); render();
  // 웹 글꼴은 화면이 뜬 뒤에 불러온다 (인터넷이 없어도 시작이 늦어지지 않게)
  const fl=document.createElement('link'); fl.rel='stylesheet';
  fl.href='https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+KR:wght@400;500;600&display=swap';
  document.head.appendChild(fl);
  setTimeout(async()=>{
    // 아케이드 제목·원본 정보가 아직 없으면 채운다
    if(!S.settings.rescanOnStart&&S.roms.some(x=>x.console==='arcade'&&!x.arcName&&!x.folder)){ try{ await applyArcade(S.roms); VERS=null; save(); renderSide(); refreshLib() }catch(e){} }
    if(!S.settings.rescanOnStart&&S.roms.some(x=>(x.console==='model2'||x.console==='model1')&&!x.arcName)){ try{ await applySm2Db(S.roms); VERS=null; save(); renderSide(); refreshLib() }catch(e){} }
    await extractRomIcons(); if(!S.settings.rescanOnStart){ await identifyRoms({quiet:true}); if(S.settings.boxart!==false) await fetchBoxarts({quiet:true}); pruneSoon() }
  },800);
  if(scanRoots().length&&S.settings.rescanOnStart&&!S.isSample) setTimeout(()=>rescan({quiet:true}),300);
})();
