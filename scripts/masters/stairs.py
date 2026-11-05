from lib import *
c={r['id']:r for r in json.load(open(M+'src/brand/review/catalogue.json'))}
W,H,G=464,160,15; DPI=300
def rows_of(a):
    bg=a[3,3].astype(int); d=(np.abs(a.astype(int)-bg).max(2)>3)
    cols=np.where(d.mean(0)>.35)[0]; x0,x1=cols[0],cols[-1]+1
    r=d[:,x0:x1].mean(1)>.6; out=[];on=False
    for i,v in enumerate(r):
        if v and not on: s=i;on=True
        if not v and on:
            on=False
            if i-s>100: out.append((s,i))
    return x0,x1,out
out=[]
for sid in ('MP-SS-01','MP-SS-02','MP-SS-03','MP-SS-04','MP-SS-05'):
    r=c[sid]
    if sid=='MP-SS-04':
        a=np.array(Image.open(M+'public/review/collections/step-smiles/images/beep-beep.webp').convert('RGB')); x0,x1=26,550; rows=[(150,326),(357,534),(560,742),(767,947)]
    else:
        a=np.array(Image.open(M+f'public/review/hover-art/{sid}-exact-flat.png').convert('RGB')); x0,x1,rows=rows_of(a)
    print(sid,x0,x1,rows); assert len(rows)==4,rows
    w,h=px(W,DPI),px(H,DPI); g=px(G,DPI)
    sheet=np.full((h*4+g*3,w,3),255,np.uint8)
    for i,(y0,y1) in enumerate(rows):
        im=flat(a[y0+3:y1-3,x0+3:x1-3],12,w,h,clean_r=9,blur=.45,merge_de=7); sheet[i*(h+g):i*(h+g)+h]=im
    out.append(save(sheet,r['slug'],DPI,widthMm=W,heightMm=H*4+G*3,family='stairs',srcDpi=round((x1-x0)/(W/25.4),1),cut='hand, four strips'))
json.dump(out,open('stairs.json','w'),indent=0)
