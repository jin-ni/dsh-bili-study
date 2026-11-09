/**
 * dsh-bili-study —— 「B站学习」host 半端
 * ============================================================================
 * 它是什么：
 *   1. 设置页「B站学习」：主题 / 学习计划 / 进度 / 笔记 / 资料 / 复习卡 / 一键「学一课」；
 *   2. 13 个工具：查进度、搜课、读字幕、自选视频、编辑单元、本地资料、存笔记、复习卡；
 *   3. 定时自动学：到点后自己找一条有字幕的视频，读进去、写笔记、出卡、写日报；
 *   4. 本地资料：加文件 / 扫文件夹 / 搜文件 → 抽文字 → 同一套笔记与复习卡；
 *   5. 一个最小权限 profile（bili-study）：自动学习轮只拿得到模型，拿不到文件/命令/网络。
 *
 * 数据都在 $DSH_HOME/bili-study/，绝不写进插件包。
 * ============================================================================
 */
import { loadHostDeps } from './lib/hostdeps.mjs'

const hostDeps = await loadHostDeps()
const z = hostDeps.z
const defineTool = hostDeps.defineTool

import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as store from './lib/store.mjs'
import * as bili from './lib/bili.mjs'
import * as files from './lib/files.mjs'
import * as lesson from './lib/lesson.mjs'
import * as login from './lib/login.mjs'
import { appendLog, clamp, clockText, dayKey, dshHome, formatDuration, nowIso, parseClock, readJson, stateDir, writeJson } from './lib/paths.mjs'

export const name = 'bili-study'
export const inject = ['webServer', 'tools', 'settings']

export const Config = !z ? undefined : z.object({
  /** 到点自动学 */
  auto: z.boolean().default(true).extra('volatile', true),
  /** 每天几点开始学（HH:MM） */
  studyAt: z.string().default('21:00').extra('volatile', true),
  /** 每天最多学几课 */
  maxPerDay: z.natural().default(1).extra('volatile', true),
  /** 只学这个时长区间的视频（分钟） */
  minMinutes: z.natural().default(4).extra('volatile', true),
  maxMinutes: z.natural().default(75).extra('volatile', true),
  /** 每条笔记出几张复习卡 */
  cardsPerNote: z.natural().default(6).extra('volatile', true),
  /** 笔记详细程度：brief / standard / deep */
  noteLevel: z.string().default('standard').extra('volatile', true),
  /** Python（留空 = 自动找「刷B站」的 venv，再退到 PATH） */
  pythonPath: z.string().default('').extra('volatile', true),
  /** 凭证文件（留空 = 自动找自己的，再找「刷B站」的） */
  credentialPath: z.string().default('').extra('volatile', true),
  /** dsh 的 bin.js（留空 = 桌面版自动定位） */
  dshBin: z.string().default('').extra('volatile', true),
  /** 自动学习轮用哪个 profile */
  headlessProfile: z.string().default('bili-study').extra('volatile', true),
  /** 指定模型（留空 = 用 profile 默认的 deepseek-account / deepseek-flash） */
  modelProvider: z.string().default('').extra('volatile', true),
  modelName: z.string().default('').extra('volatile', true),
  /** 一课最多跑多久（分钟） */
  runTimeoutMinutes: z.natural().default(12).extra('volatile', true),
  /** 字幕最多递给模型多少字 */
  maxTranscriptChars: z.natural().default(32000).extra('volatile', true),
  /** 最多试读几条候选视频（找有字幕的） */
  probeCount: z.natural().default(4).extra('volatile', true),
  /** 搜索翻几页 */
  searchPages: z.natural().default(2).extra('volatile', true),
  /** 资料文件夹（「资料」页默认从这里扫描 / 搜索） */
  filesDir: z.string().default('').extra('volatile', true),
})

const DEFAULTS = {
  auto: true,
  studyAt: '21:00',
  maxPerDay: 1,
  minMinutes: 4,
  maxMinutes: 75,
  cardsPerNote: 6,
  noteLevel: 'standard',
  pythonPath: '',
  credentialPath: '',
  dshBin: '',
  headlessProfile: 'bili-study',
  modelProvider: '',
  modelName: '',
  runTimeoutMinutes: 12,
  maxTranscriptChars: 32000,
  probeCount: 4,
  searchPages: 2,
  filesDir: '',
}

