# pi-codeblock

Theme-colored code cards with clickable **[Copy]** controls in [Pi](https://pi.dev/)'s fullscreen conversation view.

A language title on the left, **[Copy]** on the right, syntax-highlighted code, and a continuous background—without display-only Markdown fences.

Copies code without display padding, Markdown fences, syntax-highlighting escapes, or visual line wraps. Code indentation, tabs, and blank lines are retained. The rest of Pi's UI and body-text copying are unchanged.

## Install

For a local checkout:

```sh
cd pi-codeblock
npm ci --ignore-scripts
pi install .
```

Run `/reload` or restart Pi. Once this repository is pushed, Git installation is available:

```sh
pi install git:github.com/catwinee/pi-codeblock
```

This package has not been published to npm.

## Usage

- **Mouse:** click `[Copy]` in a code block's header in a user or assistant message. Dragging does not copy the code block.
- **Keyboard:** run `/codeblock` and choose from the 50 most recent code blocks in persisted user/assistant text on the active branch. `/codeblock last` copies the latest one. Hidden reasoning and tool output are not searched.
- Clipboard feedback uses Pi's native fullscreen copy path for buttons. The command reports success or failure without changing the editor draft.

## Compatibility and behavior

- Targets Pi **1.2.0**. Inline buttons require fullscreen mode; `/codeblock` also works in regular interactive mode.
- Buttons do not appear in tool output, unrelated custom messages, or ordinary Markdown overlays.
- Code cards reuse Pi's syntax highlighting, with inset wrapped lines and a small bottom padding. Surrounding Markdown layout stays native. Very narrow blocks omit the button; use `/codeblock` instead.
- Card backgrounds follow the theme's `userMessageBg`; titles use `muted` and Copy uses `accent`. Theme changes rebuild the colors. Themes using the terminal-default panel background may have little or no visible fill.
- Cards remain part of the original message, not new user/tool components. Message navigation and session history are unchanged.
- Copying uses Markdown code content, not rendered terminal rows. Markdown parsing normalizes line endings to LF and removes structural fence/list/quote indentation; it does not recover an arbitrary original file byte-for-byte.
- Incomplete streaming blocks can be copied when their source mapping is verified. A rendered change between mouse press and click cancels the copy; click again after the block stabilizes.
- If source parsing and native rendering disagree, no copy target is guessed. A card can remain visible without Copy while a closing fence is still streaming. Unsupported renderer layouts or image-protocol data inside code keep native rendering instead.
- Existing links, ordinary text selection, editor keybindings, and drafts are left alone. No model requests, tools, session entries, or network operations are added.
- Private renderer access is isolated in `src/pi-compat.ts`. Future Pi versions and other renderer patches require validation. Do not load this together with another code-block Copy renderer such as pi-pretty-tui.

See [VALIDATION.md](VALIDATION.md) for the actual test record and remaining limitations.

## Development

```sh
npm ci --ignore-scripts
npm run check
npm test
npm pack --dry-run
```

Pi and its TUI are host-provided peer dependencies. `marked` is used to extract code before Pi's display-only tab expansion.

## Uninstall

Remove the same source you installed, then reload:

```sh
pi remove /path/to/pi-codeblock
```

## License and acknowledgments

[MIT](LICENSE). The code-block Copy design is adapted from [Kainan Yang's pi-pretty-tui](https://github.com/ykn0309/pi-pretty-tui). See [UPSTREAM.md](UPSTREAM.md) for the pinned source and adaptation scope.
