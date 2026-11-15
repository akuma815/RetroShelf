/* 아케이드 롬셋 정보: 원본(parent)·클론, 실제 제목, 연도, 제조사
   FBNeo DAT(GitHub)를 받아 두고, MAME가 있으면 MAME 목록도 합친다 */
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::SystemTime;

const DATS: [&str; 2] = ["Arcade only", "Neogeo only"];
const DAYS: u64 = 30;

/* 한 줄: 이름 \t 원본 \t 제목 \t 연도 \t 제조사 */
type Row = [String; 5];

fn fresh(p: &Path, days: u64) -> bool {
    fs::metadata(p).and_then(|m| m.modified()).ok().and_then(|t| SystemTime::now().duration_since(t).ok())
        .map(|d| d.as_secs() < days * 86400).unwrap_or(false)
}
fn unxml(s: &str) -> String {
    s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&#39;", "'")
}
fn attr(tag: &str, key: &str) -> Option<String> {
    let k = format!(" {key}=\"");
    let i = tag.find(&k)? + k.len();
    let j = tag[i..].find('"')? + i;
    Some(unxml(&tag[i..j]))
}
fn inner(block: &str, tag: &str) -> String {
    let (o, c) = (format!("<{tag}>"), format!("</{tag}>"));
    block.find(&o).and_then(|i| block[i + o.len()..].find(&c).map(|j| unxml(&block[i + o.len()..i + o.len() + j]))).unwrap_or_default()
}
/* ClrMame Pro XML(<game> 또는 <machine>)에서 필요한 것만 뽑는다 */
fn parse_dat(xml: &str, out: &mut Vec<Row>) {
    for part in xml.split("<game ").skip(1).chain(xml.split("<machine ").skip(1)) {
        let Some(end) = part.find('>') else { continue };
        let tag = format!(" {}", &part[..end]);
        let Some(name) = attr(&tag, "name") else { continue };
        if attr(&tag, "isbios").as_deref() == Some("yes") || attr(&tag, "isdevice").as_deref() == Some("yes") { continue }
        let body_end = part.find("</game>").or_else(|| part.find("</machine>")).unwrap_or(part.len().min(4000));
        let body = &part[..body_end];
        out.push([name, attr(&tag, "cloneof").unwrap_or_default(), inner(body, "description"), inner(body, "year"), inner(body, "manufacturer")]);
    }
}
fn save(p: &Path, rows: &[Row]) {
    let s: String = rows.iter().map(|r| r.iter().map(|x| x.replace(['\t', '\n', '\r'], " ")).collect::<Vec<_>>().join("\t") + "\n").collect();
    let _ = fs::write(p, s);
}
fn load(p: &Path) -> Option<Vec<Row>> {
    let s = fs::read_to_string(p).ok()?;
    Some(s.lines().filter_map(|l| {
        let mut it = l.split('\t').map(String::from);
        Some([it.next()?, it.next().unwrap_or_default(), it.next().unwrap_or_default(), it.next().unwrap_or_default(), it.next().unwrap_or_default()])
    }).collect())
}

fn fbneo(dir: &Path, refresh: bool) -> Result<Vec<Row>, String> {
    let file = dir.join("fbneo.tsv");
    if !refresh && fresh(&file, DAYS) { if let Some(v) = load(&file) { return Ok(v) } }
    let mut rows = Vec::new();
    let mut err = String::new();
    for d in DATS {
        let url = format!("https://raw.githubusercontent.com/libretro/FBNeo/master/dats/FinalBurn%20Neo%20(ClrMame%20Pro%20XML%2C%20{}).dat", d.replace(' ', "%20"));
        match crate::thumbs::get_text(&url) { Ok(x) => parse_dat(&x, &mut rows), Err(e) => err = e }
    }
    if rows.is_empty() {
        return load(&file).ok_or(if err.is_empty() { "목록이 비어 있어요".into() } else { err });
    }
    save(&file, &rows);
    Ok(rows)
}

fn run_mame(exe: &str, arg: &str) -> Option<String> {
    let mut c = Command::new(exe);
    c.arg(arg);
    if let Some(d) = Path::new(exe).parent() { c.current_dir(d); }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
    }
    let o = c.output().ok()?;
    if !o.status.success() && o.stdout.is_empty() { return None }
    Some(String::from_utf8_lossy(&o.stdout).into_owned())
}
/* MAME -listfull / -listclones 를 읽는다. 결과는 MAME 실행 파일이 바뀔 때까지 보관 */
fn mame(dir: &Path, exe: &str) -> Option<Vec<Row>> {
    let stamp = fs::metadata(exe).and_then(|m| m.modified()).ok()?.duration_since(SystemTime::UNIX_EPOCH).ok()?.as_secs();
    let file = dir.join(format!("mame-{stamp}.tsv"));
    if let Some(v) = load(&file) { return Some(v) }
    let full = run_mame(exe, "-listfull")?;
    let clones = run_mame(exe, "-listclones").unwrap_or_default();
    let mut parent: HashMap<String, String> = HashMap::new();
    for l in clones.lines().skip(1) {
        let mut it = l.split_whitespace();
        if let (Some(a), Some(b)) = (it.next(), it.next()) { parent.insert(a.to_string(), b.to_string()); }
    }
    let mut rows = Vec::new();
    for l in full.lines().skip(1) {
        let l = l.trim_end();
        let Some(sp) = l.find(char::is_whitespace) else { continue };
        let name = l[..sp].to_string();
        let desc = l[sp..].trim().trim_matches('"').to_string();
        if name.is_empty() || desc.is_empty() { continue }
        let p = parent.get(&name).cloned().unwrap_or_default();
        rows.push([name, p, desc, String::new(), String::new()]);
    }
    if rows.is_empty() { return None }
    // 예전 MAME 목록은 지운다
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().into_owned();
            if n.starts_with("mame-") && n.ends_with(".tsv") { let _ = fs::remove_file(e.path()); }
        }
    }
    save(&file, &rows);
    Some(rows)
}

pub fn db(dir: &Path, mame_exe: Option<String>, refresh: bool) -> Result<Vec<Row>, String> {
    let _ = fs::create_dir_all(dir);
    let fb = fbneo(dir, refresh);
    let mm = mame_exe.as_deref().filter(|e| Path::new(e).is_file()).and_then(|e| mame(dir, e));
    let mut map: HashMap<String, Row> = HashMap::new();
    if let Some(m) = mm { for r in m { map.insert(r[0].clone(), r); } }
    let fb_ok = fb.is_ok();
    // FBNeo 쪽에만 있는 연도·제조사는 채워 넣고, 없는 롬셋은 더한다
    if let Ok(f) = fb {
        for r in f {
            match map.get_mut(&r[0]) {
                Some(m) => { if m[3].is_empty() { m[3] = r[3].clone() } if m[4].is_empty() { m[4] = r[4].clone() } }
                None => { map.insert(r[0].clone(), r); }
            }
        }
    }
    if map.is_empty() && !fb_ok { return Err("아케이드 목록을 받지 못했어요".into()) }
    Ok(map.into_values().collect())
}
