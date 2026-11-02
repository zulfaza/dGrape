"""Slice a generated sprite strip into head-aligned 768x384 frames.

Builds public/brand/mascot/lying-frames/sprite.webp for the landing hero
(src/components/landing/lying-sloth.tsx). See
architecture/design/assets/mascot-library.md for the source strip.

Usage: python3 -I scripts/build-sloth-sprite.py STRIP OUT_DIR
Pure Pillow (no numpy). Steps: alpha mask -> connected components ->
group small parts with the nearest figure -> align each figure's head to
frame 1's head by template overlap -> fit the union into 768x384.
"""
import sys
from collections import deque
from PIL import Image, ImageChops, ImageStat

strip_path, out_dir = sys.argv[1], sys.argv[2]
strip = Image.open(strip_path).convert("RGBA")
W, H = strip.size
alpha = strip.getchannel("A")
A = alpha.load()
THRESH = 24

# 1. Connected components of the alpha mask (4-neighbour BFS).
label = [[0] * W for _ in range(H)]
comps = []  # list of (pixel list)
for y in range(H):
    row = label[y]
    for x in range(W):
        if row[x] or A[x, y] < THRESH:
            continue
        cid = len(comps) + 1
        pix = []
        q = deque([(x, y)])
        row[x] = cid
        while q:
            px, py = q.popleft()
            pix.append((px, py))
            for nx, ny in ((px + 1, py), (px - 1, py), (px, py + 1), (px, py - 1)):
                if 0 <= nx < W and 0 <= ny < H and not label[ny][nx] and A[nx, ny] >= THRESH:
                    label[ny][nx] = cid
                    q.append((nx, ny))
        comps.append(pix)

big = [i + 1 for i, c in enumerate(comps) if len(c) > 5000]
big.sort(key=lambda cid: min(p[0] for p in comps[cid - 1]))
print("components:", len(comps), "figures:", len(big), [len(comps[c - 1]) for c in big])
assert len(big) == 6, "expected 6 figures"
owner = {cid: cid for cid in big}

