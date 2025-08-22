import type { WordEntry } from './data/words';
import { createRng, shuffle } from './rng';

export type Dir = 'across' | 'down';

export interface Placement {
  word: string;
  clue: string;
  row: number;
  col: number;
  dir: Dir;
  /** カギの番号。同じマスから始まるヨコ・タテは同じ番号を共有する */
  number: number;
}

export interface Puzzle {
  size: number;
  seed: number;
  placements: Placement[];
  /** 文字の入るマスはカタカナ1文字、黒マスはnull */
  solution: (string | null)[][];
}

interface Candidate {
  row: number;
  col: number;
  dir: Dir;
  crossings: number;
}

function cellAt(grid: (string | null)[][], row: number, col: number): string | null {
  return grid[row]?.[col] ?? null;
}

/**
 * 配置の妥当性。クロスワードの基本則に従う:
 * 語の前後は盤外か空マス、交差マスは同じ文字、
 * 新しく文字を置くマスの左右(縦置きなら上下)は空でなければならない。
 */
function canPlace(
  grid: (string | null)[][],
  size: number,
  word: string,
  row: number,
  col: number,
  dir: Dir,
): number | null {
  const chars = [...word];
  const dr = dir === 'down' ? 1 : 0;
  const dc = dir === 'across' ? 1 : 0;
  const endRow = row + dr * (chars.length - 1);
  const endCol = col + dc * (chars.length - 1);
  if (row < 0 || col < 0 || endRow >= size || endCol >= size) return null;
  if (cellAt(grid, row - dr, col - dc) !== null) return null;
  if (cellAt(grid, endRow + dr, endCol + dc) !== null) return null;

  let crossings = 0;
  for (let i = 0; i < chars.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const existing = cellAt(grid, r, c);
    if (existing !== null) {
      if (existing !== chars[i]) return null;
      crossings += 1;
    } else {
      // 平行な語と隣り合って偶然の連続ができるのを防ぐ
      const side1 = cellAt(grid, r + dc, c + dr);
      const side2 = cellAt(grid, r - dc, c - dr);
      if (side1 !== null || side2 !== null) return null;
    }
  }
  return crossings;
}

function place(grid: (string | null)[][], word: string, row: number, col: number, dir: Dir): void {
  const chars = [...word];
  const dr = dir === 'down' ? 1 : 0;
  const dc = dir === 'across' ? 1 : 0;
  chars.forEach((ch, i) => {
    const line = grid[row + dr * i];
    if (line) line[col + dc * i] = ch;
  });
}

interface RawPlacement {
  entry: WordEntry;
  row: number;
  col: number;
  dir: Dir;
}

function tryBuild(
  entries: readonly WordEntry[],
  size: number,
  rng: () => number,
): { grid: (string | null)[][]; placed: RawPlacement[] } {
  const grid: (string | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  );
  const pool = shuffle(
    entries.filter((e) => [...e.word].length >= 3 && [...e.word].length <= size),
    rng,
  );
  const placed: RawPlacement[] = [];

  const first = pool.shift();
  if (!first) return { grid, placed };
  const fLen = [...first.word].length;
  const fRow = Math.floor(size / 2);
  const fCol = Math.floor((size - fLen) / 2);
  place(grid, first.word, fRow, fCol, 'across');
  placed.push({ entry: first, row: fRow, col: fCol, dir: 'across' });

  // 2周して、交差できる語を貪欲に足す
  for (let pass = 0; pass < 2; pass++) {
    for (const entry of [...pool]) {
      const chars = [...entry.word];
      const candidates: Candidate[] = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = cellAt(grid, r, c);
          if (cell === null) continue;
          chars.forEach((ch, i) => {
            if (ch !== cell) return;
            for (const dir of ['across', 'down'] as const) {
              const row = dir === 'down' ? r - i : r;
              const col = dir === 'across' ? c - i : c;
              const crossings = canPlace(grid, size, entry.word, row, col, dir);
              if (crossings !== null && crossings >= 1) {
                candidates.push({ row, col, dir, crossings });
              }
            }
          });
        }
      }
      if (candidates.length === 0) continue;
      const best = Math.max(...candidates.map((x) => x.crossings));
      const top = candidates.filter((x) => x.crossings === best);
      const chosen = top[Math.floor(rng() * top.length)];
      if (!chosen) continue;
      place(grid, entry.word, chosen.row, chosen.col, chosen.dir);
      placed.push({ entry, row: chosen.row, col: chosen.col, dir: chosen.dir });
      pool.splice(pool.indexOf(entry), 1);
    }
  }
  return { grid, placed };
}

