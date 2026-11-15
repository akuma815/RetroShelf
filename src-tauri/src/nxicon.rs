/* 롬 파일 안의 타이틀 아이콘: 3DS(SMDH)와 Switch(NCA 안 control 데이터)
   - 3DS: CIA의 meta, 복호화된 .3ds/.cci/.cxi의 ExeFS, .3dsx 확장 헤더에서 SMDH 큰 아이콘(48×48)을 꺼낸다
   - Switch: NSP(PFS0)·XCI(HFS0 secure)에서 control NCA를 찾아 RomFS의 icon_*.dat(JPEG)를 꺼낸다.
     NCA는 암호화되어 있어 사용자의 prod.keys(에뮬레이터가 쓰는 것과 같은 파일)가 있어야 한다 */
use aes::cipher::{generic_array::GenericArray, BlockDecrypt, BlockEncrypt, KeyInit};
use aes::Aes128;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::Mutex;

/* ---------------- 공통 ---------------- */
fn rd(f: &mut File, off: u64, len: usize) -> Option<Vec<u8>> {
    f.seek(SeekFrom::Start(off)).ok()?;
    let mut b = vec![0u8; len];
    f.read_exact(&mut b).ok()?;
    Some(b)
}
fn u16le(b: &[u8], o: usize) -> u16 { u16::from_le_bytes([b[o], b[o + 1]]) }
fn u32le(b: &[u8], o: usize) -> u32 { u32::from_le_bytes(b[o..o + 4].try_into().unwrap()) }
fn u64le(b: &[u8], o: usize) -> u64 { u64::from_le_bytes(b[o..o + 8].try_into().unwrap()) }

/* ---------------- 3DS ---------------- */
/* SMDH 큰 아이콘(0x24C0, 48×48 RGB565, 8×8 타일·모턴 순서) → PNG */
fn smdh_png(s: &[u8]) -> Option<Vec<u8>> {
    if s.len() < 0x24C0 + 0x1200 || &s[0..4] != b"SMDH" { return None }
    let px = &s[0x24C0..0x24C0 + 0x1200];
    let mut rgba = vec![0u8; 48 * 48 * 4];
    for ty in 0..6 {
        for tx in 0..6 {
            for i in 0..64usize {
                let x = (i & 1) | ((i >> 1) & 2) | ((i >> 2) & 4);
                let y = ((i >> 1) & 1) | ((i >> 2) & 2) | ((i >> 3) & 4);
                let v = u16le(px, ((ty * 6 + tx) * 64 + i) * 2);
                let (r, g, b) = (((v >> 11) & 31) as u32, ((v >> 5) & 63) as u32, (v & 31) as u32);
                let o = ((ty * 8 + y) * 48 + tx * 8 + x) * 4;
                rgba[o] = (r * 255 / 31) as u8;
                rgba[o + 1] = (g * 255 / 63) as u8;
                rgba[o + 2] = (b * 255 / 31) as u8;
                rgba[o + 3] = 255;
            }
        }
    }
    crate::icons::png_rgba(48, 48, &rgba)
}
/* NCCH(.cxi 또는 NCSD 안의 파티션) → ExeFS의 icon. 암호화된 것은 건너뛴다 */
fn ncch_icon(f: &mut File, base: u64) -> Option<Vec<u8>> {
    let h = rd(f, base, 0x200)?;
    if &h[0x100..0x104] != b"NCCH" { return None }
    let flags7 = h[0x188 + 7];
    if flags7 & 0x4 == 0 { return None } // NoCrypto가 아니면 키 없이는 못 읽는다
    let exefs = base + u32le(&h, 0x1A0) as u64 * 0x200;
    let eh = rd(f, exefs, 0x200)?;
    for i in 0..10 {
        let e = &eh[i * 16..i * 16 + 16];
        if &e[0..4] == b"icon" {
            let (off, size) = (u32le(e, 8) as u64, u32le(e, 12) as usize);
            let s = rd(f, exefs + 0x200 + off, size.min(0x4000))?;
            return smdh_png(&s);
        }
    }
    None
}
fn align64(v: u64) -> u64 { (v + 63) & !63 }
pub fn icon_3ds(path: &Path) -> Option<Vec<u8>> {
    let mut f = File::open(path).ok()?;
    let ext = path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    let head = rd(&mut f, 0, 0x200)?;
    if ext == "3dsx" || &head[0..4] == b"3DSX" {
        if &head[0..4] != b"3DSX" || u16le(&head, 4) < 0x2C { return None }
        let (off, size) = (u32le(&head, 0x20) as u64, u32le(&head, 0x24) as usize);
        return smdh_png(&rd(&mut f, off, size.min(0x4000))?);
    }
    if &head[0x100..0x104] == b"NCSD" {
        return ncch_icon(&mut f, u32le(&head, 0x120) as u64 * 0x200);
    }
    if &head[0x100..0x104] == b"NCCH" { return ncch_icon(&mut f, 0) }
    // CIA: 헤더 크기 0x2020
    if u32le(&head, 0) == 0x2020 {
        let (cert, tik, tmd, meta) = (u32le(&head, 8) as u64, u32le(&head, 12) as u64, u32le(&head, 16) as u64, u32le(&head, 20) as u64);
        let content = u64le(&head, 24);
        if meta < 0x3AC0 { return None }
        let o = align64(align64(align64(align64(0x2020) + cert) + tik) + tmd) + align64(content);
        return smdh_png(&rd(&mut f, o + 0x400, 0x36C0)?);
    }
    None
}

