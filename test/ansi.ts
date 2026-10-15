import { visibleWidth } from "@earendil-works/pi-tui";

export interface Cell { text: string; fg?: string; bg?: string; inverse: boolean }
/** Test-only SGR cell reader; assert actual background coverage, not escape presence. */
export function cells(line: string): Cell[] {
  const result: Cell[] = [];
  const state: Omit<Cell, "text"> = { inverse: false };
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const tokens = line.split(/(\x1b\[[\d;:]*m|\x1b\][^\x07]*(?:\x07|\x1b\\))/);
  for (const token of tokens) {
    if (token.startsWith("\x1b]")) continue;
    if (token.startsWith("\x1b[")) {
      const args = token.slice(2, -1).split(";").map(Number);
      for (let i = 0; i < args.length; i++) {
        const n = args[i];
        if (n === 0) { state.fg = undefined; state.bg = undefined; state.inverse = false; }
        else if (n === 39) state.fg = undefined;
        else if (n === 49) state.bg = undefined;
        else if (n === 7 || n === 27) state.inverse = n === 7;
        else if (n === 38 || n === 48) {
          const count = args[i + 1] === 2 ? 3 : 1;
          const color = args.slice(i + 1, i + 2 + count).join(";");
          state[n === 38 ? "fg" : "bg"] = color;
          i += count + 1;
        } else if (n >= 30 && n <= 37) state.fg = `5;${n - 30}`;
        else if (n >= 40 && n <= 47) state.bg = `5;${n - 40}`;
        else if (n >= 90 && n <= 97) state.fg = `5;${n - 90 + 8}`;
        else if (n >= 100 && n <= 107) state.bg = `5;${n - 100 + 8}`;
      }
    } else {
      for (const { segment } of segments.segment(token)) {
        for (let col = 0; col < visibleWidth(segment); col++) result.push({ ...state, text: segment });
      }
    }
  }
  return result;
}
