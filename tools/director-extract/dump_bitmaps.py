"""Dump anm_* bitmap members of the engine .dir to bitmaps/<name>.png, with a
regpoints.tsv (name, cast, member#, w, h, depth, regX, regY).
Only members listed in a CAS* table are used (member_index.txt), so stale CASt
duplicates in the unsaved-compact file are ignored.

The bitmap CASt specific data (D5+) is read here, not through drxtract:
  pitch u16 (flag bits on top) | rect top, left, bottom, right i16 | 8 bytes |
  regY i16 | regX i16 | flags2 u8 | bitsPerPixel u8 | clutCastLib i16 | clutId i16
drxtract reads the palette from the clutCastLib field (always -1, which it turns into
'rainbow'); the real palette is clutId: a built-in palette when <= 0 (stored one above
Director's id, e.g. -101 -> -102 System - Win) or a palette member number otherwise.

BITD pixel data is PackBits RLE unless its length is exactly pitch * height, in which
case it is stored raw. 32-bit rows are four planes (A, R, G, B) when compressed but
interleaved ARGB pixels when raw."""
import os, sys, struct, logging
logging.disable(logging.CRITICAL)
from drxtract.key import parse_key_file_data
from drxtract.clut import clut2rgb
from drxtract.common import adjust_palette, get_palette_name
from drxtract.bitd.decoder import PALETTES
from PIL import Image
PREFIXES = sys.argv[1:] or ['anm_bowOrc_','anm_swordOrc_','anm_orcHouse_','anm_goblinHut_','anm_goblinMageHut_','anm_goblinMage_','anm_spell_']
keys = parse_key_file_data('<', open('bin/'+[x for x in os.listdir('bin') if x.endswith('KEY_')][0],'rb').read())
os.makedirs('bitmaps', exist_ok=True)

def unpack_rle(d, total):
    out = bytearray(); i = 0
    while i < len(d) and len(out) < total:
        v = d[i]; i += 1
        if v & 0x80: out += bytes([d[i]]) * (257 - v); i += 1
        else: out += d[i:i+v+1]; i += v+1
    return bytes(out)

def chunk_of(cid, kind):
    return {r['chunkID']: r['index'] for r in keys.get(cid, [])}.get(kind)

members = {}   # (castname, member number) -> (CASt chunk id, type, name)
for line in open('member_index.txt'):
    p = line.split()
    if len(p) >= 5: members[(p[1], int(p[2]))] = (int(p[3]), p[4], p[5] if len(p) > 5 else '')

def palette_rgb(castname, clutId):
    """256 (r, g, b) entries and a label for a bitmap's clutId."""
    if clutId <= 0:
        label = get_palette_name(adjust_palette(clutId))
        bgra = PALETTES[8][label]
        return [(bgra[i+2], bgra[i+1], bgra[i]) for i in range(0, 1024, 4)], label
    cid, typ, _ = members[(castname, clutId)]
    assert typ == 'palette', (castname, clutId, typ)
    colours = clut2rgb(open('bin/%d.CLUT' % chunk_of(cid, 'CLUT'), 'rb').read())
    rgb = [tuple(int(c[k:k+2], 16) for k in (1, 3, 5)) for c in colours]
    return rgb + [(0, 0, 0)] * (256 - len(rgb)), 'member %d' % clutId

rows = []
seen = set()
for line in open('member_index.txt'):
    p = line.split()
    if len(p) < 6: continue
    castno, castname, num, cid, typ, name = p[:6]
    if typ != 'bitmap' or not any(name.startswith(p) for p in PREFIXES): continue
    cid = int(cid); data = open('bin/%d.CASt' % cid, 'rb').read()
    il, sl = struct.unpack('>II', data[4:12]); s = data[12+il:12+il+sl]
    pitch, top, left, bottom, right = struct.unpack('>H4h', s[:10])
    regY, regX = struct.unpack('>hh', s[18:22]); bpp = s[23] if len(s) > 23 else 1
    clutLib, clutId = struct.unpack('>hh', s[24:28]) if len(s) >= 28 else (0, 0)
    pitch &= 0x0fff; w, h = right-left, bottom-top
    bitd = open('bin/%d.BITD' % chunk_of(cid, 'BITD'), 'rb').read()
    is_raw = len(bitd) == pitch*h
    raw = bitd if is_raw else unpack_rle(bitd, pitch*h)
    note = 'raw' if is_raw else ''
    if len(raw) < pitch*h: note += ' short rle %d/%d' % (len(raw), pitch*h); raw = raw.ljust(pitch*h, b'\0')
    if bpp == 32:
        rgba = bytearray(w*h*4)
        for y in range(h):
            r = raw[y*pitch:(y+1)*pitch]
            if is_raw: argb = [r[4*x:4*x+4] for x in range(w)]
            else: argb = [(r[x], r[w+x], r[2*w+x], r[3*w+x]) for x in range(w)]
            rgba[y*w*4:(y+1)*w*4] = bytes(v for a, rr, g, b in argb for v in (rr, g, b, a))
        im = Image.frombytes('RGBA', (w, h), bytes(rgba))
        lo, hi = im.getchannel('A').getextrema()
        note += ' alpha=%d..%d' % (lo, hi)
    elif bpp == 8:
        pal, label = palette_rgb(castname, clutId)
        im = Image.frombytes('RGB', (w, h), bytes(v for y in range(h) for i in raw[y*pitch:y*pitch+w] for v in pal[i]))
        note += ' pal=%s' % label
    elif bpp == 1:
        im = Image.frombytes('1', (w, h), bytes(b ^ 0xff for y in range(h) for b in raw[y*pitch:y*pitch+(w+7)//8]))
        note += ' 1-bit'
    else:
        print('skipped %s: %d-bit' % (name, bpp)); continue
    fname = name if name not in seen else '%s__member%s' % (name, num)
    seen.add(name)
    im.save('bitmaps/%s.png' % fname)
    rows.append((fname, castname, num, w, h, bpp, regX, regY, note.strip()))
with open('bitmaps/regpoints.tsv', 'w') as f:
    f.write('name\tcast\tmember\twidth\theight\tbpp\tregX\tregY\tnote\n')
    for r in sorted(rows): f.write('\t'.join(map(str, r)) + '\n')
print(len(rows), 'bitmaps')
