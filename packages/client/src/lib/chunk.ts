/** Splits ids into consecutive chunks of at most `size`. */
export function chunkIds(ids: readonly number[], size: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push([...ids.slice(i, i + size)]);
  return out;
}
