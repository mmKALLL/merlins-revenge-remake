import sys, struct, wave, array, math, subprocess, os
def stats(path):
    w = wave.open(path); n = w.getnframes(); r = w.getframerate(); bw = w.getsampwidth(); ch=w.getnchannels()
    raw = w.readframes(n)
    if bw == 2: a = array.array('h'); a.frombytes(raw); x = [v/32768 for v in a]
    else: x = [(v-128)/128 for v in raw]
    if ch == 2: x = [(x[i]+x[i+1])/2 for i in range(0,len(x)-1,2)]
    if not x: return n/r, r, bw*8, ch, -99, 0, 0
    rms = math.sqrt(sum(v*v for v in x)/len(x)); peak = max(abs(v) for v in x)
    d = sum(abs(x[i+1]-x[i]) for i in range(len(x)-1))/max(1,len(x)-1); m = sum(abs(v) for v in x)/len(x)
    return n/r, r, bw*8, ch, 20*math.log10(rms+1e-9), peak, d/(m+1e-9)
for p in sys.argv[1:]:
    q = p
    if p.endswith('.mp3'):
        q = '/tmp/_x.wav'; q = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tmp_decoded.wav')
        subprocess.run(['afconvert','-f','WAVE','-d','LEI16',p,q],check=True)
    dur, r, bits, ch, db, peak, rough = stats(q)
    print('%-34s %7.2fs %5d Hz %2d-bit ch=%d rms=%6.1f dBFS peak=%.2f roughness=%.2f' % (os.path.basename(p), dur, r, bits, ch, db, peak, rough))
