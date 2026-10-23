# pi-style roadmap: a cute Pi terminal 🧁

## What is actually customizable?

Pi's public Extension API can render persistent `setStatus()` text, multiline `setWidget()` content, theme palettes, custom header/footer components, a custom editor, tool renderers, and `ctx.ui.custom()` modal or overlay screens. The terminal component toolkit is `@earendil-works/pi-tui`.

It **cannot** provide arbitrary CSS/web layout or seamlessly replace the entire transcript renderer and Pi's screen orchestration with one API call. For those, a standalone TUI over the SDK, or a maintained fork, would be a separate product. Prefer native extension points.

## Style direction

**Soft, cute, usable** rather than emoji noise:

- Palette: blush pink `#efb9c8`, lavender `#bcb4e8`, cream `#faf2e8`, sage `#b7d5c3`, charcoal `#454352`.
- Accent motifs: `♡`, `✦`, `✿`, soft divider lines and rounded corners where supported.
- Compact 80-column layout first; hide ornaments progressively at 60/40 columns.
- Two modes: `cute` with 1-2 tasteful accents, `compact` with clean ASCII fallback.
- Preserve WCAG-like contrast; avoid excessive animations and bright background floods.
- Never affect source code content or logs; styling belongs only in the terminal UI.

## Milestones

### P0 — shipped in v0.1

- [x] Token and estimated cost in status
- [x] Live wall-time timer (per agent prompt)
- [x] Store settled exchanges in session JSONL custom entries
- [x] `/pi-usage` and `/pi-history` panels
- [x] Cute and compact status variants
- [x] Pure helper tests

### P1 — true cute skin, no core changes

- [ ] Validate light and dark custom themes against official theme schema
- [ ] Add two named theme files: `pi-style-blush-dark` / `pi-style-blush-light`
- [ ] `/pi-style theme` to choose a palette if supported; leave `/settings` as fallback
- [ ] Adaptive widget width and terminal capability detection
- [ ] Optional minimalist custom Footer, preserving Pi's built-in fields and restoring it cleanly
- [ ] Snapshot tests for width=40, 60, 80 and 120 columns

### P2 — interactive stats and personal dashboard

- [ ] `ctx.ui.custom()` keyboard-friendly stats overlay (TUI only)
- [ ] Sort/filter exchange timings and cache usage
- [ ] Store explicit task labels only with opt-in (never record raw prompts by default)
- [ ] Per-project / daily usage aggregation with optional SQLite
- [ ] New API actual costs through opt-in, authenticated read-only integration
- [ ] Measure provider latency vs tool execution with separate instrumentation

### P3 — advanced personal UI

- [ ] Optional custom header (small ASCII mascot, disable on tiny terminals)
- [ ] Cute success/failure animation with reduced-motion option
- [ ] Configurable low-noise tool renderer, no mutation of underlying tool output
- [ ] Custom editor border / prompt marker using Pi's CustomEditor base
- [ ] Contrast and accessibility review across Windows Terminal, iTerm2, WezTerm, SSH/tmux
- [ ] RPC/Pi-Web parity by implementing equivalent UI in the browser client (not by assuming terminal components render in RPC)

## Guardrails and acceptance tests

1. No monkey-patch or fork Pi core; uninstall leaves normal Pi UI unaffected.
2. Extension must not add significant prompt tokens or change agent behavior.
3. `agent_settled` (not `agent_end`) marks the end of the measured elapsed time.
4. Cached token counters remain distinct from plain model input/output.
5. Force killed/unsettled exchanges are not fabricated; resumed old conversations show existing entries accurately.
6. Theme/terminal rendering must respect ANSI and double-width Unicode using Pi TUI helpers.
7. All custom editor work must preserve IME placement, focus propagation and Pi hotkeys.
8. RPC should degrade to no UI safely when the browser client does not implement the extension UI request.

## Official references

- https://pi.dev/docs/latest/extensions
- https://pi.dev/docs/latest/tui
- https://pi.dev/docs/latest/themes
- https://pi.dev/docs/latest/packages
