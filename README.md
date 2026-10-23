# pi-style ♡

A small, cute, **local-first** terminal usage tracker for [Pi Coding Agent](https://pi.dev).

## v0.1 features

- Persistent footer status: input / output tokens, cache read/write, estimated cost, elapsed time.
- **Wall-clock time per user request** (from `before_agent_start` to `agent_settled`), including model calls, tool work, retries and automatic continuations.
- A live timer while the agent works, plus optional time-to-first-content.
- Records each completed exchange as a **custom session entry** in Pi's existing JSONL session file; no database or background service.
- Two display modes: `cute` (default) and `compact`. Can disable the UI without disabling recording.
- On-demand summary and recent exchange history through slash commands.
- No prompt content is stored; only metrics and timestamps.

### Install

Use the package directly from GitHub (Pi 1.0+):

```sh
pi install git:github.com/Asigers/pi-style
```

Reload an existing Pi session with `/reload`, or start Pi again.

For development from a local checkout:

```sh
pi -e ./extensions/pi-style.ts
```

> The Git installation uses the `pi` manifest in `package.json` to load the extension. The local single-file invocation also resolves `src/metrics.ts` from the checkout.

### Commands

| Command | Purpose |
| --- | --- |
| `/pi-style cute` | Soft/cute status bar (default) |
| `/pi-style compact` | Minimal status bar |
| `/pi-style off` | Hide the UI (recording continues) |
| `/pi-usage` | Toggle the detailed usage and context panel |
| `/pi-history` | Toggle the last five recorded exchanges |

Example:

```text
♡ pi-style · gpt-6 · ↑12.5k ↓1.2k · cache 34.0k/0 · ~$0.1200 · ⏳ 8s
```

The `↑` / `↓` values are model input / output only; cache fields are reported separately. Displayed cost comes from Pi's message usage, **not** the actual New API / provider bill.

### What “conversation time” means

One **exchange** is one submitted user prompt through Pi's normal agent workflow, ending when Pi **settles** (not merely when one model call finishes). The stored `elapsedMs` includes tool execution, retries and compaction performed before settling; it measures wall time, not API latency or human time typing.

- Session summaries aggregate the **current session tree branch**; navigating to another branch changes the displayed totals.
- Each successfully settled exchange is stored using `pi.appendEntry("pi-style.exchange", ...)`; `/resume` will retain those records.
- Previous messages created *before installation* keep their token usage but have no retroactive per-exchange duration.
- If Pi is force-killed or reloaded before `agent_settled`, the unfinished exchange is not recorded.
- Queued user messages that Pi processes in one continuous busy interval can be grouped into one timing record.
- Total session cost is an estimate from Pi usage metadata. Nested tool model calls, summaries, provider accounting, or incorrectly priced custom models may differ.
- No external analytics, HTTP requests, or file watchers.

### Development

```sh
npm test
```

Tests use Node 22+ built-in TypeScript stripping and the test runner. No runtime npm dependency is required.

### Compatibility

Targets the current `@earendil-works/pi-coding-agent` Extension API (Pi 1.0+). Older Pi releases may have different event semantics. Interactive terminal mode displays status/widgets; RPC front ends such as Pi-Web may ignore those UI requests unless they implement the extension UI protocol.

### Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the cute TUI plan and compatibility boundary. This package intentionally does **not** replace Pi's core editor, footer or terminal renderer yet.

### License

MIT.
