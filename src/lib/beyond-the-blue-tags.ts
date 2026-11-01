import { blueRoom } from './beyond-the-blue-rooms';
/** Discovery tags describe the artwork; room tags require the corresponding pictured setting. */
export function blueTags(slug: string, repeat = false) {
  const room = blueRoom(slug, repeat);
  return ['Beyond the Blue', 'Blue', 'White', 'Blue And White', 'Bicolor', 'Landscape', 'Art', 'Watercolor', 'Vintage', 'Botanical', 'Mood: Serene', room.tag,
    ...(room.scene === 'office' ? ['Office'] : []),
    ...(repeat ? ['Pattern', 'Seamless'] : ['Mural']),
    ...(['orchard-pavilion', 'tulip-country', 'heron-wetlands'].includes(slug) ? ['Floral', 'Mood: Fresh'] : []),
    ...(['heron-wetlands', 'orchard-pavilion'].includes(slug) ? ['Birds'] : []),
    ...(['lakeside-chateau', 'italian-terrace', 'moonlit-river'].includes(slug) ? ['Mood: Romantic'] : []),
  ];
}
