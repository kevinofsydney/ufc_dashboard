import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'

const projectRoot = process.cwd()
let server

function runWrangler(arguments_) {
  return spawn(
    process.execPath,
    [
      resolve(projectRoot, 'node_modules/wrangler/bin/wrangler.js'),
      ...arguments_,
    ],
    {
      cwd: projectRoot,
      env: { ...process.env, XDG_CONFIG_HOME: '.localappdata' },
      stdio: 'inherit',
    },
  )
}

async function applyLocalMigrations() {
  const migrationProcess = runWrangler([
    'd1',
    'migrations',
    'apply',
    'ufc-bet-synthesiser',
    '--local',
  ])
  const [code] = await once(migrationProcess, 'exit')
  if (code !== 0) throw new Error(`E2E migration exited with code ${code}`)
}

function startServer() {
  return spawn(
    process.execPath,
    [
      resolve(projectRoot, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
    ],
    {
      cwd: projectRoot,
      env: { ...process.env, XDG_CONFIG_HOME: '.localappdata' },
      stdio: 'inherit',
    },
  )
}

async function waitForServer() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) {
      throw new Error(`The test server exited with code ${server.exitCode}`)
    }
    try {
      const response = await fetch('http://127.0.0.1:5173/health')
      if (response.ok) return
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  throw new Error('Timed out waiting for the local test server')
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    once(server, 'exit'),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000)),
  ])
  if (server.exitCode === null) server.kill('SIGKILL')
}

async function cleanupE2eCards() {
  const cleanupProcess = runWrangler([
    'd1',
    'execute',
    'ufc-bet-synthesiser',
    '--local',
    '--file',
    resolve(projectRoot, 'scripts/data/cleanup-e2e-cards.sql'),
  ])
  const [code] = await once(cleanupProcess, 'exit')
  if (code !== 0) throw new Error(`E2E data cleanup exited with code ${code}`)
}

let exitCode = 1
try {
  await applyLocalMigrations()
  server = startServer()
  await waitForServer()
  const testProcess = spawn(
    process.execPath,
    [resolve(projectRoot, 'node_modules/@playwright/test/cli.js'), 'test'],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: '.playwright-browsers',
      },
      stdio: 'inherit',
    },
  )
  const [code] = await once(testProcess, 'exit')
  exitCode = typeof code === 'number' ? code : 1
} finally {
  await stopServer()
  try {
    await cleanupE2eCards()
  } catch (cleanupError) {
    console.error(cleanupError)
    exitCode = 1
  }
}

process.exitCode = exitCode
