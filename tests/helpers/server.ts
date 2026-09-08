import { spawn, type ChildProcess } from 'node:child_process';

const PORT = 3123;

export async function startAppServer() {
  const child: ChildProcess = spawn('npm', ['run', 'start', '--', '--port', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production' },
  });

  const baseUrl = `http://127.0.0.1:${PORT}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await fetch(baseUrl, { redirect: 'manual' });
      return { baseUrl, stop: async () => void child.kill('SIGTERM') };
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  child.kill('SIGTERM');
  throw new Error('app server did not start within 60s');
}
