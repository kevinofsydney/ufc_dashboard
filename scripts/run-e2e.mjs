import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'

const projectRoot = process.cwd()
const server = spawn(
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

async function waitForServer() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
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
  if (server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    once(server, 'exit'),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000)),
  ])
  if (server.exitCode === null) server.kill('SIGKILL')
}

let exitCode = 1
try {
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
}

process.exitCode = exitCode
