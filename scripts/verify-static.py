from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote
import re,json,subprocess,tempfile,xml.etree.ElementTree as ET
R=Path(__file__).resolve().parent.parent;D=R/'dist';errors=[];scripts=0
class Parser(HTMLParser):
 def __init__(self):super().__init__();self.links=[];self.ids=[]
 def handle_starttag(self,t,a):
  a=dict(a)
  if t in ['a','link','script','img']:
   h=a.get('href') if t in ['a','link'] else a.get('src')
   if h:self.links.append(h)
  if a.get('id'):self.ids.append(a['id'])
files=list(D.rglob('*.html'))
for f in files:
 text=f.read_text();p=Parser();p.feed(text)
 if len(p.ids)!=len(set(p.ids)):errors.append(f'{f.relative_to(D)}: duplicate IDs')
 for h in p.links:
  if h.startswith(('http:','https:','mailto:','tel:','#','data:','//')):continue
  dest=unquote(h.split('#')[0].split('?')[0]);target=D/dest.lstrip('/') if dest.startswith('/') else f.parent/dest
  if not target.exists():errors.append(f'{f.relative_to(D)}: missing {h}')
 for attrs,body in re.findall(r'<script([^>]*)>(.*?)</script>',text,re.S):
  if not body.strip():continue
  if 'application/ld+json' in attrs:
   try:json.loads(body)
   except Exception:errors.append(f'{f}: invalid JSON-LD')
  else:
   with tempfile.NamedTemporaryFile(mode='w',suffix='.js') as t:
    t.write(body);t.flush();result=subprocess.run(['node','--check',t.name],capture_output=True,text=True);scripts+=1
    if result.returncode:errors.append(f'{f}: JS syntax {result.stderr}')
for name in ['assets/market.js','analytics.js']:
 result=subprocess.run(['node','--check',str(D/name)],capture_output=True,text=True)
 if result.returncode:errors.append(result.stderr)
sitemap=ET.parse(D/'sitemap.xml');urls=sitemap.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')
for url in urls:
 path=url.text.replace('https://mimipip.com/','');target=D/path
 if not target.exists():errors.append('Sitemap missing '+path)
assert 'checkoutOverlay' not in (D/'index.html').read_text()
assert 'mimipip_saved_designs' in (D/'index.html').read_text()
print(json.dumps({'html_pages':len(files),'inline_scripts':scripts,'sitemap_urls':len(urls),'errors':errors},indent=2))
raise SystemExit(bool(errors))
