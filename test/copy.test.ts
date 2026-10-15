import { test } from "node:test";
import assert from "node:assert/strict";
import { AssistantMessageComponent, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { Markdown, Text, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { getMarkdownTheme } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { fixture, flush, response, wrapped } from "./harness.ts";

for (const role of ["user", "assistant"] as const) {
  test(`${role}: button copies source without display indentation, fences, highlighting or wrapping`, async () => {
    const code = "\tif (ok) {  \n\t\tprint('中文 é 👨‍👩‍👧‍👦 and a long line that wraps');\n\n\t}\n";
    const f = fixture("Prose before.\n\n```javascript\n" + code + "\n```\n\nProse after.", { role, width: 40 });
    try {
      assert.equal(f.buttons().length, 1);
      f.click(); await flush();
      assert.deepEqual(f.copies, [code]); assert.equal(f.editor.draft, "draft 未发送");
      assert.ok(f.frame().every((line) => !line.includes("pi-codeblock=")));
      assert.deepEqual(f.errors, []);
    } finally { f.dispose(); }
  });
}

test("identical headers and nested list/quote blocks have distinct, accurate copy targets", async () => {
  const f = fixture("```txt\nfirst\n```\n\n> ```txt\n>   second\n> ```\n\n- item\n\n  ```txt\n  third\n  ```");
  try {
    const positions = f.buttons(); assert.equal(positions.length, 3);
    for (const p of positions) { f.mouse(p.x, p.y); f.mouse(p.x, p.y, "release"); await flush(); }
    assert.deepEqual(f.copies, ["first", "  second", "third"]);
  } finally { f.dispose(); }
});

test("native scrolling keeps copy coordinates attached to the code block", async () => {
  const f = fixture("```txt\ntop\n```\n\n" + Array.from({ length: 60 }, (_, n) => `paragraph ${n}\n`).join("\n") + "\n```txt\nbottom\n```");
  try {
    f.click(); await flush(); assert.deepEqual(f.copies, ["top"]);
    f.scroll.scrollToEnd(); f.frame(); f.click(); await flush();
    assert.deepEqual(f.copies, ["top", "bottom"]);
  } finally { f.dispose(); }
});

test("a drag starting on Copy never copies; ordinary selection remains native", async () => {
  const f = fixture("plain selectable text\n\n```txt\ncode\n```");
  try {
    const p = f.buttons()[0]; f.mouse(p.x, p.y); f.mouse(p.x - 4, p.y, "drag"); f.mouse(p.x - 4, p.y, "release");
    await flush(); assert.deepEqual(f.copies, []);
    const y = f.frame().findIndex((line) => stripTerminalSequences(line).includes("plain selectable text"));
    f.mouse(1, y); f.mouse(8, y, "drag"); f.mouse(8, y, "release");
    assert.equal(f.tui.hasActiveSelection(), true); assert.equal(f.copies.length, 0);
  } finally { f.dispose(); }
});

test("streaming text changes and resize invalidate a pressed target instead of copying stale code", async () => {
  const f = fixture("```txt\nold\n```");
  try {
    const p = f.buttons()[0]; f.mouse(p.x, p.y);
    (f.message as AssistantMessageComponent).updateContent(response("```txt\nnew\n```"));
    f.frame(); f.mouse(p.x, p.y, "release"); await flush(); assert.deepEqual(f.copies, []);
    f.click(); await flush(); assert.deepEqual(f.copies, ["new"]);
    const next = f.buttons()[0]; f.mouse(next.x, next.y); f.terminal.columns = 45; f.tui.invalidate(); f.frame();
    f.mouse(next.x, next.y, "release"); await flush(); assert.deepEqual(f.copies, ["new"]);
  } finally { f.dispose(); }
});

test("controls stay out of unrelated Markdown, overlays, and another fullscreen TUI", async () => {
  const f = fixture("```txt\nyes\n```", { build: (message) => wrapped(message,
    new Markdown("```txt\ncustom\n```", 0, 0, getMarkdownTheme()), new Text("tail", 0, 0)) });
  try {
    assert.equal(f.buttons().length, 1);
    const handle = f.tui.showOverlay(new UserMessageComponent("```txt\noverlay\n```"), { width: 30 });
    const screen = f.frame().map(stripTerminalSequences).join("\n");
    assert.ok(screen.includes("overlay"));
    // Only the transcript's underlying control may remain; overlay code has none.
    const other = fixture("```txt\nother terminal\n```", { install: false });
    try { assert.equal(other.buttons().length, 0); } finally { other.dispose(); }
    handle.hide(); f.frame(); f.click(); await flush(); assert.deepEqual(f.copies, ["yes"]);
  } finally { f.dispose(); }
});

test("narrow widths omit controls and all code headers fit within the available width", () => {
  for (const width of [10, 12, 14, 20, 40]) {
    const f = fixture("```very-long-language-label\nx\n```", { width });
    try {
      assert.ok(f.frame().every((line) => visibleWidth(line) <= width));
      assert.equal(f.buttons().length, width - 2 >= 12 ? 1 : 0);
    } finally { f.dispose(); }
  }
});

test("clipboard failure reports failure; shutdown restores rendering and patches", async () => {
  const originalRender = Markdown.prototype.render;
  const f = fixture("```txt\ncode\n```", { copy: async () => { throw new Error("offline"); } });
  try {
    f.click(); await flush(); assert.deepEqual(f.errors, ["Code block copy failed."]);
    f.controller!.dispose(); f.frame(); assert.equal(f.buttons().length, 0);
    assert.equal(Markdown.prototype.render, originalRender);
    f.controller!.dispose();
  } finally { f.dispose(); }
});

test("transformers run once per cached render; controls use their pre-display code and ignore image protocol data", async () => {
  let calls = 0;
  const image = "\x1b_Gi=1,a=p;AAAA\x1b\\";
  const f = fixture("placeholder", { build: () => new UserMessageComponent("```txt\n\tinput\n```", undefined, 1,
    [(text) => { calls++; return text + "\n\n" + image; }]) });
  try {
    const count = calls; f.frame(); f.frame(); assert.equal(calls, count);
    f.click(); await flush(); assert.deepEqual(f.copies, ["\tinput"]);
    assert.ok(f.frame().every((line) => !line.includes("pi-codeblock=")));
  } finally { f.dispose(); }
});
