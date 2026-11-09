/**
 * lib/store.mjs —— 学习库（主题 / 计划 / 笔记 / 复习卡 / 队列 / 日报）
 *
 * 全部是纯文件：一个 JSON 一个用途，坏了只坏一处；笔记本身是 Markdown，
 * 用户随时能用别的编辑器打开、拷走、打印。
 *
 * 目录（$DSH_HOME/bili-study/）：
 *   topics.json        主题与学习计划
 *   notes/index.json   笔记索引
 *   notes/<topic>/<bvid>.md  笔记正文
 *   cards.json         复习卡（SM-2 简化版）
 *   queue.json         每个主题的候选视频
 *   state.json         学习统计（连续天数 / 今日进度）
 *   run.json           当前/上一轮运行状态
 *   out/<日期>.md      每天的学习日报
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { clamp, dayKey, nowIso, readJson, uid, writeJson } from './paths.mjs'

const F = {
  topics: 'topics.json',
  notes: 'notes/index.json',
  cards: 'cards.json',
  queue: 'queue.json',
  state: 'state.json',
  run: 'run.json',
  materials: 'materials.json',
}

const AUTO_PLAN = [
  '绪论：开环、闭环与反馈到底解决了什么',
  '数学模型：微分方程 → 传递函数 → 结构图',
  '时域分析：一阶/二阶响应与稳定性判据',
  '根轨迹：八条法则、绘图与性能分析',
  '频域分析：Nyquist 稳定判据与 Bode 图',
  '系统校正：超前 / 滞后 / PID 怎么选',
  '离散系统：采样保持、z 变换与稳定性',
  '非线性系统：相平面、描述函数与自激振荡',
]

function nowDay() {
  return dayKey()
}

function file(home, key) {
  return join(home, F[key])
}

function emptyState() {
  return {
    version: 1,
    day: nowDay(),
    learnedToday: 0,
    minutesToday: 0,
    streak: 0,
    lastStudyDay: '',
    totalNotes: 0,
    totalMinutes: 0,
    lastNoteAt: '',
    lastNoteId: '',
  }
}

function loadState(home) {
  const st = { ...emptyState(), ...(readJson(file(home, 'state'), {}) || {}) }
  if (st.day !== nowDay()) {
    st.day = nowDay()
    st.learnedToday = 0
    st.minutesToday = 0
  }
  return st
}

export function getState(home) {
  return loadState(home)
}

function saveState(home, st) {
  writeJson(file(home, 'state'), st)
}

// ── 主题与计划 ───────────────────────────────────────────────────────────────
export function loadTopics(home) {
  const j = readJson(file(home, 'topics'), { version: 1, topics: [] })
  return Array.isArray(j?.topics) ? j.topics : []
}

function saveTopics(home, topics) {
  writeJson(file(home, 'topics'), { version: 1, topics })
}

export function ensureSeeded(home) {
  const topics = loadTopics(home)
  if (topics.length) return topics
  const topic = {
    id: 't-auto-control',
    name: '自动控制原理',
    keywords: ['自动控制原理', '控制理论', '自控'],
    goal: '打牢经典控制理论：能独立分析时域/根轨迹/频域题，能解释每个结论为什么成立。',
    createdAt: nowIso(),
    plan: AUTO_PLAN.map((title, i) => ({ id: `u${i + 1}`, title, status: 'todo', notes: 0 })),
    stats: { notes: 0, minutes: 0, cards: 0, lastNoteAt: '' },
  }
  saveTopics(home, [topic])
  return [topic]
}

export function findTopic(home, key) {
  const topics = loadTopics(home)
  const k = String(key || '').trim()
  if (!k) return topics[0] || null
  return topics.find((t) => t.id === k)
    || topics.find((t) => t.name === k)
    || topics.find((t) => t.name.includes(k))
    || null
}

export function addTopic(home, { name, keywords = [], goal = '' }) {
  const clean = String(name || '').trim()
  if (!clean) throw new Error('主题名不能为空')
  const topics = loadTopics(home)
  const dup = topics.find((t) => t.name === clean)
  if (dup) return dup
  const topic = {
    id: uid('t'),
    name: clean,
    keywords: Array.isArray(keywords) ? keywords.map(String).map((s) => s.trim()).filter(Boolean) : [],
    goal: String(goal || ''),
    createdAt: nowIso(),
    plan: [],
    stats: { notes: 0, minutes: 0, cards: 0, lastNoteAt: '' },
  }
  topics.push(topic)
  saveTopics(home, topics)
  return topic
}

export function updateTopic(home, id, patch = {}) {
  const topics = loadTopics(home)
  const t = topics.find((x) => x.id === id)
  if (!t) throw new Error('找不到主题：' + id)
  if (patch.name !== undefined) {
    const nm = String(patch.name).trim()
    if (!nm) throw new Error('主题名不能为空')
    t.name = nm
  }
  if (patch.keywords !== undefined) {
    t.keywords = Array.isArray(patch.keywords)
      ? patch.keywords.map(String).map((s) => s.trim()).filter(Boolean)
      : String(patch.keywords).split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
  }
  if (patch.goal !== undefined) t.goal = String(patch.goal || '')
  saveTopics(home, topics)
  return t
}

export function removeTopic(home, id) {
  const topics = loadTopics(home).filter((t) => t.id !== id)
  saveTopics(home, topics)
  const idx = readJson(file(home, 'notes'), { version: 1, notes: [] })
  idx.notes = (idx.notes || []).filter((n) => n.topicId !== id)
  writeJson(file(home, 'notes'), idx)
  const cj = readJson(file(home, 'cards'), { version: 1, cards: [] })
  cj.cards = (cj.cards || []).filter((c) => c.topicId !== id)
  writeJson(file(home, 'cards'), cj)
  return true
}

export function addUnits(home, topicId, titles = []) {
  const topics = loadTopics(home)
  const t = topics.find((x) => x.id === topicId)
  if (!t) return []
  const have = new Set(t.plan.map((u) => u.title))
  const added = []
  for (const raw of titles.slice(0, 6)) {
    const title = String(raw || '').trim().slice(0, 80)
    if (!title || have.has(title)) continue
    have.add(title)
    const u = { id: uid('u'), title, status: 'todo', notes: 0 }
    t.plan.push(u)
    added.push(u)
  }
  saveTopics(home, topics)
  return added
}

export function currentUnit(topic) {
  if (!topic) return null
  return (topic.plan || []).find((u) => u.status === 'doing')
    || (topic.plan || []).find((u) => u.status === 'todo')
    || null
}

/** 用户手动加一个学习单元（学习内容由用户自己定） */
export function addPlanUnit(home, topicId, title, { makeCurrent = false } = {}) {
  const topics = loadTopics(home)
  const t = topics.find((x) => x.id === topicId)
  if (!t) throw new Error('找不到主题：' + topicId)
  const clean = String(title || '').trim().slice(0, 80)
  if (!clean) throw new Error('单元名不能为空')
  const dup = (t.plan || []).find((u) => u.title === clean)
  if (dup) return dup
  const hasDoing = (t.plan || []).some((u) => u.status === 'doing')
  const u = { id: uid('u'), title: clean, status: makeCurrent || !hasDoing ? 'doing' : 'todo', notes: 0 }
  if (makeCurrent) {
    for (const old of t.plan || []) if (old.status === 'doing') old.status = 'todo'
  }
  t.plan = Array.isArray(t.plan) ? t.plan : []
  t.plan.push(u)
  saveTopics(home, topics)
  return u
}

