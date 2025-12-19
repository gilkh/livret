"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbCache = void 0;
exports.withCache = withCache;
exports.clearCache = clearCache;
const lru_cache_1 = require("lru-cache");
// standard cache options: 500 items, 10 minutes TTL
const options = {
    max: 500,
    ttl: 1000 * 60 * 10,
};
exports.dbCache = new lru_cache_1.LRUCache(options);
/**
 * Helper to wrap a database call with caching.
 * @param key Unique key for the cache
 * @param fn Function that returns the data from the database
 * @param ttl Optional TTL for this specific entry
 */
async function withCache(key, fn, ttl) {
    const cached = exports.dbCache.get(key);
    if (cached !== undefined)
        return cached;
    const result = await fn();
    exports.dbCache.set(key, result, { ttl });
    return result;
}
function clearCache(pattern) {
    if (!pattern) {
        exports.dbCache.clear();
        return;
    }
    for (const key of exports.dbCache.keys()) {
        if (typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)) {
            exports.dbCache.delete(key);
        }
    }
}
