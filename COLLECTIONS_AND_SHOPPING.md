# MimiPip catalogue and parent shopping path

## Brand and catalogue relationship

MimiPip is the children’s wall décor brand under Magnitude Brands Private Limited. Zyvorah remains the mass-category wallpaper brand. This storefront uses a copy of Zyvorah’s current Kids Wallpapers collection; it does not remove, rename or change Zyvorah’s original listings.

The copied Kids Wallpapers collection contains 177 rendered products retrieved on 29 October 2026: 175 wallpapers and 2 wall borders. The storefront adds Pizza Pal from Zyvorah’s separate Nafas page as a supplemental wallpaper, for 178 records in the storefront. The dedicated `/nafas/` page presents all 11 Nafas designs: the 10 already in the Kids Wallpapers collection plus Pizza Pal. Original names and design images are retained. The JSON source archive preserves the 177-item Kids collection; `nafas/supplement.js` contains the separate Pizza Pal entry. Browse by Nursery, Toddler and Kids; the source contains 84 Nursery-tagged, 35 Toddler-tagged and 177 Kids-tagged products. Counts overlap because every product is in the Kids collection. The Teen tag is not used as a storefront category; the cards retain the source title and images.

| Storefront category | Products in the current copy |
|---|---:|
| Nursery | 84 |
| Toddler | 35 |
| Kids | 177 |
| Wallpapers in source Kids collection | 175 |
| Supplemental Nafas wallpaper | 1 |
| Storefront wallpapers | 176 |
| Storefront products | 178 |
| Nafas collection designs | 11 |
| Wall borders | 2 |
| Animals & birds | 57 |
| Nature & gardens | 103 |
| Adventure & landscape | 75 |
| Sporty | 9 |
| Pastels | 111 |
| Boys’ room inspiration | 84 |
| Girls’ room inspiration | 145 |
| Sky & wonder | 63 |
| Color & pattern | 131 |
| Playful & whimsical | 115 |
| Blue | 72 |
| Green | 81 |
| Neutral | 70 |
| Pink | 61 |
| Yellow | 59 |
| White | 37 |
| Orange | 24 |
| Red | 15 |
| Black | 12 |
| Brown | 11 |
| Purple | 6 |
| Grey | 4 |

Stage, room inspiration, interest and color totals overlap. All eight displayed interest filters, both room-inspiration shortcuts and all 12 color filters return products. Boys’ and girls’ room shortcuts are overlapping editorial paths based on the current themes, not gender-exclusive product claims. All 178 storefront products have source imagery; all wallpaper listings have an available per-square-foot rate in the copied source data. The source has 62 wallpaper products with a Smooth Self-Adhesive material option and no product-level GREENGUARD, PVC-free or emissions evidence.

Height charts and floor games are present as “Coming soon” category cards, with no products or prices listed yet; they need their own MimiPip product data and imagery.

The source image URLs are still hosted on Zyvorah’s image servers. The copy is therefore non-destructive at the catalogue and storefront level, while independent image hosting remains a later migration task if the brands need fully separated media operations.

## Parent shopping path

Home → child stage, room inspiration, design interest, color, format or search → source collection listing, or open the dedicated Nafas story page at `/nafas/` → product images and details → wall-size estimate or border quantity → name and badge preview → browser-local cart → contact and delivery details → final order review.

Stage labels are suggested browse routes, not age rules. Parents can also start from animal and bird designs, botanical and floral patterns, landscapes, skies, patterns, or other tags carried by the copied collection.

## Personalization and cart

The storefront illustrates a child-name preview with cloud, rainbow, star, moon, heart and flower shapes. The shape SVGs are placeholders. UL GREENGUARD is a low-chemical-emissions certification, not a zero-emissions guarantee. The MimiPip product standard requires product-specific evidence for self-adhesive, PVC-free composition and UL GREENGUARD before any wallpaper is represented as meeting it.

The cart stores items in this browser only. The checkout UI captures contact and delivery details in page memory and shows a final review, but does not send or persist those details. It is not connected to Zyvorah’s cart API or private renderer and does not create production files, transmit the name, reserve inventory, take payment or submit an order.

Before taking orders, implement an MimiPip-specific store configuration, verified product and pricing rules, personalization renderer, cart backend, payment/order submission, and approved shipping, returns, installation, care and support information. No furniture or Chindi Interiors products are included in this launch scope.
