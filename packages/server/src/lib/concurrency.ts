/**
 * Small, dependency-free async helpers. Pure — no db, no network, no config.
 */

/**
 * Runs `fn` over `items` with at most `limit` promises in flight, preserving
 * input order in the result. Never rejects: failures come back as settled
 * results so one bad item cannot abort the batch.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  if (items.length === 0) return results;

  const workers = Math.max(1, Math.min(limit, items.length));
  let next = 0;

  const runWorker = async (): Promise<void> => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };

  await Promise.all(Array.from({ length: workers }, runWorker));
  return results;
}

/** Splits `items` into consecutive chunks of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
