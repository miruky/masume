import './style.css';
import {
  DEFAULT_SIZE,
  firstEmptyCell,
  formatHash,
  generate,
  grade,
  normalizeCell,
  parseHash,
  words,
} from './lib';
import type { Dir, Placement, Puzzle } from './lib';

const STORE_KEY = 'masume:state';
const SIZE_KEY = 'masume:size';
const SIZES: { key: number; label: string }[] = [
  { key: 9, label: '小' },
  { key: 11, label: '中' },
  { key: 13, label: '大' },
];

const LOGO_SVG = `<svg viewBox="0 0 64 64" role="img" aria-label="masumeのロゴ" class="logo">
  <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <rect x="8" y="8" width="48" height="48" rx="7"/>
    <path d="M24 8v48"/><path d="M40 8v48"/>
    <path d="M8 24h48"/><path d="M8 40h48"/>
  </g>
  <rect x="24" y="24" width="16" height="16" fill="var(--accent)" stroke="none" rx="2"/>
</svg>`;

function mustFind<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`${selector} が見つからない`);
  return el;
}

const app = mustFind<HTMLDivElement>('#app');

app.innerHTML = `
  <header class="site-header">
    <div class="brand">
      ${LOGO_SVG}
      <div>
        <h1>masume</h1>
        <p class="tagline">カタカナクロスワードをその場で自動生成して解く。番号で同じ問題を共有できる</p>
      </div>
    </div>
    <a class="repo-link" href="https://github.com/miruky/masume" rel="noopener">GitHub</a>
  </header>
  <main class="layout">
    <section class="pane board-pane" aria-label="盤面">
      <div class="toolbar">
        <button type="button" id="btn-new" class="primary">新しい問題</button>
        <button type="button" id="btn-check">採点する</button>
        <button type="button" id="btn-hint-one">1文字ヒント</button>
        <button type="button" id="btn-reveal">答えを見る</button>
        <span class="spacer"></span>
        <div class="size-pick" id="size-pick" role="group" aria-label="盤面の大きさ"></div>
        <span class="seed-row">
          <span class="seed-label" id="seed-label"></span>
          <button type="button" class="link-btn" id="btn-copy">リンクをコピー</button>
        </span>
      </div>
      <div class="board-wrap">
        <div class="board" id="board" role="grid" aria-label="クロスワードの盤面"></div>
      </div>
      <div class="statusbar" id="status" aria-live="polite"></div>
    </section>
    <aside class="pane clues-pane" aria-label="カギ">
      <div class="clue-col">
        <h2>ヨコのカギ</h2>
        <ol id="clues-across"></ol>
      </div>
      <div class="clue-col">
        <h2>タテのカギ</h2>
        <ol id="clues-down"></ol>
      </div>
    </aside>
  </main>
  <footer class="site-footer">
    <p>盤面は端末の中だけで生成・採点される。URLの番号を送ると同じ問題を共有できる。MIT License</p>
  </footer>
`;

const boardBox = mustFind<HTMLDivElement>('#board');
const statusBar = mustFind<HTMLDivElement>('#status');
const seedLabel = mustFind<HTMLSpanElement>('#seed-label');
const cluesAcross = mustFind<HTMLOListElement>('#clues-across');
const cluesDown = mustFind<HTMLOListElement>('#clues-down');
const btnNew = mustFind<HTMLButtonElement>('#btn-new');
const btnCheck = mustFind<HTMLButtonElement>('#btn-check');
const btnHintOne = mustFind<HTMLButtonElement>('#btn-hint-one');
const btnReveal = mustFind<HTMLButtonElement>('#btn-reveal');
const btnCopy = mustFind<HTMLButtonElement>('#btn-copy');
const sizePick = mustFind<HTMLDivElement>('#size-pick');

let puzzle: Puzzle;
let entries: string[][] = [];
let activeDir: Dir = 'across';
let inputs: (HTMLInputElement | null)[][] = [];
let size = DEFAULT_SIZE;

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000) + 1;
}

function loadSize(): number {
  try {
    const v = Number(localStorage.getItem(SIZE_KEY));
    if (SIZES.some((s) => s.key === v)) return v;
  } catch {
    // 取れなければ既定
  }
  return DEFAULT_SIZE;
}

function persist(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ seed: puzzle.seed, size, entries }));
  } catch {
    // 保存できなくても遊べる
  }
}

