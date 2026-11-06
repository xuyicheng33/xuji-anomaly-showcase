import { describe, expect, it, vi } from 'vitest';
import { fetchRanges, parseRanges } from './rangeAssets';

describe('binary byte ranges', () => {
  it('recovers a stalled response body from a fresh full-file read', async () => {
    const raw = new Uint8Array([1, 2, 3, 4]).buffer;
    const full = vi.fn().mockResolvedValue(raw);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 206,
        arrayBuffer: () => Promise.reject(new DOMException('Timed out', 'TimeoutError')),
      }),
    );
    try {
      const parts = await fetchRanges(
        { file: 'stall.bin', bytes: 4, sha256: '', start: 0, count: 1 },
        [{ start: 1, bytes: 2 }],
        full,
      );
      expect(new Uint8Array(parts[0])).toEqual(new Uint8Array([2, 3]));
      expect(full).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
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
