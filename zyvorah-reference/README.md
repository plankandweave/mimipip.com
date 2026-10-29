# Zyvorah source references for Orange Kids

These files are direct copies from `plankandweave/Zyvorah.com` (branch `main`, retrieved 29 October 2026). They are kept unmodified as the implementation reference requested for Orange Kids.

## Copied product and cart flow

- `ProductConfigurator.tsx` — product selection, child-name personalization wiring, preview and add-to-cart interaction.
- `TextOverlayEditor.tsx` — name/quote input, validation, preview, and positioning controls.
- `text-overlay.ts` — shared overlay schema and placement helpers.
- `CartProvider.tsx` — cart client state and API calls.
- `AddedToCartSheet.tsx` — accessible after-add cart sheet.
- `cart-page.tsx` — Zyvorah cart page.
- `cart-route.ts` — Zyvorah cart API route.
- `text-overlay-route.ts` — Zyvorah text-preview API route.
- `text-overlay-server.ts` — calls Zyvorah’s private rendering service.

## Integration boundary

These are source references, not an Orange Kids runtime. The cart API reads/writes Zyvorah’s cart database and the name preview calls Zyvorah’s private renderer. Do not connect Orange Kids visitors to those routes. The components also import Zyvorah’s app context, product data, market and pricing modules, styles, and other shared app code that are not copied here. Orange Kids needs its own store configuration and backend before these exact files can run safely.

The Orange Kids shape badge assets under `../assets/shapes/` are design placeholders. Zyvorah’s copied schema currently accepts only its scalloped cloud shape; supporting rainbow, star, moon, heart and flower in the actual product editor requires extending Zyvorah’s shape contract and renderer while preserving the existing name preview and cart-data flow.