/* ---------------- Switch ---------------- */
#[derive(Default, Clone)]
pub struct Keys(HashMap<String, Vec<u8>>);
static KEYS: Mutex<Option<Keys>> = Mutex::new(None);

fn hex(s: &str) -> Option<Vec<u8>> {
    let s = s.trim();
    if s.len() % 2 != 0 { return None }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok()).collect()
}
/* prod.keys 후보 중 처음 읽히는 것을 쓴다. 쓰인 경로를 돌려준다 */
pub fn set_keys(paths: &[String]) -> Option<String> {
    for p in paths {
        let Ok(t) = std::fs::read_to_string(p) else { continue };
        let mut m = HashMap::new();
        for l in t.lines() {
            let Some((k, v)) = l.split_once('=') else { continue };
            if let Some(b) = hex(v) { m.insert(k.trim().to_ascii_lowercase(), b); }
        }
        if m.get("header_key").map(|k| k.len() == 32).unwrap_or(false) {
            *KEYS.lock().unwrap() = Some(Keys(m));
            return Some(p.clone());
        }
    }
    *KEYS.lock().unwrap() = None;
    None
}

fn aes(key: &[u8]) -> Aes128 { Aes128::new(GenericArray::from_slice(&key[..16])) }
fn ecb_dec(key: &[u8], data: &[u8]) -> Vec<u8> {
    let c = aes(key);
    let mut out = data.to_vec();
    for ch in out.chunks_mut(16) { let mut b = GenericArray::clone_from_slice(ch); c.decrypt_block(&mut b); ch.copy_from_slice(&b); }
    out
}
/* AES-128-XTS 복호화 (닌텐도 방식: 섹터 번호를 빅엔디언 트윅으로) */
fn xts_dec(key: &[u8], data: &mut [u8], first_sector: u64, sector: usize) {
    let (k1, k2) = (aes(&key[..16]), aes(&key[16..32]));
    for (si, sec) in data.chunks_mut(sector).enumerate() {
        let mut t = [0u8; 16];
        t[8..].copy_from_slice(&(first_sector + si as u64).to_be_bytes());
        let mut tb = GenericArray::clone_from_slice(&t);
        k2.encrypt_block(&mut tb);
        let mut tw: [u8; 16] = tb.into();
        for blk in sec.chunks_mut(16) {
            for i in 0..16 { blk[i] ^= tw[i] }
            let mut b = GenericArray::clone_from_slice(blk);
            k1.decrypt_block(&mut b);
            blk.copy_from_slice(&b);
            for i in 0..16 { blk[i] ^= tw[i] }
            // 트윅 ×α (GF(2^128), 리틀엔디언)
            let mut carry = 0u8;
            for b in tw.iter_mut() { let nc = *b >> 7; *b = (*b << 1) | carry; carry = nc; }
            if carry != 0 { tw[0] ^= 0x87 }
        }
    }
}
/* AES-CTR: 카운터 = 섹션 CTR(8바이트) ‖ (NCA 안 위치 / 16, 빅엔디언) */
fn ctr_read(f: &mut File, nca: u64, key: &[u8], ctr8: &[u8; 8], off: u64, len: usize) -> Option<Vec<u8>> {
    let start = off & !15;
    let pad = (off - start) as usize;
    let total = (pad + len + 15) & !15;
    let mut buf = rd(f, nca + start, total)?;
    let c = aes(key);
    for (i, blk) in buf.chunks_mut(16).enumerate() {
        let mut cv = [0u8; 16];
        cv[..8].copy_from_slice(ctr8);
        cv[8..].copy_from_slice(&((start >> 4) + i as u64).to_be_bytes());
        let mut ks = GenericArray::clone_from_slice(&cv);
        c.encrypt_block(&mut ks);
        for j in 0..16 { blk[j] ^= ks[j] }
    }
    Some(buf[pad..pad + len].to_vec())
}

