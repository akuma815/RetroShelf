/* 박스아트 받기: libretro-thumbnails (thumbnails.libretro.com / GitHub) */
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter};

const UA: &str = concat!("RetroShelf/", env!("CARGO_PKG_VERSION"));
const INDEX_DAYS: u64 = 30;

pub fn agent() -> &'static ureq::Agent {
    static A: OnceLock<ureq::Agent> = OnceLock::new();
    A.get_or_init(|| {
        ureq::AgentBuilder::new()
            .user_agent(UA)
            .timeout_connect(Duration::from_secs(10))
            .timeout_read(Duration::from_secs(30))
            .try_proxy_from_env(true)
            .build()
    })
}

/* 주소 한 부분을 % 인코딩 */
pub fn enc(s: &str) -> String {
    let mut o = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
            o.push(b as char);
        } else {
            o.push_str(&format!("%{b:02X}"));
        }
    }
    o
}
fn dec(s: &str) -> String {
    let b = s.as_bytes();
    let mut o = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                o.push(v);
                i += 3;
                continue;
            }
        }
        o.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&o).replace("&amp;", "&").replace("&#39;", "'").replace("&quot;", "\"")
}

pub fn get_text(url: &str) -> Result<String, String> {
    let r = agent().get(url).call().map_err(|e| e.to_string())?;
    let mut s = String::new();
    r.into_reader().take(64 << 20).read_to_string(&mut s).map_err(|e| e.to_string())?;
    Ok(s)
}

/* 시스템 이름(예: "Nintendo - Nintendo Entertainment System")의 Named_Boxarts 파일 이름 목록 */
fn fetch_index(system: &str) -> Result<Vec<String>, String> {
    // 1) 공식 썸네일 서버의 폴더 목록
    let url = format!("https://thumbnails.libretro.com/{}/Named_Boxarts/", enc(system));
    if let Ok(html) = get_text(&url) {
        let mut out = Vec::new();
        for part in html.split("href=\"").skip(1) {
            let Some(end) = part.find('"') else { continue };
            let href = &part[..end];
            if href.to_ascii_lowercase().ends_with(".png") && !href.contains('/') {
                out.push(dec(&href[..href.len() - 4]));
            }
        }
        if !out.is_empty() {
            return Ok(out);
        }
    }
    // 2) GitHub 저장소 트리
    let repo = system.replace(' ', "_");
    let root = get_text(&format!("https://api.github.com/repos/libretro-thumbnails/{}/git/trees/master", enc(&repo)))?;
    let v: serde_json::Value = serde_json::from_str(&root).map_err(|e| e.to_string())?;
    let sha = v["tree"].as_array().and_then(|t| t.iter().find(|x| x["path"] == "Named_Boxarts")).and_then(|x| x["sha"].as_str())
        .ok_or("Named_Boxarts 폴더가 없어요")?.to_string();
    let t = get_text(&format!("https://api.github.com/repos/libretro-thumbnails/{}/git/trees/{}", enc(&repo), sha))?;
    let v: serde_json::Value = serde_json::from_str(&t).map_err(|e| e.to_string())?;
    Ok(v["tree"].as_array().map(|a| {
        a.iter().filter_map(|x| x["path"].as_str()).filter(|p| p.to_ascii_lowercase().ends_with(".png")).map(|p| p[..p.len() - 4].to_string()).collect()
    }).unwrap_or_default())
}

pub fn index(dir: &Path, system: &str, refresh: bool) -> Result<Vec<String>, String> {
    let idx = dir.join("_index");
    let _ = fs::create_dir_all(&idx);
    let file = idx.join(format!("{}.txt", system.replace(' ', "_").replace(['/', '\\', ':'], "_")));
    let fresh = fs::metadata(&file).and_then(|m| m.modified()).ok()
        .and_then(|t| SystemTime::now().duration_since(t).ok()).map(|d| d.as_secs() < INDEX_DAYS * 86400).unwrap_or(false);
    if fresh && !refresh {
        if let Ok(s) = fs::read_to_string(&file) {
            return Ok(s.lines().filter(|l| !l.is_empty()).map(String::from).collect());
        }
    }
    match fetch_index(system) {
        Ok(list) => {
            let _ = fs::write(&file, list.join("\n"));
            Ok(list)
        }
        // 인터넷이 안 될 때는 예전 목록이라도 쓴다
        Err(e) => fs::read_to_string(&file).map(|s| s.lines().filter(|l| !l.is_empty()).map(String::from).collect()).map_err(|_| e),
    }
}

