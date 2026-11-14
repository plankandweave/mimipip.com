import { INSTAGRAM_URL, PINTEREST_URL, YOUTUBE_URL } from "@/lib/seo";
import { amazonIndiaLink } from "@/brand/commerce/amazon-india";

export function FooterBrandLinks() {
  const links = [
    { name: "Instagram", href: INSTAGRAM_URL, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg> },
    { name: "Pinterest", href: PINTEREST_URL, icon: <svg viewBox="0 0 24 24" fill="currentColor"><text x="5" y="21" fontFamily="Georgia,serif" fontSize="25" fontWeight="bold" fontStyle="italic">P</text></svg> },
    { name: "YouTube", href: YOUTUBE_URL, icon: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="1" y="4" width="22" height="16" rx="5"/><path d="m10 8 6 4-6 4z" fill="#fffcf7"/></svg> },
    { name: "Etsy", href: "https://www.etsy.com/shop/MimiPip", icon: <svg viewBox="0 0 24 24" fill="currentColor"><text x="3" y="21" fontFamily="Georgia,serif" fontSize="26">E</text></svg> },
    { name: "MimiPip on Amazon India", href: amazonIndiaLink(), icon: <svg viewBox="0 0 24 24" fill="currentColor"><text x="5" y="17" fontFamily="Arial,sans-serif" fontWeight="bold" fontSize="23">a</text><path d="M3 19q8 6 17-1M17 18l3-.5-.5 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  ];
  return <div className="mimi-footer-brands" aria-label="Follow and shop MimiPip">{links.filter(link => link.href).map(link =>
    <a key={link.name} href={link.href!} aria-label={link.name} title={link.name} {...(link.href!.startsWith("https:") ? {target:"_blank",rel:"noopener noreferrer"} : {})}><span aria-hidden="true">{link.icon}</span></a>
  )}</div>;
}
