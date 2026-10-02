#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const apiDir = join(root, 'apps', 'api');
const mobileDir = join(root, 'apps', 'mobile');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const apiPort = Number(process.env.API_PORT ?? 3002);
const expoPort = Number(process.env.EXPO_PORT ?? 8081);
const lanIp = process.env.LAN_IP ?? getLanIp();
const apiLocalUrl = `http://localhost:${apiPort}`;
const apiLanUrl = `http://${lanIp}:${apiPort}`;
const launcherUrl = `${apiLanUrl}/mobile-test`;
const expoGoUrl = `exp://${lanIp}:${expoPort}`;

const children = new Set();

if (!existsSync(apiDir) || !existsSync(mobileDir)) {
  console.error('Run this from the Elsewhere repo root, or keep scripts/mobile-preview-test.mjs in place.');
  process.exit(1);
}

main().catch((error) => {
  console.error(`\nMobile preview launcher failed: ${error.message}`);
  cleanup(1);
});

async function main() {
  printHeader();

  const existingApi = await apiIsHealthy();
  if (existingApi) {
    console.log(`Using existing API at ${apiLocalUrl}`);
    await verifyDevAuthMode();
  } else {
    console.log(`Starting API at ${apiLocalUrl} with ELSEWHERE_USE_LOCAL_STORES=true...`);
    spawnManaged(npm, ['exec', 'next', 'dev', '--', '--port', String(apiPort)], {
      cwd: apiDir,
      env: {
        ...process.env,
        ELSEWHERE_USE_LOCAL_STORES: 'true',
        ELSEWHERE_PUBLIC_API_URL: apiLanUrl,
        PORT: String(apiPort),
      },
      name: 'api',
    });
    await waitForApi();
    await verifyDevAuthMode();
  }

  console.log(`Starting Expo on LAN at ${expoGoUrl}...`);
  writeFileSync(
    join(mobileDir, '.env.local'),
    `EXPO_PUBLIC_API_URL=${apiLanUrl}\n`,
  );
  spawnManaged(npm, ['run', 'dev', '--', '--host', 'lan', '--port', String(expoPort), '--clear'], {
    cwd: mobileDir,
    env: {
      ...process.env,
      EXPO_PUBLIC_API_URL: apiLanUrl,
    },
    name: 'expo',
  });

  printReady();
  keepAlive();
}

function printHeader() {
  console.log('\nElsewhere mobile preview validation');
  console.log('====================================');
  console.log(`LAN IP:        ${lanIp}`);
  console.log(`API URL:       ${apiLanUrl}`);
  console.log(`Expo Go URL:   ${expoGoUrl}`);
  console.log('');
}

function printReady() {
  console.log('\nReady for phone testing');
  console.log('-----------------------');
  console.log(`1. On your phone, open: ${launcherUrl}`);
  console.log('2. Tap "Open in Expo Go".');
  console.log('3. In the app, confirm Discover says "API: connected".');
  console.log('4. Pick a destination, add a selfie, accept consent, and generate.');
  console.log('\nPress Ctrl+C here to stop API + Expo.\n');
}

function getLanIp() {
  const interfaces = networkInterfaces();
  const candidates = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      candidates.push(entry.address);
    }
  }

  const preferred = candidates.find((ip) =>
    ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.'),
  );

  if (preferred) return preferred;
  if (candidates[0]) return candidates[0];

  throw new Error('Could not find a LAN IPv4 address. Set LAN_IP manually.');
}

async function apiIsHealthy() {
  try {
    const response = await fetch(`${apiLocalUrl}/api/v1/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForApi() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45_000) {
    if (await apiIsHealthy()) return;
    await sleep(750);
  }
  throw new Error(`API did not become healthy at ${apiLocalUrl}`);
}

async function verifyDevAuthMode() {
  const response = await fetch(`${apiLocalUrl}/api/v1/reference-photos`, {
    headers: { Authorization: 'Bearer dev-token' },
  });

  if (!response.ok) {
    throw new Error(
      `API is reachable but not accepting dev-token (${response.status}). Stop the existing API and rerun this script so ELSEWHERE_USE_LOCAL_STORES=true is used.`,
    );
  }
}

function spawnManaged(command, args, { cwd, env, name }) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  children.add(child);

  child.stdout.on('data', (chunk) => {
    process.stdout.write(prefixLines(name, chunk.toString()));
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(prefixLines(name, chunk.toString()));
  });
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
      console.error(`[${name}] exited with code ${code ?? signal}`);
    }
  });

  return child;
}

function prefixLines(name, text) {
  return text
    .split(/(\n)/)
    .map((part) => (part === '\n' || part.length === 0 ? part : `[${name}] ${part}`))
    .join('');
}

function keepAlive() {
  process.stdin.resume();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanup(code = 0) {
  for (const child of children) {
    child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 200);
}

process.on('SIGINT', () => cleanup(0));
process.on('SIGTERM', () => cleanup(0));
