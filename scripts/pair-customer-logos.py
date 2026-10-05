#!/usr/bin/env python3
"""
Pair each customer logo with its own website on /customers.

The source's content area, read in DOM order, is a strict repeating unit:

    IMG, "www.byjus.com", H3 "India",
    IMG, "eastbronxacademy.org", H3 "USA", ...

A website belongs to the logo directly above it, and a country heading
introduces the next logo.

Our extraction had one extra image at the head of the run, which shifted the
whole sequence, and the renderer was pairing by index, so every logo ended up
under the wrong company:

    tile 5  ee959d... -> "www.byjus.com"      (wrong logo)
    tile 6  bcee83... -> "India"              (a country, as a caption)

This rewrites the run into explicit tiles, pairing each image with the website
that follows it and attaching the country as that logo's location, so the
renderer no longer has to infer anything.
"""
import json
import os

PATH = "/home/jivinsardinem/projects/JivrusRemake/src/data/pages/customers.json"

doc = json.load(open(PATH))
section = doc["sections"][0]
blocks = section["blocks"]

# Locate the start of the logo run: the first image followed by a website-like
# string (contains a dot and no spaces).
def is_website(text):
    t = text.strip()
    return bool(t) and "." in t and " " not in t and len(t) < 60


start = None
for i, b in enumerate(blocks):
    if b.get("tag") != "img":
        continue
    nxt = blocks[i + 1] if i + 1 < len(blocks) else None
    if nxt and nxt.get("tag") == "p" and is_website(nxt.get("text") or ""):
        start = i
        break

if start is None:
    raise SystemExit("could not find the customer logo run - inspect the data first")

lead = blocks[:start]
rest = blocks[start:]

# The source's content area, in DOM order, is a strict unit per customer:
#
#     IMG, IMG, "www.byjus.com", H3 "India",
#     IMG, IMG, "eastbronxacademy.org", H3 "USA",
#
# Two images per customer (the logo and its monochrome variant), then the
# website, then the country heading. The country labels the logo ABOVE it.
lead_images = 0
while lead_images < len(rest) and rest[lead_images].get("tag") == "img":
    lead_images += 1
lead_images = 0  # the pair count is fixed at 2 by the source; see below

tiles = []
i = 0
while i < len(rest):
    if rest[i].get("tag") != "img":
        i += 1
        continue
    # consume the run of images that make up ONE customer entry
    pair = []
    while i < len(rest) and rest[i].get("tag") == "img":
        pair.append(rest[i])
        i += 1
    website = None
    country = None
    if i < len(rest) and rest[i].get("tag") == "p" and is_website(rest[i].get("text") or ""):
        website = rest[i]
        i += 1
    if i < len(rest) and rest[i].get("tag") in ("h3", "h2"):
        country = rest[i]
        i += 1
    for n, img in enumerate(pair):
        tiles.append(
            {
                "img": img,
                "website": website,
                "country": country,
                "variant": "primary" if n == 0 else "alt",
            }
        )

# Rewrite as: image, website, country - grouped so the renderer's adjacency
# rule lands correctly, and the country is stored separately as metadata.
# The blocks are left as they were found; the pairing lives entirely in
# customer_tiles so the renderer reads it rather than re-inferring it.
new_blocks = list(rest)

section["blocks"] = lead + new_blocks
section["customer_tiles"] = [
    {
        "src": t["img"].get("src", ""),
        "alt": t["img"].get("alt", "") or "",
        "website": (t["website"].get("text", "").strip() if t["website"] else ""),
        "country": (t["country"].get("text", "").strip() if t["country"] else ""),
        "variant": t["variant"],
    }
    for t in tiles
]

json.dump(doc, open(PATH, "w"), indent=1, ensure_ascii=False)

print(f"lead blocks kept : {len(lead)}")
print(f"customer tiles   : {len(tiles)}")
for t in section["customer_tiles"][:10]:
    print(f"  {t['src'][-18:]}  website={t['website']!r}  country={t['country']!r}")
