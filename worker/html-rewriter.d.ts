/** Minimal HTMLRewriter surface used by this Worker. Kept separate from the
 * browser DOM types: the full Workers declarations redefine Response.json(). */
interface MimiHtmlElement {
  remove(): MimiHtmlElement;
  append(content: string, options?: { html?: boolean }): MimiHtmlElement;
  getAttribute(name: string): string | null;
  onEndTag(handler: (end: { before(content: string, options?: { html?: boolean }): unknown }) => void): void;
  setAttribute(name: string, value: string): MimiHtmlElement;
  setInnerContent(content: string, options?: { html?: boolean }): MimiHtmlElement;
}
declare class HTMLRewriter {
  on(selector: string, handlers: { element(element: MimiHtmlElement): void | Promise<void> }): HTMLRewriter;
  transform(response: Response): Response;
}
