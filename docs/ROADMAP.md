# pi-style roadmap · one Blush palette 🧁

## Design

One dark `pi-style-blush` theme only. Colors: pink `#f5aeca`, lavender `#c7b6ee`, sage `#a6d8c0`, background `#231e2b`. The terminal remains readable and dense, rather than filling the screen with emoji.

Pi public APIs are used throughout: `setTheme`, `setHeader`, `setFooter`, `setEditorComponent`, `setWidget`, `ctx.ui.custom`. No fork or patch of Pi core.

## P0 · foundation (v0.1)

- [x] Token / cache / estimated cost in the terminal
- [x] Wall-clock exchange timer from `before_agent_start` to `agent_settled`
- [x] Exchange entries persisted to Pi session JSONL
- [x] `/pi-usage`, `/pi-history` widgets

## P1 · cute, responsive skin (v0.2)

- [x] A single distributable `pi-style-blush` theme
- [x] Responsive custom Footer, 40–120 column layout and fallback truncation
- [x] Footer includes current model, Git branch, cache and cost as width allows
- [x] `/pi-style cute|compact|off|theme`, reset built-in components on off
- [x] Pure width behavior and theme token tests
- [ ] Manual contrast/terminal testing across OSes (test matrix below)

## P2 · interactive analytics (v0.2)

- [x] `ctx.ui.custom()` keyboard dashboard with Overview, History, Daily, Projects
- [x] History sorting by recency/duration/Token; success/abort filtering
- [x] First-content latency, model message span and tool execution sum
- [x] Opt-in `/pi-label`, no implicit prompt retention
- [x] Opt-in JSONL cross-session index, per-project/day aggregates, JSON export
- [ ] Provider-level billing reconciliation (New API support must have authenticated, read-only API and credentials design)
- [ ] Optional SQLite backend for very large histories (current JSONL index is lightweight)
- [ ] Correct attribution when a queued prompt is run inside the same continuous settled run

## P3 · personal UI (v0.2)

- [x] Optional Border Collie startup Header; compact mode restores built-in header
- [x] Decorative `CustomEditor` marker (stock editing, no remapping)
- [x] Reduced-motion default and optional tiny footer heartbeat
- [x] Optional low-noise/collapsed native tool output (`/pi-style quiet`)
- [x] Feature toggles and restore paths
- [ ] Manual Windows Terminal / iTerm2 / WezTerm / tmux / SSH contrast and IME verification
- [ ] RPC/Pi-Web browser implementation (requires changing the separate browser client; terminal component factories cannot render there)
- [ ] Optional custom builtin tool renderers after real-user acceptance

## Guardrails

1. Extensions affect UI only, never prompts, source code, tool results, API endpoints or permissions.
2. Per-message usage and cached usage stay separate; cost marked estimate.
3. Indexing absolute project paths requires explicit `/pi-global on`. Turning off does not destroy prior records.
4. The custom footer owns its slot while enabled; avoid combining with other footer-replacing extensions.
5. `/pi-style off` attempts to restore previous theme and editor, not unrelated extension state changes.
6. Theme and rendered text must truncate safely in narrow terminals.
7. No false claims that RPC/Pi-Web can render custom terminal components.

## Manual test matrix

- [ ] Windows Terminal + IME composing Chinese, multiple lines, paste
- [ ] iTerm2 / WezTerm + emoji display widths
- [ ] tmux and SSH + 40, 60, 80, 120 columns
- [ ] Live timer, session switch/resume/tree navigation
- [ ] Different provider usage schemas, zero-price custom New API
- [ ] Cross-session indexing opt-in, export, opt-out, corrupt JSONL recovery

## References

- https://pi.dev/docs/latest/extensions
- https://pi.dev/docs/latest/tui
- https://pi.dev/docs/latest/themes
- https://pi.dev/docs/latest/packages