#[derive(Deserialize, Clone)]
pub struct Job {
    pub id: String,
    pub system: String,
    pub names: Vec<String>,
    /* Named_Boxarts(기본) / Named_Snaps / Named_Titles */
    pub folder: Option<String>,
    /* 저장 파일 이름 뒤에 붙일 말 (예: ".snap") */
    pub suffix: Option<String>,
}
#[derive(Serialize, Clone)]
pub struct Got {
    pub id: String,
    pub path: Option<String>,
    pub name: Option<String>,
}
#[derive(Serialize, Clone)]
struct Progress {
    done: usize,
    total: usize,
    found: usize,
}

static CANCEL: AtomicBool = AtomicBool::new(false);
pub fn cancel() {
    CANCEL.store(true, Ordering::SeqCst);
}

// libretro 파일 이름 규칙: & * / : ` < > ? \ | " 는 _ 로 바뀐다
fn safe_name(n: &str) -> String {
    n.chars().map(|c| if "&*/:`<>?\\|\"".contains(c) { '_' } else { c }).collect()
}

fn download(system: &str, folder: &str, name: &str) -> Option<Vec<u8>> {
    let n = safe_name(name);
    let urls = [
        format!("https://raw.githubusercontent.com/libretro-thumbnails/{}/master/{}/{}.png", enc(&system.replace(' ', "_")), folder, enc(&n)),
        format!("https://thumbnails.libretro.com/{}/{}/{}.png", enc(system), folder, enc(&n)),
    ];
    for u in urls {
        match agent().get(&u).call() {
            Ok(r) => {
                let mut b = Vec::new();
                if r.into_reader().take(16 << 20).read_to_end(&mut b).is_ok() && b.len() > 8 && &b[1..4] == b"PNG" {
                    return Some(b);
                }
            }
            Err(ureq::Error::Status(404, _)) => continue,
            Err(_) => continue,
        }
    }
    None
}

pub fn fetch(app: &AppHandle, dir: &Path, jobs: Vec<Job>) -> Vec<Got> {
    CANCEL.store(false, Ordering::SeqCst);
    let _ = fs::create_dir_all(dir);
    let total = jobs.len();
    let queue = Arc::new(Mutex::new(jobs.into_iter().enumerate().collect::<Vec<_>>()));
    let out: Arc<Mutex<Vec<Option<Got>>>> = Arc::new(Mutex::new(vec![None; total]));
    let done = Arc::new(AtomicUsize::new(0));
    let found = Arc::new(AtomicUsize::new(0));
    let mut hs = Vec::new();
    for _ in 0..6 {
        let (queue, out, done, found, app, dir) = (queue.clone(), out.clone(), done.clone(), found.clone(), app.clone(), dir.to_path_buf());
        hs.push(std::thread::spawn(move || loop {
            if CANCEL.load(Ordering::SeqCst) {
                break;
            }
            let Some((i, job)) = queue.lock().unwrap().pop() else { break };
            let folder = match job.folder.as_deref() { Some(f @ ("Named_Snaps" | "Named_Titles")) => f, _ => "Named_Boxarts" };
            let suffix: String = job.suffix.clone().unwrap_or_default().chars().filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '_').collect();
            let file: PathBuf = dir.join(format!("{}{}.png", job.id, suffix));
            let mut got = Got { id: job.id.clone(), path: None, name: None };
            for n in &job.names {
                if let Some(b) = download(&job.system, folder, n) {
                    if fs::write(&file, &b).is_ok() {
                        got.path = Some(file.to_string_lossy().into_owned());
                        got.name = Some(n.clone());
                        found.fetch_add(1, Ordering::SeqCst);
                    }
                    break;
                }
            }
            out.lock().unwrap()[i] = Some(got);
            let d = done.fetch_add(1, Ordering::SeqCst) + 1;
            if d % 5 == 0 || d == total {
                let _ = app.emit("thumbs:progress", Progress { done: d, total, found: found.load(Ordering::SeqCst) });
            }
        }));
    }
    for h in hs {
        let _ = h.join();
    }
    let v = Arc::try_unwrap(out).map(|m| m.into_inner().unwrap()).unwrap_or_default();
    v.into_iter().flatten().collect()
}