struct Entry { name: String, off: u64, size: u64 }
/* PFS0 / HFS0 목록 */
fn fs_list(f: &mut File, base: u64) -> Option<Vec<Entry>> {
    let h = rd(f, base, 16)?;
    let (esz, magic) = match &h[0..4] { b"PFS0" => (0x18usize, 0), b"HFS0" => (0x40usize, 1), _ => return None };
    let n = u32le(&h, 4) as usize;
    let st = u32le(&h, 8) as usize;
    if n > 4096 { return None }
    let tab = rd(f, base + 16, n * esz + st)?;
    let data = base + 16 + (n * esz + st) as u64;
    let strs = &tab[n * esz..];
    let _ = magic;
    let mut out = Vec::new();
    for i in 0..n {
        let e = &tab[i * esz..];
        let (off, size, no) = (u64le(e, 0), u64le(e, 8), u32le(e, 16) as usize);
        let end = strs[no..].iter().position(|&c| c == 0).map(|p| no + p).unwrap_or(strs.len());
        out.push(Entry { name: String::from_utf8_lossy(&strs[no..end]).into_owned(), off: data + off, size });
    }
    Some(out)
}

fn key_rev(h: &[u8]) -> u8 { let g = h[0x206].max(h[0x220]); if g > 0 { g - 1 } else { 0 } }

/* 티켓(.tik)에서 rights id → 암호화된 title key */
fn tickets(f: &mut File, files: &[Entry]) -> HashMap<Vec<u8>, Vec<u8>> {
    let mut m = HashMap::new();
    for e in files.iter().filter(|e| e.name.to_ascii_lowercase().ends_with(".tik")) {
        let Some(t) = rd(f, e.off, (e.size as usize).min(0x400)) else { continue };
        // RSA-2048 서명(0x10004) 기준: 데이터는 0x140부터
        let d = match u32le(&t, 0) { 0x10003 => 0x240, 0x10004 => 0x140, 0x10005 => 0x80, _ => continue };
        // 데이터 시작 기준: title key 블록 +0x40, rights id +0x160
        if t.len() < d + 0x170 { continue }
        m.insert(t[d + 0x160..d + 0x170].to_vec(), t[d + 0x40..d + 0x50].to_vec());
    }
    m
}

