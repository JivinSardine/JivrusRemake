#!/usr/bin/env python3
"""
Repair image width/height attributes that contradict the localised file.

The extraction recorded each image's `w`/`h` from the SOURCE page's own crop,
but the image-map step deduplicated by content hash, so several source crops of
the same artwork collapsed onto one localised file. The recorded dimensions then
described a crop that is not the file we ship, and they were shifted by one
entry relative to it:

    images[0] declared (1678, 1055)  real (1600, 1006)
    images[1] declared (1280, 1416)  real (1600, 1006)   <- the same file
    images[2] declared (1280, 1280)  real (1280, 1416)   <- = images[1]'s declared

On /products, 40 of 60 images had a declared size their file does not have.

This is not cosmetic. `width`/`height` on an `<img>` exist to reserve the right
box before the bitmap loads; a wrong pair reserves the wrong box, which shifts
the whole page's layout. Where the declared size disagrees with the file, trust
the file - the browser will scale it to whatever box the CSS asks for, and the
reserved box then matches what actually paints.

Rewrites every page's image dimensions from the real bytes on disk.
"""
import json
import os
from PIL import Image

ROOT = "/home/jivinsardinem/projects/JivrusRemake"
PAGES = os.path.join(ROOT, "src/data/pages")

# One size per file, so a page that references the same artwork many times does
# not re-open it 60 times.
real_size = {}


def size_of(rel_src):
    path = os.path.join(ROOT, "public", rel_src.lstrip("/"))
    if not os.path.exists(path):
        return None
    if path not in real_size:
        try:
            with Image.open(path) as im:
                real_size[path] = im.size
        except Exception:
            real_size[path] = None
    return real_size[path]


def fix_entry(entry):
    """Fix one image record in place. Returns 'fixed' | 'ok' | 'skip'."""
    if not isinstance(entry, dict):
        return "skip"
    src = entry.get("src")
    if not src or not isinstance(src, str):
        return "skip"
    real = size_of(src)
    if real is None:
        return "skip"
    declared = (entry.get("w"), entry.get("h"))
    if declared == real:
        return "ok"
    entry["w"], entry["h"] = real
    return "fixed"


total_fixed = 0
total_checked = 0

for name in sorted(os.listdir(PAGES)):
    if not name.endswith(".json"):
        continue
    path = os.path.join(PAGES, name)
    with open(path) as fh:
        doc = json.load(fh)

    changed = 0
    seen = 0
    # every image record lives in a top-level `images` array, plus ogImage and
    # the per-section copies of the same artwork
    for entry in doc.get("images", []) or []:
        seen += 1
        if fix_entry(entry) == "fixed":
            changed += 1
    for section in doc.get("sections", []) or []:
        for entry in section.get("blocks", []) or []:
            if isinstance(entry, dict) and entry.get("tag") == "img":
                seen += 1
                if fix_entry(entry) == "fixed":
                    changed += 1

    if changed:
        with open(path, "w") as fh:
            json.dump(doc, fh, indent=1, ensure_ascii=False)
        print(f"  {name:44} fixed {changed:3} of {seen:3}")
        total_fixed += changed
        total_checked += seen

print(f"\ntotal: corrected {total_fixed} image dimension pairs across {total_checked} records")