// Cemu 그래픽 팩: 게임의 타이틀 ID에 맞는 팩(graphicPacks/**/rules.txt)을 찾고,
// Cemu settings.xml 의 <GraphicPack> 항목을 읽고 고친다.
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
pub struct Preset { pub name: String, pub default: bool }
#[derive(Serialize, Clone)]
pub struct Category { pub name: String, pub presets: Vec<Preset>, pub selected: String }
#[derive(Serialize, Clone)]
pub struct Pack {
    pub file: String,        // settings.xml 에 쓰는 이름 (사용자 폴더 기준 상대 경로)
    pub name: String,
    pub path: String,        // "게임/Graphics/Resolution" 같은 분류 경로
    pub description: String,
    pub enabled: bool,
    pub categories: Vec<Category>,
}
#[derive(Serialize)]
pub struct Packs { pub title_id: String, pub user_dir: String, pub settings: String, pub packs: Vec<Pack>, pub pack_dirs: usize }

/* Cemu 사용자 폴더: exe 옆 portable → exe 옆 settings.xml(예전 방식) → %APPDATA%\Cemu */
pub fn user_dir(exe: &Path) -> PathBuf {
    let dir = exe.parent().map(Path::to_path_buf).unwrap_or_default();
    if dir.join("portable").is_dir() { return dir.join("portable") }
    if dir.join("settings.xml").is_file() { return dir }
    if let Some(a) = std::env::var_os("APPDATA") {
        let p = PathBuf::from(a).join("Cemu");
        if p.join("settings.xml").is_file() || p.join("graphicPacks").is_dir() { return p }
    }
    dir
}

/* ---------- 타이틀 ID ---------- */
fn tid_in(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut i = 0;
    while i + 16 <= b.len() {
        let w = &s[i..i + 16];
        if w.bytes().all(|c| c.is_ascii_hexdigit()) && w[..7].eq_ignore_ascii_case("0005000")
            && (i == 0 || !b[i - 1].is_ascii_hexdigit()) && (i + 16 == b.len() || !b[i + 16].is_ascii_hexdigit()) {
            return Some(w.to_ascii_lowercase());
        }
        i += 1;
    }
    None
}
/* 게임 본편 ID로 맞춘다 (업데이트 0005000e·DLC 0005000c → 00050000) */
fn base_tid(t: &str) -> String { format!("00050000{}", &t[8..]) }

fn meta_tid(meta: &Path) -> Option<String> {
    let t = fs::read_to_string(meta).ok()?;
    let i = t.find("<title_id")?; let j = t[i..].find('>')? + i + 1; let k = t[j..].find('<')? + j;
    tid_in(t[j..k].trim())
}
/* .wua (ZArchive): 끝의 144바이트 꼬리에 이름 표 위치가 있고, 이름 표는 압축되지 않았다.
   최상위 폴더 이름이 "00050000101c9500_v208" 꼴 */
fn wua_tid(p: &Path) -> Option<String> {
    let mut f = fs::File::open(p).ok()?;
    let len = f.metadata().ok()?.len();
    if len < 144 { return None }
    f.seek(SeekFrom::Start(len - 144)).ok()?;
    let mut ft = [0u8; 144]; f.read_exact(&mut ft).ok()?;
    let be = |o: usize| u64::from_be_bytes(ft[o..o + 8].try_into().unwrap());
    if u32::from_be_bytes(ft[140..144].try_into().unwrap()) != 0x169f52d6 { return None }
    let (off, size) = (be(32), be(40)); // 세 번째 구역 = 이름 표
    if size == 0 || size > 64 << 20 || off + size > len { return None }
    f.seek(SeekFrom::Start(off)).ok()?;
    let mut names = vec![0u8; size as usize]; f.read_exact(&mut names).ok()?;
    let s = String::from_utf8_lossy(&names);
    // 게임 본편(00050000)을 먼저, 없으면 아무 ID
    let mut found: Option<String> = None;
    let mut rest: &str = &s;
    while let Some(t) = tid_in(rest) {
        if t.starts_with("00050000") { return Some(t) }
        if found.is_none() { found = Some(t.clone()) }
        let i = rest.to_ascii_lowercase().find(&t).unwrap_or(0) + 16; rest = &rest[i..];
    }
    found
}
pub fn title_id(rom: &Path) -> Option<String> {
    let ext = rom.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    let t = match ext.as_str() {
        "wua" => wua_tid(rom),
        "rpx" => rom.parent().and_then(|d| d.parent()).and_then(|r| meta_tid(&r.join("meta").join("meta.xml"))),
        _ => None,
    };
    t.or_else(|| tid_in(&rom.to_string_lossy())).map(|t| base_tid(&t))
}

