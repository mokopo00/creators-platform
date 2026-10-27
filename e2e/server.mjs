// Starts a fresh local Worker for E2E: clean state, migrations, then `wrangler dev`.
// Test-only settings are passed with --var and never deployed.
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const STATE = '.wrangler/e2e';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const opts = { stdio: 'inherit', shell: process.platform === 'win32' };

rmSync(STATE, { recursive: true, force: true });
const build = spawnSync('npm', ['run', 'build'], opts);
if (build.status !== 0) process.exit(build.status ?? 1);
const mig = spawnSync(
  npx,
  ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', STATE],
  opts,
);
if (mig.status !== 0) process.exit(mig.status ?? 1);

const vars = {
  ENVIRONMENT: 'test',
  MOCK_AUTH: 'true',
  APP_ORIGIN: 'http://localhost:8787',
  ADMIN_HANDLES: 'e2e-operator',
  // Dummy OAuth client so the Google button and PKCE redirect can be asserted.
  GOOGLE_CLIENT_ID: 'e2e-dummy-client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'e2e-dummy-secret',
  OAUTH_REDIRECT_URIS: 'http://localhost:8787/api/auth/google/callback',
  SESSION_SECRET: 'e2e-session-secret-not-used-anywhere-else',
};
const args = ['wrangler', 'dev', '--port', '8787', '--persist-to', STATE];
for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}:${v}`);
const child = spawn(npx, args, opts);
const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
