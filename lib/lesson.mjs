/**
 * lib/lesson.mjs —— 一节课的完整流水线
 *
 *   找课（搜索 / 队列 → 挑有字幕的）
 *     → 读（把字幕原文取下来）
 *     → 学（把字幕交给一个最小权限的 headless 会话，要求它只回 JSON 笔记）
 *     → 归档（写笔记 md + 复习卡 + 日报 + 进度）
 *
 * 为什么不用工具调用、而用「一次性提示词」：
 *   这一轮只需要读 + 想 + 写，不需要碰文件/命令/网络；把权限关到最小，
 *   它就不可能因为乱翻文件或联网把事搞砸。字幕由宿主预取好递进去。
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as bili from './bili.mjs'
import * as files from './files.mjs'
import { appendLog, clamp, dayKey, dshHome, nowIso } from './paths.mjs'
import * as store from './store.mjs'

export const PLUGIN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── headless 运行 ────────────────────────────────────────────────────────────
export function ensureProfile(cfg) {
  const name = String(cfg.headlessProfile || 'bili-study').trim() || 'bili-study'
  const target = join(dshHome(), 'profiles', name)
  const template = join(PLUGIN_DIR, 'profile-template', 'bili-study')
  if (existsSync(join(target, 'package.json')) && existsSync(join(target, 'cordis.patch.yml'))) {
    return { ok: true, dir: target, created: false }
  }
  if (!existsSync(template)) return { ok: false, dir: target, error: '模板目录丢了：' + template }
  try {
    mkdirSync(target, { recursive: true })
    cpSync(template, target, { recursive: true, force: true })
    return { ok: true, dir: target, created: true }
  } catch (e) {
    return { ok: false, dir: target, error: String(e?.message ?? e) }
  }
}

function resolveDsh(cfg) {
  const custom = String(cfg.dshBin || '').trim()
  if (custom) {
    if (custom.endsWith('.js') || custom.endsWith('.mjs')) {
      return { command: process.execPath, args: [custom], shell: false, how: 'dshBin' }
    }
    return { command: custom, args: [], shell: false, how: 'dshBin' }
  }
  if (process.versions.electron) {
    const res = process.resourcesPath || join(dirname(process.execPath), 'resources')
    const bin = join(res, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    if (existsSync(bin)) return { command: process.execPath, args: [bin], shell: false, how: 'electron' }
  }
  return { command: 'dsh', args: [], shell: true, how: 'PATH' }
}

/**
 * 指定了模型时写一份一次性 overlay（把 agent-default-model 换掉）。
 * 没指定就返回 null，让 profile 自己的 deepseek-account / deepseek-flash 生效。
 */
