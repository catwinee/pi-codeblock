import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionManager, type ExtensionAPI, type ExtensionCommandContext, type RegisteredCommand } from "@earendil-works/pi-coding-agent";
import { registerCodeblockCommand } from "../src/extension.ts";
import { response } from "./harness.ts";

function commandFixture() {
  const sm = SessionManager.inMemory("/tmp");
  sm.appendMessage(response("```txt\nold\n```\n\n```py\n\tnew  \n```"));
  const copies: string[] = [], notices: string[] = [];
  let handler!: RegisteredCommand["handler"], generation = 0;
  let choose: (labels: string[]) => Promise<string | undefined> = async (labels) => labels[0];
  let write = async (text: string) => { copies.push(text); };
  registerCodeblockCommand({ registerCommand: (_name, command) => { handler = command.handler; } } as ExtensionAPI,
    () => generation, (text) => write(text));
  const ctx = { mode: "tui", sessionManager: sm, ui: {
    notify: (text: string) => notices.push(text), select: (_title: string, labels: string[]) => choose(labels),
  } } as unknown as ExtensionCommandContext;
  return { copies, notices, run: (args = "") => handler(args, ctx),
    choose(fn: typeof choose) { choose = fn; }, write(fn: typeof write) { write = fn; }, switchBranch() { generation++; } };
}

test("keyboard picker and last command copy exact source, newest block first", async () => {
  const f = commandFixture(); await f.run("last"); assert.deepEqual(f.copies, ["\tnew  "]);
  f.choose(async (labels) => labels[1]); await f.run(); assert.deepEqual(f.copies, ["\tnew  ", "old"]);
});
test("cancel, invalid arguments, and a branch change during the picker do not copy", async () => {
  const f = commandFixture(); f.choose(async () => undefined); await f.run(); await f.run("unsupported");
  f.choose(async (labels) => { f.switchBranch(); return labels[0]; }); await f.run();
  assert.deepEqual(f.copies, []);
});
test("keyboard clipboard errors are reported without claiming success", async () => {
  const f = commandFixture(); f.write(async () => { throw new Error("clipboard unavailable"); });
  await f.run("last"); assert.deepEqual(f.notices, ["Code block copy failed."]);
});
