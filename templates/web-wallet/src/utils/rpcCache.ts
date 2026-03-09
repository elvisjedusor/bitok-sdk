interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL: Record<string, number> = {
  getInfo: 10_000,
  getAddressBalance: 15_000,
  getAddressTxids: 15_000,
  getMempool: 10_000,
  getRawTransaction: 300_000,
};

export function getCached<T>(key: string, method: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const ttl = DEFAULT_TTL[method] ?? 30_000;
  if (Date.now() - entry.timestamp > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export function invalidatePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function invalidateAll(): void {
  cache.clear();
}
