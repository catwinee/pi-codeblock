# Validation

## Baseline

- Pi / pi-tui: **1.2.0**
- Local Node: **26.11.1**, Linux
- Upstream reference: pi-pretty-tui **0.2.8**, pinned in UPSTREAM.md
- No installed Pi files or daily settings were changed. No push or npm publication was performed.

## Automated checks

Passed: `npm run check`, `npm test` (**25 tests**), and `npm pack --dry-run`.

Coverage uses real Pi message components, Markdown, ScrollView, and TuiAltScreen with a memory terminal and injected clipboard, not a substitute Markdown renderer:

- User/assistant controls, multiple identical headers, nested lists/quotes, scrolling and narrow widths.
- Exact tab/space/blank-line preservation; long lines, Unicode and empty code.
- Button hit boundaries; literal `[Copy]` in code; drag/modified-click safety; normal text selection.
- Streaming/replaced Markdown components and resize cancel stale pressed targets.
- Overlay ownership; unrelated Markdown and other TUI instances remain unpatched in effect.
- Clipboard exception handling, cleanup, duplicate-load rejection and safe coexistence with later method wrappers.
- Renderer transforms execute once per native cached render; existing image protocol rows and non-header rows remain unchanged.
- Partial fence/parser disagreements disable controls rather than guessing code mappings.
- Keyboard source excludes tools/thinking, follows compaction and the active branch, and preserves assistant text-component boundaries.
- Picker cancellation, branch changes, invalid arguments and clipboard failures.

The CI workflow targets Node 22 and 24. Remote CI has **not** run because this repository has not been pushed.

## Isolated interactive smoke

Dedicated tmux server and temporary `PI_CODING_AGENT_DIR`; `PI_OFFLINE=1`, persisted synthetic history, `--no-extensions --no-skills --no-prompt-templates --no-context-files`, explicit extension paths only. No model calls or real conversation data were used.

Completed with the installed Pi executable:

- Source checkout: three native user/assistant/nested `[Copy]` controls; actual SGR mouse press/release reaches the clipboard backend with exact expected code.
- Tabs and trailing whitespace preserved; editor draft and session leaf unchanged by copying.
- `/reload`: controls return once each and copying continues to work.
- `/codeblock`: native keyboard picker lists the expected blocks; Escape cancels.
- Co-load with local pi-vim-navigate and pi-rich-renderer in both extension orders.
- In Vim NORMAL mode, clicking Copy exits navigation through its normal mouse path, copies the intended block and preserves the draft.
- Packed installation outside the checkout: only `marked@18.0.11` installed, no bundled Pi/TUI or development dependencies. All three mouse targets and `/reload` passed using the host's Pi imports.
- Ten recorded copy operations across the source, both companion-extension orders, and packed installation; no unexpected input or agent-start events.

Temporary evidence: `/tmp/pi-codeblock-smoke/` (may be removed). The observer records only synthetic clipboard payloads, drafts, session leaf IDs, and unexpected input/agent events.

## Limits

- Smoke tests inject a successful clipboard backend **inside the isolated Pi process**. They establish exact payload delivery, not desktop clipboard transport or remote OSC 52 support.
- The real-Pi coexistence run uses code/text. Image protocol pass-through is automated; visual math/image acceptance in the user's terminal remains unverified.
- No assurance is made for other Pi versions, every terminal/mouse protocol, or another active code-block Copy renderer.
- Source extraction follows Markdown semantics rather than arbitrary file-byte preservation. Raw-source tab layouts that do not match Pi's tab-expanded parsing deliberately omit buttons.
- General transcript-selection padding is intentionally unchanged.

## Reproduce interactively

Use an isolated agent directory and a synthetic session. Capture the TUI with a test-only extension and replace its `copySelection` backend with an in-memory/file collector; do not invoke the real desktop clipboard during automated smoke tests. Exercise press/release and drag sequences, scrolling, `/reload`, selector cancellation, and both companion extension load orders. Stop only the dedicated test tmux server afterward.
