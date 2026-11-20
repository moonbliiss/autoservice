import { execFile, spawn } from 'node:child_process'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const root = fileURLToPath(new URL('../', import.meta.url))
const interval = 15_000
const remoteBranch = 'refs/remotes/origin/main'
const exec = promisify(execFile)
const stop = new AbortController()
let server
let servedCommit
let installedManifest
let lastMessage

function report(message) {
  if (message !== lastMessage) console.log(message)
  lastMessage = message
}

async function git(...args) {
  const { stdout } = await exec('git', args, {
    cwd: root, encoding: 'utf8', timeout: 12_000, signal: stop.signal,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  return stdout.trim()
}

async function updateFromGitHub() {
  if (await git('branch', '--show-current') !== 'main') {
    report('Синхронизация ждёт переключения на ветку main.')
    return
  }
  if (await git('status', '--porcelain')) {
    report('Синхронизация на паузе, пока в проекте есть локальные изменения.')
    return
  }

  await git('fetch', '--no-tags', 'origin', `refs/heads/main:${remoteBranch}`)
  const head = await git('rev-parse', 'HEAD')
  const remote = await git('rev-parse', remoteBranch)
  if (head === remote) return

  const base = await git('merge-base', head, remote)
  if (base === remote) return
  if (base !== head) {
    report('Локальная и удалённая ветки main разошлись. Синхронизация на паузе.')
    return
  }

  // Check again after the network request, which can take a few seconds.
  if (await git('branch', '--show-current') === 'main' && !await git('status', '--porcelain')) {
    await git('merge', '--ff-only', '--no-overwrite-ignore', remote)
  }
}

function runNode(args, options = {}) {
  stop.signal.throwIfAborted()
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', ...options })
  const done = new Promise(resolve => {
    child.once('error', error => resolve({ error }))
    child.once('close', code => resolve({ code }))
  })
  return { child, done }
}

async function npm(...args) {
  const processResult = runNode([process.env.npm_execpath, ...args])
  const cancel = () => processResult.child.kill()
  stop.signal.addEventListener('abort', cancel, { once: true })
  try {
    const { code, error } = await processResult.done
    if (error) throw error
    if (code !== 0) throw new Error(`Команда npm ${args.join(' ')} завершилась с ошибкой.`)
  } finally {
    stop.signal.removeEventListener('abort', cancel)
  }
}

async function stopServer() {
  if (!server) return
  server.child.kill()
  await server.done
  server = undefined
}

async function serve(commit, builds) {
  const manifest = await Promise.all(['package.json', 'package-lock.json'].map(file => readFile(join(root, file), 'utf8')))
  const signature = JSON.stringify(manifest)
  if (signature !== installedManifest) {
    await npm('ci')
    installedManifest = signature
  }

  const frontend = await mkdtemp(join(builds, 'frontend-'))
  try {
    await npm('run', 'build', '--', '--outDir', frontend)
    const previous = server?.frontend
    await stopServer()
    if (previous) await rm(previous, { recursive: true, force: true })
    server = {
      ...runNode(['server/index.js'], {
        env: { ...process.env, WORKSHOP_FRONTEND_DIR: frontend },
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      }),
      frontend,
    }
    const startup = new AbortController()
    try {
      await Promise.race([
        new Promise(resolve => server.child.once('message', resolve)),
        server.done.then(() => { throw new Error('Сервер завершился до запуска.') }),
        delay(10_000, undefined, { signal: AbortSignal.any([stop.signal, startup.signal]) }).then(() => {
          throw new Error('Сервер не успел запуститься.')
        }),
      ])
    } finally {
      startup.abort()
    }
    servedCommit = commit
  } catch (error) {
    if (server?.frontend === frontend) await stopServer()
    await rm(frontend, { recursive: true, force: true })
    throw error
  }
}

process.once('SIGINT', () => stop.abort())
process.once('SIGTERM', () => stop.abort())
const builds = await mkdtemp(join(tmpdir(), 'autoservice-sync-'))

try {
  console.log('Мастерская проверяет origin/main каждые 15 секунд.')
  while (!stop.signal.aborted) {
    try {
      await updateFromGitHub()
    } catch (error) {
      if (!stop.signal.aborted) report(`GitHub · ${error.stderr?.trim() || error.message}`)
    }
    try {
      const commit = await git('rev-parse', 'HEAD')
      if (!server || server.child.exitCode !== null || server.child.signalCode !== null || commit !== servedCommit) {
        await serve(commit, builds)
        report(`Сборка ${commit.slice(0, 7)} готова. Можно обновить страницу.`)
      }
    } catch (error) {
      if (!stop.signal.aborted) report(error.message)
    }
    await delay(interval, undefined, { signal: stop.signal })
  }
} catch (error) {
  if (!stop.signal.aborted) throw error
} finally {
  await stopServer()
  await rm(builds, { recursive: true, force: true })
}