export function ensureOverlay(cfg, home) {
  const provider = String(cfg.modelProvider || '').trim()
  const model = String(cfg.modelName || '').trim()
  if (!provider || !model) return null
  const file = join(home, 'headless-overlay.yml')
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`
  const yml = [
    '# 由 dsh-bili-study 生成：只覆盖这一轮的模型',
    '- id: agent-default-model',
    '  config:',
    `    provider: ${q(provider)}`,
    `    model: ${q(model)}`,
    '',
  ].join('\n')
  try {
    writeFileSync(file, yml, 'utf8')
    return file
  } catch {
    return null
  }
}

/**
 * 跑一次 headless：提示词走 stdin（`-`），避过 Windows 32k 命令行限制。
 */
export function runHeadless({ cfg, home, prompt, timeoutMs = 12 * 60_000, onLog, patchFile = null }) {
  return new Promise((resolve) => {
    const prof = ensureProfile(cfg)
    if (!prof.ok) {
      resolve({ ok: false, error: '最小权限 profile 铺不上：' + prof.error })
      return
    }
    const dsh = resolveDsh(cfg)
    const profile = String(cfg.headlessProfile || 'bili-study').trim() || 'bili-study'
    const args = [...dsh.args, '--profile', profile]
    if (patchFile) args.push('--patch', patchFile)
    // --json：把「思考过程」和「最终答案」分开输出（final 事件才是答案）
    args.push('--json', '-')
    const env = {
      ...process.env,
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
    }
    if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1'
    const t0 = Date.now()
    let child
    try {
      child = spawn(dsh.command, args, {
        cwd: home,
        env,
        shell: dsh.shell,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (e) {
      resolve({ ok: false, error: '起不了 headless 进程：' + String(e?.message ?? e) })
      return
    }
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
      appendLog(home, `⚠️ headless 超时（${Math.round(timeoutMs / 60000)} 分钟），已中止`)
      try { child.kill('SIGTERM') } catch { /* 忽略 */ }
      const t = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* 忽略 */ } }, 5000)
      t.unref?.()
    }, timeoutMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ ok: false, error: 'headless 启动失败：' + String(e?.message ?? e) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      // --json 是 NDJSON：只认 final 事件，别把 thinking / 诊断行当成答案
      let finalText = ''
      let usage = null
      const thinking = []
      for (const line of out.split(/\r?\n/)) {
        if (!line.startsWith('{')) continue
        try {
          const ev = JSON.parse(line)
          if (ev?.type === 'final' && typeof ev.text === 'string') finalText = ev.text
          if (ev?.type === 'status' && ev.usage) usage = ev.usage
          if (ev?.type === 'thinking' && typeof ev.text === 'string') thinking.push(ev.text)
        } catch { /* 不是事件行就跳过 */ }
      }
      appendLog(home, `headless 结束：code=${code}，用时 ${Math.round((Date.now() - t0) / 1000)}s，最终答案 ${finalText.length} 字${usage ? `，token ${usage.totalTokens}` : ''}`)
      if (!finalText && thinking.length) appendLog(home, `（这一轮只产生了思考，没有最终答案：${thinking.join(' ').slice(0, 400)}）`)
      onLog?.(finalText ? `最终答案 ${finalText.length} 字` : `没有最终答案（code=${code}）`)
      resolve({ ok: code === 0, code, stdout: finalText || out, raw: out, stderr: err, ms: Date.now() - t0, usage })
    })
    try {
      child.stdin.write(prompt, 'utf8')
      child.stdin.end()
    } catch (e) {
      appendLog(home, '写提示词失败：' + String(e?.message ?? e))
    }
  })
}

// ── 提示词 ───────────────────────────────────────────────────────────────────
export function buildPrompt({ topic, unit, info, transcript, cfg, kind = 'video' }) {
  const isFile = kind === 'file'
  const level = String(cfg.noteLevel || 'standard')
  const spec = level === 'deep'
    ? '笔记正文 1500-2500 字；keyPoints 6-9 条；cards 6-8 张。'
    : level === 'brief'
      ? '笔记正文 400-800 字；keyPoints 3-4 条；cards 3-4 张。'
      : '笔记正文 800-1500 字；keyPoints 3-6 条；cards 4-6 张。'
  const remaining = (topic.plan || []).filter((u) => u.status !== 'done').map((u) => u.title).slice(0, 8)
  const head = [
    `你是一位学习教练，正在带学生系统学《${topic.name}》。`,
    '',
    '【这一课】',
    `主题：${topic.name}${topic.goal ? `（目标：${topic.goal}）` : ''}`,
    `本次单元：${unit?.title || '入门'}`,
  ]
  if (isFile) {
    head.push(
      `资料：《${info.name || info.title || info.path}》`,
      `路径：${info.path || ''}`,
      `类型：${info.ext || ''} · ${Math.round((Number(info.size) || 0) / 1024)} KB · 抽取 ${info.chars || transcript.length} 字`,
    )
  } else {
    head.push(
      `视频：《${info.title}》`,
      `UP：${info.up || '未知'} · 时长：${Math.round((info.duration || 0) / 60)} 分钟`,
      `链接：https://www.bilibili.com/video/${info.bvid}`,
    )
  }
  if (remaining.length) head.push(`这门课后面还要学：${remaining.join(' / ')}`)
  head.push(
    '',
    isFile ? '【资料原文】（从本地文件抽取，段落顺序保留；可能缺少图表里的信息）' : '【字幕原文】（从视频里提取，按时间顺序；没有画面信息）',
    '<<<',
    transcript,
    '>>>',
    '',
    '【任务】',
    isFile
      ? '把这份资料读进去，写一份**之后能用来复习、做题**的笔记。不要照抄原文，要提炼结构、讲清因果。'
      : '把这条视频学进去，写一份**之后能用来复习、做题**的笔记。不要复述字幕，要提炼、要讲清因果。',
    '',
    '【硬性要求】',
    isFile
      ? '1. 只写资料里真的有的内容。资料没有展开、只有结论的地方，放进 questions，宁可留白也不要编。'
      : '1. 只写字幕里真的讲了的内容。字幕没讲清的地方，放进 questions，宁可留白也不要编。',
    '2. 概念定义要准确；公式用 LaTeX（行内 $...$，独立公式用 $$...$$）。',
    `3. ${spec}`,
    '4. 只输出**一个 JSON 对象**，不要任何解释文字，不要 markdown 围栏之外的内容。',
    '5. JSON 结构（字段一个都不能少，没有内容就给空数组）：',
    '{',
    isFile
      ? '  "summary": "3-5 句话：这份资料讲什么、核心结论是什么",'
      : '  "summary": "3-5 句话：这个视频解决什么问题、核心结论是什么",',
    isFile
      ? '  "keyPoints": [{"point": "要点", "t": ""}],'
      : '  "keyPoints": [{"point": "要点", "t": "mm:ss"}],',
    '  "concepts": [{"name": "概念", "explain": "一句人话解释"}],',
    '  "formulas": [{"expr": "LaTeX 公式", "meaning": "每个符号是什么", "when": "什么时候用 / 成立条件"}],',
    '  "examples": ["例题或例子，带关键步骤"],',
    '  "pitfalls": ["最容易错的点，写成“别把 X 当成 Y”"],',
    '  "questions": ["看完还没弄懂的，1-3 条"],',
    '  "cards": [{"q": "问答题", "a": "1-3 句答案"}],',
    '  "next": ["下一步建议学什么，1-3 条"]',
    '}',
    '6. cards 只考最值得记的（定义、判据、公式适用条件、易错点），不要考细枝末节。',
  )
  return head.join('\n')
}

