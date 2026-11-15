// 롬 파일 안에 들어 있는 타이틀 이미지를 꺼내 PNG로 저장한다.
// NDS 배너 아이콘, PSP ISO/CSO의 PSP_GAME/ICON0.PNG, PBP(EBOOT)의 ICON0, Wii U meta/iconTex.tga
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

pub fn png_rgba(w: u32, h: u32, rgba: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, w, h);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut wr = enc.write_header().ok()?;
        wr.write_image_data(rgba).ok()?;
    }
    Some(out)
}
fn read_at(f: &mut File, off: u64, len: usize) -> Option<Vec<u8>> {
    f.seek(SeekFrom::Start(off)).ok()?;
    let mut b = vec![0u8; len];
    f.read_exact(&mut b).ok()?;
    Some(b)
}
fn u32le(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

/* ---------- NDS: 헤더 0x68의 배너 → 32x32 4bpp 아이콘 + 16색 팔레트 ---------- */
fn nds_icon(path: &Path) -> Option<Vec<u8>> {
    let mut f = File::open(path).ok()?;
    let hdr = read_at(&mut f, 0, 0x200)?;
    let off = u32le(&hdr, 0x68) as u64;
    if off == 0 {
        return None;
    }
    let ban = read_at(&mut f, off, 0x240)?;
    let bmp = &ban[0x20..0x220];
    let pal: Vec<[u8; 4]> = (0..16)
        .map(|i| {
            let c = u16::from_le_bytes([ban[0x220 + i * 2], ban[0x221 + i * 2]]);
            let r = ((c & 31) << 3) as u8;
            let g = (((c >> 5) & 31) << 3) as u8;
            let b = (((c >> 10) & 31) << 3) as u8;
            [r | r >> 5, g | g >> 5, b | b >> 5, if i == 0 { 0 } else { 255 }]
        })
        .collect();
    let mut rgba = vec![0u8; 32 * 32 * 4];
    for y in 0..32 {
        for x in 0..32 {
            let tile = (y / 8) * 4 + x / 8;
            let idx = (y % 8) * 8 + x % 8;
            let byte = bmp[tile * 32 + idx / 2];
            let n = if idx % 2 == 0 { byte & 15 } else { byte >> 4 } as usize;
            let o = (y * 32 + x) * 4;
            rgba[o..o + 4].copy_from_slice(&pal[n]);
        }
    }
    png_rgba(32, 32, &rgba)
}

/* ---------- PBP (PSP EBOOT / PS1 클래식): 헤더의 ICON0 위치 ---------- */
fn pbp_icon(path: &Path) -> Option<Vec<u8>> {
    let mut f = File::open(path).ok()?;
    let h = read_at(&mut f, 0, 0x28)?;
    if &h[0..4] != b"\0PBP" {
        return None;
    }
    let a = u32le(&h, 0x0C) as u64;
    let b = u32le(&h, 0x10) as u64;
    if b <= a || b - a > 4_000_000 {
        return None;
    }
    let data = read_at(&mut f, a, (b - a) as usize)?;
    if data.starts_with(b"\x89PNG") { Some(data) } else { None }
}

/* ---------- ISO9660 (PSP ISO, CSO 압축 포함) ---------- */
trait Sectors {
    fn sector(&mut self, lba: u64) -> Option<Vec<u8>>;
}
struct Iso(File);
impl Sectors for Iso {
    fn sector(&mut self, lba: u64) -> Option<Vec<u8>> {
        read_at(&mut self.0, lba * 2048, 2048)
    }
}
struct Cso {
    f: File,
    block: u64,
    align: u32,
    index: Vec<u32>,
}
impl Cso {
    fn open(path: &Path) -> Option<Cso> {
        let mut f = File::open(path).ok()?;
        let h = read_at(&mut f, 0, 24)?;
        if &h[0..4] != b"CISO" {
            return None;
        }
        let total = u64::from_le_bytes(h[8..16].try_into().ok()?);
        let block = u32le(&h, 16) as u64;
        if block == 0 {
            return None;
        }
        let align = h[21] as u32;
        let n = (total / block + 1) as usize;
        let raw = read_at(&mut f, 24, n * 4)?;
        let index = (0..n).map(|i| u32le(&raw, i * 4)).collect();
        Some(Cso { f, block, align, index })
    }
    fn block_data(&mut self, i: usize) -> Option<Vec<u8>> {
        let e = *self.index.get(i)?;
        let next = *self.index.get(i + 1)?;
        let pos = ((e & 0x7FFF_FFFF) as u64) << self.align;
        let end = ((next & 0x7FFF_FFFF) as u64) << self.align;
        let len = end.saturating_sub(pos).min(self.block * 2) as usize;
        let raw = read_at(&mut self.f, pos, len.max(1))?;
        if e & 0x8000_0000 != 0 {
            return Some(raw[..(self.block as usize).min(raw.len())].to_vec());
        }
        let mut out = Vec::with_capacity(self.block as usize);
        flate2::read::DeflateDecoder::new(&raw[..]).take(self.block).read_to_end(&mut out).ok()?;
        Some(out)
    }
}
impl Sectors for Cso {
    fn sector(&mut self, lba: u64) -> Option<Vec<u8>> {
        let byte = lba * 2048;
        let bi = (byte / self.block) as usize;
        let off = (byte % self.block) as usize;
        let d = self.block_data(bi)?;
        d.get(off..off + 2048).map(|s| s.to_vec())
    }
}
fn read_extent(s: &mut dyn Sectors, lba: u64, size: u64) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let n = size.div_ceil(2048).min(4096);
    for i in 0..n {
        out.extend(s.sector(lba + i)?);
    }
    out.truncate(size as usize);
    Some(out)
}
/// 디렉터리 안에서 이름(대소문자 무시)으로 항목 찾기 → (LBA, 크기)
fn find_in_dir(s: &mut dyn Sectors, lba: u64, size: u64, name: &str) -> Option<(u64, u64)> {
    let d = read_extent(s, lba, size)?;
    let mut i = 0usize;
    while i < d.len() {
        let len = d[i] as usize;
        if len == 0 {
            i = (i / 2048 + 1) * 2048;
            continue;
        }
        if i + 33 > d.len() {
            break;
        }
        let nl = d[i + 32] as usize;
        let nm = String::from_utf8_lossy(d.get(i + 33..i + 33 + nl)?).to_string();
        let nm = nm.split(';').next().unwrap_or("").to_string();
        if nm.eq_ignore_ascii_case(name) {
            return Some((u32le(&d, i + 2) as u64, u32le(&d, i + 10) as u64));
        }
        i += len;
    }
    None
}
fn iso_file(s: &mut dyn Sectors, parts: &[&str]) -> Option<Vec<u8>> {
    let pvd = s.sector(16)?;
    if &pvd[1..6] != b"CD001" {
        return None;
    }
    let (mut lba, mut size) = (u32le(&pvd, 156 + 2) as u64, u32le(&pvd, 156 + 10) as u64);
    for p in parts {
        let (l, sz) = find_in_dir(s, lba, size, p)?;
        lba = l;
        size = sz;
    }
    if size == 0 || size > 4_000_000 {
        return None;
    }
    read_extent(s, lba, size)
}
fn psp_icon(path: &Path, cso: bool) -> Option<Vec<u8>> {
    let data = if cso {
        let mut c = Cso::open(path)?;
        iso_file(&mut c, &["PSP_GAME", "ICON0.PNG"])
    } else {
        let mut i = Iso(File::open(path).ok()?);
        iso_file(&mut i, &["PSP_GAME", "ICON0.PNG"])
    }?;
    if data.starts_with(b"\x89PNG") { Some(data) } else { None }
}

