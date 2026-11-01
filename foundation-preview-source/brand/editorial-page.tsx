import React, { createElement, type ComponentType } from 'react';
import type { Metadata } from 'next';
import { brand } from './current';

/** A historical page is not MimiPip content merely because its template was copied.
 * Approved content requires a reviewed brand-specific adaptation of that template.
 * No inherited page is approved by default; commerce/account tools are not gated here.
 */
export type EditorialApproval = { brandId: typeof brand.id; title: string; description: string; reviewReference: string };
export const editorialApprovals: Readonly<Record<string, EditorialApproval>> = {};
export function editorialMetadata(route: string): Metadata {
 const content = editorialApprovals[route];
 return content ? {title: content.title, description: content.description} : {
  title: `${brand.name} · Collection coming soon`, description: `New ${brand.name} collections and guides are being prepared.`, robots: {index:false, follow:false},
 };
}
export function EditorialEmptyState() {
 return <main id="main-content"><section aria-labelledby="editorial-title" style={{maxWidth:720,margin:'4rem auto',padding:'0 24px'}}>
  <p>{brand.name}</p><h1 id="editorial-title">Something lovely is taking shape.</h1>
  <p>Our collections and guides are being prepared. There are no products available to order yet.</p>
  <a href="/collections">Browse collections</a>
 </section></main>;
}
export function withBrandEditorial<P extends object>(route: string, Template: ComponentType<P>): ComponentType<P> {
 return function BrandEditorialPage(props: P) {
  const approval = editorialApprovals[route];
  if (!approval || approval.brandId !== brand.id || !approval.reviewReference.trim()) return <EditorialEmptyState />;
  return createElement(Template, props);
 };
}
