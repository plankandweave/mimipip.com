#!/usr/bin/env python3
"""Writes src/brand/commerce/print-map.json: for each design, the artwork the print
engine is sent and the material it prints on. A design with no artwork on record
is left out, and the checkout will not sell it. Nothing here is guessed.

A fixed piece prints from its master in print-masters.json (scripts/masters/ builds them),
at the master's own size. A picture from this site is never a print file, and the OS
refuses one (lib/mimipip-print-master-rules.ts). Adding a master here does not put a
design on sale: prices.json and the record's status still decide that."""
import json
masters = json.load(open('src/brand/commerce/print-masters.json'))
catalogue = json.load(open('src/brand/review/catalogue.json'))
zyvorah = {p['handle']: p for p in json.load(open('catalogue-zyvorah-copy.json'))['products']}
out = {}
for r in catalogue:
    slug = r['slug']
    if 'floor-sticker' in r['type']:
        m = masters[slug]
        out[slug] = {'art': m['url'], 'material': 'self_adhesive', 'printWidthCm': m['printWidthCm'], 'printHeightCm': m['printHeightCm']}
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
for slug, a in out.items():
    assert a['art'].startswith('https://') and 'mimipip.com' not in a['art'], slug
json.dump(out, open('src/brand/commerce/print-map.json', 'w'), indent=0, sort_keys=True)
print(len(out), 'designs have print artwork')
