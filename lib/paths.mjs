/**
 * lib/paths.mjs —— 插件家目录、时间、JSON 读写、日志
 *
 * 规矩：配置 / 笔记 / 复习卡 / 日志一律放在 `$DSH_HOME/bili-study/`，
 * 绝不写进插件包目录（那里可能只读，升级也会被覆盖）。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

export function stateDir() {
  const dir = join(dshHome(), 'bili-study')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function ensureHome(home) {
  for (const d of [home, join(home, 'notes'), join(home, 'out')]) mkdirSync(d, { recursive: true })
  return home
}

export function readJson(file, fallback) {
  try {
    const text = readFileSync(file, 'utf8')
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

/** 原子写：先写 .tmp 再 rename，避免半个 JSON 把下一轮卡死 */
export function writeJson(file, value) {
  try {
    mkdirSync(dirname(file), { recursive: true })
    const tmp = file + '.tmp'
    writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
    renameSync(tmp, file)
  } catch {
    // 落盘失败不能把宿主带走；调用方需要时自己再读一次
  }
}

export function appendLog(home, msg) {
  const line = `${new Date().toISOString()}  ${msg}\n`
  try {
    mkdirSync(home, { recursive: true })
    appendFileSync(join(home, 'study.log'), line, 'utf8')
  } catch {
    /* 日志写不进去不致命 */
  }
}

export function pad2(n) {
  return String(n).padStart(2, '0')
}

/** 本地日期（不是 UTC）—— 学习统计按用户所在时区算 */
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function clockText(d = new Date()) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function nowIso() {
  return new Date().toISOString()
}

export function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function clamp(n, lo, hi) {
  const v = Number(n)
  if (!Number.isFinite(v)) return lo
  return Math.max(lo, Math.min(hi, v))
}

export function exists(p) {
  try {
    return existsSync(p)
  } catch {
    return false
  }
}

export function truncate(s, n) {
  const t = String(s ?? '')
  return t.length <= n ? t : t.slice(0, n) + '…'
}

/** "20:30" -> 1230；非法值回退 20:30 */
export function parseClock(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim())
  if (!m) return 20 * 60 + 30
  return Math.max(0, Math.min(23, Number(m[1]))) * 60 + Math.max(0, Math.min(59, Number(m[2])))
}

export function formatDuration(sec) {
  const s = Math.max(0, Number(sec) || 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h} 小时 ${m} 分`
  return `${m} 分钟`
}