function restoreEntries(seed: number, sz: number): string[][] | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { seed?: unknown }).seed === seed &&
      (parsed as { size?: unknown }).size === sz &&
      Array.isArray((parsed as { entries?: unknown }).entries)
    ) {
      return (parsed as { entries: string[][] }).entries;
    }
  } catch {
    // 壊れた保存値は無視する
  }
  return null;
}

function wordCells(p: Placement): { r: number; c: number }[] {
  return [...p.word].map((_, i) => ({
    r: p.row + (p.dir === 'down' ? i : 0),
    c: p.col + (p.dir === 'across' ? i : 0),
  }));
}

function placementsThrough(r: number, c: number): Placement[] {
  return puzzle.placements.filter((p) => wordCells(p).some((cell) => cell.r === r && cell.c === c));
}

function clearMarks(): void {
  boardBox.querySelectorAll('.cell').forEach((el) => el.classList.remove('wrong', 'hl'));
  document.querySelectorAll('.clue-item').forEach((el) => el.classList.remove('active'));
}

function highlightWord(p: Placement): void {
  clearMarks();
  for (const { r, c } of wordCells(p)) {
    inputs[r]?.[c]?.parentElement?.classList.add('hl');
  }
  document.querySelector(`.clue-item[data-key="${p.dir}:${p.number}"]`)?.classList.add('active');
}

function focusCell(r: number, c: number): void {
  inputs[r]?.[c]?.focus();
}

function moveFocus(r: number, c: number, dr: number, dc: number): void {
  let nr = r + dr;
  let nc = c + dc;
  while (nr >= 0 && nr < puzzle.size && nc >= 0 && nc < puzzle.size) {
    if (inputs[nr]?.[nc]) {
      focusCell(nr, nc);
      return;
    }
    nr += dr;
    nc += dc;
  }
}

function numberAt(r: number, c: number): number | null {
  const start = puzzle.placements.find((p) => p.row === r && p.col === c);
  return start ? start.number : null;
}

function renderBoard(): void {
  boardBox.style.setProperty('--size', String(puzzle.size));
  boardBox.textContent = '';
  inputs = Array.from({ length: puzzle.size }, () => Array(puzzle.size).fill(null));

  for (let r = 0; r < puzzle.size; r++) {
    for (let c = 0; c < puzzle.size; c++) {
      const cell = document.createElement('div');
      const solution = puzzle.solution[r]?.[c];
      if (solution === null || solution === undefined) {
        cell.className = 'cell block';
        boardBox.append(cell);
        continue;
      }
      cell.className = 'cell';
      const num = numberAt(r, c);
      if (num !== null) {
        const badge = document.createElement('span');
        badge.className = 'num';
        badge.textContent = String(num);
        cell.append(badge);
      }
      const input = document.createElement('input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.setAttribute('aria-label', `${r + 1}行${c + 1}列のマス`);
      input.value = entries[r]?.[c] ?? '';
      input.addEventListener('focus', () => {
        const through = placementsThrough(r, c);
        const inActive = through.find((p) => p.dir === activeDir);
        const chosen = inActive ?? through[0];
        if (chosen) {
          activeDir = chosen.dir;
          highlightWord(chosen);
        }
      });
      input.addEventListener('click', () => {
        // 同じマスをもう一度押すと向きを切り替える
        const through = placementsThrough(r, c);
        if (through.length > 1 && document.activeElement === input) {
          const other = through.find((p) => p.dir !== activeDir);
          if (other) {
            activeDir = other.dir;
            highlightWord(other);
          }
        }
      });
      input.addEventListener('input', (e) => {
        if ((e as InputEvent).isComposing) return;
        commitCell(input, r, c);
      });
      input.addEventListener('compositionend', () => commitCell(input, r, c));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && input.value === '') {
          e.preventDefault();
          if (activeDir === 'across') moveFocus(r, c, 0, -1);
          else moveFocus(r, c, -1, 0);
        } else if (e.key === 'ArrowRight') moveFocus(r, c, 0, 1);
        else if (e.key === 'ArrowLeft') moveFocus(r, c, 0, -1);
        else if (e.key === 'ArrowDown') moveFocus(r, c, 1, 0);
        else if (e.key === 'ArrowUp') moveFocus(r, c, -1, 0);
      });
      cell.append(input);
      boardBox.append(cell);
      const line = inputs[r];
      if (line) line[c] = input;
    }
  }
}