/* NCA 본문 읽기: 보통 NCA는 섹션 키로 그때그때 복호화, NCZ(.nsz/.xcz 안)는 압축을 풀면 이미 평문 */
enum Body { Nca { key: Vec<u8>, ctr8: [u8; 8], crypt: u8 }, Plain(std::rc::Rc<Vec<u8>>) }
const NCZ_BASE: u64 = 0x4000;
fn body_read(f: &mut File, nca: u64, b: &Body, off: u64, len: usize) -> Option<Vec<u8>> {
    match b {
        Body::Nca { key, ctr8, crypt } => if *crypt == 1 { rd(f, nca + off, len) } else { ctr_read(f, nca, key, ctr8, off, len) },
        Body::Plain(d) => {
            let s = off.checked_sub(NCZ_BASE)? as usize;
            if s + len > d.len() { return None }
            Some(d[s..s + len].to_vec())
        }
    }
}
/* NCZ 본문(0x4000부터)을 푼다: NCZSECTN 목록 뒤에 NCZBLOCK 블록 압축 또는 zstd 스트림 하나 */
fn ncz_body(f: &mut File, nca: u64, size: u64) -> Option<Vec<u8>> {
    use std::io::Read;
    if size > 256 << 20 { return None } // control NCA는 작다
    let all = rd(f, nca + NCZ_BASE, (size - NCZ_BASE) as usize)?;
    if &all[0..8] != b"NCZSECTN" { return None }
    let n = u64le(&all, 8) as usize;
    let mut p = 16 + n * 0x40;
    let unz = |data: &[u8]| -> Option<Vec<u8>> {
        let mut d = ruzstd::StreamingDecoder::new(data).ok()?; let mut out = Vec::new(); d.read_to_end(&mut out).ok()?; Some(out)
    };
    if all.get(p..p + 8) == Some(b"NCZBLOCK") {
        let exp = all[p + 11] as u32; let cnt = u32le(&all, p + 12) as usize; let total = u64le(&all, p + 16) as usize;
        let bs = 1usize << exp; p += 24;
        let sizes: Vec<usize> = (0..cnt).map(|i| u32le(&all, p + i * 4) as usize).collect(); p += cnt * 4;
        let mut out = Vec::with_capacity(total);
        for (i, cs) in sizes.iter().enumerate() {
            let want = if i + 1 == cnt { total - bs * i } else { bs };
            let chunk = all.get(p..p + cs)?; p += cs;
            if *cs < want { out.extend(unz(chunk)?) } else { out.extend_from_slice(chunk) }
        }
        Some(out)
    } else { unz(&all[p..]) }
}

