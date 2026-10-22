"""Print the sprites ("marks") on one frame of the score: channel, member, ink, colours and the
sprite rect (loc top, left, height, width in stage px). Run in the folder holding bin/ (walk.py,
with VWSC in its chunk list) and member_index.txt (member_index.py).
usage: score_marks.py <frame>   (frame labels are in the VWLB chunk; the engine's gameScreen is 240)

The VWSC chunk (Director 7+) starts with a table of entries; entry 0 holds the frames: a header
(size, header length, frame count, version, sprite record size 48, channel count, channels shown),
then per frame a u16 length and (u16 length, u16 offset, bytes) deltas onto one running channel
buffer. The first 6 records are the frame's main channels (tempo, palette, sound, ...); sprite
channel n is record 6 + n - 1. A sprite record: type u8, ink u8, fore u8, back u8, cast lib i16,
member i16, then 4 bytes, top i16, left i16, height i16, width i16."""
import struct, sys

MAIN_CHANNELS = 6
score = open('bin/' + next(f for f in __import__('os').listdir('bin') if f.endswith('.VWSC')), 'rb').read()
entries = struct.unpack('>I', score[16:20])[0]
offsets = struct.unpack('>%dI' % entries, score[24:24 + 4 * entries])
base = 24 + 4 * entries
frames_data = score[base + offsets[0]: base + offsets[1]]
_, header_len, frame_count, _, record, channels, shown = struct.unpack('>IIIHHHH', frames_data[:20])

names = {}
for line in open('member_index.txt'):
    p = line.split()
    names[(int(p[1]) >> 16, int(p[2]))] = p[5]

want = int(sys.argv[1])
channel_buf = bytearray((channels + 1) * record)
pos, frame = header_len, 0
while frame < want:
    length, = struct.unpack('>H', frames_data[pos:pos + 2])
    q = pos + 2
    while q < pos + length:
        n, off = struct.unpack('>HH', frames_data[q:q + 4])
        channel_buf[off:off + n] = frames_data[q + 4:q + 4 + n]
        q += 4 + n
    pos += length
    frame += 1

for ch in range(shown):
    r = channel_buf[(MAIN_CHANNELS + ch) * record:(MAIN_CHANNELS + ch + 1) * record]
    _, ink, fore, back, lib, member = struct.unpack('>BBBBhh', r[:8])
    if member == 0:
        continue
    top, left, height, width = struct.unpack('>hhhh', r[12:20])
    name = names.get((lib, member), '%d:%d' % (lib, member))
    print('%3d %-36s ink %2d fore %3d back %3d  top %4d left %4d  h %4d w %4d' % (ch + 1, name, ink & 0x3f, fore, back, top, left, height, width))
