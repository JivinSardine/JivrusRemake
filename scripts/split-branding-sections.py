#!/usr/bin/env python3
"""
Split the branding page's single monolithic section into one section per heading.

The page was stored as one section of `kind: "grid"` holding 192 blocks - 104
images interleaved with the copy. Because images and text shared a grid, every
image was placed in a card as tall as the tallest cell in its row, so the page
rendered 15180px against the source's 10292px and used 3 columns where the
source uses 4.

The source's own heading outline is the natural split point:

    H2 Company Logo
      H3 3D Logo / Plain Logo / Text Logo
    H2 Products Logo
      ...

Each heading starts a new section, so the heading renders once and the image
run that follows it lays out on its own. Anchor ids are preserved: h2/h3 blocks
carry `anchor` so the footer's deep links still land.
"""
import json
import os

PROJ = "/home/jivinsardinem/projects/JivrusRemake"
PATH = os.path.join(PROJ, "src/data/pages/about__branding.json")

doc = json.load(open(PATH))
sections = doc.get("sections", [])

if len(sections) == 1 and sections[0].get("kind") == "grid":
    blocks = sections[0]["blocks"]
    lead = []
    groups = []
    current = None
    for block in blocks:
        if block.get("tag") in ("h2", "h3"):
            current = {"kind": "tiles", "blocks": [block]}
            groups.append(current)
        elif current is None:
            lead.append(block)
        else:
            current["blocks"].append(block)

    rebuilt = []
    if lead:
        rebuilt.append({"kind": "flow", "blocks": lead})
    rebuilt.extend(groups)
    doc["sections"] = rebuilt

    json.dump(doc, open(PATH, "w"), indent=1, ensure_ascii=False)

    imgs = sum(1 for s in doc["sections"] for b in s["blocks"] if b.get("tag") == "img")
    print(f"sections: 1 -> {len(doc['sections'])}")
    print(f"images preserved: {imgs}")
    for s in doc["sections"]:
        head = next(
            (b.get("text", "") for b in s["blocks"] if b.get("tag") in ("h2", "h3")),
            "(lead)",
        )
        n = sum(1 for b in s["blocks"] if b.get("tag") == "img")
        print(f"  {len(s['blocks']):3} blocks, {n:3} imgs  {head[:52]}")
else:
    print(f"already split ({len(sections)} sections) - nothing to do")
