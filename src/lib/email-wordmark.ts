import { brand } from '../brand/current';
import type { BrandAdapter } from '../brand/contract';
const escape = (s: string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Real configured artwork only; no typed imitation or inherited logo fallback. */
export function emailWordmark(height = 30, identity: BrandAdapter = brand): string {
  const logo = identity.emailLogo;
  if (!logo) throw new Error('Brand email wordmark artwork is not configured');
  if (!(logo.width > 0 && logo.height > 0 && height > 0)) throw new Error('Invalid wordmark dimensions');
  if (!logo.path.startsWith('/') || logo.path.startsWith('//')) throw new Error('Email wordmark must be a local asset');
  const width = Math.round(height * logo.width / logo.height);
  return `<img src="${escape(new URL(logo.path,identity.origin).href)}" width="${width}" height="${height}" alt="${escape(identity.name)}" style="display:inline-block;width:${width}px;height:${height}px;border:0;outline:none;text-decoration:none;" />`;
}
