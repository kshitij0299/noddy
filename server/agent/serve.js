import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalRequest, createAgentMiddleware, publicError } from './relay.js';

const contentTypes = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.wasm': 'application/wasm',
};

/** Local production host; deliberately not a public multi-user service. */
export function createLocalAgentServer({
	distDir = fileURLToPath(new URL('../../dist/', import.meta.url)),
	middleware = createAgentMiddleware(),
} = {}) {
	return createServer(async (req, res) => {
		try {
			assertLocalRequest(req);
			if (req.url?.startsWith('/api/agent/')) return middleware(req, res);
			if (!['GET', 'HEAD'].includes(req.method)) {
				res.writeHead(405);
				return res.end();
			}
			if (req.url === '/') {
				res.writeHead(302, { Location: '/app/' });
				return res.end();
			}
			const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
			if (!pathname.startsWith('/app/') || pathname.includes('\0')) {
				res.writeHead(404);
				return res.end();
			}
			const relative = pathname.slice(5) || 'index.html';
			if (relative.split('/').some((part) => part.startsWith('.'))) {
				res.writeHead(404);
				return res.end();
			}
			const root = await realpath(distDir);
			const path = await realpath(resolve(root, relative));
			if (!path.startsWith(root + sep)) {
				res.writeHead(404);
				return res.end();
			}
			const body = await readFile(path);
			res.writeHead(200, {
				'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream',
				'X-Content-Type-Options': 'nosniff',
				'Cache-Control': 'no-store',
				'Referrer-Policy': 'no-referrer',
			});
			res.end(req.method === 'HEAD' ? undefined : body);
		} catch (error) {
			const status = error?.code === 'ENOENT' ? 404 : publicError(error).status;
			res.writeHead(status);
			res.end(
				status === 404 ? 'Not found. Run npm run build first.' : 'Local server request rejected.'
			);
		}
	});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const port = Number(process.env.NODDY_AGENT_PORT || 5189);
	if (!Number.isInteger(port) || port < 1024 || port > 65535)
		throw new Error('Invalid NODDY_AGENT_PORT');
	createLocalAgentServer().listen(port, '127.0.0.1', () => {
		console.info(`Noddy with agent relay: http://127.0.0.1:${port}/app/`);
	});
}
