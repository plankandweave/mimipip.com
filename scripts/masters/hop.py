from lib import *
import fitz
DPI=200; MM=DPI/25.4
out=[]
for slug in ('hopscotch-peach-pop','hopscotch-pastel-play','hopscotch-bold-adventure'):
    s=open(M+f'floor-games/assets/{slug}.svg','rb').read()
    p=fitz.open('svg',s)[0]; scale=(750*MM)/p.rect.width
    pix=p.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=True)
    a=np.frombuffer(pix.samples,np.uint8).reshape(pix.height,pix.width,4).copy()
    pad=int(round(15*MM)); H,W=a.shape[:2]; alpha=a[:,:,3]
    sm=cv2.copyMakeBorder(cv2.resize(alpha,(W//2,H//2),interpolation=cv2.INTER_AREA),pad//2,pad//2,pad//2,pad//2,cv2.BORDER_CONSTANT,value=0)
    dist=cv2.distanceTransform((sm<128).astype(np.uint8),cv2.DIST_L2,5)
    cnts,_=cv2.findContours((dist<=12*MM/2).astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    o=np.full((H+2*pad,W+2*pad,3),255,np.uint8); al=alpha[...,None].astype(np.float32)/255
    o[pad:pad+H,pad:pad+W]=(a[:,:,:3]*al+255*(1-al)).astype(np.uint8)
    c=(max(cnts,key=len).astype(np.float32)*2).astype(np.int32)
    cv2.polylines(o,[c],True,(215,215,215),thickness=max(1,int(round(0.4*MM))),lineType=cv2.LINE_AA)
    print(slug,o.shape,'cut m',round(cv2.arcLength(max(cnts,key=len),True)*2/MM/1000,2),'images',s.count(b'<image'))
    out.append(save(o,slug,DPI,fmt='jpg',widthMm=round(o.shape[1]/MM),heightMm=round(o.shape[0]/MM),family='hopscotch',srcDpi='vector',cut='hand, along the grey guide'))
json.dump(out,open('hop.json','w'),indent=0)
