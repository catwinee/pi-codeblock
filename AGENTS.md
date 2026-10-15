# pi-codeblock maintenance

- Read README.md and UPSTREAM.md before changes. Retain the upstream MIT notice.
- Scope: code-block copying only. Do not change body-text copying, editor keys, tool renderers, message layout, or installed Pi files.
- Keep all private Pi access and runtime patches in src/pi-compat.ts. Validate structures and fail closed; remove only patches still owned by this extension.
- Copy code data before display indentation, wrapping and syntax highlighting. Never trim code indentation or replace source tabs with display spaces.
- Preserve drafts, native mouse selection, overlays, streaming, and image protocols. Do not send model requests or register tools.
- No mailbox access, telemetry, or runtime network features.
- Run npm run check, npm test, npm pack --dry-run, and isolated real-Pi tests for renderer/mouse changes. Test host-provided Pi imports from a packed installation too.
- Do not install into live Pi settings, push, publish, or create releases without explicit task authorization.
