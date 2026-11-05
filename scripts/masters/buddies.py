from lib import *
import re,glob
c={r['slug']:r for r in json.load(open(M+'src/brand/review/catalogue.json'))}
import base64,io
_svg=open(M+'public/review/assets/bunny-bathroom-buddy-flat.svg',errors='ignore').read()
sheet=np.array(Image.open(io.BytesIO(base64.b64decode(re.search(r'base64,([A-Za-z0-9+/=]+)',_svg).group(1)))).convert('RGB'))
K={'cat':8,'panda':7,'bear':7,'fox':8,'koala':7,'piglet':7,'puppy':7,'lion':7,'owl':8,'bunny':6,'frog':6}
out=[]
for f in sorted(glob.glob(M+'public/review/assets/*-bathroom-buddy-flat.svg')):
    slug=os.path.basename(f).replace('-flat.svg',''); an=slug.split('-')[0]
    s=re.sub(r'base64,[A-Za-z0-9+/=\s]+','',open(f,errors='ignore').read())
    vb=[tuple(float(x) for x in m.split()) for m in re.findall(r'viewBox="([^"]+)"><use',s)]
    x,y,w,h=[int(v) for v in vb[1]]
    r=c[slug]; W,H=r['widthCm']*10,r['heightCm']*10
    print(slug,(x,y,w,h),'aspect',round(w/h,3),round(W/H,3))
    img=flat(sheet[y:y+h,x:x+w],K[an],px(W,300),px(H,300),ground=True)
    out.append(save(img,slug,300,widthMm=W,heightMm=H,family='buddies',srcDpi=round(w/(W/25.4),1),cut='hand, round the face'))
json.dump(out,open('buddies.json','w'),indent=0)
