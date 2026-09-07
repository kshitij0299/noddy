# Noddy browser driver (`drive.mjs`)

Tiny zero-dependency screenshot / interaction harness. Node 24 builtins only
(`fetch` + `WebSocket` are global) plus headless Chrome. No `npm install`.

Each run launches a **fresh headless Chrome with a throwaway profile**
(a temp dir under `$TMPDIR`, deleted afterwards), executes a steps file,
prints **one JSON line per step** to stdout, then kills Chrome.
Any failure stops the run and exits non-zero ("fails loudly").

The driver never uses ports **5174, 5175, 9222** for its own CDP endpoint —
it picks a free loopback port instead, so it can run alongside the dev server.

## Usage

```sh
node scripts/browser/drive.mjs run steps.json
```

`steps.json` is a JSON **array** of step objects:

| step                                     | effect                                                            |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `{do:'goto', url}`                       | navigate, wait for `readyState === 'complete'`                    |
| `{do:'wait', ms}`                        | sleep                                                             |
| `{do:'waitText', text, timeoutMs?}`      | poll `body.innerText` until it contains `text` (default 15s)      |
| `{do:'click', selector, timeoutMs?}`     | wait for `selector` (default 8s), scroll into view, click         |
| `{do:'type', selector, text}`            | wait for `selector`, focus, **replace** value/text, fire input    |
| `{do:'viewport', width, height}`          | `Emulation.setDeviceMetricsOverride` (DPR 1)                      |
| `{do:'shot', path}`                      | PNG (or JPEG for `.jpg`) screenshot; parents created              |
| `{do:'console', path}`                   | dump collected page console/errors as JSON to `path`              |

`type` replaces the whole field value (no per-keystroke simulation).
Output lines look like `{"i":0,"do":"goto","ok":true,"ms":812,"url":"..."}`;
on failure the step prints `{"i":n,"do":"...","ok":false,...,"error":"..."}`,
an explanation goes to stderr, and the process exits 1.

## Example 1 — desktop screenshot of the running app

`steps.json`:

```json
[
	{ "do": "viewport", "width": 1440, "height": 900 },
	{ "do": "goto", "url": "http://127.0.0.1:5174/" },
	{ "do": "wait", "ms": 4000 },
	{ "do": "shot", "path": "/tmp/noddy-shots/desktop.png" }
]
```

```sh
node scripts/browser/drive.mjs run steps.json
```

## Example 2 — narrow viewport + interaction + console dump

`steps-narrow.json`:

```json
[
	{ "do": "viewport", "width": 390, "height": 844 },
	{ "do": "goto", "url": "http://127.0.0.1:5174/" },
	{ "do": "waitText", "text": "Noddy", "timeoutMs": 20000 },
	{ "do": "click", "selector": "button" },
	{ "do": "wait", "ms": 1000 },
	{ "do": "shot", "path": "/tmp/noddy-shots/narrow.png" },
	{ "do": "console", "path": "/tmp/noddy-shots/console.json" }
]
```

```sh
node scripts/browser/drive.mjs run steps-narrow.json
```

## Limits

- Chrome binary path is fixed to macOS
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- No auth flows, file pickers, or multi-tab scenarios — screenshots and
  simple click/type/wait loops only.
- Screenshots go outside the repo (e.g. `/tmp`) and are never committed.
