# 가짜 키로 Switch NSP와 3DS CIA를 만들어 아이콘 추출을 시험한다
import os, struct, sys
from Crypto.Cipher import AES

out = sys.argv[1]
os.makedirs(out + '/Switch', exist_ok=True); os.makedirs(out + '/3DS', exist_ok=True)
jpeg = open(sys.argv[2], 'rb').read()

hk = os.urandom(32); kak = os.urandom(16); kek = os.urandom(16)
open(out + '/prod.keys', 'w').write(f"header_key = {hk.hex()}\nkey_area_key_application_00 = {kak.hex()}\ntitlekek_00 = {kek.hex()}\n")

def ecb(k, d): return AES.new(k, AES.MODE_ECB).encrypt(d)
def xts_enc(key, data, sector=0x200):
    k1, k2 = AES.new(key[:16], AES.MODE_ECB), AES.new(key[16:], AES.MODE_ECB)
    out = bytearray()
    for si in range(len(data) // sector):
        t = bytearray(k2.encrypt(bytes(8) + struct.pack('>Q', si)))
        for bi in range(sector // 16):
            blk = data[si*sector + bi*16: si*sector + bi*16 + 16]
            x = bytes(a ^ b for a, b in zip(blk, t))
            y = k1.encrypt(x)
            out += bytes(a ^ b for a, b in zip(y, t))
            carry = 0
            for i in range(16):
                nc = t[i] >> 7; t[i] = ((t[i] << 1) & 0xFF) | carry; carry = nc
            if carry: t[0] ^= 0x87
    return bytes(out)
def ctr_enc(key, ctr8, nca_off, data):
    c = AES.new(key, AES.MODE_ECB); out = bytearray(data)
    for i in range(0, len(data), 16):
        ks = c.encrypt(bytes(ctr8) + struct.pack('>Q', (nca_off + i) >> 4))
        for j in range(16): out[i+j] ^= ks[j]
    return bytes(out)

def romfs(files):
    # 파일 목록 → RomFS 바이트
    meta = bytearray(); data = bytearray()
    for i, (name, body) in enumerate(files):
        nm = name.encode(); pad = (4 - len(nm) % 4) % 4
        sib = 0xFFFFFFFF if i == len(files) - 1 else len(meta) + 0x20 + len(nm) + pad
        meta += struct.pack('<IIQQII', 0, sib, len(data), len(body), 0xFFFFFFFF, len(nm)) + nm + bytes(pad)
        data += body + bytes((16 - len(body) % 16) % 16)
    dirm = struct.pack('<IIIIII', 0, 0xFFFFFFFF, 0xFFFFFFFF, 0, 0xFFFFFFFF, 0)
    hdr_size = 0x50
    off = hdr_size
    dh_off = off; off += 4
    dm_off = off; off += len(dirm)
    fh_off = off; off += 4
    fm_off = off; off += len(meta)
    data_off = (off + 15) & ~15
    h = struct.pack('<QQQQQQQQQQ', hdr_size, dh_off, 4, dm_off, len(dirm), fh_off, 4, fm_off, len(meta), data_off)
    body = h + struct.pack('<I', 0) + dirm + struct.pack('<I', 0) + meta
    body += bytes(data_off - len(body)) + data
    return body + bytes((0x200 - len(body) % 0x200) % 0x200)

def nca(rights=None, ctype=2, start=0xC00, want_plain=False):
    sec_key = os.urandom(16); ctr8 = os.urandom(8)
    rf = romfs([('control.nacp', b'NACP' + bytes(60)), ('icon_Japanese.dat', b'\xff\xd8JUNK'), ('icon_AmericanEnglish.dat', jpeg)])
    lvl_off = 0x4000  # IVFC 6단계 위치 (섹션 안)
    sec_data = bytes(lvl_off) + rf
    sec_data += bytes((0x200 - len(sec_data) % 0x200) % 0x200)
    h = bytearray(0xC00)
    h[0x200:0x204] = b'NCA3'; h[0x205] = ctype; h[0x206] = 0; h[0x207] = 0; h[0x220] = 0
    struct.pack_into('<Q', h, 0x208, start + len(sec_data))
    if rights: h[0x230:0x240] = rights
    struct.pack_into('<II', h, 0x240, start // 0x200, (start + len(sec_data)) // 0x200)
    area = os.urandom(32) + sec_key + os.urandom(16)
    h[0x300:0x340] = ecb(kak, area)
    fh = bytearray(0x200); fh[2] = 0; fh[3] = 3; fh[4] = 3; fh[8:12] = b'IVFC'
    struct.pack_into('<Q', fh, 8 + 0x10 + 5 * 0x18, lvl_off)
    fh[0x140:0x148] = ctr8[::-1]  # 저장은 거꾸로 (읽을 때 뒤집는다)
    h[0x400:0x600] = fh
    key = sec_key
    tik = None
    if rights:
        tkey = os.urandom(16); key = tkey
        t = bytearray(0x2C0); struct.pack_into('<I', t, 0, 0x10004)
        t[0x180:0x190] = ecb(kek, tkey); t[0x2A0:0x2B0] = rights
        tik = bytes(t)
    pad = bytes(start - 0xC00)
    enc = xts_enc(hk, bytes(h)) + pad + ctr_enc(key, ctr8, start, sec_data)
    if want_plain: return enc, tik, bytes(h) + pad + sec_data, key, ctr8
    return enc, tik

def pfs0(files):
    names = b''; ents = b''; data = b''
    for n, d in files:
        ents += struct.pack('<QQII', len(data), len(d), len(names), 0)
        names += n.encode() + b'\0'; data += d
    names += bytes((0x20 - (0x10 + len(ents) + len(names)) % 0x20) % 0x20)
    return b'PFS0' + struct.pack('<III', len(files), len(names), 0) + ents + names + data

# 1) 키 영역 방식
c1, _ = nca()
prog = os.urandom(0x40000)  # 아무 내용 없는 큰 NCA
open(out + '/Switch/Key Area Game [0100000000010000].nsp', 'wb').write(pfs0([('aaaa.nca', prog), ('bbbb.nca', c1), ('cccc.cnmt.nca', os.urandom(0x800))]))
# 2) titlekey 방식 (티켓)
rid = os.urandom(16)
c2, tik = nca(rights=rid)
open(out + '/Switch/Ticket Game [0100000000020000].nsp', 'wb').write(pfs0([('dddd.nca', c2), (rid.hex() + '.tik', tik), ('eeee.nca', os.urandom(0x30000))]))

# 3) 3DS CIA: SMDH 아이콘 (가로 빨강→세로 초록 그라데이션)
smdh = bytearray(0x36C0); smdh[0:4] = b'SMDH'
for ty in range(6):
    for tx in range(6):
        for i in range(64):
            x = (i & 1) | ((i >> 1) & 2) | ((i >> 2) & 4); y = ((i >> 1) & 1) | ((i >> 2) & 2) | ((i >> 3) & 4)
            X, Y = tx*8 + x, ty*8 + y
            v = ((X * 31 // 47) << 11) | ((Y * 63 // 47) << 5) | 8
            struct.pack_into('<H', smdh, 0x24C0 + ((ty*6 + tx)*64 + i)*2, v)
hdr = bytearray(0x2020); struct.pack_into('<IHHIIIIQ', hdr, 0, 0x2020, 0, 0, 0, 0, 0, 0x3AC0, 0x40)
al = lambda v: (v + 63) & ~63
cia = bytes(hdr) + bytes(al(0x2020) - 0x2020) + bytes(0x40) + bytes(0x400) + bytes(smdh)
open(out + '/3DS/Gradient Test (USA).cia', 'wb').write(cia)

import zstandard
def ncz(enc, plain, key, ctr8, block=False):
    body = plain[0x4000:]
    sec = struct.pack('<QQQQ', 0x4000, len(body), 3, 0) + key + ctr8[::-1] + bytes(8)
    out = enc[:0x4000] + b'NCZSECTN' + struct.pack('<Q', 1) + sec
    if not block:
        return out + zstandard.ZstdCompressor().compress(body)
    exp = 14; bs = 1 << exp
    blocks = [body[i:i+bs] for i in range(0, len(body), bs)]
    comp = []
    for b in blocks:
        c = zstandard.ZstdCompressor().compress(b)
        comp.append(c if len(c) < len(b) else b)
    hdr = b'NCZBLOCK' + bytes([2, 1, 0, exp]) + struct.pack('<IQ', len(blocks), len(body)) + b''.join(struct.pack('<I', len(c)) for c in comp)
    return out + hdr + b''.join(comp)
for blk in (False, True):
    enc, _, plain, key, ctr8 = nca(start=0x4000, want_plain=True)
    z = ncz(enc, plain, key, ctr8, blk)
    open(out + f'/Switch/NSZ {"Block" if blk else "Stream"} [0100000000030000].nsz', 'wb').write(pfs0([('ffff.ncz', z), ('gggg.ncz', os.urandom(0x50000))]))
# 키 세대가 높은 게임 (prod.keys에 없는 세대)
enc, _ = nca(); e2 = bytearray(enc)
open(out + '/Switch/Plain Again [0100000000040000].nsp', 'wb').write(pfs0([('hhhh.nca', enc)]))
print('made')
