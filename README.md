# pi-style ♡

A single-palette **cute terminal skin + usage atelier** for [Pi Coding Agent](https://pi.dev).

> v0.2.0 · Blush (dark), local-first · no fork · no model prompt injection.

## Screenshot-style preview

```text
       /\       __
      /  \_____/  \__
     / ██  /\  ██   \_
    |   ● /  \ ●    |  ♡ pi-style
    |      ▽        |  ✦ Border Collie
     \   \____/    /
      \____________/

♡ pi-style · gpt-6 · ↑12.5k ↓1.2k · cache 34.0k/0 · ~$0.120 · ✦ 1m 2s
```

Only **one theme** is bundled: `pi-style-blush`. It uses pink/lavender/sage on a dark background. Status/footer simplify automatically for narrow terminals (40/60/80/120 columns).

## Install / upgrade

```sh
pi install git:github.com/Asigers/pi-style
# existing installation:
pi update git:github.com/Asigers/pi-style
```

Restart Pi or use `/reload`. If the theme isn't available on first reload, select `pi-style-blush` in `/settings` and reload.

For local development:

```sh
pi -e ./extensions/pi-style.ts --theme ./themes/pi-style-blush.json
```

## Commands

| Command | Purpose |
| --- | --- |
| `/pi-style cute` | Enable Blush theme, optional Border Collie header, footer and input marker |
| `/pi-style compact` | Compact stats footer, hide header/editor decorations |
| `/pi-style off` | Restore built-in header/footer/editor and previous theme; metrics continue |
| `/pi-style theme` | Select the sole theme (`pi-style-blush`) |
| `/pi-style header on/off` | Show/hide Border Collie startup header |
| `/pi-style editor on/off` | Show/hide the cute editor border marker |
| `/pi-style quiet on/off` | Collapse/restore built-in tool outputs (no tool content changes) |
| `/pi-style motion on/off` | Animate/reduce footer heart motion (off by default) |
| `/pi-tui` | Interactive dashboard with four tabs |
| `/pi-usage` | Quick Token/Cache/Cost widget |
| `/pi-history` | Last five completed exchanges |
| `/pi-label <text>` | Optional label for *next* conversation; prompt is never stored |
| `/pi-global on/off/status` | Enable/disable cross-session metrics index (off by default) |
| `/pi-export` | Export the opt-in index as JSON |

### Dashboard keyboard shortcuts

- **1–4 / Tab / ← →**: Overview, History, Daily (UTC), Projects
- **j / k or ↑ / ↓**: scroll
- **s**: sort recent / slowest / tokens (History)
- **f**: filter all / successful / aborted (History)
- **q / Esc**: close

## What it measures

Token counts derive from assistant message usage, preserving separate **input / output / cache read / cache write**. Estimated cost comes from Pi's usage metadata, **not the actual New API/provider bill**.

Conversation wall time is measured from `before_agent_start` to `agent_settled`. It includes tools, retries and automatic continuations. Optional telemetry fields `modelMs` and `toolMs` are **not** mutually-exclusive wall-time buckets: model duration observes assistant message span, and concurrent tool durations are summed.

- Each settled exchange is persisted as a `pi-style.exchange` entry inside Pi's session JSONL.
- Current branch totals follow Pi session-tree navigation, not abandoned sibling branches.
- A pre-installation conversation has historical token usage but **no retroactive timing records**.
- Forced termination before settlement produces no completed record.
- Queued user prompts handled in one continuous agent run can share a single duration record.
- Optional `/pi-label` records **only** explicitly entered text (max 64 characters).
- Prompt texts, tool arguments and responses are not copied into the metrics index.

## Optional global analytics

Enable with `/pi-global on`. It stores a small JSONL index in:

`~/.pi/agent/pi-style/usage.jsonl`

Records contain timestamps, session ID, **absolute project directory path**, model, counters, costs, duration and optional label. This remains local; no uploads, HTTP, background processes or credentials.

`/pi-global off` stops future indexing, **does not delete existing data**. Export with `/pi-export` to the same directory. Dashboard Daily/Projects use that index when enabled; otherwise Daily shows current branch only.

## Compatibility and limitations

Designed against the latest `@earendil-works/pi-coding-agent` API. Component factories run **only in TUI mode**; RPC/Pi-Web needs its own browser rendering. Header replacement hides Pi's default startup hints; `/pi-style compact` restores them. The custom footer can conflict with other extensions that also replace the footer, and manual theme changes during a session are not continuously monitored.

CuteEditor subclasses the built-in `CustomEditor`, calling the stock editing logic and only decorating the bottom border; normal shortcuts and IME processing are intentionally unchanged.

One theme is packaged. There is no browser/CSS layout, no actual provider billing reconciliation, no SQLite database, and no universal transcript re-skin. This repository is not a fork.

## Development

```sh
npm test
```

Tests cover usage aggregation, session lifecycle, responsive layout, history sorting/filtering, theme completeness, and optional global index aggregation. Manual end-to-end testing on Windows Terminal, tmux/SSH and Pi-Web is still recommended.

See [ROADMAP.md](docs/ROADMAP.md) for feature status and remaining tasks.

## License

MIT.
