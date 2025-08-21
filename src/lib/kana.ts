/** ひらがな(ぁ-ゖ)をカタカナへ写す。入力の正規化に使う */
export function toKatakana(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    out += code >= 0x3041 && code <= 0x3096 ? String.fromCodePoint(code + 0x60) : ch;
  }
  return out;
}

/** マスに入れられる1文字へ正規化する。カタカナ・長音以外は空文字 */
export function normalizeCell(input: string): string {
  const last = [...toKatakana(input.trim())].pop() ?? '';
  return /^[ァ-ヶー]$/.test(last) ? last : '';
}
