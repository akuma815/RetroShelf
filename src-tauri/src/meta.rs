/* 게임 정보(libretro-database)와 파일 내용 확인(CRC32)
   - 시스템마다 No-Intro/Redump 목록과 장르·발매연도·개발사·유통사 목록을 받아 한 표로 합쳐 둔다
   - 카트리지 롬은 CRC32를 계산해 목록과 대조한다 (zip 안의 롬, 복사기 헤더도 처리) */
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use tauri::{AppHandle, Emitter};

const BASE: &str = "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat";
const DAYS: u64 = 30;

/* 한 줄: crc, 이름, 장르, 연도, 개발사, 유통사, 시리얼 */
pub type Row = [String; 7];

fn enc(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}

/* clrmamepro 형식을 낱말로 나눈다: ( ) "문자열" 낱말 */
fn tokens(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let b = s.as_bytes();
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        if c.is_ascii_whitespace() { i += 1; continue }
        if c == b'(' || c == b')' { out.push((c as char).to_string()); i += 1; continue }
        if c == b'"' {
            let st = i + 1;
            let mut j = st;
            while j < b.len() && b[j] != b'"' { j += 1 }
            out.push(String::from_utf8_lossy(&b[st..j.min(b.len())]).into_owned());
            i = j + 1;
            continue;
        }
        let st = i;
        while i < b.len() && !b[i].is_ascii_whitespace() && b[i] != b'(' && b[i] != b')' { i += 1 }
        out.push(String::from_utf8_lossy(&b[st..i]).into_owned());
    }
    out
}
/* game ( ... ) 마다 키·값과 rom 의 crc 목록 */
fn parse(s: &str) -> Vec<(HashMap<String, String>, Vec<String>)> {
    let t = tokens(s);
    let mut out = Vec::new();
    let mut i = 0;
    while i < t.len() {
        if (t[i] == "game" || t[i] == "machine") && t.get(i + 1).map(|x| x == "(").unwrap_or(false) {
            i += 2;
            let mut kv = HashMap::new();
            let mut crcs = Vec::new();
            let mut depth = 1;
            let mut in_rom = false;
            while i < t.len() && depth > 0 {
                match t[i].as_str() {
                    "(" => { depth += 1; i += 1; }
                    ")" => { depth -= 1; if depth == 1 { in_rom = false } i += 1; }
                    "rom" | "disk" if t.get(i + 1).map(|x| x == "(").unwrap_or(false) => { in_rom = true; i += 1; }
                    k => {
                        let v = t.get(i + 1).cloned().unwrap_or_default();
                        if v == "(" || v == ")" { i += 1; continue }
                        if in_rom { if k == "crc" { crcs.push(v.to_ascii_uppercase()) } if k == "serial" && !kv.contains_key("serial") { kv.insert("serial".into(), v.clone()); } }
                        else if depth == 1 { kv.entry(k.to_string()).or_insert(v); }
                        i += 2;
                    }
                }
            }
            out.push((kv, crcs));
        } else { i += 1 }
    }
    out
}

fn fresh(p: &Path) -> bool {
    fs::metadata(p).and_then(|m| m.modified()).ok().and_then(|t| SystemTime::now().duration_since(t).ok()).map(|d| d.as_secs() < DAYS * 86400).unwrap_or(false)
}
fn get(url: &str) -> Option<String> {
    crate::thumbs::get_text(url).ok().filter(|s| s.contains("game ("))
}

