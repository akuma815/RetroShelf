// RetroShelf — Rust 쪽: 저장, 폴더 스캔, 에뮬레이터 실행, 대화상자
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod icons;
mod thumbs;
mod cemu;
mod arcade;
mod meta;
mod nxicon;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;

/* ---------------- 공통 ---------------- */
const INTERESTING: &[&str] = &[
    "nes", "fds", "unf", "sfc", "smc", "gb", "gbc", "gba", "n64", "z64", "v64", "nds", "md", "gen", "smd", "pce", "pbp",
    "gcm", "gcz", "rvz", "wbfs", "wad", "cso", "iso", "chd", "cue", "bin", "img", "zip", "7z", "m3u", "ccd", "mdf",
    "nsp", "xci", "nsz", "xcz", "nro", "nup", "xbe", "xex", "zar", "vpk", "sfo",
    "unif", "vb", "vboy", "3ds", "cci", "cxi", "cia", "3dsx", "zcci", "zcxi", "z3dsx", "wud", "wux", "wua", "rpx", "32x", "sms", "gg", "sg", "sc", "cdi", "gdi",
    "sgx", "ngp", "ngc", "ws", "wsc", "lnx", "a26", "a78", "mx1", "mx2", "rom", "dsk", "cas",
    "hdi", "fdi", "d88", "88d", "d98", "98d", "hdm", "nfd", "nhd", "thd", "fdd", "tfd",
    "exe", "dll", "so", "dylib", "appimage", "png", "jpg", "jpeg", "webp",
];
const SKIP_DIRS: &[&str] = &["$recycle.bin", "system volume information", "node_modules", ".git", "windows", "$windows.~bt", "$windows.~ws"];
const MAX_FILES: usize = 300_000;

/* 포터블: 설정·라이브러리·커버·로그를 실행 파일 옆 "RetroShelfData" 폴더에 둔다.
   그 폴더에 쓸 수 없을 때(예: Program Files)만 사용자 AppData를 쓴다. */
static DATA_DIR: OnceLock<(PathBuf, bool)> = OnceLock::new();

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(Path::to_path_buf)
}
fn writable(dir: &Path) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".write-test");
    let ok = fs::write(&probe, b"ok").is_ok();
    let _ = fs::remove_file(&probe);
    ok
}
/// 예전 버전이 AppData에 남긴 라이브러리를 실행 폴더로 옮긴다 (원본은 그대로 둔다)
fn migrate_from_appdata(appdata: &Path, portable: &Path) {
    let old = appdata.join("library.json");
    let new = portable.join("library.json");
    if new.exists() || !old.is_file() {
        return;
    }
    let Ok(mut text) = fs::read_to_string(&old) else { return };
    let old_covers = appdata.join("covers");
    let new_covers = portable.join("covers");
    if old_covers.is_dir() {
        let _ = fs::create_dir_all(&new_covers);
        if let Ok(rd) = fs::read_dir(&old_covers) {
            for e in rd.flatten() {
                let _ = fs::copy(e.path(), new_covers.join(e.file_name()));
            }
        }
        // 라이브러리 안의 커버 경로도 새 위치로 바꾼다 (JSON 문자열 안의 \\ 처리)
        let esc = |p: &Path| serde_json::to_string(&path_string(p)).unwrap_or_default().trim_matches('"').to_string();
        text = text.replace(&esc(&old_covers), &esc(&new_covers));
    }
    let _ = fs::write(&new, text);
}
fn resolve_data_dir(app: &AppHandle) -> (PathBuf, bool) {
    DATA_DIR
        .get_or_init(|| {
            let appdata = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir().join("RetroShelf"));
            if let Some(ed) = exe_dir() {
                let portable = ed.join("RetroShelfData");
                if writable(&portable) {
                    migrate_from_appdata(&appdata, &portable);
                    return (portable, true);
                }
            }
            let _ = fs::create_dir_all(&appdata);
            (appdata, false)
        })
        .clone()
}
fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = resolve_data_dir(app).0;
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}
fn path_string(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

/* ---------------- 저장 ---------------- */
#[tauri::command]
fn store_load(app: AppHandle) -> Option<Value> {
    let f = data_dir(&app).ok()?.join("library.json");
    let text = fs::read_to_string(f).ok()?;
    serde_json::from_str(&text).ok()
}

#[tauri::command]
fn store_save(app: AppHandle, data: Value) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let tmp = dir.join("library.json.tmp");
    fs::write(&tmp, serde_json::to_vec(&data).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dir.join("library.json")).map_err(|e| e.to_string())
}

/* 큰 라이브러리를 빠르게 주고받도록 JSON 문자열 그대로 읽고 쓴다 */
#[tauri::command]
fn store_load_text(app: AppHandle) -> Option<String> {
    fs::read_to_string(data_dir(&app).ok()?.join("library.json")).ok()
}

#[tauri::command]
async fn store_save_text(app: AppHandle, text: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let tmp = dir.join("library.json.tmp");
    fs::write(&tmp, text.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dir.join("library.json")).map_err(|e| e.to_string())
}

/* ---------------- 대화상자 ---------------- */
#[tauri::command]
async fn pick_folders(app: AppHandle) -> Vec<String> {
    app.dialog()
        .file()
        .set_title("스캔할 폴더 선택 (에뮬레이터·ROM 폴더)")
        .blocking_pick_folders()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|p| p.into_path().ok())
        .map(|p| path_string(&p))
        .collect()
}

#[tauri::command]
async fn pick_exe(app: AppHandle) -> Option<String> {
    let mut d = app.dialog().file().set_title("에뮬레이터 실행 파일 선택");
    if cfg!(windows) {
        d = d.add_filter("실행 파일", &["exe"]);
    }
    d.blocking_pick_file().and_then(|p| p.into_path().ok()).map(|p| path_string(&p))
}

#[tauri::command]
async fn pick_image(app: AppHandle, rom_id: String) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("커버 이미지 선택")
        .add_filter("이미지", &["png", "jpg", "jpeg", "webp"])
        .blocking_pick_file()
        .and_then(|p| p.into_path().ok());
    let Some(src) = picked else { return Ok(None) };
    let covers = data_dir(&app)?.join("covers");
    fs::create_dir_all(&covers).map_err(|e| e.to_string())?;
    let ext = src.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_else(|| "png".into());
    let safe: String = rom_id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect();
    // 같은 게임의 예전 커버는 지운다 (확장자가 다를 수 있음)
    for e in ["png", "jpg", "jpeg", "webp"] {
        let _ = fs::remove_file(covers.join(format!("{safe}.{e}")));
    }
    let dest = covers.join(format!("{safe}.{ext}"));
    fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(Some(path_string(&dest)))
}

/* ---------------- 스캔 ---------------- */
#[derive(Serialize, Clone)]
struct FileEntry {
    path: String,
    size: u64,
}
#[derive(Serialize)]
struct ScanResult {
    files: Vec<FileEntry>,
    missing: Vec<String>,
    dirs: usize,
    truncated: bool,
}
#[derive(Serialize, Clone)]
struct Progress {
    dirs: usize,
    files: usize,
    current: String,
}