/* 주소에서 그림 하나를 받아 boxart/<id>.cover.<확장자>로 저장 (사용자가 고른 커버) */
pub fn fetch_image(dir: &Path, url: &str, id: &str) -> Result<String, String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) { return Err("http(s) 주소만 쓸 수 있어요".into()) }
    let r = agent().get(url).set("User-Agent", BROWSER_UA).call().map_err(|e| match e { ureq::Error::Status(c, _) => format!("서버가 {c} 오류를 돌려줬어요"), e => e.to_string() })?;
    let mut b = Vec::new();
    r.into_reader().take(25 << 20).read_to_end(&mut b).map_err(|e| e.to_string())?;
    let ext = if b.starts_with(b"\x89PNG") { "png" } else if b.starts_with(&[0xFF, 0xD8, 0xFF]) { "jpg" } else if b.starts_with(b"GIF8") { "gif" }
        else if b.len() > 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" { "webp" } else if b.starts_with(b"BM") { "bmp" }
        else { return Err("그림 파일이 아니에요. 이미지 자체의 주소(…png, …jpg)를 넣어 주세요".into()) };
    let _ = fs::create_dir_all(dir);
    let id: String = id.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    // 예전에 고른 커버는 지운다. 파일 이름에 시각을 넣어 화면이 옛 그림을 기억하지 않게 한다
    if let Ok(rd) = fs::read_dir(dir) {
        let pre = format!("{id}.cover.");
        for e in rd.flatten() { if e.file_name().to_string_lossy().starts_with(&pre) { let _ = fs::remove_file(e.path()); } }
    }
    let stamp = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let file = dir.join(format!("{id}.cover.{stamp}.{ext}"));
    fs::write(&file, &b).map_err(|e| e.to_string())?;
    Ok(file.to_string_lossy().into_owned())
}

/* ---------- 웹 이미지 검색 (DuckDuckGo → 안 되면 Bing). 공식 API가 아니라서 바뀌면 멈출 수 있다 ---------- */
const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
#[derive(Serialize, Clone)]
pub struct WebImg {
    pub thumb: String,
    pub image: String,
    pub title: String,
    pub width: u32,
    pub height: u32,
    pub source: String,
}
fn browser_get(url: &str, referer: &str) -> Result<String, String> {
    let r = agent().get(url).set("User-Agent", BROWSER_UA).set("Referer", referer).set("Accept-Language", "ko-KR,ko;q=0.9,en;q=0.8")
        .call().map_err(|e| match e { ureq::Error::Status(c, _) => format!("{c}"), e => e.to_string() })?;
    let mut s = String::new();
    r.into_reader().take(8 << 20).read_to_string(&mut s).map_err(|e| e.to_string())?;
    Ok(s)
}
/* DuckDuckGo 전용 연결: 요청 사이에 쿠키를 유지하고, 윈도우에서는 윈도우 기본 TLS(SChannel)로 연결한다
   (rustls는 브라우저와 다른 연결 모양이라 막히는 일이 있다) */
fn ddg_agent() -> &'static ureq::Agent {
    static A: OnceLock<ureq::Agent> = OnceLock::new();
    A.get_or_init(|| {
        let b = ureq::AgentBuilder::new().user_agent(BROWSER_UA).timeout_connect(Duration::from_secs(10)).timeout_read(Duration::from_secs(20)).try_proxy_from_env(true).redirects(5);
        #[cfg(windows)]
        let b = match native_tls::TlsConnector::new() { Ok(c) => b.tls_connector(Arc::new(c)), Err(_) => b };
        b.build()
    })
}
/* 상태 코드와 본문을 함께 돌려준다 (오류 상태여도 이유를 보이려고) */
fn ddg_send(req: ureq::Request, form: Option<&[(&str, &str)]>) -> Result<(u16, String), String> {
    let res = match form { Some(f) => req.send_form(f), None => req.call() };
    let resp = match res { Ok(r) => r, Err(ureq::Error::Status(_, r)) => r, Err(e) => return Err(format!("연결 실패: {e}")) };
    let st = resp.status();
    let mut s = String::new();
    let _ = resp.into_reader().take(8 << 20).read_to_string(&mut s);
    Ok((st, s))
}
const PAGE_HEADERS: [(&str, &str); 6] = [("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"), ("Accept-Language", "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"),
    ("Sec-Fetch-Dest", "document"), ("Sec-Fetch-Mode", "navigate"), ("Sec-Fetch-Site", "none"), ("Upgrade-Insecure-Requests", "1")];
