import { test } from "node:test";
import assert from "node:assert/strict";
import { AssistantMessageComponent, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { Markdown, Text, stripTerminalSequences, type TUI } from "@earendil-works/pi-tui";
import { installCodeblockCopy } from "../src/pi-compat.ts";
import { fixture, flush, response } from "./harness.ts";
import { theme } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";

test("only the six button cells copy, not adjacent cells or literal [Copy] in code", async () => {
  const f = fixture("```txt\nliteral [Copy]\n```");
  try {
    const p = f.buttons()[0];
    for (const [x, y] of [[p.x - 3, p.y], [p.x + 4, p.y], [12, p.y + 1]]) {
      f.mouse(x, y); f.mouse(x, y, "release");
    }
    await flush(); assert.deepEqual(f.copies, []);
    f.click(); await flush(); assert.deepEqual(f.copies, ["literal [Copy]"]);
  } finally { f.dispose(); }
});

test("modified clicks retain native selection semantics instead of activating Copy", async () => {
  const f = fixture("```txt\ncode\n```");
  try {
    const p = f.buttons()[0];
    for (const modifier of [4, 8, 16]) f.terminal.input(`\x1b[<${modifier};${p.x + 1};${p.y + 1}M\x1b[<${modifier};${p.x + 1};${p.y + 1}m`);
    await flush(); assert.deepEqual(f.copies, []);
  } finally { f.dispose(); }
});

test("an active overlay owns mouse events over the underlying button", async () => {
  const f = fixture("```txt\ncode\n```");
  try {
    const p = f.buttons()[0];
    const overlay = f.tui.showOverlay(new Text("cover\ncover\ncover\ncover", 0, 0), { width: 64, anchor: "top-left" });
    f.frame(); f.mouse(p.x, p.y); f.mouse(p.x, p.y, "release"); await flush();
    assert.deepEqual(f.copies, []);
    overlay.hide(); f.frame(); f.click(); await flush(); assert.deepEqual(f.copies, ["code"]);
  } finally { f.dispose(); }
});

test("partial closing fences decline source mapping; closed fences recover", async () => {
  const f = fixture("```py\nprint(1)\n``");
  try {
    assert.equal(f.buttons().length, 0);
    assert.ok(f.frame().every((line) => !line.includes("pi-codeblock=")));
    (f.message as AssistantMessageComponent).updateContent(response("```py\nprint(1)\n```"));
    f.frame(); f.click(); await flush(); assert.deepEqual(f.copies, ["print(1)"]);
  } finally { f.dispose(); }
});

test("empty and whitespace-only blocks are copied without trimming", async () => {
  for (const code of ["", "   \n"]) {
    const f = fixture("```txt\n" + code + "\n```");
    try { f.click(); await flush(); assert.deepEqual(f.copies, [code]); }
    finally { f.dispose(); }
  }
});

test("source/native parser disagreement never guesses a block", () => {
  const f = fixture("$$\n```txt\ninside math\n```\n$$\n\n```txt\nactual code\n```");
  try {
    assert.equal(f.buttons().length, 0);
    assert.ok(f.frame().every((line) => !line.includes("pi-codeblock=")));
  } finally { f.dispose(); }
});

test("shutdown leaves later wrappers intact; duplicate and unsupported installs fail closed", () => {
  assert.equal(installCodeblockCopy({ mode: "fullscreen" } as TUI, () => {}, () => theme), undefined);
  const native = Markdown.prototype.render;
  const f = fixture("```txt\ncode\n```");
  const ours = Markdown.prototype.render;
  const later: typeof native = function (this: Markdown, width) { return ours.call(this, width); };
  try {
    assert.equal(installCodeblockCopy(f.tui, () => {}, () => theme), undefined);
    Markdown.prototype.render = later;
    f.controller!.dispose(); assert.equal(Markdown.prototype.render, later);
    f.frame(); assert.equal(f.buttons().length, 0);
    const again = installCodeblockCopy(f.tui, () => {}, () => theme);
    assert.ok(again); f.frame(); assert.equal(f.buttons().length, 1); again.dispose();
  } finally { Markdown.prototype.render = native; f.dispose(); }
});

test("plain text, links and image protocol rows outside cards are unchanged", () => {
  const image = "\x1b_Gi=123,a=p;AAAA\x1b\\";
  const source = "[link](https://example.com)\n\n```txt\n  body\n```";
  const build = () => new UserMessageComponent(source, undefined, 1, [(text) => text + "\n\n" + image]);
  const f = fixture(source, { build });
  const baseline = fixture(source, { build, install: false });
  try {
    const actual = f.frame(), expected = baseline.frame();
    assert.equal(actual.length, expected.length);
    assert.ok(expected.some((line) => line.includes(image)));
    const plain = expected.map(stripTerminalSequences);
    const top = plain.findIndex((line) => line.trim() === "```txt");
    const bottom = plain.findIndex((line) => line.trim() === "```");
    assert.ok(top >= 0 && bottom > top);
    for (let row = 0; row < actual.length; row++) {
      if (row < top || row > bottom) assert.equal(actual[row], expected[row]);
      else if (row > top && row < bottom) assert.equal(stripTerminalSequences(actual[row]), plain[row]);
    }
  } finally { baseline.dispose(); f.dispose(); }
});
