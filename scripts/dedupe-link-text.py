#!/usr/bin/env python3
"""
Drop blocks that immediately repeat a preceding block's text.

Two shapes were produced by the source extraction:

    {"tag": "a", "text": "Company", "href": "/about/company"}   # renders "Company"
    {"tag": "p", "text": "Company"}                             # renders "Company" again

    {"tag": "a", "text": "Careers", "href": "/about/careers"}
    {"tag": "a", "text": "Careers", "href": "/about/careers"}   # same link twice

The first repeats a link's label as a paragraph; the second repeats the whole
link. Either way the visitor sees the same words twice, which the source never
does — on /about/careers the source page is 3869px tall and ours was 8235px.

Only a block that is *immediately* preceded by one with byte-identical text is
removed, and a removal is skipped when the preceding block is an image (an
image carries no text, so nothing is duplicated). Genuinely repeated prose
elsewhere in a section is left alone.
"""
import json
import glob
import os

PROJ = "/home/jivinsardinem/projects/JivrusRemake/src/data/pages"

total_removed = 0
pages_touched = 0

for path in sorted(glob.glob(os.path.join(PROJ, "*.json"))):
    doc = json.load(open(path))
    changed = False
    page_removed = 0
    for section in doc.get("sections", []):
        blocks = section.get("blocks", [])
        if not blocks:
            continue
        kept = []
        for block in blocks:
            # A text block that exactly repeats the one just before it. The
            # preceding block must carry text, so an image never triggers this.
            if (
                kept
                and kept[-1].get("tag") != "img"
                and block.get("tag") in ("p", "a", "li", "h1", "h2", "h3", "h4")
                and (block.get("text") or "").strip()
                and (block["text"] or "").strip() == (kept[-1].get("text") or "").strip()
            ):
                page_removed += 1
                changed = True
                continue
            kept.append(block)
        if page_removed:
            section["blocks"] = kept
    if changed:
        json.dump(doc, open(path, "w"), indent=1, ensure_ascii=False)
        pages_touched += 1
        total_removed += page_removed
        print(f"  {os.path.basename(path)[:-5]:<56} -{page_removed} block(s)")

print(f"\nremoved {total_removed} duplicate paragraph blocks across {pages_touched} pages")