fn norm_key(p: &Path) -> String {
    path_string(p).replace('\\', "/").trim_end_matches('/').to_lowercase()
}
fn walk(app: &AppHandle, dir: &Path, depth: usize, max_depth: usize, out: &mut Vec<FileEntry>, dirs: &mut usize, wanted: &HashSet<&str>, skip: &HashSet<String>) {
    if depth > max_depth || out.len() >= MAX_FILES {
        return;
    }
    let Ok(rd) = fs::read_dir(dir) else { return };
    *dirs += 1;
    if *dirs % 40 == 0 {
        let _ = app.emit("scan:progress", Progress { dirs: *dirs, files: out.len(), current: path_string(dir) });
    }
    for entry in rd.flatten() {
        let Ok(ft) = entry.file_type() else { continue };
        let name = entry.file_name().to_string_lossy().to_lowercase();
        let full = entry.path();
        if ft.is_dir() {
            if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) || skip.contains(&norm_key(&full)) {
                continue;
            }
            if depth < max_depth {
                walk(app, &full, depth + 1, max_depth, out, dirs, wanted, skip);
            }
        } else if ft.is_file() {
            let ext = match name.rfind('.') {
                Some(i) if i > 0 => &name[i + 1..],
                _ => "",
            };
            // 확장자 없는 파일은 Linux/macOS의 실행 파일일 때만 의미가 있다
            if ext.is_empty() {
                if cfg!(windows) {
                    continue;
                }
            } else if !wanted.contains(ext) && !name.eq_ignore_ascii_case("param.json") {
                continue;
            }
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            out.push(FileEntry { path: path_string(&full), size });
            if out.len() >= MAX_FILES {
                return;
            }
        }
    }
}

#[tauri::command]
async fn scan(app: AppHandle, roots: Vec<String>, exclude: Option<Vec<String>>, shallow: Option<Vec<String>>, exts: Option<Vec<String>>) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // 기본 목록 + 화면 쪽 콘솔 정의의 확장자 (새 기종을 넣을 때 여기를 따로 고치지 않아도 되게)
        let extra: Vec<String> = exts.unwrap_or_default().into_iter().map(|e| e.to_ascii_lowercase()).collect();
        let mut wanted: HashSet<&str> = INTERESTING.iter().copied().collect();
        for e in &extra { wanted.insert(e.as_str()); }
        // 사용자가 지정한 예외 폴더 (그 아래 전체를 건너뛴다)
        let skip: HashSet<String> = exclude.unwrap_or_default().iter().map(|p| norm_key(Path::new(p))).collect();
        // 하위 폴더를 보지 않는 폴더 (그 폴더 바로 안의 파일만)
        let flat: HashSet<String> = shallow.unwrap_or_default().iter().map(|p| norm_key(Path::new(p))).collect();
        let mut files = Vec::new();
        let mut missing = Vec::new();
        let mut dirs = 0usize;
        for root in roots {
            let p = PathBuf::from(&root);
            if !p.is_dir() {
                missing.push(root);
                continue;
            }
            if skip.contains(&norm_key(&p)) {
                continue;
            }
            let max_depth = if flat.contains(&norm_key(&p)) { 0 } else { 12 };
            walk(&app, &p, 0, max_depth, &mut files, &mut dirs, &wanted, &skip);
        }
        let truncated = files.len() >= MAX_FILES;
        ScanResult { files, missing, dirs, truncated }
    })
    .await
    .map_err(|e| e.to_string())
}

/* 스캔 폴더 밖, 설치 프로그램이 까는 기본 위치의 에뮬레이터 (예: C:\Program Files\openMSX\openmsx.exe) */
const INSTALLED_EMUS: &[&str] = &[
    "openMSX\\openmsx.exe", "blueMSX\\blueMSX.exe",
    "Project64 3.0\\Project64.exe", "Project64 2.4\\Project64.exe", "simple64\\simple64-gui.exe", "RMG\\RMG.exe",
    "Dolphin\\Dolphin.exe", "Dolphin-x64\\Dolphin.exe", "PCSX2\\pcsx2-qt.exe", "PPSSPP\\PPSSPPWindows64.exe",
    "mGBA\\mGBA.exe", "melonDS\\melonDS.exe", "DuckStation\\duckstation-qt-x64-ReleaseLTCG.exe",
    "MAME\\mame.exe", "Stella\\Stella.exe", "Mednafen\\mednafen.exe", "Xenia\\xenia.exe",
];
#[tauri::command]
fn installed_emus() -> Vec<String> {
    let mut bases: Vec<PathBuf> = ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"].iter().filter_map(|k| std::env::var_os(k)).map(PathBuf::from).collect();
    if let Some(l) = std::env::var_os("LOCALAPPDATA") { let l = PathBuf::from(l); bases.push(l.join("Programs")); bases.push(l); }
    if let Some(d) = std::env::var_os("SystemDrive") { let mut s = d; s.push("\\"); bases.push(PathBuf::from(s)); }
    let mut out: Vec<String> = Vec::new();
    for b in &bases { for rel in INSTALLED_EMUS {
        let p = b.join(rel);
        if p.is_file() { let s = p.to_string_lossy().into_owned(); if !out.iter().any(|x| x.eq_ignore_ascii_case(&s)) { out.push(s) } }
    } }
    out
}
#[tauri::command]
fn exists(paths: Vec<String>) -> Vec<bool> {
    paths.iter().map(|p| Path::new(p).exists()).collect()
}

/* ---------------- 실행 ---------------- */
#[derive(Default)]
struct Running(Arc<Mutex<HashMap<String, Child>>>);

#[derive(Serialize, Clone)]
struct GameExit {
    id: String,
    seconds: u64,
    code: Option<i32>,
    log: String,
}

#[tauri::command]
fn launch(
    app: AppHandle,
    running: State<'_, Running>,
    id: String,
    exe: String,
    args: Vec<String>,
    cwd: Option<String>,
    minimize: bool,
) -> Result<u32, String> {
    let map = running.0.clone();
    if map.lock().unwrap().contains_key(&id) {
        return Err("이미 실행 중이에요.".into());
    }
    let exe_path = PathBuf::from(&exe);
    if !exe_path.is_file() {
        return Err(format!("에뮬레이터 파일을 찾을 수 없어요: {exe}"));
    }
    let dir = cwd.map(PathBuf::from).filter(|d| d.is_dir()).or_else(|| exe_path.parent().map(Path::to_path_buf));
    // 에뮬레이터가 남기는 출력은 로그 파일로 모은다 (바로 꺼질 때 원인 확인용)
    let log_dir = data_dir(&app)?.join("logs");
    let _ = fs::create_dir_all(&log_dir);
    let stem = exe_path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "emulator".into());
    let log_path = log_dir.join(format!("{stem}.log"));
    let mut cmd = Command::new(&exe_path);
    cmd.args(&args).stdin(Stdio::null());
    match fs::File::create(&log_path) {
        Ok(f) => {
            let f2 = f.try_clone().ok();
            cmd.stdout(f);
            match f2 { Some(f2) => { cmd.stderr(f2); } None => { cmd.stderr(Stdio::null()); } }
        }
        Err(_) => { cmd.stdout(Stdio::null()).stderr(Stdio::null()); }
    }
    if let Some(d) = dir {
        cmd.current_dir(d);
    }
    let child = cmd.spawn().map_err(|e| format!("실행하지 못했어요: {e}"))?;
    let log_str = path_string(&log_path);
    let pid = child.id();
    map.lock().unwrap().insert(id.clone(), child);

    if minimize {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.minimize();
        }
    }

    // 끝날 때까지 지켜보다가 플레이 시간을 알려준다
    let started = Instant::now();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(500));
        let mut guard = map.lock().unwrap();
        let Some(child) = guard.get_mut(&id) else { break };
        match child.try_wait() {
            Ok(None) => continue,
            result => {
                let code = result.ok().flatten().and_then(|s| s.code());
                guard.remove(&id);
                drop(guard);
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
                let _ = app.emit("game:exit", GameExit { id: id.clone(), seconds: started.elapsed().as_secs(), code, log: log_str.clone() });
                break;
            }
        }
    });
    Ok(pid)
}

