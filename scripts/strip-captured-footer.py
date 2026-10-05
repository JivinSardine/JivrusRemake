#!/usr/bin/env python3
"""
Remove the footer's partner strip from every page's body.

The source is a Google Sites export with no <main>, so the extraction walked
into the page footer. Its tail - the "Technology Partners - GOOGLE & ZOHO"
heading, the "Jivrus Technologies is a Google Cloud and Zoho Marketplace
Partner" line, and the partner badge images - was appended to the body of all
93 pages. PageContent renders a real <main>, so the footer already renders that
block once; the copy in the body was a duplicate showing up as a stray <h3>
after the page <h1> on every route (a heading-order jump) and as extra artwork.

The footer strip is a fixed block: everything from the partner heading to the
end of the last section. It is only stripped when it is the trailing run, so
genuine content that merely mentions a partner is left alone - /about/partners
and the marketplace articles keep their own copy.
"""
import json
import glob
import os

PAGES = "/home/jivinsardinem/projects/JivrusRemake/src/data/pages"

# The first block that marks the start of the captured footer.
TRIGGERS = (
    "Technology Partners - GOOGLE & ZOHO",
    "Technology Partners - GOOGLE &amp; ZOHO",
)


def is_footer_start(block):
    text = (block.get("text") or "").strip()
    return block.get("tag") in ("h2", "h3") and text in TRIGGERS


trimmed_pages = 0
trimmed_blocks = 0
trimmed_images = 0

for path in sorted(glob.glob(os.path.join(PAGES, "*.json"))):
    doc = json.load(open(path))
    changed = False

    for section in doc.get("sections", []):
        blocks = section.get("blocks", [])
        if not blocks:
            continue
        start = next((i for i, b in enumerate(blocks) if is_footer_start(b)), None)
        if start is None:
            continue
        # Only when it is the trailing run: everything after is footer chrome.
        tail = blocks[start:]
        if any(b.get("tag") in ("h1", "h2", "h3", "h4") for b in tail[1:]):
            # Another heading follows, so this is real page content.
            continue
        removed = tail
        section["blocks"] = blocks[:start]
        trimmed_blocks += len(removed)
        trimmed_images += sum(1 for b in removed if b.get("tag") == "img")
        changed = True

    if changed:
        json.dump(doc, open(path, "w"), indent=1, ensure_ascii=False)
        trimmed_pages += 1

print(f"trimmed {trimmed_pages} pages")
print(f"removed {trimmed_blocks} blocks, of which {trimmed_images} images")
