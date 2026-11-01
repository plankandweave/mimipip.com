export function canvasJourney(path: string, page: { path: string; canvas: boolean }, items: { category?: string | null }[]): boolean {
  if (path === "/cart" || path === "/checkout") {
    return items.length ? items.every(item => item.category === "canvas") : page.canvas;
  }
  return path === "/collections/canvas-art" || (page.path === path && page.canvas);
}

export function canvasBrowseLinks<T extends { label: string; href: string }>(links: T[], product: boolean): T[] {
  return links.filter(link => link.href !== "/samples" && link.href !== "/print-your-own").map(link => link.href === "/wall-price"
    ? { ...link, label: "Choose your artwork", href: product ? "#create-your-wall" : "/collections/canvas-art" }
    : link.href === "/design-with" ? { ...link, label: "Find your artwork", href: "/collections/canvas-art" } : link);
}
