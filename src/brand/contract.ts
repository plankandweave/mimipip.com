/** Public, serializable brand identity. Never put service keys here. */
export interface BrandAdapter {
  schemaVersion: 1;
  id: 'mimi-pip' | 'luxury' | 'gen-z';
  name: string;
  title: string;
  description: string;
  origin: string;
  locale: string;
  defaultMarket: 'US' | 'IN';
  contactEmail: string | null;
  logo: string | null;
  emailLogo?: { path: string; width: number; height: number } | null;
  iconSvg: string | null;
  alternateNames: string[];
  publishing?: { youtubeChannelId?: string | null };
  socialLinks: { instagram: string | null; pinterest: string | null; youtube: string | null };
  theme: { background: string; foreground: string; accent: string; provenance: string };
}
/** Capabilities are retained; these are connection permissions, not feature flags. */
export const serviceNames = ['database','storage','ai','payments','email','messaging','analytics','publishing','dns','os'] as const;
export type ServiceName = typeof serviceNames[number];
export interface IsolationPolicy { mode: 'offline'; services: Record<ServiceName, null> }
export function validateBrand(brand: BrandAdapter): BrandAdapter {
  if (brand.schemaVersion !== 1 || !brand.name.trim()) throw new Error('Invalid brand identity');
  const url = new URL(brand.origin);
  if (url.protocol !== 'https:' || (url.hostname !== 'mimipip.com' && !url.hostname.endsWith('.invalid'))) throw new Error('Brand origin must be the Mimi Pip domain or a reserved offline hostname');
  for (const value of [brand.logo]) if (value && (!value.startsWith('/') || value.startsWith('//'))) throw new Error('Brand assets must be local paths');
  return brand;
}
