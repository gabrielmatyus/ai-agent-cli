# ai-agent-cli

An AI-powered coding assistant CLI built with [Ink](https://github.com/vadimdemedes/ink) (React for CLIs) and TypeScript.

Connects to the OpenCode AI API to provide an interactive assistant with file system tools (read, write, edit, search, execute commands, etc.).

## Features

- **Interactive AI chat** in the terminal with streaming responses (content + reasoning)
- **11 built-in file system & shell tools** (read, write, edit, search, glob, exec bash, etc.)
- **Tool-calling loop**: AI can chain multiple tool calls automatically
- **Virtual tree-based rendering** — messages are built as a tree of `Node` objects and rendered into rows with syntax highlighting
- **Mouse support** — scroll wheel (buttons 64/65), click to select/collapse assistant reasoning blocks (via patched Ink SGR mouse protocol). Press **F5** to switch into selection mode (mouse capture off) so the terminal's native text selection works.
- **Token usage display** in the right info panel after each response
- **Two-column layout**: main chat area (left) + info panel (right) with usage stats
- **Multiline input** via `@inkjs/ui` TextInput with Shift+Enter for newlines
- **Streaming responses** with reasoning and content displayed incrementally
- **Scrollable output** with keyboard navigation (arrows, PageUp/Down, Home/End, mouse wheel)
- **Context window tracking** — shows token usage percentage (default window: 200,000 tokens)
- **Request timeout** — every API request is aborted after 30s (`AbortSignal.timeout`)
- **Offline capture/replay (opt-in)** — set `AI_AGENT_CAPTURE=1` to write raw SSE chunks and message history to `src/ink/mocks/` for debugging and mock replay

## Prerequisites

- Node.js 20+
- An API key for OpenCode AI (or compatible API)

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` in the project root:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env` with your API key:

   ```env
   MODEL_API_KEY=your-api-key-here
   MODEL_URL=https://opencode.ai/zen/v1/chat/completions
   MODEL=deepseek-v4-flash-free
   ```

   > `MODEL_URL` and `MODEL` are optional — defaults are shown above.

## Usage

### Development (with hot-reload via tsx)

```bash
npm start
```

### Build

```bash
npm run build
```

Cleans `dist/` first, then compiles TypeScript.

### Production

```bash
npm run prod
```

### Launchers

After building, you can launch the compiled CLI with either the Windows batch file or the POSIX shell script:

```bash
# Windows
.\ai-agent-cli.bat

# Linux / macOS
./ai-agent-cli.sh
```

Both scripts simply run `node dist/index.js`.

## Project Structure

```
ai-agent-cli/
├── src/
│   ├── index.tsx              # Entry point — renders <App /> with Ink (alternate screen)
│   ├── ink/
│   │   ├── App.tsx            # Main app — two-column layout, input, mouse/keyboard, tree rendering
│   │   ├── agent.ts           # ChatAI class — SSE streaming, tool-calling loop, .env loader, 30s request timeout
│   │   ├── confirmation.ts    # Confirmation gate for destructive tools (AI_AGENT_CONFIRM)
│   │   ├── ui-models.ts       # Rendering type definitions (Node, TreeItem, TreeHolder, RenderRow, ...)
│   │   ├── models.ts          # API/data type definitions (ChatMessage, Usage, AssistantRolesEnum, ...)
│   │   ├── tools.ts           # 11 tool schemas & execute_tool() switch
│   │   ├── utils.ts           # Tree rendering engine + helpers (render, setTreeRole, rebuildTree, ...)
│   │   ├── Dialog.tsx         # Modal dialog component (not yet wired up)
│   │   ├── patch_ink.MD        # Doc for the Ink SGR mouse-protocol patch
│   │   └── mocks/             # Mock / offline test data & captured responses
│   │       ├── chunks.ts             # Mock SSE chunk data for offline testing (tracked)
│   │       ├── mock.ts               # Mock Node tree for UI dev/testing (tracked)
│   │       ├── chunks_response.txt    # Captured raw SSE chunks — written only with AI_AGENT_CAPTURE=1
│   │       └── messages_response.json # Captured message history — written only with AI_AGENT_CAPTURE=1
│   └── __tests__/             # Jest test suite (see "Testing" below)
│       ├── helpers/
│       │   └── ink-render.ts         # Fake streams + Ink render helper for component tests
│       ├── agent.test.ts      # ChatAI streaming / tool-calling / capture-gate logic
│       ├── app.test.tsx       # App UI integration tests (render, resize, mouse, keyboard, errors)
│       ├── dialog.test.tsx    # Dialog component tests
│       ├── chunks.test.ts     # Mock chunk data sanity
│       ├── mock.test.ts       # Mock tree sanity
│       ├── models.test.ts     # Type / enum behavior
│       ├── tools.test.ts      # Tool schema + execute_tool() tests
│       └── utils.test.ts      # Rendering / tree helpers (incl. rebuildTree reflow, code-block highlight)
├── patches/
│   └── ink+7.1.0.patch        # patch-package patch for Ink v7.1.0 (mouse support)
├── scripts/
│   └── verify-ink-patch.mjs   # Asserts ink@7.1.0 + mouse patch applied (CI job: verify:ink-patch)
├── .gitlab-ci.yml             # GitLab CI: lint, verify:ink-patch, typecheck, test, build
├── .env.example               # Environment config template (API key, model URL, model name)
├── .env                       # Local environment (gitignored)
├── .editorconfig              # Editor settings (UTF-8, 2-space indent, LF)
├── .gitignore                 # Ignores node_modules/, dist/, .env, coverage/, src/ink/mocks/, etc.
├── .prettierignore            # Prettier ignores out, dist, pnpm-lock.yaml, etc.
├── .prettierrc.yaml           # Prettier config (single quotes, no semi, 100 width)
├── .vscode/
│   ├── extensions.json        # Recommended ESLint extension
│   ├── launch.json            # Debug configurations
│   └── settings.json          # Prettier as default formatter for TS/JS/JSON
├── node_modules/              # Dependencies (gitignored)
├── dist/                      # Compiled JavaScript output (after `npm run build`)
├── coverage/                  # Jest coverage output (gitignored)
├── package.json
├── package-lock.json
├── tsconfig.json              # TypeScript config (ES2022, Node16 module, react-jsx)
├── eslint.config.mjs          # ESLint flat config (TypeScript, React, React Hooks, Prettier)
├── jest.config.ts             # Jest + ts-jest config (ESM)
├── ai-agent-cli.bat           # Windows launcher: `node dist\index.js`
├── ai-agent-cli.sh            # POSIX launcher: `node dist/index.js`
├── Dockerfile.linux-builder   # Docker image for building Linux Electron packages on Windows
├── electron-builder.yml       # Electron-builder configuration for desktop builds
├── .gitlab-ci.yml             # GitLab CI: lint, typecheck, test, build
├── PRODUCTION_READINESS_REPORT.md
└── README.md
```

## Architecture Overview

### Core Flow

1. **Entry** (`src/index.tsx`) renders the `<App />` component using Ink with `alternateScreen: true` and `incrementalRendering: true`.
2. **App.tsx** manages the UI state:
   - Tracks terminal dimensions (`rows`/`columns`) and adjusts layout on resize (recomputes `tree.columns` and calls `rebuildTree()`).
   - Maintains `reactNodes`/`renderRows` (the visible output) and a `TreeHolder` ref (`treeRef`) tracking message structure as a virtual tree of `Node` objects.
   - Handles keyboard input (arrows, page up/down, home/end, ctrl+c) and mouse events (scroll wheel, click).
   - Uses `TextInput` from `@inkjs/ui` for the prompt input field.
   - Two-column layout: left side shows chat output + input, right side is a 50-char wide info panel (`USAGE_PANEL`) with token usage.
   - Input area is fixed at `INPUT_ROWS = 4` lines tall.
   - Calls `chatAiRef.current.agent()` with `on_error`, `on_message`, and `on_usage` callbacks that feed into the tree rendering system.
   - Follows output automatically by default, with manual scroll override.
3. **utils.ts** renders the virtual tree:
   - `render(node, ctx, selected)` — recursively converts a `Node` tree into `RenderRow[]`.
   - `setTreeRole(msg, tree, msgs)` — builds/updates the tree as messages arrive.
   - `setupSelectedTree(tree, baseOffset, offset)` — handles click selection to toggle collapsible sections.
   - `getRealIndex(tree, baseOffset, offset)` — maps a visual scroll coordinate to a real row, accounting for multi-line heights.

- `rebuildTree(tree)` — single-pass reflow of all items (including user rows); used on resize.
  - Per-line syntax highlighting: `highlightLineLanguages()` derives each line's language purely from its content (markdown ` ``` ` fences), applied incrementally per message/reasoning box via a running fence state on each streamed chunk.

4. **agent.ts** (ChatAI class) handles:
   - Loading `.env` configuration at module load (does not override existing env vars).
   - Making streaming API calls to OpenCode AI (SSE via `fetch`), each aborted after 30s (`AbortSignal.timeout(30_000)`).
   - Prepending a system message describing available tools and project root.
   - Parsing `delta.content`, `delta.reasoning_content`, and `delta.tool_calls` from SSE.
   - Accumulating tool calls until `finish_reason: 'tool_calls'`.
   - Executing tools via `execute_tool()` and feeding results back into the conversation loop.
   - Reporting usage stats via the `on_usage` callback (a `Usage` object).
   - Optionally writing captured chunks/messages to `src/ink/mocks/` — only when `AI_AGENT_CAPTURE=1`.
5. **tools.ts** defines 11 tools with:
   - JSON Schema parameter definitions (for AI function calling).
   - Execution logic in `execute_tool(name, args)` switch statement.
   - Internal helpers: `listFilesRecursive`, `matchGlobPattern`, `matchSimplePattern`, `globFiles`, `grepFiles`.
   - Path resolution relative to `process.cwd()` (project root).

### Virtual Tree Rendering

The app uses a custom tree-based rendering system instead of rendering Ink components directly for each message:

- **Nodes** (`Node` type in `ui-models.ts`) form a tree with two node types:
  - `text` — leaf node with a string value, optional syntax-highlighting language, and render context (colors, borders, padding).
  - `box` — container node with `flexDirection` (row/column), optional `collapsible` flag, and children nodes.
- **TreeItem** records track metadata per message: `role`, `from` (row offset), the content boxes (user prompt, reasoning, content, tool calls/responses), `node` reference, pre-rendered `rows`, `selected` state, and `rowsCount`.
- When messages arrive, `setTreeRole()` creates or updates `TreeItem` entries and re-renders affected rows incrementally (`setNodeInTree`/`addNodeToTree`).
- The `RowView` component (in `App.tsx`) renders each `RenderRow` with its columns, applying `cli-highlight` for syntax highlighting.
- `setupSelectedTree()` toggles `selected` on assistant items to show/hide collapsible reasoning blocks.
- `rebuildTree()` re-renders all items in a single pass and recomputes cumulative offsets (used after a terminal resize).

### Streaming Architecture

The app uses **Server-Sent Events (SSE)** to stream AI responses. `ChatAI.agent()` opens a streaming `fetch` to `MODEL_URL` and loops `while (continue_reasoning)`. Raw bytes are decoded and split on `\n\n` into SSE events; `split_data()` extracts each `data:` JSON payload (skipping `[DONE]` and `x-opencode-type` frames).

| Callback     | Signature                    | Purpose                                                                                       |
| ------------ | ---------------------------- | --------------------------------------------------------------------------------------------- |
| `on_message` | `(msg: ChatMessage) => void` | Called whenever a message is added/updated (user, streamed assistant content, or tool result) |
| `on_usage`   | `(usage: Usage) => void`     | Called when a `usage` object appears in a chunk                                               |
| `on_error`   | `(error: Error) => void`     | Called on any HTTP/stream/parse error                                                         |

In `App.tsx`, `on_message` is wired to `setTreeRole()` + `updateComponentRows()`, `on_usage` updates the `ReportPanel`, and `on_error` displays an error message.

`FetchMethod` supports `STREAM`, `POST`, `MOCK_STREAM`, and `MOCK_POST`. The mock variants read from `src/ink/mocks/chunks.ts` (`mock_chunks`) so the pipeline can be exercised offline.

> **Note:** `agent()` captures a run only when `AI_AGENT_CAPTURE=1` is set, writing `chunks_response.txt` and `messages_response.json` into `src/ink/mocks/`. Those captured outputs are git-ignored; the static fixtures (`chunks.ts`, `mock.ts`) are tracked.

### Tool-Calling Loop

The AI can invoke tools automatically. The flow is:

1. AI response includes `tool_calls` in the delta.
2. Tool calls are accumulated per index (via `process_stream`) until `finish_reason: 'tool_calls'`.
3. A complete `ChatMessage` (role: 'assistant') with all `tool_calls` is assembled.
4. Each tool is executed via `execute_tool(name, JSON.parse(arguments))` and results are added as `role: 'tool'` messages.
5. A subsequent API call is made with the enriched conversation.
6. This loop continues until the AI responds without tool calls.

## Available Tools (11 total)

| Tool                  | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `read_file`           | Read full contents of a file                                            |
| `read_multiple_files` | Read multiple files at once (more efficient)                            |
| `write_file`          | Create or overwrite a file with content                                 |
| `edit_file`           | Surgical string replacement in a file (finds exact oldString)           |
| `list_directory`      | List directory contents (supports recursive mode)                       |
| `glob_files`          | Find files by glob pattern (`**/*.ts`, `src/**/*.css`, etc.)            |
| `grep_search`         | Regex search across files (with optional include pattern & max results) |
| `create_directory`    | Create directories recursively                                          |
| `delete_file`         | Delete a file                                                           |
| `rename_file`         | Rename or move a file                                                   |
| `execute_bash`        | Execute a bash command (with configurable cwd & timeout)                |

> **Destructive tools require confirmation.** `write_file`, `delete_file`, `rename_file`, and `execute_bash` pop a confirmation dialog with **Allow**/**Deny** buttons before running (see [Destructive Tool Confirmation](#destructive-tool-confirmation)).

### Tool Details

#### `read_file`

- Reads entire file as UTF-8 string
- Returns error if file not found

#### `read_multiple_files`

- Reads multiple files in a single call
- Each file is prefixed with `--- filename (N lines) ---`
- More efficient than calling `read_file` repeatedly

#### `write_file`

- Creates or overwrites a file with given content
- Returns bytes written confirmation

#### `edit_file`

- Finds exact `oldString` in file and replaces with `newString`
- Uses `String.replace()` (replaces first occurrence)
- Returns line number where replacement occurred
- Errors if `oldString` not found

#### `list_directory`

- Non-recursive: lists entries with file sizes (excluding dotfiles)
- Recursive: full tree using `listFilesRecursive` (skips `.`, `..`, `node_modules`, `.git`, `out`, `dist`)

#### `glob_files`

- Custom glob implementation supporting `*`, `**`, `?`
- If pattern has no wildcards, falls back to exact/prefix/substring matching
- Returns relative paths from base directory

#### `grep_search`

- Line-by-line regex search across files
- Supports optional `includePattern` glob filter
- Limited to `maxResults` (default: 50)
- Returns `file:line: content` format
- Skips binary/unreadable files

#### `create_directory`

- Creates directory with `{ recursive: true }`

#### `delete_file`

- Deletes a file (not a directory)

#### `rename_file`

- Renames or moves a file
- Errors if target already exists

#### `execute_bash`

- Executes shell command via `execSync`
- Configurable `cwd` (defaults to project root) and `timeout` (default: 30000ms)
- Returns stdout on success
- On error, returns exit code + stdout + stderr
- Max buffer: 10 MB

## Destructive Tool Confirmation

Four tools can change or remove data and are therefore gated behind a user confirmation before they execute:

- `write_file`, `delete_file`, `rename_file`, `execute_bash`

When the agent wants to call one of these in an interactive terminal, a small confirmation dialog pops over the UI:

```text
╭──── Allow execute_bash? ────╮
│  execute_bash: rm -rf /tmp/x │
│  ╭───────╮ ╭──────╮         │
│  │[Allow]│ │ Deny │         │
│  ╰───────╯ ╰──────╯         │
│  ←/→ move · Enter confirm · Esc deny │
╰──────────────────────────────╯
```

- `Deny` is the default; `→` (or `Tab`) selects `Allow`, `Enter` confirms, `Esc` denies.
- The dialog does not disturb the streaming layout (the old stderr `[y/N]` prompt is gone).
- **One approval trusts the rest of the task:** after you allow a destructive call, the agent's follow-up destructive calls while finishing the same prompt run without asking again (no repeat dialogs for the same test runs). The next prompt starts a fresh task with a clean slate.
- Approving/denying via `Enter` never re-submits the input box, so it cannot spawn a duplicate agent run.
- A denial is returned to the model as a tool result (`User denied: <tool>: <target>`), so the agent can react.

Behavior is controlled by the `AI_AGENT_CONFIRM` environment variable:

| Value    | Result                                                           |
| -------- | ---------------------------------------------------------------- |
| (unset)  | Show the interactive dialog (requires a TTY); otherwise **deny** |
| `always` | Automatically allow every destructive call                       |
| `never`  | Automatically deny every destructive call                        |

In non-interactive environments (CI, tests, piped stdin) with `AI_AGENT_CONFIRM` unset, destructive tools are **denied by default**.

## Commands

| Script               | Purpose                               |
| -------------------- | ------------------------------------- |
| `npm start`          | Run with `tsx` (development)          |
| `npm run build`      | Clean `dist/` then compile TypeScript |
| `npm run prod`       | Run compiled JS from `dist/`          |
| `npm run format`     | Format with Prettier                  |
| `npm run lint`       | Lint with ESLint                      |
| `npm run typecheck`  | Type-check with `tsc --noEmit`        |
| `npm test`           | Run Jest test suite + coverage        |
| `npm run test:watch` | Run tests in watch mode               |

## Testing

The project includes a Jest + `ts-jest` test suite (ESM, `node` environment) under `src/__tests__/`:

- `agent.test.ts` — `ChatAI` streaming & tool-calling behavior, capture gate, request timeout
- `app.test.tsx` — `App` UI integration (render, resize, mouse wheel/click, keyboard, error panel) via `helpers/ink-render.ts`
- `confirmation.test.ts` — destructive-tool confirmation gate (`AI_AGENT_CONFIRM`, non-interactive deny)
- `dialog.test.tsx` — `Dialog` component rendering and callbacks
- `tools.test.ts` — tool schemas and `execute_tool()`
- `utils.test.ts` — rendering/tree helpers (`render`, `setTreeRole`, `getRealIndex`, `rebuildTree` resize reflow)
- `models.test.ts` — data types and `AssistantRolesEnum`/`FetchMethod` enums
- `mock.test.ts` / `chunks.test.ts` — mock data sanity

Configuration lives in `jest.config.ts` (preset `ts-jest`, `useESM: true`, coverage collected from `src/**` excluding `mocks`). Run with `npm test`; use `npm run test:watch` for watch mode.

## Key Bindings

| Key                   | Action                                                                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `↑` / `↓`             | Scroll output up / down by 5 lines                                                                                                                                                                                |
| `PageUp` / `PageDown` | Scroll output by full page                                                                                                                                                                                        |
| `Home`                | Jump to top of output                                                                                                                                                                                             |
| `End`                 | Jump to bottom of output                                                                                                                                                                                          |
| `Mouse wheel up`      | Scroll up (SGR mouse button 64)                                                                                                                                                                                   |
| `Mouse wheel down`    | Scroll down (SGR mouse button 65)                                                                                                                                                                                 |
| `Left click`          | Select/collapse reasoning section                                                                                                                                                                                 |
| `F5`                  | Toggle **selection mode**: turns off mouse capture so the terminal's native text selection (drag + copy) works again; press F5 to re-enable wheel scroll & click. Default off with `AI_AGENT_CLI_DISABLE_MOUSE=1` |
| `Ctrl+C`              | Exit the application                                                                                                                                                                                              |
| `Enter`               | Submit prompt                                                                                                                                                                                                     |
| `Shift+Enter`         | Insert newline in prompt (multiline input) — handled by `@inkjs/ui` TextInput                                                                                                                                     |

## Key Modules

### `src/ink/App.tsx`

The main application component. It:

- Tracks terminal dimensions and adjusts layout on resize (`stdout.on('resize')` → recompute `tree.columns` and call `rebuildTree()`).
- Uses virtual tree-based rendering via `treeRef` (TreeHolder) instead of flat line/message arrays.
- Enables SGR mouse tracking (`\x1b[?1002h` and `\x1b[?1006h`) on mount and disables on unmount. Because mouse capture suppresses the terminal's own drag-select, `F5` toggles the tracking off/on (selection vs. interactive mode); the current state is shown in the bottom-left panel. The mouse stream is watched directly on `stdin` for the F5 sequence since Ink's `Key` type exposes no F-key flags.
- Handles keyboard events for navigation, exit, and mouse-based scrolling/selection.
- Calls `chatAiRef.current.agent()` with `on_error`/`on_message`/`on_usage` callbacks that feed the tree rendering system.
- Renders a two-column flex layout:
  - Left: visible rows (scrollable output window, `contentLines` tall) + `TextInput` prompt (`INPUT_ROWS = 4`).
  - Right: info panel (`USAGE_PANEL = 50` cols) with `ReportPanel` (token usage, loading state, errors).
- Uses `followOutput` to auto-scroll to the bottom; a manual scroll offset overrides follow mode.
- Contains `ReportPanel` showing: total context %, prompt tokens, completion tokens, cache hit ratio, reasoning tokens.
- Contains `RowView` memo component that renders individual rows with column values and `cli-highlight` syntax highlighting.
- Contains a `Dialog` modal wired behind a `showDialog` flag (not yet functional).

### `src/ink/agent.ts`

The `ChatAI` class handles all AI communication. It:

- Loads `.env` at module load via `loadEnv()` (does not override existing env vars).
- Defaults: `MODEL_URL = https://opencode.ai/zen/v1/chat/completions`, `MODEL = deepseek-v4-flash-free`, `API_KEY` from `MODEL_API_KEY`.
- Maintains a `messages: ChatMessage[]` history internally.
- Prepends a system message with tool instructions and project root.
- `agent(model, on_error, on_message, on_usage)` — the main loop: streams via `fetch` (aborted after 30s), processes SSE, runs the tool-calling loop, and — only when `AI_AGENT_CAPTURE=1` — writes captured chunks/messages to `src/ink/mocks/`.
- `process_stream(chunk, messages, tool_calls, on_message, on_usage)` — appends content/reasoning to the last assistant message, accumulates `tool_calls` per index, and runs tools on `finish_reason: 'tool_calls'`.
- `process_post(chunk, messages, on_message, on_usage)` — non-streaming variant of the same flow.
- `split_data(raw)` — splits SSE `data:` frames, skipping `[DONE]` and `x-opencode-type` objects.
- `fetch_data(...)` — dispatches by `FetchMethod` (STREAM/POST/MOCK_STREAM/MOCK_POST); mock variants read from `mocks/chunks.ts`.

### `src/ink/ui-models.ts`

All rendering type definitions:

- `RenderContext` — padding, colors, borders, height bounds.
- `RenderColumn`, `RenderContentBox` — leaf and box node shapes.
- `Node` — union of `text` leaf or `box` container (with optional render context).
- `RenderRow` — a rendered line: key, columns, optional `item` back-reference.
- `TreeItem` — per-message record: `role`, `from` offset, content boxes (user prompt, reasoning, content, tool calls/responses), `node`, pre-rendered `rows`, `selected` state, `rowsCount`.
- `TreeHolder` — root tree: `node`, `uniqueId` counter, `items` array, `rowsCount`, `columns` (terminal width minus side panel), `rows`.

### `src/ink/models.ts`

All API/data type definitions:

- `ChatMessage` — message structure for API communication (role, content, tool_calls, tool_call_id, reasoning/reasoning_content).
- `FunctionModel`, `FunctionDefinition`, `ToolCallEvent`.
- `AssistantRolesEnum` — enum of roles: `system`, `user`, `assistant`, `tool`.
- `Data`, `Choice`, `Delta`, `ToolCall`, `ToolCallState` — SSE/chunk shapes.
- `Usage` — token usage breakdown (prompt/completion/total tokens, cache hit/miss, prompt/completion token details).
- `FetchMethod` — enum: `STREAM`, `POST`, `MOCK_STREAM`, `MOCK_POST`.

### `src/ink/utils.ts`

Tree rendering engine and utilities:

- **`render(tree, node, ctx, selected)`** — recursively converts a `Node` tree to `RenderRow[]`, applying context (padding, colors, borders); honors `collapsible` (only rendered when `selected`).
- **`setTreeRole(msg, tree, msgs)`** — builds/updates the tree as messages arrive; appends streamed content/reasoning token-by-token.
- **`setupSelectedTree(tree, baseOffset, offset)`** — toggles `selected` state on assistant items (collapses/expands reasoning sections).
- **`getRealIndex(tree, baseOffset, offset)`** — maps a visual scroll coordinate to a real row, accounting for multi-line row heights.
- **`rebuildTree(tree)`** — single-pass re-render/reflow of all items with cumulative offsets (used on resize).
- **`highlightLineLanguages(lines)`** — pure per-line syntax highlighting: detects ` ``` ` fence open/close and the marker language (`bash`, `typescript`, `javascript`, `diff`, unknown markers passed through, unmarked fences default to `plaintext`); used by `setupBoxAppend`/`setupBoxAppendToken` so each message/reasoning box keeps its own highlight state.
- **`toChatMessage(msg)`** — utility to convert a `ChatMessage` for API calls.
- Internal helpers: `setNodeInTree`, `addNodeToTree`, `getNodeByRole` (build/place tree nodes).

### `src/ink/tools.ts`

Defines all tool schemas and execution logic:

- **File operations**: read, write, edit, delete, rename.
- **Directory operations**: list, create.
- **Search**: glob (custom pattern matching with `**`, `*`, `?`), grep (regex search with `file:line` output).
- **Command execution**: bash (with optional `cwd` and `timeout`, 10 MB buffer).
- `tools: ToolDefinition[]` — 11 tools with JSON Schema parameters.
- `execute_tool(name, args, options?)` — switch dispatching to the operations above. Destructive tools (`write_file`, `delete_file`, `rename_file`, `execute_bash`) first go through the confirmation gate in `confirmation.ts` (skipped when `options.skipConfirmation` is set).
- Internal helpers:
  - `listFilesRecursive` — walks directories, skips `.`, `node_modules`, `.git`, `out`, `dist`, dotfiles.
  - `matchGlobPattern` — recursive glob matching with `**` support.
  - `matchSimplePattern` — single-segment wildcard matching (converts glob to regex).
  - `globFiles` — combines listing with pattern matching, falls back to substring matching if no wildcards.
  - `grepFiles` — line-by-line regex search with include/exclude and max results.
- Path resolution is relative to `process.cwd()` (project root).

### `src/ink/Dialog.tsx`

A simple modal dialog component:

- Renders a box with `borderStyle="round"` and `borderColor="cyan"`.
- Shows a bold title, a content string, and an "[Enter] OK" button hint.
- Used for confirmation prompts (currently wired in App.tsx but gated behind `showDialog` state, not yet functional).

### `src/ink/mocks/`

Offline testing and capture data:

- `chunks.ts` — mock SSE chunk array (`mock_chunks`) for offline/mock testing (tracked in git).
- `mock.ts` — static mock `Node` tree for UI development/testing (tracked in git).
- `chunks_response.txt` / `messages_response.json` — written by `ChatAI.agent()` during a run **only when `AI_AGENT_CAPTURE=1`** (captured data; git-ignored).

### `src/ink/patch_ink.MD`

Documentation-only file explaining the Ink mouse support patch. The actual patch is managed by `patch-package` in `patches/ink+7.1.0.patch`.

## Ink Mouse Patch

Ink v7.1.0 does not natively support mouse events. The project patches two files via `patch-package`:

### Patched files:

1. **`node_modules/ink/build/parse-keypress.js`** — adds SGR mouse sequence parsing
   - Matches `\x1b[<button;x;y{M|m}` sequences
   - Returns `{ name: 'mouse', mouse: { button, x, y, pressed } }`

2. **`node_modules/ink/build/hooks/use-input.js`** — passes mouse data through to the key object
   - Adds `mouse: keypress.mouse` to the key object
   - Sets `input = ''` when `keypress.name === 'mouse'`

The patch is automatically applied after every `npm install` via the `postinstall` script (`patch-package`).

> **Note:** `ink` is pinned to the exact version `7.1.0` (`"ink": "7.1.0"`). `npm run verify:ink-patch` asserts that `node_modules/ink` is `7.1.0` **and** that both patched markers are present (e.g. `mouse: keypress.mouse` in `use-input.js`); it is wired into CI as the `verify:ink-patch` job so a drifted install fails the pipeline. See `PRODUCTION_READINESS_REPORT.md`.

To upgrade Ink (and regenerate the patch for the new version):

```bash
npm install ink@new-version
npx patch-package ink
npm run verify:ink-patch
```

## Configuration

### Environment Variables (`.env`)

| Variable           | Default                                       | Description                                                           |
| ------------------ | --------------------------------------------- | --------------------------------------------------------------------- |
| `MODEL_API_KEY`    | (required)                                    | API key for OpenCode AI                                               |
| `MODEL_URL`        | `https://opencode.ai/zen/v1/chat/completions` | API endpoint URL                                                      |
| `MODEL`            | `deepseek-v4-flash-free`                      | Model name to use                                                     |
| `AI_AGENT_CAPTURE` | (unset)                                       | Set to `1` to write captured chunks/messages into `src/ink/mocks/`    |
| `AI_AGENT_CONFIRM` | (unset)                                       | Destructive-tool confirmation: prompt (default), `always`, or `never` |

### `tsconfig.json`

- Target: `ES2022`
- Module: `Node16` with `Node16` resolution
- JSX: `react-jsx`
- Strict mode enabled
- Output: `dist/`
- Includes: `src/**/*.ts`, `src/**/*.tsx`

## ESLint Configuration (`eslint.config.mjs`)

Uses ESLint flat config (via `eslint/config`'s `defineConfig`) with:

- `typescript-eslint` (TypeScript rules via `tseslint.configs.recommended`)
- `eslint-config-prettier` (Prettier integration)
- `eslint-plugin-react` (React rules + JSX runtime)
- `eslint-plugin-react-hooks` (Hooks rules)
- `eslint-plugin-react-refresh` (React Refresh rules)
- Settings: React version `detect`
- Ignores: `node_modules/`, `dist/`, `out/`, `coverage/`

## CI/CD

- **`.github/workflows/ci.yml`** — GitHub Actions running `lint`, `typecheck`, `test`, and `build` jobs on push/PR to `main`/`master`.
- **`.gitlab-ci.yml`** — GitLab CI with the same four stages (`lint`, `typecheck`, `test`, `build`); the `build` stage uploads `dist/` as a pipeline artifact.
- **`.github/agents/ink-ui-agent.agent.md`** — a GitHub Copilot agent definition scoped to the Ink/React UI code in `src/ink/`.

## Desktop Build (Experimental)

The project includes experimental Electron-builder configuration:

- **`electron-builder.yml`** — Builds Windows (NSIS installer), macOS (DMG), Linux (dir target by default on Windows; .deb and AppImage via Docker)
- **`Dockerfile.linux-builder`** — Container image with Linux toolchain to build .deb/AppImage on non-Linux systems

These are not currently integrated into npm scripts and are for future desktop packaging purposes.

## Status

See [`PRODUCTION_READINESS_REPORT.md`](./PRODUCTION_READINESS_REPORT.md) for the current production-readiness assessment (pipeline status, resolved items, and outstanding issues).
