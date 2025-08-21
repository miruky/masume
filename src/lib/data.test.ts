import { describe, expect, it } from 'vitest';
import { words } from './data/words';

describe('語彙データ', () => {
  it('語はカタカナ(長音含む)3文字以上で重複がない', () => {
    for (const w of words) {
      expect(w.word).toMatch(/^[ァ-ヶー]{3,}$/u);
    }
    expect(new Set(words.map((w) => w.word)).size).toBe(words.length);
  });

  it('カギは答えの語を含まない', () => {
    for (const w of words) {
      expect(w.clue).not.toContain(w.word);
      expect(w.clue.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('交差が生まれる程度の語数がある', () => {
    expect(words.length).toBeGreaterThanOrEqual(80);
  });
});
