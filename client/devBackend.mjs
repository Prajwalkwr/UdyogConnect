import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import readline from 'node:readline';

const BACKEND_PATHS = ['/api', '/uploads', '/health', '/socket.io'];
const READY_TIMEOUT_MS = 30000;
const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 1000;
const MAX_PORT_PROBES = 20;

// Survives Vite config reloads so a restart reuses the running backend instead of spawning another.
const state = globalThis.__udyogDevBackend || (globalThis.__udyogDevBackend = {
  child: null,
  port: null,
  ready: Promise.resolve(true),
  shuttingDown: false,
  exitHookInstalled: false,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRunning = (child) => Boolean(child) && child.exitCode === null && child.signalCode === null;

function checkHealth(port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(res.statusCode === 200 && JSON.parse(body).server === 'ok');
        } catch {
          resolve(false);
        }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port);
  });
}

async function waitUntilHealthy(port, child) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline && isRunning(child)) {
    if (await checkHealth(port, 500)) return true;
    await sleep(100);
  }
  return false;
}

function pipeWithPrefix(input, output) {
  readline.createInterface({ input }).on('line', (line) => output.write(`[server] ${line}\n`));
}

function installExitHook() {
  if (state.exitHookInstalled) return;
  state.exitHookInstalled = true;
  const stop = () => {
    state.shuttingDown = true;
    if (isRunning(state.child)) state.child.kill();
  };
  process.once('exit', stop);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(signal, () => {
      stop();
      process.exit();
    });
  }
}

function startChild({ port, cwd, entry }, restarts = 0) {
  const child = spawn(process.execPath, [entry], {
    cwd,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipeWithPrefix(child.stdout, process.stdout);
  pipeWithPrefix(child.stderr, process.stderr);

  state.child = child;
  state.port = port;
  state.ready = waitUntilHealthy(port, child).then((ok) => {
    if (ok) console.log(`[dev-backend] API ready on http://localhost:${port}`);
    else if (isRunning(child)) console.warn(`[dev-backend] API did not answer /api/health within ${READY_TIMEOUT_MS / 1000}s`);
    return ok;
  });

  child.on('exit', (code, signal) => {
    if (state.child !== child || state.shuttingDown) return;
    state.child = null;
    if (restarts >= MAX_RESTARTS) {
      console.error(`[dev-backend] API server exited (${signal || code}) too many times; not restarting. Fix the error above and restart "npm run dev".`);
      state.ready = Promise.resolve(false);
      return;
    }
    console.warn(`[dev-backend] API server exited (${signal || code}); restarting in ${RESTART_DELAY_MS}ms...`);
    state.ready = sleep(RESTART_DELAY_MS).then(() => {
      startChild({ port, cwd, entry }, restarts + 1);
      return state.ready;
    });
  });
}

function parseLocalPort(url) {
  try {
    const parsed = new URL(url);
    if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)) return null;
    return Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80);
  } catch {
    return null;
  }
}

/**
 * Makes sure the Express API is reachable for the Vite dev proxy.
 * Reuses an already-running UdyogConnect backend, otherwise spawns one on a free port.
 */
export async function ensureDevBackend({ defaultPort, explicitTarget, cwd, entry }) {
  if (explicitTarget && parseLocalPort(explicitTarget) === null) {
    return { target: explicitTarget, getReady: () => Promise.resolve(true) };
  }

  const preferredPort = explicitTarget ? parseLocalPort(explicitTarget) : defaultPort;
  const targetFor = (port) => `http://127.0.0.1:${port}`;

  if (isRunning(state.child)) {
    return { target: targetFor(state.port), getReady: () => state.ready };
  }

  if (await checkHealth(preferredPort)) {
    console.log(`[dev-backend] Using API already running on http://localhost:${preferredPort}`);
    return { target: targetFor(preferredPort), getReady: () => Promise.resolve(true) };
  }

  let port = preferredPort;
  for (let i = 0; i < MAX_PORT_PROBES && !(await isPortFree(port)); i += 1) port += 1;
  if (port !== preferredPort) {
    console.warn(`[dev-backend] Port ${preferredPort} is used by another program; starting the API on ${port} instead.`);
  }

  installExitHook();
  state.shuttingDown = false;
  console.log(`[dev-backend] Starting API server on port ${port}...`);
  startChild({ port, cwd, entry });
  return { target: targetFor(port), getReady: () => state.ready };
}

const isBackendRequest = (url = '') => BACKEND_PATHS.some(
  (prefix) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`),
);

/** Holds proxied requests until the API is healthy, so the first page load never hits ECONNREFUSED. */
export function devBackendPlugin(getReady) {
  const waitForBackend = async (req, _res, next) => {
    if (isBackendRequest(req.url)) {
      await Promise.race([getReady(), sleep(READY_TIMEOUT_MS)]);
    }
    next();
  };
  return {
    name: 'udyogconnect-dev-backend',
    configureServer(server) {
      server.middlewares.use(waitForBackend);
    },
    configurePreviewServer(server) {
      server.middlewares.use(waitForBackend);
    },
  };
}
