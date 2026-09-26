import struct, sys, collections
f = open(sys.argv[1],'rb').read()
print('filesize', len(f), 'rifx size', struct.unpack('<I', f[4:8])[0])
# imap
assert f[12:16]==b'pami'
imap_len, = struct.unpack('<I', f[16:20])
cnt, mmap_off, ver = struct.unpack('<III', f[20:32])
print('imap', cnt, hex(mmap_off), ver)
assert f[mmap_off:mmap_off+4]==b'pamm', f[mmap_off:mmap_off+4]
mlen, = struct.unpack('<I', f[mmap_off+4:mmap_off+8])
p = mmap_off+8
hl, el, cmax, cused, junk, junk2, free = struct.unpack('<HHiiiii', f[p:p+24])
print('mmap', hl, el, cmax, cused, junk, junk2, free)
entries=[]
q = p+hl
for i in range(cused):
    e = f[q+i*el:q+(i+1)*el]
    fourcc = e[0:4][::-1].decode('latin1')
    ln, off = struct.unpack('<Ii', e[4:12])
    entries.append((i, fourcc, ln, off))
c = collections.Counter(); bad = collections.Counter()
for i,fc,ln,off in entries:
    c[fc]+=1
    if off+ln+8>len(f) or off<0: bad[fc]+=1
print(c.most_common())
print('bad', bad)
import os
out = sys.argv[2] if len(sys.argv)>2 else None
if out:
    os.makedirs(out, exist_ok=True)
    want = {'BITD','CLUT','ALFA','CASt','KEY*','snd ','sndH','sndS','ediM','XMED','CAS*','Cinf','MCsL','Lnam','STXT'}
    mism=0
    for i,fc,ln,off in entries:
        if fc not in want: continue
        hdr = f[off:off+4][::-1].decode('latin1'); hl2, = struct.unpack('<I', f[off+4:off+8])
        if hdr!=fc or hl2!=ln: mism+=1; print('mismatch', i, fc, hdr, ln, hl2); continue
        name = fc.replace('*','_')
        open(os.path.join(out, '%d.%s'%(i,name)),'wb').write(f[off+8:off+8+ln])
    print('mismatches', mism)
