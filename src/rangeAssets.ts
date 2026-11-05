import type { WindowChunk } from './journey';

export type ByteRange = { start: number; bytes: number };
const decoder = new TextDecoder();

/** Read each multipart body by its declared byte range, never by binary delimiters. */
export function parseRanges(
  raw: ArrayBuffer,
  type: string,
  contentRange: string | null,
  ranges: ByteRange[],
  total: number,
) {
  const bytes = new Uint8Array(raw);
  const extract = (header: string, body: number, length: number) => {
    const match = header.match(/bytes (\d+)-(\d+)\/(\d+)/);
    if (!match || Number(match[3]) !== total) throw Error('窗口范围不匹配');
    const start = Number(match[1]),
      count = Number(match[2]) - start + 1;
    if (count !== length || body + count > bytes.length) throw Error('窗口范围长度不匹配');
    return { start, bytes: count, data: raw.slice(body, body + count) };
  };
  if (!type.startsWith('multipart/byteranges')) {
    const part = extract(contentRange ?? '', 0, raw.byteLength);
    if (ranges.length !== 1 || part.start !== ranges[0].start || part.bytes !== ranges[0].bytes)
      throw Error('窗口范围不匹配');
    return [part.data];
  }
  const boundary = type.match(/boundary=(?:"([^"]+)"|([^;\s]+))/);
  const marker = '--' + (boundary?.[1] ?? boundary?.[2] ?? '');
  if (!boundary) throw Error('窗口范围边界缺失');
  const parts = new Map<number, { bytes: number; data: ArrayBuffer }>();
  let at = 0;
  while (at < bytes.length) {
    while (bytes[at] === 13 || bytes[at] === 10) at++;
    if (decoder.decode(bytes.subarray(at, at + marker.length)) !== marker)
      throw Error('窗口范围边界不匹配');
    at += marker.length;
    if (bytes[at] === 45 && bytes[at + 1] === 45) break;
    if (bytes[at] !== 13 || bytes[at + 1] !== 10) throw Error('窗口范围头不匹配');
    at += 2;
    let end = at;
    while (
      end + 3 < bytes.length &&
      !(
        bytes[end] === 13 &&
        bytes[end + 1] === 10 &&
        bytes[end + 2] === 13 &&
        bytes[end + 3] === 10
      )
    )
      end++;
    const header = decoder.decode(bytes.subarray(at, end));
    const range = header.match(/content-range:\s*(bytes \d+-\d+\/\d+)/i)?.[1] ?? '';
    const match = range.match(/bytes (\d+)-(\d+)\/(\d+)/);
    if (!match) throw Error('窗口范围头缺失');
    const count = Number(match[2]) - Number(match[1]) + 1;
    const part = extract(range, end + 4, count);
    if (parts.has(part.start)) throw Error('重复窗口范围');
    parts.set(part.start, part);
    at = end + 4 + count;
  }
  if (parts.size !== ranges.length) throw Error('窗口范围不完整');
  return ranges.map((range) => {
    const part = parts.get(range.start);
    if (!part || part.bytes !== range.bytes) throw Error('窗口范围不匹配');
    return part.data;
  });
}

export async function fetchRanges(
  asset: WindowChunk,
  ranges: ByteRange[],
  full: () => Promise<ArrayBuffer>,
) {
  if (!ranges.length) return [];
  if (
    ranges.some(
      (range) =>
        !Number.isInteger(range.start) ||
        range.start < 0 ||
        range.bytes < 1 ||
        range.start + range.bytes > asset.bytes,
    )
  )
    throw Error('无效窗口范围');
  const response = await fetch(
    `${import.meta.env.BASE_URL}data/journey/${asset.file}?v=${asset.sha256}`,
    {
      headers: {
        Range:
          'bytes=' +
          ranges.map((range) => `${range.start}-${range.start + range.bytes - 1}`).join(','),
      },
    },
  );
  if (response.status === 206) {
    try {
      return parseRanges(
        await response.arrayBuffer(),
        response.headers.get('Content-Type') ?? '',
        response.headers.get('Content-Range'),
        ranges,
        asset.bytes,
      );
    } catch {
      // Some static hosts apply compression before slicing; recover from the original full file.
    }
  } else if (response.status === 200) {
    const raw = await response.arrayBuffer();
    if (raw.byteLength !== asset.bytes) throw Error('窗口文件长度不匹配');
    return ranges.map((range) => raw.slice(range.start, range.start + range.bytes));
  } else if (response.status !== 416) throw Error('窗口结果读取失败');
  const raw = await full();
  return ranges.map((range) => raw.slice(range.start, range.start + range.bytes));
}
