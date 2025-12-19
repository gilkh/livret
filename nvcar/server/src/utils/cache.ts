import { LRUCache } from 'lru-cache'

// standard cache options: 500 items, 10 minutes TTL
const options = {
    max: 500,
    ttl: 1000 * 60 * 10,
}

export const dbCache = new LRUCache<string, any>(options)

/**
 * Helper to wrap a database call with caching.
 * @param key Unique key for the cache
 * @param fn Function that returns the data from the database
 * @param ttl Optional TTL for this specific entry
 */
export async function withCache<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = dbCache.get(key)
    if (cached !== undefined) return cached as T

    const result = await fn()
    dbCache.set(key, result, { ttl })
    return result
}

export function clearCache(pattern?: string | RegExp) {
    if (!pattern) {
        dbCache.clear()
        return
    }

    for (const key of dbCache.keys()) {
        if (typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)) {
            dbCache.delete(key)
        }
    }
}
