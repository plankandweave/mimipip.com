// Pure pgvector string helpers. `toVectorLiteral` was lifted from
// src/lib/clip.ts because that module (and its @xenova/transformers runtime)
// now lives in the media container — but building the vector literal is plain
// string work the app keeps for the RPC calls that store embeddings.
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
