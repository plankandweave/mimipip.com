// Source arrays preserve upload order. Prefer named flats, then studio originals.
export function pickFlatSource(images:readonly string[]){
 const lastFirst=[...images].reverse();
 return images.find(url=>/(?:^|\/)flat(?:[-_.\/]|$)/i.test(url))
  ?? lastFirst.find(url=>/\/studio-uploads\//i.test(url))
  ?? lastFirst.find(url=>!/(?:^|[\/_-])(?:scene|room|render|closeup|detail|playroom|kidsroom|bedroom|nursery)(?:[-_.\/]|$)/i.test(url));
}
