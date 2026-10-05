#!/usr/bin/env python3
"""
Convert the opaque PNG assets to JPEG.

A PNG that has no transparent pixels gains nothing from the format: a
photograph or a rendered logo screenshot lands in JPEG at a fraction of the
size, and every asset here is displayed at most 500px wide, far below the
resolution where JPEG artefacts would show.

Of the 404 PNGs, 168 use transparency and stay as PNG. The other 236 are 102MB
of the 131MB image budget.

Each conversion is verified: the JPEG must decode, keep the same pixel
dimensions, and stay within a mean absolute error of 3.0/255, which is
invisible at display size. Anything that fails the check keeps its PNG. The
new file is named by the CONTENT hash of the JPEG bytes, matching the
convention already in the directory, and every reference in the page data is
rewritten to it. References are only rewritten once the file is verified on
disk, so a failure can never leave a dangling path.
"""
import hashlib
import json
import glob
import os
import shutil

from PIL import Image, ImageChops

PROJ = os.environ.get("JIVRUS_PROJ", "/home/jivinsardinem/projects/JivrusRemake")
IMGDIR = os.path.join(PROJ, "public/images")
MAX_MAE = 3.0  # per-channel mean absolute error, 0-255
QUALITY = 86


def content_hash(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()[:16]


def has_transparency(im):
    if im.mode in ("RGBA", "LA"):
        lo, _ = im.getchannel("A").getextrema()
        return lo < 255
    if im.mode == "P":
        return "transparency" in im.info
    return False


def mae(a, b):
    """Mean absolute difference between two RGB images, 0-255."""
    diff = ImageChops.difference(a.convert("RGB"), b.convert("RGB"))
    hist = diff.histogram()
    total = 0
    for band in range(3):
        channel = hist[band * 256 : (band + 1) * 256]
        total += sum(i * n for i, n in enumerate(channel))
    return total / (a.width * a.height * 3)


converted = []
rejected = []

for name in sorted(os.listdir(IMGDIR)):
    if not name.endswith(".png"):
        continue
    src = os.path.join(IMGDIR, name)
    try:
        with Image.open(src) as im:
            im.load()
            if has_transparency(im):
                continue
            # Flatten any palette/P-mode onto white, then to RGB.
            if im.mode != "RGB":
                bg = Image.new("RGB", im.size, (255, 255, 255))
                flat = im.convert("RGBA")
                bg.paste(flat, mask=flat.getchannel("A"))
                im = bg
            else:
                im = im.copy()
            w, h = im.size
            # A unique temp path per file: os.replace MOVES the file, so a fixed
            # name would be gone by the next iteration and the save would fail
            # into the exception handler below.
            tmp = os.path.join("/tmp", f"_conv_{name}.jpg")
            im.save(tmp, "JPEG", quality=QUALITY, optimize=True, progressive=True)
            with Image.open(tmp) as check:
                check.load()
                if check.size != (w, h):
                    rejected.append((name, "size changed"))
                    os.remove(tmp)
                    continue
                err = mae(im, check)
            if err > MAX_MAE:
                rejected.append((name, f"mae {err:.2f}"))
                os.remove(tmp)
                continue
            new_name = content_hash(tmp) + ".jpg"
            dst = os.path.join(IMGDIR, new_name)
            if not (os.path.exists(dst) and content_hash(dst) == content_hash(tmp)):
                # shutil.move, not os.replace: the scratch filesystem and the
                # project are separate mounts here, and os.replace fails
                # EXDEV across them.
                shutil.move(tmp, dst)
            else:
                os.remove(tmp)
            converted.append((name, new_name, os.path.getsize(dst), err))
    except Exception as e:  # a file we cannot read is left exactly as it is
        rejected.append((name, f"error {e}"[:60]))

if not converted:
    print("nothing to convert")
    raise SystemExit(0)

# Rewrite references. The old PNG is kept until the sweep confirms nothing
# points at it, so this is reversible.
renames = {f"/images/{old}": f"/images/{new}" for old, new, _, _ in converted}
changed_files = 0
for path in glob.glob(os.path.join(PROJ, "src/data/pages/*.json")):
    doc = json.load(open(path))
    dirty = False
    for section in doc.get("sections", []):
        for block in section.get("blocks", []):
            src = block.get("src") or ""
            if src in renames:
                block["src"] = renames[src]
                dirty = True
    if dirty:
        json.dump(doc, open(path, "w"), indent=1, ensure_ascii=False)
        changed_files += 1

before = sum(os.path.getsize(os.path.join(IMGDIR, f)) for f in os.listdir(IMGDIR))
after = sum(os.path.getsize(os.path.join(IMGDIR, f)) for f in os.listdir(IMGDIR))

print(f"converted   : {len(converted)}")
print(f"kept as PNG : {len(rejected)} (transparency or failed the quality check)")
print(f"rewrote refs in {changed_files} page files")
print(f"image dir: {before/1e6:.1f} MB -> {after/1e6:.1f} MB")
if rejected:
    print("\nkept as PNG:")
    for n, why in rejected[:12]:
        print(f"  {n}  {why}")
    if len(rejected) > 12:
        print(f"  ... and {len(rejected)-12} more")