/* ---------- rules.txt ---------- */
struct Rules { name: String, path: String, desc: String, tids: Vec<String>, cats: Vec<Category> }
fn unq(v: &str) -> String { let v = v.trim(); v.strip_prefix('"').and_then(|x| x.strip_suffix('"')).unwrap_or(v).to_string() }
fn parse_rules(text: &str) -> Option<Rules> {
    let mut sec = String::new();
    let mut r = Rules { name: String::new(), path: String::new(), desc: String::new(), tids: vec![], cats: vec![] };
    let mut cur: Option<(String, String, bool)> = None; // 카테고리, 이름, 기본값
    let push = |cur: &mut Option<(String, String, bool)>, cats: &mut Vec<Category>| {
        if let Some((c, n, d)) = cur.take() {
            if n.is_empty() { return }
            let i = match cats.iter().position(|x| x.name == c) { Some(i) => i, None => { cats.push(Category { name: c, presets: vec![], selected: String::new() }); cats.len() - 1 } };
            if !cats[i].presets.iter().any(|p| p.name == n) { cats[i].presets.push(Preset { name: n, default: d }) }
        }
    };
    for line in text.lines() {
        let l = line.trim();
        if l.starts_with('#') || l.is_empty() { continue }
        if l.starts_with('[') {
            push(&mut cur, &mut r.cats);
            sec = l.trim_matches(|c| c == '[' || c == ']').trim().to_ascii_lowercase();
            if sec == "preset" { cur = Some((String::new(), String::new(), false)) }
            continue;
        }
        let Some((k, v)) = l.split_once('=') else { continue };
        let k = k.trim().to_ascii_lowercase();
        match sec.as_str() {
            "definition" => match k.as_str() {
                "titleids" => r.tids = v.split(',').filter_map(|x| tid_in(x.trim())).collect(),
                "name" => r.name = unq(v),
                "path" => r.path = unq(v),
                "description" => r.desc = unq(v).replace("\\n", "\n"),
                _ => {}
            },
            "preset" => if let Some(c) = cur.as_mut() { match k.as_str() {
                "name" => c.1 = unq(v),
                "category" => c.0 = unq(v),
                "default" => c.2 = unq(v) == "1",
                _ => {}
            } },
            _ => {}
        }
    }
    push(&mut cur, &mut r.cats);
    if r.tids.is_empty() { return None }
    if r.name.is_empty() { r.name = r.path.rsplit('/').next().unwrap_or("").to_string() }
    Some(r)
}
fn find_rules(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() { if depth < 7 { find_rules(&p, depth + 1, out) } }
        else if p.file_name().map(|n| n.eq_ignore_ascii_case("rules.txt")).unwrap_or(false) { out.push(p) }
    }
}