// ── 解析模型输出 ─────────────────────────────────────────────────────────────
function asArray(v) {
  return Array.isArray(v) ? v : []
}

/** 把字幕还原成带时间戳的文本：每 8 秒左右标一个 [mm:ss]，既省 token 又不让模型瞎猜时间 */
export function formatTranscript(material, maxChars = 32000) {
  const lines = Array.isArray(material?.lines) ? material.lines : []
  let text = ''
  if (lines.length) {
    const parts = []
    let lastT = -999
    for (const ln of lines) {
      const t = Number(ln?.t) || 0
      const body = String(ln?.text || '').trim()
      if (!body) continue
      if (t - lastT >= 8) {
        const mm = String(Math.floor(t / 60)).padStart(2, '0')
        const ss = String(Math.floor(t % 60)).padStart(2, '0')
        parts.push(`[${mm}:${ss}] ${body}`)
        lastT = t
      } else {
        parts.push(body)
      }
    }
    text = parts.join('\n')
  } else {
    text = String(material?.subtitle?.text || '')
  }
  const limit = Math.max(4000, Number(maxChars) || 32000)
  if (text.length > limit) {
    const head = Math.floor(limit * 0.85)
    text = text.slice(0, head) + `\n…（后面还有 ${text.length - limit} 字，已略）…\n` + text.slice(-Math.floor(limit * 0.1))
  }
  return text
}

function asStrings(v, max = 12) {
  return asArray(v)
    .map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? String(x.point || x.text || x.name || '') : ''))
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max)
}

