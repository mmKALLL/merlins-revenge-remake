"""Convert the 40 sound cast members of merlin_engine_76_speed.dir (chunks dumped
by walk.py into bin/) to playable files in out/ named by cast member name.
- sndH/sndS pair: raw PCM (sndS, 16-bit big-endian signed or 8-bit unsigned, mono);
  sndH = 25 big-endian uint32: [1]=bytes [9]=frames [11]=rate [12]=byteRate
  [17]=bits [18]=blockAlign [19]=channels [20]=bytes/sample.  -> WAV PCM LE
- ediM starting 'RIFF': an embedded WAV file (IMA ADPCM) -> kept as *_adpcm.wav,
  plus PCM copy via afconvert
- ediM starting ID3 or 0xFFF: an MP3 file -> kept as .mp3"""
import os, sys, struct, logging, subprocess, array
logging.disable(logging.CRITICAL)
from drxtract.cast import parse_cast_file_data
from drxtract.key import parse_key_file_data
b = 'bin'; out = 'out'; os.makedirs(out, exist_ok=True)
keys = parse_key_file_data('<', open(b+'/'+[x for x in os.listdir(b) if x.endswith('KEY_')][0],'rb').read())
def wav(path, pcm, rate, bits, ch):
    ba = ch*bits//8
    hdr = b'RIFF'+struct.pack('<I',36+len(pcm))+b'WAVEfmt '+struct.pack('<IHHIIHH',16,1,ch,rate,rate*ba,ba,bits)+b'data'+struct.pack('<I',len(pcm))
    open(path,'wb').write(hdr+pcm)
for fn in os.listdir(b):
    if not fn.endswith('.CASt'): continue
    idx = int(fn.split('.')[0]); data = open(b+'/'+fn,'rb').read()
    if struct.unpack('>I', data[:4])[0] != 6: continue
    name = parse_cast_file_data(data)['content']['name']
    refs = {r['chunkID']: r['index'] for r in keys.get(idx, [])}
    if 'sndH' in refs:
        h = struct.unpack('>25I', open('%s/%d.sndH'%(b,refs['sndH']),'rb').read())
        s = open('%s/%d.sndS'%(b,refs['sndS']),'rb').read()
        rate, bits, ch = h[11], h[17], h[19]
        assert h[1] == len(s), (name, h[1], len(s))
        if bits == 16:
            a = array.array('h'); a.frombytes(s[:len(s)//2*2]); a.byteswap(); pcm = a.tobytes()
        else:
            pcm = s
        wav('%s/%s.wav'%(out,name), pcm, rate, bits, ch)
        print('%-28s sndH/sndS PCM %2d-bit %5d Hz ch=%d -> %s.wav' % (name, bits, rate, ch, name))
    elif 'ediM' in refs:
        e = open('%s/%d.ediM'%(b,refs['ediM']),'rb').read()
        if e[:4] == b'RIFF':
            fmt = struct.unpack('<H', e[20:22])[0]
            raw = '%s/%s_orig_fmt%d.wav'%(out,name,fmt)
            open(raw,'wb').write(e)
            subprocess.run(['afconvert','-f','WAVE','-d','LEI16',raw,'%s/%s.wav'%(out,name)], check=True)
            print('%-28s ediM WAV fmt=0x%x -> %s.wav (PCM via afconvert)' % (name, fmt, name))
        elif e[:3] == b'ID3' or (e[0] == 0xff and e[1] & 0xe0 == 0xe0):
            open('%s/%s.mp3'%(out,name),'wb').write(e)
            print('%-28s ediM MP3 -> %s.mp3' % (name, name))
        else:
            print('%-28s ediM UNKNOWN %s' % (name, e[:16].hex()))
    else:
        print(name, 'NO MEDIA', refs)
