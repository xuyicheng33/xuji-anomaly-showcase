import { describe, it, expect } from 'vitest';
import { RequestCache } from './assetRequests';

describe('shared resource cache', () => {
  it('shares pending reads and retries a failed transfer', async () => {
    const cache = new RequestCache<number>(10);
    let finish!: (n: number) => void;
    let reads = 0;
    const read = () => {
      reads++;
      return new Promise<number>((resolve) => {
        finish = resolve;
      });
    };
    const first = cache.get('a', 4, read);
    expect(cache.get('a', 4, read)).toBe(first);
    finish(7);
    expect(await first).toBe(7);
    expect(await cache.get('a', 4, read)).toBe(7);
    expect(reads).toBe(1);
    await expect(cache.get('failed', 4, () => Promise.reject(Error('offline')))).rejects.toThrow(
      'offline',
    );
    expect(await cache.get('failed', 4, () => Promise.resolve(9))).toBe(9);
  });
  it('evicts least recently used bytes, including oversize values', async () => {
    const cache = new RequestCache<number>(8);
    await cache.get('a', 4, () => Promise.resolve(1));
    await cache.get('b', 4, () => Promise.resolve(2));
    await cache.get('a', 4, () => Promise.resolve(3));
    await cache.get('c', 4, () => Promise.resolve(4));
    expect(await cache.get('a', 4, () => Promise.resolve(5))).toBe(1);
    expect(await cache.get('b', 4, () => Promise.resolve(6))).toBe(6);
    await cache.get('large', 20, () => Promise.resolve(7));
    expect(await cache.get('large', 20, () => Promise.resolve(8))).toBe(8);
  });
});
