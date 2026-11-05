import re,sys,html,urllib.request,concurrent.futures as cf
base=sys.argv[1]
ua={'User-Agent':'Mozilla/5.0 Chrome/130'}
def get(u):
    try:
        r=urllib.request.urlopen(urllib.request.Request(u,headers=ua),timeout=40); return r.status,r.read().decode('utf8','ignore')
    except urllib.error.HTTPError as e: return e.code,''
    except Exception as e: return 0,str(e)
sm=get(base+'/sitemap.xml')[1]
paths=[re.sub(r'^https://[^/]+','',l) for l in re.findall(r'<loc>([^<]+)',sm)]+['/cart/','/checkout/','/guides/shipping-returns','/guides/terms','/guides/faq','/guides/trade','/contact','/browse/collection']
banned=re.compile(r"price to confirm|coming soon|being prepared|not open yet|opens soon|orders are closed|not available yet|ordering is closed|size to confirm|sizes to confirm|awaiting confirmation|need confirmation|needs confirmation|still being confirmed|unconfirmed|does not accept orders|india checkout|release checks|Explore & plan",re.I)
def one(p):
    s,b=get(base+p)
    t=re.sub(r'<script.*?</script>|<style.*?</style>','',b,flags=re.S)
    t=html.unescape(re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',t)))
    return p,s,[m.group(0) for m in re.finditer(r'.{0,60}('+banned.pattern+r').{0,50}',t,re.I)][:3]
bad=0;codes={}
with cf.ThreadPoolExecutor(8) as ex:
    for p,s,h in ex.map(one,paths):
        codes[s]=codes.get(s,0)+1
        if s!=200 or h:
            bad+=1; print(s,p,h[:2])
print('pages',len(paths),'codes',codes,'with problems',bad)