export function updatePlanUnit(home, topicId, unitId, patch = {}) {
  const topics = loadTopics(home)
  const t = topics.find((x) => x.id === topicId)
  if (!t) throw new Error('找不到主题：' + topicId)
  const u = (t.plan || []).find((x) => x.id === unitId)
  if (!u) throw new Error('找不到单元：' + unitId)
  if (patch.title !== undefined) {
    const clean = String(patch.title || '').trim().slice(0, 80)
    if (!clean) throw new Error('单元名不能为空')
    u.title = clean
  }
  if (patch.status !== undefined && ['todo', 'doing', 'done'].includes(String(patch.status))) {
    u.status = String(patch.status)
    if (u.status === 'doing') {
      for (const old of t.plan) if (old !== u && old.status === 'doing') old.status = 'todo'
    }
  }
  saveTopics(home, topics)
  return u
}

export function removePlanUnit(home, topicId, unitId) {
  const topics = loadTopics(home)
  const t = topics.find((x) => x.id === topicId)
  if (!t) throw new Error('找不到主题：' + topicId)
  const wasDoing = (t.plan || []).some((u) => u.id === unitId && u.status === 'doing')
  t.plan = (t.plan || []).filter((u) => u.id !== unitId)
  if (wasDoing) {
    const next = t.plan.find((u) => u.status === 'todo')
    if (next) next.status = 'doing'
  }
  saveTopics(home, topics)
  return true
}

