#!/usr/bin/env node
/**
 * Noddy browser driver — tiny CDP screenshot / interaction harness.
 *
 * Zero dependencies: node builtins only (global fetch + WebSocket in Node 24).
 * Launches a fresh headless Chrome with a throwaway profile on every run,
 * executes a list of steps, prints one JSON line per step, then kills Chrome.
 *
 * Usage: node drive.mjs run steps.json
 * See README.md next to this file.
 */
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Never clash with the dev servers / shared debug ports.
const BANNED_PORTS = new Set([5174, 5175, 9222]);
const CDP_TIMEOUT_MS = 30000;
const BOOT_TIMEOUT_MS = 20000;

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

function usage() {
	console.error('usage: node drive.mjs run steps.json');
	console.error('  steps.json must be a JSON array of {do, ...} steps (see README.md).');
}

function findFreePort() {
	return new Promise((resolvePort, reject) => {
		const giveUp = setTimeout(() => reject(new Error('could not find a free port')), 10000);
		const tryOnce = () => {
			const srv = createServer();
			srv.on('error', () => {
				srv.close();
				tryOnce();
			});
			srv.listen(0, '127.0.0.1', () => {
				const addr = srv.address();
				const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
				srv.close(() => {
					if (!port || BANNED_PORTS.has(port)) {
						tryOnce();
						return;
					}
					clearTimeout(giveUp);
					resolvePort(port);
				});
			});
		};
		tryOnce();
	});
}

