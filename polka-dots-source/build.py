import json, pathlib, shutil, html
root=pathlib.Path(__file__).resolve().parent.parent; out=root/'out'; src=root/'polka-dots-source'; src.mkdir(exist_ok=True)
files=[
('happy-dots','Happy Dots','original','c8afcc16-b4fd-41cd-be55-6e5bd47b9aab','Blue, yellow and orange dots in a loose, playful scatter on warm off-white.',['blue','yellow','orange','neutral']),
('blue-pebble','Blue Pebble','classic','c67ffdca-a19d-4ada-88d3-fbf34859760d','Light blue dots in an evenly spaced staggered repeat on off-white.',['blue','neutral']),
('sunshine-spots','Sunshine Spots','classic','47b37dc8-a8e7-4e63-8a08-a95fa8d414b5','Bright yellow dots in a neat staggered repeat on white.',['yellow','white']),
('orange-pop','Orange Pop','classic','b17232f6-18b5-44d7-86dd-1b7bf6b818b7','Small orange dots bring a lively, ordered rhythm to off-white.',['orange','neutral']),
('cloud-dots','Cloud Dots','classic','72ca241f-783c-45f8-9c90-b175af157561','White dots arranged in a gentle staggered repeat on light blue.',['white','blue']),
('sunny-sky','Sunny Sky','classic','c847a415-93f9-4e5b-a5a7-1712da6f2284','Alternating blue and yellow dots on a fresh white ground.',['blue','yellow','white']),
('little-carnival','Little Carnival','classic','581139b0-b976-4d13-a65d-4993a49a523d','Rows of blue, yellow and orange dots give this off-white design a cheerful beat.',['blue','yellow','orange','neutral']),
('blue-button','Blue Button','classic','0a0dfa37-9b15-4e59-b627-ba87f46e2e01','Large and small blue dots alternate across warm off-white.',['blue','neutral']),
('sunbeam-on-blue','Sunbeam on Blue','classic','7596d4e9-799c-43e9-afae-c123f9e4f511','Yellow dots sit in a spacious regular pattern on light blue.',['yellow','blue']),
('tangerine-sky','Tangerine Sky','classic','443f99f0-3fc5-46ea-b5b6-e45d88bf6226','Orange and white dots alternate against a light blue ground.',['orange','white','blue']),
('sunny-button','Sunny Button','classic','14ea4449-1ca6-4be8-a754-d638c54b0f3c','Large and small yellow dots make a sunny repeat on off-white.',['yellow','neutral']),
('confetti-dance','Confetti Dance','random','c832389f-7346-4af3-aa9b-4ae908218283','Blue, yellow and orange circles of different sizes scatter freely over warm off-white.',['blue','yellow','orange','neutral']),
('blue-bubble','Blue Bubble','random','fc23b2f3-4acd-4635-adc5-87d9dacf09f1','A light, irregular scatter of blue dots, from tiny specks to larger circles, on white.',['blue','white']),
('sunshine-sprinkle','Sunshine Sprinkle','random','c7ae6431-d458-4128-835a-807626f332de','Yellow circles in mixed sizes drift across off-white with plenty of breathing room.',['yellow','neutral']),
('tangerine-tumble','Tangerine Tumble','random','074d7663-a54f-40da-b9da-56ea17211392','A bright orange scatter with varied circle sizes and open white space.',['orange','white']),
('cloud-sprinkle','Cloud Sprinkle','random','9afc9486-a377-4d7d-a99f-eab9f42ec6d7','White circles in mixed sizes float across a soft light blue ground.',['white','blue']),
('sunny-bubbles','Sunny Bubbles','random','fdfb3163-4307-4187-8ca7-26745c57d450','Blue and yellow dots mingle in an irregular, airy scatter on white.',['blue','yellow','white']),
('blue-pop','Blue Pop','random','72603cf7-98a6-4ba2-8883-4231fccad457','Larger blue circles and little orange dots scatter over warm off-white.',['blue','orange','neutral']),
('sky-sprinkles','Sky Sprinkles','random','fb52f39d-8c8e-49dc-acbc-091ebf3e45d2','White dots and sunny yellow accents float across light blue.',['white','yellow','blue']),
('citrus-bubbles','Citrus Bubbles','random','9c532aff-7442-4489-a05e-3ab731a4354d','Orange and yellow circles in mixed sizes bring a warm, playful scatter to off-white.',['orange','yellow','neutral']),
('tiny-confetti','Tiny Confetti','random','3934523b-178e-4a72-91d5-f095caddfc46','Tiny blue, yellow and orange dots create a light confetti scatter on white.',['blue','yellow','orange','white'])]
base='/collections/polka-dots/'; target=out/'collections/polka-dots'; (target/'images').mkdir(parents=True,exist_ok=True)
products=[]
for i,(slug,name,group,file,desc,colors) in enumerate(files,1):
 source_image=root.parent/'generated_images'/('exec-'+file+'.png')
 if source_image.exists(): shutil.copyfile(source_image,target/'images'/(slug+'.png'))
 assert (target/'images'/(slug+'.png')).exists()
 products.append(dict(id=f'MP-PD{i:02}',slug='polka-dots-'+slug,designSlug=slug,name=name,description=desc,group=group,collection=['polka-dots',group+'-dots'] if group!='original' else ['polka-dots'],concept=['pattern'],color=colors,gender=['boys','girls','neutral'],age=['baby','toddler','preschool','school-age'],ageMin=0,ageMax=10,space=['nursery','bedroom','playroom'] if group!='original' else ['bedroom'],type=['wallpaper'],surface=['wall'],measurementType='made-to-measure',widthCm=None,heightCm=None,image=base+'images/'+slug+'.png',imageLayout='diptych' if group=='original' else 'quad',imageRole='Flat design concept; room views are illustrative and do not reproduce every dot position or scale exactly',source='MimiPip Polka Dots design concepts',status='Design preview · repeat and colour proofing pending',price=None,personalization=None,collectionURL=base,detailURL=base+slug+'/'))
