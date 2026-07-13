# ai-agent

An AI-powered coding assistant CLI built with [Ink](https://github.com/vadimdemedes/ink) (React for CLIs) and TypeScript.

Connects to the OpenCode AI API to provide an interactive assistant with file system tools (read, write, edit, search, execute commands, etc.).

## Features

- **Interactive AI chat** in the terminal with streaming responses (content + reasoning)
- **11 built-in file system & shell tools** (read, write, edit, search, glob, exec bash, etc.)
- **Tool-calling loop**: AI can chain multiple tool calls automatically
- **Virtual tree-based rendering** — messages are built as a tree of `Node` objects and rendered into rows with syntax highlighting
- **Mouse support** — scroll wheel (buttons 64/65), click to select/collapse assistant reasoning blocks (via patched Ink SGR mouse protocol)
- **Token usage display** in the right info panel after each response
- **Two-column layout**: main chat area (left) + info panel (right) with usage stats
- **Multiline input** via `@inkjs/ui` TextInput with Shift+Enter for newlines
- **Streaming responses** with reasoning and content displayed incrementally
- **Scrollable output** with keyboard navigation (arrows, PageUp/Down, Home/End, mouse wheel)
- **Context window tracking** — shows token usage percentage (default window: 200,000 tokens)

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

### Production

```bash
npm run prod
```

### Windows Batch Launcher

After building, you can use `ai-agent.bat` to launch:

```bash
.\ai-agent.bat
```

## Project Structure

```
ai-agent-cli/
├── src/
│   ├── index.tsx              # Entry point — renders <App /> with Ink
│   └── ink/
│       ├── App.tsx            # Main app — two-column layout, keyboard/mouse input, tree-based rendering
│       ├── ai-service.ts      # ChatAI class — SSE streaming, tool-calling loop, .env loader
│       ├── ai.ts              # Tree rendering engine — render(), setTreeRole(), setupSelectedTree()
│       ├── models.ts          # All type definitions (ChatMessage, AiUsage, Node, TreeItem, etc.)
│       ├── tools.ts           # Tool definitions (11 tools) & executeTool() switch
│       ├── chunks.ts          # Mock SSE chunk data for offline testing
│       ├── Dialog.tsx         # Modal dialog component (e.g., confirmation dialogs)
│       ├── mock.ts            # Mock tree structure for UI development/testing
│       └── patch_ink.ts       # Documentation for the Ink SGR mouse protocol patch
├── dist/                      # Compiled JavaScript output (after `npm run build`)
├── patches/
│   └── ink+7.1.0.patch        # patch-package managed patch for Ink v7.1.0 (mouse support)
├── .env.example               # Environment config template (API key, model URL, model name)
├── .env                       # Local environment (gitignored)
├── .editorconfig              # Editor settings (UTF-8, 2-space indent, LF)
├── .gitignore                 # Ignores node_modules/, dist/, .env, *.log, .cache/, .DS_Store, etc.
├── .prettierignore            # Prettier ignores out, dist, pnpm-lock.yaml, etc.
├── .prettierrc.yaml           # Prettier config (single quotes, no semi, 100 width)
├── .vscode/
│   ├── extensions.json        # Recommended ESLint extension
│   ├── launch.json            # Debug configurations
│   └── settings.json          # Prettier as default formatter for TS/JS/JSON
├── node_modules/              # Dependencies (gitignored)
├── package.json
├── package-lock.json
├── tsconfig.json              # TypeScript config (ES2022, Node16 module, react-jsx)
├── eslint.config.mjs          # ESLint flat config (TypeScript, React, React Hooks, Prettier)
├── ai-agent.bat               # Windows launcher: `node dist\index.js`
├── Dockerfile.linux-builder   # Docker image for building Linux Electron packages on Windows
├── electron-builder.yml       # Electron-builder configuration for desktop builds
└── README.md
```

## Architecture Overview

### Core Flow

1. **Entry** (`src/index.tsx`) renders the `<App />` component using Ink (alternateScreen commented out for now).
2. **App.tsx** manages the UI state:
   - Tracks terminal dimensions (`rows`) and adjusts layout on resize
   - Maintains a `renderRows` array of `ReactNode[]` for the visible output
   - Uses a `TreeHolder` ref (`treeRef`) to track message structure as a virtual tree of `Node` objects
   - Handles keyboard input (arrows, page up/down, home/end, ctrl+c) and mouse events (scroll wheel, click)
   - Uses `TextInput` from `@inkjs/ui` for the prompt input field
   - Two-column layout: left side shows chat output + input, right side is a 50-char wide info panel with token usage
   - Input area is fixed at `INPUT_ROWS = 4` lines tall
   - Calls `chatAiRef.current.streamChat()` with callbacks for streaming updates
   - Follow output automatically by default, with manual scroll override
3. **ai.ts** renders the virtual tree:
   - `render(node, ctx, selected)` — recursively converts a `Node` tree into `RenderRow[]`
   - `setTreeRole(baseRole, role, tree, value)` — builds/updates the tree as streaming events arrive
   - `setupSelectedTree(tree, offset)` — handles click selection to toggle collapsible sections
   - `decodeLanguage()` — detects code block language from markdown fences for syntax highlighting
4. **ai-service.ts** (ChatAI class) handles:
   - Loading `.env` configuration (does not override existing env vars)
   - Making streaming API calls to OpenCode AI (SSE)
   - Prepending a system message describing available tools and project root
   - Parsing `delta.content`, `delta.reasoning_content`, and `delta.tool_calls` from SSE
   - Accumulating tool calls until `finish_reason: 'tool_calls'`
   - Executing tools via `executeTool()` and feeding results back into the conversation loop
   - Reporting usage stats via `onDone` callback (JSON string of token usage)
   - Emitting `ClientEvent` objects for UI updates via `onClientEvent` callback
5. **tools.ts** defines 11 tools with:
   - JSON Schema parameter definitions (for AI function calling)
   - Execution logic in `executeTool(name, args)` switch statement
   - Internal helpers: `listFilesRecursive`, `matchGlobPattern`, `matchSimplePattern`, `globFiles`, `grepFiles`
   - Path resolution relative to `process.cwd()` (project root)

### Virtual Tree Rendering

The app uses a custom tree-based rendering system instead of rendering Ink components directly for each message:

- **Nodes** (`Node` type) form a tree with two node types:
  - `text` — leaf node with a string value, optional syntax highlighting language, and render context (colors, borders, padding)
  - `box` — container node with `flexDirection` (row/column), optional `collapsible` flag, and children nodes
- **TreeItem** records track metadata per message: `baseRole`, `from` (row offset), `node` reference, `rows` (pre-rendered `RenderRow[]`), and `selected` state
- When streaming events arrive, `setTreeRole()` creates or updates `TreeItem` entries and re-renders affected rows
- The `RowView` component renders each `RenderRow` with its columns, applying `cli-highlight` for syntax highlighting
- `setupSelectedTree()` toggles `selected` on assistant items to show/hide collapsible reasoning blocks

### Streaming Architecture

The app uses **Server-Sent Events (SSE)** to stream AI responses. The `ChatAI` class emits:

| Callback | Signature | Purpose |
|----------|-----------|---------|
| `onClientEvent` | `(event: ClientEvent) => void` | Receives structured events (chunks, reasoning, tool calls) for UI updates |
| `onDone` | `(text: string) => void` | Called when streaming completes (receives JSON usage data) |
| `onError` | `(error: Error) => void` | Called on any streaming or parsing error |
| `onResponse` | `(messages: ChatMessage[]) => void` | Optional callback with full message history when a response cycle completes |

`ClientEvent` objects carry:
- `baseRole`: `'user' | 'assistant' | 'tool'`
- `role`: more specific role (e.g., `'assistantReasoningChunk'`, `'assistantChunk'`, `'toolCall'`, `'toolCallResponse'`)
- `value`: the text content or tool call summary

### Tool-Calling Loop

The AI can invoke tools automatically. The flow is:
1. AI response includes `tool_calls` in the delta
2. Tool calls are accumulated per index until `finish_reason: 'tool_calls'`
3. A complete `ChatMessage` (role: 'assistant') with all `tool_calls` is assembled
4. Each tool is executed via `executeTool(name, args)` and results are added as `role: 'tool'` messages
5. A second API call is made with the enriched conversation
6. This loop continues until the AI responds without tool calls

## Available Tools (11 total)

| Tool | Description |
|------|-------------|
| `read_file` | Read full contents of a file |
| `read_multiple_files` | Read multiple files at once (more efficient) |
| `write_file` | Create or overwrite a file with content |
| `edit_file` | Surgical string replacement in a file (finds exact oldString) |
| `list_directory` | List directory contents (supports recursive mode) |
| `glob_files` | Find files by glob pattern (`**/*.ts`, `src/**/*.css`, etc.) |
| `grep_search` | Regex search across files (with optional include pattern & max results) |
| `create_directory` | Create directories recursively |
| `delete_file` | Delete a file |
| `rename_file` | Rename or move a file |
| `execute_bash` | Execute a bash command (with configurable cwd & timeout) |

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

## Commands

| Script | Purpose |
|--------|---------|
| `npm start` | Run with `tsx` (development) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run prod` | Run compiled JS from `dist/` |
| `npm run format` | Format with Prettier |
| `npm run lint` | Lint with ESLint |
| `npm run typecheck` | Type-check with `tsc --noEmit` |

## Key Bindings

| Key | Action |
|-----|--------|
| `↑` / `↓` | Scroll output up / down by 5 lines |
| `PageUp` / `PageDown` | Scroll output by full page |
| `Home` | Jump to top of output |
| `End` | Jump to bottom of output |
| `Mouse wheel up` | Scroll up (SGR mouse button 64) |
| `Mouse wheel down` | Scroll down (SGR mouse button 65) |
| `Left click` | Select/collapse reasoning section |
| `Ctrl+C` | Exit the application |
| `Enter` | Submit prompt |
| `Shift+Enter` | Insert newline in prompt (multiline input) — handled by `@inkjs/ui` TextInput |

## Key Modules

### `src/ink/App.tsx`
The main application component. It:
- Tracks terminal dimensions and adjusts layout on resize
- Uses virtual tree-based rendering via `treeRef` (TreeHolder) instead of flat line/message arrays
- Enables SGR mouse tracking (`\x1b[?1002h` and `\x1b[?1006h`) on mount and disables on unmount
- Handles keyboard events for navigation, exit, and mouse-based scrolling/selection
- Calls `chatAiRef.current.streamChat()` with callbacks that feed into the tree rendering system
- Renders a two-column flex layout:
  - Left: visible rows (scrollable area) + TextInput prompt (4 lines)
  - Right: info panel (50 chars wide) with `ReportPanel` (token usage, loading state, errors)
- Uses `followOutputRef` to auto-scroll to the bottom; scroll offset overrides follow mode
- Contains `ReportPanel` component showing: total context %, prompt tokens, completion tokens, cache hit ratio, reasoning tokens
- Contains `RowView` memo component that renders individual rows with column values and syntax highlighting

### `src/ink/ai-service.ts`
The `ChatAI` class handles all AI communication. It:
- Loads `.env` file if present (does not override existing env vars) via `loadEnv()`
- Default `MODEL_URL`: `https://opencode.ai/zen/v1/chat/completions`
- Default `MODEL`: `deepseek-v4-flash-free`
- Maintains a `messages: ChatMessage[]` history internally
- Prepends a system message with tool instructions and project root
- `streamChat()` method: makes streaming API calls, processes SSE, handles tool-calling loop
- Internal handlers:
  - `processChunkHandler` — appends content to last assistant message, emits `ClientEvent`
  - `processReasoningChunkHandler` — appends reasoning to last assistant message, emits `ClientEvent`
  - `processToolCallHandler` — adds tool result message, emits tool call event
  - `processAssistantMessageHandler` — finalizes assistant message with tool_calls array
- Parses SSE stream with `TextDecoder` and line-by-line processing
- Handles `delta.content`, `delta.reasoning_content`, `delta.tool_calls` (index-based accumulation)
- Handles `finish_reason: 'tool_calls'`: assembles `ChatMessage` with `tool_calls`, executes each tool, pushes `role: 'tool'` messages, then loops

### `src/ink/ai.ts`
Tree rendering engine and utilities:
- **`render(node, ctx, selected)`** — recursively converts `Node` tree to `RenderRow[]`, applying context (padding, colors, borders)
- **`setTreeRole(baseRole, role, tree, value)`** — builds/updates the tree as streaming events arrive; creates `TreeItem` entries per role
- **`setupSelectedTree(tree, offset)`** — toggles `selected` state on assistant items (collapses/expands reasoning sections)
- **`decodeLanguage(str)`** — detects code block language from ` ``` ` fences (bash, typescript, javascript, diff, plaintext)
- **`toChatMessage(msg)`** — utility to convert `ChatMessage` objects for API calls

### `src/ink/models.ts`
All type definitions:
- `ChatMessage` — message structure for API communication (role, content, tool_calls, tool_call_id, reasoning)
- `ToolCallEvent` — tool call result passed to UI
- `AiUsage` — token usage breakdown (prompt_tokens, completion_tokens, total_tokens, cache info, reasoning tokens)
- `RenderContext`, `RenderColumn`, `RenderRow` — types for the virtual rendering system
- `Node` — union type: `{ type: 'text' }` or `{ type: 'box', flexDirection, children }` with optional render context
- `TreeItem` — per-message record: baseRole, role, from offset, node reference, pre-rendered rows, selected state
- `TreeHolder` — root tree reference with node tree, uniqueId counter, items array, rowsLength
- `AssistantRolesEnum` — enum of all role types (user, assistant, tool, chunk variants, tool call variants)
- `ClientEvent` — event structure passed from ChatAI to UI (baseRole, role, value)

### `src/ink/tools.ts`
Defines all tool schemas and execution logic:
- **File operations**: read, write, edit, delete, rename
- **Directory operations**: list, create
- **Search**: glob (custom pattern matching with `**`, `*`, `?`), grep (regex search with file:line output)
- **Command execution**: bash (with optional cwd and timeout, 10 MB buffer)
- Internal helpers:
  - `listFilesRecursive` — walks directories, skips `.`, `node_modules`, `.git`, `out`, `dist`, dotfiles
  - `matchGlobPattern` — recursive glob matching with `**` support
  - `matchSimplePattern` — single-segment wildcard matching (converts glob to regex)
  - `globFiles` — combines listing with pattern matching, falls back to substring matching if no wildcards
  - `grepFiles` — line-by-line regex search with include/exclude and max results
- Path resolution is relative to `process.cwd()` (project root)

### `src/ink/Dialog.tsx`
A simple modal dialog component:
- Renders a box with borderStyle="round" and borderColor="cyan"
- Shows a bold title, a content string, and an "[Enter] OK" button hint
- Used for confirmation prompts (currently wired in App.tsx but gated behind `showDialog` state, not yet functional)

### `src/ink/chunks.ts`
Empty array placeholder for mock SSE chunk data. Intended for offline testing of the streaming pipeline.

### `src/ink/mock.ts`
Provides a static mock `Node` tree for UI development/testing. Contains sample user input, assistant reasoning, and content sections.

### `src/ink/patch_ink.ts`
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

To regenerate the patch after an Ink version upgrade:
```bash
npm install ink@new-version
npx patch-package ink
```

## Configuration

### Environment Variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL_API_KEY` | (required) | API key for OpenCode AI |
| `MODEL_URL` | `https://opencode.ai/zen/v1/chat/completions` | API endpoint URL |
| `MODEL` | `deepseek-v4-flash-free` | Model name to use |

### `tsconfig.json`

- Target: `ES2022`
- Module: `Node16` with `Node16` resolution
- JSX: `react-jsx`
- Strict mode enabled
- Output: `dist/`
- Includes: `src/**/*.ts`, `src/**/*.tsx`

## ESLint Configuration (`eslint.config.mjs`)

Uses ESLint flat config with:
- `typescript-eslint` (TypeScript rules via `tseslint.configs.recommended`)
- `eslint-config-prettier` (Prettier integration)
- `eslint-plugin-react` (React rules + JSX runtime)
- `eslint-plugin-react-hooks` (Hooks rules)
- `eslint-plugin-react-refresh` (React Refresh rules)
- Settings: React version `detect`
- Ignores: `node_modules/`, `dist/`, `out/`

## Desktop Build (Experimental)

The project includes experimental Electron-builder configuration:

- **`electron-builder.yml`** — Builds Windows (NSIS installer), macOS (DMG), Linux (dir target by default on Windows; .deb and AppImage via Docker)
- **`Dockerfile.linux-builder`** — Container image with Linux toolchain to build .deb/AppImage on non-Linux systems

These are not currently integrated into npm scripts and are for future desktop packaging purposes.
