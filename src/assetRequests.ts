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

  get(key: string, bytes: number, read: () => Promise<T>): Promise<T> {
    const saved = this.values.get(key);
    if (saved) {
      this.values.delete(key);
      this.values.set(key, saved);
      return Promise.resolve(saved.value);
    }
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = read()
      .then((value) => {
        this.values.set(key, { value, bytes });
        this.bytes += bytes;
        while (this.bytes > this.budget) {
          const oldest = this.values.keys().next().value!;
          this.bytes -= this.values.get(oldest)!.bytes;
          this.values.delete(oldest);
        }
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
}

/** Timeout shared transfers without cancelling another view's request. */
export const requestData = (file: string, init?: RequestInit) =>
  fetch(dataUrl(file), { ...init, signal: AbortSignal.timeout(30000) });

const binaryCache = new RequestCache<ArrayBuffer>(16 * 1024 * 1024);
/** Also works on the dedicated HTTP site, where Web Crypto is unavailable. */
export function verifyBinary(raw: ArrayBuffer, asset: Pick<Asset, 'bytes' | 'sha256'>) {
  if (raw.byteLength !== asset.bytes) throw Error('数据文件长度不匹配');
  if (bytesToHex(sha256(new Uint8Array(raw))) !== asset.sha256) throw Error('数据文件不匹配');
  return raw;
}
export function loadBinary(asset: Pick<Asset, 'file' | 'bytes' | 'sha256'>) {
  return binaryCache.get(`${asset.file}:${asset.sha256}`, asset.bytes, async () => {
    const response = await requestData(`${asset.file}?v=${asset.sha256}`);
    if (!response.ok) throw Error('数据读取失败');
    return verifyBinary(await response.arrayBuffer(), asset);
  });
}

const jsonCache = new RequestCache<unknown>(2 * 1024 * 1024);
export function loadJson<T>(file: string, validate: (value: T) => void = () => {}) {
  return jsonCache.get(file, 512 * 1024, async () => {
    const response = await requestData(file);
    if (!response.ok) throw Error('资料读取失败');
    const value: T = await response.json();
    validate(value);
    return value;
  }) as Promise<T>;
}
