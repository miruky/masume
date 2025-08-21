import { describe, expect, it } from 'vitest';
import { normalizeCell, toKatakana } from './kana';

describe('toKatakana', () => {
  it('ひらがなをカタカナへ写す', () => {
    expect(toKatakana('さくら')).toBe('サクラ');
    expect(toKatakana('ゔぁいおりん')).toBe('ヴァイオリン');
  });

  it('カタカナ・長音・他の文字はそのまま', () => {
    expect(toKatakana('カレーx1')).toBe('カレーx1');
  });
});

describe('normalizeCell', () => {
  it('最後の1文字をカタカナにして返す', () => {
    expect(normalizeCell('さ')).toBe('サ');
    expect(normalizeCell('サ')).toBe('サ');
    expect(normalizeCell('さく')).toBe('ク');
  });

  it('長音と小書きも1マスとして扱う', () => {
    expect(normalizeCell('ー')).toBe('ー');
    expect(normalizeCell('ッ')).toBe('ッ');
    expect(normalizeCell('ょ')).toBe('ョ');
  });

  it('かな以外は空文字になる', () => {
    expect(normalizeCell('a')).toBe('');
    expect(normalizeCell('漢')).toBe('');
    expect(normalizeCell('')).toBe('');
    expect(normalizeCell(' ')).toBe('');
  });
});
