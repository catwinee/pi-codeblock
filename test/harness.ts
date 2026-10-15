import { AssistantMessageComponent, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { Container, ScrollView, VStack, TuiAltScreen, truncateToWidth, stripTerminalSequences, visibleWidth,
  type Component, type Terminal } from "@earendil-works/pi-tui";
import { initTheme, theme } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { installCodeblockCopy } from "../src/pi-compat.ts";

class MemoryTerminal implements Terminal {
  columns = 64; rows = 24; kittyProtocolActive = false; output = "";
  input: (data: string) => void = () => {};
  start(input: (data: string) => void) { this.input = input; }
  stop() {} async drainInput() {} write(data: string) { this.output += data; }
  moveBy() {} hideCursor() {} showCursor() {} clearLine() {} clearFromCursor() {} clearScreen() {}
  setTitle() {} setProgress() {} setProgramStatus() {}
}
export function response(text: string) {
  return { role: "assistant" as const, content: [{ type: "text" as const, text }],
    api: "openai-responses" as const, provider: "openai", model: "test", timestamp: 0, stopReason: "stop" as const,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
}
export function fixture(text: string, options: { role?: "user" | "assistant"; width?: number; copy?: (text: string) => Promise<boolean | string>;
  build?: (message: Component) => Component; install?: boolean; theme?: string } = {}) {
  initTheme(options.theme ?? "dark", false);
  const terminal = new MemoryTerminal(); terminal.columns = options.width ?? 64;
  const copies: string[] = [], errors: string[] = [];
  const tui = new TuiAltScreen(terminal, false, undefined, { mouse: true, copyOnSelect: false,
    copySelection: options.copy ?? (async (text) => { copies.push(text); return true; }) });
  const message = options.role === "user" ? new UserMessageComponent(text) : new AssistantMessageComponent(response(text));
  const content = options.build?.(message) ?? message;
  const scroll = new ScrollView(content, { primary: true, follow: "end", scrollbar: "hidden" });
  const editor = { focused: false, draft: "draft 未发送", render: (width: number) => [truncateToWidth("INPUT: " + editor.draft, width)],
    invalidate() {}, handleInput: (data: string) => { editor.draft += data; } };
  tui.setLayoutRoot(new VStack([{ component: scroll, basis: 0, grow: 1 }, editor])); tui.setFocus(editor);
  const controller = options.install === false ? undefined : installCodeblockCopy(tui, (message) => errors.push(message), () => theme);
  if (options.install !== false && !controller) throw new Error("Unsupported Pi renderer");
  try { tui.start(); scroll.scrollTo(0, { disableFollow: true }); tui.renderNow(); }
  catch (error) { controller?.dispose(); tui.stop({ preserveScreen: true }); throw error; }
  const frame = () => { tui.renderNow(); return tui.getScreenLines(); };
  const buttons = () => frame().flatMap((line, y) => {
    const plain = stripTerminalSequences(line), offset = plain.indexOf("[Copy]");
    return offset < 0 ? [] : [{ x: visibleWidth(plain.slice(0, offset)) + 2, y }];
  });
  const mouse = (x: number, y: number, type: "press" | "release" | "drag" = "press") => {
    terminal.input(`\x1b[<${type === "drag" ? 32 : 0};${x + 1};${y + 1}${type === "release" ? "m" : "M"}`);
  };
  return { tui, terminal, message, content, scroll, editor, controller, copies, errors, frame, buttons, mouse,
    click(index = 0) { const p = buttons()[index]; if (!p) throw new Error("No Copy button"); mouse(p.x, p.y); mouse(p.x, p.y, "release"); },
    dispose() { controller?.dispose(); tui.stop({ preserveScreen: true }); } };
}
export function wrapped(...children: Component[]): Container {
  const result = new Container(); for (const child of children) result.addChild(child); return result;
}
export const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
