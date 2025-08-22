import { describe, expect, it } from 'vitest';
import { words } from './data/words';
import { firstEmptyCell, generate, grade } from './generator';
import type { Puzzle } from './generator';

function lettersOf(p: Puzzle, row: number, col: number, dir: 'across' | 'down', word: string) {
  const dr = dir === 'down' ? 1 : 0;
  const dc = dir === 'across' ? 1 : 0;
  return [...word].map((_, i) => p.solution[row + dr * i]?.[col + dc * i]);
}

describe('generate', () => {
  it('同じシードからは同じ盤面ができる', () => {
    const a = generate(words, 42);
    const b = generate(words, 42);
    expect(a.placements).toEqual(b.placements);
    expect(a.solution).toEqual(b.solution);
  });

  it('30シードで盤面の不変条件が崩れない', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = generate(words, seed);

      // 規定の語数以上が置かれている
      expect(p.placements.length).toBeGreaterThanOrEqual(10);

      // 語はすべて重複なく、盤面の文字と一致している
      const wordSet = new Set(p.placements.map((pl) => pl.word));
      expect(wordSet.size).toBe(p.placements.length);
      for (const pl of p.placements) {
        expect(lettersOf(p, pl.row, pl.col, pl.dir, pl.word)).toEqual([...pl.word]);
      }

      // 番号は1始まりの昇順で、同じ開始マスは同じ番号
      const numbers = p.placements.map((pl) => pl.number);
      expect(Math.min(...numbers)).toBe(1);
      const byStart = new Map<string, number>();
      for (const pl of p.placements) {
        const key = `${pl.row}:${pl.col}`;
        const seen = byStart.get(key);
        if (seen !== undefined) expect(pl.number).toBe(seen);
        byStart.set(key, pl.number);
      }
    }
  });

  it('大きさを変えても盤面の不変条件が崩れない', () => {
    for (const size of [9, 13]) {
      for (let seed = 1; seed <= 8; seed++) {
        const minWords = size - 2;
        const p = generate(words, seed, size, minWords);
        expect(p.size).toBe(size);
        expect(p.placements.length).toBeGreaterThanOrEqual(minWords);
        for (const pl of p.placements) {
          expect(lettersOf(p, pl.row, pl.col, pl.dir, pl.word)).toEqual([...pl.word]);
        }
      }
    }
  });

  it('すべての語が少なくとも1か所で他の語と交差している', () => {
    const p = generate(words, 7);
    // マスごとに通過する語を数え、交差マス(2語が通る)を集める
    const through = new Map<string, number>();
    for (const pl of p.placements) {
      [...pl.word].forEach((_, i) => {
        const r = pl.row + (pl.dir === 'down' ? i : 0);
        const c = pl.col + (pl.dir === 'across' ? i : 0);
        const key = `${r}:${c}`;
        through.set(key, (through.get(key) ?? 0) + 1);
      });
    }
    for (const pl of p.placements.slice(1)) {
      const hasCross = [...pl.word].some((_, i) => {
        const r = pl.row + (pl.dir === 'down' ? i : 0);
        const c = pl.col + (pl.dir === 'across' ? i : 0);
        return (through.get(`${r}:${c}`) ?? 0) >= 2;
      });
      expect(hasCross).toBe(true);
    }
  });
});

describe('grade', () => {
  it('解答どおりの入力は全マス正解になる', () => {
    const p = generate(words, 3);
    const entries = p.solution.map((row) => row.map((cell) => cell ?? ''));
    const result = grade(p, entries);
    expect(result.correct).toBe(result.total);
    expect(result.complete).toBe(true);
    expect(result.wrong).toEqual([]);
  });

  it('空マスは誤りに数えず、違う文字だけをwrongに入れる', () => {
    const p = generate(words, 3);
    const entries = p.solution.map((row) => row.map(() => ''));
    // 文字マスをひとつ探して、わざと違う文字を入れる
    let target: { r: number; c: number } | null = null;
    for (let r = 0; r < p.size && !target; r++) {
      for (let c = 0; c < p.size && !target; c++) {
        if (p.solution[r]?.[c] !== null) target = { r, c };
      }
    }
    expect(target).not.toBeNull();
    if (target) {
      const line = entries[target.r];
      if (line) line[target.c] = 'ヲ';
      const result = grade(p, entries);
      expect(result.wrong).toEqual([{ row: target.r, col: target.c }]);
      expect(result.complete).toBe(false);
    }
  });
});

describe('firstEmptyCell', () => {
  it('左上から最初の空マスを返す', () => {
    const p = generate(words, 5);
    const empty = p.solution.map((row) => row.map(() => ''));
    const cell = firstEmptyCell(p, empty);
    expect(cell).not.toBeNull();
    // 返ったマスは解答マス(黒マスでない)かつ空である
    if (cell) {
      expect(p.solution[cell.row]?.[cell.col]).not.toBeNull();
      expect(empty[cell.row]?.[cell.col]).toBe('');
    }
  });

  it('すべて埋まっていれば null', () => {
    const p = generate(words, 5);
    const full = p.solution.map((row) => row.map((cell) => cell ?? ''));
    expect(firstEmptyCell(p, full)).toBeNull();
  });
});
