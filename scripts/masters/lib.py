import cv2, numpy as np, hashlib, json, warnings, os
warnings.filterwarnings('ignore')
from PIL import Image
from sklearn.cluster import KMeans
Image.MAX_IMAGE_PIXELS=None
M=os.path.abspath(os.path.dirname(__file__)+'/../..')+'/'
OUT=os.path.dirname(os.path.abspath(__file__))+'/built/'; VIEW=os.path.dirname(os.path.abspath(__file__))+'/v/'
def px(mm,dpi): return int(round(mm/25.4*dpi))
def merge(c,labels,de):
    # OpenCV 8-bit LAB. Two palette colours closer than `de` are one colour with a mottle: one ink.
    c=[np.array(x,float) for x in c]; n=[int((labels==i).sum()) for i in range(len(c))]
    while True:
        best=None
        for i in range(len(c)):
            for j in range(i+1,len(c)):
                d=np.linalg.norm(c[i]-c[j])
                if d<de and (best is None or d<best[0]): best=(d,i,j)
        if not best: return np.array(c,np.float32)
        _,i,j=best; c[i]=(c[i]*n[i]+c[j]*n[j])/(n[i]+n[j]); n[i]+=n[j]; del c[j]; del n[j]
def flat(rgb,k,w,h,clean_r=14,blur=0.7,ground=False,merge_de=14):
    """Upscale, give every pixel its nearest palette colour, give thin edge bands to their neighbours.
    ground=True: the palette colour joined to the crop's corners becomes white paper."""
    small=cv2.cvtColor(rgb,cv2.COLOR_RGB2LAB)
    km=KMeans(k,n_init=4,random_state=7).fit(small.reshape(-1,3)[::3].astype(np.float32))
    pal=merge(km.cluster_centers_,km.labels_,merge_de); k=len(pal)
    up=cv2.resize(small,(w*2,h*2),interpolation=cv2.INTER_CUBIC).astype(np.float32)
    up=cv2.GaussianBlur(up,(0,0),blur*(w*2/rgb.shape[1]))
    res=np.zeros(up.shape[:2],np.uint8)
    for y in range(0,up.shape[0],512):
        b=up[y:y+512]; res[y:y+512]=((b[:,:,None,:]-pal[None,None,:,:])**2).sum(3).argmin(2).astype(np.uint8)
    ker=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*clean_r+1,2*clean_r+1))
    keep=np.zeros(res.shape,bool)
    for c in range(k): keep|=cv2.morphologyEx((res==c).astype(np.uint8),cv2.MORPH_OPEN,ker).astype(bool)
    _,lab=cv2.distanceTransformWithLabels((~keep).astype(np.uint8),cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
    ys,xs=np.where(keep); t=np.zeros(lab.max()+1,np.uint8); t[lab[ys,xs]]=res[ys,xs]; res=t[lab]
    palrgb=cv2.cvtColor(pal.astype(np.uint8)[None],cv2.COLOR_LAB2RGB)[0]
    img=palrgb[res]
    if ground:
        H,W=res.shape; corners=[(0,0),(W-1,0),(0,H-1),(W-1,H-1)]
        g=np.bincount([res[y,x] for x,y in corners]).argmax()
        n,cc=cv2.connectedComponents((res==g).astype(np.uint8),connectivity=4)
        ids={cc[y,x] for x,y in corners if res[y,x]==g}
        img=img.copy(); white=np.isin(cc,list(ids)); img[white]=(255,255,255)
        # A neighbour's label caught at the crop's edge is not the character: small islands touching the edge go.
        n2,c2,st,_=cv2.connectedComponentsWithStats((~white).astype(np.uint8),connectivity=8)
        big=st[1:,cv2.CC_STAT_AREA].max()
        for i in range(1,n2):
            x,y,ww,hh,a=st[i]
            if a<big*0.02 and (x==0 or y==0 or x+ww==W or y+hh==H): img[c2==i]=(255,255,255)
    return cv2.resize(img,(w,h),interpolation=cv2.INTER_AREA)
def save(img,slug,dpi,fmt='png',**meta):
    im=Image.fromarray(img); tmp=OUT+slug+'.'+fmt
    if fmt=='png':
        q=im.quantize(256,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE) if img.ndim==3 else im
        q.save(tmp,dpi=(dpi,dpi),optimize=True)
    else: im.save(tmp,quality=95,subsampling=0,dpi=(dpi,dpi),optimize=True)
    b=open(tmp,'rb').read(); sha=hashlib.sha256(b).hexdigest()
    final=f'{slug}-{sha[:10]}.{fmt}'; os.replace(tmp,OUT+final)
    t=im.copy(); t.thumbnail((700,700)); t.save(VIEW+slug+'.png')
    r=dict(slug=slug,file=final,sha256=sha,px=list(im.size),dpi=dpi,mb=round(len(b)/1e6,2),**meta); print(r); return r
