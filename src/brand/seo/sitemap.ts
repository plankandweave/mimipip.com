/** The sitemap: every address search may list, and nothing else. Products carry their picture. */
import { indexablePaths } from './head';
import { abs, feedImage, ORIGIN, recordOf } from './site';

export function sitemapXml(extra: string[]) {
  const urls = indexablePaths(extra).map(path => {
    const slug = /^\/products\/([a-z0-9-]+)$/.exec(path)?.[1];
    const r = slug ? recordOf(slug) : null;
    const image = r ? `<image:image><image:loc>${abs(feedImage(r.slug))}</image:loc></image:image>` : '';
    return `<url><loc>${ORIGIN}${path}</loc>${image}</url>`;
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' + urls.join('\n') + '\n</urlset>\n';
}