/* ---------- TGA (Wii U meta/iconTex.tga): 무압축·RLE 24/32비트 ---------- */
fn tga_icon(path: &Path) -> Option<Vec<u8>> {
    let mut b = Vec::new();
    File::open(path).ok()?.read_to_end(&mut b).ok()?;
    if b.len() < 18 {
        return None;
    }
    let (idlen, ty) = (b[0] as usize, b[2]);
    let w = u16::from_le_bytes([b[12], b[13]]) as usize;
    let h = u16::from_le_bytes([b[14], b[15]]) as usize;
    let bpp = b[16] as usize / 8;
    let top = b[17] & 0x20 != 0;
    if !(ty == 2 || ty == 10) || !(bpp == 3 || bpp == 4) || w == 0 || h == 0 || w > 2048 || h > 2048 {
        return None;
    }
    let mut px: Vec<u8> = Vec::with_capacity(w * h * 4);
    let mut i = 18 + idlen;
    let push = |px: &mut Vec<u8>, p: &[u8]| px.extend_from_slice(&[p[2], p[1], p[0], if bpp == 4 { p[3] } else { 255 }]);
    while px.len() < w * h * 4 {
        if ty == 2 {
            push(&mut px, b.get(i..i + bpp)?);
            i += bpp;
        } else {
            let c = *b.get(i)? as usize;
            i += 1;
            let n = (c & 0x7F) + 1;
            if c & 0x80 != 0 {
                let p = b.get(i..i + bpp)?.to_vec();
                i += bpp;
                for _ in 0..n { push(&mut px, &p); }
            } else {
                for _ in 0..n {
                    push(&mut px, b.get(i..i + bpp)?);
                    i += bpp;
                }
            }
        }
    }
    px.truncate(w * h * 4);
    if !top {
        let row = w * 4;
        let mut flipped = Vec::with_capacity(px.len());
        for y in (0..h).rev() { flipped.extend_from_slice(&px[y * row..(y + 1) * row]); }
        px = flipped;
    }
    png_rgba(w as u32, h as u32, &px)
}

pub fn extract(path: &Path, kind: &str) -> Option<Vec<u8>> {
    match kind {
        "nds" => nds_icon(path),
        "pbp" => pbp_icon(path),
        "iso" => psp_icon(path, false),
        "cso" => psp_icon(path, true),
        "tga" => tga_icon(path),
        "3ds" => crate::nxicon::icon_3ds(path),
        _ => None,
    }
}
