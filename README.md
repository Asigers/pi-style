# pi-style

A **context-first terminal status bar, Forest Night theme, and local usage dashboard** for [Pi Coding Agent](https://pi.dev).

> v0.3.3 · Forest Night (dark), one color palette · no prompt injection · local-first.

## Terminal preview

```text
       /\       __
      /  \_____/  \__
     / ██  /\  ██   \_
    |   ● /  \ ●    |  BC / PI
    |      ▽        |  Border Collie
     \   \____/    /
      \____________/

CTX 42.0% 84k/200k │ newapi/gpt-6 │ THINK high │ 修复 Django 慢查询 │ 01:24 │ ~$0.145

# Narrow terminals use at most two footer lines:
CTX 42.0% 84k/200k │ THINK high
newapi/gpt-6
```

The Footer has **no logo, heart, decorative animation or cumulative input/output Token counters**. Its required fields are the **current context window**, **configured provider**, **full model ID**, and **effective thinking depth**. The thinking level is read from Pi's `ctx.thinkingLevel` and updates immediately on `thinking_level_select` (including `off`, `high`, `xhigh`). An explicit name from Pi's `/name` command appears when set; run duration and estimated cost follow when space allows. Input/output and cache totals remain available in `/pi-tui` and `/pi-usage`. If all three required fields cannot fit in one line, Pi uses two; on impossibly narrow terminals very long values are truncated with an ellipsis.

Context usage comes from Pi's `ctx.getContextUsage()` (not accumulated session tokens). Unknown usage, such as right after compaction, displays `CTX --%`. Provider is Pi's configured model provider; this does not imply detection of the real upstream behind a proxy such as New API.

One bundled theme: `pi-style-forest` (charcoal background, restrained sage-green accents, warm amber timer/warning, steel blue secondary details).

## Install / upgrade

```sh
pi install git:github.com/Asigers/pi-style
# existing installation:
pi update git:github.com/Asigers/pi-style
```

After installation, restart Pi or run `/reload`. The extension defers theme application until Pi has registered themes on reload, avoiding temporary missing-theme warnings. Theme switching remains in-memory and does not overwrite your configured theme.

For local development:

```sh
pi -e ./extensions/pi-style.ts --theme ./themes/pi-style-forest.json
```

## Commands

| Command | Purpose |
| --- | --- |
| `/pi-style cute` | Enable Forest Night theme, optional Border Collie header and subtle editor marker |
| `/pi-style compact` | Keep essential context/provider/model, hide header/editor decorations |
| `/pi-style off` | Restore built-in header/footer/editor and previous theme; metrics continue |
| `/pi-style theme` | Select the sole theme (`pi-style-forest`) |
| `/pi-style header on/off` | Show/hide Border Collie startup header |
| `/pi-style editor on/off` | Show/hide the minimal editor border marker |
| `/pi-style quiet on/off` | Collapse/restore built-in tool outputs (no tool content changes) |
| `/pi-tui` | Responsive dashboard: context, provider/model, tokens, estimated cost and tracked timing |
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

Token counts derive from Pi session ledger entries (assistant, tool results, standalone usage, compaction, branch summaries), preserving separate **input / output / cache read / cache write**. Estimated cost comes from Pi's usage metadata, **not the actual New API/provider bill**.

Conversation wall time is measured from `before_agent_start` to `agent_settled`. It includes tools, retries and automatic continuations. Optional telemetry fields `modelMs` and `toolMs` are **not** mutually-exclusive wall-time buckets: model duration observes assistant message span, and concurrent tool durations are summed.

- Each processed user message is recorded as a `pi-style.exchange` entry when the run settles. Queued inputs are segmented at user `message_start` boundaries. Shared runs explicitly record `sharedRun: true` and `timingBasis: "processing"`; queue waiting is not measured.
- Current branch totals follow Pi session-tree navigation, not abandoned sibling branches.
- A pre-installation conversation has historical token usage but **no retroactive timing records**. The overview shows an explicit empty state rather than misleading 0s totals.
- Forced termination before settlement produces no completed record.
- Queued user prompts in one continuous run produce individual processing segments. When batched, timing/usage attribution is approximate and explicitly marked.
- Optional `/pi-label` records **only** explicitly entered text (max 64 characters).
- Prompt texts, tool arguments and responses are not copied into the metrics index.

## Optional global analytics

Enable with `/pi-global on`. It stores a small JSONL index in:

`~/.pi/agent/pi-style/usage.jsonl`

Records contain timestamps, session ID, **absolute project directory path**, model, counters, costs, duration and optional label. This remains local; no uploads, HTTP, background processes or credentials.

`/pi-global off` stops future indexing, **does not delete existing data**. Export with `/pi-export` to the same directory. Dashboard Daily/Projects use that index when enabled; otherwise Daily shows current branch only.

## Compatibility and limitations

Designed against the latest `@earendil-works/pi-coding-agent` API. Component factories run **only in TUI mode**; RPC/Pi-Web needs its own browser rendering. Header replacement hides Pi's default startup hints; `/pi-style compact` restores them. Theme switching uses in-memory instances and does not overwrite the user's persisted theme setting; `/pi-style off` restores the prior theme. The custom footer can conflict with other extensions that also replace the footer, and manual theme changes during a session are not continuously monitored.

CuteEditor subclasses the built-in `CustomEditor`, calling the stock editing logic and only decorating the bottom border; normal shortcuts and IME processing are intentionally unchanged.

One theme is packaged. There is no browser/CSS layout, no actual provider billing reconciliation, no SQLite database, and no universal transcript re-skin. This repository is not a fork.

## Development

```sh
npm test
```

Tests cover full usage ledger, multi-message timing, in-memory theme restoration, TUI API interactions, session scan caching, session lifecycle, responsive layout, and optional global indexing. Manual end-to-end testing on Windows Terminal, tmux/SSH and Pi-Web is still recommended.

See [ROADMAP.md](docs/ROADMAP.md) for feature status and remaining tasks.

## License

MIT.