/* ---------- settings.xml ---------- */
fn norm(f: &str) -> String { f.replace('\\', "/").to_ascii_lowercase() }
fn xml_unesc(s: &str) -> String { s.replace("&quot;", "\"").replace("&apos;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&") }
fn xml_esc(s: &str) -> String { s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;") }
fn attr(tag: &str, name: &str) -> Option<String> {
    let i = tag.find(&format!("{name}=\""))? + name.len() + 2; let j = tag[i..].find('"')? + i;
    Some(xml_unesc(&tag[i..j]))
}
fn inner(s: &str, tag: &str) -> String {
    if s.contains(&format!("<{tag}/>")) { return String::new() }
    let Some(i) = s.find(&format!("<{tag}>")) else { return String::new() };
    let i = i + tag.len() + 2; let j = s[i..].find(&format!("</{tag}>")).map(|j| j + i).unwrap_or(i);
    xml_unesc(&s[i..j])
}
struct Entry { raw: String, file: String, disabled: bool, presets: Vec<(String, String)> }
/* <GraphicPack> … </GraphicPack> 블록의 (시작, 끝, 들여쓰기)와 항목들 */
fn gp_block(x: &str) -> Option<(usize, usize, Vec<Entry>)> {
    if let Some(i) = x.find("<GraphicPack/>") { return Some((i, i + 14, vec![])) }
    let i = x.find("<GraphicPack>")?; let j = x[i..].find("</GraphicPack>")? + i + 14;
    let body = &x[i + 13..j - 14];
    let mut v = vec![]; let mut k = 0;
    while let Some(a) = body[k..].find("<Entry").map(|a| a + k) {
        let te = match body[a..].find('>') { Some(t) => t + a, None => break };
        let selfc = body[..te].ends_with('/');
        let end = if selfc { te + 1 } else { match body[te..].find("</Entry>") { Some(e) => e + te + 8, None => break } };
        let tag = &body[a..=te]; let all = &body[a..end];
        let mut presets = vec![]; let mut pk = 0;
        while let Some(p) = all[pk..].find("<Preset>").map(|p| p + pk) {
            let pe = all[p..].find("</Preset>").map(|e| e + p + 9).unwrap_or(all.len());
            presets.push((inner(&all[p..pe], "category"), inner(&all[p..pe], "preset"))); pk = pe;
        }
        v.push(Entry { raw: all.to_string(), file: attr(tag, "filename").unwrap_or_default(), disabled: attr(tag, "disabled").map(|d| d == "true" || d == "1").unwrap_or(false), presets });
        k = end;
    }
    Some((i, j, v))
}
fn settings_path(ud: &Path) -> PathBuf { ud.join("settings.xml") }

pub fn packs(exe: &str, rom: &str) -> Result<Packs, String> {
    let exe = Path::new(exe); let ud = user_dir(exe);
    let tid = title_id(Path::new(rom)).ok_or("게임의 타이틀 ID를 알 수 없어요 (.wua, 압축 푼 폴더(code·meta)만 알아봐요)")?;
    let gp = ud.join("graphicPacks");
    let mut files = vec![]; find_rules(&gp, 0, &mut files);
    let xml = fs::read_to_string(settings_path(&ud)).unwrap_or_default();
    let ents = gp_block(&xml).map(|b| b.2).unwrap_or_default();
    let byf: HashMap<String, &Entry> = ents.iter().map(|e| (norm(&e.file), e)).collect();
    let mut out = vec![];
    for f in &files {
        let Ok(bytes) = fs::read(f) else { continue };
        let Some(r) = parse_rules(&String::from_utf8_lossy(&bytes)) else { continue };
        if !r.tids.iter().any(|t| base_tid(t) == tid) { continue }
        let rel = f.strip_prefix(&ud).unwrap_or(f).to_string_lossy().replace('\\', "/");
        let e = byf.get(&norm(&rel));
        let mut cats = r.cats;
        for c in cats.iter_mut() {
            let saved = e.and_then(|e| e.presets.iter().find(|(k, _)| *k == c.name).map(|(_, v)| v.clone()));
            c.selected = saved.filter(|s| c.presets.iter().any(|p| &p.name == s))
                .or_else(|| c.presets.iter().find(|p| p.default).map(|p| p.name.clone()))
                .or_else(|| c.presets.first().map(|p| p.name.clone())).unwrap_or_default();
        }
        out.push(Pack { file: rel, name: r.name, path: r.path, description: r.desc, enabled: e.map(|e| !e.disabled).unwrap_or(false), categories: cats });
    }
    out.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    Ok(Packs { title_id: tid, user_dir: ud.to_string_lossy().into_owned(), settings: settings_path(&ud).to_string_lossy().into_owned(), packs: out, pack_dirs: files.len() })
}

/* 팩 하나를 켜고/끄고 프리셋을 정한다. 다른 항목은 글자 그대로 둔다 */
pub fn set_pack(exe: &str, file: &str, enabled: bool, presets: Vec<(String, String)>) -> Result<(), String> {
    let ud = user_dir(Path::new(exe)); let sp = settings_path(&ud);
    let xml = fs::read_to_string(&sp).map_err(|_| format!("Cemu 설정 파일이 없어요: {} (Cemu를 한 번 실행했다 닫아 주세요)", sp.display()))?;
    let crlf = xml.contains("\r\n"); let nl = if crlf { "\r\n" } else { "\n" };
    // 기존 항목들의 경로 구분자를 따른다
    let block = gp_block(&xml);
    let back = block.as_ref().map(|b| b.2.iter().any(|e| e.file.contains('\\'))).unwrap_or(false);
    let fname = if back { file.replace('/', "\\") } else { file.replace('\\', "/") };
    let mut e = format!("        <Entry filename=\"{}\"{}>", xml_esc(&fname), if enabled { "" } else { " disabled=\"true\"" });
    for (c, p) in &presets {
        e += &format!("{nl}            <Preset>{nl}                <category>{}</category>{nl}                <preset>{}</preset>{nl}            </Preset>", xml_esc(c), xml_esc(p));
    }
    e += &format!("{nl}        </Entry>");
    let new = match block {
        Some((i, j, ents)) => {
            let mut parts: Vec<String> = ents.into_iter().filter(|x| norm(&x.file) != norm(file)).map(|x| format!("        {}", x.raw.trim())).collect();
            parts.push(e);
            format!("{}<GraphicPack>{nl}{}{nl}    </GraphicPack>{}", &xml[..i], parts.join(nl), &xml[j..])
        }
        None => {
            let i = xml.rfind("</content>").ok_or("Cemu 설정 파일 형식을 알 수 없어요")?;
            format!("{}    <GraphicPack>{nl}{e}{nl}    </GraphicPack>{nl}{}", &xml[..i], &xml[i..])
        }
    };
    let bak = sp.with_extension("xml.retroshelf.bak");
    if !bak.exists() { let _ = fs::copy(&sp, &bak); }
    fs::write(&sp, new).map_err(|e| format!("Cemu 설정 파일을 쓰지 못했어요: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rules_and_settings() {
        let r = parse_rules("[Definition]\ntitleIds = 00050000101C9300,00050000101C9400,00050000101C9500\nname = Resolution\npath = \"The Legend of Zelda: Breath of the Wild/Graphics/Resolution\"\ndescription = Changes the resolution.\nversion = 6\n\n[Preset]\ncategory = Resolution\nname = 1280x720\n$w=1\n\n[Preset]\ncategory = Resolution\nname = 1920x1080 (Default)\ndefault = 1\n\n[Preset]\ncategory = Shadows\nname = High\n").unwrap();
        assert_eq!(r.tids.len(), 3); assert_eq!(r.cats.len(), 2); assert!(r.cats[0].presets[1].default);
        let x = "<?xml version=\"1.0\"?>\n<content>\n    <GraphicPack>\n        <Entry filename=\"graphicPacks/downloadedGraphicPacks/A/rules.txt\">\n            <Preset>\n                <category>Resolution</category>\n                <preset>1440p</preset>\n            </Preset>\n        </Entry>\n        <Entry filename=\"graphicPacks/B/rules.txt\" disabled=\"true\"/>\n    </GraphicPack>\n</content>\n";
        let (_, _, e) = gp_block(x).unwrap();
        assert_eq!(e.len(), 2); assert_eq!(e[0].presets[0].1, "1440p"); assert!(e[1].disabled);
        assert_eq!(title_id(Path::new("D:/WiiU/Zelda [0005000E101C9500].wux")).unwrap(), "00050000101c9500");
    }
    #[test]
    fn write_settings() {
        let d = std::env::temp_dir().join(format!("cemu-t{}", std::process::id())); let _ = fs::remove_dir_all(&d);
        let g = d.join("graphicPacks/downloadedGraphicPacks/BotW/Graphics"); fs::create_dir_all(&g).unwrap();
        fs::write(d.join("Cemu.exe"), b"").unwrap();
        fs::write(g.join("rules.txt"), "[Definition]\ntitleIds = 00050000101C9500\nname = Graphics\npath = \"BotW/Graphics\"\nversion = 7\n[Preset]\ncategory = Resolution\nname = 720p\n[Preset]\ncategory = Resolution\nname = 1080p\ndefault = 1\n").unwrap();
        let rom = d.join("Zelda/code"); fs::create_dir_all(&rom).unwrap(); fs::create_dir_all(d.join("Zelda/meta")).unwrap();
        fs::write(d.join("Zelda/meta/meta.xml"), "<menu><title_id type=\"hexBinary\" length=\"8\">00050000101C9500</title_id></menu>").unwrap();
        fs::write(d.join("settings.xml"), "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\r\n<content>\r\n    <GraphicPack>\r\n        <Entry filename=\"graphicPacks/Other/rules.txt\"/>\r\n    </GraphicPack>\r\n</content>\r\n").unwrap();
        let exe = d.join("Cemu.exe").to_string_lossy().into_owned(); let rp = rom.join("U-King.rpx").to_string_lossy().into_owned();
        let p = packs(&exe, &rp).unwrap();
        assert_eq!(p.packs.len(), 1); assert!(!p.packs[0].enabled); assert_eq!(p.packs[0].categories[0].selected, "1080p");
        set_pack(&exe, &p.packs[0].file, true, vec![("Resolution".into(), "720p".into())]).unwrap();
        let p = packs(&exe, &rp).unwrap(); assert!(p.packs[0].enabled); assert_eq!(p.packs[0].categories[0].selected, "720p");
        let x = fs::read_to_string(d.join("settings.xml")).unwrap(); assert!(x.contains("graphicPacks/Other/rules.txt")); assert!(!x.replace("\r\n", "").contains('\n'));
        set_pack(&exe, &p.packs[0].file, false, vec![("Resolution".into(), "720p".into())]).unwrap();
        let p = packs(&exe, &rp).unwrap(); assert!(!p.packs[0].enabled);
        println!("{}", fs::read_to_string(d.join("settings.xml")).unwrap());
    }
}
