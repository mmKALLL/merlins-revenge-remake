"""Match fan-kit WAVs to extracted engine WAVs by sample correlation (after resampling to 8 kHz)."""
import os, sys, wave, numpy as np
FK = sys.argv[1]
def load(p):
    w = wave.open(p); n=w.getnframes(); r=w.getframerate(); b=w.getsampwidth(); raw=w.readframes(n)
    x = (np.frombuffer(raw, '<i2')/32768.) if b==2 else (np.frombuffer(raw,'u1')/128.-1)
    t = np.arange(0, len(x)/r, 1/8000.); return np.interp(t, np.arange(len(x))/r, x), n/r
eng = {f[:-4]: load('out/'+f) for f in os.listdir('out') if f.endswith('.wav') and 'orig_fmt' not in f}
for f in sorted(os.listdir(FK)):
    x, dx = load(os.path.join(FK,f)); best=[]
    for name,(y,dy) in eng.items():
        n=min(len(x),len(y)); 
        if n < 100: continue
        a=x[:n]-x[:n].mean(); b=y[:n]-y[:n].mean()
        c=float(np.dot(a,b)/(np.linalg.norm(a)*np.linalg.norm(b)+1e-12))
        best.append((c,name,dy))
    best.sort(reverse=True); c,name,dy=best[0]
    print('%-22s %5.2fs  best=%-20s corr=%.3f (%.2fs)  2nd=%s %.3f' % (f, dx, name, c, dy, best[1][1], best[1][0]))
