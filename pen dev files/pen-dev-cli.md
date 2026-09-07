import { Callout } from 'nextra/components'

# pen.dev CLI

The pen.dev CLI is a standalone command-line tool for creating and editing `.pen` design files from the terminal. It runs the same editor engine as the desktop app and IDE extension, fully headless — no GUI required.

Use it to run the AI agent with a prompt, call MCP tools directly in an interactive shell, batch-process multiple designs, or export to PNG/JPEG/WEBP/PDF.

---

## Installation

```bash
npm install -g @pen.dev/cli
```

Verify the installation:

```bash
pen version
```

<Callout type="info">
Requires Node.js 18 or later.
</Callout>

---

## Authentication

The CLI requires authentication before running agent operations. There are two methods.

### Interactive Login

```bash
pen login
```

This starts an interactive session where you choose your login method (email + password or email + OTP code). On success the session token is stored in `~/.pencil/session-cli.json`.

### CLI Key (for CI/CD)

Set the `PEN_CLI_KEY` environment variable. CLI keys are scoped to an organization and can be created in the **Developer Keys** section of your organization settings on the pen.dev web app.

```bash
PEN_CLI_KEY=pencil_cli_... pen --out design.pen --prompt "Create a form"
```

<Callout>
The CLI key always takes precedence over a stored session token.
</Callout>

### Checking Status

```bash
pen status
```

Displays the current authentication method, verifies the session with the backend, and shows account details.

---

## Quick Start

```bash
# Log in first
pen login

# Create a new design from scratch
pen --out design.pen --prompt "Create a login page with email and password fields"

# Modify an existing design
pen --in existing.pen --out modified.pen --prompt "Add a blue submit button"

# Export a design to PNG
pen --in design.pen --export design.png

# Start an interactive shell
pen interactive -o design.pen

# List available models
pen --list-models
```

---

## Commands

### `pen login`

Log in interactively via email + password or email + OTP.

### `pen status`

Check authentication status and display account details.

### `pen version`

Print the installed CLI version.

### `pen interactive`

