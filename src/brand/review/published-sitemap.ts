import floorPages from '../../../worker/floor-play.json';
import records from './catalogue.json';
import {guides} from './guides';

const origin = 'https://mimipip.com';
const floorPaths = Object.keys(floorPages)
  .filter(path => path !== '/floor-games/hopscotch-peach-pop')
  .map(path => path + '/');
const paths = [
  ...floorPaths, '/', '/in-real-homes/', '/collections/dotty-days/', '/collections/happy-petals/',
  ...['collection','color','concept','age','size','space'].map(axis => '/browse/' + axis),
  ...Object.keys(guides).map(key => '/guides/' + key),
  ...records.map(product => '/products/' + encodeURIComponent(product.slug)),
];
export const publishedUrls = paths.map(path => origin + path);
export const publishedSitemapXml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
  publishedUrls.map(url => '<url><loc>' + url + '</loc></url>').join('') + '</urlset>';
