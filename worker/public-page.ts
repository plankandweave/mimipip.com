import {publishedUrls} from '../src/brand/review/published-sitemap';
import catalogue from '../src/brand/review/catalogue.json';
import {offlineContentSecurityPolicy,withOfflineBrowserPolicy} from '../src/brand/network-policy';

const publicPaths = new Set([
  ...publishedUrls.map(url => new URL(url).pathname.replace(/\/$/, '') || '/'),
  ...catalogue.flatMap(item => item.collection.map(key => '/collections/' + key)),
  '/contact','/retail','/faq','/floor-games/hopscotch-peach-pop',
]);
const analyticsPolicy = offlineContentSecurityPolicy
  .replace("script-src 'self'", "script-src https://www.googletagmanager.com 'self'")
  .replace("connect-src 'self'", "connect-src https://www.google-analytics.com https://region1.google-analytics.com 'self'");

export function publicPage(request:Request, response:Response) {
  const url = new URL(request.url);
  if (!response.headers.get('Content-Type')?.includes('text/html')) return withOfflineBrowserPolicy(response);
  const publish = url.hostname === 'mimipip.com' && response.status === 200 &&
    publicPaths.has(url.pathname.replace(/\/$/,'') || '/');
  const robots = publish ? 'index, follow' : 'noindex, nofollow';
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag',robots);
  headers.set('Content-Security-Policy',publish ? analyticsPolicy : offlineContentSecurityPolicy);
  const html = new Response(response.body,{status:response.status,headers});
  return new HTMLRewriter()
    .on('meta[name="robots"],meta[name="googlebot"]',{element(el){el.remove()}})
    .on('head',{element(el){
      el.append('<meta name="robots" content="'+robots+'">',{html:true});
      if (publish) el.append('<script defer src="/mimipip-analytics.js"></script>',{html:true});
    }}).transform(html);
}
