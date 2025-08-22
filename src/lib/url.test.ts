import { describe, expect, it } from 'vitest';
import { DEFAULT_SIZE, formatHash, parseHash } from './url';

describe('parseHash', () => {
  it('問題番号だけのハッシュを読む(既定の大きさ)', () => {
    expect(parseHash('#p=12345')).toEqual({ seed: 12345, size: DEFAULT_SIZE });
    expect(parseHash('p=7')).toEqual({ seed: 7, size: DEFAULT_SIZE });
  });

  it('大きさつきのハッシュを読む', () => {
    expect(parseHash('#p=99&s=13')).toEqual({ seed: 99, size: 13 });
  });

  it('範囲外の大きさは既定へ丸める', () => {
    expect(parseHash('#p=1&s=99')).toEqual({ seed: 1, size: DEFAULT_SIZE });
    expect(parseHash('#p=1&s=3')).toEqual({ seed: 1, size: DEFAULT_SIZE });
  });

  it('問題番号が無い・不正なものは null', () => {
    expect(parseHash('')).toBeNull();
    expect(parseHash('#')).toBeNull();
    expect(parseHash('#s=11')).toBeNull();
    expect(parseHash('#p=abc')).toBeNull();
  });
});

describe('formatHash', () => {
  it('既定の大きさは省略する', () => {
    expect(formatHash(42, DEFAULT_SIZE)).toBe('#p=42');
  });

  it('既定以外の大きさは載せる', () => {
    expect(formatHash(42, 13)).toBe('#p=42&s=13');
  });

  it('parseHashと往復できる', () => {
    for (const [seed, size] of [
      [7, 11],
      [123, 9],
      [9999, 13],
    ] as const) {
      const route = parseHash(formatHash(seed, size));
      expect(route).toEqual({ seed, size });
    }
  });
});
