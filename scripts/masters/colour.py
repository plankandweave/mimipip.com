from lib import *
import sys,shutil
L=sys.argv[1]
c={r['id']:r for r in json.load(open(M+'src/brand/review/catalogue.json'))}
out=[]
W,H=24300,16200   # 13.5 × 9 ft, the concept's own wall, at 150 DPI
for sid,n in (('MP-CC01','bunny-garden'),('MP-CC02','little-town')):
    g=np.array(Image.open(f'{L}/{n}.png').convert('L'))
    f=W/g.shape[1]
    up=cv2.resize(g,(W,H),interpolation=cv2.INTER_CUBIC); up=cv2.GaussianBlur(up,(0,0),f*0.42)
    # a hard threshold with a one-pixel soft edge: one ink, clean paper
    m=np.clip((up.astype(np.float32)-160)*4+128,0,255).astype(np.uint8); del up
    out.append(save(m,c[sid]['slug'],150,widthMm=4115,heightMm=2743,family='colour-create',srcDpi=round(g.shape[1]/(4115/25.4),1),kind='line art, one ink'))
    Image.fromarray(m[8000:8800,5000:6200]).save(VIEW+'z-'+n+'.png')
for sid,n in (('MP-CC03','01-woodland'),('MP-CC04','02-ocean'),('MP-CC05','03-space'),('MP-CC06','04-dinosaurs'),('MP-CC07','05-farm'),('MP-CC08','06-balloons'),('MP-CC09','07-castle'),('MP-CC10','08-safari'),('MP-CC11','09-vehicles')):
    p=f'{L}/part-coloured-series/{n}.png'; b=open(p,'rb').read(); sha=hashlib.sha256(b).hexdigest(); slug=c[sid]['slug']; fn=f'{slug}-{sha[:10]}.png'
    shutil.copyfile(p,OUT+fn); im=Image.open(p)
    out.append(dict(slug=slug,file=fn,sha256=sha,px=list(im.size),dpi=None,mb=round(len(b)/1e6,2),family='colour-create',srcDpi=round(im.size[0]/(4115/25.4),1),kind='original 1536 px, painted and line; the engine enlarges it (Topaz)',widthMm=4115,heightMm=2743))
a=np.array(Image.open(M+'public/review/colour-create/pastel-blue-flat.webp').convert('RGB')); print('pastel std',a.std((0,1)),a.reshape(-1,3).mean(0))
col=np.median(a.reshape(-1,3),axis=0).astype(np.uint8)
t=np.full((px(600,150),px(600,150),3),col,np.uint8)
out.append(save(t,c['MP-CC12']['slug'],150,repeatWidthCm=60,repeatHeightCm=60,family='colour-create',srcDpi='flat colour',kind='one colour'))
json.dump(out,open('colour.json','w'),indent=0)
