#!/usr/bin/env python3
"""Makes public/feed-images/<slug>.jpg for every design with a print file (the ones that can be sold): the room picture as a
JPEG no wider than 1200 px, for shopping feeds and link previews (Meta's catalogue and
most chat apps do not take WebP). Run from the repository root after the catalogue changes:
    python3 scripts/gen-feed-images.py
src/brand/seo/seo.test.ts fails if a design on sale has no picture here."""
import json, pathlib
from PIL import Image

root = pathlib.Path(__file__).resolve().parent.parent
out = root / "public" / "feed-images"
out.mkdir(exist_ok=True)
made = 0
printable = json.loads((root / "src/brand/commerce/print-map.json").read_text())
for record in json.loads((root / "src/brand/review/catalogue.json").read_text()):
    if record["slug"] not in printable:
        continue
    source = root / "public" / record["image"].lstrip("/")
    target = out / (record["slug"] + ".jpg")
    if not source.exists():
        print("no picture for", record["slug"]); continue
    if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
        continue
    image = Image.open(source).convert("RGB")
    if image.width > 1200:
        image = image.resize((1200, round(image.height * 1200 / image.width)), Image.LANCZOS)
    image.save(target, "JPEG", quality=80, optimize=True, progressive=True)
    made += 1
print("made", made, "pictures in", out)