/* Ok(Some)=아이콘, Ok(None)=control NCA가 아님, Err("key:이름")=키 없음, Err("hdr")=머리글 복호화 실패, Err(이유)=control인데 못 읽음 */
fn control_icon(f: &mut File, nca: u64, size: u64, ncz: bool, keys: &Keys, tiks: &HashMap<Vec<u8>, Vec<u8>>) -> Result<Option<Vec<u8>>, String> {
    let hk = keys.0.get("header_key").ok_or("key:header_key")?;
    let Some(mut h) = rd(f, nca, 0xC00) else { return Err("파일이 잘렸음".into()) };
    xts_dec(hk, &mut h, 0, 0x200);
    if &h[0x200..0x204] != b"NCA3" && &h[0x200..0x204] != b"NCA2" { return Err("hdr".into()) }
    if h[0x205] != 2 { return Ok(None) } // control만
    let rev = key_rev(&h);
    let rights = h[0x230..0x240].to_vec();
    let mut plain: Option<std::rc::Rc<Vec<u8>>> = None;
    for sec in 0..4usize {
        let fh = h[0x400 + sec * 0x200..0x600 + sec * 0x200].to_vec();
        let start = u32le(&h, 0x240 + sec * 16) as u64 * 0x200;
        // 섹션 머리글: 0x2 FsType(0=RomFS, 1=PartitionFs), 0x3 HashType, 0x4 EncryptionType
        if start == 0 || fh[2] != 0 { continue } // RomFS 아님
        if &fh[8..12] != b"IVFC" { return Err("RomFS 형식이 낯섦".into()) }
        let crypt = fh[4];
        let body = if ncz {
            if plain.is_none() { plain = ncz_body(f, nca, size).map(std::rc::Rc::new) }
            let Some(p) = plain.clone() else { return Err("NCZ 압축을 풀지 못함".into()) };
            Body::Plain(p)
        } else {
            let key: Vec<u8> = if rights.iter().any(|&b| b != 0) {
                let Some(enc) = tiks.get(&rights) else { return Err("티켓(.tik)이 없어 title key를 알 수 없음".into()) };
                let kn = format!("titlekek_{rev:02x}");
                ecb_dec(keys.0.get(&kn).ok_or(format!("key:{kn}"))?, enc)
            } else {
                let name = match h[0x207] { 0 => "application", 1 => "ocean", _ => "system" };
                let kn = format!("key_area_key_{name}_{rev:02x}");
                ecb_dec(keys.0.get(&kn).ok_or(format!("key:{kn}"))?, &h[0x300..0x340])[0x20..0x30].to_vec()
            };
            if crypt != 3 && crypt != 1 { return Err(format!("지원하지 않는 암호 방식({crypt})")) }
            let mut ctr8 = [0u8; 8];
            for j in 0..8 { ctr8[j] = fh[0x140 + 7 - j] }
            Body::Nca { key, ctr8, crypt }
        };
        // IVFC 6번째 단계가 실제 RomFS
        let romfs = start + u64le(&fh, 8 + 0x10 + 5 * 0x18);
        let Some(rh) = body_read(f, nca, &body, romfs, 0x50) else { return Err("RomFS를 읽지 못함".into()) };
        let (fm_off, fm_size, data_off) = (u64le(&rh, 0x38), u64le(&rh, 0x40) as usize, u64le(&rh, 0x48));
        if fm_size == 0 || fm_size > 1 << 20 { return Err("RomFS를 풀지 못함 (키가 맞지 않을 수 있음)".into()) }
        let Some(fm) = body_read(f, nca, &body, romfs + fm_off, fm_size) else { return Err("RomFS를 읽지 못함".into()) };
        let mut pos = 0usize;
        let mut best: Option<(u64, u64, u8)> = None;
        while pos + 0x20 <= fm.len() {
            let (off, size, nl) = (u64le(&fm, pos + 8), u64le(&fm, pos + 16), u32le(&fm, pos + 0x1C) as usize);
            if pos + 0x20 + nl > fm.len() { break }
            let name = String::from_utf8_lossy(&fm[pos + 0x20..pos + 0x20 + nl]).into_owned();
            if name.starts_with("icon_") && name.ends_with(".dat") {
                // 한국어 > 미국 영어 > 일본어 > 그 밖
                let rank = match name.as_str() { "icon_Korean.dat" => 0, "icon_AmericanEnglish.dat" => 1, "icon_Japanese.dat" => 2, _ => 3 };
                if best.map(|b| rank < b.2).unwrap_or(true) { best = Some((off, size, rank)) }
            }
            pos += 0x20 + ((nl + 3) & !3);
        }
        let Some((off, size, _)) = best else { return Err("control 안에 아이콘 파일(icon_*.dat)이 없음".into()) };
        let Some(img) = body_read(f, nca, &body, romfs + data_off + off, (size as usize).min(1 << 20)) else { return Err("아이콘을 읽지 못함".into()) };
        return if img.starts_with(&[0xFF, 0xD8]) || img.starts_with(b"\x89PNG") { Ok(Some(img)) } else { Err("아이콘이 그림 형식이 아님 (키가 맞지 않을 수 있음)".into()) };
    }
    Err("control에 RomFS가 없음".into())
}

