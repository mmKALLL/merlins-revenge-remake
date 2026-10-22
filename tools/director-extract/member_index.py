"""Write member_index.txt for a movie dumped by walk.py into bin/: one line per cast member,
  <CAS* chunk> <cast owner id> <member number> <CASt chunk> <type> <name>
The owner id's high 16 bits are the cast library number the score uses (gfx is 2 in the engine).
dump_bitmaps.py and score_marks.py read this file. Spaces in names become underscores."""
import os, struct, logging
logging.disable(logging.CRITICAL)
from drxtract.key import parse_key_file_data
from drxtract.cast import parse_cast_file_data

keys = parse_key_file_data('<', open('bin/' + [x for x in os.listdir('bin') if x.endswith('KEY_')][0], 'rb').read())
owner = {r['index']: own for own, refs in keys.items() for r in refs}
with open('member_index.txt', 'w') as out:
    for fn in sorted(f for f in os.listdir('bin') if f.endswith('.CAS_')):
        idx = int(fn.split('.')[0])
        data = open('bin/' + fn, 'rb').read()
        for num, cid in enumerate(struct.unpack('>%dI' % (len(data) // 4), data), 1):
            path = 'bin/%d.CASt' % cid
            if cid == 0 or not os.path.exists(path):
                continue
            try:
                cast = parse_cast_file_data(open(path, 'rb').read())
                name, typ = cast.get('content', {}).get('name', ''), cast.get('type')
            except Exception:
                name, typ = '?', '?'
            out.write('%d %s %d %d %s %s\n' % (idx, owner.get(idx, '-'), num, cid, typ, (name or '-').replace(' ', '_')))
