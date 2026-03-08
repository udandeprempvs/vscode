# Xorvis IDE

**Chip Designing AI-Powered IDE**

[![Built on VS Code](https://img.shields.io/badge/Built%20on-VS%20Code%20OSS-blue?logo=visualstudiocode)](https://github.com/microsoft/vscode)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE.txt)
[![Platform: macOS](https://img.shields.io/badge/Platform-macOS-lightgrey?logo=apple)](https://github.com/microsoft/vscode/blob/main/LICENSE.txt)

---

## What Is Xorvis IDE?

Xorvis IDE is a fork of [VS Code OSS](https://github.com/microsoft/vscode) tailored for chip design workflows. It embeds an AI agent chat panel **directly into the editor workbench** — not as a plugin or extension — giving the agent full awareness of your open file and workspace context at all times.

The AI panel connects to your own backend agent via a simple REST API. Your agent receives the active file content and workspace file tree with every message, so it can reason about your Verilog, SystemVerilog, VHDL, or any other chip design files and return targeted code edits.

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                    Xorvis IDE (Editor UI)                  │
│                                                           │
│  Monaco Editor · File Explorer · Terminal · Git · ...     │
│                                                           │
│  ┌────────────────────────────────────────────────────┐   │
│  │             Xorvis AI Panel (right sidebar)        │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │ XorvisService                                │  │   │
│  │  │   ├── IDEBridge                              │  │   │
│  │  │   │     • active file content                │  │   │
│  │  │   │     • workspace file tree (≤500 files)   │  │   │
│  │  │   └── AgentClient                            │  │   │
│  │  │         POST /chat  ──────────────────────►  │  │   │
│  │  │         ◄────────────────────  AI Response   │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  └────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
                              │
                     REST API (JSON)
                              │
              ┌───────────────▼───────────────┐
              │       AI Agent Backend        │
              │    (FastAPI / any HTTP server) │
              │                               │
              │  receives: messages + context  │
              │  returns:  response + patches  │
              └───────────────────────────────┘
```

---

## Features

- **Xorvis AI chat panel** — opens in the right sidebar with `Ctrl+Shift+X` / `Cmd+Shift+X`; powered entirely by your own agent
- **Automatic context injection** — every chat message includes the currently open file's path and full content, plus a list of all workspace files (up to 500, depth 3)
- **Code patch application** — your agent can return `patches` in the response; Xorvis applies them directly to the editor files with a single undo step
- **Markdown rendering** — assistant responses are rendered with code blocks, inline code, lists, and paragraphs
- **Isolated user data** — all settings stored in `~/.xorvis/` (macOS: `~/Library/Application Support/xorvis/`); never touches any existing VS Code installation
- **Full VS Code feature set** — syntax highlighting, IntelliSense, debugging, terminal, git integration, themes, and the full extension marketplace

---

## Custom Code Added to This Fork

Everything Xorvis-specific lives under `src/vs/workbench/contrib/xorvis/`. The rest of the codebase is standard VS Code OSS.

| File | Purpose |
|------|---------|
| `src/vs/workbench/contrib/xorvis/common/xorvis.ts` | TypeScript types (`IChatMessage`, `IAgentRequest`, `IAgentResponse`) and `IXorvisService` interface |
| `src/vs/workbench/contrib/xorvis/browser/agentClient.ts` | HTTP client — makes `POST /chat` requests to the configured endpoint |
| `src/vs/workbench/contrib/xorvis/browser/ideBridge.ts` | Gathers IDE context: active file content and workspace file tree |
| `src/vs/workbench/contrib/xorvis/browser/xorvisService.ts` | Service implementation — orchestrates the bridge, client, and patch application |
| `src/vs/workbench/contrib/xorvis/browser/xorvisViewPane.ts` | Chat panel UI (ViewPane) — message bubbles, textarea, send button |
| `src/vs/workbench/contrib/xorvis/browser/xorvis.css` | Styles using VS Code theme CSS variables |
| `src/vs/workbench/contrib/xorvis/browser/xorvis.contribution.ts` | Registers the view container, view, service, configuration, and commands |
| `scripts/xorvis-dev.sh` | Development launcher — starts the TypeScript watcher and opens the IDE |
| `scripts/xorvis-build-dmg.sh` | macOS DMG build — clean production build packaged as a distributable `.dmg` |
| `product.json` | IDE branding — name, bundle identifier, and data folder (`~/.xorvis/`) |

**Entry point registration:** `src/vs/workbench/workbench.common.main.ts` imports `xorvis.contribution.ts` so the panel loads on startup.

---

## Agent API Contract

Your AI agent backend must expose one HTTP endpoint. Xorvis calls it on every chat message.

### Request

```
POST {xorvis.apiEndpoint}
Content-Type: application/json
```

```json
{
  "messages": [
    {
      "role": "user",
      "content": "How do I add clock gating to this module?",
      "timestamp": 1709900000000
    }
  ],
  "context": {
    "currentFile": {
      "path": "/workspace/chip/top.v",
      "content": "module top(\n  input clk,\n  ...\n);\nendmodule"
    },
    "workspaceFiles": [
      "chip/top.v",
      "chip/alu.v",
      "chip/constraints.sdc",
      "chip/floorplan.def"
    ]
  }
}
```

**Notes:**
- `messages` is the full conversation history (all previous turns included)
- `context.currentFile` is `undefined` if no file is open in the editor
- `context.workspaceFiles` lists relative paths from the workspace root (max 500 entries, max depth 3); hidden directories and `node_modules`, `out`, `dist`, `build`, `target` are excluded

### Response

```json
{
  "content": "To add clock gating, insert a **clock gate cell**:\n\n```verilog\nCKGATE u_ck (\n  .CK(clk), .EN(enable), .GCK(gated_clk)\n);\n```\n\nThen replace `clk` with `gated_clk` in the always block.",
  "patches": [
    {
      "file": "chip/top.v",
      "start": 8,
      "end": 12,
      "code": "CKGATE u_ck (.CK(clk), .EN(enable), .GCK(gated_clk));\n\nalways @(posedge gated_clk) begin"
    }
  ]
}
```

**Notes:**
- `content` is required — rendered as Markdown in the chat panel
- `patches` is optional — if present, each patch replaces lines `start` through `end` (1-based, inclusive) in the given file with `code`
- File paths in patches are relative to the workspace root
- All patches are applied atomically with a single undo entry

### Minimal Python/FastAPI Example

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Message(BaseModel):
    role: str
    content: str
    timestamp: int

class Context(BaseModel):
    currentFile: dict | None = None
    workspaceFiles: list[str] = []

class ChatRequest(BaseModel):
    messages: list[Message]
    context: Context

@app.post("/chat")
def chat(req: ChatRequest):
    last_message = req.messages[-1].content
    current_file = req.context.currentFile

    # Your agent logic here
    response_text = your_agent.run(last_message, current_file, req.context.workspaceFiles)

    return {
        "content": response_text,
        # "patches": [...]  # optional
    }
```

---

## Getting Started (Development)

### Prerequisites

| Tool | Minimum Version | Install |
|------|----------------|---------|
| Node.js | 20 | [nodejs.org](https://nodejs.org) |
| Git | any | system package manager |
| Python | 3.10 | needed only for `xorvis-build-dmg.sh` |
| Xcode CLI | — | `xcode-select --install` (macOS only, for DMG) |

### 1. Clone the Repo

```bash
git clone <your-fork-url> xorvis-ide
cd xorvis-ide
```

### 2. Start the IDE in Dev Mode

```bash
./scripts/xorvis-dev.sh
```

This script:
1. Runs `npm ci` if `node_modules` is missing
2. Starts `npm run watch` in the background — TypeScript files are recompiled automatically on save (logs written to `.xorvis-watch.log`)
3. Waits for the initial compilation to finish (about 60 seconds on first run)
4. Launches Xorvis IDE

> **Note:** Electron does not hot-reload. After editing a `.ts` file, save it, wait for the watcher to recompile (watch the log), then restart the IDE.

### 3. Connect Your Agent

Open **Settings** (`Ctrl+,` / `Cmd+,`) and search for `xorvis`. Set:

```
xorvis.apiEndpoint = http://localhost:8000/chat
```

Make sure your agent is running at that address before opening the chat panel.

### 4. Open the Xorvis AI Panel

Press `Ctrl+Shift+X` (macOS: `Cmd+Shift+X`), or open the Command Palette (`Ctrl+Shift+P`) and run:

```
Xorvis: Open Xorvis AI
```

The panel opens in the right sidebar. Type your question and press **Enter** or click **Send**.

---

## Keyboard Shortcuts and Commands

| Action | Default Shortcut | Command Palette |
|--------|-----------------|-----------------|
| Open Xorvis AI panel | `Ctrl+Shift+X` / `Cmd+Shift+X` | `Xorvis: Open Xorvis AI` |
| Clear chat history | — | `Xorvis: Clear Xorvis AI Chat` |

---

## Configuration

All settings live under the `xorvis` namespace in VS Code Settings.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `xorvis.apiEndpoint` | `string` | `http://localhost:8000/chat` | Full URL of your AI agent's `/chat` endpoint. Change this if your agent runs on a different host or port. |

---

## Building a Distributable DMG (macOS)

The DMG script performs a **clean production build** from source and packages it as a macOS disk image ready to share with clients.

```bash
./scripts/xorvis-build-dmg.sh
```

What happens:
1. Deletes all previous build artifacts (`out/`, `out-build/`, etc.) to guarantee a fresh build
2. Runs `npm run gulp vscodedarwin-{arch}` — compiles TypeScript, bundles JS, packages the `.app`
3. Calls `build/darwin/create-dmg.ts` to create the DMG
4. Saves the final file to `dist/Xorvis-IDE-{arch}-{YYYYMMDD}.dmg`

> Requires: macOS, Xcode CLI, Node.js ≥ 20, Python ≥ 3.10. Build takes 10–20 minutes on first run.

### Client Installation

Send the `.dmg` file to your client. They:
1. Double-click the DMG
2. Drag **Xorvis IDE** to their `/Applications` folder
3. Open it — first launch creates `~/Library/Application Support/xorvis/` with a clean, empty configuration

No existing VS Code or Code-OSS settings are affected.

---

## Project Structure

```
xorvis-ide/
├── src/
│   └── vs/
│       └── workbench/
│           └── contrib/
│               └── xorvis/               ← All Xorvis AI code
│                   ├── common/
│                   │   └── xorvis.ts     ← Types + service interface
│                   └── browser/
│                       ├── agentClient.ts
│                       ├── ideBridge.ts
│                       ├── xorvisService.ts
│                       ├── xorvisViewPane.ts
│                       ├── xorvis.css
│                       └── xorvis.contribution.ts
├── scripts/
│   ├── xorvis-dev.sh                     ← Dev launcher
│   ├── xorvis-build-dmg.sh               ← Client DMG build
│   └── code.sh                           ← Upstream dev launcher (used internally)
├── product.json                          ← IDE identity and branding
└── build/
    └── darwin/
        └── create-dmg.ts                 ← DMG creation (upstream script, unmodified)
```

The rest of the codebase is standard VS Code OSS. Upstream changes can be merged without touching any Xorvis-specific files.

---

## How Edits Are Applied

When the agent returns a `patches` array, Xorvis IDE applies them using VS Code's built-in bulk edit service. Each patch specifies:

- `file` — path relative to the workspace root (e.g. `chip/top.v`)
- `start` — first line to replace (1-based)
- `end` — last line to replace (1-based, inclusive)
- `code` — the replacement text

All patches are applied as a single undoable operation. A notification appears: *"Xorvis AI applied N edit(s)."*

---

## License

Copyright (c) Microsoft Corporation (upstream VS Code OSS).
Xorvis IDE modifications copyright (c) Xorvis.

Licensed under the [MIT License](LICENSE.txt).
