/**
 * lib/bili.mjs —— 调 Python 阅读器（reader/bili_read.py）拿 B 站数据
 *
 * 为什么不在 Node 里自己签 WBI：
 *   B 站搜索/播放器接口要 WBI 签名 + 登录 Cookie，Python 标准库写一遍更稳；
 *   机器上「刷B站」已经装好 Python，直接复用，不额外装任何依赖。
 *
 * 只读：不登录、不评论、不点赞。凭证只用来读字幕 / 看登录状态。
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dshHome, stateDir } from './paths.mjs'

const SCRIPT = fileURLToPath(new URL('../reader/bili_read.py', import.meta.url))

let pyCache = { key: '', python: '' }

function tryPython(command, args = ['--version']) {
  try {
    const r = spawnSync(command, args, { timeout: 10_000, windowsHide: true, encoding: 'utf8' })
    if (r.error || r.status !== 0) return false
    const text = String(r.stdout || '') + String(r.stderr || '')
    const m = /Python 3\.(\d+)/.exec(text)
    return Boolean(m) && Number(m[1]) >= 8
  } catch {
    return false
  }
}

/** 解析要用的 Python：配置 > 刷B站 venv > PATH */
export function resolvePython(cfg = {}) {
  const key = String(cfg.pythonPath || '')
  if (pyCache.key === key && pyCache.python) return pyCache.python

  const cands = []
  const configured = String(cfg.pythonPath || '').trim()
  if (configured) {
    if (configured.includes('/') || configured.includes('\\')) {
      if (existsSync(configured)) cands.push(configured)
    } else {
      cands.push(configured)
    }
  }
  const duty = join(dshHome(), 'bili-duty', '.venv')
  cands.push(join(duty, 'Scripts', 'python.exe'), join(duty, 'bin', 'python'))

  let picked = ''
  for (const c of cands) {
    if (c.includes('/') || c.includes('\\')) {
      if (existsSync(c)) { picked = c; break }
      continue
    }
    if (tryPython(c)) { picked = c; break }
  }
  if (!picked) {
    for (const c of ['python', 'python3', 'py']) {
      if (tryPython(c)) { picked = c; break }
    }
  }
  pyCache = { key, python: picked }
  return picked
}

export function invalidatePythonCache() {
  pyCache = { key: '', python: '' }
}

/** 凭证文件：配置 > 自己的家目录 > 刷B站的家目录 */
export function resolveCredPath(cfg = {}, home = stateDir()) {
  const configured = String(cfg.credentialPath || '').trim()
  if (configured && existsSync(configured)) return configured
  const own = join(home, 'bili_credential.json')
  if (existsSync(own)) return own
  const duty = join(dshHome(), 'bili-duty', 'bili_credential.json')
  if (existsSync(duty)) return duty
  return ''
}

function runReader(args, { cfg = {}, home = stateDir(), timeoutMs = 90_000 } = {}) {
  return new Promise((resolve) => {
    const python = resolvePython(cfg)
    if (!python) {
      resolve({
        ok: false,
        error: '找不到 Python（需要 3.8+）。先在「刷B站」设置页点「装依赖」，或在本插件设置里填 pythonPath。',
      })
      return
    }
    if (!existsSync(SCRIPT)) {
      resolve({ ok: false, error: '阅读器脚本丢了：' + SCRIPT })
      return
    }
    const cred = resolveCredPath(cfg, home)
    const env = {
      ...process.env,
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
      BILI_STUDY_CRED: cred || '',
    }
    const child = spawn(python, [SCRIPT, ...args], {
      cwd: home,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    const toText = (buf) => {
      try {
        const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf))
        const u = b.toString('utf8')
        if (!u.includes('\uFFFD')) return u
        try { return new TextDecoder('gbk').decode(b) } catch { return u }
      } catch { return String(buf) }
    }
    child.stdout?.on('data', (b) => { out += toText(b) })
    child.stderr?.on('data', (b) => { err += toText(b) })
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* 已经退出 */ }
    }, timeoutMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ ok: false, error: '启动 Python 失败：' + String(e?.message ?? e) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const lines = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      let parsed = null
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]
        if (!line.startsWith('{') && !line.startsWith('[')) continue
        try { parsed = JSON.parse(line); break } catch { /* 继续往前找 */ }
      }
      if (!parsed) {
        resolve({
          ok: false,
          error: `阅读器没有返回 JSON（exit=${code}）：${(err || out).trim().slice(-300) || '没有输出'}`,
        })
        return
      }
      if (parsed.ok === false && !parsed.error) parsed.error = '阅读器返回失败（没有说明原因）'
      resolve(parsed)
    })
  })
}

export function whoami(cfg, home) {
  return runReader(['whoami'], { cfg, home, timeoutMs: 30_000 })
}

export function search(cfg, home, keyword, { pages = 2, order = 'pubdate', limit = 20 } = {}) {
  return runReader(['search', '--keyword', keyword, '--pages', String(pages), '--order', order, '--limit', String(limit)], { cfg, home })
}

export function videoInfo(cfg, home, bvid) {
  return runReader(['info', '--bvid', bvid], { cfg, home, timeoutMs: 40_000 })
}

export function subtitle(cfg, home, bvid) {
  return runReader(['subtitle', '--bvid', bvid], { cfg, home, timeoutMs: 60_000 })
}

export function material(cfg, home, bvid, maxChars = 30000) {
  return runReader(['material', '--bvid', bvid, '--max-chars', String(maxChars)], { cfg, home, timeoutMs: 90_000 })
}

export function readerPath() {
  return SCRIPT
}
