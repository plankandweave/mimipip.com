import designs from './happy-petals.json';

const collection = '/collections/happy-petals/';
const fromLabel = (value:string) => {
  const label = value.trim().toLowerCase().replaceAll(' ', '-');
  return designs.find(design => design.slug === 'happy-petals-' + (label === 'signature-blue' ? 'blue' : label));
};

export function legacyPetalsDestination(colourway?:string|null) {
  const design = colourway && fromLabel(colourway);
  return design ? '/products/' + design.slug : collection;
}

export function migratePetalsLine<T extends {slug:string; name:string; crop?:{imageUrl?:string}}>(line:T):T {
  if (line.slug !== 'happy-petals') return line;
  const label = line.name.match(/^Happy Petals — (.+)$/)?.[1];
  const byName = label ? fromLabel(label) : undefined;
  const image = line.crop?.imageUrl;
  const byArt = designs.find(design => image === '/review/happy-petals/' + design.flat);
  if ((image && !byArt) || (label && !byName) || (byName && byArt && byName !== byArt)) return line;
  const design = byArt ?? byName;
  return design ? {...line, slug:design.slug, name:'Happy Petals · ' + design.label} : line;
}
