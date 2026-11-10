import {publishedUrls} from '../src/brand/review/published-sitemap';
import {headFor,type Head} from '../src/brand/seo/head';
import {offlineContentSecurityPolicy,withOfflineBrowserPolicy,withCheckoutBrowserPolicy} from '../src/brand/network-policy';

/** Pages search may list. Everything else is served noindex. */
const publicPaths = new Set([
  ...publishedUrls.map(url => new URL(url).pathname.replace(/\/$/, '') || '/'),
  '/contact','/faq',
]);
const analyticsPolicy = offlineContentSecurityPolicy
  .replace("script-src 'self'", "script-src https://www.googletagmanager.com 'self'")
  .replace("connect-src 'self'", "connect-src https://www.google-analytics.com https://region1.google-analytics.com 'self'");

const attr = (s:string) => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
/** The head tags search and link previews read, written once from src/brand/seo/head.ts. */
export function headTags(head:Head, robots:string) {
  const meta = (key:'name'|'property', name:string, content:string) => '<meta '+key+'="'+name+'" content="'+attr(content)+'">';
  return [
    meta('name','description',head.description),
    '<link rel="canonical" href="'+attr(head.canonical)+'">',
    meta('name','robots',robots),
    meta('property','og:site_name','MimiPip'), meta('property','og:type',head.type), meta('property','og:title',head.title),
    meta('property','og:description',head.description), meta('property','og:url',head.canonical),
    meta('property','og:image',head.image), meta('property','og:image:alt',head.imageAlt),
    meta('name','twitter:card','summary_large_image'), meta('name','twitter:title',head.title),
    meta('name','twitter:description',head.description), meta('name','twitter:image',head.image),
    ...head.jsonLd.map(data => '<script type="application/ld+json">'+JSON.stringify(data).replace(/</g,'\\u003c')+'</script>'),
  ].join('');
}

export function publicPage(request:Request, response:Response) {
  const url = new URL(request.url);
  if (!response.headers.get('Content-Type')?.includes('text/html')) return withOfflineBrowserPolicy(response);
  const path = url.pathname.replace(/\/$/,'') || '/';
  const publish = url.hostname === 'mimipip.com' && response.status === 200 && publicPaths.has(path);
  const robots = publish ? 'index, follow' : 'noindex, nofollow';
  const head = publish ? headFor(path, url.searchParams.get('value')) : null;
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag',robots);
  headers.set('Content-Security-Policy',publish ? analyticsPolicy : offlineContentSecurityPolicy);
  // Client navigation retains the first document's CSP. A shopper may start
  // anywhere, then open the original sample modal or navigate to checkout.
  // Permit the same existing payment provider on that initial document too.
  const html = withCheckoutBrowserPolicy(new Response(response.body,{status:response.status,headers}));
  let sawTitle=false,inSvg=false;
  let rewriter = new HTMLRewriter()
    .on('meta[name="robots"],meta[name="googlebot"]',{element(el){el.remove()}});
  if (head) rewriter = rewriter
    // One of each, ours: the inherited tags described another shop's page (the home address as og:url, a broken preview picture).
    .on('meta[name="description"],link[rel="canonical"],link[rel="alternate"][hreflang],meta[property^="og:"],meta[name^="twitter:"]',{element(el){el.remove()}})
    .on('head > title',{element(el){sawTitle=true;el.setInnerContent(head.title)}})
    // A title streamed late into the body is replaced by ours in the head; an icon's own <title> stays.
    .on('body svg title',{element(){inSvg=true}})
    .on('body title',{element(el){if(inSvg){inSvg=false;return}el.remove()}});
  return rewriter
    .on('head',{element(el){
      el.append(head ? headTags(head,robots) : '<meta name="robots" content="'+robots+'">',{html:true});
      // Our own funnel count (first-party, no cookie); the consented analytics only on published pages.
      el.append('<script defer src="/mimipip-funnel.js"></script>',{html:true});
      if (publish) el.append('<script defer src="/mimipip-analytics.js"></script>',{html:true});
      if (head) el.onEndTag(end=>{if(!sawTitle)end.before('<title>'+attr(head.title)+'</title>',{html:true})});
    }}).transform(html);
}
