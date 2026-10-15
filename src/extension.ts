import { copyToClipboard, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, truncateToWidth } from "@earendil-works/pi-tui";
import { installCodeblockCopy, type CodeblockController } from "./pi-compat.ts";
import { conversationCodeBlocks } from "./source.ts";

export default function (pi: ExtensionAPI): void {
  let controller: CodeblockController | undefined;
  let generation = 0;
  pi.on("session_start", async (_event, ctx) => {
    controller?.dispose(); controller = undefined;
    generation++;
    if (ctx.mode !== "tui") return;
    // Capture the active TUI through the public UI API without replacing the editor.
    // Close only our own overlay, after its handle exists (never hide another dialog).
    let close: () => void = () => {};
    await ctx.ui.custom<void>((tui, _theme, _keys, done) => {
      close = () => done();
      controller = installCodeblockCopy(tui, (message) => ctx.ui.notify(message, "warning"));
      if (tui.mode === "fullscreen" && !controller) ctx.ui.notify("pi-codeblock: unsupported renderer; use /codeblock instead.", "warning");
      return { render: () => [], invalidate() {} };
    }, { overlay: true, onHandle: () => close() });
  });
  pi.on("session_tree", () => { generation++; });
  pi.on("session_shutdown", () => { generation++; controller?.dispose(); controller = undefined; });
  registerCodeblockCommand(pi, () => generation);
}

export function registerCodeblockCommand(pi: ExtensionAPI, getGeneration: () => number,
  copy: (text: string) => Promise<void> = copyToClipboard): void {
  pi.registerCommand("codeblock", {
    description: "Copy a code block from the current branch (/codeblock [last])",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") return;
      if (args.trim() && args.trim() !== "last") {
        ctx.ui.notify("Usage: /codeblock [last]", "warning"); return;
      }
      const epoch = getGeneration();
      try {
        const blocks = conversationCodeBlocks(ctx.sessionManager.buildContextEntries()).slice(-50).reverse();
        if (!blocks.length) { ctx.ui.notify("No code blocks in the current conversation branch.", "info"); return; }
        const labels = blocks.map((block, i) => {
          const language = stripTerminalSequences(block.language).split(/\s+/)[0] || "code";
          const preview = stripTerminalSequences(block.code).split("\n").find((line) => line.trim())?.trim() ?? "(empty)";
          return `${i + 1}. [${block.role}] ${truncateToWidth(language, 20)} · ${block.code.split("\n").length} lines · ${truncateToWidth(preview, 60)}`;
        });
        const selected = args.trim() === "last" ? labels[0] : await ctx.ui.select("Copy code block", labels);
        if (getGeneration() !== epoch || selected === undefined) return;
        const index = labels.indexOf(selected);
        if (index < 0) return;
        await copy(blocks[index].code);
        if (getGeneration() === epoch) ctx.ui.notify("Code block copied.", "info");
      } catch {
        if (getGeneration() === epoch) ctx.ui.notify("Code block copy failed.", "warning");
      }
    },
  });
}
