import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { codeBlocks, conversationCodeBlocks } from "../src/source.ts";
import { response } from "./harness.ts";

test("code parsing preserves tabs, significant spaces and blank lines; normalizes CRLF", () => {
  assert.deepEqual(codeBlocks("```py\r\n\tif True:  \r\n\t\tpass\r\n\r\n```"),
    [{ language: "py", code: "\tif True:  \n\t\tpass\n" }]);
  assert.equal(codeBlocks("```txt\n   \n\n```" )[0].code, "   \n");
  assert.equal(codeBlocks("```txt\n```" )[0].code, "");
});

test("tilde, longer fences, quote/list structural indentation and open streaming blocks", () => {
  assert.equal(codeBlocks("~~~~txt\n```\n~~~~")[0].code, "```");
  assert.equal(codeBlocks("> ```py\n>   x\n> ```")[0].code, "  x");
  assert.equal(codeBlocks("- item\n\n  ```py\n    x\n  ```")[0].code, "  x");
  assert.equal(codeBlocks("```txt\npartial")[0].code, "partial");
});

test("keyboard source follows the active compaction-aware branch, excludes tools/thinking", () => {
  const sm = SessionManager.inMemory("/tmp");
  const first = sm.appendMessage({ role: "user", content: "```txt\nfirst\n```", timestamp: 0 });
  sm.appendMessage(response("```txt\nold branch\n```"));
  sm.branch(first);
  const newest = sm.appendMessage({ ...response(""), content: [
    { type: "thinking", thinking: "```txt\nhidden\n```" },
    { type: "text", text: "```txt\nnew branch\n```" },
  ] });
  sm.appendMessage({ role: "toolResult", toolCallId: "call", toolName: "bash", content: [{ type: "text", text: "```txt\ntool\n```" }], isError: false, timestamp: 0 });
  assert.deepEqual(conversationCodeBlocks(sm.buildContextEntries()).map((b) => b.code), ["first", "new branch"]);
  sm.appendCompaction("summary", newest, 100);
  assert.deepEqual(conversationCodeBlocks(sm.buildContextEntries()).map((b) => b.code), ["new branch"]);
});

test("keyboard source joins user text parts but keeps assistant Markdown components separate", () => {
  const sm = SessionManager.inMemory("/tmp");
  sm.appendMessage({ role: "user", content: [{ type: "text", text: "```txt\n" }, { type: "text", text: "joined\n```" }], timestamp: 0 });
  sm.appendMessage({ ...response(""), content: [{ type: "text", text: "```txt\none\n```" }, { type: "text", text: "```txt\ntwo\n```" }] });
  assert.deepEqual(conversationCodeBlocks(sm.buildContextEntries()).map((b) => b.code), ["joined", "one", "two"]);
});