pub fn db(dir: &Path, system: &str, refresh: bool) -> Result<Vec<Row>, String> {
    let _ = fs::create_dir_all(dir);
    let file = dir.join(format!("{}.tsv", system.replace(' ', "_").replace(['/', '\\', ':'], "_")));
    let load = |f: &Path| -> Option<Vec<Row>> {
        let s = fs::read_to_string(f).ok()?;
        Some(s.lines().map(|l| { let mut it = l.split('\t').map(String::from); std::array::from_fn(|_| it.next().unwrap_or_default()) }).collect())
    };
    if !refresh && fresh(&file) { if let Some(v) = load(&file) { return Ok(v) } }
    let sys = enc(system);
    // 기본 목록: 카트리지는 No-Intro, 디스크는 Redump
    let main = get(&format!("{BASE}/no-intro/{sys}.dat")).or_else(|| get(&format!("{BASE}/redump/{sys}.dat")));
    let Some(main) = main else {
        return load(&file).ok_or_else(|| format!("{system} 목록을 받지 못했어요"));
    };
    // 이름 → 줄
    let mut rows: Vec<Row> = Vec::new();
    let mut by_name: HashMap<String, usize> = HashMap::new();
    let mut by_crc: HashMap<String, usize> = HashMap::new();
    for (kv, crcs) in parse(&main) {
        let name = kv.get("name").cloned().unwrap_or_default();
        if name.is_empty() { continue }
        let idx = rows.len();
        let crc = crcs.first().cloned().unwrap_or_default();
        rows.push([crc.clone(), name.clone(), String::new(), String::new(), String::new(), String::new(), kv.get("serial").cloned().unwrap_or_default()]);
        by_name.entry(name).or_insert(idx);
        for c in crcs { by_crc.entry(c).or_insert(idx); }
    }
    // 덧붙일 정보: 장르·연도·개발사·유통사 (crc 또는 comment 이름으로 맞춘다)
    for (col, kind) in [(2usize, "genre"), (3, "releaseyear"), (4, "developer"), (5, "publisher")] {
        let Some(txt) = get(&format!("{BASE}/{kind}/{sys}.dat")) else { continue };
        for (kv, crcs) in parse(&txt) {
            let Some(v) = kv.get(kind).cloned() else { continue };
            let idx = crcs.iter().find_map(|c| by_crc.get(c).copied())
                .or_else(|| kv.get("comment").or(kv.get("name")).and_then(|n| by_name.get(n).copied()));
            if let Some(i) = idx { if rows[i][col].is_empty() { rows[i][col] = v; } }
        }
    }
    let s: String = rows.iter().map(|r| r.iter().map(|x| x.replace(['\t', '\n', '\r'], " ")).collect::<Vec<_>>().join("\t") + "\n").collect();
    let _ = fs::write(&file, s);
    Ok(rows)
}

/* ---------- CRC32 ---------- */
#[derive(Serialize, Clone, Default)]
pub struct Crc {
    pub full: String,
    /* 헤더를 뺀 내용의 CRC (NES·FDS·Lynx·7800·SNES 복사기 헤더). 없으면 빈 값 */
    pub bare: String,
}
const MAX: u64 = 128 << 20;

fn header_len(name: &str, data: &[u8]) -> usize {
    let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    if data.starts_with(b"NES\x1a") || data.starts_with(b"FDS\x1a") { return 16 }
    if data.starts_with(b"LYNX") { return 64 }
    if data.len() > 10 && &data[1..10] == b"ATARI7800" { return 128 }
    if (ext == "smc" || ext == "sfc" || ext == "swc" || ext == "fig") && data.len() % 1024 == 512 { return 512 }
    0
}
fn crc_of(name: &str, data: &[u8]) -> Crc {
    let mut h = crc32fast::Hasher::new();
    h.update(data);
    let full = format!("{:08X}", h.finalize());
    let hl = header_len(name, data);
    let bare = if hl > 0 && data.len() > hl { let mut h = crc32fast::Hasher::new(); h.update(&data[hl..]); format!("{:08X}", h.finalize()) } else { String::new() };
    Crc { full, bare }
}
/* zip: 첫 번째 롬 파일을 풀어 CRC를 낸다 (저장 방식 0·8) */
fn zip_crc(path: &Path) -> Option<Crc> {
    if fs::metadata(path).ok()?.len() > MAX * 2 { return None }
    let b = fs::read(path).ok()?;
    let mut i = 0;
    while i + 30 <= b.len() && &b[i..i + 4] == b"PK\x03\x04" {
        let u16le = |o: usize| u16::from_le_bytes([b[o], b[o + 1]]) as usize;
        let u32le = |o: usize| u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]]) as usize;
        let flags = u16le(i + 6);
        let method = u16le(i + 8);
        let mut csize = u32le(i + 18);
        let nlen = u16le(i + 26);
        let xlen = u16le(i + 28);
        let name = String::from_utf8_lossy(b.get(i + 30..i + 30 + nlen)?).into_owned();
        let start = i + 30 + nlen + xlen;
        if flags & 8 != 0 && csize == 0 {
            // 크기가 뒤에 적힌 경우: 중앙 디렉터리에서 찾는다
            let cd = b.windows(4).rposition(|w| w == b"PK\x01\x02")?;
            csize = u32le(cd + 20);
        }
        let end = start.checked_add(csize)?;
        let raw = b.get(start..end)?;
        if name.ends_with('/') || name.to_ascii_lowercase().ends_with(".txt") || name.to_ascii_lowercase().ends_with(".nfo") { i = end; continue }
        let data = match method {
            0 => raw.to_vec(),
            8 => { let mut d = Vec::new(); flate2::read::DeflateDecoder::new(raw).take(MAX).read_to_end(&mut d).ok()?; d }
            _ => return None,
        };
        return Some(crc_of(&name, &data));
    }
    None
}
fn file_crc(path: &Path) -> Option<Crc> {
    let ext = path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    if ext == "zip" { return zip_crc(path) }
    if ext == "7z" || ext == "rar" { return None }
    let m = fs::metadata(path).ok()?;
    if m.len() > MAX || m.len() == 0 { return None }
    let data = fs::read(path).ok()?;
    Some(crc_of(&path.to_string_lossy(), &data))
}

