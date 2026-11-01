from pathlib import Path
import re,shutil,xml.etree.ElementTree as ET
R=Path(__file__).resolve().parent.parent
# Idempotently apply shared navigation to existing public pages; preserve media and regional content.
files=[p for p in R.rglob('*.html') if not any(x in p.relative_to(R).parts for x in ['dist','.git','zyvorah-reference','audit'])]
for p in files:
 s=p.read_text()
 if '<body' not in s:continue
 if '/assets/market.js' not in s:
  s=s.replace('</head>','<link rel="stylesheet" href="/assets/parent-guide.css"><script src="/assets/market.js"></script></head>')
 if not str(p.relative_to(R)).startswith('in/'):
  s=s.replace('lang="en-IN"','lang="en-US"')
 if str(p.relative_to(R)).startswith('floor-games/'):
  s=s.replace('>Cart</a>','>Saved designs</a>')
  # Regional prices remain explicitly India references; US shoppers never see INR as their price.
  if 'mp-floor-region-note' not in s:
   s=s.replace('<main>','<main><aside class="mp-floor-region-note"><p class="mp-region-us">United States · USD pricing and delivery to be confirmed. This range is not open for orders.</p><p class="mp-region-in">India · Listed INR prices are reference prices; ordering is not open.</p></aside>')
   s=re.sub(r'(<p[^>]*>)([^<]*₹[^<]*)(</p>)',r'\1<span class="mp-region-in">\2</span><span class="mp-region-us">US quote on request</span>\3',s)
   s=s.replace('All displayed prices include GST.','India reference prices include GST. US quotes are separate.').replace('Ready-stock range: dispatch within 1–2 working days when stock is available.','Dispatch and stock availability must be confirmed before ordering.')
   s=re.sub(r'<button id="add">Add to cart</button>','<a class="mp-cta" href="/contact/">Ask about this game</a><button id="add" hidden disabled aria-hidden="true">Unavailable</button>',s)
   s=s.replace('You can review this game in your cart.','Ask us about the material, floor suitability and availability.')
 p.write_text(s)
urls=[]
for p in files:
 rel=p.relative_to(R).as_posix()
 if rel=='google5db7ca6dfe84d05a.html' or rel=='nafas.html':continue
 if rel.endswith('index.html'):
  content=p.read_text()
  if 'http-equiv="refresh"' in content.lower():continue
  urls.append('/'+rel.removesuffix('index.html'))
urls=sorted(set(urls))
(R/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>https://mimipip.com'+u+'</loc></url>' for u in urls)+'</urlset>')
# Copy only existing public site assets and pages, never audit/source references.
for p in R.iterdir():
 if p.name in ['dist','.git','.openai','scripts','audit','zyvorah-reference'] or p.suffix in ['.md']:continue
 if p.is_dir():shutil.copytree(p,R/'dist'/p.name,dirs_exist_ok=True)
 elif p.suffix in ['.html','.js','.xml','.txt','.json']:shutil.copy2(p,R/'dist'/p.name)
print(f'Packaged {len(files)} HTML pages; {len(urls)} sitemap routes')