export function apply(ctx, config) {
  const home = stateDir()
  store.ensureSeeded(home)

  let myVer = ''
  const version = () => {
    if (myVer) return myVer
    try { myVer = String(JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf8')).version || '') } catch { myVer = '0.0.0' }
    return myVer
  }

  const log = (msg) => {
    appendLog(home, msg)
    try { ctx.logger?.info?.(`[bili-study] ${msg}`) } catch { /* 没有 logger 就算了 */ }
  }
  for (const n of hostDeps.notes) log(n)

  // ── 配置 ────────────────────────────────────────────────────────────────
  const normalize = (src, base) => {
    const out = { ...base }
    for (const k of Object.keys(base)) {
      const v = src?.[k]
      if (v === undefined || v === null) continue
      if (typeof base[k] === 'boolean') { if (typeof v === 'boolean') out[k] = v }
      else if (typeof base[k] === 'number') { const n = Number(v); if (Number.isFinite(n)) out[k] = n }
      else if (typeof base[k] === 'string') { if (typeof v === 'string') out[k] = v }
    }
    return out
  }
  const clampPatch = (p) => {
    const out = { ...p }
    if ('maxPerDay' in out) out.maxPerDay = clamp(out.maxPerDay, 0, 6)
    if ('minMinutes' in out) out.minMinutes = clamp(out.minMinutes, 1, 120)
    if ('maxMinutes' in out) out.maxMinutes = clamp(out.maxMinutes, 2, 300)
    if ('cardsPerNote' in out) out.cardsPerNote = clamp(out.cardsPerNote, 0, 12)
    if ('runTimeoutMinutes' in out) out.runTimeoutMinutes = clamp(out.runTimeoutMinutes, 1, 60)
    if ('maxTranscriptChars' in out) out.maxTranscriptChars = clamp(out.maxTranscriptChars, 4000, 60000)
    if ('probeCount' in out) out.probeCount = clamp(out.probeCount, 1, 6)
    if ('searchPages' in out) out.searchPages = clamp(out.searchPages, 1, 5)
    if ('noteLevel' in out && !['brief', 'standard', 'deep'].includes(String(out.noteLevel))) out.noteLevel = 'standard'
    if ('studyAt' in out) {
      const s = String(out.studyAt || '').trim()
      out.studyAt = /^\d{1,2}:\d{2}$/.test(s) ? s : '21:00'
    }
    if ('minMinutes' in out && 'maxMinutes' in out && out.maxMinutes <= out.minMinutes) out.maxMinutes = out.minMinutes + 10
    return out
  }

  const cfgFile = join(home, 'config.json')
  let touched = new Set()
  const settingsRows = () => {
    try { return ctx.settings?.describe?.() || [] } catch { return [] }
  }
  const settingsRow = () => settingsRows().find((r) => r && (
    r.ns === 'bili-study' || r.id === 'bili-study' || String(r.ns || '').endsWith(':bili-study')
  ))
  const loadCfg = () => {
    const local = readJson(cfgFile, {}) || {}
    const row = settingsRow()
    let out = normalize(row?.value && typeof row.value === 'object' ? row.value : config, { ...DEFAULTS })
    out = normalize(local, out)
    out = normalize(row?.user || {}, out)
    for (const k of touched) if (k in local) out[k] = local[k]
    return clampPatch(out)
  }
  const cfg = loadCfg()
  const refreshCfg = () => Object.assign(cfg, loadCfg())

  const persistCfg = async (patch) => {
    const clean = clampPatch(patch)
    Object.assign(cfg, clean)
    for (const k of Object.keys(clean)) if (k in DEFAULTS) touched.add(k)
    writeJson(cfgFile, { ...readJson(cfgFile, {}), ...clean })
    let hostOk = true
    try {
      const row = settingsRow()
      if (row?.ns && typeof ctx.settings?.update === 'function') {
        await ctx.settings.update(row.ns, clean, row.revision)
      }
    } catch (e) {
      hostOk = false
      log('写 DSH 原生设置失败（本地已保存）：' + String(e?.message ?? e))
    }
    return { ok: true, hostOk, cfg: { ...cfg } }
  }

  // ── 运行（同一时间只跑一课）─────────────────────────────────────────────
  let activeRun = null
  const pendingLogins = new Map()
  const startLesson = ({ topicKey = '', source = 'manual', bvid = '' } = {}) => {
    if (activeRun) return { started: false, busy: true, error: '上一课还没跑完' }
    if (store.readRun(home).running) return { started: false, busy: true, error: '上一课还没跑完' }
    refreshCfg()
    const opts = { cfg: { ...cfg }, home, topicKey, source, bvid: String(bvid || ''), log: (m) => log(m) }
    const run = lesson.runLesson(opts)
      .then((r) => {
        log(r.ok ? `学完一课：${r.title || r.bvid}（${r.cards} 张卡）` : `这一课没成：${r.error || r.busy}`)
        return r
      })
      .catch((e) => ({ ok: false, error: String(e?.message ?? e) }))
      .finally(() => { activeRun = null })
    activeRun = run
    return { started: true, hint: '已经开跑。用 bili_study_status 看进度，或等它自己写进日报。' }
  }

  /** 总结一份本地资料；也可以给 query + folder 让它先自己搜一条 */
  const startFileLesson = async ({ topicKey = '', source = 'manual', path = '', materialId = '', query = '', folder = '' } = {}) => {
    if (activeRun) return { started: false, busy: true, error: '上一课还没跑完' }
    if (store.readRun(home).running) return { started: false, busy: true, error: '上一课还没跑完' }
    refreshCfg()
    let usePath = String(path || '')
    if (!usePath && !materialId && String(query || '').trim()) {
      const dir = String(folder || cfg.filesDir || '').trim()
      if (!dir) return { started: false, error: '还没有设置资料文件夹：去「设置 → 资料文件夹」填一个，或直接给文件路径' }
      const found = await files.search(cfg, dir, String(query).trim(), 5)
      if (!found.ok) return { started: false, error: found.error || '搜索失败' }
      const hit = (found.results || [])[0]
      if (!hit) return { started: false, error: `在 ${dir} 里没搜到「${query}」` }
      usePath = hit.path
    }
    if (!usePath && !materialId) return { started: false, error: '给一个文件路径 / 资料 id，或 query + folder' }
    const opts = { cfg: { ...cfg }, home, topicKey, path: usePath, materialId, source, log: (m) => log(m) }
    const run = lesson.runFileLesson(opts)
      .then((r) => {
        log(r.ok ? `总结完资料：${r.title}（${r.cards} 张卡）` : `这份资料没成：${r.error || r.busy}`)
        return r
      })
      .catch((e) => ({ ok: false, error: String(e?.message ?? e) }))
      .finally(() => { activeRun = null })
    activeRun = run
    return { started: true, path: usePath, hint: '正在读文件、写笔记，约 1-3 分钟。' }
  }

  // ── 状态汇总 ────────────────────────────────────────────────────────────
  const topicBrief = (t) => {
    const plan = Array.isArray(t.plan) ? t.plan : []
    const done = plan.filter((u) => u.status === 'done').length
    const cur = store.currentUnit(t)
    const picks = store.selectedVideos(home, t.id).map((q) => ({
      bvid: q.bvid, title: q.title, up: q.up, duration: q.duration, status: q.status,
    }))
    return {
      id: t.id,
      name: t.name,
      keywords: t.keywords || [],
      goal: t.goal || '',
      stats: t.stats || {},
      progress: { done, total: plan.length, current: cur ? cur.title : '' },
      plan,
      picks,
    }
  }

  const status = () => {
    const sum = store.summary(home)
    const run = sum.run
    return {
      ok: true,
      version: version(),
      now: nowIso(),
      today: dayKey(),
      home,
      run,
      running: Boolean(run.running),
      state: sum.state,
      cards: sum.cards,
      topics: sum.topics.map(topicBrief),
      notes: sum.notes.slice(0, 8),
      materials: store.listMaterials(home, { limit: 50 }),
      materialCounts: (() => {
        const list = store.listMaterials(home, { limit: 100000 })
        return {
          total: list.length,
          new: list.filter((m) => m.status === 'new').length,
          summarized: list.filter((m) => m.status === 'summarized').length,
          failed: list.filter((m) => m.status === 'failed').length,
        }
      })(),
      due: store.dueCards(home, 3),
      config: { ...cfg },
      environment: lesson.environment(cfg),
      todayDigest: sum.today,
    }
  }

  // ── 工具 ────────────────────────────────────────────────────────────────
  const textOutput = {
    schema: { type: 'object', properties: {}, additionalProperties: true },
    render: (_args, value) => [{
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    }],
  }
  const safe = (v) => {
    if (v === undefined || v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
    try { return JSON.parse(JSON.stringify(v)) } catch { return String(v) }
  }
  const tool = (spec) => ctx.tools.register(defineTool({
    ...spec,
    output: spec.output || textOutput,
    async execute(args, exec) {
      try {
        return safe(await spec.execute(args || {}, exec))
      } catch (e) {
        return { ok: false, error: String(e?.message ?? e) }
      }
    },
  }))

  tool({
    name: 'bili_study_status',
    description: '看「B站学习」的进度：今天学了几课、连续天数、待复习卡、各主题与单元进度、下一课学什么。'
      + '学完一课 / 想知道有没有在跑时，先看它。',
    parameters: {},
    execute() { return status() },
  })

  tool({
    name: 'bili_study_topics',
    description: '管理学习主题：action=list（默认）/ add（name, keywords[], goal）/ update（id, name?）/ remove（id）。',
    parameters: {
      action: { type: 'string', description: 'list / add / update / remove' },
      id: { type: 'string', description: '主题 id（update / remove 用）' },
      name: { type: 'string', description: '主题名，如「自动控制原理」' },
      keywords: { type: 'array', items: { type: 'string' }, description: '搜课关键词' },
      goal: { type: 'string', description: '学习目标（一句话）' },
    },
    execute(args) {
      const action = String(args.action || 'list')
      if (action === 'add') {
        const t = store.addTopic(home, { name: args.name, keywords: args.keywords || [], goal: args.goal || '' })
        return { ok: true, topic: topicBrief(t) }
      }
      if (action === 'update') {
        const t = store.updateTopic(home, String(args.id || ''), { name: args.name, keywords: args.keywords, goal: args.goal })
        return { ok: true, topic: topicBrief(t) }
      }
      if (action === 'remove') {
        store.removeTopic(home, String(args.id || ''))
        return { ok: true, removed: String(args.id || '') }
      }
      return { ok: true, topics: store.loadTopics(home).map(topicBrief) }
    },
  })

  tool({
    name: 'bili_study_search',
    description: '按关键词搜 B 站视频（不下载、不判断值不值得）。返回 bvid / 标题 / UP / 时长 / 播放量。'
      + '想看某个视频的内容用 bili_study_watch。',
    parameters: {
      keyword: { type: 'string', description: '搜索关键词' },
      limit: { type: 'number', description: '返回几条（默认 15，最大 40）' },
      order: { type: 'string', description: 'click=播放 / pubdate=最新 / totalrank=综合' },
    },
    async execute(args) {
      const r = await bili.search(cfg, home, String(args.keyword || ''), {
        pages: 1,
        order: String(args.order || 'click'),
        limit: clamp(args.limit || 15, 1, 40),
      })
      return r
    },
  })

  tool({
    name: 'bili_study_watch',
    description: '「看」一条视频：取回标题 / UP / 时长 / 简介 + 完整字幕原文（带时间轴）。'
      + '这是学习素材；读完后用 bili_study_note_save 把笔记存进学习库。没有字幕会明确告诉你。',
    parameters: {
      bvid: { type: 'string', description: 'BV 号' },
      maxChars: { type: 'number', description: '字幕最多返回多少字（默认 30000）' },
    },
    async execute(args) {
      const r = await bili.material(cfg, home, String(args.bvid || '').trim(), clamp(args.maxChars || 30000, 4000, 60000))
      if (r && r.lines) delete r.lines   // 正文已经含时间戳，别把 lines 再发一遍
      return r
    },
  })

  tool({
    name: 'bili_study_note_save',
    description: '把一份学习笔记存进学习库（对话里学完就用它）。需要 bvid + summary；markdown 是你写的正文（可空）；'
      + 'cards 是复习卡数组，每项 "问题||答案"。笔记会写进 notes/<主题>/<bvid>.md，并生成复习卡。',
    parameters: {
      bvid: { type: 'string', description: 'BV 号' },
      topicId: { type: 'string', description: '主题 id（留空 = 第一个主题）' },
      summary: { type: 'string', description: '一句话总结' },
      markdown: { type: 'string', description: '笔记正文（Markdown）' },
      cards: { type: 'array', items: { type: 'string' }, description: '"问题||答案" 的数组' },
    },
    async execute(args) {
      const info = await bili.videoInfo(cfg, home, String(args.bvid || '').trim())
      if (!info.ok) return info
      refreshCfg()
      const topic = store.findTopic(home, String(args.topicId || ''))
      if (!topic) return { ok: false, error: '没有这个主题' }
      const unit = store.currentUnit(topic)
      const cards = (Array.isArray(args.cards) ? args.cards : [])
        .map((s) => String(s || '').split('||'))
        .map(([q, a]) => ({ q: String(q || '').trim(), a: String(a || '').trim() }))
        .filter((c) => c.q && c.a)
      const saved = store.saveNote(home, {
        topic,
        unit,
        info,
        source: 'chat',
        markdown: String(args.markdown || ''),
        lesson: { summary: String(args.summary || ''), cards },
      })
      store.writeDigest(home, {
        time: clockText(),
        title: `《${info.title}》`,
        lines: [
          `主题：${topic.name}${unit ? ' · 单元：' + unit.title : ''}`,
          args.summary ? `一句话：${args.summary}` : '',
          `视频：${info.up || '未知 UP'} · ${formatDuration(info.duration)} · https://www.bilibili.com/video/${info.bvid}`,
          `笔记：notes/${topic.id}/${info.bvid}.md · 新复习卡 ${saved.cards.length} 张`,
        ],
      })
      return { ok: true, note: saved.note, cards: saved.cards.length, file: saved.file }
    },
  })

  tool({
    name: 'bili_study_notes',
    description: '看学习笔记：给 bvid 或 noteId 读全文；否则列最近的笔记。',
    parameters: {
      bvid: { type: 'string', description: 'BV 号（可选）' },
      topicId: { type: 'string', description: '只看某个主题（可选）' },
      limit: { type: 'number', description: '列几条（默认 10）' },
    },
    execute(args) {
      const key = String(args.bvid || args.noteId || '').trim()
      if (key) {
        const n = store.readNote(home, key)
        return n ? { ok: true, ...n } : { ok: false, error: '没有这条笔记：' + key }
      }
      return {
        ok: true,
        notes: store.listNotes(home, { topicId: String(args.topicId || ''), limit: clamp(args.limit || 10, 1, 100) }),
      }
    },
  })

  tool({
    name: 'bili_study_review',
    description: '复习卡：action=due（默认，取到期卡片）/ grade（cardId, grade：0=再来一次 1=困难 2=一般 3=简单）。',
    parameters: {
      action: { type: 'string', description: 'due / grade' },
      cardId: { type: 'string', description: '卡片 id' },
      grade: { type: 'number', description: '0-3' },
      limit: { type: 'number', description: '取几张（默认 5）' },
    },
    execute(args) {
      const action = String(args.action || 'due')
      if (action === 'grade') {
        const r = store.gradeCard(home, String(args.cardId || ''), clamp(args.grade ?? 2, 0, 3))
        return { ok: true, ...r }
      }
      const cards = store.dueCards(home, clamp(args.limit || 5, 1, 30))
      return { ok: true, count: cards.length, cards, stats: store.cardStats(home) }
    },
  })

  tool({
    name: 'bili_study_learn',
    description: '立刻学一课：自己找一条有字幕的 B 站视频 → 读字幕 → 写笔记 → 出复习卡 → 写日报。'
      + '在后台跑（约 1-4 分钟）。传 bvid 就学这条指定视频（不受时长范围限制）。',
    parameters: {
      topicId: { type: 'string', description: '学哪个主题（留空 = 第一个）' },
      bvid: { type: 'string', description: '指定要学的 BV 号（可留空，留空则自动找课）' },
    },
    execute(args) {
      refreshCfg()
      return startLesson({ topicKey: String(args.topicId || ''), source: 'manual', bvid: String(args.bvid || '') })
    },
  })

  tool({
    name: 'bili_study_pick',
    description: '自选视频：action=list（默认）/ add / remove。add 时给 bvid 或 B 站链接（可带 topicId），'
      + '加进「自选视频」后自动课时会优先学它；也可以直接 bili_study_learn 指定这条。',
    parameters: {
      action: { type: 'string', description: 'list / add / remove' },
      topicId: { type: 'string', description: '主题 id（留空 = 第一个）' },
      bvid: { type: 'string', description: 'BV 号或 B 站视频链接' },
      url: { type: 'string', description: 'B 站视频链接（bvid 的别名）' },
    },
    async execute(args) {
      refreshCfg()
      const topic = store.findTopic(home, String(args.topicId || ''))
      if (!topic) return { ok: false, error: '没有这个主题' }
      const action = String(args.action || 'list')
      if (action === 'list') {
        return { ok: true, topic: { id: topic.id, name: topic.name }, picks: store.selectedVideos(home, topic.id) }
      }
      const raw = String(args.bvid || args.url || '')
      const m = /(BV[0-9A-Za-z]{10})/.exec(raw)
      if (!m) return { ok: false, error: '没认出 BV 号：贴 BV 号或完整视频链接都行' }
      const bvid = m[1]
      if (action === 'remove') {
        const removed = store.unpinVideo(home, topic.id, bvid)
        return { ok: removed, removed: bvid }
      }
      const mat = await bili.material(cfg, home, bvid, 4000)
      if (!mat.ok) return mat
      const hasSubtitle = Boolean(mat.subtitle?.ok && mat.subtitle?.text)
      store.pinVideo(home, topic.id, {
        bvid: mat.info.bvid, title: mat.info.title, up: mat.info.up, duration: mat.info.duration,
      })
      return {
        ok: true,
        pick: { bvid: mat.info.bvid, title: mat.info.title, up: mat.info.up, duration: mat.info.duration },
        hasSubtitle,
        warning: hasSubtitle ? '' : '这条视频没有字幕，学的时候会失败；建议换一条有 AI 字幕的。',
      }
    },
  })

  tool({
    name: 'bili_study_plan',
    description: '编辑学习内容（单元）：action=list / add（title）/ update（title 或 status）/ remove / current（设为下一课）。'
      + '学习内容完全由你定，不再只吃默认路线。',
    parameters: {
      action: { type: 'string', description: 'list / add / update / remove / current' },
      topicId: { type: 'string', description: '主题 id（留空 = 第一个）' },
      unitId: { type: 'string', description: '单元 id（update/remove/current 用）' },
      title: { type: 'string', description: '单元名' },
      status: { type: 'string', description: 'todo / doing / done' },
    },
    execute(args) {
      refreshCfg()
      const topic = store.findTopic(home, String(args.topicId || ''))
      if (!topic) return { ok: false, error: '没有这个主题' }
      const action = String(args.action || 'list')
      try {
        if (action === 'add') store.addPlanUnit(home, topic.id, String(args.title || ''))
        else if (action === 'update') store.updatePlanUnit(home, topic.id, String(args.unitId || ''), { title: args.title, status: args.status })
        else if (action === 'remove') store.removePlanUnit(home, topic.id, String(args.unitId || ''))
        else if (action === 'current') store.setCurrentUnit(home, topic.id, String(args.unitId || ''))
        const fresh = store.findTopic(home, topic.id)
        return { ok: true, topic: topicBrief(fresh) }
      } catch (e) {
        return { ok: false, error: String(e?.message ?? e) }
      }
    },
  })

  tool({
    name: 'bili_study_files',
    description: '本地资料库：action=list（默认）/ add（path，可带 topicId）/ remove（id）/ read（path 或 id，返回抽出的文字）。'
      + '支持 txt/md/csv/json/代码/html/ipynb/docx/pptx/xlsx/epub/pdf（PDF 已内置 pypdf；扫描件会明确报读不到）。',
    parameters: {
      action: { type: 'string', description: 'list / add / remove / read' },
      path: { type: 'string', description: '文件路径' },
      id: { type: 'string', description: '资料 id' },
      topicId: { type: 'string', description: '归属主题（留空 = 第一个）' },
      maxChars: { type: 'number', description: 'read 时最多返回多少字（默认 30000）' },
    },
    async execute(args) {
      refreshCfg()
      const action = String(args.action || 'list')
      if (action === 'list') {
        const list = store.listMaterials(home, { limit: 300 })
        return { ok: true, count: list.length, materials: list, filesDir: cfg.filesDir || '' }
      }
      if (action === 'remove') {
        const m = store.findMaterial(home, String(args.id || args.path || ''))
        if (!m) return { ok: false, error: '资料库里没有这条' }
        store.removeMaterial(home, m.id)
        return { ok: true, removed: m.id, name: m.name }
      }
      if (action === 'read') {
        let p = String(args.path || '')
        if (!p && args.id) p = store.findMaterial(home, String(args.id))?.path || ''
        if (!p) return { ok: false, error: '给 path 或 id' }
        const r = await files.read(cfg, p, clamp(args.maxChars || 30000, 2000, 60000))
        return r
      }
      // add
      const topic = store.findTopic(home, String(args.topicId || ''))
      if (!topic) return { ok: false, error: '没有这个主题' }
      const p = String(args.path || '').trim()
      if (!p) return { ok: false, error: '给文件路径' }
      const info = await files.info(cfg, p)
      if (!info.ok) return info
      if (!info.supported) return { ok: false, error: `暂不支持这个格式：${info.ext}` }
      const rec = store.addMaterial(home, {
        id: files.idForPath(info.path),
        topicId: topic.id,
        path: info.path,
        name: info.name,
        ext: info.ext,
        size: info.size,
        mtime: info.mtime,
      })
      return { ok: true, material: rec, topic: { id: topic.id, name: topic.name } }
    },
  })

  tool({
    name: 'bili_study_file_search',
    description: '在资料文件夹里搜文件（文件名 + 正文）。给 query；folder 留空就用设置里的「资料文件夹」。'
      + '返回匹配的文件与片段，之后可以用 bili_study_file_learn 总结。',
    parameters: {
      query: { type: 'string', description: '搜索词' },
      folder: { type: 'string', description: '在哪个文件夹里搜（留空 = 设置里的资料文件夹）' },
      limit: { type: 'number', description: '返回几条（默认 10）' },
    },
    async execute(args) {
      refreshCfg()
      const dir = String(args.folder || cfg.filesDir || '').trim()
      if (!dir) return { ok: false, error: '还没有资料文件夹：在设置里填「资料文件夹」，或传 folder' }
      const q = String(args.query || '').trim()
      if (!q) return { ok: false, error: 'query 不能为空' }
      return files.search(cfg, dir, q, clamp(args.limit || 10, 1, 50))
    },
  })

  tool({
    name: 'bili_study_file_learn',
    description: '总结一份本地资料：给 path 或 id 直接总结；也可以给 query + folder，让它自己搜一条再总结。'
      + '在后台跑（约 1-3 分钟），笔记和复习卡会进学习库。',
    parameters: {
      path: { type: 'string', description: '文件路径' },
      id: { type: 'string', description: '资料 id' },
      query: { type: 'string', description: '没给 path 时：先按这个搜索资料文件夹' },
      folder: { type: 'string', description: '搜索用的文件夹（留空 = 设置里的资料文件夹）' },
      topicId: { type: 'string', description: '归到哪个主题（留空 = 第一个）' },
    },
    async execute(args) {
      return startFileLesson({
        topicKey: String(args.topicId || ''),
        source: 'manual',
        path: String(args.path || ''),
        materialId: String(args.id || ''),
        query: String(args.query || ''),
        folder: String(args.folder || ''),
      })
    },
  })

  // ── HTTP API ────────────────────────────────────────────────────────────
  const sendJson = (res, code, obj) => {
    try {
      const body = JSON.stringify(obj)
      res.statusCode = code
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(body)
    } catch { try { res.end() } catch { /* 忽略 */ } }
  }
  const readBody = (req) => new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => { raw += c; if (raw.length > 4_000_000) { try { req.destroy() } catch { /* 忽略 */ } } })
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })

  const sameOriginOk = (req) => {
    try {
      const host = String(req.headers.host || '')
      if (!host) return true
      if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host)) return false
      const pick = String(req.headers.origin || req.headers.referer || '')
      if (!pick) return true
      try {
        const u = new URL(pick)
        return String(u.host || '').toLowerCase() === host.toLowerCase()
      } catch { return false }
    } catch { return false }
  }
  const getConnection = () => {
    for (const fn of [
      () => (typeof ctx.get === 'function' ? ctx.get('connection') : null),
      () => Reflect.get(ctx, 'connection'),
    ]) {
      try {
        const c = fn()
        if (c && typeof c.requestRejection === 'function') return c
      } catch { /* 换下一个 */ }
    }
    return null
  }
  const fenceReject = (req, res) => {
    const conn = getConnection()
    if (!conn) return false
    try {
      const rejection = conn.requestRejection({ headers: req.headers })
      if (rejection === undefined) return false
      res.statusCode = typeof rejection === 'number' ? rejection : 403
      try { res.end() } catch { /* 忽略 */ }
      return true
    } catch {
      res.statusCode = 403
      try { res.end() } catch { /* 忽略 */ }
      return true
    }
  }

  const handle = async (req, res, url) => {
    const path = url.pathname.replace(/^\/api\/bili-study/, '') || '/'
    refreshCfg()

    if (req.method === 'GET' && path === '/status') return sendJson(res, 200, status())

    if (req.method === 'GET' && path === '/run') return sendJson(res, 200, { ok: true, run: store.readRun(home) })

    if (req.method === 'GET' && path === '/environment') {
      return sendJson(res, 200, { ok: true, environment: lesson.environment(cfg), config: { ...cfg } })
    }

    if (req.method === 'GET' && path === '/notes') {
      const topicId = String(url.searchParams.get('topic') || '')
      const limit = clamp(Number(url.searchParams.get('limit')) || 20, 1, 200)
      return sendJson(res, 200, { ok: true, notes: store.listNotes(home, { topicId, limit }) })
    }

    if (req.method === 'GET' && path === '/note') {
      const id = String(url.searchParams.get('id') || '')
      const n = store.readNote(home, id)
      return n ? sendJson(res, 200, { ok: true, ...n }) : sendJson(res, 404, { ok: false, error: '没有这条笔记' })
    }

    if (req.method === 'POST' && path === '/config') {
      const body = await readBody(req)
      const r = await persistCfg(body.patch || {})
      return sendJson(res, 200, r)
    }

    if (req.method === 'POST' && path === '/topic') {
      const body = await readBody(req)
      try {
        let out
        if (body.action === 'add') out = store.addTopic(home, body)
        else if (body.action === 'update') out = store.updateTopic(home, String(body.id || ''), body)
        else if (body.action === 'remove') { store.removeTopic(home, String(body.id || '')); out = { ok: true } }
        else throw new Error('未知 action')
        return sendJson(res, 200, { ok: true, topic: out.id ? topicBrief(out) : out })
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: String(e?.message ?? e) })
      }
    }

    if (req.method === 'POST' && path === '/learn') {
      const body = await readBody(req)
      return sendJson(res, 200, startLesson({ topicKey: String(body.topicId || ''), source: 'manual', bvid: String(body.bvid || '') }))
    }

    if (req.method === 'POST' && path === '/pick') {
      const body = await readBody(req)
      const topic = store.findTopic(home, String(body.topicId || ''))
      if (!topic) return sendJson(res, 400, { ok: false, error: '没有这个主题' })
      if (body.action === 'remove') {
        return sendJson(res, 200, { ok: store.unpinVideo(home, topic.id, String(body.bvid || '')) })
      }
      const m = /(BV[0-9A-Za-z]{10})/.exec(String(body.bvid || body.url || ''))
      if (!m) return sendJson(res, 400, { ok: false, error: '没认出 BV 号' })
      const mat = await bili.material(cfg, home, m[1], 4000)
      if (!mat.ok) return sendJson(res, 200, mat)
      const hasSubtitle = Boolean(mat.subtitle?.ok && mat.subtitle?.text)
      store.pinVideo(home, topic.id, {
        bvid: mat.info.bvid, title: mat.info.title, up: mat.info.up, duration: mat.info.duration,
      })
      return sendJson(res, 200, {
        ok: true,
        pick: { bvid: mat.info.bvid, title: mat.info.title, up: mat.info.up, duration: mat.info.duration },
        hasSubtitle,
        warning: hasSubtitle ? '' : '这条视频没有字幕，学的时候会失败',
      })
    }

    if (req.method === 'POST' && path === '/plan') {
      const body = await readBody(req)
      const topic = store.findTopic(home, String(body.topicId || ''))
      if (!topic) return sendJson(res, 400, { ok: false, error: '没有这个主题' })
      try {
        if (body.action === 'add') store.addPlanUnit(home, topic.id, String(body.title || ''))
        else if (body.action === 'update') store.updatePlanUnit(home, topic.id, String(body.unitId || ''), { title: body.title, status: body.status })
        else if (body.action === 'remove') store.removePlanUnit(home, topic.id, String(body.unitId || ''))
        else if (body.action === 'current') store.setCurrentUnit(home, topic.id, String(body.unitId || ''))
        return sendJson(res, 200, { ok: true, topic: topicBrief(store.findTopic(home, topic.id)) })
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: String(e?.message ?? e) })
      }
    }

    if (req.method === 'GET' && path === '/files') {
      const topicId = String(url.searchParams.get('topic') || '')
      const list = store.listMaterials(home, { topicId, limit: 300 })
      return sendJson(res, 200, { ok: true, materials: list, count: list.length, filesDir: cfg.filesDir || '' })
    }

    if (req.method === 'POST' && path === '/file') {
      const body = await readBody(req)
      try {
        if (body.action === 'remove') {
          const m = store.findMaterial(home, String(body.id || body.path || ''))
          if (!m) return sendJson(res, 404, { ok: false, error: '资料库里没有这条' })
          store.removeMaterial(home, m.id)
          return sendJson(res, 200, { ok: true, removed: m.id })
        }
        const topic = store.findTopic(home, String(body.topicId || ''))
        if (!topic) return sendJson(res, 400, { ok: false, error: '没有这个主题' })
        const p = String(body.path || '').trim()
        if (!p) return sendJson(res, 400, { ok: false, error: '给文件路径' })
        const info = await files.info(cfg, p)
        if (!info.ok) return sendJson(res, 200, info)
        if (!info.supported) return sendJson(res, 200, { ok: false, error: `暂不支持这个格式：${info.ext}` })
        const rec = store.addMaterial(home, {
          id: files.idForPath(info.path),
          topicId: topic.id,
          path: info.path,
          name: info.name,
          ext: info.ext,
          size: info.size,
          mtime: info.mtime,
        })
        return sendJson(res, 200, { ok: true, material: rec })
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: String(e?.message ?? e) })
      }
    }

    if (req.method === 'GET' && path === '/files/scan') {
      const dir = String(url.searchParams.get('folder') || cfg.filesDir || '').trim()
      if (!dir) return sendJson(res, 400, { ok: false, error: '先设置资料文件夹，或传 folder' })
      const limit = clamp(Number(url.searchParams.get('limit')) || 200, 1, 500)
      return sendJson(res, 200, await files.scan(cfg, dir, limit))
    }

    if (req.method === 'GET' && path === '/files/search') {
      const dir = String(url.searchParams.get('folder') || cfg.filesDir || '').trim()
      const q = String(url.searchParams.get('query') || '').trim()
      if (!dir) return sendJson(res, 400, { ok: false, error: '先设置资料文件夹，或传 folder' })
      if (!q) return sendJson(res, 400, { ok: false, error: 'query 不能为空' })
      const limit = clamp(Number(url.searchParams.get('limit')) || 10, 1, 50)
      return sendJson(res, 200, await files.search(cfg, dir, q, limit))
    }

    if (req.method === 'POST' && path === '/file-learn') {
      const body = await readBody(req)
      const r = await startFileLesson({
        topicKey: String(body.topicId || ''),
        source: 'manual',
        path: String(body.path || ''),
        materialId: String(body.id || ''),
        query: String(body.query || ''),
        folder: String(body.folder || ''),
      })
      return sendJson(res, 200, r)
    }

    if (req.method === 'GET' && path === '/review') {
      const limit = clamp(Number(url.searchParams.get('limit')) || 10, 1, 50)
      return sendJson(res, 200, { ok: true, cards: store.dueCards(home, limit), stats: store.cardStats(home) })
    }

    if (req.method === 'POST' && path === '/review') {
      const body = await readBody(req)
      try {
        const r = store.gradeCard(home, String(body.cardId || ''), clamp(body.grade ?? 2, 0, 3))
        return sendJson(res, 200, { ok: true, ...r })
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: String(e?.message ?? e) })
      }
    }

    if (req.method === 'POST' && path === '/login/start') {
      try {
        const r = await login.start()
        if (!r.ok) return sendJson(res, 200, r)
        const now = Date.now()
        for (const [k, v] of pendingLogins) if (now - v.at > 10 * 60_000) pendingLogins.delete(k)
        pendingLogins.set(r.key, { at: now })
        return sendJson(res, 200, { ok: true, key: r.key, url: r.url, qr: r.qr })
      } catch (e) {
        return sendJson(res, 200, { ok: false, error: '出码失败：' + String(e?.message ?? e) })
      }
    }

    if (req.method === 'POST' && path === '/login/poll') {
      const body = await readBody(req)
      const key = String(body.key || '')
      if (!key) return sendJson(res, 400, { ok: false, state: 'error', error: '缺少 key' })
      if (!pendingLogins.has(key)) return sendJson(res, 200, { ok: false, state: 'expired', error: '二维码已失效，请重新出码' })
      try {
        const r = await login.poll(key)
        if (r.state === 'ok') {
          const file = login.saveCredential(home, r.credential)
          pendingLogins.delete(key)
          await persistCfg({ credentialPath: file })
          const who = await bili.whoami({ ...cfg, credentialPath: file }, home).catch(() => ({}))
          log('扫码登录成功：' + file)
          return sendJson(res, 200, { ok: true, state: 'ok', file, uname: who?.uname || '', loggedIn: who?.loggedIn !== false })
        }
        if (r.state === 'expired' || !r.ok) pendingLogins.delete(key)
        return sendJson(res, 200, r)
      } catch (e) {
        return sendJson(res, 200, { ok: false, state: 'error', error: '轮询失败：' + String(e?.message ?? e) })
      }
    }

    if (req.method === 'POST' && path === '/import-credential') {
      try {
        const src = join(dshHome(), 'bili-duty', 'bili_credential.json')
        if (!existsSync(src)) return sendJson(res, 404, { ok: false, error: '「刷B站」还没有登录凭证：先去它的设置页扫码登录' })
        const dst = join(home, 'bili_credential.json')
        copyFileSync(src, dst)
        await persistCfg({ credentialPath: dst })
        return sendJson(res, 200, { ok: true, file: dst })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: String(e?.message ?? e) })
      }
    }

    if (req.method === 'POST' && path === '/check-login') {
      const r = await bili.whoami(cfg, home)
      return sendJson(res, 200, r)
    }

    if (req.method === 'GET' && path === '/search') {
      const keyword = String(url.searchParams.get('keyword') || '').trim()
      if (!keyword) return sendJson(res, 400, { ok: false, error: 'keyword 不能为空' })
      const r = await bili.search(cfg, home, keyword, { pages: 1, order: 'click', limit: 12 })
      return sendJson(res, 200, r)
    }

    if (req.method === 'GET' && path === '/digest') {
      const day = String(url.searchParams.get('day') || '').trim() || dayKey()
      return sendJson(res, 200, { ok: true, day, text: store.readDigest(home, day) })
    }

    return sendJson(res, 404, { ok: false, error: `unknown ${req.method} ${path}` })
  }

  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/api/bili-study',
      handler: async (req, res) => {
        if (fenceReject(req, res)) return
        if (!sameOriginOk(req)) { sendJson(res, 403, { ok: false, error: '只接受本机同源请求' }); return }
        try {
          await handle(req, res, new URL(req.url, 'http://127.0.0.1'))
        } catch (e) {
          sendJson(res, 500, { ok: false, error: String(e?.message ?? e) })
        }
      },
    }), 'bili-study: /api/bili-study 路由')
  } catch (e) {
    log('HTTP 路由没挂上：' + String(e?.message ?? e))
  }

  // ── 定时自动学 ──────────────────────────────────────────────────────────
  const tick = async () => {
    try {
      refreshCfg()
      if (!cfg.auto) return
      if (activeRun || store.readRun(home).running) return
      const now = new Date()
      const minutes = now.getHours() * 60 + now.getMinutes()
      if (minutes < parseClock(cfg.studyAt)) return
      const st = store.getState(home)
      const max = Math.max(0, Number(cfg.maxPerDay) || 0)
      if (max === 0) return
      if (st.day === dayKey(now) && Number(st.learnedToday || 0) >= max) return
      // 两课之间至少隔 45 分钟；上一课失败也要歇 30 分钟再试，别每分钟烧一次
      const run = store.readRun(home)
      const last = Date.parse(run.finishedAt || run.startedAt || '')
      if (Number.isFinite(last)) {
        const gap = run.ok === false ? 30 * 60_000 : 45 * 60_000
        if (Date.now() - last < gap) return
      }
      log(`到点自动学（${cfg.studyAt}，今天已学 ${st.learnedToday} 课）`)
      startLesson({ topicKey: '', source: 'auto' })
    } catch (e) {
      log('定时器异常（已兜住）：' + String(e?.message ?? e))
    }
  }
  const timer = setInterval(() => { tick() }, 60_000)
  timer.unref?.()
  ctx.effect(() => () => clearInterval(timer), 'bili-study: 定时器')
  setTimeout(() => { tick() }, 8000).unref?.()

  // 铺好最小权限 profile（失败只记日志，不影响插件本身）
  try {
    const prof = lesson.ensureProfile(cfg)
    if (prof.ok) log(`自动学习轮 profile：${prof.dir}${prof.created ? '（新建）' : ''}`)
    else log('⚠️ 自动学习轮 profile 铺不上：' + prof.error)
  } catch { /* 已在上面记过 */ }

  log(`已挂载（家=${home}，自动=${cfg.auto ? cfg.studyAt : '关'}，python=${bili.resolvePython(cfg) || '没找到'}，凭证=${bili.resolveCredPath(cfg) || '没有'}）`)
}
