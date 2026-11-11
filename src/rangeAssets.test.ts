import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRanges, parseRanges } from './rangeAssets';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const asset = (file: string) => ({
  file,
  bytes: 10,
  sha256: hash('abcdefghij'),
  start: 0,
  count: 1,
});
afterEach(() => vi.unstubAllGlobals());

describe('binary byte ranges', () => {
  it('recovers a stalled response body from a fresh full-file read', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        status: 206,
        arrayBuffer: () => Promise.reject(new DOMException('Timed out', 'TimeoutError')),
      })
      .mockResolvedValueOnce(new Response('abcdefghij'));
    vi.stubGlobal('fetch', fetch);
    const parts = await fetchRanges(asset('stall.bin'), [{ start: 1, bytes: 2 }], hash('bc'));
    expect(new TextDecoder().decode(parts[0])).toBe('bc');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].cache).toBe('reload');
  });
  it.each([false, true])(
    'rejects equal-length changed ranges (multipart: %s)',
    async (multipart) => {
      const ranges = multipart
        ? [
            { start: 1, bytes: 2 },
            { start: 6, bytes: 2 },
          ]
        : [{ start: 1, bytes: 2 }];
      const response = multipart
        ? new Response(
            '--a\r\nContent-Range: bytes 6-7/10\r\n\r\ngh\r\n--a\r\nContent-Range: bytes 1-2/10\r\n\r\nbX\r\n--a--\r\n',
            {
              status: 206,
              headers: { 'Content-Type': 'multipart/byteranges; boundary=a' },
            },
          )
        : new Response('bX', { status: 206, headers: { 'Content-Range': 'bytes 1-2/10' } });
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce(new Response('abcdefghij'));
      vi.stubGlobal('fetch', fetch);
      const parts = await fetchRanges(
        asset(`changed-${multipart}.bin`),
        ranges,
        hash(multipart ? 'bcgh' : 'bc'),
      );
      expect(parts.map((part) => new TextDecoder().decode(part))).toEqual(
        multipart ? ['bc', 'gh'] : ['bc'],
      );
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
  it('does not cache a corrupt full-file fallback and retries after recovery', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('bX', { status: 206, headers: { 'Content-Range': 'bytes 1-2/10' } }),
      )
      .mockResolvedValueOnce(new Response('abcdXfghij'))
      .mockResolvedValueOnce(
        new Response('bc', { status: 206, headers: { 'Content-Range': 'bytes 1-2/10' } }),
      );
    vi.stubGlobal('fetch', fetch);
    const source = asset('corrupt-fallback.bin');
    const ranges = [{ start: 1, bytes: 2 }];
    await expect(fetchRanges(source, ranges, hash('bc'))).rejects.toThrow('数据文件不匹配');
    const parts = await fetchRanges(source, ranges, hash('bc'));
    expect(new TextDecoder().decode(parts[0])).toBe('bc');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('reuses a verified 200 response for adjacent ranges', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('abcdefghij'));
    vi.stubGlobal('fetch', fetch);
    const source = asset('whole.bin');
    for (const [start, expected] of [
      [1, 'bc'],
      [3, 'de'],
      [5, 'fg'],
    ] as const) {
      const parts = await fetchRanges(source, [{ start, bytes: 2 }], hash(expected));
      expect(new TextDecoder().decode(parts[0])).toBe(expected);
    }
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('preserves binary CRLF and boundary-like bytes inside multipart data', () => {
    const first = new Uint8Array([13, 10, 45, 45, 97, 13, 10, 0]);
    const second = new Uint8Array([255, 0, 128, 13]);
    const encoder = new TextEncoder();
    const segments = [
      encoder.encode(
        '--a\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes 20-27/100\r\n\r\n',
      ),
      first,
      encoder.encode('\r\n--a\r\nContent-Range: bytes 60-63/100\r\n\r\n'),
      second,
      encoder.encode('\r\n--a--\r\n'),
    ];
    const raw = new Uint8Array(segments.reduce((sum, item) => sum + item.length, 0));
    let at = 0;
    for (const part of segments) {
      raw.set(part, at);
      at += part.length;
    }
    const result = parseRanges(
      raw.buffer,
      'multipart/byteranges; boundary=a',
      null,
      [
        { start: 60, bytes: 4 },
        { start: 20, bytes: 8 },
      ],
      100,
    );
    expect(new Uint8Array(result[0])).toEqual(second);
    expect(new Uint8Array(result[1])).toEqual(first);
  });
  it('rejects truncated, missing and wrong-source single ranges', () => {
    expect(() =>
      parseRanges(
        new ArrayBuffer(4),
        'application/octet-stream',
        'bytes 20-24/100',
        [{ start: 20, bytes: 5 }],
        100,
      ),
    ).toThrow();
    expect(() =>
      parseRanges(
        new ArrayBuffer(4),
        'application/octet-stream',
        'bytes 20-23/101',
        [{ start: 20, bytes: 4 }],
        100,
      ),
    ).toThrow();
    expect(() =>
      parseRanges(
        new ArrayBuffer(4),
        'application/octet-stream',
        'bytes 21-24/100',
        [{ start: 20, bytes: 4 }],
        100,
      ),
    ).toThrow();
  });
});
