# OpenClaw Runtime Plugin

`fusion-plugin-openclaw-runtime` provides the `openclaw` runtime hint for Fusion agents by calling a **locally running OpenClaw gateway** over HTTP.

Unlike the default runtime, this plugin does **not** delegate to Fusion's internal pi runtime. It talks directly to OpenClaw's OpenAI-compatible endpoint.

## Prerequisites

1. Install OpenClaw globally:

```bash
npm i -g openclaw
```

2. Start your OpenClaw gateway with chat-completions endpoint enabled.
3. Ensure the gateway is reachable from Fusion (default: `http://127.0.0.1:18789`).

## Installation

### Option 1: Copy to plugins directory

```bash
cp -r fusion-plugin-openclaw-runtime ~/.fusion/plugins/
```

### Option 2: Install via CLI

```bash
fn plugin install ./plugins/fusion-plugin-openclaw-runtime
```

## Runtime Metadata

- **Plugin ID:** `fusion-plugin-openclaw-runtime`
- **Package name:** `@fusion-plugin-examples/openclaw-runtime`
- **Runtime ID:** `openclaw`
- **Runtime name:** `OpenClaw Runtime`
- **Version:** `0.1.0`

## Plugin Settings

Configure via plugin settings (`ctx.settings`) or environment variables.

| Setting key | Env fallback | Default |
| --- | --- | --- |
| `gatewayUrl` | `OPENCLAW_GATEWAY_URL` | `http://127.0.0.1:18789` |
| `gatewayToken` | `OPENCLAW_GATEWAY_TOKEN` | _unset_ |
| `agentId` | `OPENCLAW_AGENT_ID` | `main` |

Settings take precedence over environment variables.

## How Execution Works

For each prompt, the runtime sends a streaming request to:

- `POST /v1/chat/completions`
- `Content-Type: application/json`
- `Authorization: Bearer <gatewayToken>` (when configured)
- `x-openclaw-agent-id: <agentId>`

Request payload includes:

- `model: "openclaw:<agentId>"`
- `stream: true`
- `messages: [...]`
- `user: <stable-session-id>` (so repeated turns share a stable gateway session)

Streaming uses SSE (`data: ...` + `[DONE]`), with callbacks wired for:

- text deltas (`choices[0].delta.content`)
- reasoning deltas (`choices[0].delta.reasoning_content`)
- tool call lifecycle (`choices[0].delta.tool_calls`)

## Agent Configuration

Configure an agent to target OpenClaw via `runtimeConfig.runtimeHint`:

```json
{
  "name": "OpenClaw Executor",
  "role": "executor",
  "runtimeConfig": {
    "runtimeHint": "openclaw"
  }
}
```

## Notes

- This plugin no longer depends on `@fusion/engine`.
- Session cleanup is a no-op client-side; OpenClaw manages gateway sessions.

## Local Development

```bash
pnpm --filter @fusion-plugin-examples/openclaw-runtime test
pnpm --filter @fusion-plugin-examples/openclaw-runtime build
```
