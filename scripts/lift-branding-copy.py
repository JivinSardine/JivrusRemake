#!/usr/bin/env python3
"""
Lift page-introduction copy out of the branding page's image runs.

`split-branding-sections.py` cut the page at each heading, but the section that
precedes the first heading still interleaves its prose with the artwork:

    img, img, img, "Welcome to our branding kit!", img,
    "Our brand is an important asset ...", img

The renderer has to guess whether a short string after an image is a caption or
page copy, and "Welcome to our branding kit!" and "Perfectly proportionate
logo" are both 28 characters, so no length or punctuation rule separates them.
The separation belongs in the data.

This pulls the leading prose out of each section and into a `copy` field that
renders full width above the artwork, which is also where the source puts it:
its explanatory paragraphs sit in their own full-width blocks, with only true
per-image captions under the logos.

A string is treated as page copy, not a caption, when it is long, ends in a
full stop, or is the first text in the section (which introduces the group).
Everything else stays put and keeps rendering as a caption.
"""
import json
import os

PATH = "/home/jivinsardinem/projects/JivrusRemake/src/data/pages/about__branding.json"
doc = json.load(open(PATH))

moved = 0
for section in doc.get("sections", []):
    blocks = section.get("blocks", [])
    if not blocks:
        continue
    copy = list(section.get("copy", []))

    # The heading that opens the section always stays in `blocks`; it is the
    # label for the group, not page copy.
    heading_index = next(
        (i for i, b in enumerate(blocks) if b.get("tag") in ("h2", "h3")), None
    )

    # Two shapes sit inside an image run, and only the second is a caption:
    #
    #   a LIST of names, no artwork between them:
    #       img, "Form Presenter", "Form Director", ... , img
    #   a CAPTION, labelling the image on either side of it:
    #       img, "Integra for QuickBooks", img
    #       img, "Primary Red #d01717", img, "RGB(208 23 23) ...", img
    #
    # So: a text block wedged between two images is a caption; anything else is
    # list or section copy. Length is not a signal - "Primary Red #d01717" and a
    # product name are both short labels.
    caption_indexes = set()
    for i, b in enumerate(blocks):
        if b.get("tag") in ("img",) or not (b.get("text") or "").strip():
            continue
        before = blocks[i - 1].get("tag") if i > 0 else None
        after = blocks[i + 1].get("tag") if i + 1 < len(blocks) else None
        if before == "img" and after in ("img", None):
            caption_indexes.add(i)

    def is_page_copy(block, index):
        if block.get("tag") in ("img", "h1", "h2", "h3", "h4"):
            return False
        if index == heading_index:
            return False
        if not (block.get("text") or "").strip():
            return False
        return index not in caption_indexes

    kept = []
    for i, b in enumerate(blocks):
        if is_page_copy(b, i):
            copy.append(b)
        else:
            kept.append(b)
    if len(kept) != len(blocks):
        section["copy"] = copy
        section["blocks"] = kept
        moved += len(blocks) - len(kept)

if moved:
    json.dump(doc, open(PATH, "w"), indent=1, ensure_ascii=False)

imgs = sum(1 for s in doc["sections"] for b in s.get("blocks", []) if b.get("tag") == "img")
caps = sum(
    1
    for s in doc["sections"]
    for i, b in enumerate(s.get("blocks", []))
    if b.get("tag") != "img"
    and any(x.get("tag") == "img" for x in s["blocks"][:i])
)
print(f"moved {moved} block(s) out of image runs")
print(f"images preserved: {imgs}")
for s in doc["sections"]:
    n = sum(1 for b in s.get("blocks", []) if b.get("tag") == "img")
    head = next(
        (b.get("text", "") for b in s.get("blocks", []) if b.get("tag") in ("h2", "h3")),
        "(lead)",
    )
    print(f"  imgs={n:3}  copy={len(s.get('copy', []))}  {head[:46]}")