/** 让某个单元成为「下一课」 */
export function setCurrentUnit(home, topicId, unitId) {
  return updatePlanUnit(home, topicId, unitId, { status: 'doing' })
}

/** 用户指定的视频：放进队列，标成 selected，自动课时优先学它 */
export function pinVideo(home, topicId, item = {}) {
  const bvid = String(item.bvid || '').trim()
  if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) throw new Error('不是合法的 BV 号：' + bvid)
  const j = readJson(file(home, 'queue'), { version: 1, topics: {} })
  j.topics = j.topics || {}
  const list = Array.isArray(j.topics[topicId]) ? j.topics[topicId] : []
  const old = list.find((x) => x.bvid === bvid)
  const next = {
    bvid,
    title: String(item.title || old?.title || ''),
    up: String(item.up || old?.up || ''),
    duration: Number(item.duration ?? old?.duration ?? 0) || 0,
    play: Number(item.play ?? old?.play ?? 0) || 0,
    addedAt: old?.addedAt || nowIso(),
    pinnedAt: nowIso(),
    status: 'selected',
  }
  if (old) Object.assign(old, next)
  else list.push(next)
  j.topics[topicId] = list.slice(-100)
  saveQueue(home, j.topics)
  return next
}

export function unpinVideo(home, topicId, bvid) {
  const j = readJson(file(home, 'queue'), { version: 1, topics: {} })
  const list = j?.topics?.[topicId]
  if (!Array.isArray(list)) return false
  const hit = list.find((x) => x.bvid === bvid)
  if (!hit) return false
  hit.status = 'skipped'
  hit.pinnedAt = ''
  saveQueue(home, j.topics)
  return true
}

export function selectedVideos(home, topicId) {
  return queueFor(home, topicId).filter((x) => x.status === 'selected')
}


function bumpUnit(topics, topicId, unitId) {
  if (!unitId) return
  const t = topics.find((x) => x.id === topicId)
  const u = t?.plan?.find((x) => x.id === unitId)
  if (!u) return
  u.notes = (Number(u.notes) || 0) + 1
  if (u.status !== 'done') {
    u.status = 'done'
    const next = t.plan.find((x) => x.status === 'todo')
    if (next) next.status = 'doing'
  }
}

// ── 笔记 ─────────────────────────────────────────────────────────────────────
export function listNotes(home, { topicId = '', limit = 20 } = {}) {
  const idx = readJson(file(home, 'notes'), { version: 1, notes: [] })
  let notes = Array.isArray(idx.notes) ? idx.notes : []
  if (topicId) notes = notes.filter((n) => n.topicId === topicId)
  return notes
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, Math.max(1, limit))
}

export function noteFile(home, note) {
  return join(home, 'notes', note.topicId, `${note.ref || note.bvid}.md`)
}

export function readNote(home, idOrBvid) {
  const idx = readJson(file(home, 'notes'), { version: 1, notes: [] })
  const key = String(idOrBvid || '')
  const meta = (idx.notes || []).find((n) => n.id === key || n.bvid === key || n.ref === key)
  if (!meta) return null
  let markdown = ''
  try {
    markdown = readFileSync(noteFile(home, meta), 'utf8')
  } catch {
    markdown = `（笔记文件丢了：${noteFile(home, meta)}）`
  }
  return { meta, markdown }
}

function yamlValue(v) {
  return JSON.stringify(String(v ?? ''))
}

