import { test } from "node:test";
import assert from "node:assert/strict";
import { Markdown, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { renderCard, paintCardLine, type CardTheme } from "../src/card.ts";
import { getMarkdownTheme, initTheme, theme } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { cells } from "./ansi.ts";
import { fixture, flush } from "./harness.ts";

const plainTheme: CardTheme = { getBgAnsi: () => "\x1b[48;2;17;18;19m", fg: (_name, text) => text };
const activeBackground = () => cells(theme.getBgAnsi("userMessageBg") + "x")[0].bg;

test("card layout fits every width, including Unicode and long wrapped lines", () => {
  for (let width = 1; width <= 65; width++) {
    const card = renderCard(["  界面 é 👨‍👩‍👧‍👦 " + "abcdef".repeat(10), "", "  tail  "], "python", width, plainTheme);
    assert.ok(card.lines.every((line) => visibleWidth(line) === width));
    assert.ok(card.lines.length >= 5);
    assert.ok(card.lines.every((line) => cells(paintCardLine(line, card.background)).every((cell) => cell.bg === "2;17;18;19")));
  }
});

test("background survives syntax resets without losing foreground colors", () => {
  const card = renderCard(["\x1b[31mred\x1b[0m plain \x1b[38;2;0;99;0mgreen\x1b[39m"], "code", 40, plainTheme);
  const row = cells(paintCardLine(card.lines[1], card.background));
  assert.equal(row.length, 40);
  assert.ok(row.every((cell) => cell.bg === "2;17;18;19"));
  assert.equal(row[2].fg, "5;1");
  assert.equal(row[6].fg, undefined);
  assert.equal(row[12].fg, "2;0;99;0");
});

for (const name of ["dark", "light"]) {
  test(`${name}: native assistant cards have continuous background and no surrounding bleed`, () => {
    const f = fixture("Before\n\n```python\ndef f():\n    return 1\n\nprint(f())\n```\n\nAfter", { theme: name });
    try {
      const frame = f.frame(), plain = frame.map(stripTerminalSequences);
      const top = plain.findIndex((line) => line.includes("[Copy]"));
      assert.ok(top >= 0); assert.match(plain[top], /python\s+\[Copy\]/);
      assert.ok(!plain.join("\n").includes("```"));
      const background = activeBackground();
      for (let y = top; y < top + 6; y++) {
        const row = cells(frame[y]);
        assert.equal(row[0].bg, undefined); assert.equal(row[63].bg, undefined);
        assert.ok(row.slice(1, 63).every((cell) => cell.bg === background), `background hole at row ${y}`);
      }
      for (const text of ["Before", "After"]) {
        const row = frame[plain.findIndex((line) => line.includes(text))];
        assert.ok(cells(row).every((cell) => cell.bg === undefined));
      }
      assert.ok(!f.terminal.output.includes("pi-codeblock="));
    } finally { f.dispose(); }
  });
}

test("native user message background is restored at both card margins", () => {
  const f = fixture("Before\n\n```py\nprint(1)\n```\n\nAfter", { role: "user" });
  try {
    const frame = f.frame();
    const top = frame.findIndex((line) => stripTerminalSequences(line).includes("[Copy]"));
    for (let y = top; y < top + 3; y++) {
      const row = cells(frame[y]); assert.equal(row.length, 64);
      assert.ok(row.every((cell) => cell.bg === activeBackground()), `outer background lost at ${y}`);
    }
  } finally { f.dispose(); }
});

test("nested card backgrounds exclude quote/list prefixes and retain precise copy targets", async () => {
  const f = fixture("> - ```python\n>   print(1)\n>   ```\n\nOutside");
  try {
    const frame = f.frame(); const top = f.buttons()[0].y;
    for (let y = top; y < top + 3; y++) {
      const row = cells(frame[y]);
      assert.ok(row.slice(0, 5).every((cell) => cell.bg === undefined));
      assert.ok(row.slice(5, 63).every((cell) => cell.bg === activeBackground()));
      assert.equal(row[63].bg, undefined);
    }
    f.click(); await flush(); assert.deepEqual(f.copies, ["print(1)"]);
  } finally { f.dispose(); }
});

test("only display fences disappear; literal fences in a Markdown snippet stay intact", async () => {
  const f = fixture("````markdown\n```python\nx = 1\n```\n````");
  try {
    const plain = f.frame().map(stripTerminalSequences);
    assert.equal(plain.filter((line) => line.includes("```python")).length, 1);
    assert.equal(plain.filter((line) => line.trim() === "```").length, 1);
    assert.match(plain[f.buttons()[0].y], /markdown\s+\[Copy\]/);
    f.click(); await flush(); assert.deepEqual(f.copies, ["```python\nx = 1\n```"]);
  } finally { f.dispose(); }
});

test("theme changes and resize rebuild card backgrounds without changing clipboard source", async () => {
  const code = "\tlong_" + "identifier".repeat(8) + "  ";
  const f = fixture("```python\n" + code + "\n```", { width: 64 });
  try {
    const old = activeBackground();
    initTheme("light", false); f.terminal.columns = 28; f.tui.invalidate();
    const frame = f.frame(); assert.notEqual(activeBackground(), old);
    assert.ok(frame.every((line) => visibleWidth(line) <= 28));
    const top = f.buttons()[0].y;
    assert.ok(cells(frame[top + 1]).slice(1, 27).every((cell) => cell.bg === activeBackground()));
    f.click(); await flush(); assert.deepEqual(f.copies, [code]);
  } finally { f.dispose(); }
});

test("native selection stays visible above the panel background", () => {
  const f = fixture("```txt\nabcdefghijklmnop\n```");
  try {
    const y = f.buttons()[0].y + 1;
    f.mouse(4, y); f.mouse(12, y, "drag"); f.mouse(12, y, "release");
    assert.equal(f.tui.hasActiveSelection(), true);
    const row = cells(f.frame()[y]);
    assert.ok(row.slice(4, 12).every((cell) => cell.inverse));
    assert.equal(row[3].inverse, false); assert.equal(row[13].inverse, false);
  } finally { f.dispose(); }
});

test("partial closing fences keep the card appearance while Copy is disabled", () => {
  const f = fixture("```python\nprint(1)\n``");
  try {
    const frame = f.frame(), plain = frame.map(stripTerminalSequences);
    const header = plain.findIndex((line) => line.trim() === "python");
    assert.ok(header >= 0); assert.equal(f.buttons().length, 0);
    assert.ok(cells(frame[header + 1]).slice(1, 63).every((cell) => cell.bg === activeBackground()));
  } finally { f.dispose(); }
});

test("transforms retain their receiver and run only once per cached render", () => {
  let calls = 0;
  const options = { transform(text: string): string { assert.equal(this.transform, options.transform); calls++; return text; } };
  const f = fixture("", { build: () => {
    const owner = new UserMessageComponent("before");
    owner.addChild(new Markdown("```py\nx = 1\n```", 0, 0, getMarkdownTheme(), undefined, options));
    return owner;
  } });
  try {
    assert.equal(f.buttons().length, 1);
    const count = calls; assert.ok(count > 0);
    f.frame(); f.frame(); assert.equal(calls, count);
  } finally { f.dispose(); }
});

test("image protocol bytes inside a code token keep native rendering", () => {
  const source = "```txt\n\x1b_Gi=123,a=p;AAAA\x1b\\\n```";
  const f = fixture(source), baseline = fixture(source, { install: false });
  try {
    assert.deepEqual(f.frame(), baseline.frame());
    assert.equal(f.buttons().length, 0);
  } finally { baseline.dispose(); f.dispose(); }
});

test("theme default background and missing language do not invent a fixed palette", () => {
  const card = renderCard(["hello"], "", 20, { ...plainTheme, getBgAnsi: () => "\x1b[49m" });
  assert.equal(card.background, "\x1b[49m");
  assert.equal(card.lines[0].trim(), "code");
  assert.ok(cells(paintCardLine(card.lines[1], card.background)).every((cell) => cell.bg === undefined));
});
