#!/usr/bin/env node
/* Runs the whole stack locally with .env.local loaded into the environment:
     - `vercel dev`  site + REST API on http://localhost:3000
     - the 1v1 Worker (wrangler dev) on http://127.0.0.1:8787
   vercel dev only injects env vars from the linked Vercel project, so the
   local DATABASE_URL and MATCH_* would otherwise never reach the /api functions.
   Usage: npm run dev            both
          npm run dev -- --api   API only (no 1v1) */

import { spawn } from 'node:child_process';

const apiOnly = process.argv.includes('--api');
const passThrough = process.argv.slice(2).filter((a) => a !== '--api');

const children = [];

function run(name, command) {
  const child = spawn(command, { stdio: 'inherit', shell: true });
  child.on('exit', (code) => {
    console.log(`[dev] ${name} exited (${code ?? 0}); stopping the rest.`);
    for (const other of children) if (other !== child && other.exitCode === null) other.kill();
    process.exit(code ?? 0);
  });
  children.push(child);
}

run('api', ['npx vercel dev', ...passThrough].join(' '));
if (!apiOnly) run('worker', 'npm run worker:dev');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
  });
}
