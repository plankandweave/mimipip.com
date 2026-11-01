/** Renders a JSON-LD structured-data block. `data` may be a single object or
 *  an array of objects (each valid schema.org JSON-LD). */
export function JsonLd({ data }: { data: unknown }) {
  if (data == null) return null;
  return (
    <script
      type="application/ld+json"
      // Escape HTML delimiters too: a description may contain </script>.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
