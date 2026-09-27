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

def bitmap_header(cast_chunk):
    """Row pitch and bits per pixel from a D5+ bitmap CASt's specific data (the
    last `specificLen` bytes). Layout: pitch u16 (top bits are flags), rect
    (4 x i16), 8 unknown bytes, regY, regX, then flags2 and bitsPerPixel bytes
    when the pitch's 0x8000 flag is set. drxtract reads flags2+bpp as one signed
    int16, so a member with flags2 = 0x80 (0x8020 < 0) silently falls back to
    a guess from the pitch's high byte (0x83 -> 8, 0x84 -> 16): that is why the old tlk_merlin* sheets and
    tlk_merlin4Objects looked 8/16-bit and decoded badly. They are 32-bit."""
    spec_len = struct.unpack('>I', cast_chunk[8:12])[0]
    spec = cast_chunk[-spec_len:]
    raw_pitch = struct.unpack('>H', spec[0:2])[0]
    bpp = spec[23] if raw_pitch & 0x8000 and len(spec) >= 24 else 1
    return raw_pitch & 0x3fff, bpp

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
    w, h = cd['width'], cd['height']
    pitch, depth = bitmap_header(data)
    print('%5d %-24s %4dx%-4d bpp=%-2d pitch=%-4d BITD=%s' % (idx, name, w, h, depth, pitch, refs.get('BITD')))
    if 'BITD' not in refs: print('   !! no BITD'); continue
    bitd = open(os.path.join(bindir, '%d.BITD' % refs['BITD']), 'rb').read()
    out = os.path.join(outdir, name + '.png')
    try:
        if depth == 32:
            im = decode32(bitd, w, h, pitch)
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