function commitCell(input: HTMLInputElement, r: number, c: number): void {
  const ch = normalizeCell(input.value);
  input.value = ch;
  const line = entries[r];
  if (line) line[c] = ch;
  persist();
  renderStatus();
  if (ch !== '') {
    if (activeDir === 'across') moveFocus(r, c, 0, 1);
    else moveFocus(r, c, 1, 0);
  }
}

function renderClues(): void {
  cluesAcross.textContent = '';
  cluesDown.textContent = '';
  for (const p of puzzle.placements) {
    const li = document.createElement('li');
    li.className = 'clue-item';
    li.dataset.key = `${p.dir}:${p.number}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = `<span class="clue-num">${p.number}</span><span class="clue-text"></span><span class="clue-len">${[...p.word].length}文字</span>`;
    const text = btn.querySelector('.clue-text');
    if (text) text.textContent = p.clue;
    btn.addEventListener('click', () => {
      activeDir = p.dir;
      highlightWord(p);
      focusCell(p.row, p.col);
      highlightWord(p);
    });
    li.append(btn);
    (p.dir === 'across' ? cluesAcross : cluesDown).append(li);
  }
}

function renderStatus(extra = ''): void {
  const result = grade(puzzle, entries);
  const filled = entries.flat().filter((v) => v !== '').length;
  statusBar.innerHTML = [
    `<span>${puzzle.placements.length}語</span>`,
    `<span>入力 ${filled}/${result.total}</span>`,
    `<span class="msg">${extra}</span>`,
  ].join('');
  if (result.complete) {
    statusBar.innerHTML += `<span class="done">全マス正解。おみごと</span>`;
    boardBox.classList.add('celebrate');
    setTimeout(() => boardBox.classList.remove('celebrate'), 800);
  }
}

function renderSize(): void {
  sizePick.textContent = '';
  const lead = document.createElement('span');
  lead.className = 'size-lead kicker';
  lead.textContent = '大きさ';
  sizePick.append(lead);
  for (const s of SIZES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'diff-chip';
    btn.setAttribute('aria-pressed', String(size === s.key));
    btn.textContent = s.label;
    btn.addEventListener('click', () => {
      if (size === s.key) return;
      loadPuzzle(randomSeed(), s.key);
    });
    sizePick.append(btn);
  }
}

function loadPuzzle(seed: number, sz: number): void {
  size = sz;
  try {
    localStorage.setItem(SIZE_KEY, String(sz));
  } catch {
    // 大きさを保存できなくても遊べる
  }
  puzzle = generate(words, seed, sz, sz - 1);
  const restored = restoreEntries(seed, sz);
  entries =
    restored ?? Array.from({ length: puzzle.size }, () => Array(puzzle.size).fill('') as string[]);
  history.replaceState(null, '', formatHash(seed, sz));
  seedLabel.textContent = `問題番号 ${seed}`;
  renderSize();
  renderBoard();
  renderClues();
  renderStatus();
}

btnNew.addEventListener('click', () => loadPuzzle(randomSeed(), size));

btnCheck.addEventListener('click', () => {
  clearMarks();
  const result = grade(puzzle, entries);
  for (const { row, col } of result.wrong) {
    inputs[row]?.[col]?.parentElement?.classList.add('wrong');
  }
  renderStatus(`正解 ${result.correct}/${result.total}・誤り ${result.wrong.length}`);
});

btnHintOne.addEventListener('click', () => {
  const cell = firstEmptyCell(puzzle, entries);
  if (!cell) {
    renderStatus('空きマスはもうない');
    return;
  }
  const line = entries[cell.row];
  if (line) line[cell.col] = puzzle.solution[cell.row]?.[cell.col] ?? '';
  persist();
  clearMarks();
  renderBoard();
  renderStatus('1文字あけた');
});

btnReveal.addEventListener('click', () => {
  entries = puzzle.solution.map((row) => row.map((cell) => cell ?? ''));
  persist();
  renderBoard();
  renderStatus('答えを表示した');
});

btnCopy.addEventListener('click', () => {
  void navigator.clipboard?.writeText(location.href).then(
    () => renderStatus('リンクをコピーした'),
    () => renderStatus('コピーできなかった。URLを手で送って'),
  );
});

window.addEventListener('hashchange', () => {
  const route = parseHash(location.hash);
  if (route && (route.seed !== puzzle.seed || route.size !== size)) {
    loadPuzzle(route.seed, route.size);
  }
});

const initial = parseHash(location.hash);
loadPuzzle(initial?.seed ?? randomSeed(), initial ? initial.size : loadSize());