/** 左上から走査してカギ番号を振る。同じ開始マスのヨコ・タテは同番号 */
function numberPlacements(placed: readonly RawPlacement[]): Placement[] {
  const startKeys = [...new Set(placed.map((p) => `${p.row}:${p.col}`))]
    .map((key) => {
      const [r, c] = key.split(':').map(Number);
      return { key, r: r ?? 0, c: c ?? 0 };
    })
    .sort((a, b) => a.r - b.r || a.c - b.c);
  const numberOf = new Map(startKeys.map((s, i) => [s.key, i + 1]));
  return placed
    .map((p) => ({
      word: p.entry.word,
      clue: p.entry.clue,
      row: p.row,
      col: p.col,
      dir: p.dir,
      number: numberOf.get(`${p.row}:${p.col}`) ?? 0,
    }))
    .sort((a, b) => a.number - b.number || (a.dir === 'across' ? -1 : 1));
}

/**
 * シードから盤面を作る。語数が目標に届くまで内部で作り直し、
 * 最良の盤面を返す(同じシードからは常に同じ盤面になる)。
 */
export function generate(
  entries: readonly WordEntry[],
  seed: number,
  size = 11,
  minWords = 10,
): Puzzle {
  const rng = createRng(seed);
  let best: { grid: (string | null)[][]; placed: RawPlacement[] } | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const built = tryBuild(entries, size, rng);
    if (!best || built.placed.length > best.placed.length) best = built;
    if (best.placed.length >= minWords) break;
  }
  if (!best) throw new Error('盤面を生成できなかった');
  return {
    size,
    seed,
    placements: numberPlacements(best.placed),
    solution: best.grid,
  };
}

export interface GradeResult {
  total: number;
  correct: number;
  wrong: { row: number; col: number }[];
  complete: boolean;
}

/**
 * まだ埋まっていない解答マスを左上から探す。1文字ヒントで開けるマスを選ぶのに使う。
 * すべて埋まっていれば null。
 */
export function firstEmptyCell(
  puzzle: Puzzle,
  entries: readonly (readonly string[])[],
): { row: number; col: number } | null {
  for (let r = 0; r < puzzle.size; r++) {
    for (let c = 0; c < puzzle.size; c++) {
      const expected = puzzle.solution[r]?.[c];
      if (expected === null || expected === undefined) continue;
      if ((entries[r]?.[c] ?? '') === '') return { row: r, col: c };
    }
  }
  return null;
}

/** 入力された盤面を解答と突き合わせる。空マスは誤りに数えない */
export function grade(puzzle: Puzzle, entries: readonly (readonly string[])[]): GradeResult {
  let total = 0;
  let correct = 0;
  const wrong: { row: number; col: number }[] = [];
  for (let r = 0; r < puzzle.size; r++) {
    for (let c = 0; c < puzzle.size; c++) {
      const expected = puzzle.solution[r]?.[c];
      if (expected === null || expected === undefined) continue;
      total += 1;
      const got = entries[r]?.[c] ?? '';
      if (got === expected) correct += 1;
      else if (got !== '') wrong.push({ row: r, col: c });
    }
  }
  return { total, correct, wrong, complete: correct === total };
}