const JS_HEADERS: [(&str, &str); 8] = [("Accept", "*/*"), ("Accept-Language", "en-US,en;q=0.5"), ("Referer", "https://duckduckgo.com/"), ("Sec-GPC", "1"),
    ("Sec-Fetch-Dest", "empty"), ("Sec-Fetch-Mode", "cors"), ("Sec-Fetch-Site", "same-origin"), ("Priority", "u=4")];
fn with_headers(mut r: ureq::Request, h: &[(&str, &str)]) -> ureq::Request { for (k, v) in h { r = r.set(k, v); } r }

fn ddg_once(q: &str) -> Result<Vec<WebImg>, String> {
    let a = ddg_agent();
    let qe = enc(q);
    // 1) 토큰(vqd): 검색 페이지에서, 안 되면 POST로
    let (st, page) = ddg_send(with_headers(a.get(&format!("https://duckduckgo.com/?q={qe}")), &PAGE_HEADERS), None)?;
    let mut vqd = if st == 200 { parse_vqd(&page) } else { None };
    if vqd.is_none() {
        let (st2, page2) = ddg_send(with_headers(a.post("https://duckduckgo.com/"), &PAGE_HEADERS), Some(&[("q", q)]))?;
        vqd = if st2 == 200 { parse_vqd(&page2) } else { None };
        if vqd.is_none() {
            return Err(if st != 200 { format!("검색 페이지가 {st} 오류를 돌려줌") } else if st2 != 200 { format!("토큰 요청이 {st2} 오류를 돌려줌") } else { format!("검색 페이지에서 토큰을 찾지 못함 ({}KB)", page.len() / 1024) });
        }
    }
    let vqd = vqd.unwrap();
    // 2) 이미지 결과
    let url = format!("https://duckduckgo.com/i.js?o=json&q={qe}&l=wt-wt&vqd={}&p=1&ct=AT", enc(&vqd));
    let (st, js) = ddg_send(with_headers(a.get(&url), &JS_HEADERS), None)?;
    if st != 200 { return Err(format!("이미지 결과 요청이 {st} 오류를 돌려줌")) }
    let v = parse_ddg(&js).map_err(|_| format!("이미지 결과를 읽지 못함 ({}바이트)", js.len()))?;
    if v.is_empty() { return Err("결과가 0개".into()) }
    Ok(v)
}
pub fn ddg(q: &str) -> Result<Vec<WebImg>, String> {
    match ddg_once(q) {
        Ok(v) => Ok(v),
        Err(e1) => {
            // 잠깐 쉬었다가 한 번 더 (쿠키가 생긴 뒤라 통과되는 경우가 있다)
            std::thread::sleep(Duration::from_millis(900));
            ddg_once(q).map_err(|e2| if e1 == e2 { e1 } else { format!("{e1}; 다시 시도: {e2}") })
        }
    }
}
/* vqd 토큰: vqd="…", vqd=…&, vqd='…', "vqd":"…" */
fn parse_vqd(page: &str) -> Option<String> {
    for (a, b) in [("vqd=\"", "\""), ("vqd='", "'"), ("\"vqd\":\"", "\""), ("vqd=", "&")] {
        let mut from = 0;
        while let Some(i) = page[from..].find(a) {
            let st = from + i + a.len();
            if let Some(e) = page[st..].find(b) {
                let v = &page[st..st + e];
                if !v.is_empty() && v.len() < 200 && !v.contains(|c: char| c.is_whitespace() || c == '<' || c == '>' || c == '"' || c == '\'') { return Some(v.to_string()) }
            }
            from = st;
        }
    }
    None
}
pub fn parse_ddg(js: &str) -> Result<Vec<WebImg>, String> {
    let v: serde_json::Value = serde_json::from_str(js).map_err(|e| e.to_string())?;
    Ok(v["results"].as_array().map(|a| a.iter().filter_map(|x| Some(WebImg {
        thumb: x["thumbnail"].as_str()?.to_string(), image: x["image"].as_str()?.to_string(),
        title: x["title"].as_str().unwrap_or("").to_string(), width: x["width"].as_u64().unwrap_or(0) as u32, height: x["height"].as_u64().unwrap_or(0) as u32,
        source: "DuckDuckGo".into() })).collect()).unwrap_or_default())
}
pub fn bing(q: &str) -> Result<Vec<WebImg>, String> {
    let html = browser_get(&format!("https://www.bing.com/images/search?q={}&form=HDRSC2&first=1", enc(q)), "https://www.bing.com/")?;
    parse_bing(&html)
}
fn parse_bing(html: &str) -> Result<Vec<WebImg>, String> {
    let mut out = Vec::new();
    // <a class="iusc" … m="{&quot;murl&quot;:…,&quot;turl&quot;:…}">
    for part in html.split(" m=\"").skip(1) {
        let Some(end) = part.find('"') else { continue };
        let j = unxml(&part[..end]);
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&j) else { continue };
        let (Some(m), Some(t)) = (v["murl"].as_str(), v["turl"].as_str()) else { continue };
        out.push(WebImg { thumb: t.to_string(), image: m.to_string(), title: v["t"].as_str().unwrap_or("").to_string(), width: 0, height: 0, source: "Bing".into() });
        if out.len() >= 60 { break }
    }
    if out.is_empty() { Err("Bing 결과를 읽지 못했어요".into()) } else { Ok(out) }
}
fn unxml(s: &str) -> String {
    s.replace("&quot;", "\"").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&#39;", "'")
}
#[derive(Serialize)]
pub struct WebResult { pub items: Vec<WebImg>, pub source: String, pub note: String }
/* engine: "ddg"면 DuckDuckGo만, 그 밖엔 DuckDuckGo → 안 되면 Bing (DuckDuckGo가 실패한 이유를 note에 남긴다) */
#[allow(dead_code)]
pub fn web_images(q: &str, engine: Option<&str>) -> Result<WebResult, String> {
    match ddg(q) {
        Ok(v) => Ok(WebResult { items: v, source: "DuckDuckGo".into(), note: String::new() }),
        Err(e1) => {
            if engine == Some("ddg") { return Err(format!("DuckDuckGo: {e1}")) }
            match bing(q) {
                Ok(v) => Ok(WebResult { items: v, source: "Bing".into(), note: format!("DuckDuckGo: {e1}") }),
                Err(e2) => Err(format!("DuckDuckGo: {e1} / Bing: {e2}")),
            }
        }
    }
}

