#!/usr/bin/env python3
"""
Delete image files the built site never requests.

The reference set is read from dist/ rather than reconstructed from the source
files. An earlier version scanned src/ and inferred 1,839 references while only
427 images are actually used, so it deleted 228 live files and broke the build;
scanning src/ also matches strings that never reach a page. The built HTML is
the ground truth: whatever it asks for is in use, and nothing else is.

Run after `npm run build`. dist/ is rebuilt, not modified, so this is safe to
repeat. It aborts rather than deleting if anything referenced is missing.
"""
import glob
import os
import re

PROJ = os.environ.get("JIVRUS_PROJ", "/home/jivinsardinem/projects/JivrusRemake")
DIST = os.path.join(PROJ, "dist")
IMGDIR = os.path.join(PROJ, "public/images")

if not os.path.isdir(DIST):
    raise SystemExit("dist/ not found - run `npm run build` first")

PATTERN = re.compile(r"/images/([A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|svg|webp|gif))")

referenced = set()
for path in glob.glob(os.path.join(DIST, "**", "*.html"), recursive=True):
    with open(path, encoding="utf-8", errors="replace") as fh:
        referenced.update(PATTERN.findall(fh.read()))

on_disk = set(os.listdir(IMGDIR))
missing = referenced - on_disk
if missing:
    raise SystemExit(
        f"ABORT: {len(missing)} referenced image(s) are absent, e.g. "
        f"{sorted(missing)[:5]} - run `npm run build` to see the real cause"
    )

orphans = sorted(on_disk - referenced)
freed = sum(os.path.getsize(os.path.join(IMGDIR, f)) for f in orphans)
for f in orphans:
    os.remove(os.path.join(IMGDIR, f))

kept = sorted(os.listdir(IMGDIR))
total = sum(os.path.getsize(os.path.join(IMGDIR, f)) for f in kept)
print(f"referenced by the built site : {len(referenced)}")
print(f"removed unreferenced         : {len(orphans)}")
print(f"freed                        : {freed/1e6:.1f} MB")
print(f"image dir                    : {len(kept)} files, {total/1e6:.1f} MB")
