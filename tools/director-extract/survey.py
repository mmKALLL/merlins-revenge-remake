import os, sys, logging, struct, collections
logging.disable(logging.CRITICAL)
from drxtract.cast import parse_cast_file_data
from drxtract.key import parse_key_file_data
b='bin'
keys = parse_key_file_data('<', open(b+'/'+[x for x in os.listdir(b) if x.endswith('KEY_')][0],'rb').read())
# reverse: chunk index -> owner
owner = {}
for own, refs in keys.items():
    for r in refs: owner[r['index']] = (own, r['chunkID'])
types = collections.Counter()
for fn in sorted(os.listdir(b), key=lambda s:int(s.split('.')[0])):
    if not fn.endswith('.CASt'): continue
    idx=int(fn.split('.')[0]); data=open(b+'/'+fn,'rb').read()
    ctype = struct.unpack('>I', data[0:4])[0]
    try: cd=parse_cast_file_data(data); name=cd.get('content',{}).get('name',''); t=cd.get('type')
    except Exception as e: name='?ERR '+str(e)[:40]; t='?'
    types[(ctype,t)]+=1
    refs = keys.get(idx, [])
    if ctype in (6,15) or any(r['chunkID'] in ('snd ','sndH','sndS','ediM','XMED') for r in refs):
        print(idx, ctype, t, repr(name), [(r['chunkID'],r['index']) for r in refs])
print(types)
