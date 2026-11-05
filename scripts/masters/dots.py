from lib import *
import sys
CM_PER_PX=60/716   # the classic crops are 716 px across; shown at 60 cm a dot is 1-4 cm, as in the room views
DPI=200
c={r['id']:r for r in json.load(open(M+'src/brand/review/catalogue.json'))}
def circles(a):
    lab=cv2.cvtColor(a,cv2.COLOR_RGB2LAB).astype(np.float32); H,W=lab.shape[:2]
    q=(lab/4).astype(int); keyv=q[...,0]*10000+q[...,1]*100+q[...,2]; vals,cnt=np.unique(keyv,return_counts=True)
    top=vals[cnt.argmax()]; ground=np.median(lab[keyv==top],axis=0)
    dist=np.sqrt(((lab-ground)**2).sum(2)); mask=(dist>16).astype(np.uint8)
    n,cc,st,_=cv2.connectedComponentsWithStats(mask,connectivity=8)
    raw=[]
    for i in range(1,n):
        x,y,w,h,ar=st[i]
        if ar<3: continue
        pad=3; x0,y0,x1,y1=max(x-pad,0),max(y-pad,0),min(x+w+pad,W),min(y+h+pad,H)
        sel=cc[y0:y1,x0:x1]==i; d=dist[y0:y1,x0:x1]; L=lab[y0:y1,x0:x1]
        ink=np.median(L[sel&(d>=np.percentile(d[sel],60))],axis=0)
        raw.append((i,x,y,w,h,x0,y0,x1,y1,ink))
    inks=np.array([r[9] for r in raw]); wts=np.array([r[3]*r[4] for r in raw])
    from sklearn.cluster import AgglomerativeClustering
    lbl=AgglomerativeClustering(n_clusters=None,distance_threshold=38,linkage='average').fit_predict(inks) if len(inks)>1 else np.zeros(len(inks),int)
    pal=[np.average(inks[lbl==k],axis=0,weights=wts[lbl==k]) for k in range(lbl.max()+1)]
    all_=np.array([ground]+pal,np.float32); rgb=cv2.cvtColor(all_.astype(np.uint8)[None],cv2.COLOR_LAB2RGB)[0]
    out=[]
    for r,k in zip(raw,lbl):
        i,x,y,w,h,x0,y0,x1,y1,_=r; v=all_[k+1]-ground
        edge=x==0 or y==0 or x+w==W or y+h==H
        if not edge:
            cv=np.clip(((lab[y0:y1,x0:x1]-ground)*v).sum(2)/(v*v).sum(),0,1); cv[(cc[y0:y1,x0:x1]!=i)&(cc[y0:y1,x0:x1]!=0)]=0
            yy,xx=np.mgrid[y0:y1,x0:x1]; s=cv.sum()
            out.append(((xx*cv).sum()/s,(yy*cv).sum()/s,float(np.sqrt(s/np.pi)),k+1,False))
        else:
            cnt,_=cv2.findContours((cc==i).astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
            p=max(cnt,key=len)[:,0,:].astype(float); p=p[(p[:,0]>0)&(p[:,1]>0)&(p[:,0]<W-1)&(p[:,1]<H-1)]
            if len(p)<8: continue
            A=np.c_[2*p,np.ones(len(p))]; b=(p**2).sum(1); t=np.linalg.lstsq(A,b,rcond=None)[0]
            cx,cy=t[0],t[1]; R=np.sqrt(max(t[2]+cx*cx+cy*cy,0))
            if 1<R<max(w,h)*1.5: out.append((cx,cy,R,k+1,True))
    return out,rgb,0,(W,H)
def period(a,axis):
    g=cv2.cvtColor(a,cv2.COLOR_RGB2LAB).astype(np.float32)
    g=g-g.mean((0,1)); F=np.fft.rfft2(g,axes=(0,1),s=(g.shape[0]*2,g.shape[1]*2)); ac=np.fft.irfft2((F*np.conj(F)),axes=(0,1)).sum(2)
    line=ac[:,0] if axis==0 else ac[0,:]; n=(a.shape[0] if axis==0 else a.shape[1]); line=line[:n*3//4]/(n-np.arange(n*3//4))
    line=line/line[0]; lo=int(n*.03)
    peaks=[i for i in range(lo,len(line)-1) if line[i]>line[i-1] and line[i]>=line[i+1] and line[i]>.72]
    return peaks
def tile_lattice(cs,rgb,bg,size,a):
    W,H=size; px_=period(a,1); py_=period(a,0)
    if not px_ or not py_: return None
    Px,Py=float(px_[0]),float(py_[0])
    # refine with the furthest clean multiple
    for arr,name in ((px_,'x'),(py_,'y')):
        base=arr[0]; m=[p/round(p/base) for p in arr if abs(p/base-round(p/base))<.08]
        if name=='x': Px=float(np.mean(m))
        else: Py=float(np.mean(m))
    inner=[c for c in cs if not c[4]]
    # fold every dot into one cell and pool
    groups=[]
    for x,y,r,k,_ in inner:
        fx,fy=x%Px,y%Py; placed=False
        for g in groups:
            dx=(fx-g['x'][0]+Px/2)%Px-Px/2; dy=(fy-g['y'][0]+Py/2)%Py-Py/2
            if g['k']==k and dx*dx+dy*dy<(Px*.12)**2 and abs(r-g['r'][0])<max(2,g['r'][0]*.35):
                g['x'].append(g['x'][0]+dx); g['y'].append(g['y'][0]+dy); g['r'].append(r); placed=True; break
        if not placed: groups.append(dict(k=k,x=[fx],y=[fy],r=[r]))
    keep=[g for g in groups if len(g['x'])>=max(2,0.25*max(len(h['x']) for h in groups))]
    dots=[(float(np.mean(g['x'])),float(np.mean(g['y'])),float(np.median(g['r'])),g['k']) for g in keep]
    nx=max(1,round(716/Px)); ny=max(1,round(nx*Px/Py*0.75) if False else round(716*.75/Py))
    return dots,Px,Py,nx,ny
def wrap_random(cs,size):
    W,H=size
    order=sorted(cs,key=lambda c:(c[4],-c[2])); kept=[]
    for x,y,r,k,e in order:
        x%=W; y%=H; ok=True
        for X,Y,R,_ in kept:
            dx=(x-X+W/2)%W-W/2; dy=(y-Y+H/2)%H-H/2
            if dx*dx+dy*dy<(r+R+2)**2: ok=False; break
        if ok: kept.append((x,y,r,k))
    return kept
def render(dots,rgb,bg,Pxy,nxy,dpi=DPI):
    Px,Py=Pxy; nx,ny=nxy; TW,TH=Px*nx,Py*ny
    cm=CM_PER_PX; w=int(round(TW*cm/2.54*dpi)); h=int(round(TH*cm/2.54*dpi)); sx,sy=w/TW,h/TH
    im=np.full((h,w,3),rgb[bg],np.uint8); SH=4; f=1<<SH
    for ix in range(nx):
        for iy in range(ny):
            for x,y,r,k in dots:
                for ox in (-TW,0,TW):
                    for oy in (-TH,0,TH):
                        X,Y=(x+ix*Px+ox)*sx,(y+iy*Py+oy)*sy; R=r*sx
                        if -R-2<X<w+R+2 and -R-2<Y<h+R+2:
                            cv2.circle(im,(int(X*f),int(Y*f)),int(R*f),tuple(int(v) for v in rgb[k]),-1,cv2.LINE_AA,SH)
    return im,round(TW*cm,1),round(TH*cm,1)
out=[]; only=sys.argv[1:] 
for i in range(1,22):
    sid=f'MP-PD{i:02}'
    if only and sid not in only: continue
    r=c[sid]; a=np.array(Image.open(M+f'public/review/hover-art/{sid}-exact-flat.png').convert('RGB'))
    a=a[4:-4,4:-4]; cs,rgb,bg,size=circles(a); group=r.get('group')
    lat=tile_lattice(cs,rgb,bg,size,a) if group=='classic' else None
    if lat:
        dots,Px,Py,nx,ny=lat; kind=f'lattice {Px:.1f}x{Py:.1f}px {len(dots)} dots/cell'
        im,tw,th=render(dots,rgb,bg,(Px,Py),(nx,ny))
    else:
        dots=wrap_random(cs,size); kind=f'scatter {len(dots)} dots of {len(cs)}'
        im,tw,th=render(dots,rgb,bg,size,(1,1))
    print(sid,r['slug'],group,kind,'repeat cm',tw,th,'inks',len(rgb))
    rr=save(im,r['slug'],DPI,repeatWidthCm=tw,repeatHeightCm=th,family='polka-dots',srcDpi='rebuilt as vector',kind=kind)
    # three repeats side by side, to look for a seam
    t=Image.fromarray(im); t.thumbnail((360,360)); T=Image.new('RGB',(t.width*2,t.height*2))
    for q in range(4): T.paste(t,((q%2)*t.width,(q//2)*t.height))
    T.save(VIEW+'t-'+r['slug']+'.png'); out.append(rr)
if not only: json.dump(out,open('dots.json','w'),indent=0)