export function renderNoteMd({ topic, unit, info, lesson, source, markdown }) {
  const kind = info.kind === 'file' ? 'file' : 'video'
  const ref = kind === 'file' ? String(info.ref || info.id || '') : String(info.bvid || '')
  const headLines = [
    '---',
    `kind: ${yamlValue(kind)}`,
    `ref: ${yamlValue(ref)}`,
    `title: ${yamlValue(info.title || info.name || '')}`,
    `topic: ${yamlValue(topic.name)}`,
    `unit: ${yamlValue(unit?.title || '')}`,
    `learnedAt: ${yamlValue(nowIso())}`,
    `source: ${yamlValue(source)}`,
    `cards: ${Number(lesson?.cards?.length || 0)}`,
  ]
  if (kind === 'video') {
    headLines.splice(4, 0,
      `bvid: ${yamlValue(info.bvid)}`,
      `up: ${yamlValue(info.up)}`,
      `duration: ${Number(info.duration) || 0}`,
    )
  } else {
    headLines.splice(4, 0,
      `file: ${yamlValue(info.name || '')}`,
      `path: ${yamlValue(info.path || '')}`,
      `size: ${Number(info.size) || 0}`,
    )
  }
  const head = [...headLines, '---', '', ''].join('\n')

  if (markdown) return head + String(markdown).trim() + '\n'

  const l = lesson || {}
  const link = `https://www.bilibili.com/video/${info.bvid}`
  const byline = kind === 'file'
    ? `> 资料：${info.name || info.title}${info.size ? ` · ${(Number(info.size) / 1024).toFixed(0)} KB` : ''}${info.path ? ` · \`${info.path}\`` : ''}`
    : `> ${info.up || '未知 UP'} · ${Math.round((info.duration || 0) / 60)} 分钟 · [B 站原视频](${link})`
  const lines = [`# ${info.title || info.name || '学习资料'}`, '', byline, '']
  if (l.summary) lines.push('## 一句话', String(l.summary).trim(), '')
  const keyPoints = Array.isArray(l.keyPoints) ? l.keyPoints : []
  if (keyPoints.length) {
    lines.push('## 关键内容')
    for (const k of keyPoints) {
      if (typeof k === 'string') lines.push(`- ${k}`)
      else if (k && typeof k === 'object') lines.push(`- ${kind === 'video' && k.t ? `[${k.t}] ` : ''}${k.point || ''}`)
    }
    lines.push('')
  }
  const concepts = Array.isArray(l.concepts) ? l.concepts : []
  if (concepts.length) {
    lines.push('## 核心概念')
    for (const c of concepts) {
      if (typeof c === 'string') lines.push(`- ${c}`)
      else if (c) lines.push(`- **${c.name || ''}**：${c.explain || ''}`)
    }
    lines.push('')
  }
  const formulas = Array.isArray(l.formulas) ? l.formulas : []
  if (formulas.length) {
    lines.push('## 公式 / 推导')
    for (const f of formulas) {
      if (typeof f === 'string') lines.push(`- ${f}`)
      else if (f) lines.push(`- \`${f.expr || ''}\` —— ${f.meaning || ''}${f.when ? `（${f.when}）` : ''}`)
    }
    lines.push('')
  }
  const examples = Array.isArray(l.examples) ? l.examples : []
  if (examples.length) {
    lines.push('## 例子')
    for (const e of examples) lines.push(`- ${typeof e === 'string' ? e : JSON.stringify(e)}`)
    lines.push('')
  }
  const pitfalls = Array.isArray(l.pitfalls) ? l.pitfalls : []
  if (pitfalls.length) {
    lines.push('## 易错点')
    for (const p of pitfalls) lines.push(`- ${p}`)
    lines.push('')
  }
  const questions = Array.isArray(l.questions) ? l.questions : []
  if (questions.length) {
    lines.push('## 还没弄懂')
    for (const q of questions) lines.push(`- ${q}`)
    lines.push('')
  }
  const cards = Array.isArray(l.cards) ? l.cards : []
  if (cards.length) {
    lines.push('## 复习卡')
    cards.forEach((c, i) => {
      lines.push(`${i + 1}. **Q**：${c.q || c.question || ''}  `)
      lines.push(`   **A**：${c.a || c.answer || ''}`)
    })
    lines.push('')
  }
  const next = Array.isArray(l.next) ? l.next : []
  if (next.length) {
    lines.push('## 下一步')
    for (const n of next) lines.push(`- ${n}`)
    lines.push('')
  }
  return head + lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

/**
 * 保存一条学习笔记（自动课与手动课共用）。
 * @returns {{note:object, cards:object[], file:string, isNew:boolean}}
 */