# 2. Give each small part to the figure it is nearest to (ring search).
for i, pix in enumerate(comps):
    cid = i + 1
    if cid in owner:
        continue
    found = None
    sample = pix[:: max(1, len(pix) // 40)]
    for r in range(1, 120):
        for (px, py) in sample:
            for nx, ny in ((px + r, py), (px - r, py), (px, py + r), (px, py - r),
                           (px + r, py + r), (px - r, py - r), (px + r, py - r), (px - r, py + r)):
                if 0 <= nx < W and 0 <= ny < H:
                    l = label[ny][nx]
                    if l in big:
                        found = l
                        break
            if found:
                break
        if found:
            break
    owner[cid] = found if found else big[0]

# 3. Cut each figure out on its own transparent image.
frames = []
for cid in big:
    members = [c for c, o in owner.items() if o == cid]
    pts = [p for m in members for p in comps[m - 1]]
    x0 = min(p[0] for p in pts); x1 = max(p[0] for p in pts)
    y0 = min(p[1] for p in pts); y1 = max(p[1] for p in pts)
    pad = 2
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad
    img = Image.new("RGBA", (x1 - x0 + 1, y1 - y0 + 1), (0, 0, 0, 0))
    ip = img.load(); sp = strip.load()
    keep = set(members)
    for y in range(max(0, y0), min(H, y1 + 1)):
        for x in range(max(0, x0), min(W, x1 + 1)):
            l = label[y][x]
            # Soft edge pixels below THRESH have no label: keep them if a
            # labelled neighbour belongs to this figure.
            if l in keep or (l == 0 and sp[x, y][3] > 0 and any(
                0 <= x + dx < W and 0 <= y + dy < H and label[y + dy][x + dx] in keep
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))):
                ip[x - x0, y - y0] = sp[x, y]
    frames.append({"img": img, "origin": (x0, y0)})

# 4. Align heads to frame 1 by maximising template overlap.
def mask(im):
    return im.getchannel("A").point(lambda v: 255 if v >= THRESH else 0)

ref = frames[0]["img"]
rw, rh = ref.size
head_box = (int(rw * 0.03), 0, int(rw * 0.40), int(rh * 0.62))
template = mask(ref).crop(head_box)
tw, th = template.size
t_sum = ImageStat.Stat(template).sum[0]

def score(m, x, y):
    region = m.crop((x, y, x + tw, y + th))
    inter = ImageStat.Stat(ImageChops.multiply(region, template)).sum[0] / 255
    diff = ImageStat.Stat(ImageChops.difference(region, template)).sum[0] / 255
    return inter - 0.6 * diff

offsets = []
for k, fr in enumerate(frames):
    m = mask(fr["img"])
    fw, fh = fr["img"].size
    # Expected head position: same offset from the figure's right-most body
    # is unreliable (limbs move), so search widely around the left side.
    best = None
    for y in range(-10, max(1, fh - th) + 10, 2):
        for x in range(-10, int(fw * 0.5), 2):
            s = score(m, x, y)
            if best is None or s > best[0]:
                best = (s, x, y)
    s, bx, by = best
    for y in range(by - 2, by + 3):
        for x in range(bx - 2, bx + 3):
            s2 = score(m, x, y)
            if s2 > best[0]:
                best = (s2, x, y)
    _, bx, by = best
    # Head template sits at head_box[0], head_box[1] in frame 1.
    shift = (head_box[0] - bx, head_box[1] - by)
    offsets.append(shift)
    print(f"frame {k+1}: head found at ({bx},{by}) score={best[0]:.0f}/{t_sum/255:.0f} shift={shift}")

# 5. Union of aligned frames, then fit into 768x384 like lying.png.
boxes = []
for fr, (sx, sy) in zip(frames, offsets):
    fw, fh = fr["img"].size
    boxes.append((sx, sy, sx + fw, sy + fh))
ux0 = min(b[0] for b in boxes); uy0 = min(b[1] for b in boxes)
ux1 = max(b[2] for b in boxes); uy1 = max(b[3] for b in boxes)
uw, uh = ux1 - ux0, uy1 - uy0
CW, CH, M = 768, 384, 12
scale = min((CW - 2 * M) / uw, (CH - 2 * M) / uh)
ox = (CW - uw * scale) / 2
oy = (CH - uh * scale) / 2
print(f"union {uw}x{uh} scale {scale:.3f}")

out_frames = []
for k, (fr, (sx, sy)) in enumerate(zip(frames, offsets)):
    canvas = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    fw, fh = fr["img"].size
    scaled = fr["img"].resize((max(1, round(fw * scale)), max(1, round(fh * scale))), Image.LANCZOS)
    px = round(ox + (sx - ux0) * scale)
    py = round(oy + (sy - uy0) * scale)
    canvas.alpha_composite(scaled, (px, py))
    canvas.save(f"{out_dir}/frame-{k+1}.png", optimize=True)
    out_frames.append(canvas)

sheet = Image.new("RGBA", (CW * len(out_frames), CH), (0, 0, 0, 0))
for k, fr in enumerate(out_frames):
    sheet.alpha_composite(fr, (k * CW, 0))
sheet.save(f"{out_dir}/sprite.png", optimize=True)
sheet.save(f"{out_dir}/sprite.webp", "WEBP", quality=88, alpha_quality=100, method=6)

# Belly line of frame 1: lowest row with an opaque pixel in the head/forearm
# half (left 45%), which is the forearms resting on the edge.
f1 = out_frames[0].getchannel("A")
fp = f1.load()
belly = max(y for y in range(CH) for x in range(int(CW * 0.12), int(CW * 0.45)) if fp[x, y] > 200)
print("belly/forearm line y:", belly, f"({belly/CH:.3f} of height)")