#[tauri::command]
fn stop(running: State<'_, Running>, id: String) -> bool {
    if let Some(child) = running.0.lock().unwrap().get_mut(&id) {
        return child.kill().is_ok();
    }
    false
}

/* ---------------- 에뮬레이터 설정 파일 (읽기, FBNeo ROM 경로 추가) ---------------- */
#[tauri::command]
fn read_text(path: String) -> Option<String> {
    let p = PathBuf::from(&path);
    let meta = fs::metadata(&p).ok()?;
    if !meta.is_file() || meta.len() > 2_000_000 {
        return None;
    }
    let bytes = fs::read(&p).ok()?;
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

/// .ini 파일만 고친다. 고치기 전에 같은 폴더에 .bak 사본을 남긴다.
#[tauri::command]
fn write_ini(path: String, text: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let is_ini = p.extension().map(|e| e.eq_ignore_ascii_case("ini")).unwrap_or(false);
    if !is_ini {
        return Err("ini 파일만 고칠 수 있어요.".into());
    }
    if p.is_file() {
        let bak = p.with_extension("ini.bak");
        fs::copy(&p, &bak).map_err(|e| e.to_string())?;
    }
    fs::write(&p, text.as_bytes()).map_err(|e| e.to_string())
}

/// Mednafen 게임별 설정(pgconfig/*.cfg)만 쓴다. 빈 내용이면 지운다.
/// RetroShelf가 만들지 않은 파일을 처음 고칠 때는 .cfg.bak 사본을 남긴다.
#[tauri::command]
fn write_pgconfig(path: String, text: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let in_pg = p.parent().and_then(|d| d.file_name()).map(|n| n.to_string_lossy().eq_ignore_ascii_case("pgconfig")).unwrap_or(false);
    let is_cfg = p.extension().map(|e| e.eq_ignore_ascii_case("cfg")).unwrap_or(false);
    if !in_pg || !is_cfg {
        return Err("Mednafen 게임별 설정 파일만 고칠 수 있어요.".into());
    }
    if let Ok(old) = fs::read_to_string(&p) {
        if !old.contains("RetroShelf") {
            let _ = fs::copy(&p, p.with_extension("cfg.bak"));
        }
    }
    if text.trim().is_empty() {
        if p.exists() {
            fs::remove_file(&p).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    if let Some(d) = p.parent() {
        fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    fs::write(&p, text.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn pick_file(app: AppHandle, title: String, name: String, exts: Vec<String>) -> Option<String> {
    let ext_refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
    let mut d = app.dialog().file().set_title(title);
    if !ext_refs.is_empty() {
        d = d.add_filter(name, &ext_refs);
    }
    d.blocking_pick_file().and_then(|p| p.into_path().ok()).map(|p| path_string(&p))
}

/// BizHawk config.ini(JSON)의 FirmwareUserSpecifications[key] 를 바꾸고 이전 값을 돌려준다.
/// value가 None이면 항목을 지운다(원래 없던 경우 되돌리기). 처음 고칠 때 config.ini.bak 사본을 남긴다.
#[tauri::command]
fn bizhawk_firmware(exe: String, key: String, value: Option<String>) -> Result<Option<String>, String> {
    let dir = Path::new(&exe).parent().ok_or("BizHawk 폴더를 찾지 못했어요.")?;
    let cfg = dir.join("config.ini");
    let text = fs::read_to_string(&cfg).map_err(|_| "BizHawk 설정 파일(config.ini)이 없어요. BizHawk를 한 번 직접 켰다 끈 뒤 다시 시도해 주세요.".to_string())?;
    let mut v: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|e| format!("BizHawk 설정 파일을 읽지 못했어요: {e}"))?;
    let root = v.as_object_mut().ok_or("BizHawk 설정 파일 형식이 예상과 달라요.")?;
    let specs = root
        .entry("FirmwareUserSpecifications")
        .or_insert_with(|| Value::Object(Default::default()));
    if !specs.is_object() {
        *specs = Value::Object(Default::default());
    }
    let map = specs.as_object_mut().unwrap();
    let prev = map.get(&key).and_then(|x| x.as_str()).map(|s| s.to_string());
    match value {
        Some(p) => { map.insert(key, Value::String(p)); }
        None => { map.remove(&key); }
    }
    let bak = dir.join("config.ini.bak");
    if !bak.exists() {
        let _ = fs::copy(&cfg, &bak);
    }
    let out = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
    fs::write(&cfg, out).map_err(|e| e.to_string())?;
    Ok(prev)
}

/* BizHawk 코어 고르기: config.ini의 PreferredCores {"PCE":"TurboNyma", …} 를 적는다. 값이 같으면 손대지 않는다 */
#[tauri::command]
fn bizhawk_cores(exe: String, pairs: Vec<(String, String)>) -> Result<bool, String> {
    let dir = Path::new(&exe).parent().ok_or("BizHawk 폴더를 찾지 못했어요.")?;
    let cfg = dir.join("config.ini");
    let text = fs::read_to_string(&cfg).map_err(|_| "BizHawk 설정 파일(config.ini)이 없어요. BizHawk를 한 번 직접 켰다 끈 뒤 다시 시도해 주세요.".to_string())?;
    let mut v: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|e| format!("BizHawk 설정 파일을 읽지 못했어요: {e}"))?;
    let root = v.as_object_mut().ok_or("BizHawk 설정 파일 형식이 예상과 달라요.")?;
    let pc = root.entry("PreferredCores").or_insert_with(|| Value::Object(Default::default()));
    if !pc.is_object() { *pc = Value::Object(Default::default()); }
    let map = pc.as_object_mut().unwrap();
    let mut changed = false;
    for (sys, core) in pairs {
        if map.get(&sys).and_then(|x| x.as_str()) != Some(core.as_str()) { map.insert(sys, Value::String(core)); changed = true; }
    }
    if !changed { return Ok(false) }
    let bak = dir.join("config.ini.bak");
    if !bak.exists() { let _ = fs::copy(&cfg, &bak); }
    fs::write(&cfg, serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(true)
}

#[derive(Serialize)]
struct DirEntryInfo {
    path: String,
    name: String,
    has_children: bool,
}
/// 한 폴더의 하위 폴더 목록 (제외 폴더 트리용). 숨김·시스템 폴더는 뺀다.
#[tauri::command]
async fn list_dirs(dir: String) -> Vec<DirEntryInfo> {
    tauri::async_runtime::spawn_blocking(move || {
        let is_visible = |name: &str| {
            let n = name.to_lowercase();
            !(n.starts_with('.') || n.starts_with('$') || SKIP_DIRS.contains(&n.as_str()))
        };
        let Ok(rd) = fs::read_dir(&dir) else { return vec![] };
        let mut out: Vec<DirEntryInfo> = rd
            .flatten()
            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .filter(|e| is_visible(&e.file_name().to_string_lossy()))
            .map(|e| {
                let p = e.path();
                let has_children = fs::read_dir(&p)
                    .map(|r| r.flatten().take(400).any(|c| c.file_type().map(|t| t.is_dir()).unwrap_or(false) && is_visible(&c.file_name().to_string_lossy())))
                    .unwrap_or(false);
                DirEntryInfo { name: e.file_name().to_string_lossy().into_owned(), path: path_string(&p), has_children }
            })
            .collect();
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        out
    })
    .await
    .unwrap_or_default()
}

#[derive(Deserialize)]
struct IconJob {
    id: String,
    path: String,
    kind: String,
}
/// 롬 파일 안의 타이틀 이미지를 꺼내 RetroShelfData/icons/<id>.png 로 저장 (이미 있으면 그대로 사용)
/* 아이콘 실패 표시(.none)에 적는 판 번호. 추출 코드를 고치면 올려서 예전 실패를 다시 시도하게 한다 */
const ICON_MISS_TAG: &[u8] = b"v2";
#[tauri::command]
async fn extract_icons(app: AppHandle, jobs: Vec<IconJob>) -> Vec<Option<String>> {
    let Ok(dir) = data_dir(&app).map(|d| d.join("icons")) else { return vec![] };
    let _ = fs::create_dir_all(&dir);
    tauri::async_runtime::spawn_blocking(move || {
        jobs.iter()
            .map(|j| {
                let safe: String = j.id.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
                let out = dir.join(format!("{safe}.png"));
                let jpg = dir.join(format!("{safe}.jpg"));
                let miss = dir.join(format!("{safe}.none"));
                if out.is_file() {
                    return Some(path_string(&out));
                }
                if jpg.is_file() {
                    return Some(path_string(&jpg));
                }
                if j.kind != "nx" && fs::read(&miss).map(|b| b == ICON_MISS_TAG).unwrap_or(false) {
                    return None;
                }
                // Switch: 키가 없으면 실패 표시를 남기지 않고 빈 값("")으로 알려 나중에 다시 시도한다
                let got = if j.kind == "nx" {
                    match nxicon::icon_switch(Path::new(&j.path)) {
                        Ok(v) => Some(v),
                        Err(nxicon::NxFail::NoKeys) => return Some("!".into()),
                        Err(nxicon::NxFail::Key(k)) => return Some(format!("!{k}")),
                        Err(nxicon::NxFail::Why(w)) => return Some(format!("?{w}")),
                    }
                } else {
                    icons::extract(Path::new(&j.path), &j.kind)
                };
                let out = if got.as_ref().map(|b| b.starts_with(&[0xFF, 0xD8])).unwrap_or(false) { jpg } else { out };
                match got {
                    Some(bytes) if fs::write(&out, &bytes).is_ok() => Some(path_string(&out)),
                    _ => {
                        if j.kind != "nx" { let _ = fs::write(&miss, ICON_MISS_TAG); } else { let _ = fs::remove_file(&miss); }
                        None
                    }
                }
            })
            .collect()
    })
    .await
    .unwrap_or_default()
}

/// 한 폴더 안의 특정 확장자 파일 목록 (하위 폴더는 보지 않음). TeknoParrot 프로필, FBNeo IPS 목록용
#[tauri::command]
fn list_files(dir: String, ext: String) -> Vec<FileEntry> {
    let want = ext.to_lowercase();
    let Ok(rd) = fs::read_dir(&dir) else { return vec![] };
    let mut out: Vec<FileEntry> = rd
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter(|e| e.path().extension().map(|x| x.to_string_lossy().to_lowercase() == want).unwrap_or(false))
        .map(|e| FileEntry { path: path_string(&e.path()), size: e.metadata().map(|m| m.len()).unwrap_or(0) })
        .collect();
    out.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    out
}

/* ---------------- 기타 ---------------- */
#[tauri::command]
fn copy(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
fn reveal(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        Command::new("explorer").raw_arg(format!("/select,\"{path}\"")).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg("-R").arg(&path).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let p = Path::new(&path);
        let target = if p.is_dir() { p } else { p.parent().unwrap_or(p) };
        Command::new("xdg-open").arg(target).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Serialize)]
struct Info {
    version: String,
    platform: String,
    data_file: String,
    data_dir: String,
    portable: bool,
    exe_path: String,
    roaming: String,
    documents: String,
}
#[tauri::command]
fn info(app: AppHandle) -> Info {
    let (dir, portable) = resolve_data_dir(&app);
    Info {
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS.into(),
        data_file: path_string(&dir.join("library.json")),
        data_dir: path_string(&dir),
        portable,
        exe_path: std::env::current_exe().map(|p| path_string(&p)).unwrap_or_default(),
        roaming: std::env::var("APPDATA").unwrap_or_default(),
        documents: app.path().document_dir().map(|p| path_string(&p)).unwrap_or_default(),
    }
}

/* ---------------- param.sfo 에서 게임 제목 읽기 (PS3·PS4·PS5·PS Vita) ---------------- */
fn sfo_title(p: &Path) -> Option<String> {
    sfo_map(p)?.remove("TITLE").filter(|s| !s.is_empty())
}
/* param.sfo의 문자열 값 전부 (TITLE, CATEGORY, TITLE_ID ...) */
fn sfo_map(p: &Path) -> Option<std::collections::HashMap<String, String>> {
    let b = fs::read(p).ok()?;
    let mut m = std::collections::HashMap::new();
    if b.len() < 20 || &b[0..4] != b"\0PSF" {
        return None;
    }
    let u32le = |i: usize| -> Option<usize> { Some(u32::from_le_bytes(b.get(i..i + 4)?.try_into().ok()?) as usize) };
    let u16le = |i: usize| -> Option<usize> { Some(u16::from_le_bytes(b.get(i..i + 2)?.try_into().ok()?) as usize) };
    let key_table = u32le(8)?;
    let data_table = u32le(12)?;
    let count = u32le(16)?;
    for i in 0..count.min(256) {
        let e = 20 + i * 16;
        let key_off = u16le(e)?;
        let len = u32le(e + 4)?;
        let data_off = u32le(e + 12)?;
        let ks = key_table + key_off;
        let key_end = b.get(ks..)?.iter().position(|&c| c == 0)? + ks;
        let fmt = u16le(e + 2)?;
        if fmt == 0x0204 || fmt == 0x0004 {
            if let Some(d) = b.get(data_table + data_off..data_table + data_off + len) {
                let key = String::from_utf8_lossy(&b[ks..key_end]).to_string();
                let v = String::from_utf8_lossy(d).trim_end_matches('\0').replace(['\n', '\r'], " ").trim().to_string();
                m.insert(key, v);
            }
        }
    }
    Some(m)
}

/* PS4·PS5 게임 폴더의 정보: 제목과 종류(game / patch / addcont) */
#[derive(Serialize, Default)]
struct ParamInfo {
    title: Option<String>,
    category: Option<String>,
    title_id: Option<String>,
}
fn param_info(p: &Path) -> ParamInfo {
    let mut out = ParamInfo::default();
    let is_json = p.extension().map(|e| e.eq_ignore_ascii_case("json")).unwrap_or(false);
    if is_json {
        // PS5 sce_sys/param.json
        let Ok(text) = fs::read_to_string(p) else { return out };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(text.trim_start_matches('\u{feff}')) else { return out };
        let lp = &v["localizedParameters"];
        let lang = lp["defaultLanguage"].as_str().unwrap_or("en-US");
        let name = lp[lang]["titleName"].as_str().or_else(|| lp["en-US"]["titleName"].as_str())
            .or_else(|| lp.as_object().and_then(|o| o.values().find_map(|x| x["titleName"].as_str())));
        out.title = name.map(|s| s.replace(['\n', '\r'], " ").trim().to_string()).filter(|s| !s.is_empty());
        out.title_id = v["titleId"].as_str().map(String::from);
        // PS5 param.json에는 게임과 패치를 확실히 가를 항목이 없다 (본편에도 targetContentVersion·addcont가 있다).
        // 그래서 내용으로는 빼지 않고, 패치·DLC는 덤프 폴더 이름(-patch0, -ac 등)으로만 가른다
        out.category = Some("game".into());
    } else if let Some(mut m) = sfo_map(p) {
        out.title = m.remove("TITLE").filter(|s| !s.is_empty());
        out.title_id = m.remove("TITLE_ID");
        out.category = m.remove("CATEGORY").map(|c| match c.as_str() {
            "gp" | "gpd" | "gpc" | "gpe" => "patch".to_string(),
            "ac" => "addcont".to_string(),
            _ => "game".to_string(),
        });
    }
    out
}
#[tauri::command]
async fn param_infos(paths: Vec<String>) -> Vec<ParamInfo> {
    tauri::async_runtime::spawn_blocking(move || paths.iter().map(|p| param_info(Path::new(p))).collect())
        .await
        .unwrap_or_default()
}
#[tauri::command]
async fn sfo_titles(paths: Vec<String>) -> Vec<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || paths.iter().map(|p| sfo_title(Path::new(p))).collect())
        .await
        .unwrap_or_default()
}

/* 박스아트 받기 */
#[tauri::command]
async fn thumb_index(app: AppHandle, system: String, refresh: Option<bool>) -> Result<Vec<String>, String> {
    let dir = data_dir(&app)?.join("boxart");
    tauri::async_runtime::spawn_blocking(move || thumbs::index(&dir, &system, refresh.unwrap_or(false))).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn thumb_fetch(app: AppHandle, jobs: Vec<thumbs::Job>) -> Result<Vec<thumbs::Got>, String> {
    let dir = data_dir(&app)?.join("boxart");
    tauri::async_runtime::spawn_blocking(move || thumbs::fetch(&app, &dir, jobs)).await.map_err(|e| e.to_string())
}
#[tauri::command]
async fn arcade_db(app: AppHandle, mame: Option<String>, refresh: Option<bool>) -> Result<Vec<[String; 5]>, String> {
    let dir = data_dir(&app)?.join("arcade");
    tauri::async_runtime::spawn_blocking(move || arcade::db(&dir, mame, refresh.unwrap_or(false))).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn fetch_image(app: AppHandle, url: String, id: String) -> Result<String, String> {
    let dir = data_dir(&app)?.join("boxart");
    tauri::async_runtime::spawn_blocking(move || thumbs::fetch_image(&dir, &url, &id)).await.map_err(|e| e.to_string())?
}
/* 기본 브라우저로 주소 열기 (https만) */
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") { return Err("https 주소만 열 수 있어요".into()) }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        Command::new("rundll32").args(["url.dll,FileProtocolHandler", &url]).creation_flags(0x0800_0000).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    { Command::new("open").arg(&url).spawn().map_err(|e| e.to_string())?; }
    #[cfg(all(unix, not(target_os = "macos")))]
    { Command::new("xdg-open").arg(&url).spawn().map_err(|e| e.to_string())?; }
    Ok(())
}
#[tauri::command]
async fn meta_db(app: AppHandle, system: String, refresh: Option<bool>) -> Result<Vec<meta::Row>, String> {
    let dir = data_dir(&app)?.join("meta");
    tauri::async_runtime::spawn_blocking(move || meta::db(&dir, &system, refresh.unwrap_or(false))).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn crc_files(app: AppHandle, paths: Vec<String>) -> Result<Vec<Option<meta::Crc>>, String> {
    let dir = data_dir(&app)?.join("meta");
    tauri::async_runtime::spawn_blocking(move || meta::crcs(&app, &dir, paths)).await.map_err(|e| e.to_string())
}
#[tauri::command]
fn crc_cancel() {
    meta::cancel();
}
/* Switch prod.keys 후보 경로를 알려 준다. 읽은 파일 경로를 돌려준다 */
#[tauri::command]
fn switch_keys(paths: Vec<String>) -> Option<String> {
    nxicon::set_keys(&paths)
}
/* DuckDuckGo 이미지 검색을 앱 안의 숨은 브라우저 창으로 한다.
   직접 요청은 봇으로 보고 202를 돌려주는 일이 많아서, 진짜 브라우저(WebView2)가 페이지를 열고
   페이지가 부르는 i.js 결과를 가로채거나, 같은 출처에서 i.js를 직접 불러 받는다.
   결과는 https://retroshelf.invalid/r?d=… 로 이동하려는 것을 on_navigation에서 잡아 넘겨받는다. */
const DDG_JS: &str = r#"(function(){
 if(window.top!==window) return;
 if(!/(^|\.)duckduckgo\.com$|^127\.0\.0\.1$/.test(location.hostname)) return;
 var done=false;
 function send(d){ if(done) return; done=true; location.href='https://retroshelf.invalid/r?d='+encodeURIComponent(d) }
 function grab(u,t){ try{ if(!/\/i\.js\?/.test(u)||!t||t.indexOf('"results"')<0) return; var j=JSON.parse(t); if(!j.results||!j.results.length) return;
   send(JSON.stringify({results:j.results.slice(0,100).map(function(x){return {thumbnail:x.thumbnail,image:x.image,title:x.title,width:x.width,height:x.height}})})) }catch(e){} }
 var of=window.fetch; if(of) window.fetch=function(a){ var u=String(a&&a.url||a); return of.apply(this,arguments).then(function(r){ try{ if(/\/i\.js\?/.test(u)) r.clone().text().then(function(t){grab(u,t)}) }catch(e){} return r }) };
 var oo=XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open=function(m,u){ var x=this; x.addEventListener('load',function(){ try{ grab(String(u),x.responseText) }catch(e){} }); return oo.apply(this,arguments) };
 var tries=0;
 function own(wait){ if(done) return; var h=document.documentElement.innerHTML;
   var m=h.match(/vqd\s*[=:]\s*["']([\w-]+)["']/)||h.match(/vqd=([\w-]+)&/)||h.match(/"vqd":"([\w-]+)"/);
   if(!m){ if(wait<25) return setTimeout(function(){own(wait+1)},400); return send('ERR:페이지에서 토큰을 찾지 못함 ('+(document.title||location.hostname)+')') }
   var q=new URLSearchParams(location.search).get('q')||'';
   fetch('/i.js?o=json&q='+encodeURIComponent(q)+'&l=wt-wt&vqd='+encodeURIComponent(m[1])+'&p=1&f=,,,,,&ct=AT',{credentials:'include',headers:{'Accept':'application/json, text/javascript, */*; q=0.01'}})
    .then(function(r){ return r.text().then(function(t){ if(done) return; grab('/i.js?',t); if(done) return;
      if(++tries<3) setTimeout(function(){own(0)},1500); else send('ERR:브라우저 창에서도 이미지 결과 요청이 '+r.status+' 오류를 돌려줌') }) })
    .catch(function(e){ send('ERR:'+e) });
 }
 function start(){ setTimeout(function(){own(0)},2000) }
 if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();"#;
static DDG_SEQ: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
async fn ddg_webview(app: &AppHandle, q: &str) -> Result<Vec<thumbs::WebImg>, String> {
    let base = std::env::var("RS_DDG_BASE").unwrap_or_else(|_| "https://duckduckgo.com/".into());
    let url: tauri::Url = format!("{base}?q={}&iax=images&ia=images", thumbs::enc(q)).parse().map_err(|e| format!("{e}"))?;
    let label = format!("ddg{}", DDG_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed));
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let tx = Mutex::new(tx);
    let mut b = tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::External(url))
        .title("DuckDuckGo").visible(false).focused(false).skip_taskbar(true).inner_size(1280.0, 900.0)
        .initialization_script(DDG_JS)
        .on_navigation(move |u| {
            if u.host_str() == Some("retroshelf.invalid") {
                let d = u.query_pairs().find(|(k, _)| k == "d").map(|(_, v)| v.into_owned()).unwrap_or_default();
                if let Ok(t) = tx.lock() { let _ = t.send(d); }
                return false;
            }
            true
        });
    if let Ok(dir) = data_dir(app) { b = b.data_directory(dir.join("webview")); }
    let w = b.build().map_err(|e| format!("브라우저 창을 열지 못함: {e}"))?;
    let got = tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(25))).await.map_err(|e| e.to_string())?;
    let _ = w.destroy();
    let d = got.map_err(|_| "브라우저 창에서 25초 안에 결과가 오지 않음".to_string())?;
    if let Some(e) = d.strip_prefix("ERR:") { return Err(e.to_string()) }
    let v = thumbs::parse_ddg(&d).map_err(|e| format!("결과를 읽지 못함: {e}"))?;
    if v.is_empty() { return Err("결과가 0개".into()) }
    Ok(v)
}
/* 순서: 숨은 브라우저 창으로 DuckDuckGo → 직접 요청 DuckDuckGo → (engine이 "ddg"가 아니면) Bing */
#[tauri::command]
async fn web_images(app: AppHandle, query: String, engine: Option<String>) -> Result<thumbs::WebResult, String> {
    let e1 = match ddg_webview(&app, &query).await {
        Ok(v) => return Ok(thumbs::WebResult { items: v, source: "DuckDuckGo".into(), note: String::new() }),
        Err(e) => e,
    };
    let q = query.clone();
    let e2 = match tauri::async_runtime::spawn_blocking(move || thumbs::ddg(&q)).await.map_err(|e| e.to_string())? {
        Ok(v) => return Ok(thumbs::WebResult { items: v, source: "DuckDuckGo".into(), note: String::new() }),
        Err(e) => e,
    };
    let why = format!("DuckDuckGo: 브라우저 창 – {e1}; 직접 요청 – {e2}");
    if engine.as_deref() == Some("ddg") { return Err(why) }
    let q = query.clone();
    match tauri::async_runtime::spawn_blocking(move || thumbs::bing(&q)).await.map_err(|e| e.to_string())? {
        Ok(v) => Ok(thumbs::WebResult { items: v, source: "Bing".into(), note: why }),
        Err(e3) => Err(format!("{why} / Bing: {e3}")),
    }
}
#[tauri::command]
async fn cemu_packs(exe: String, rom: String) -> Result<cemu::Packs, String> {
    tauri::async_runtime::spawn_blocking(move || cemu::packs(&exe, &rom)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
fn cemu_set_pack(exe: String, file: String, enabled: bool, presets: Vec<(String, String)>) -> Result<(), String> {
    cemu::set_pack(&exe, &file, enabled, presets)
}
/* 어떤 게임도 쓰지 않는 그림 파일 지우기 (RetroShelfData의 boxart·covers·icons 바로 아래 그림만).
   keep: 게임들이 가리키는 그림 경로, ids: 남아 있는 게임 id (아이콘 실패 표시 .none 을 남길지 판단) */
#[tauri::command]
fn prune_images(app: AppHandle, keep: Vec<String>, ids: Vec<String>) -> Result<(u32, u64), String> {
    Ok(prune_dirs(&data_dir(&app)?, &keep, &ids))
}
fn prune_dirs(base: &Path, keep: &[String], ids: &[String]) -> (u32, u64) {
    // 데이터 폴더가 옮겨졌을 수 있으니 전체 경로가 아니라 '하위 폴더/파일 이름'으로 맞춘다
    let norm = |s: &str| { let s = s.replace('\\', "/").to_lowercase(); let mut it = s.rsplit('/'); let f = it.next().unwrap_or("").to_string(); format!("{}/{f}", it.next().unwrap_or("")) };
    let keep: std::collections::HashSet<String> = keep.iter().map(|k| norm(k)).collect();
    let safe: std::collections::HashSet<String> = ids.iter().map(|i| i.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_lowercase()).collect();
    let (mut n, mut bytes) = (0u32, 0u64);
    for sub in ["boxart", "covers", "icons"] {
        let Ok(rd) = fs::read_dir(base.join(sub)) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            let Ok(md) = e.metadata() else { continue };
            if !md.is_file() { continue }
            let ext = p.extension().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default();
            if ext == "none" {
                let stem = p.file_stem().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
                if safe.contains(&stem) { continue }
            } else if !["png", "jpg", "jpeg", "webp", "gif", "bmp"].contains(&ext.as_str()) { continue }
            else if keep.contains(&norm(&path_string(&p))) { continue }
            if fs::remove_file(&p).is_ok() { n += 1; bytes += md.len(); }
        }
    }
    (n, bytes)
}
#[cfg(test)]
mod prune_tests {
    use super::*;
    #[test]
    fn prune() {
        let d = std::env::temp_dir().join(format!("rs-prune-{}", std::process::id())); let _ = fs::remove_dir_all(&d);
        for s in ["boxart/_index", "covers", "icons"] { fs::create_dir_all(d.join(s)).unwrap(); }
        for f in ["boxart/aa.png", "boxart/bb.png", "boxart/aa.title.png", "boxart/aa.cover.123.jpg", "boxart/_index/x.json", "boxart/notes.txt", "covers/aa.png", "covers/zz.jpg", "icons/aa.png", "icons/aa.none", "icons/zz.none"] { fs::write(d.join(f), b"x").unwrap(); }
        let keep = vec![path_string(&d.join("boxart/aa.png")).replace('/', "\\"), path_string(&d.join("BOXART/aa.title.png")), path_string(&d.join("boxart/aa.cover.123.jpg")), path_string(&d.join("icons/aa.png"))];
        let (n, _) = prune_dirs(&d, &keep, &["aa".into()]);
        let left: Vec<String> = ["boxart/aa.png", "boxart/bb.png", "boxart/aa.title.png", "boxart/aa.cover.123.jpg", "boxart/_index/x.json", "boxart/notes.txt", "covers/aa.png", "covers/zz.jpg", "icons/aa.png", "icons/aa.none", "icons/zz.none"].iter().filter(|f| d.join(f).exists()).map(|s| s.to_string()).collect();
        println!("{n} {left:?}");
        assert_eq!(left, ["boxart/aa.png", "boxart/aa.title.png", "boxart/aa.cover.123.jpg", "boxart/_index/x.json", "boxart/notes.txt", "icons/aa.png", "icons/aa.none"]);
    }
}
/* ---------- Neko Project ini ----------
   np2는 명령줄 인자를 모두 FDD로 넣는다. 하드디스크 이미지·폰트는 exe 옆 ini(np21x64w.exe → np21x64w.ini)에 적어야 한다.
   ini는 GetPrivateProfileString으로 시스템 코드 페이지(ANSI)로 읽히므로 값을 ANSI로 바꿔 적는다. */
#[cfg(windows)]
fn to_ansi(s: &str) -> Option<Vec<u8>> {
    use windows_sys::Win32::Globalization::{WideCharToMultiByte, CP_ACP};
    if s.is_ascii() { return Some(s.as_bytes().to_vec()) }
    let w: Vec<u16> = s.encode_utf16().collect();
    unsafe {
        let mut used = 0i32;
        let n = WideCharToMultiByte(CP_ACP, 0, w.as_ptr(), w.len() as i32, std::ptr::null_mut(), 0, std::ptr::null(), &mut used);
        if n <= 0 || used != 0 { return None }
        let mut out = vec![0u8; n as usize];
        WideCharToMultiByte(CP_ACP, 0, w.as_ptr(), w.len() as i32, out.as_mut_ptr(), n, std::ptr::null(), &mut used);
        if used != 0 { None } else { Some(out) }
    }
}
#[cfg(windows)]
fn from_ansi(b: &[u8]) -> String {
    use windows_sys::Win32::Globalization::{MultiByteToWideChar, CP_ACP};
    if b.is_ascii() || b.is_empty() { return String::from_utf8_lossy(b).into_owned() }
    unsafe {
        let n = MultiByteToWideChar(CP_ACP, 0, b.as_ptr(), b.len() as i32, std::ptr::null_mut(), 0);
        if n <= 0 { return String::from_utf8_lossy(b).into_owned() }
        let mut w = vec![0u16; n as usize];
        MultiByteToWideChar(CP_ACP, 0, b.as_ptr(), b.len() as i32, w.as_mut_ptr(), n);
        String::from_utf16_lossy(&w)
    }
}
#[cfg(not(windows))]
fn to_ansi(s: &str) -> Option<Vec<u8>> { Some(s.as_bytes().to_vec()) }
#[cfg(not(windows))]
fn from_ansi(b: &[u8]) -> String { String::from_utf8_lossy(b).into_owned() }

fn np2_ini_path(exe: &Path) -> (PathBuf, String) {
    let stem = exe.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "np2".into());
    (exe.parent().unwrap_or(Path::new(".")).join(format!("{stem}.ini")), stem)
}
/* 키=값 여러 개를 적는다. 돌려주는 값: 각 키의 원래 값 (없던 키면 None) */
fn np2_ini_write(exe: &Path, pairs: &[(String, String)]) -> Result<Vec<Option<String>>, String> {
    let (ini, stem) = np2_ini_path(exe);
    let old = fs::read(&ini).unwrap_or_default();
    let crlf = old.is_empty() || old.windows(2).any(|w| w == b"\r\n");
    let nl: &[u8] = if crlf { b"\r\n" } else { b"\n" };
    let mut lines: Vec<Vec<u8>> = if old.is_empty() { vec![] } else { old.split(|&b| b == b'\n').map(|l| l.strip_suffix(b"\r").unwrap_or(l).to_vec()).collect() };
    let mut prevs = Vec::new();
    for (k, v) in pairs {
        let val = to_ansi(v).ok_or_else(|| format!("이 Windows 언어 설정으로는 ini에 적을 수 없는 글자가 있어요: {v}"))?;
        let line = [k.as_bytes(), b"=", &val].concat();
        let pos = lines.iter().position(|l| { let key: Vec<u8> = l.iter().take_while(|&&c| c != b'=').copied().collect(); l.contains(&b'=') && String::from_utf8_lossy(&key).trim().eq_ignore_ascii_case(k) });
        match pos {
            Some(p) => { let kl = lines[p].iter().position(|&c| c == b'=').unwrap(); prevs.push(Some(from_ansi(&lines[p][kl + 1..]).trim().to_string())); lines[p] = line; }
            None => {
                prevs.push(None);
                // 첫 섹션 바로 아래에. 섹션이 없으면 만든다
                match lines.iter().position(|l| l.starts_with(b"[")) {
                    Some(s) => lines.insert(s + 1, line),
                    None => { let sec = if stem.to_ascii_lowercase().starts_with("np21") { "[NekoProject21]" } else { "[NekoProjectII]" }; lines.insert(0, sec.as_bytes().to_vec()); lines.insert(1, line); }
                }
            }
        }
    }
    let out = lines.join(nl);
    if out != old { fs::write(&ini, &out).map_err(|e| format!("{} 를 쓰지 못했어요: {e}", ini.display()))?; }
    Ok(prevs)
}
/* 값을 그대로 적는다 (하드디스크 이미지, 원래 값 되돌리기) */
#[tauri::command]
fn np2_ini_set(exe: String, pairs: Vec<(String, String)>) -> Result<Vec<Option<String>>, String> {
    np2_ini_write(Path::new(&exe), &pairs)
}
/* 폰트: 파일을 확인하고, ANSI로 못 적는 경로면 에뮬레이터 폴더에 영문 이름으로 복사해서 쓴다. raw=true면 값을 그대로 (되돌릴 때) */
#[tauri::command]
fn np2_set_font(exe: String, font: String, raw: Option<bool>) -> Result<(String, Option<String>), String> {
    let exe = Path::new(&exe); let dir = exe.parent().ok_or("실행 파일 경로가 이상해요")?;
    let raw = raw.unwrap_or(false);
    if !raw && !Path::new(&font).is_file() { return Err(format!("폰트 파일이 없어요: {font}")) }
    let mut val = font.clone();
    if !raw && to_ansi(&font).is_none() {
        let dst = dir.join("retroshelf_font.bmp");
        fs::copy(&font, &dst).map_err(|e| format!("폰트를 에뮬레이터 폴더로 복사하지 못했어요: {e}"))?;
        val = path_string(&dst);
        if to_ansi(&val).is_none() { val = "retroshelf_font.bmp".into(); }
    }
    let prev = np2_ini_write(exe, &[("fontfile".into(), val.clone())])?.pop().flatten();
    Ok((val, prev))
}
#[tauri::command]
fn thumb_cancel() {
    thumbs::cancel();
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Running::default())
        .invoke_handler(tauri::generate_handler![
            store_load, store_save, store_load_text, store_save_text, pick_folders, pick_exe, pick_image, scan, exists, launch, stop, copy, reveal, info, read_text, write_ini, sfo_titles, param_infos, list_files, write_pgconfig, pick_file, bizhawk_firmware, list_dirs, extract_icons, thumb_index, thumb_fetch, thumb_cancel, arcade_db, fetch_image, open_url, meta_db, crc_files, crc_cancel, switch_keys, web_images, installed_emus, cemu_packs, cemu_set_pack, prune_images, np2_set_font, np2_ini_set, bizhawk_cores
        ])
        .setup(|app| {
            // 창은 여기서 만든다: WebView 데이터(캐시 등)도 실행 폴더 쪽에 두기 위해
            let dir = data_dir(app.handle()).map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
                .title(format!("RetroShelf {}", app.package_info().version))
                .inner_size(1440.0, 920.0)
                .min_inner_size(960.0, 620.0)
                .center()
                .disable_drag_drop_handler()
                .data_directory(dir.join("webview"))
                .build()?;
            Ok(())
        })
        .on_window_event(|w, e| {
            // 메인 창을 닫으면 숨은 검색 창이 남아 있어도 끝낸다
            if w.label() == "main" { if let tauri::WindowEvent::Destroyed = e { w.app_handle().exit(0); } }
        })
        .run(tauri::generate_context!())
        .expect("RetroShelf를 시작하지 못했어요");
}
#[cfg(test)]
mod np2_tests {
    use super::*;
    #[test]
    fn font() {
        let d = std::env::temp_dir().join(format!("np2t-{}", std::process::id())); let _ = fs::remove_dir_all(&d); fs::create_dir_all(&d).unwrap();
        let exe = d.join("np21x64w.exe"); fs::write(&exe, b"").unwrap();
        let f1 = d.join("font.bmp"); fs::write(&f1, b"BM").unwrap();
        let f2 = d.join("한글폰트.bmp"); fs::write(&f2, b"BM").unwrap();
        // 1) ini 없음 → 섹션부터 만든다
        np2_set_font(path_string(&exe), path_string(&f1), None).unwrap();
        println!("{:?}", from_ansi(&fs::read(d.join("np21x64w.ini")).unwrap()));
        // 2) 기존 ini 값 바꾸기 (CRLF 유지, 다른 줄 그대로)
        fs::write(d.join("np21x64w.ini"), b"[NekoProject21]\r\nWindposx=10\r\nfontfile=C:\\old.bmp\r\nclk_mult=4\r\n").unwrap();
        let (v, prev) = np2_set_font(path_string(&exe), path_string(&f2), None).unwrap(); assert_eq!(prev.as_deref(), Some("C:\\old.bmp"));
        let t = from_ansi(&fs::read(d.join("np21x64w.ini")).unwrap()); println!("{v} {t:?}");
        assert!(t.contains("Windposx=10\r\n") && t.contains("clk_mult=4\r\n") && (t.contains("retroshelf_font.bmp") || t.contains(&v)) && !t.contains("old.bmp"));
        // 3) fontfile 줄이 없으면 첫 섹션 아래에
        fs::write(d.join("np21x64w.ini"), b"[NekoProject21]\r\nclk_mult=4\r\n").unwrap();
        np2_set_font(path_string(&exe), path_string(&f1), None).unwrap();
        let t = from_ansi(&fs::read(d.join("np21x64w.ini")).unwrap()); println!("{t:?}");
        assert!(t.starts_with("[NekoProject21]\r\nfontfile="));
        // 4) 원래 값으로 되돌리기 (빈 값 포함)
        np2_set_font(path_string(&exe), "".into(), Some(true)).unwrap();
        assert!(from_ansi(&fs::read(d.join("np21x64w.ini")).unwrap()).contains("fontfile=\r\n"));
        // 5) 하드디스크 키 여러 개: 없던 키는 None, 있던 키는 원래 값
        let p = np2_ini_write(&exe, &[("HDD1FILE".into(), "D:\\PC98\\rusty.hdi".into()), ("fontfile".into(), "".into())]).unwrap();
        assert_eq!(p, vec![None, Some("".into())]);
        let t = from_ansi(&fs::read(d.join("np21x64w.ini")).unwrap()); println!("{t:?}");
        assert!(t.contains("HDD1FILE=D:\\PC98\\rusty.hdi\r\n"));
    }
}
#[cfg(test)]
mod bizhawk_tests {
    use super::*;
    #[test]
    fn cores() {
        let d = std::env::temp_dir().join(format!("bh-{}", std::process::id())); let _ = fs::remove_dir_all(&d); fs::create_dir_all(&d).unwrap();
        fs::write(d.join("config.ini"), "\u{feff}{\n  \"PreferredCores\": {\n    \"NES\": \"QuickNes\",\n    \"PCE\": \"PCEHawk\"\n  },\n  \"Other\": 1\n}").unwrap();
        let exe = path_string(&d.join("EmuHawk.exe"));
        let pairs: Vec<(String, String)> = ["PCE", "PCECD", "SGX", "SGXCD"].iter().map(|k| (k.to_string(), "TurboNyma".to_string())).collect();
        assert!(bizhawk_cores(exe.clone(), pairs.clone()).unwrap());
        let v: Value = serde_json::from_str(&fs::read_to_string(d.join("config.ini")).unwrap()).unwrap();
        assert_eq!(v["PreferredCores"]["PCE"], "TurboNyma"); assert_eq!(v["PreferredCores"]["SGXCD"], "TurboNyma"); assert_eq!(v["PreferredCores"]["NES"], "QuickNes"); assert_eq!(v["Other"], 1);
        assert!(!bizhawk_cores(exe, pairs).unwrap()); // 같으면 안 고친다
    }
}
