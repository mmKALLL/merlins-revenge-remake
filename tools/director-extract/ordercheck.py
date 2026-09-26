import os, struct, array
def rough(x):
    d = sum(abs(x[i+1]-x[i]) for i in range(len(x)-1))/(len(x)-1); m = sum(abs(v) for v in x)/len(x); return d/(m+1e-9)
for fn in sorted(os.listdir('bin')):
    if not fn.endswith('.sndH'): continue
    h = struct.unpack('>25I', open('bin/'+fn,'rb').read()); i = int(fn.split('.')[0])
    s = open('bin/%d.sndS'%(i+1),'rb').read()
    if h[17]==16:
        be = [v/32768 for v in struct.unpack('>%dh'%(len(s)//2), s[:len(s)//2*2])]
        le = [v/32768 for v in struct.unpack('<%dh'%(len(s)//2), s[:len(s)//2*2])]
        print(i, '16bit BE %.2f LE %.2f' % (rough(be), rough(le)))
    else:
        u = [(v-128)/128 for v in s]; sg = [(v if v<128 else v-256)/128 for v in s]
        print(i, ' 8bit unsigned %.2f signed %.2f' % (rough(u), rough(sg)))
