// Loads .env.test into *this* process's real env (not just NestJS's
// ConfigModule) before spawning jest, then passes that env down to the
// child. This matters because @prisma/client auto-loads the project-root
// .env on its own — independent of NestJS — the moment PrismaService
// instantiates PrismaClient, and dotenv never overrides an already-set
// process.env key. So every value .env.test cares about (most importantly
// DATABASE_URL, so tests can never accidentally run against the dev/demo
// database) must already be a real env var before Node starts loading any
// app code, not just present in a config file NestJS reads later.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const envPath = path.join(__dirname, '..', '.env.test');
const raw = fs.readFileSync(envPath, 'utf8');

for (const line of raw.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  process.env[key] = value;
}

const result = spawnSync(
  'npx',
  ['jest', '--config', './test/jest-e2e.json', '--runInBand', ...process.argv.slice(2)],
  { stdio: 'inherit', env: process.env, cwd: path.join(__dirname, '..') },
);
process.exit(result.status ?? 1);