export function parseLesson(text) {
  const raw = String(text || '')
  const candidates = []
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi
  let m
  while ((m = fence.exec(raw))) candidates.push(m[1])
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1))
  candidates.push(raw)
  let data = null
  for (const c of candidates) {
    try {
      const j = JSON.parse(c)
      if (j && typeof j === 'object') { data = j; break }
    } catch { /* 换下一个 */ }
  }
  if (!data) throw new Error('模型没有输出合法 JSON')
  const lesson = {
    summary: String(data.summary || '').trim(),
    keyPoints: asArray(data.keyPoints).map((k) => (typeof k === 'string' ? { point: k, t: '' } : { point: String(k?.point || k?.text || ''), t: String(k?.t || '') })).filter((k) => k.point).slice(0, 12),
    concepts: asArray(data.concepts).map((c) => (typeof c === 'string' ? { name: c, explain: '' } : { name: String(c?.name || ''), explain: String(c?.explain || c?.desc || '') })).filter((c) => c.name).slice(0, 14),
    formulas: asArray(data.formulas).map((f) => (typeof f === 'string' ? { expr: f, meaning: '', when: '' } : { expr: String(f?.expr || f?.formula || ''), meaning: String(f?.meaning || ''), when: String(f?.when || '') })).filter((f) => f.expr).slice(0, 12),
    examples: asStrings(data.examples, 8),
    pitfalls: asStrings(data.pitfalls, 8),
    questions: asStrings(data.questions, 6),
    next: asStrings(data.next, 4),
    cards: asArray(data.cards).map((c) => {
      if (typeof c === 'string') {
        const [q, a] = c.split('||')
        return { q: String(q || '').trim(), a: String(a || '').trim() }
      }
      return { q: String(c?.q || c?.question || '').trim(), a: String(c?.a || c?.answer || '').trim() }
    }).filter((c) => c.q && c.a).slice(0, 10),
  }
  if (!lesson.summary && !lesson.cards.length) throw new Error('模型输出里既没有 summary 也没有 cards')
  return lesson
}

// ── 找课 ─────────────────────────────────────────────────────────────────────
/** 跑一次学习轮并解析出结构化笔记（视频/资料共用） */
async function produceLesson({ cfg, home, prompt, log }) {
  const timeoutMs = Math.max(2, Number(cfg.runTimeoutMinutes) || 12) * 60_000
  const patchFile = ensureOverlay(cfg, home)
  let res = await runHeadless({ cfg, home, prompt, timeoutMs, patchFile, onLog: (t) => log(t.trim()) })
  if (!res.ok && !res.stdout?.trim()) {
    throw new Error(`学习轮没跑起来（exit=${res.code}）：${(res.stderr || '').trim().slice(-300) || '没有输出'}`)
  }
  let lesson
  try {
    lesson = parseLesson(res.stdout)
  } catch (e) {
    log('输出不是合法 JSON，重试一次：' + String(e?.message ?? e))
    const retryPrompt = prompt + '\n\n【重要】上一次的输出不是合法 JSON。这一次只输出 JSON 对象本身，不要任何前后文字，也不要 markdown 围栏。'
    res = await runHeadless({ cfg, home, prompt: retryPrompt, timeoutMs, patchFile, onLog: (t) => log(t.trim()) })
    lesson = parseLesson(res.stdout)
  }
  const maxCards = Math.max(0, Number(cfg.cardsPerNote) || 0)
  if (maxCards > 0) lesson.cards = lesson.cards.slice(0, maxCards)
  return lesson
}

function inRange(duration, cfg) {
  const min = Math.max(1, Number(cfg.minMinutes) || 4) * 60
  const max = Math.max(min + 60, Number(cfg.maxMinutes) || 75) * 60
  return duration >= min && duration <= max
}

function scoreCandidate(it, unit, topic) {
  let s = Math.log10(1 + (Number(it.play) || 0)) * 10
  const title = String(it.title || '')
  if (unit && title.includes(String(unit.title).slice(0, 4))) s += 6
  if (title.includes(topic.name)) s += 4
  if ((Number(it.duration) || 0) < 20 * 60) s += 2
  if (it.status === 'candidate') s += 1
  return s
}

