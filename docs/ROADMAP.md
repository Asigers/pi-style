# pi-style roadmap · Forest Night

## Design

One dark `pi-style-forest` theme. Colors: background `#141C23`, green `#86C9B4`, amber `#D7B778`, slate blue `#738EAC`, light text `#E7EDF0`. No pink, hearts, logo or animation in the Footer.

Pi public APIs are used throughout: `setTheme`, `setHeader`, `setFooter`, `setEditorComponent`, `setWidget`, `ctx.ui.custom`. No fork or patch of Pi core.

## P0 · foundation (v0.1)

- [x] Token / cache / estimated cost in the terminal
- [x] Wall-clock exchange timer from `before_agent_start` to `agent_settled`
- [x] Exchange entries persisted to Pi session JSONL
- [x] `/pi-usage`, `/pi-history` widgets

## P1 · responsive Forest Night skin (v0.3.0)

- [x] A single distributable `pi-style-forest` theme
- [x] Responsive custom Footer, 40–120 column layout and fallback truncation
- [x] Footer guarantees context usage, configured Provider and model first; shows Token, duration and cost when space allows
- [x] `/pi-style cute|compact|off|theme`, reset built-in components on off
- [x] Width-aware one/two line behavior, CJK width safety, unknown context and theme token tests
- [x] In-memory theme switching and prior theme restore without persisted setting side effects
- [ ] Manual contrast/terminal testing across OSes (test matrix below)

## P2 · interactive analytics (v0.2.1)

- [x] `ctx.ui.custom()` keyboard dashboard with Overview, History, Daily, Projects
- [x] History sorting by recency/duration/Token; success/abort filtering
- [x] First-content latency, model message span and tool execution sum
- [x] Opt-in `/pi-label`, no implicit prompt retention
- [x] Opt-in JSONL cross-session index, per-project/day aggregates, JSON export
- [ ] Provider-level billing reconciliation (New API support must have authenticated, read-only API and credentials design)
- [ ] Optional SQLite backend for very large histories (current JSONL index is lightweight)
- [x] Segmented queued user-message records with explicit shared-run attribution, no invented queue wait
- [x] Tool/summary/compaction/standalone usage ledger accounting
- [x] Cached session stats by session ID and leaf

## P3 · personal UI (v0.3.0)

- [x] Optional Border Collie startup Header; compact mode restores built-in header
- [x] Decorative `CustomEditor` marker (stock editing, no remapping)
- [x] Remove footer motion, hearts and decorative branding
- [x] Optional low-noise/collapsed native tool output (`/pi-style quiet`)
- [x] Feature toggles and restore paths
- [x] TUI mock runtime and queued-message regression tests
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