/* 결과: Ok(그림) / Err(NxFail) */
pub enum NxFail { NoKeys, Key(String), Why(String) }
pub fn icon_switch(path: &Path) -> Result<Vec<u8>, NxFail> {
    let why = |s: &str| NxFail::Why(s.to_string());
    let keys = KEYS.lock().unwrap().clone().ok_or(NxFail::NoKeys)?;
    let Ok(mut f) = File::open(path) else { return Err(why("파일을 열 수 없음")) };
    let ext = path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    let files = if ext == "xci" || ext == "xcz" {
        let Some(h) = rd(&mut f, 0, 0x200) else { return Err(why("파일이 너무 작음")) };
        if &h[0x100..0x104] != b"HEAD" { return Err(why("XCI 형식이 아님")) }
        let root = u64le(&h, 0x130);
        let Some(parts) = fs_list(&mut f, root) else { return Err(why("XCI 안의 목록(HFS0)을 읽지 못함")) };
        let Some(sec) = parts.iter().find(|e| e.name == "secure") else { return Err(why("XCI에 secure 영역이 없음")) };
        fs_list(&mut f, sec.off).ok_or_else(|| why("XCI secure 영역을 읽지 못함"))?
    } else {
        fs_list(&mut f, 0).ok_or_else(|| why("NSP 형식(PFS0)이 아님"))?
    };
    let tiks = tickets(&mut f, &files);
    // control NCA는 작다: 작은 것부터 모두 본다 (DLC가 많이 든 파일도 있어서)
    let mut ncas: Vec<(&Entry, bool)> = files.iter().filter_map(|e| {
        let n = e.name.to_ascii_lowercase();
        if n.ends_with(".cnmt.nca") || n.ends_with(".cnmt.ncz") { None }
        else if n.ends_with(".nca") { Some((e, false)) } else if n.ends_with(".ncz") { Some((e, true)) } else { None }
    }).collect();
    if ncas.is_empty() { return Err(why("파일 안에 NCA가 없음")) }
    ncas.sort_by_key(|e| e.0.size);
    let (mut key, mut reason, mut hdr_bad, mut seen) = (None::<String>, None::<String>, 0usize, 0usize);
    for (e, ncz) in ncas.iter().take(64) {
        seen += 1;
        match control_icon(&mut f, e.off, e.size, *ncz, &keys, &tiks) {
            Ok(Some(img)) => return Ok(img),
            Ok(None) => {}
            Err(k) if k.starts_with("key:") => { if key.is_none() { key = Some(k[4..].to_string()) } }
            Err(k) if k == "hdr" => hdr_bad += 1,
            Err(k) => { if reason.is_none() { reason = Some(k) } }
        }
    }
    if let Some(k) = key { return Err(NxFail::Key(k)) }
    if let Some(r) = reason { return Err(NxFail::Why(r)) }
    if hdr_bad == seen { return Err(why("NCA 머리글을 풀지 못함 (prod.keys의 header_key가 맞지 않음)")) }
    Err(why("control NCA가 없음 (업데이트·DLC만 든 파일일 수 있음)"))
}

#[cfg(test)]
mod nx_tests {
    use super::*;
    // NX_TEST_DIR=…(mk_nx2.py 결과) cargo test nx_files -- --nocapture
    #[test]
    fn nx_files() {
        let Ok(d) = std::env::var("NX_TEST_DIR") else { return };
        for keys in ["prod.keys", "partial.keys", "wrong.keys"] {
            assert!(set_keys(&[format!("{d}/{keys}")]).is_some());
            let mut v: Vec<_> = std::fs::read_dir(format!("{d}/Switch")).unwrap().flatten().map(|e| e.path()).collect(); v.sort();
            for p in v {
                let r = icon_switch(&p);
                println!("{keys} | {} → {}", p.file_name().unwrap().to_string_lossy(), match r { Ok(b) => format!("이미지 {}바이트 {}", b.len(), if b.starts_with(&[0xFF,0xD8]) {"JPEG"} else {"?"}), Err(NxFail::NoKeys) => "키 파일 없음".into(), Err(NxFail::Key(k)) => format!("키 없음: {k}"), Err(NxFail::Why(w)) => format!("실패: {w}") });
            }
        }
    }
}