static CANCEL: AtomicBool = AtomicBool::new(false);
pub fn cancel() { CANCEL.store(true, Ordering::SeqCst); }

#[derive(Serialize, Clone)]
struct Progress { done: usize, total: usize }

/* 여러 파일의 CRC. 결과는 경로·크기·수정 시각으로 기억해 두고 다음에는 다시 읽지 않는다 */
pub fn crcs(app: &AppHandle, dir: &Path, paths: Vec<String>) -> Vec<Option<Crc>> {
    CANCEL.store(false, Ordering::SeqCst);
    let _ = fs::create_dir_all(dir);
    let cache_file = dir.join("crc-cache.tsv");
    let mut cache: HashMap<String, (String, Crc)> = HashMap::new();
    if let Ok(s) = fs::read_to_string(&cache_file) {
        for l in s.lines() {
            let p: Vec<&str> = l.split('\t').collect();
            if p.len() >= 4 { cache.insert(p[0].to_string(), (p[1].to_string(), Crc { full: p[2].into(), bare: p[3].into() })); }
        }
    }
    let stamp = |p: &str| fs::metadata(p).ok().map(|m| format!("{}:{}", m.len(), m.modified().ok().and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0)));
    let total = paths.len();
    let out: Arc<Mutex<Vec<Option<Crc>>>> = Arc::new(Mutex::new(vec![None; total]));
    let todo: Arc<Mutex<Vec<(usize, String, String)>>> = Arc::new(Mutex::new(Vec::new()));
    for (i, p) in paths.iter().enumerate() {
        let Some(st) = stamp(p) else { continue };
        match cache.get(p) {
            Some((s, c)) if *s == st => out.lock().unwrap()[i] = Some(c.clone()),
            _ => todo.lock().unwrap().push((i, p.clone(), st)),
        }
    }
    let done = Arc::new(AtomicUsize::new(total - todo.lock().unwrap().len()));
    let fresh: Arc<Mutex<Vec<(String, String, Crc)>>> = Arc::new(Mutex::new(Vec::new()));
    let mut hs = Vec::new();
    for _ in 0..4 {
        let (todo, out, done, fresh, app) = (todo.clone(), out.clone(), done.clone(), fresh.clone(), app.clone());
        hs.push(std::thread::spawn(move || loop {
            if CANCEL.load(Ordering::SeqCst) { break }
            let Some((i, p, st)) = todo.lock().unwrap().pop() else { break };
            if let Some(c) = file_crc(Path::new(&p)) {
                fresh.lock().unwrap().push((p.clone(), st, c.clone()));
                out.lock().unwrap()[i] = Some(c);
            }
            let d = done.fetch_add(1, Ordering::SeqCst) + 1;
            if d % 20 == 0 || d == total { let _ = app.emit("crc:progress", Progress { done: d, total }); }
        }));
    }
    for h in hs { let _ = h.join(); }
    let fresh = Arc::try_unwrap(fresh).map(|m| m.into_inner().unwrap()).unwrap_or_default();
    if !fresh.is_empty() {
        for (p, st, c) in fresh { cache.insert(p, (st, c)); }
        let s: String = cache.iter().map(|(p, (st, c))| format!("{p}\t{st}\t{}\t{}\n", c.full, c.bare)).collect();
        let _ = fs::write(&cache_file, s);
    }
    Arc::try_unwrap(out).map(|m| m.into_inner().unwrap()).unwrap_or_default()
}
