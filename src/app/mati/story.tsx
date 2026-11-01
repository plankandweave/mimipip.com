/** Pieces shared between the server-rendered page and the client-side design
 *  cards. Kept free of "use client" so the page can keep rendering them on the
 *  server. */

/** Render a story line, with *asterisked* spans — the transliterations — in
 *  italics. The Hindi word is the protagonist of every line, and italics are
 *  how running text points at a word AS a word. */
export function Story({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/\*([^*]+)\*/g);
  return (
    <p className={className}>
      {parts.map((part, i) => (i % 2 === 1 ? <i key={i}>{part}</i> : part))}
    </p>
  );
}

/** The site's image loader routes through Supabase's transform CDN, which can
 *  only reach objects in Supabase Storage. Renditions still sitting in /public
 *  (everything, until someone runs the seed script with --upload) have to be
 *  served as they are, or Next warns and the loader hands back a broken URL. */
export const isLocal = (src: string) => src.startsWith("/");