Start an interactive tool shell. See [Interactive Mode](#interactive-mode) below.

---

## Agent Mode

Run the AI agent with a prompt to create or modify designs.

```
pen [options]
```

| Option | Description |
|--------|-------------|
| `--in, -i <path>` | Input `.pen` file (optional — starts with empty canvas if omitted) |
| `--out, -o <path>` | Output `.pen` file path (required unless `--export` is used) |
| `--prompt, -p <text>` | Prompt for the AI agent |
| `--model, -m <id>` | Model to use (default: `claude-opus-4-6`) |
| `--custom, -c` | Use custom Claude model config (e.g. AWS Bedrock, Vertex AI) |
| `--list-models` | List available models and exit |
| `--tasks, -t <path>` | JSON tasks file for batch operations |
| `--workspace, -w <path>` | Workspace folder path for the agent |
| `--export, -e <path>` | Export an image of the final result |
| `--export-scale <n>` | Export scale factor (default: 1) |
| `--export-type <type>` | Export format: `png`, `jpeg`, `webp`, `pdf` (default: `png`) |
| `--verbose-mcp` | Log full MCP tool error details to the console |
| `--help, -h` | Show help message |

### Examples

**Create a new design:**

```bash
pen --out login.pen --prompt "Create a modern login page with:
- Email input field
- Password input field
- Sign In button
- Forgot password link
- Social login options (Google, GitHub)"
```

**Modify an existing design:**

```bash
pen --in dashboard.pen --out dashboard-v2.pen --prompt "Add a sidebar navigation with:
- Dashboard link (active)
- Users link
- Settings link
- Logout button at bottom"
```

**Use a specific model:**

```bash
# Use Claude Haiku for simple, fast tasks
pen --out simple.pen \
  --model claude-haiku-4-5 \
  --prompt "Create a simple 404 error page"
```

**Export to image:**

```bash
pen --in design.pen --export hero.png --export-scale 2
```

---

## Available Models

| Model ID | Description | Default |
|----------|-------------|---------|
| `claude-opus-4-6` | Most capable, higher cost | ✓ |
| `claude-sonnet-4-6` | Fast, balanced performance | |
| `claude-haiku-4-5` | Fastest, lowest cost | |

List available models at any time with:

```bash
pen --list-models
```

---

## Interactive Mode

The interactive shell lets you call MCP tools directly on `.pen` files — useful for scripting, debugging, and agentic workflows that need fine-grained control over design operations.

```
pen interactive [options]
```

| Option | Description |
|--------|-------------|
| `--app, -a <name>` | Connect to a running pen.dev app (e.g. `desktop`, `vscode`) |
| `--in, -i <path>` | Input `.pen` file (optional — empty canvas if omitted) |
| `--out, -o <path>` | Output `.pen` file (required in headless mode) |
| `--help, -h` | Show detailed tool reference |

### App Mode

Connects to a running pen.dev desktop app or extension via WebSocket. Changes are applied live.

```bash
pen interactive -a desktop -i my-design.pen
```

### Headless Mode

Spins up a local editor without a GUI. Use `save()` to write to the output file.

```bash
# New empty canvas
pen interactive -o output.pen

# Edit an existing file
pen interactive -i input.pen -o output.pen
```

### Shell Commands

```
tool_name({ key: value })   Call an MCP tool with arguments
tool_name()                 Call an MCP tool with no arguments
save()                      Save the document to disk
exit()                      Exit the shell
```

### Example Session

```
pen > get_app_state({ include_schema: true })
pen > get_guidelines()
pen > get_guidelines({ category: "guide", name: "Landing Page" })
pen > execute({ input: 'hero=Insert(document,{type:"frame",name:"Hero",x:0,y:0,width:1440,height:900,fill:"#0A0A0A"})' })
pen > execute({ input: 'TakeScreenshot([hero])' })
pen > save()
pen > exit()
```

<Callout type="info">
Run `pen interactive --help` for the full tool reference with parameter types and descriptions.
</Callout>

---

## Batch Processing

Use `--tasks` to process multiple designs from a JSON file. Tasks run sequentially — each one gets its own editor instance.

```bash
pen --tasks batch.json
```

**Example `batch.json`:**

```json
{
  "tasks": [
    {
      "out": "landing-page.pen",
      "prompt": "Create a SaaS landing page with hero, features, and pricing sections"
    },
    {
      "in": "existing-app.pen",
      "out": "existing-app-v2.pen",
      "prompt": "Add a dark mode toggle to the header"
    },
    {
      "out": "mobile-menu.pen",
      "model": "claude-haiku-4-5",
      "prompt": "Create a mobile hamburger menu component"
    }
  ]
}
```

Each task supports:

| Field | Required | Description |
|-------|----------|-------------|
| `out` | Yes | Output `.pen` file path |
| `prompt` | Yes | AI prompt |
| `in` | No | Input `.pen` file |
| `model` | No | Model override |

---

## Supported MCP Tools

The CLI supports the same MCP tools as the desktop app and IDE extension.

### Design Operations

| Tool | Description |
|------|-------------|
| `execute` | Insert, update, delete, move, copy, replace nodes; read nodes and computed bounds; get/set variables |
| `get_app_state` | Get document metadata and structure |

### Visual Operations

Screenshots are taken with the `execute` `TakeScreenshot()` operation. Files
are exported with the `execute` `Export()` operation, which supports
PNG/JPEG/WEBP/PDF images and HTML output.

### Image Generation

The `execute` `G()` operation supports both AI-generated and stock images:

| Type | Description |
|------|-------------|
| `G(nodeId, "ai", prompt)` | AI-generated image from a text prompt |
| `G(nodeId, "stock", keywords)` | Stock photo from Unsplash |

### Style & Guidelines

| Tool | Description |
|------|-------------|
| `get_guidelines` | Load guides and styles for working with .pen files |

---

## CI/CD Usage

Use a CLI key and Anthropic API key to run pen.dev in automated pipelines.

```bash
export PEN_CLI_KEY=pencil_cli_...
export ANTHROPIC_API_KEY=sk-ant-...

pen --out onboarding.pen --prompt "Create a 3-step onboarding flow"
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PEN_CLI_KEY` | CLI API key for CI/CD (takes precedence over stored session) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `PEN_API_BASE` | Backend API base URL (default: `https://api.pen.dev`) |
| `DEBUG` | Enable debug logging |

---

## Token Storage

| File | Purpose |
|------|---------|
| `~/.pencil/session-cli.json` | Session token from `pen login` |

The CLI uses a separate session file from the desktop app so the backend can distinguish which client is in use.
