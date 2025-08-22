// 問題番号(シード)と盤面の大きさをURLハッシュに載せ、同じ問題を共有できるようにする。
// 例: #p=12345 (既定の大きさ) 、 #p=12345&s=13
export const DEFAULT_SIZE = 11;
export const MIN_SIZE = 7;
export const MAX_SIZE = 15;

export interface PuzzleRoute {
  seed: number;
  size: number;
}

/** location.hash を解釈する。pが無ければ null。sは範囲外なら既定へ丸める。 */
export function parseHash(hash: string): PuzzleRoute | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const seedStr = params.get('p');
  if (seedStr === null || !/^\d{1,9}$/.test(seedStr)) return null;
  const seed = Number(seedStr);
  let size = DEFAULT_SIZE;
  const sizeStr = params.get('s');
  if (sizeStr !== null && /^\d{1,2}$/.test(sizeStr)) {
    const s = Number(sizeStr);
    if (s >= MIN_SIZE && s <= MAX_SIZE) size = s;
  }
  return { seed, size };
}

/** 問題番号と大きさをハッシュ文字列にする。既定の大きさは省略する。 */
export function formatHash(seed: number, size: number): string {
  return size === DEFAULT_SIZE ? `#p=${seed}` : `#p=${seed}&s=${size}`;
}
