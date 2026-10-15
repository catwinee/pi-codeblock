# Upstream provenance

This independent extension adapts the code-block copy approach from [pi-pretty-tui](https://github.com/ykn0309/pi-pretty-tui), not its full UI redesign.

- Reviewed version: `pi-pretty-tui@0.2.8`
- Source commit: `bc553e61f1a75d472b80756477ac9f0f85dadb47`
- Source file: `extensions/index.ts`, particularly `copyTranscriptText` and the `pretty-tui.code-blocks` patches
- Regression reference: `tests/regression.mjs`, fullscreen code-copy controls and indentation preservation
- License: MIT, Copyright (c) 2026 Kainan Yang; retained in `LICENSE`
- npm artifact integrity: `sha512-a+XODx8aGyl+ti7/LvEnGBPlzilHKxPWRyc7gwJcDiJcfT3i1dG3imhjGCGBTt+5j/EK+FxK27gS6WboMLbyow==`

## Adapted concepts

- Scope Markdown controls to transcript messages.
- Add a per-code-block Copy control, associate it with code data, and handle native component clicks.
- Use the native fullscreen clipboard path and restore owned patches on shutdown.

## Local implementation

- Preserve Pi's existing code rendering; only add `[Copy]` to its header.
- Parse code before Pi's display-only tab expansion and validate against the code tokens Pi actually renders.
- Use temporary zero-width markers to locate button geometry after native nesting and wrapping; remove every marker before returning/caching output.
- Respect native drag detection instead of patching fullscreen selection semantics.
- Provide `/codeblock` as a keyboard fallback using the active, compaction-aware branch.

No activity timeline, chat bubbles, tool re-registration, editor styling, response footer, or upstream settings framework is included.

## Maintenance

Port upstream fixes selectively at a recorded revision; retain attribution and inspect any new private API use. Do not merge the full UI extension. Pi renderer compatibility must be verified with both automated tests and an isolated interactive smoke test.
