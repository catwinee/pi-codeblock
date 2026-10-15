/** Pi 1.2 compatibility boundary. Code-copy design adapted from pi-pretty-tui (MIT); see UPSTREAM.md. */
import { randomUUID } from "node:crypto";
import { AssistantMessageComponent, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { Markdown, compositeTuiLine, sliceByColumn, stripTerminalSequences, visibleWidth, type TUI, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { codeBlocks, type CodeBlock } from "./source.ts";
import { paintCardLine, renderCard, type CardTheme } from "./card.ts";

// Dynamic signatures are confined here: Pi does not expose code-token render hooks.
type Fn = (this: any, ...args: any[]) => any;
type ObjectRecord = Record<string, any>;
interface Region { x: number; end: number; y: number; code: string }
interface State { lines: string[]; text: string; width: number; frame: number; regions: Region[]; press?: Region }
interface CardRow { width: number; background: string }
interface Build { blocks: CodeBlock[]; seen: number; valid: boolean; buttons: Map<number, string>; rows: Map<number, CardRow> }
function object(value: unknown): value is ObjectRecord { return typeof value === "object" && value !== null; }
function lines(value: unknown): value is string[] { return Array.isArray(value) && value.every((s) => typeof s === "string"); }

export interface CodeblockController { dispose(): void }
export function installCodeblockCopy(tui: TUI, onError: (message: string) => void,
  getTheme: () => CardTheme): CodeblockController | undefined {
  if (tui.mode !== "fullscreen") return;
  const framePrototype = Reflect.getPrototypeOf(tui);
  const markdown = Markdown.prototype as unknown as ObjectRecord;
  const user = UserMessageComponent.prototype as unknown as ObjectRecord;
  const assistant = AssistantMessageComponent.prototype as unknown as ObjectRecord;
  if (!framePrototype || typeof Reflect.get(framePrototype, "doRender") !== "function"
    || typeof Reflect.get(framePrototype, "compositeOverlays") !== "function"
    || typeof Reflect.get(tui, "copyTextToClipboard") !== "function"
    || [markdown.render, markdown.renderToken, markdown.invalidate, user.render, assistant.render].some((fn) => typeof fn !== "function")) return;

  const nonce = randomUUID();
  const marker = (id: number, side: "s" | "e" | "b" | "f") => `\x1b]777;pi-codeblock=${nonce};${id};${side}\x07`;
  const markerPattern = new RegExp(`\\x1b\\]777;pi-codeblock=${nonce};(\\d+);([sebf])\\x07`, "g");
  const buttonPattern = new RegExp(`\\x1b\\]777;pi-codeblock=${nonce};(\\d+);s\\x07[\\s\\S]*?\\x1b\\]777;pi-codeblock=${nonce};\\1;e\\x07`, "g");
  let alive = true, frameActive = false, messageDepth = 0, frameNumber = 0, rememberedSinceSweep = 0;
  const states = new WeakMap<object, State>();
  const builds = new WeakMap<object, Build>();
  const known = new WeakSet<object>();
  const touched = new Set<WeakRef<Markdown>>();
  const restore: (() => void)[] = [];
  const originalInvalidate = markdown.invalidate as Fn;

  function patch(target: object, key: string, wrap: (original: Fn | undefined) => Fn) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    const value = Reflect.get(target, key);
    const replacement = wrap(typeof value === "function" ? value : undefined);
    if (!Reflect.set(target, key, replacement)) throw new Error(`Cannot patch ${key}`);
    restore.push(() => {
      if (Reflect.get(target, key) !== replacement) return;
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else Reflect.deleteProperty(target, key);
    });
  }
  function remember(component: Markdown) {
    if (known.has(component)) return;
    known.add(component); touched.add(new WeakRef(component));
    if (++rememberedSinceSweep >= 256) {
      rememberedSinceSweep = 0;
      for (const ref of touched) if (!ref.deref()) touched.delete(ref);
    }
  }
  function validState(component: ObjectRecord, state: State | undefined): state is State {
    return !!state && component.cachedLines === state.lines && component.cachedText === state.text
      && component.text === state.text && component.cachedWidth === state.width;
  }

  try {
    // A duplicate package load must not stack two active renderer patches.
    const owner = Symbol.for("pi-codeblock.renderer-owner");
    if (Reflect.has(markdown, owner) || !Reflect.defineProperty(markdown, owner, { value: nonce, configurable: true })) return;
    restore.push(() => { if (Reflect.get(markdown, owner) === nonce) Reflect.deleteProperty(markdown, owner); });
    patch(framePrototype, "doRender", (original) => function (...args) {
      const previous = frameActive, depth = messageDepth;
      frameActive = alive && this.terminal === tui.terminal; messageDepth = 0;
      if (frameActive) frameNumber++;
      try { return original!.apply(this, args); }
      finally { frameActive = previous; messageDepth = depth; }
    });
    patch(framePrototype, "compositeOverlays", (original) => function (...args) {
      const previous = frameActive, depth = messageDepth;
      frameActive = false; messageDepth = 0;
      try { return original!.apply(this, args); }
      finally { frameActive = previous; messageDepth = depth; }
    });
    for (const prototype of [user, assistant]) {
      patch(prototype, "render", (original) => function (...args) {
        if (!frameActive || !alive) return original!.apply(this, args);
        messageDepth++;
        try { return original!.apply(this, args); } finally { messageDepth--; }
      });
    }
    patch(markdown, "invalidate", (original) => function (...args) {
      states.delete(this);
      return original!.apply(this, args);
    });
    patch(markdown, "render", (original) => function (width: number) {
      const scoped = alive && frameActive && messageDepth > 0;
      const prior = states.get(this);
      if (!scoped) {
        if (prior) { states.delete(this); originalInvalidate.call(this); }
        return original!.call(this, width);
      }
      if (validState(this, prior) && prior.width === width) {
        prior.frame = frameNumber;
        return original!.call(this, width);
      }
      if (typeof this.text !== "string" || !object(this.options) || !Number.isInteger(width) || width <= 0) {
        states.delete(this); return original!.call(this, width);
      }
      remember(this);
      originalInvalidate.call(this);
      const build: Build = { blocks: [], seen: 0, valid: true, buttons: new Map(), rows: new Map() };
      const parse = (text: string) => {
        try { build.blocks = codeBlocks(text); } catch { build.blocks = []; build.valid = false; }
      };
      const source = this.text as string;
      parse(source);
      const options = this.options;
      const transform = options.transform;
      // Observe the effective Markdown without calling image/other transformers twice.
      const observed = typeof transform === "function" ? { ...options, transform: function (...args: unknown[]) {
        const result = Reflect.apply(transform, options, args);
        parse(typeof result === "string" ? result : source);
        return result;
      } } : options;
      this.options = observed;
      builds.set(this, build);
      let rendered: unknown;
      try { rendered = original!.call(this, width); }
      finally { builds.delete(this); if (this.options === observed) this.options = options; }
      if (!lines(rendered)) { states.delete(this); return rendered; }
      const usable = build.valid && build.seen === build.blocks.length;
      const regions: Region[] = [];
      const cleaned = rendered.map((line, y) => {
        const starts = new Map<string, number>();
        const panels: (CardRow & { x: number })[] = [];
        for (const match of line.matchAll(markerPattern)) {
          const id = Number(match[1]), side = match[2], x = visibleWidth(line.slice(0, match.index));
          if (side === "s" || side === "b") starts.set(side + id, x);
          else if (side === "e" && usable) {
            const start = starts.get("s" + id), code = build.buttons.get(id);
            if (start !== undefined && code !== undefined && x - start === 6 && x <= width) {
              regions.push({ x: start, end: x, y, code });
            }
          } else if (side === "f") {
            const start = starts.get("b" + id), row = build.rows.get(id);
            if (start !== undefined && row && x - start === row.width && x <= width) panels.push({ ...row, x: start });
          }
        }
        // Remove all internal markers before painting, caching, or exposing display rows.
        let clean = (usable ? line : line.replace(buttonPattern, "      ")).replace(markerPattern, "");
        for (const panel of panels) {
          const part = sliceByColumn(clean, panel.x, panel.width, true);
          clean = compositeTuiLine(clean, paintCardLine(part, panel.background), panel.x, panel.width, width);
        }
        return clean;
      });
      this.cachedLines = cleaned;
      states.set(this, { lines: cleaned, text: source, width, frame: frameNumber, regions });
      return cleaned;
    });
    patch(markdown, "renderToken", (original) => function (token: unknown, width: number, ...rest: unknown[]) {
      const rendered = original!.call(this, token, width, ...rest);
      const build = builds.get(this);
      if (!alive || !build || !object(token) || token.type !== "code") return rendered;
      const id = build.seen++, block = build.blocks[id];
      if (!block || typeof token.text !== "string" || block.code.replace(/\t/g, "   ") !== token.text) build.valid = false;
      if (!Number.isInteger(width) || width < 1 || !lines(rendered) || rendered.length < 2 || !object(this.theme)) return rendered;
      // Pi 1.2 adds one opening/closing fence and, optionally, a following spacing row.
      // Validate their exact positions: a literal fence inside the code is never removed.
      const footer = rendered.length - 1 - (rest[0] && rest[0] !== "space" ? 1 : 0);
      const indent = this.theme.codeBlockIndent ?? "  ";
      if (typeof indent !== "string" || footer < 1
        || stripTerminalSequences(rendered[0]) !== "```" + (token.lang || "")
        || stripTerminalSequences(rendered[footer]) !== "```"
        || rendered.some((line) => line.includes("\x1b_G") || line.includes("\x1b]1337;File="))) return rendered;
      const body = rendered.slice(1, footer);
      if (body.some((line) => !line.startsWith(indent))) return rendered;
      const copy = build.valid && width >= 12 ? { start: marker(id, "s"), end: marker(id, "e") } : undefined;
      try {
        const card = renderCard(body.map((line) => line.slice(indent.length)), token.lang || "", width, getTheme(), copy);
        const decorated = card.lines.map((line) => {
          const row = build.rows.size;
          build.rows.set(row, { width, background: card.background });
          return marker(row, "b") + line + marker(row, "f");
        });
        if (copy) build.buttons.set(id, block.code);
        return [...decorated, ...rendered.slice(footer + 1)];
      } catch {
        // An unsupported layout/theme keeps the native rendering and no guessed targets.
        return rendered;
      }
    });
    patch(markdown, "handleMouse", (original) => function (event: TuiMouseEvent) {
      const state = states.get(this);
      if (!alive || !validState(this, state) || event.width !== state.width || state.frame !== frameNumber) return original?.call(this, event);
      if (event.shift || event.alt || event.ctrl) { state.press = undefined; return original?.call(this, event); }
      const hit = state.regions.find((r) => event.y === r.y && event.x >= r.x && event.x < r.end);
      if (event.type === "drag" || event.type === "move") state.press = undefined;
      if (event.button === "left" && event.type === "press") {
        state.press = hit;
        if (hit) return { handled: true, render: false };
      }
      if (event.button === "left" && event.type === "click") {
        const pressed = state.press; state.press = undefined;
        if (hit && pressed === hit) {
          const copy = Reflect.get(tui, "copyTextToClipboard");
          if (typeof copy === "function") {
            void Promise.resolve().then(() => {
              if (alive) return Reflect.apply(copy, tui, [hit.code]);
            }).catch(() => { if (alive) onError("Code block copy failed."); });
          }
          return { handled: true, render: false };
        }
      }
      return original?.call(this, event);
    });
  } catch {
    alive = false;
    for (const undo of restore.reverse()) undo();
    return;
  }
  tui.invalidate(); tui.requestRender();
  return { dispose() {
    if (!alive) return;
    alive = false;
    for (const undo of restore.reverse()) undo();
    for (const ref of touched) ref.deref()?.invalidate();
    touched.clear();
    tui.invalidate(); tui.requestRender();
  } };
}