#[cfg(test)]
mod web_tests {
    use super::*;
    #[test]
    fn vqd_forms() {
        assert_eq!(parse_vqd(r#"...;vqd="4-123456789012345678901234567890",x"#).as_deref(), Some("4-123456789012345678901234567890"));
        assert_eq!(parse_vqd("a&vqd=4-98765432109876543210&b").as_deref(), Some("4-98765432109876543210"));
        assert_eq!(parse_vqd(r#"{"vqd":"4-111122223333"}"#).as_deref(), Some("4-111122223333"));
        assert!(parse_vqd("no token here vqd=x").is_none());
    }
    #[test]
    fn ddg_json() {
        let r = parse_ddg(r#"{"results":[{"height":600,"image":"https://e.com/a.jpg","thumbnail":"https://tse2.mm.bing.net/th?id=1","title":"Zelda box","url":"https://e.com","width":420}],"next":"i.js?x"}"#).unwrap();
        assert_eq!(r.len(), 1); assert_eq!(r[0].image, "https://e.com/a.jpg"); assert_eq!(r[0].width, 420);
    }
    #[test]
    fn bing_html() {
        let h = r#"<a class="iusc" style="" m="{&quot;cid&quot;:&quot;x&quot;,&quot;murl&quot;:&quot;https://e.com/b.png&quot;,&quot;turl&quot;:&quot;https://tse1.mm.bing.net/th?id=2&amp;pid=15.1&quot;,&quot;t&quot;:&quot;Mario &amp; Luigi&quot;}" href="/x">"#;
        let r = parse_bing(h).unwrap();
        assert_eq!(r[0].image, "https://e.com/b.png"); assert_eq!(r[0].thumb, "https://tse1.mm.bing.net/th?id=2&pid=15.1"); assert_eq!(r[0].title, "Mario & Luigi");
    }
}
