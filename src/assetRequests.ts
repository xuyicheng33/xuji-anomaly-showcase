import { dataUrl } from './datasets';
import type { Asset } from './journeyTypes';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** Pending requests are shared; completed values use a byte-limited LRU cache. */
export class RequestCache<T> {
  private pending = new Map<string, Promise<T>>();
  private values = new Map<string, { value: T; bytes: number }>();
  private bytes = 0;
  constructor(private budget: number) {}

  peek(key: string) {
    const saved = this.values.get(key);
    if (saved) {
      this.values.delete(key);
      this.values.set(key, saved);
    }
    return saved?.value;
  }

  set(key: string, bytes: number, value: T) {
    this.bytes -= this.values.get(key)?.bytes ?? 0;
    this.values.delete(key);
    this.values.set(key, { value, bytes });
    this.bytes += bytes;
    while (this.bytes > this.budget) {
      const oldest = this.values.keys().next().value!;
      this.bytes -= this.values.get(oldest)!.bytes;
      this.values.delete(oldest);
    }
    return value;
  }

  delete(key: string, value: T) {
    const saved = this.values.get(key);
    if (!saved || saved.value !== value) return;
    this.bytes -= saved.bytes;
    this.values.delete(key);
  }

  get(key: string, bytes: number | ((value: T) => number), read: () => Promise<T>): Promise<T> {
    const saved = this.peek(key);
    if (saved !== undefined) return Promise.resolve(saved);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = read()
      .then((value) => this.set(key, typeof bytes === 'number' ? bytes : bytes(value), value))
      .finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
}

/** Timeout shared transfers without cancelling another view's request. */
export const requestData = (file: string, init?: RequestInit) =>
  fetch(dataUrl(file), { ...init, signal: init?.signal ?? AbortSignal.timeout(30000) });

const binaryCache = new RequestCache<ArrayBuffer>(16 * 1024 * 1024);
// A failed response may still live in the browser's immutable HTTP cache.
// Keep retry state bounded, and bypass that cache until a verified read succeeds.
const failedRequests = new RequestCache<boolean>(128);
const failed = (key: string) => failedRequests.set(key, 1, true);
const recovered = (key: string) => failedRequests.delete(key, true);
type BinaryAsset = Pick<Asset, 'file' | 'bytes' | 'sha256'>;
const binaryKey = (asset: BinaryAsset) => `${asset.file}:${asset.sha256}`;
/** Also works on the dedicated HTTP site, where Web Crypto is unavailable. */
export function verifyBinary(raw: ArrayBuffer, asset: Pick<Asset, 'bytes' | 'sha256'>) {
  if (raw.byteLength !== asset.bytes) throw Error('数据文件长度不匹配');
  if (bytesToHex(sha256(new Uint8Array(raw))) !== asset.sha256) throw Error('数据文件不匹配');
  return raw;
}
export const cachedBinary = (asset: BinaryAsset) => binaryCache.peek(binaryKey(asset));
export const cacheBinary = (asset: BinaryAsset, raw: ArrayBuffer) =>
  binaryCache.set(binaryKey(asset), asset.bytes, verifyBinary(raw, asset));

export function loadBinary(asset: BinaryAsset, cache?: RequestInit['cache']) {
  const key = binaryKey(asset);
  return binaryCache.get(key, asset.bytes, async () => {
    try {
      const response = await requestData(`${asset.file}?v=${asset.sha256}`, {
        cache: failedRequests.peek(key) ? 'reload' : cache,
      });
      if (!response.ok) throw Error('数据读取失败');
      const raw = verifyBinary(await response.arrayBuffer(), asset);
      recovered(key);
      return raw;
    } catch (error) {
      failed(key);
      throw error;
    }
  });
}

const jsonCache = new RequestCache<{ value: unknown; bytes: number }>(2 * 1024 * 1024);
export async function loadJson<T>(file: string, validate: (value: T) => void = () => {}) {
  const saved = await jsonCache.get(
    file,
    (entry) => entry.bytes,
    async () => {
      try {
        const response = await requestData(file, {
          cache: failedRequests.peek(file) ? 'reload' : undefined,
        });
        if (!response.ok) throw Error('资料读取失败');
        const raw = await response.text();
        return { value: JSON.parse(raw), bytes: new TextEncoder().encode(raw).byteLength };
      } catch (error) {
        failed(file);
        throw error;
      }
    },
  );
  try {
    // A shared transfer must still satisfy each caller's current contract.
    validate(saved.value as T);
    recovered(file);
    return saved.value as T;
  } catch (error) {
    jsonCache.delete(file, saved);
    failed(file);
    throw error;
  }
}