export function saveNote(home, { topic, unit, info, lesson, source = 'auto', markdown = '' }) {
  const topics = loadTopics(home)
  const t = topics.find((x) => x.id === topic.id) || topic
  const kind = info.kind === 'file' ? 'file' : 'video'
  const ref = String(kind === 'file' ? (info.ref || info.id || '') : (info.bvid || ''))
  if (!ref) throw new Error('缺少 ref（视频要 bvid，资料要 id）')
  const noteId = `n-${t.id}-${ref}`
  const topicDir = join(home, 'notes', t.id)
  mkdirSync(topicDir, { recursive: true })

  const idxFile = file(home, 'notes')
  const idx = readJson(idxFile, { version: 1, notes: [] })
  idx.notes = Array.isArray(idx.notes) ? idx.notes : []
  const old = idx.notes.find((n) => n.id === noteId)

  const cards = (Array.isArray(lesson?.cards) ? lesson.cards : [])
    .map((c) => ({
      q: String(c?.q || c?.question || '').trim(),
      a: String(c?.a || c?.answer || '').trim(),
    }))
    .filter((c) => c.q && c.a)

  const md = renderNoteMd({ topic: t, unit, info, lesson, source, markdown })
  const mdPath = join(topicDir, `${ref}.md`)
  writeFileSync(mdPath, md, 'utf8')

  const meta = {
    id: noteId,
    kind,
    ref,
    topicId: t.id,
    topicName: t.name,
    bvid: info.bvid || '',
    path: info.path || '',
    title: info.title || info.name || ref,
    up: info.up || '',
    duration: Number(info.duration) || 0,
    size: Number(info.size) || 0,
    summary: String(lesson?.summary || '').slice(0, 400),
    unitId: unit?.id || '',
    unitTitle: unit?.title || '',
    cards: cards.length,
    source,
    createdAt: old?.createdAt || nowIso(),
    updatedAt: nowIso(),
  }
  if (old) Object.assign(old, meta)
  else idx.notes.push(meta)
  writeJson(idxFile, idx)

  // 复习卡：同一条笔记里同一个问题只留一张
  const cj = readJson(file(home, 'cards'), { version: 1, cards: [] })
  cj.cards = Array.isArray(cj.cards) ? cj.cards : []
  const existQ = new Set(cj.cards.filter((c) => c.noteId === noteId).map((c) => c.q))
  const fresh = []
  for (const c of cards) {
    if (existQ.has(c.q)) continue
    existQ.add(c.q)
    const card = {
      id: uid('c'),
      noteId,
      topicId: t.id,
      kind,
      ref,
      bvid: info.bvid || '',
      title: info.title || info.name || ref,
      q: c.q,
      a: c.a,
      due: nowIso(),
      interval: 0,
      ease: 2.5,
      reps: 0,
      lapses: 0,
      lastGrade: null,
      createdAt: nowIso(),
      lastReviewedAt: '',
    }
    cj.cards.push(card)
    fresh.push(card)
  }
  writeJson(file(home, 'cards'), cj)

  // 主题统计 + 计划推进
  const topicNow = topics.find((x) => x.id === t.id) || t
  topicNow.stats = topicNow.stats || { notes: 0, minutes: 0, cards: 0, lastNoteAt: '' }
  topicNow.stats.notes = (Number(topicNow.stats.notes) || 0) + (old ? 0 : 1)
  topicNow.stats.minutes = (Number(topicNow.stats.minutes) || 0) + Math.round((info.duration || 0) / 60)
  topicNow.stats.cards = (Number(topicNow.stats.cards) || 0) + fresh.length
  topicNow.stats.lastNoteAt = nowIso()
  bumpUnit(topics, t.id, unit?.id)
  saveTopics(home, topics)

  // 队列 + 统计
  if (kind === 'video') markQueue(home, t.id, info.bvid, 'watched')

  const st = loadState(home)
  const today = nowDay()
  const yesterday = dayKey(new Date(Date.now() - 86400_000))
  if (st.lastStudyDay !== today) {
    st.streak = st.lastStudyDay === yesterday ? (Number(st.streak) || 0) + 1 : 1
    st.lastStudyDay = today
  }
  st.learnedToday = (Number(st.learnedToday) || 0) + 1
  st.minutesToday = (Number(st.minutesToday) || 0) + Math.round((info.duration || 0) / 60)
  st.totalNotes = (Number(st.totalNotes) || 0) + (old ? 0 : 1)
  st.totalMinutes = (Number(st.totalMinutes) || 0) + Math.round((info.duration || 0) / 60)
  st.lastNoteAt = nowIso()
  st.lastNoteId = noteId
  saveState(home, st)

  return { note: meta, cards: fresh, file: mdPath, isNew: !old }
}

