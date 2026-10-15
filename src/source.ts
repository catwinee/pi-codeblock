import { Marked } from "marked";
import { parseSkillBlock, type SessionEntry } from "@earendil-works/pi-coding-agent";

export interface CodeBlock { code: string; language: string }
export interface ConversationCodeBlock extends CodeBlock { entryId: string; role: "user" | "assistant" }
const parser = new Marked();

/** Parse before Pi replaces source tabs with display spaces. Never trim code. */
export function codeBlocks(source: string): CodeBlock[] {
  const result: CodeBlock[] = [];
  parser.walkTokens(parser.lexer(source), (token) => {
    if (token.type === "code") result.push({ code: token.text, language: token.lang ?? "" });
  });
  return result;
}

/** Entries must be the current compaction-aware branch, not all session history. */
export function conversationCodeBlocks(entries: readonly SessionEntry[]): ConversationCodeBlock[] {
  const result: ConversationCodeBlock[] = [];
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message.role !== "user" && message.role !== "assistant") continue;
    const { role, content } = message;
    let texts = typeof content === "string" ? [content]
      : content.filter((part) => part.type === "text").map((part) => part.text);
    if (role === "user") {
      const text = texts.join("");
      const skill = parseSkillBlock(text);
      texts = [skill ? skill.userMessage ?? "" : text];
    }
    for (const text of texts) {
      for (const block of codeBlocks(text)) result.push({ ...block, entryId: entry.id, role });
    }
  }
  return result;
}
