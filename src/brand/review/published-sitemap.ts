/** The published addresses: one list, from src/brand/seo (what can be bought, and the pages about it). */
import { indexablePaths } from '../seo/head';
import { extraIndexable } from '../seo/routes';
import { sitemapXml } from '../seo/sitemap';

const origin = 'https://mimipip.com';
export const publishedUrls = indexablePaths(extraIndexable).map(path => origin + path);
export const publishedSitemapXml = sitemapXml(extraIndexable);