// ── 复习卡 ───────────────────────────────────────────────────────────────────
export function allCards(home) {
  const j = readJson(file(home, 'cards'), { version: 1, cards: [] })
  return Array.isArray(j.cards) ? j.cards : []
}

function saveCards(home, cards) {
  writeJson(file(home, 'cards'), { version: 1, cards })
}

export function dueCards(home, limit = 20, now = new Date()) {
  const nowMs = now.getTime()
  return allCards(home)
    .filter((c) => {
      const due = Date.parse(c.due || '')
      return !Number.isFinite(due) || due <= nowMs
    })
    .sort((a, b) => String(a.due).localeCompare(String(b.due)))
    .slice(0, Math.max(1, limit))
}

export function cardStats(home) {
  const cards = allCards(home)
  const nowMs = Date.now()
  const due = cards.filter((c) => {
    const d = Date.parse(c.due || '')
    return !Number.isFinite(d) || d <= nowMs
  }).length
  return { total: cards.length, due, learned: cards.filter((c) => (c.reps || 0) > 0).length }
}

/** 简易 SM-2：0=再来一次 1=困难 2=一般 3=简单 */
export function gradeCard(home, cardId, grade) {
  const g = clamp(grade, 0, 3)
  const cards = allCards(home)
  const c = cards.find((x) => x.id === cardId)
  if (!c) throw new Error('找不到卡片：' + cardId)
  const now = new Date()
  let interval = Number(c.interval) || 0
  let ease = Number(c.ease) || 2.5
  let reps = Number(c.reps) || 0
  let lapses = Number(c.lapses) || 0
  if (g === 0) {
    lapses += 1
    ease = Math.max(1.3, ease - 0.2)
    interval = 0.02
  } else {
    if (reps === 0) interval = [1, 2, 3][g - 1]
    else if (reps === 1) interval = [2, 4, 6][g - 1]
    else interval = interval * (g === 1 ? 1.2 : g === 2 ? ease : ease * 1.3)
    ease = Math.min(3, Math.max(1.3, ease + (g === 3 ? 0.1 : g === 1 ? -0.15 : 0)))
    reps += 1
  }
  interval = Math.min(360, Math.max(0.007, interval))
  const due = new Date(now.getTime() + interval * 86400_000)
  Object.assign(c, {
    interval,
    ease,
    reps,
    lapses,
    due: due.toISOString(),
    lastGrade: g,
    lastReviewedAt: now.toISOString(),
  })
  saveCards(home, cards)
  return { card: c, nextDue: c.due }
}

// ── 候选队列 ─────────────────────────────────────────────────────────────────
export function queueFor(home, topicId) {
  const j = readJson(file(home, 'queue'), { version: 1, topics: {} })
  const list = j?.topics?.[topicId]
  return Array.isArray(list) ? list : []
}

function saveQueue(home, topics) {
  writeJson(file(home, 'queue'), { version: 1, topics })
}

export function addQueue(home, topicId, items = []) {
  const j = readJson(file(home, 'queue'), { version: 1, topics: {} })
  j.topics = j.topics || {}
  const list = Array.isArray(j.topics[topicId]) ? j.topics[topicId] : []
  const have = new Set(list.map((x) => x.bvid))
  for (const it of items) {
    if (!it?.bvid || have.has(it.bvid)) continue
    have.add(it.bvid)
    list.push({
      bvid: it.bvid,
      title: String(it.title || ''),
      up: String(it.up || ''),
      duration: Number(it.duration) || 0,
      play: Number(it.play) || 0,
      addedAt: nowIso(),
      status: 'candidate',
    })
  }
  j.topics[topicId] = list.slice(-60)
  saveQueue(home, j.topics)
  return j.topics[topicId]
}

export function markQueue(home, topicId, bvid, status) {
  const j = readJson(file(home, 'queue'), { version: 1, topics: {} })
  const list = j?.topics?.[topicId]
  if (!Array.isArray(list)) return
  const hit = list.find((x) => x.bvid === bvid)
  if (hit) hit.status = status
  saveQueue(home, j.topics)
}

