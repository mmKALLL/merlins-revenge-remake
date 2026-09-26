"""Dump anm_* bitmap members of the engine .dir to bitmaps/<name>.png, with a
regpoints.tsv (name, cast, member#, w, h, depth, regX, regY).
Only members listed in a CAS* table are used (member_index.txt), so stale CASt
duplicates in the unsaved-compact file are ignored."""
import os, sys, io, struct, re, logging
logging.disable(logging.CRITICAL)
from drxtract.key import parse_key_file_data
from drxtract.cast import parse_cast_file_data
from drxtract.bitd import bitd2bmp
from drxtract.clut import clut2palette
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
    regY, regX = struct.unpack('>hh', s[18:22]); bpp = s[23]
    clutLib, clutId = struct.unpack('>hh', s[24:28]) if len(s) >= 28 else (0, 0)
    pitch &= 0x0fff; w, h = right-left, bottom-top
    refs = {r['chunkID']: r['index'] for r in keys.get(cid, [])}
    bitd = open('bin/%d.BITD' % refs['BITD'], 'rb').read()
    note = ''
    if bpp == 32:
        raw = bitd if len(bitd) == pitch*h else unpack_rle(bitd, pitch*h)
        if len(raw) < pitch*h: note = 'short rle %d/%d' % (len(raw), pitch*h); raw = raw.ljust(pitch*h, b'\0')
        rgba = bytearray(w*h*4)
        for y in range(h):
            r = raw[y*pitch:(y+1)*pitch]
            A, R, G, B = r[0:w], r[w:2*w], r[2*w:3*w], r[3*w:4*w]
            rgba[y*w*4:(y+1)*w*4] = bytes(v for x in range(w) for v in (R[x], G[x], B[x], A[x]))
        im = Image.frombytes('RGBA', (w, h), bytes(rgba))
        lo, hi = im.getchannel('A').getextrema()
        note += ' alpha=%d..%d' % (lo, hi)
    else:
        cd = parse_cast_file_data(data); cd['depth'] = bpp
        clut = bytearray()
        pal = str(cd.get('palette_txt'))
        if pal.isnumeric():
            cref = {r['chunkID']: r['index'] for r in keys.get(int(pal), [])}
            clut = clut2palette(open('bin/%d.CLUT' % cref['CLUT'], 'rb').read())
        im = Image.open(io.BytesIO(bitd2bmp(cd, clut, bitd)))
        note += ' pal=%s' % pal
    fname = name if name not in seen else '%s__member%s' % (name, num)
    seen.add(name)
    im.save('bitmaps/%s.png' % fname)
    rows.append((fname, castname, num, w, h, bpp, regX, regY, note.strip()))
with open('bitmaps/regpoints.tsv', 'w') as f:
    f.write('name\tcast\tmember\twidth\theight\tbpp\tregX\tregY\tnote\n')
    for r in sorted(rows): f.write('\t'.join(map(str, r)) + '\n')
print(len(rows), 'bitmaps')
