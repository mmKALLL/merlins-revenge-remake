"""Extract tlk_* bitmap cast members from a drxtract 'bin' chunk folder to PNG.
Uses drxtract to parse CASt + KEY_ and to decode 1/4/8/16-bit BITD; decodes
32-bit BITD itself so the alpha plane is kept (drxtract discards it)."""
import os, sys, io, struct, logging
logging.disable(logging.CRITICAL)
from drxtract.cast import parse_cast_file_data
from drxtract.key import parse_key_file_data
from drxtract.bitd import bitd2bmp
from drxtract.clut import clut2palette
from PIL import Image

def unpack_rle(fdata, total):
    """PackBits-style RLE used by Director BITD chunks."""
    out = bytearray(); i = 0
    while i < len(fdata) and len(out) < total:
        v = fdata[i]; i += 1
        if v & 0x80:
            out += bytes([fdata[i]]) * (257 - v); i += 1
        else:
            n = v + 1; out += fdata[i:i+n]; i += n
    return out, i

def decode32(fdata, w, h, pitch):
    """32-bit Director bitmap: each row is `pitch` bytes holding four planes
    of `w` bytes: A, R, G, B (drxtract reads them as A,B,G,R in the BMP's
    bottom-up mirror; we verify visually)."""
    raw, used = unpack_rle(fdata, pitch * h)
    if len(raw) < pitch * h or used != len(fdata):
        print('   ! rle: got %d/%d bytes, consumed %d/%d' % (len(raw), pitch*h, used, len(fdata)))
    rgba = bytearray(w * h * 4)
    for y in range(h):
        row = raw[y*pitch:(y+1)*pitch]
        A, R, G, B = row[0:w], row[w:2*w], row[2*w:3*w], row[3*w:4*w]
        for x in range(w):
            p = (y*w + x) * 4
            rgba[p] = R[x]; rgba[p+1] = G[x]; rgba[p+2] = B[x]; rgba[p+3] = A[x]
    return Image.frombytes('RGBA', (w, h), bytes(rgba))

bindir, outdir = sys.argv[1], sys.argv[2]
only = sys.argv[3:]  # optional name filter
os.makedirs(outdir, exist_ok=True)
keyf = [f for f in os.listdir(bindir) if f.endswith('KEY_')][0]
keys = parse_key_file_data('<', open(os.path.join(bindir, keyf),'rb').read())
for f in sorted(os.listdir(bindir), key=lambda s: int(s.split('.')[0])):
    if not f.endswith('.CASt'): continue
    idx = int(f.split('.')[0])
    data = open(os.path.join(bindir, f), 'rb').read()
    try: cd = parse_cast_file_data(data)
    except Exception as e: continue
    if cd.get('type') != 'bitmap': continue
    name = cd.get('content', {}).get('name', '')
    if not name.startswith('tlk_'): continue
    if only and name not in only: continue
    refs = {r['chunkID']: r['index'] for r in keys.get(idx, [])}
    w, h, depth = cd['width'], cd['height'], cd['depth']
    # drxtract reads flags2+bpp bytes as one int16; low byte is the real bpp
    flags2 = 0
    if depth > 32:
        flags2, depth = depth >> 8, depth & 0xff
    print('%5d %-24s %4dx%-4d bpp=%-2d flags2=0x%02x pal=%s BITD=%s' % (idx, name, w, h, depth, flags2, cd.get('palette_txt'), refs.get('BITD')))
    if 'BITD' not in refs: print('   !! no BITD'); continue
    bitd = open(os.path.join(bindir, '%d.BITD' % refs['BITD']), 'rb').read()
    out = os.path.join(outdir, name + '.png')
    try:
        if depth == 32:
            # pitch: first int16 of the bitmap header (after the name/extra strings)
            # = row bytes; equals w*4 for 32bpp. Recompute rather than re-parse.
            im = decode32(bitd, w, h, w * 4)
            a = im.getchannel('A'); lo, hi = a.getextrema()
            print('   alpha range %s' % ((lo, hi),))
            if lo == hi == 0:
                print('   alpha plane all zero -> dropping to RGB'); im = im.convert('RGB')
        else:
            cd['depth'] = depth
            clut = bytearray()
            pal = str(cd.get('palette_txt'))
            if pal.isnumeric():
                cref = {r['chunkID']: r['index'] for r in keys.get(int(pal), [])}
                clut = clut2palette(open(os.path.join(bindir, '%d.CLUT' % cref['CLUT']), 'rb').read())
            im = Image.open(io.BytesIO(bitd2bmp(cd, clut, bitd)))
        im.save(out)
        print('   -> %s %s %s' % (out, im.size, im.mode))
    except Exception as e:
        import traceback; traceback.print_exc()
        print('   !! decode failed:', repr(e)[:200])
