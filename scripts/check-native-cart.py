import urllib.request,urllib.error,json,sys
base=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8798';cookie=''
def req(path,body=None,method=None,use_cookie=True):
 global cookie
 headers={'Content-Type':'application/json','Origin':base}
 if cookie and use_cookie:headers['Cookie']=cookie
 request=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
 try:
  r=urllib.request.urlopen(request,timeout=30)
  if r.headers.get('Set-Cookie'):cookie=r.headers['Set-Cookie'].split(';')[0]
  return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
status,denied=req('/api/account/orders');assert status==401,(status,denied)
print('PASS account orders reject anonymous access')
data={'productHandle':'almond-blossom','materialSlug':'smooth-matt','widthCm':243.84,'heightCm':274.32,'areaSqft':1,'unitPrice':236,'quantity':1,'lineTotal':1}
status,cart=req('/api/cart',data);assert status==200,(status,cart)
item=cart['items'][0]['item_id'];assert cart['subtotal']==16992,cart
try:
 status,cart=req('/api/cart',{'itemId':item,'quantity':2},'PATCH');assert status==200 and cart['subtotal']==33984,(status,cart)
 status,other=req('/api/cart',use_cookie=False);assert status==200 and other['items']==[],(status,other)
 status,q=req('/api/checkout/quote',{'lines':[{'slug':'almond-blossom','qty':2,'widthCm':243.84,'heightCm':274.32,'lineMinor':1}],'countryCode':'US'});assert status==200 and q['totalMinor']==144000,(status,q)
 status,q=req('/api/cart',{**data,'quantity':101});assert status==400,(status,q)
 for cc,total in [('IN',2194555),('US',92990)]:
  status,q=req('/api/checkout/quote',{'lines':[{'slug':'almond-blossom','qty':1,'widthCm':243.84,'heightCm':274.32},{'slug':'hopscotch-peach-pop','qty':1}],'countryCode':cc})
  assert status==200 and q['totalMinor']==total,(status,q)
 crop={'imageUrl':'/review/hover-art/almond-blossom.webp','wallWidthCm':243.84,'wallHeightCm':274.32,'offsetX':.5,'offsetY':.5,'zoom':1,'doors':[{'offsetCm':20,'widthCm':80,'heightCm':200}]}
 status,q=req('/api/checkout/quote',{'lines':[{'slug':'almond-blossom','qty':1,'widthCm':243.84,'heightCm':274.32,'crop':crop}],'countryCode':'IN'})
 assert status==400,(status,q)
 status,q=req('/api/cart',{**data,'crop':crop});assert status==400,(status,q)
 print('PASS mixed India and US selling-list cart totals and advanced-layout refusal')
 print('PASS native cart authoritative price, quantity, anonymous isolation and existing US checkout quote; no payment attempted')
finally:
 status,cart=req('/api/cart',{'itemId':item},'DELETE');assert status==200 and cart['items']==[],(status,cart)
 print('PASS test cart item removed')
# Installation follows the original area rounding, rate and quantity rule.
install_crop={'imageUrl':'/review/hover-art/almond-blossom.webp','wallWidthCm':300,'wallHeightCm':250,'offsetX':.5,'offsetY':.5,'zoom':1,'installation':{'ratePerSqft':35,'total':1}}
install_data={**data,'widthCm':300,'heightCm':250,'crop':install_crop}
status,cart=req('/api/cart',install_data);assert status==200,(status,cart)
item=cart['items'][0]['item_id']
try:
 for quantity in [1,2]:
  if quantity==2:
   status,cart=req('/api/cart',{'itemId':item,'quantity':quantity},'PATCH');assert status==200,(status,cart)
  native=cart['items'][0]
  status,q=req('/api/checkout/quote',{'lines':[{'slug':'almond-blossom','qty':quantity,'widthCm':300,'heightCm':250,'crop':native['crop_data']}],'countryCode':'IN'})
  assert status==200,(status,q)
  assert round(cart['subtotal']*100)==q['totalMinor'],(cart,q)
  assert native['crop_data']['installation']['total']*100==q['lines'][0]['installationMinor'],(native,q)
 status,q=req('/api/checkout/quote',{'lines':[{'slug':'almond-blossom','qty':1,'widthCm':300,'heightCm':250,'crop':install_crop}],'countryCode':'US'});assert status==400,(status,q)
 print('PASS installation native cart/checkout price and quantity match; supplied charge ignored; overseas installation refused')
finally:
 status,cart=req('/api/cart',{'itemId':item},'DELETE');assert status==200 and cart['items']==[],(status,cart)
 print('PASS installation QA item removed')
# Original lettering survives the native cart, with its authoritative once-per-line fee.
overlay={'version':1,'kind':'cloud','shape':'scalloped','text':'Mira','font':'jakarta','color':'#273746','background':'#fff8ed','align':'center','x':.2,'y':.2,'width':.4,'companion':{'version':1,'kind':'quote','shape':'scalloped','text':'Dream big','font':'inter','color':'#273746','background':'none','align':'center','x':.2,'y':.65,'width':.4}}
letter_crop={**install_crop,'installation':None,'textOverlay':overlay,'personalisation':{'childName':'wrong','fee':1},'approval':{'approvedAt':'2026-11-08T10:00:00.000Z','panelArrangement':'Three panels'}}
status,cart=req('/api/cart',{**install_data,'crop':letter_crop});assert status==200,(status,cart)
item=cart['items'][0]['item_id']
try:
 for quantity in [1,2]:
  if quantity==2:
   status,cart=req('/api/cart',{'itemId':item,'quantity':quantity},'PATCH');assert status==200,(status,cart)
  native=cart['items'][0]
  assert native['crop_data']['textOverlay']==overlay,native
  assert native['crop_data']['personalisation']=={'childName':'Mira','fee':500},native
  status,q=req('/api/checkout/quote',{'lines':[{'slug':'almond-blossom','qty':quantity,'widthCm':300,'heightCm':250,'crop':native['crop_data']}],'countryCode':'IN'})
  assert status==200 and q['lines'][0]['personalisationMinor']==50000,(status,q)
  assert round(cart['subtotal']*100)==q['totalMinor'],(cart,q)
 print('PASS name and companion quote rendering, canonical name/fee, cart quantity and checkout total')
finally:
 status,cart=req('/api/cart',{'itemId':item},'DELETE');assert status==200 and cart['items']==[],(status,cart)
 print('PASS lettering QA item removed')
