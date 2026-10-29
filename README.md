# MimiPip website

Standalone children’s wall and floor play storefront for the MimiPip brand, hosted by Magnitude Brands Private Limited. The launch scope is children’s wall products; furniture and Chindi Interiors are excluded.

## Catalogue copy

The storefront imports the 177 products in Zyvorah’s rendered Kids Wallpapers collection as retrieved on 29 October 2026: 175 wallpapers and 2 wall borders. It adds Pizza Pal from Zyvorah’s separate Nafas collection page, for 178 product records total. The dedicated story page at `/nafas/` presents all 11 Nafas designs and links them into the MimiPip product preview. Source titles, descriptions and artwork remain intact; product imagery is served from Zyvorah’s existing image hosts.

`catalogue-zyvorah-copy.json` is the archival data copy. `catalogue.js` is its browser-loadable version used by `index.html`. The source collection is Zyvorah’s Kids Wallpapers / `playroom` collection, filtered to products rendered in that room scene. Stage and interest facets use the copied product tags.

## Storefront experience

- Parent-led browsing by nursery, toddler and kids; boys’ and girls’ room inspiration; interest, color, format and search. A story-led Nafas page at `/nafas/` mirrors the source collection’s chapters and features all 11 designs.
- Product details with the original design images, names and descriptions.
- Child-name and six-shape badge preview, wall-size estimator, local cart, checkout details and final order review.
- Product navigation for wallpapers, borders, height charts and floor games; the latter two are coming-soon categories until products are added.
- Transparent MimiPip logo and warm ivory / orange identity.

## Review and commerce limits

The Browse dropdown contains both By Stage and By Interest. By Color and By Product have their own dropdowns. Stage options are Nursery, Toddler and Kids; browse paths also include eight interest groups, two overlapping room-inspiration shortcuts and twelve catalogue-backed color filters. The cart and checkout-to-review path are local to this page for design review. Checkout contact and address details are not sent or persisted. The site does not reserve stock, transmit personalization, create print-ready artwork, submit an order or take payment. Wall-estimate arithmetic is a prototype and needs confirmation against the approved MimiPip SKU, production, tax and checkout rules before public sales. Name entry is a visual preview only; no personalization fee is represented. The copied catalogue has 62 wallpaper products with a Smooth Self-Adhesive material option, but no product-level GREENGUARD, PVC-free or emissions evidence. These are MimiPip listing requirements, not verified claims about every copied product. Product materials, fulfilment, installation, care, returns and support details also need approval before launch.

The Nafas page follows Zyvorah’s chapter structure and has all 11 design cards. Its catalogue is embedded in the page so the cards render in the local preview without loading a separate script file. The transparent logo is bundled locally and cropped to its visible mark. The original Nafas room images and flat drawings are bundled locally, so the collection does not depend on Zyvorah’s image host to display them. The page uses a stronger orange, coral, marigold and teal palette. The artist portrait, original tree painting, and voice tracks are not bundled; the welcome link opens Nafas’s original collection, where her recordings play. The six badge shapes are visual placeholders. Zyvorah’s copied implementation references are retained under `zyvorah-reference/` as unmodified integration guidance; its private cart and rendering routes are not connected to this storefront.

## Files

- `index.html` — storefront, filters, product detail, personalization preview and cart.
- `catalogue-zyvorah-copy.json` / `catalogue.js` — copied Kids collection.
- `assets/lorange-kids-logo-transparent.png` — transparent brand mark used on the storefront.
- `assets/shapes/` — six placeholder personalization badge shapes.
- `zyvorah-reference/` — unmodified copied source references and integration notes.
