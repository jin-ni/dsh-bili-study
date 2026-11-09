/**
 * lib/files.mjs —— 本地资料（文件）只读接入
 *
 * 用 DSH 自带的 Python 运行时（里面有 python-docx / python-pptx / openpyxl）去抽文字；
 * 只读，不写、不改原文件。抽出来的文字再交给模型做结构化笔记。
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dshHome } from './paths.mjs'

const SCRIPT = fileURLToPath(new URL('../reader/file_read.py', import.meta.url))
let pyCache = { key: '', path: '' }

function tryVersion(cmd) {
  try {
    const r = spawnSync(cmd, ['--version'], { timeout: 10_000, windowsHide: true, encoding: 'utf8' })
    return !r.error && r.status === 0 && /Python 3\./.test(String(r.stdout || '') + String(r.stderr || ''))
  } catch {
    return false
  }
}

/** 优先用带 Office 解析库的 DSH 运行时 Python */
export function resolveDocPython(cfg = {}) {
  const key = String(cfg.pythonPath || '')
  if (pyCache.key === key && pyCache.path) return pyCache.path
  const cands = []
  // 文档优先用 DSH 自带运行时（确定带 python-docx / python-pptx / openpyxl）
  if (process.resourcesPath) cands.push(join(process.resourcesPath, 'runtime', 'primary-runtime', 'dependencies', 'python', 'python.exe'))
  cands.push(join(dshHome(), 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'python.exe'))
  if (cfg.pythonPath) cands.push(cfg.pythonPath)
  cands.push(join(dshHome(), 'bili-duty', '.venv', 'Scripts', 'python.exe'))
  cands.push(join(dshHome(), 'bili-duty', '.venv', 'bin', 'python'))

  let picked = ''
  for (const c of cands) {
    if (c.includes('/') || c.includes('\\')) {
      if (existsSync(c)) { picked = c; break }
      continue
    }
    if (tryVersion(c)) { picked = c; break }
  }
  if (!picked) {
    for (const c of ['python', 'python3', 'py']) if (tryVersion(c)) { picked = c; break }
  }
  pyCache = { key, path: picked }
  return picked
}

export function invalidateDocPython() {
  pyCache = { key: '', path: '' }
}

function runDoc(args, { cfg = {}, timeoutMs = 120_000 } = {}) {
  return new Promise((resolvePromise) => {
    const python = resolveDocPython(cfg)
    if (!python) {
      resolvePromise({ ok: false, error: '找不到 Python（需要 3.8+ 且带 python-docx 等库）', code: 'NO_PYTHON' })
      return
    }
    if (!existsSync(SCRIPT)) {
      resolvePromise({ ok: false, error: '资料读取脚本丢了：' + SCRIPT, code: 'NO_SCRIPT' })
      return
    }
    const child = spawn(python, [SCRIPT, ...args], {
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (b) => { out += b.toString('utf8') })
    child.stderr.on('data', (b) => { err += b.toString('utf8') })
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* 已退出 */ } }, timeoutMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      resolvePromise({ ok: false, error: '启动资料读取器失败：' + String(e?.message ?? e), code: 'SPAWN' })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const lines = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].startsWith('{')) continue
        try { resolvePromise(JSON.parse(lines[i])); return } catch { /* 继续 */ }
      }
      resolvePromise({ ok: false, error: `资料读取器没有返回 JSON（exit=${code}）：${(err || out).slice(-300)}`, code: 'BAD_OUTPUT' })
    })
    child.stdin?.end()
  })
}

export function info(cfg, path) {
  return runDoc(['info', '--path', String(path)], { cfg, timeoutMs: 30_000 })
}

export function read(cfg, path, maxChars = 60000) {
  return runDoc(['read', '--path', String(path), '--max-chars', String(maxChars)], { cfg, timeoutMs: 180_000 })
}

export function scan(cfg, dir, limit = 200) {
  return runDoc(['scan', '--dir', String(dir), '--limit', String(limit)], { cfg, timeoutMs: 120_000 })
}

export function search(cfg, dir, query, limit = 20) {
  return runDoc(['search', '--dir', String(dir), '--query', String(query), '--limit', String(limit)], { cfg, timeoutMs: 240_000 })
}

/** 资料 id：按真实路径算，稳定；同一文件重复加只更新记录 */
export function idForPath(path) {
  const real = resolve(String(path))
  const h = createHash('sha1').update(real.toLowerCase()).digest('hex').slice(0, 12)
  return 'f-' + h
}

export function nameOf(path) {
  return basename(String(path))
}

export function extOf(path) {
  return extname(String(path)).toLowerCase()
}

export function statOf(path) {
  try {
    const st = statSync(String(path))
    return { size: st.size, mtime: Math.floor(st.mtimeMs / 1000) }
  } catch {
    return null
  }
}

export function isPdf(ext) {
  return String(ext || '').toLowerCase() === '.pdf'
}