(src/'products.json').write_text(json.dumps(products,indent=2)+'\n')
esc=lambda x:html.escape(str(x),quote=True)
def panel(p,view):
 pos={'flat':(0,0),'nursery':(1,0),'toddler':(0,1),'playroom':(1,1),'bedroom':(1,0)}[view]; dip=p['imageLayout']=='diptych'; rows=1 if dip else 2
 return f'<div class="pattern-view {"diptych" if dip else "quad"}" style="--x:{pos[0]};--y:{pos[1]};--rows:{rows}"><img src="{p["image"]}" loading="lazy" alt="{esc(p["name"])} — {view} {"design artwork" if view=="flat" else "illustrative room preview"}"></div>'
def shell(title,desc,path,body):
 return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>{esc(title)} | MimiPip</title><meta name="description" content="{esc(desc)}"><link rel="canonical" href="https://mimipip.com{path}"><meta property="og:title" content="{esc(title)} | MimiPip"><meta property="og:image" content="https://mimipip.com{base}images/confetti-dance.png"><link rel="stylesheet" href="{base}style.css"></head><body><a class="skip" href="#main">Skip to content</a><div class="notice">COLLECTION PREVIEW · ORDERS ARE NOT OPEN</div><header><a href="/"><img src="/assets/wordmark.webp" width="158" alt="MimiPip home"></a><nav aria-label="Main navigation"><a href="/collections/">Collections</a><a href="{base}">Polka Dots</a><a href="/shop">All designs</a></nav></header><main id="main">{body}</main><footer><p>MimiPip · Little spaces. Happy dots.</p><p>Prices and ordering are being prepared.</p></footer></body></html>'''
def write(route,content):
 path=out/route/'index.html';path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content)
note='<aside class="note"><strong>About the previews.</strong> The flat view shows the design concept. Room images are styling illustrations: dot positions, scale and colour can differ from the flat artwork. The final repeat, size and colour proof must be confirmed before printing. Furniture is shown for styling only.</aside>'
def card(p):
 return f'<article class="card"><a href="{p["detailURL"]}"><div class="card-views">{panel(p,"bedroom" if p['group']=='original' else "nursery").replace('class="pattern-view','class="room-view pattern-view',1)}{panel(p,"flat").replace('class="pattern-view','class="flat-view pattern-view',1)}</div><h2>{esc(p["name"])}</h2></a><p>{esc(p["description"])}</p><p class="eyebrow">{esc(p["group"].title())} Dots · Wallpaper</p></article>'
for group,title,intro in [('all','Polka Dots','Little dots. Big personality. Explore random scatters, classic repeats and the original Happy Dots.'),('random','Random Dots','Mixed sizes, irregular spacing and plenty of room to play. Ten freely scattered dot designs.'),('classic','Classic Dots','A little rhythm for their room. Ten polka dot designs with ordered repeats.')]:
 selected=products if group=='all' else [p for p in products if p['group']==group];route='collections/polka-dots'+('' if group=='all' else '/'+group)
 body=f'<section class="hero"><p class="eyebrow">MimiPip wallpaper collection · {len(selected)} designs</p><h1>{title}</h1><p class="intro">{intro}</p></section><nav class="tabs" aria-label="Dot collections"><a href="{base}">All 21 designs</a><a href="{base}random/">Random Dots · 10</a><a href="{base}classic/">Classic Dots · 10</a><a href="{base}happy-dots/">Original Happy Dots</a></nav><div class="grid">'+''.join(map(card,selected))+'</div>'+note
 write(route,shell(title+' wallpaper collection',intro,'/'+route+'/',body))
for p in products:
 body=f'<p class="breadcrumb"><a href="{base}">Polka Dots</a> / {esc(p["name"])}</p><section class="hero"><p class="eyebrow">{p["group"].title()} Dots · {p["id"]}</p><h1>{esc(p["name"])}</h1><p class="intro">{esc(p["description"])}</p><p>Colours: {esc(", ".join("Off-white" if c=="neutral" else c.title() for c in p["color"]))}</p></section>'+note+'<section class="gallery">'
 views=[('flat','Flat design'),('bedroom','Bedroom preview')] if p['group']=='original' else [('flat','Flat design'),('nursery','Baby nursery'),('toddler','Toddler room'),('playroom','Playroom')]
 for view,label in views:body+=f'<figure>{panel(p,view)}<figcaption>{label}</figcaption></figure>'
 body+='</section><p class="note">Design preview. Pricing and ordering are being prepared.</p><p><a href="'+base+'">← Explore all Polka Dots</a></p>'
 write('collections/polka-dots/'+p['designSlug'],shell(p['name']+' wallpaper',p['description'],p['detailURL'],body))
for rel in ['out/catalogue.json','mimipip-catalogue-source.json']:
 path=root/rel;data=json.loads(path.read_text());data['products']=[p for p in data['products'] if 'polka-dots' not in p['collection']]+products;path.write_text(json.dumps(data,indent=2)+'\n')
path=out/'discovery.mjs';s=path.read_text();s=s.replace("collection:{label:","collection:{label:",1);s=s.replace("values:{'little-steps-big-adventures'","values:{'polka-dots':'Polka Dots','random-dots':'Random Dots','classic-dots':'Classic Dots','little-steps-big-adventures'",1);path.write_text(s)
# Render flat views by clipping the unchanged presentation board in CSS, retaining original files.
path=out/'app.mjs';s=path.read_text();helper='''
function productImage(p){return p.imageLayout?`<span class="polka-crop ${p.imageLayout}"><img src="${p.image}" alt="${esc(p.name)} · flat design concept" loading="lazy"></span>`:`<img src="${p.image}" alt="${esc(p.name)} · ${esc(p.imageRole)}" loading="lazy">`}
''';s=s.replace('function card(p)',helper+'\nfunction card(p)',1)
s=s.replace('<img src="${p.image}" alt="${esc(p.name)} · ${esc(p.imageRole)}" loading="lazy"></button>','${productImage(p)}</button>')
s=s.replace('<img src="${p.image}" alt="${esc(p.name)} · ${esc(p.imageRole)}" loading="lazy"><div class="copy">','${productImage(p)}<div class="copy">')
s=s.replace('<div><img src="${p.image}" alt="${esc(p.name)}"><p class="fine">','<div>${productImage(p)}<p class="fine">')
s=s.replace('const heroSlides=[',"const heroSlides=[\n {title:'Meet Polka Dots.',copy:'Random scatters and classic dots in blue, sunshine yellow and orange.',image:'/collections/polka-dots/images/confetti-dance.png',alt:'Polka Dots wallpaper concept and three room illustrations',label:'Explore Polka Dots',href:'/collections/polka-dots/'},",1);path.write_text(s)
path=out/'style.css';path.write_text(path.read_text()+'''\n.polka-crop{display:block;position:relative;width:100%;aspect-ratio:1.15;overflow:hidden;background:#fff9ed}.polka-crop img{position:absolute!important;top:0;left:0;width:200%!important;max-width:none!important;height:200%!important;object-fit:fill!important}.polka-crop.diptych img{height:100%!important}\n''')
for p in products:write('design/'+p['slug'],(out/'index.html').read_text())
# Retain all existing collection content, adding Polka Dots as a new feature.
for route in ['collections','nursery','toddler','kids-room-wallpaper','kids-wallpaper']:
 path=out/route/'index.html';s=path.read_text();feature='<section class="feature"><a href="'+base+'"><img src="'+base+'images/confetti-dance.png" alt="Polka Dots design and room previews" loading="lazy"></a><div class="feature-copy"><p class="eyebrow">New collection · 21 designs</p><h2>Polka Dots</h2><p>Random scatters, classic repeats and happy little colours.</p><a class="button" href="'+base+'">Explore Polka Dots ↗</a></div></section>';s=s.replace('</main>',feature+'</main>');path.write_text(s)
print('Built 21 Polka Dots records, 24 collection/detail pages, 21 design routes and existing browsing integration.')