// ── 资料（本地文件）──────────────────────────────────────────────────────────
export function listMaterials(home, { topicId = '', limit = 200 } = {}) {
  const j = readJson(file(home, 'materials'), { version: 1, materials: [] })
  let list = Array.isArray(j.materials) ? j.materials : []
  if (topicId) list = list.filter((m) => m.topicId === topicId)
  return list
    .slice()
    .sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)))
    .slice(0, Math.max(1, limit))
}

export function findMaterial(home, key) {
  const k = String(key || '').trim()
  if (!k) return null
  const low = k.toLowerCase()
  return listMaterials(home, { limit: 100000 }).find((m) =>
    m.id === k
    || String(m.path || '').toLowerCase() === low
    || String(m.name || '').toLowerCase() === low
  ) || null
}

export function addMaterial(home, rec = {}) {
  const j = readJson(file(home, 'materials'), { version: 1, materials: [] })
  j.materials = Array.isArray(j.materials) ? j.materials : []
  const old = j.materials.find((m) => m.id === rec.id)
  const next = {
    id: rec.id,
    topicId: rec.topicId,
    path: rec.path,
    name: rec.name || '',
    ext: rec.ext || '',
    size: Number(rec.size) || 0,
    mtime: Number(rec.mtime) || 0,
    addedAt: old?.addedAt || nowIso(),
    status: old?.status || 'new',
    noteId: old?.noteId || '',
    chars: old?.chars || 0,
    error: '',
  }
  if (rec.reset) {
    next.status = 'new'
    next.noteId = ''
    next.error = ''
  }
  if (old) Object.assign(old, { ...next, addedAt: old.addedAt })
  else j.materials.push(next)
  writeJson(file(home, 'materials'), j)
  return old || next
}

export function markMaterial(home, id, patch = {}) {
  const j = readJson(file(home, 'materials'), { version: 1, materials: [] })
  const m = (j.materials || []).find((x) => x.id === id)
  if (!m) return null
  Object.assign(m, patch)
  writeJson(file(home, 'materials'), j)
  return m
}

export function removeMaterial(home, id) {
  const j = readJson(file(home, 'materials'), { version: 1, materials: [] })
  const before = (j.materials || []).length
  j.materials = (j.materials || []).filter((m) => m.id !== id)
  writeJson(file(home, 'materials'), j)
  return j.materials.length < before
}

// ── 日报 ─────────────────────────────────────────────────────────────────────
export function writeDigest(home, entry) {
  const day = dayKey()
  const f = join(home, 'out', `${day}.md`)
  mkdirSync(dirname(f), { recursive: true })
  let head = ''
  if (!existsSync(f)) head = `# B站学习 · ${day}\n\n`
  const block = [
    `## ${entry.time || ''} ${entry.title || ''}`.trim(),
    '',
    entry.lines.filter(Boolean).map((x) => `- ${x}`).join('\n'),
    '',
    '',
  ].join('\n')
  try {
    writeFileSync(f, head + block, { encoding: 'utf8', flag: 'a' })
  } catch {
    /* 日报写不进去不影响笔记 */
  }
  return f
}

export function readDigest(home, day = dayKey()) {
  try {
    return readFileSync(join(home, 'out', `${day}.md`), 'utf8')
  } catch {
    return ''
  }
}

// ── 运行状态 ─────────────────────────────────────────────────────────────────
export function readRun(home) {
  const r = readJson(file(home, 'run'), null)
  if (!r || typeof r !== 'object') return { running: false }
  if (r.running && r.startedAt) {
    const age = Date.now() - Date.parse(r.startedAt)
    if (!Number.isFinite(age) || age > 90 * 60_000) return { ...r, running: false, stale: true }
  }
  return r
}

export function writeRun(home, run) {
  writeJson(file(home, 'run'), { ...run, updatedAt: nowIso() })
}

// ── 汇总 ─────────────────────────────────────────────────────────────────────
export function summary(home) {
  const st = loadState(home)
  const topics = loadTopics(home)
  const notes = listNotes(home, { limit: 1000 })
  const cards = cardStats(home)
  const run = readRun(home)
  return {
    state: st,
    topics,
    notes,
    cards,
    run,
    today: readDigest(home),
  }
}
