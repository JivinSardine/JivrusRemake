#!/usr/bin/env python3
"""
Drop image references in the page data that no longer resolve on disk.

trim-branding-images.py removes artwork the source does not render, and the
image conversion renamed files, so some blocks are left pointing at a file that
is not there any more. The page still "works" - the build skips the block - but
validate:assets fails and the data is lying about what it contains.

Only a block whose local path is absent is removed; an external URL is left
alone, and a file that exists is never touched. Run after
prune-orphan-images.py, and rebuild afterwards.
"""
import json
import glob
import os

PROJ = os.environ.get("JIVRUS_PROJ", "/home/jivinsardinem/projects/JivrusRemake")
IMGDIR = os.path.join(PROJ, "public/images")
PAGES = os.path.join(PROJ, "src/data/pages")

on_disk = set(os.listdir(IMGDIR))

removed_blocks = 0
removed_meta = 0
touched = 0

for path in sorted(glob.glob(os.path.join(PAGES, "*.json"))):
    doc = json.load(open(path))
    dirty = False

    for section in doc.get("sections", []):
        blocks = section.get("blocks", [])
        kept = []
        for b in blocks:
            src = b.get("src") or ""
            if b.get("tag") == "img" and src.startswith("/images/"):
                if os.path.basename(src) not in on_disk:
                    removed_blocks += 1
                    dirty = True
                    continue
            kept.append(b)
        section["blocks"] = kept

    # The `images` array is top-level and drives the hand-built components, so
    # it has to be filtered too - it sits beside `sections`, not inside it.
    if isinstance(doc.get("images"), list):
        before = len(doc["images"])
        doc["images"] = [
            i
            for i in doc["images"]
            if not (
                isinstance(i, dict)
                and (i.get("src") or "").startswith("/images/")
                and os.path.basename(i["src"]) not in on_disk
            )
        ]
        if len(doc["images"]) != before:
            removed_meta += before - len(doc["images"])
            dirty = True

    for key in ("ogImage",):
        val = doc.get(key) or ""
        if val.startswith("/images/") and os.path.basename(val) not in on_disk:
            doc[key] = "/og-default.svg"
            removed_meta += 1
            dirty = True

    if dirty:
        json.dump(doc, open(path, "w"), indent=1, ensure_ascii=False)
        touched += 1

print(f"files updated   : {touched}")
print(f"img blocks removed : {removed_blocks}")
print(f"metadata entries removed : {removed_meta}")
