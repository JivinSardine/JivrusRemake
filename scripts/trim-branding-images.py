#!/usr/bin/env python3
"""
Trim the branding page to the image count the source actually renders.

Measured by walking jivrus.com's DOM and counting, for each heading, how many
images fall before the next heading:

    3D Logo            4      Products Banner   16
    Plain Logo         4      Primary Colours   4
    Text Logo          3      Light Shades      4
    Products Logo     12      Secondary Colours 2
    Products Text Logo 8      Partners Logo     4
    Company Logo       0      Powered by Logo   3
    Colours            0      Typography        0
    Audiowide          0      the lead section  1 hero

We were rendering 104 body images against the source's 64. The surplus is not
duplication, it is artwork the source never shows - most of it a 23-image
"Products Banner" run where the source renders 16. That is why the page read as
an unorganised wall: tiles the source does not have, captioned with names that
therefore never line up.

Images are dropped from the END of each section, which preserves the source's
own ordering. A caption is dropped with the image it labels, so a label is
never left hanging over the wrong artwork.
"""
import json

PATH = "/home/jivinsardinem/projects/JivrusRemake/src/data/pages/about__branding.json"

# The source's own per-section image counts, measured from jivrus.com.
SOURCE_COUNTS = {
    "3D Logo": 4,
    "Plain Logo": 4,
    "Text Logo": 3,
    "Products Logo": 12,
    "Products Text Logo": 8,
    "Products Banner": 16,
    "Primary Colours": 4,
    "Light Shades": 4,
    "Secondary Colours": 2,
    "Partners Logo": 4,
    "Powered by Logo": 3,
    "Technology Partners": 2,
}
# Sections the source renders with no artwork at all.
NO_ARTWORK = {"Company Logo", "Colours", "Typography", "Audiowide"}
LEAD_KEEP = 1


def heading_of(section):
    for b in section["blocks"]:
        if b.get("tag") in ("h2", "h3"):
            return (b.get("text") or "").strip()
    return "(lead)"


doc = json.load(open(PATH))
before = dropped = 0

for section in doc["sections"]:
    blocks = section["blocks"]
    head = heading_of(section)

    if head == "(lead)":
        target = LEAD_KEEP
    elif head in NO_ARTWORK:
        target = 0
    else:
        target = SOURCE_COUNTS.get(head)
        if target is None:
            target = sum(1 for b in blocks if b.get("tag") == "img")

    have = sum(1 for b in blocks if b.get("tag") == "img")
    before += have
    if have <= target:
        continue

    # Keep the first `target` images in document order; drop the rest, taking
    # each image's trailing caption with it.
    kept = []
    seen = 0
    skip_caption = False
    for b in blocks:
        if b.get("tag") == "img":
            seen += 1
            skip_caption = seen > target
            if skip_caption:
                dropped += 1
                continue
            kept.append(b)
            continue
        # A text block: a caption if an image precedes it, else section copy.
        if skip_caption:
            dropped += 1
            continue
        kept.append(b)
    section["blocks"] = kept

json.dump(doc, open(PATH, "w"), indent=1, ensure_ascii=False)

after = sum(1 for s in doc["sections"] for b in s["blocks"] if b.get("tag") == "img")
print(f"images before: {before} -> after: {after}  (dropped {dropped})")
print("source renders 64 body images on this page\n")
for s in doc["sections"]:
    n = sum(1 for b in s["blocks"] if b.get("tag") == "img")
    print(f"  imgs={n:3}  {heading_of(s)[:46]}")
