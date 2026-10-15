import type { Theme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

export type CardTheme = Pick<Theme, "fg" | "getBgAnsi">;
export interface CopyMarkers { start: string; end: string }
export interface Card { lines: string[]; background: string }

/** Display only: input lines retain native syntax highlighting, but not native UI indentation. */
export function renderCard(body: readonly string[], language: string, width: number,
  theme: CardTheme, copy?: CopyMarkers): Card {
  if (!Number.isInteger(width) || width < 1) throw new Error("Invalid code card width");
  const pad = width >= 6 ? 2 : width >= 3 ? 1 : 0;
  const innerWidth = width - pad * 2;
  const margin = " ".repeat(pad);
  const background = theme.getBgAnsi("userMessageBg");
  if (!/^(?:\x1b\[[\d;:]*m)+$/.test(background)) throw new Error("Unsupported background style");
  const padded = (line: string) => line + " ".repeat(Math.max(0, width - visibleWidth(line)));
  const label = stripTerminalSequences(language).trim().split(/\s+/)[0] || "code";
  let header: string;
  if (copy && width >= 12) {
    const title = theme.fg("muted", truncateToWidth(label, innerWidth - 7, "…"));
    const button = theme.fg("accent", "[Copy]");
    if (visibleWidth(button) !== 6) throw new Error("Unsupported Copy style");
    header = margin + title + " ".repeat(innerWidth - 6 - visibleWidth(title))
      + copy.start + button + copy.end + margin;
  } else {
    header = margin + theme.fg("muted", truncateToWidth(label, innerWidth, "…"));
  }
  const result = [padded(header)];
  for (const line of body) {
    // Wrap before painting, so every continuation has padding and a complete background.
    // The surrounding Markdown renderer can still add list/quote prefixes unchanged.
    for (const wrapped of wrapTextWithAnsi(line, innerWidth)) {
      const fitted = visibleWidth(wrapped) <= innerWidth ? wrapped : truncateToWidth(wrapped, innerWidth, "…");
      result.push(padded(margin + fitted));
    }
  }
  result.push(padded("")); // Bottom padding replaces the display-only closing fence.
  return { lines: result, background };
}

/** Paint only the final code span; the native compositor restores its parent's styles. */
export function paintCardLine(line: string, background: string): string {
  // Reapply after SGR changes, including highlighter resets. Foreground/attributes
  // survive; native and Vim selections are composited later, above this background.
  return background + line.replace(/\x1b\[[\d;:]*m/g, (sgr) => sgr + background) + "\x1b[49m";
}