async function pickWithSubtitle({ cfg, home, topic, unit, log, bvid = '' }) {
  const wanted = String(bvid || '').trim()
  if (wanted) {
    log(`学指定视频：${wanted}`)
    const r = await bili.material(cfg, home, wanted, clamp(cfg.maxTranscriptChars || 32000, 8000, 60000))
    if (!r.ok) return { ok: false, error: `这条视频取不到：${r.error || '未知原因'}` }
    if (!r.subtitle?.ok || !r.subtitle.text) {
      return { ok: false, error: `${r.subtitle?.error || '这条视频没有字幕'}；换一条有字幕（CC / AI 字幕）的吧` }
    }
    store.pinVideo(home, topic.id, { bvid: r.info.bvid, title: r.info.title, up: r.info.up, duration: r.info.duration })
    return { ok: true, info: r.info, material: r, explicit: true }
  }

  const watched = new Set(store.listNotes(home, { limit: 1000 }).map((n) => n.bvid))
  const queueAll = store.queueFor(home, topic.id).filter((q) => !watched.has(q.bvid))
  // 用户自己挑的视频排最前，且不受时长范围限制（他明确选了，就学它）
  const selected = queueAll.filter((q) => q.status === 'selected')
  const queue = queueAll.filter((q) => q.status === 'candidate' && inRange(q.duration, cfg))
  const merged = new Map()
  for (const q of selected) merged.set(q.bvid, { ...q, status: 'selected' })
  for (const q of queue) merged.set(q.bvid, { ...q, status: 'candidate' })

  if (merged.size < 3) {
    const base = String(unit?.title || topic.name).split(/[：:（(]/)[0].trim()
    const queries = [...new Set([
      `${base} ${topic.name}`.trim(),
      topic.name,
      ...(topic.keywords || []).slice(0, 2),
    ].filter(Boolean))].slice(0, 2)
    for (const keyword of queries) {
      log(`搜课：${keyword}`)
      const r = await bili.search(cfg, home, keyword, {
        pages: clamp(cfg.searchPages || 2, 1, 5),
        order: 'click',
        limit: 30,
      })
      if (!r.ok) { log('搜索失败：' + (r.error || '未知')); continue }
      for (const it of r.items || []) {
        if (!it?.bvid || watched.has(it.bvid) || merged.has(it.bvid)) continue
        if (!inRange(it.duration, cfg)) continue
        merged.set(it.bvid, { ...it, status: 'searched' })
      }
      if (merged.size >= 12) break
    }
  }

  const rest = [...merged.values()]
    .filter((x) => x.status !== 'selected')
    .sort((a, b) => scoreCandidate(b, unit, topic) - scoreCandidate(a, unit, topic))
  const ranked = [
    ...selected.map((x) => merged.get(x.bvid)).filter(Boolean),
    ...rest,
  ]
  if (!ranked.length) return { ok: false, error: `没搜到合适的视频（时长 ${cfg.minMinutes}-${cfg.maxMinutes} 分钟）` }

  store.addQueue(home, topic.id, rest.slice(0, 40))

  const probes = ranked.slice(0, Math.max(1, clamp(cfg.probeCount || 4, 1, 6)))
  for (const cand of probes) {
    log(`试读：${cand.bvid}《${cand.title}》`)
    const r = await bili.material(cfg, home, cand.bvid, clamp(cfg.maxTranscriptChars || 32000, 8000, 60000))
    if (!r.ok) { log('  跳过：' + (r.error || '取素材失败')); store.markQueue(home, topic.id, cand.bvid, 'skipped'); continue }
    if (!r.subtitle?.ok || !r.subtitle.text) {
      log('  跳过：没有字幕')
      store.markQueue(home, topic.id, cand.bvid, 'skipped')
      continue
    }
    return { ok: true, info: r.info, material: r }
  }
  return { ok: false, error: `连试 ${probes.length} 条都没有字幕。可以换关键词、自己指定一条视频，或在设置里放宽时长范围。` }
}

// ── 一节课 ───────────────────────────────────────────────────────────────────
export async function runLesson({ cfg, home, topicKey = '', source = 'auto', bvid = '', log = () => {} }) {
  const runNow = store.readRun(home)
  if (runNow.running) return { ok: false, busy: true, error: '上一课还没跑完' }

  const startedAt = nowIso()
  store.writeRun(home, { running: true, startedAt, phase: '准备', source, requestedBvid: String(bvid || '') })

  try {
    store.ensureSeeded(home)
    let topic = store.findTopic(home, topicKey) || store.loadTopics(home)[0]
    if (!topic) throw new Error('一个学习主题都没有：先去设置页加一个')
    let unit = store.currentUnit(topic)
    if (!unit) {
      store.addUnits(home, topic.id, ['入门：先建立整体框架'])
      topic = store.findTopic(home, topic.id)
      unit = store.currentUnit(topic)
    }
    log(`这一课：${topic.name} / ${unit?.title || '入门'}`)

    store.writeRun(home, { running: true, startedAt, phase: '找课', source, topicName: topic.name, unit: unit?.title || '', requestedBvid: String(bvid || '') })
    const picked = await pickWithSubtitle({ cfg, home, topic, unit, log, bvid })
    if (!picked.ok) throw new Error(picked.error)

    const { info, material } = picked
    const transcript = formatTranscript(material, cfg.maxTranscriptChars)
    if (!transcript.trim()) throw new Error('字幕是空的')

    store.writeRun(home, {
      running: true, startedAt, phase: '学习', source,
      topicName: topic.name, unit: unit?.title || '',
      bvid: info.bvid, title: info.title,
    })
    const prompt = buildPrompt({ topic, unit, info, transcript, cfg })
    const lesson = await produceLesson({ cfg, home, prompt, log })

    store.writeRun(home, {
      running: true, startedAt, phase: '归档', source,
      topicName: topic.name, unit: unit?.title || '',
      bvid: info.bvid, title: info.title,
    })
    const saved = store.saveNote(home, { topic, unit, info, lesson, source })
    // lesson.next 只写进笔记的「下一步」，不再自动塞进学习计划
    // （计划是路线，不是模型每次的临场建议；否则学几课就会多出十几条长标题）

    const digestFile = store.writeDigest(home, {
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      title: `《${info.title}》`,
      lines: [
        `主题：${topic.name} · 单元：${unit?.title || '入门'}`,
        lesson.summary ? `一句话：${lesson.summary}` : '',
        `视频：${info.up || '未知 UP'} · ${Math.round((info.duration || 0) / 60)} 分钟 · https://www.bilibili.com/video/${info.bvid}`,
        `笔记：notes/${topic.id}/${info.bvid}.md · 新复习卡 ${saved.cards.length} 张`,
      ],
    })

    const result = {
      ok: true,
      noteId: saved.note.id,
      bvid: info.bvid,
      title: info.title,
      up: info.up,
      duration: info.duration,
      summary: lesson.summary,
      cards: saved.cards.length,
      digest: digestFile,
      noteFile: saved.file,
      transcriptChars: transcript.length,
      clipped: Boolean(material.subtitle?.clipped),
    }
    store.writeRun(home, { running: false, startedAt, finishedAt: nowIso(), phase: '完成', source, ok: true, result })
    return result
  } catch (e) {
    const msg = String(e?.message ?? e)
    appendLog(home, '这一课没学成：' + msg)
    store.writeRun(home, { running: false, startedAt, finishedAt: nowIso(), phase: '失败', source, ok: false, error: msg })
    store.writeDigest(home, {
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      title: '这一课没学成',
      lines: [`原因：${msg}`, '修好后可以在设置页点「学一课」，或等下一次定时。'],
    })
    return { ok: false, error: msg }
  }
}

// ── 本地资料：读文件 → 提炼 → 笔记 ─────────────────────────────────────────
export async function runFileLesson({ cfg, home, topicKey = '', path = '', materialId = '', source = 'manual', log = () => {} }) {
  const runNow = store.readRun(home)
  if (runNow.running) return { ok: false, busy: true, error: '上一课还没跑完' }

  const startedAt = nowIso()
  store.writeRun(home, { running: true, startedAt, phase: '准备', source, kind: 'file', filePath: String(path || '') })

  try {
    store.ensureSeeded(home)
    let topic = store.findTopic(home, topicKey) || store.loadTopics(home)[0]
    if (!topic) throw new Error('一个学习主题都没有：先去设置页加一个')

    let mat = materialId ? store.findMaterial(home, materialId) : (path ? store.findMaterial(home, path) : null)
    const target = path || mat?.path || ''
    if (!target) throw new Error('没有给文件路径')

    store.writeRun(home, { running: true, startedAt, phase: '读资料', source, kind: 'file', topicName: topic.name, filePath: target })
    const info = await files.info(cfg, target)
    if (!info.ok) throw new Error(info.error || '读不到这个文件')

    if (!mat) {
      mat = store.addMaterial(home, {
        id: files.idForPath(info.path),
        topicId: topic.id,
        path: info.path,
        name: info.name,
        ext: info.ext,
        size: info.size,
        mtime: info.mtime,
      })
    }
    const maxChars = Math.max(8000, Number(cfg.maxTranscriptChars) || 32000)
    const r = await files.read(cfg, info.path, maxChars)
    if (!r.ok) {
      store.markMaterial(home, mat.id, { status: 'failed', error: String(r.error || '读取失败') })
      throw new Error(r.error || '读取失败')
    }
    const text = String(r.text || '').trim()
    if (!text) throw new Error('这个文件里没抽到可用文字')

    let unit = store.currentUnit(topic)
    if (!unit) {
      store.addUnits(home, topic.id, ['入门：先建立整体框架'])
      topic = store.findTopic(home, topic.id)
      unit = store.currentUnit(topic)
    }

    store.writeRun(home, {
      running: true, startedAt, phase: '学习', source, kind: 'file',
      topicName: topic.name, unit: unit?.title || '',
      filePath: info.path, title: info.name,
    })
    const prompt = buildPrompt({
      topic,
      unit,
      info: { ...info, kind: 'file', ref: mat.id, chars: r.chars },
      transcript: text,
      cfg,
      kind: 'file',
    })
    const lesson = await produceLesson({ cfg, home, prompt, log })

    store.writeRun(home, {
      running: true, startedAt, phase: '归档', source, kind: 'file',
      topicName: topic.name, unit: unit?.title || '',
      filePath: info.path, title: info.name,
    })
    const saved = store.saveNote(home, {
      topic,
      unit,
      info: {
        kind: 'file',
        ref: mat.id,
        path: info.path,
        name: info.name,
        title: info.title || info.name,
        ext: info.ext,
        size: info.size,
        duration: 0,
      },
      lesson,
      source,
    })
    store.markMaterial(home, mat.id, {
      status: 'summarized',
      noteId: saved.note.id,
      chars: r.chars,
      error: '',
      mtime: info.mtime,
      size: info.size,
    })

    const digestFile = store.writeDigest(home, {
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      title: `《${info.name}》`,
      lines: [
        `主题：${topic.name} · 单元：${unit?.title || '入门'}`,
        lesson.summary ? `一句话：${lesson.summary}` : '',
        `资料：${info.path} · 抽取 ${r.chars} 字${r.clipped ? '（已截断）' : ''}`,
        `笔记：notes/${topic.id}/${mat.id}.md · 新复习卡 ${saved.cards.length} 张`,
      ],
    })

    const result = {
      ok: true,
      kind: 'file',
      noteId: saved.note.id,
      materialId: mat.id,
      title: info.name,
      path: info.path,
      chars: r.chars,
      summary: lesson.summary,
      cards: saved.cards.length,
      digest: digestFile,
      noteFile: saved.file,
    }
    store.writeRun(home, { running: false, startedAt, finishedAt: nowIso(), phase: '完成', source, kind: 'file', ok: true, result })
    return result
  } catch (e) {
    const msg = String(e?.message ?? e)
    appendLog(home, '这份资料没学成：' + msg)
    store.writeRun(home, { running: false, startedAt, finishedAt: nowIso(), phase: '失败', source, kind: 'file', ok: false, error: msg })
    store.writeDigest(home, {
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      title: '这份资料没学成',
      lines: [`原因：${msg}`, '修好后在「资料」页再点一次「总结」。'],
    })
    return { ok: false, error: msg }
  }
}

// ── 环境自检 ─────────────────────────────────────────────────────────────────
export function environment(cfg) {
  const py = bili.resolvePython(cfg)
  const docPy = files.resolveDocPython(cfg)
  const cred = bili.resolveCredPath(cfg)
  const prof = join(dshHome(), 'profiles', String(cfg.headlessProfile || 'bili-study'))
  const dsh = resolveDsh(cfg)
  return {
    python: py || '',
    pythonOk: Boolean(py),
    docPython: docPy || '',
    docPythonOk: Boolean(docPy),
    credentialPath: cred,
    credentialOk: Boolean(cred && existsSync(cred)),
    profileDir: prof,
    profileOk: existsSync(join(prof, 'cordis.patch.yml')),
    dsh: dsh.how,
    dshCommand: dsh.command,
    reader: bili.readerPath(),
    readerOk: existsSync(bili.readerPath()),
    notesDir: join(dshHome(), 'bili-study', 'notes'),
    outDir: join(dshHome(), 'bili-study', 'out'),
    pluginDir: PLUGIN_DIR,
  }
}

export function listPluginFiles() {
  try {
    return readdirSync(PLUGIN_DIR)
  } catch {
    return []
  }
}
