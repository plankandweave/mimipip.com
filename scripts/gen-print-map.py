#!/usr/bin/env python3
"""Writes src/brand/commerce/print-map.json: for each design, the artwork the print
engine is sent and the material it prints on. A design with no artwork on record
is left out, and the checkout will not sell it. Nothing here is guessed."""
import json
catalogue = json.load(open('src/brand/review/catalogue.json'))
zyvorah = {p['handle']: p for p in json.load(open('catalogue-zyvorah-copy.json'))['products']}
out = {}
for r in catalogue:
    slug = r['slug']
    if 'floor-sticker' in r['type']:
        out[slug] = {'art': f'/floor-play-images/{slug}/art.png', 'material': 'self_adhesive'}
        continue
    if 'wallpaper' not in r['type']:
        continue
    # A design still in preview (proofing or print file outstanding) is not sold.
    if not r.get('status', '').startswith('Made-to-measure'):
        continue
    source = zyvorah.get(r.get('sourceHandle') or slug)
    flat = next((i['url'] for i in (source or {}).get('images', []) if i.get('is_flat')), None)
    if flat:
        rate = r.get('sourceIndiaPricePerSqft')
        mats = source['materials']
        pick = next((m for m in mats if m['slug'] == 'smooth-matt' and m['price_per_sqft'] == rate), None) \
            or next((m for m in mats if m['price_per_sqft'] == rate), mats[0])
        out[slug] = {'art': flat, 'material': 'paste', 'materialSlug': pick['slug']}
json.dump(out, open('src/brand/commerce/print-map.json', 'w'), indent=0, sort_keys=True)
print(len(out), 'designs have print artwork')