async function waitForJson(url, timeoutMs) {
	const start = Date.now();
	for (;;) {
		try {
			const res = await fetch(url);
			if (res.ok) return await res.json();
		} catch {
			// Not up yet — keep polling.
		}
		if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${url}`);
		await sleep(150);
	}
}

function openSocket(url) {
	return new Promise((resolveWs, reject) => {
		const ws = new WebSocket(url);
		ws.addEventListener('open', () => resolveWs(ws), { once: true });
		ws.addEventListener('error', (e) => reject(e), { once: true });
	});
}

function makeSender(ws) {
	let nextId = 1;
	return function send(method, params = {}) {
		const id = nextId++;
		return new Promise((resolveReq, rejectReq) => {
			const timer = setTimeout(() => {
				cleanup();
				rejectReq(new Error(`CDP timeout: ${method}`));
			}, CDP_TIMEOUT_MS);
			function cleanup() {
				clearTimeout(timer);
				ws.removeEventListener('message', onMsg);
			}
			function onMsg(ev) {
				let msg;
				try {
					msg = JSON.parse(String(ev.data));
				} catch {
					return;
				}
				if (msg.id !== id) return;
				cleanup();
				if (msg.error) rejectReq(new Error(`CDP error ${method}: ${JSON.stringify(msg.error)}`));
				else resolveReq(msg.result ?? {});
			}
			ws.addEventListener('message', onMsg);
			ws.send(JSON.stringify({ id, method, params }));
		});
	};
}

async function evaluate(send, expression) {
	const r = await send('Runtime.evaluate', { expression, returnByValue: true });
	if (r.exceptionDetails) {
		throw new Error(`page exception: ${JSON.stringify(r.exceptionDetails).slice(0, 500)}`);
	}
	return r.result ? r.result.value : undefined;
}

async function waitForReady(send, timeoutMs) {
	const start = Date.now();
	for (;;) {
		const state = await evaluate(send, 'document.readyState');
		if (state === 'complete') return;
		if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for page load');
		await sleep(250);
	}
}

async function queryInPage(send, selector) {
	const raw = await evaluate(
		send,
		`(function(){ const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return JSON.stringify({ tag: el.tagName, x: r.x, y: r.y, w: r.width, h: r.height }); })()`
	);
	return raw ? JSON.parse(raw) : null;
}

async function runStep(send, events, step) {
	switch (step.do) {
		case 'viewport': {
			const width = Number(step.width);
			const height = Number(step.height);
			if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
				throw new Error(`viewport needs positive integer width/height, got ${width}x${height}`);
			}
			await send('Emulation.setDeviceMetricsOverride', {
				width,
				height,
				deviceScaleFactor: 1,
				mobile: false,
			});
			return { width, height };
		}
		case 'goto': {
			if (typeof step.url !== 'string' || !step.url) throw new Error('goto needs a "url" string');
			await send('Page.navigate', { url: step.url });
			await waitForReady(send, CDP_TIMEOUT_MS);
			return { url: step.url };
		}
		case 'wait': {
			const ms = Number(step.ms);
			if (!Number.isFinite(ms) || ms < 0) throw new Error(`wait needs ms >= 0, got ${step.ms}`);
			await sleep(ms);
			return { ms };
		}
		case 'waitText': {
			if (typeof step.text !== 'string' || !step.text)
				throw new Error('waitText needs a "text" string');
			const timeoutMs = step.timeoutMs === undefined ? 15000 : Number(step.timeoutMs);
			const start = Date.now();
			for (;;) {
				const found = await evaluate(
					send,
					`(function(){ const b = document.body; return b ? b.innerText.includes(${JSON.stringify(step.text)}) : false; })()`
				);
				if (found) return { text: step.text, waitedMs: Date.now() - start };
				if (Date.now() - start > timeoutMs)
					throw new Error(`waitText timed out after ${timeoutMs}ms: ${step.text}`);
				await sleep(250);
			}
		}
		case 'click': {
			if (typeof step.selector !== 'string' || !step.selector)
				throw new Error('click needs a "selector" string');
			const timeoutMs = step.timeoutMs === undefined ? 8000 : Number(step.timeoutMs);
			const start = Date.now();
			for (;;) {
				const hit = await queryInPage(send, step.selector);
				if (hit) {
					await evaluate(
						send,
						`(function(){ const el = document.querySelector(${JSON.stringify(step.selector)}); el.scrollIntoView({ block: 'center', inline: 'center' }); el.click(); return true; })()`
					);
					return { selector: step.selector, hit };
				}
				if (Date.now() - start > timeoutMs)
					throw new Error(`click timed out, no such element: ${step.selector}`);
				await sleep(250);
			}
		}
		case 'type': {
			if (typeof step.selector !== 'string' || !step.selector)
				throw new Error('type needs a "selector" string');
			if (typeof step.text !== 'string') throw new Error('type needs a "text" string');
			const timeoutMs = step.timeoutMs === undefined ? 8000 : Number(step.timeoutMs);
			const start = Date.now();
			for (;;) {
				const hit = await queryInPage(send, step.selector);
				if (hit) break;
				if (Date.now() - start > timeoutMs)
					throw new Error(`type timed out, no such element: ${step.selector}`);
				await sleep(250);
			}
			await evaluate(
				send,
				`(function(){ const el = document.querySelector(${JSON.stringify(step.selector)}); const t = ${JSON.stringify(step.text)}; el.focus(); if ('value' in el) { el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } else { el.textContent = t; el.dispatchEvent(new Event('input', { bubbles: true })); } return true; })()`
			);
			return { selector: step.selector, chars: step.text.length };
		}
		case 'shot': {
			if (typeof step.path !== 'string' || !step.path)
				throw new Error('shot needs a "path" string');
			const outPath = resolve(step.path);
			mkdirSync(dirname(outPath), { recursive: true });
			const jpeg = /\.jpe?g$/i.test(outPath);
			const shot = await send('Page.captureScreenshot', {
				format: jpeg ? 'jpeg' : 'png',
				...(jpeg ? { quality: 80 } : {}),
				// Viewport-only for floating overlays (menus/popups): full-page
				// capture can mis-composite them. Pass {do:'shot', path, viewportOnly:true}.
				captureBeyondViewport: step.viewportOnly !== true,
			});
			const buf = Buffer.from(shot.data, 'base64');
			writeFileSync(outPath, buf);
			return { path: outPath, bytes: buf.length };
		}
		case 'console': {
			if (typeof step.path !== 'string' || !step.path)
				throw new Error('console needs a "path" string');
			const outPath = resolve(step.path);
			mkdirSync(dirname(outPath), { recursive: true });
			writeFileSync(outPath, JSON.stringify(events, null, 2) + '\n');
			return { path: outPath, entries: events.length };
		}
		default:
			throw new Error(`unknown step do=${JSON.stringify(step.do)}`);
	}
}

async function main() {
	const [cmd, stepsArg] = process.argv.slice(2);
	if (cmd !== 'run' || !stepsArg) {
		usage();
		process.exit(2);
	}
	let steps;
	try {
		steps = JSON.parse(readFileSync(resolve(stepsArg), 'utf8'));
	} catch (e) {
		console.error(`FATAL: cannot read steps file ${stepsArg}: ${e.message}`);
		process.exit(2);
	}
	if (!Array.isArray(steps)) {
		console.error('FATAL: steps file must be a JSON array of {do, ...} steps');
		process.exit(2);
	}

	const port = await findFreePort();
	const profile = mkdtempSync(join(tmpdir(), 'noddy-chrome-'));
	let child = null;
	let ws = null;
	let spawnErr = null;
	try {
		child = spawn(
			CHROME_BIN,
			[
				'--headless=new',
				`--remote-debugging-port=${port}`,
				`--user-data-dir=${profile}`,
				'--no-first-run',
				'--no-default-browser-check',
				'--disable-dev-shm-usage',
				'--disable-gpu',
				'--disable-extensions',
				'--mute-audio',
				'--window-size=1280,800',
				'about:blank',
			],
			{ stdio: 'ignore' }
		);
		child.on('error', (e) => {
			spawnErr = e;
		});

		const cdp = `http://127.0.0.1:${port}`;
		try {
			await waitForJson(`${cdp}/json/version`, BOOT_TIMEOUT_MS);
		} catch (e) {
			if (spawnErr) throw new Error(`Chrome failed to start: ${spawnErr.message}`);
			throw e;
		}
		const targets = await waitForJson(`${cdp}/json/list`, BOOT_TIMEOUT_MS);
		const page = (Array.isArray(targets) ? targets : []).find((t) => t.type === 'page');
		if (!page || !page.webSocketDebuggerUrl) throw new Error('no page target found in Chrome');
		ws = await openSocket(page.webSocketDebuggerUrl);
		const send = makeSender(ws);

		// Collect page console / errors for later {do:'console'} dumps.
		const events = [];
		ws.addEventListener('message', (ev) => {
			let msg;
			try {
				msg = JSON.parse(String(ev.data));
			} catch {
				return;
			}
			if (
				msg.method === 'Runtime.consoleAPICalled' ||
				msg.method === 'Runtime.exceptionThrown' ||
				msg.method === 'Log.entryAdded'
			) {
				events.push({ at: new Date().toISOString(), method: msg.method, params: msg.params });
				if (events.length > 2000) events.shift();
			}
		});

		await send('Page.enable');
		await send('Runtime.enable');
		try {
			await send('Log.enable');
		} catch {
			// Older/odd builds may lack Log — console capture still works via Runtime.
		}

		let failed = false;
		for (let i = 0; i < steps.length; i++) {
			const step = steps[i] ?? {};
			const started = Date.now();
			try {
				const extra = await runStep(send, events, step);
				console.log(JSON.stringify({ i, do: step.do, ok: true, ms: Date.now() - started, ...extra }));
			} catch (e) {
				failed = true;
				console.log(
					JSON.stringify({ i, do: step.do, ok: false, ms: Date.now() - started, error: e.message })
				);
				console.error(`STEP ${i} (${step.do}) FAILED: ${e.message}`);
				break;
			}
		}
		if (failed) process.exit(1);
	} finally {
		try {
			if (ws) ws.close();
		} catch {
			// Best effort — browser is going away anyway.
		}
		try {
			if (child) child.kill('SIGKILL');
		} catch {
			// Already exited.
		}
		try {
			rmSync(profile, { recursive: true, force: true });
		} catch {
			// Throwaway dir left behind; harmless in /tmp.
		}
	}
}

main().catch((e) => {
	console.error(`FATAL: ${e && e.message ? e.message : e}`);
	process.exit(1);
});
