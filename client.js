/**
 * dsh-bili-learn —— 浏览器半端（设置页「B站学习」）
 * ============================================================================
 * client bundle 是自注册脚本（不是 ESM）：
 *   window.__ModuleLoader__.load({ id: '<包名>', factory: (require) => ({ inject, apply }) })
 * 设置项注册在 `settings.section` 槽位；样式只加一份，卸载时收回。
 * ============================================================================
 */
window.__ModuleLoader__.load({
  id: 'dsh-bili-learn',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const API = '/api/bili-study'

    const asJson = async (res) => {
      if (res.ok) return res.json()
      if (res.status === 401) throw new Error('未登录 / 没有权限')
      if (res.status === 403) throw new Error('被宿主拦了（只接受本机同源请求）')
      throw new Error('HTTP ' + res.status)
    }
    const jget = async (p) => asJson(await fetch(API + p, { credentials: 'same-origin' }))
    const jpost = async (p, body) => asJson(await fetch(API + p, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    }))

    const CSS = `
[data-bs-page]{display:flex;flex-direction:column;gap:16px;padding:2px 2px 40px;max-width:780px;}
[data-bs-head]{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;}
[data-bs-h1]{font-size:19px;font-weight:650;letter-spacing:-.01em;}
[data-bs-sub]{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8b949e);}
[data-bs-tabs]{display:flex;gap:2px;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-bg-layer-3,rgba(128,128,128,.18));}
[data-bs-tab]{padding:8px 11px;font-size:13px;border:0;background:none;color:inherit;cursor:pointer;opacity:.62;border-bottom:2px solid transparent;font-family:inherit;}
[data-bs-tab][data-on]{opacity:1;border-bottom-color:#3b82f6;font-weight:600;}
[data-bs-card]{border:1px solid var(--dsw-alias-bg-layer-3,rgba(128,128,128,.16));border-radius:12px;padding:14px;
  display:flex;flex-direction:column;gap:10px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.035));}
[data-bs-grid]{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:10px;}
[data-bs-stat]{border:1px solid var(--dsw-alias-bg-layer-3,rgba(128,128,128,.16));border-radius:10px;padding:10px 12px;
  display:flex;flex-direction:column;gap:2px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.03));}
[data-bs-num]{font-size:22px;font-weight:650;line-height:26px;font-variant-numeric:tabular-nums;}
[data-bs-k]{font-size:11px;color:var(--dsw-alias-label-tertiary,#8b949e);}
[data-bs-row]{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
[data-bs-grow]{flex:1;min-width:0;}
[data-bs-btn]{font-family:inherit;font-size:12px;line-height:16px;padding:7px 11px;border-radius:8px;cursor:pointer;
  border:1px solid var(--dsw-alias-bg-layer-3,rgba(128,128,128,.3));background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08));color:inherit;}
[data-bs-btn]:hover{border-color:var(--dsw-alias-bg-layer-4,rgba(128,128,128,.5));}
[data-bs-btn]:disabled{opacity:.45;cursor:default;}
[data-bs-btn][data-primary]{background:#3b82f6;border-color:#3b82f6;color:#fff;font-weight:600;}
[data-bs-btn][data-danger]{color:#ef4444;border-color:rgba(239,68,68,.4);}
[data-bs-btn][data-small]{padding:4px 8px;font-size:11px;}
[data-bs-input],[data-bs-area],[data-bs-select]{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:8px;font-size:12px;
  border:1px solid var(--dsw-alias-bg-layer-3,rgba(128,128,128,.22));background:var(--dsw-alias-bg-layer-4,rgba(128,128,128,.1));
  color:inherit;font-family:inherit;}
[data-bs-input]:focus,[data-bs-area]:focus,[data-bs-select]:focus{outline:none;border-color:#3b82f6;}
[data-bs-area]{resize:vertical;min-height:64px;line-height:18px;}
[data-bs-label]{font-size:12px;font-weight:550;}
[data-bs-field]{display:flex;flex-direction:column;gap:5px;}
[data-bs-note]{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#8b949e);}
[data-bs-pill]{font-size:11px;padding:2px 7px;border-radius:999px;border:1px solid var(--dsw-alias-bg-layer-3,rgba(128,128,128,.3));
  color:var(--dsw-alias-label-tertiary,#8b949e);white-space:nowrap;}
[data-bs-pill][data-ok]{color:#16a34a;border-color:rgba(22,163,74,.4);}
[data-bs-pill][data-bad]{color:#ef4444;border-color:rgba(239,68,68,.4);}
[data-bs-pill][data-run]{color:#3b82f6;border-color:rgba(59,130,246,.5);}
[data-bs-plan]{display:flex;flex-direction:column;gap:5px;}
[data-bs-unit]{display:flex;align-items:flex-start;gap:7px;font-size:12px;line-height:18px;flex-wrap:wrap;}
[data-bs-dot]{flex:none;width:7px;height:7px;border-radius:50%;margin-top:5px;background:var(--dsw-alias-bg-layer-4,rgba(128,128,128,.5));}
[data-bs-unit][data-done]{opacity:.55;}
[data-bs-unit][data-done] [data-bs-dot]{background:#16a34a;}
[data-bs-unit][data-doing] [data-bs-dot]{background:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.18);}
[data-bs-bar]{height:5px;border-radius:3px;background:var(--dsw-alias-bg-layer-3,rgba(128,128,128,.2));overflow:hidden;}
[data-bs-bar] > i{display:block;height:100%;background:#3b82f6;border-radius:3px;transition:width .3s;}
[data-bs-list]{display:flex;flex-direction:column;gap:2px;}
[data-bs-item]{display:flex;align-items:center;gap:10px;padding:8px 9px;border-radius:8px;cursor:pointer;font-size:12px;}
[data-bs-item]:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08));}
[data-bs-item][data-on]{background:var(--dsw-alias-bg-layer-3,rgba(128,128,128,.14));}
[data-bs-pre]{white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.65;margin:0;
  font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);
  background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.05));border-radius:10px;padding:12px;max-height:460px;overflow:auto;}
[data-bs-md] > *:first-child{margin-top:0;}
[data-bs-md-h]{font-weight:650;margin:12px 0 4px;}
[data-bs-md-h="1"]{font-size:16px;}
[data-bs-md-h="2"]{font-size:14px;}
[data-bs-md-h="3"]{font-size:13px;}
[data-bs-md-p]{margin:5px 0;font-size:12.5px;line-height:1.7;white-space:pre-wrap;}
[data-bs-md] ul{margin:4px 0;padding-left:18px;}
[data-bs-md] li{font-size:12.5px;line-height:1.7;margin:2px 0;}
[data-bs-code]{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11.5px;padding:1px 5px;border-radius:4px;
  background:var(--dsw-alias-bg-layer-3,rgba(128,128,128,.18));}
[data-bs-note-view]{height:100%;}
[data-bs-split]{display:grid;grid-template-columns:minmax(180px,240px) 1fr;gap:14px;align-items:start;}
@media (max-width:640px){[data-bs-split]{grid-template-columns:1fr;}}
[data-bs-toast]{font-size:12px;padding:8px 10px;border-radius:8px;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.3);}
[data-bs-toast][data-bad]{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.3);}
[data-bs-empty]{font-size:12px;color:var(--dsw-alias-label-tertiary,#8b949e);padding:12px 0;}
[data-bs-flip] [data-bs-answer]{margin-top:10px;}
`
    const num = (v) => Number(v) || 0
    const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)
    const fmtDate = (iso) => {
      try {
        const d = new Date(iso)
        return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      } catch { return '' }
    }
    const fmtMin = (sec) => {
      const s = num(sec)
      return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    }

    // ── 极简 Markdown（够看笔记；不引第三方）────────────────────────────
    const renderInline = (text) => {
      const out = []
      const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
      let last = 0
      let m
      let i = 0
      while ((m = re.exec(text))) {
        if (m.index > last) out.push(text.slice(last, m.index))
        const tok = m[0]
        if (tok.startsWith('**')) out.push(h('strong', { key: 'b' + i++ }, tok.slice(2, -2)))
        else out.push(h('code', { key: 'c' + i++, 'data-bs-code': '' }, tok.slice(1, -1)))
        last = m.index + tok.length
      }
      if (last < text.length) out.push(text.slice(last))
      return out
    }

    function Md({ text }) {
      let body = String(text || '')
      const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(body)
      if (fm) body = body.slice(fm[0].length)
      const out = []
      let list = null
      let code = null
      const flushList = () => {
        if (!list) return
        out.push(h('ul', { key: 'ul' + out.length }, list))
        list = null
      }
      for (const raw of body.split(/\r?\n/)) {
        const line = raw
        if (line.trim().startsWith('```')) {
          if (code) { out.push(h('pre', { key: 'pre' + out.length, 'data-bs-pre': '' }, code.join('\n'))); code = null }
          else { flushList(); code = [] }
          continue
        }
        if (code) { code.push(line); continue }
        const hd = /^(#{1,3})\s+(.*)$/.exec(line)
        if (hd) {
          flushList()
          out.push(h('div', { key: 'h' + out.length, 'data-bs-md-h': String(hd[1].length) }, renderInline(hd[2])))
          continue
        }
        const li = /^\s*[-*]\s+(.*)$/.exec(line) || /^\s*\d+\.\s+(.*)$/.exec(line)
        if (li) {
          if (!list) list = []
          list.push(h('li', { key: 'li' + out.length + '-' + list.length }, renderInline(li[1])))
          continue
        }
        if (!line.trim()) { flushList(); continue }
        flushList()
        out.push(h('p', { key: 'p' + out.length, 'data-bs-md-p': '' }, renderInline(line)))
      }
      flushList()
      if (code) out.push(h('pre', { key: 'pre-end', 'data-bs-pre': '' }, code.join('\n')))
      return h('div', { 'data-bs-md': '' }, out)
    }

    // ── 小部件 ───────────────────────────────────────────────────────────
    // 这些是"直接调用"的小组件（Btn({...}, '文字')），所以第二个参数要接住 children
    const Btn = (props, kids) => {
      const { children, primary, small, danger, ...rest } = props || {}
      return h('button', {
        'data-bs-btn': '',
        ...(primary ? { 'data-primary': '' } : {}),
        ...(small ? { 'data-small': '' } : {}),
        ...(danger ? { 'data-danger': '' } : {}),
        ...rest,
      }, kids !== undefined ? kids : children)
    }

    const Field = (props, kids) => {
      const { label, hint, children } = props || {}
      return h('label', { 'data-bs-field': '' },
        h('span', { 'data-bs-label': '' }, label),
        kids !== undefined ? kids : children,
        hint ? h('span', { 'data-bs-note': '' }, hint) : null,
      )
    }

    const Pill = (props, kids) => {
      const { tone, children } = props || {}
      return h('span', { 'data-bs-pill': '', ...(tone ? { [`data-${tone}`]: '' } : {}) }, kids !== undefined ? kids : children)
    }

    const Toggle = ({ checked, onChange, label, hint }) => h('div', { 'data-bs-row': '' },
      h('input', { type: 'checkbox', checked: Boolean(checked), onChange: (e) => onChange(e.target.checked), style: { width: 16, height: 16 } }),
      h('div', { 'data-bs-grow': '' },
        h('div', { 'data-bs-label': '' }, label),
        hint ? h('div', { 'data-bs-note': '' }, hint) : null),
    )

    // ── 面板 ─────────────────────────────────────────────────────────────
    function Panel() {
      const [st, setSt] = React.useState(null)
      const [tab, setTab] = React.useState('home')
      const [toast, setToast] = React.useState('')
      const [toastBad, setToastBad] = React.useState(false)
      const [busy, setBusy] = React.useState('')
      const [noteId, setNoteId] = React.useState('')
      const [note, setNote] = React.useState(null)
      const [reviewCards, setReviewCards] = React.useState([])
      const [reviewStats, setReviewStats] = React.useState(null)
      const [reveal, setReveal] = React.useState(false)
      const [draft, setDraft] = React.useState({ name: '', keywords: '', goal: '' })
      const [editId, setEditId] = React.useState('')
      const [draftCfg, setDraftCfg] = React.useState(null)
      const [noteList, setNoteList] = React.useState(null)
      const [bvidInput, setBvidInput] = React.useState('')
      const [unitDraft, setUnitDraft] = React.useState({ topicId: '', title: '' })
      const [pickDraft, setPickDraft] = React.useState({ topicId: '', text: '' })
      const [filePath, setFilePath] = React.useState('')
      const [fileTopic, setFileTopic] = React.useState('')
      const [folder, setFolder] = React.useState('')
      const [fileQuery, setFileQuery] = React.useState('')
      const [scanResults, setScanResults] = React.useState([])
      const [scanInfo, setScanInfo] = React.useState('')
      const [login, setLogin] = React.useState(null)

      React.useEffect(() => {
        if (!st || draftCfg) return
        const c = st.config || {}
        setDraftCfg({
          auto: Boolean(c.auto), studyAt: c.studyAt || '21:00', maxPerDay: c.maxPerDay ?? 1,
          minMinutes: c.minMinutes ?? 4, maxMinutes: c.maxMinutes ?? 75, cardsPerNote: c.cardsPerNote ?? 6,
          noteLevel: c.noteLevel || 'standard', runTimeoutMinutes: c.runTimeoutMinutes ?? 12,
          maxTranscriptChars: c.maxTranscriptChars ?? 32000,
          pythonPath: c.pythonPath || '', credentialPath: c.credentialPath || '',
          filesDir: c.filesDir || '',
          modelProvider: c.modelProvider || '', modelName: c.modelName || '',
          dshBin: c.dshBin || '', headlessProfile: c.headlessProfile || 'bili-study',
        })
      }, [st, draftCfg])

      // 扫码登录轮询：2.5 秒一次；扫了/过期/成功都会更新
      React.useEffect(() => {
        if (!login?.key || login.state === 'ok' || login.state === 'expired') return
        let alive = true
        const timer = setInterval(async () => {
          try {
            const r = await jpost('/login/poll', { key: login.key })
            if (!alive) return
            if (r.state === 'ok') {
              setLogin(null)
              say(`登录成功${r.uname ? '：' + r.uname : ''}`)
              load(true)
            } else if (r.state === 'scanned') {
              setLogin((x) => (x ? { ...x, state: 'scanned' } : x))
            } else if (r.state === 'expired' || r.ok === false) {
              setLogin((x) => (x ? { ...x, state: 'expired', error: r.error || '' } : x))
            }
          } catch { /* 下一轮再试 */ }
        }, 2500)
        timer.unref?.()
        return () => { alive = false; clearInterval(timer) }
      }, [login?.key, login?.state])

      // 笔记 tab 要能看到全部笔记（状态里只带最近 8 条）
      React.useEffect(() => {
        if (tab !== 'notes') return
        let alive = true
        jget('/notes?limit=200')
          .then((r) => { if (alive) setNoteList(r.notes || []) })
          .catch(() => {})
        return () => { alive = false }
      }, [tab, st?.notes?.length, st?.run?.finishedAt])

      const say = (msg, bad) => {
        setToast(String(msg || ''))
        setToastBad(Boolean(bad))
        const t = setTimeout(() => setToast(''), 5000)
        t.unref?.()
      }

      const load = React.useCallback(async (silent) => {
        try {
          const next = await jget('/status')
          setSt(next)
          return next
        } catch (e) {
          if (!silent) say('读状态失败：' + (e?.message ?? e), true)
          return null
        }
      }, [])

      React.useEffect(() => { load() }, [load])

      React.useEffect(() => {
        const running = Boolean(st?.running)
        const t = setInterval(() => { load(true) }, running ? 3000 : 15000)
        t.unref?.()
        return () => clearInterval(t)
      }, [load, st?.running])

      React.useEffect(() => {
        if (tab !== 'review' || !st) return
        jget('/review?limit=20').then((r) => { setReviewCards(r.cards || []); setReviewStats(r.stats || null) }).catch(() => {})
      }, [tab, st?.run?.finishedAt, st?.running])

      const startLearn = async (topicId) => {
        setBusy('learn')
        try {
          const r = await jpost('/learn', { topicId: topicId || '' })
          if (r.started) { say('开跑了：找课 → 读字幕 → 写笔记，约 1–4 分钟'); load(true) }
          else say(r.error || '没跑起来', true)
        } catch (e) { say('启动失败：' + (e?.message ?? e), true) }
        setBusy('')
      }

      /** 学指定视频：贴 BV 号 / 链接 */
      const learnVideo = async (topicId, text) => {
        const raw = String(text || '').trim()
        if (!raw) { say('先贴一个 BV 号或视频链接', true); return }
        setBusy('learnVideo')
        try {
          const r = await jpost('/learn', { topicId: topicId || '', bvid: raw })
          if (r.started) { say('开跑了：学你指定的这条视频'); setBvidInput(''); load(true) }
          else say(r.error || '没跑起来', true)
        } catch (e) { say('启动失败：' + (e?.message ?? e), true) }
        setBusy('')
      }

      const addPick = async (topicId, text) => {
        const raw = String(text || '').trim()
        if (!raw) { say('先贴一个 BV 号或链接', true); return }
        setBusy('pick')
        try {
          const r = await jpost('/pick', { action: 'add', topicId, bvid: raw })
          if (r.ok) {
            say(r.hasSubtitle ? '已加入自选：' + (r.pick?.title || '') : (r.warning || '已加入，但这条没有字幕'), !r.hasSubtitle)
            setPickDraft({ topicId: '', text: '' })
            load(true)
          } else say(r.error || '加不进去', true)
        } catch (e) { say('加入失败：' + (e?.message ?? e), true) }
        setBusy('')
      }

      const removePick = async (topicId, bvid) => {
        try {
          await jpost('/pick', { action: 'remove', topicId, bvid })
          say('已移除')
          load(true)
        } catch (e) { say('移除失败：' + (e?.message ?? e), true) }
      }

      const addUnit = async (topicId) => {
        const title = unitDraft.topicId === topicId ? unitDraft.title.trim() : ''
        if (!title) { say('先写单元名', true); return }
        setBusy('unit')
        try {
          await jpost('/plan', { action: 'add', topicId, title })
          setUnitDraft({ topicId: '', title: '' })
          say('单元已加')
          load(true)
        } catch (e) { say('加单元失败：' + (e?.message ?? e), true) }
        setBusy('')
      }

      const setUnit = async (topicId, unitId) => {
        try {
          await jpost('/plan', { action: 'current', topicId, unitId })
          say('已设为下一课')
          load(true)
        } catch (e) { say('设置失败：' + (e?.message ?? e), true) }
      }

      const removeUnit = async (topicId, unitId) => {
        try {
          await jpost('/plan', { action: 'remove', topicId, unitId })
          say('单元已删')
          load(true)
        } catch (e) { say('删除失败：' + (e?.message ?? e), true) }
      }

      // ── 本地资料 ──
      const addMaterialPath = async (p, topicId) => {
        const raw = String(p || '').trim()
        if (!raw) { say('先填文件路径', true); return false }
        setBusy('fileAdd')
        try {
          const r = await jpost('/file', { action: 'add', path: raw, topicId: topicId || '' })
          if (r.ok) { say('资料已加入：' + r.material.name); load(true); return true }
          say(r.error || '加不进去', true)
        } catch (e) { say('加入失败：' + (e?.message ?? e), true) }
        finally { setBusy('') }
        return false
      }

      const removeMaterial = async (id) => {
        try {
          await jpost('/file', { action: 'remove', id })
          say('已移出资料库（笔记和原文件都还在）')
          load(true)
        } catch (e) { say('移除失败：' + (e?.message ?? e), true) }
      }

      const summarizePath = async (p, topicId) => {
        setBusy('fileLearn')
        try {
          const r = await jpost('/file-learn', { path: p, topicId: topicId || '' })
          if (r.started) { say('开始读了：抽取文字 → 写笔记 → 出复习卡，约 1-3 分钟'); load(true) }
          else say(r.error || '没跑起来', true)
        } catch (e) { say('启动失败：' + (e?.message ?? e), true) }
        finally { setBusy('') }
      }

      const scanFolder = async () => {
        const dir = String(folder || st.config?.filesDir || '').trim()
        if (!dir) { say('先填资料文件夹（或去设置里填）', true); return }
        setBusy('scan')
        try {
          const r = await jget('/files/scan?folder=' + encodeURIComponent(dir) + '&limit=200')
          setScanResults(r.files || [])
          setScanInfo(`找到 ${r.count || 0} 个文件（${dir}）`)
        } catch (e) { say('扫描失败：' + (e?.message ?? e), true) }
        finally { setBusy('') }
      }

      const searchFolder = async () => {
        const dir = String(folder || st.config?.filesDir || '').trim()
        const q = String(fileQuery || '').trim()
        if (!dir) { say('先填资料文件夹（或去设置里填）', true); return }
        if (!q) { say('先填要搜的词', true); return }
        setBusy('search')
        try {
          const r = await jget('/files/search?folder=' + encodeURIComponent(dir) + '&query=' + encodeURIComponent(q) + '&limit=20')
          setScanResults(r.results || [])
          setScanInfo(`搜到 ${r.count || 0} 个匹配` + (r.pdfSkipped ? `（${r.pdfSkipped} 个 PDF 没读）` : ''))
        } catch (e) { say('搜索失败：' + (e?.message ?? e), true) }
        finally { setBusy('') }
      }

      const openNote = async (id) => {
        setNoteId(id)
        setTab('notes')
        try { setNote(await jget('/note?id=' + encodeURIComponent(id))) } catch (e) { say('读笔记失败：' + (e?.message ?? e), true) }
      }

      if (!st) {
        return h('div', { 'data-bs-page': '' },
          h('div', { 'data-bs-h1': '' }, 'B站学习'),
          h('div', { 'data-bs-empty': '' }, '正在读状态…'))
      }

      const env = st.environment || {}
      const topics = st.topics || []
      const run = st.run || {}
      const state = st.state || {}
      const cards = st.cards || {}
      const curTopic = topics[0]
      const materials = st.materials || []
      const mCounts = st.materialCounts || { total: 0, new: 0, summarized: 0, failed: 0 }
      const tabs = [
        ['home', '概览'],
        ['topics', '主题'],
        ['notes', `笔记 ${num(state.totalNotes)}`],
        ['files', `资料${mCounts?.new ? ' ' + mCounts.new : ''}`],
        ['review', `复习 ${num(cards.due)}`],
        ['settings', '设置'],
      ]

      const header = h('div', { 'data-bs-head': '' },
        h('div', { 'data-bs-grow': '' },
          h('div', { 'data-bs-h1': '' }, 'B站学习'),
          h('div', { 'data-bs-sub': '' },
            `v${st.version} · 自己找课，也能指定视频和单元`,
            env.pythonOk ? '' : ' · ⚠️ 没找到 Python',
            env.credentialOk ? '' : ' · ⚠️ 没有登录凭证')),
        h('div', { 'data-bs-row': '' },
          st.running ? Pill({ tone: 'run' }, `正在学：${run.phase || ''}`) : Pill({ tone: st.config?.auto ? 'ok' : 'bad' }, st.config?.auto ? `自动 ${st.config.studyAt}` : '自动关'),
          h('button', {
            'data-bs-btn': '', 'data-small': '',
            onClick: () => load(),
          }, '刷新')))

      // 概览
      const homeTab = h('div', { 'data-bs-page': '', style: { padding: 0, gap: 14 } },
        h('div', { 'data-bs-grid': '' },
          h('div', { 'data-bs-stat': '' },
            h('div', { 'data-bs-num': '' }, String(num(state.learnedToday))),
            h('div', { 'data-bs-k': '' }, '今天学了几课')),
          h('div', { 'data-bs-stat': '' },
            h('div', { 'data-bs-num': '' }, String(num(state.streak))),
            h('div', { 'data-bs-k': '' }, '连续学习天数')),
          h('div', { 'data-bs-stat': '' },
            h('div', { 'data-bs-num': '' }, String(num(state.totalNotes))),
            h('div', { 'data-bs-k': '' }, '累计笔记')),
          h('div', { 'data-bs-stat': '' },
            h('div', { 'data-bs-num': '' }, String(num(mCounts.total))),
            h('div', { 'data-bs-k': '' }, '份本地资料')),
          h('div', { 'data-bs-stat': '' },
            h('div', { 'data-bs-num': '' }, String(num(cards.due))),
            h('div', { 'data-bs-k': '' }, '待复习卡片'))),

        st.running
          ? h('div', { 'data-bs-card': '' },
            h('div', { 'data-bs-row': '' },
              h('span', { 'data-bs-pill': '', 'data-run': '' }, '进行中'),
              h('div', { 'data-bs-grow': '' }, run.title || run.phase || '正在准备'),
              h('span', { 'data-bs-note': '' }, run.startedAt ? fmtDate(run.startedAt) : '')),
            h('div', { 'data-bs-note': '' }, `当前阶段：${run.phase || '准备'}${run.topicName ? ' · ' + run.topicName : ''}${run.bvid ? ' · ' + run.bvid : ''}`),
            h('div', { 'data-bs-note': '' }, '这一轮会自己找一条有字幕的视频、读字幕、写笔记和复习卡。完成后这里会显示结果。'))
          : h('div', { 'data-bs-card': '' },
            h('div', { 'data-bs-row': '' },
              h('div', { 'data-bs-grow': '' },
                h('div', { 'data-bs-label': '' }, '现在学一课'),
                h('div', { 'data-bs-note': '' }, curTopic ? `主题：${curTopic.name}${curTopic.progress?.current ? ' · 下一单元：' + curTopic.progress.current : ''}` : '还没有主题')),
              Btn({ primary: true, disabled: busy === 'learn' || !curTopic, onClick: () => startLearn('') }, busy === 'learn' ? '正在启动…' : '学一课')),
            run.finishedAt && run.ok === false
              ? h('div', { 'data-bs-note': '' }, `上一课没成：${run.error || '未知原因'}（${fmtDate(run.finishedAt)}）`)
              : run.finishedAt && run.ok
                ? h('div', { 'data-bs-note': '' }, `上一课：${run.result?.title || ''} · 新卡 ${run.result?.cards || 0} 张（${fmtDate(run.finishedAt)}）`)
                : null),

        h('div', { 'data-bs-card': '' },
          h('div', { 'data-bs-label': '' }, '学你指定的视频'),
          h('div', { 'data-bs-note': '' }, '贴 BV 号或 B 站链接，直接学这一条（不受时长范围限制）；没有字幕会明确告诉你。'),
          h('div', { 'data-bs-row': '' },
            h('div', { 'data-bs-grow': '' },
              h('input', {
                'data-bs-input': '', value: bvidInput,
                placeholder: 'BV1xx… 或 https://www.bilibili.com/video/BV…',
                onChange: (e) => setBvidInput(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter' && bvidInput.trim()) learnVideo(curTopic?.id, bvidInput) },
              })),
            Btn({
              primary: true,
              disabled: busy === 'learnVideo' || !bvidInput.trim() || !curTopic || st.running,
              onClick: () => learnVideo(curTopic?.id, bvidInput),
            }, busy === 'learnVideo' ? '正在启动…' : '学这条'))),

        curTopic
          ? h('div', { 'data-bs-card': '' },
            h('div', { 'data-bs-row': '' },
              h('div', { 'data-bs-grow': '' }, h('div', { 'data-bs-label': '' }, curTopic.name)),
              h('span', { 'data-bs-note': '' }, `${curTopic.progress.done}/${curTopic.progress.total} 单元`)),
            h('div', { 'data-bs-bar': '' }, h('i', { style: { width: pct(curTopic.progress.done, curTopic.progress.total) + '%' } })),
            h('div', { 'data-bs-plan': '' },
              (curTopic.plan || []).slice(0, 6).map((u) => h('div', {
                key: u.id,
                'data-bs-unit': '',
                ...(u.status === 'done' ? { 'data-done': '' } : {}),
                ...(u.status === 'doing' ? { 'data-doing': '' } : {}),
              }, h('span', { 'data-bs-dot': '' }), h('span', { 'data-bs-grow': '' }, u.title)))))
          : h('div', { 'data-bs-card': '' }, h('div', { 'data-bs-empty': '' }, '还没有学习主题，去「主题」里加一个。')),

        h('div', { 'data-bs-card': '' },
          h('div', { 'data-bs-row': '' },
            h('div', { 'data-bs-grow': '' }, h('div', { 'data-bs-label': '' }, '今天的日报')),
            h('span', { 'data-bs-note': '' }, 'out/' + (st.today || new Date().toISOString().slice(0, 10)) + '.md')),
          st.todayDigest
            ? h('pre', { 'data-bs-pre': '', style: { maxHeight: 260 } }, st.todayDigest)
            : h('div', { 'data-bs-empty': '' }, '今天还没学。到点会自动学，或者点上面的「学一课」。')),

        h('div', { 'data-bs-card': '' },
          h('div', { 'data-bs-label': '' }, '最近的笔记'),
          (st.notes || []).length
            ? h('div', { 'data-bs-list': '' }, (st.notes || []).slice(0, 5).map((n) => h('div', {
              key: n.id, 'data-bs-item': '', onClick: () => openNote(n.id),
            },
              h('span', { 'data-bs-grow': '' }, n.title),
              h('span', { 'data-bs-note': '' }, `${fmtMin(n.duration)} · ${n.cards} 卡`))))
            : h('div', { 'data-bs-empty': '' }, '还没有笔记。')))

      // 主题
      const addTopic = async () => {
        if (!draft.name.trim()) { say('主题名不能为空', true); return }
        setBusy('topic')
        try {
          await jpost('/topic', {
            action: 'add',
            name: draft.name.trim(),
            keywords: draft.keywords.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
            goal: draft.goal.trim(),
          })
          setDraft({ name: '', keywords: '', goal: '' })
          say('主题已加')
          load(true)
        } catch (e) { say('加失败：' + (e?.message ?? e), true) }
        setBusy('')
      }
      const saveTopic = async (id) => {
        setBusy('topic')
        try {
          await jpost('/topic', {
            action: 'update', id,
            name: draft.name.trim(),
            keywords: draft.keywords.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
            goal: draft.goal.trim(),
          })
          setEditId('')
          say('已保存')
          load(true)
        } catch (e) { say('保存失败：' + (e?.message ?? e), true) }
        setBusy('')
      }
      const delTopic = async (t) => {
        if (!window.confirm(`删除主题「${t.name}」？笔记文件保留在磁盘上，但索引和复习卡会移掉。`)) return
        try {
          await jpost('/topic', { action: 'remove', id: t.id })
          say('已删除')
          load(true)
        } catch (e) { say('删除失败：' + (e?.message ?? e), true) }
      }
      const topicsTab = h('div', { 'data-bs-page': '', style: { padding: 0, gap: 12 } },
        topics.length === 0 ? h('div', { 'data-bs-empty': '' }, '还没有主题。') : null,
        topics.map((t) => h('div', { key: t.id, 'data-bs-card': '' },
          editId === t.id
            ? h('div', { 'data-bs-field': '' },
              h('input', { 'data-bs-input': '', value: draft.name, placeholder: '主题名', onChange: (e) => setDraft({ ...draft, name: e.target.value }) }),
              h('input', { 'data-bs-input': '', value: draft.keywords, placeholder: '关键词，用空格或逗号分隔', onChange: (e) => setDraft({ ...draft, keywords: e.target.value }) }),
              h('input', { 'data-bs-input': '', value: draft.goal, placeholder: '学习目标（一句话）', onChange: (e) => setDraft({ ...draft, goal: e.target.value }) }),
              h('div', { 'data-bs-row': '' },
                Btn({ primary: true, onClick: () => saveTopic(t.id), disabled: busy === 'topic' }, '保存'),
                Btn({ onClick: () => setEditId('') }, '取消')))
            : h('div', { 'data-bs-row': '' },
              h('div', { 'data-bs-grow': '' },
                h('div', { 'data-bs-label': '' }, t.name),
                h('div', { 'data-bs-note': '' }, t.goal || '（没写目标）')),
              h('span', { 'data-bs-note': '' }, `${t.progress.done}/${t.progress.total}`),
              Btn({ small: true, onClick: () => { setEditId(t.id); setDraft({ name: t.name, keywords: (t.keywords || []).join(' '), goal: t.goal || '' }) } }, '编辑'),
              Btn({ small: true, danger: true, onClick: () => delTopic(t) }, '删除')),
          h('div', { 'data-bs-bar': '' }, h('i', { style: { width: pct(t.progress.done, t.progress.total) + '%' } })),
          t.progress.current ? h('div', { 'data-bs-note': '' }, '当前单元：' + t.progress.current) : null,
          h('div', { 'data-bs-plan': '' }, (t.plan || []).map((u) => h('div', {
            key: u.id, 'data-bs-unit': '',
            ...(u.status === 'done' ? { 'data-done': '' } : {}),
            ...(u.status === 'doing' ? { 'data-doing': '' } : {}),
          },
          h('span', { 'data-bs-dot': '' }),
          h('span', { 'data-bs-grow': '' }, u.title),
          h('span', { 'data-bs-note': '' }, u.notes ? `${u.notes} 条笔记` : ''),
          u.status === 'doing'
            ? h('span', { 'data-bs-note': '' }, '当前')
            : Btn({ small: true, onClick: () => setUnit(t.id, u.id) }, '设为当前'),
          Btn({ small: true, danger: true, onClick: () => removeUnit(t.id, u.id) }, '×')))),
          h('div', { 'data-bs-row': '' },
            h('div', { 'data-bs-grow': '' },
              h('input', {
                'data-bs-input': '', placeholder: '加一个学习单元，如「频域：Bode 图」',
                value: unitDraft.topicId === t.id ? unitDraft.title : '',
                onChange: (e) => setUnitDraft({ topicId: t.id, title: e.target.value }),
                onKeyDown: (e) => { if (e.key === 'Enter') addUnit(t.id) },
              })),
            Btn({ small: true, disabled: busy === 'unit', onClick: () => addUnit(t.id) }, '加单元')),

          h('div', { 'data-bs-label': '', style: { marginTop: 6 } }, '自选视频（会优先学）'),
          (t.picks || []).length
            ? h('div', { 'data-bs-list': '' }, (t.picks || []).map((p) => h('div', {
              key: p.bvid, 'data-bs-item': '',
            },
            h('span', { 'data-bs-grow': '' }, p.title || p.bvid),
            h('span', { 'data-bs-note': '' }, `${fmtMin(p.duration)} · ${p.bvid}`),
            Btn({ small: true, primary: true, disabled: st.running, onClick: () => learnVideo(t.id, p.bvid) }, '学这条'),
            Btn({ small: true, danger: true, onClick: () => removePick(t.id, p.bvid) }, '移除'))))
            : h('div', { 'data-bs-empty': '' }, '还没有自选视频；下面贴一条 BV 号 / 链接。'),
          h('div', { 'data-bs-row': '' },
            h('div', { 'data-bs-grow': '' },
              h('input', {
                'data-bs-input': '', placeholder: '贴 BV 号 / B站链接，加入自选',
                value: pickDraft.topicId === t.id ? pickDraft.text : '',
                onChange: (e) => setPickDraft({ topicId: t.id, text: e.target.value }),
                onKeyDown: (e) => { if (e.key === 'Enter') addPick(t.id, pickDraft.text) },
              })),
            Btn({ small: true, disabled: busy === 'pick', onClick: () => addPick(t.id, pickDraft.text) }, '加入自选')),

          h('div', { 'data-bs-row': '' },
            Btn({ small: true, primary: true, disabled: busy === 'learn' || st.running, onClick: () => startLearn(t.id) }, '学这个主题'),
            Btn({ small: true, onClick: () => { setBvidInput(''); setTab('home') } }, '去粘贴指定视频')))),
        h('div', { 'data-bs-card': '' },
          h('div', { 'data-bs-label': '' }, '加一个主题'),
          h('input', { 'data-bs-input': '', placeholder: '例如：自动控制原理', value: draft.name, onChange: (e) => setDraft({ ...draft, name: e.target.value }) }),
          h('input', { 'data-bs-input': '', placeholder: '搜课关键词（空格/逗号分隔）', value: draft.keywords, onChange: (e) => setDraft({ ...draft, keywords: e.target.value }) }),
          h('input', { 'data-bs-input': '', placeholder: '目标（一句话，可空）', value: draft.goal, onChange: (e) => setDraft({ ...draft, goal: e.target.value }) }),
          h('div', { 'data-bs-row': '' }, Btn({ primary: true, disabled: busy === 'topic' || !draft.name.trim(), onClick: addTopic }, '添加'))))

      // 笔记
      const shownNotes = noteList || st.notes || []
      const notesTab = h('div', { 'data-bs-page': '', style: { padding: 0, gap: 12 } },
        h('div', { 'data-bs-split': '' },
          h('div', { 'data-bs-card': '', style: { padding: 8 } },
            h('div', { 'data-bs-list': '' },
              shownNotes.length
                ? shownNotes.map((n) => h('div', {
                  key: n.id, 'data-bs-item': '', ...(noteId === n.id ? { 'data-on': '' } : {}),
                  onClick: () => openNote(n.id),
                }, h('span', { 'data-bs-grow': '' }, n.title), h('span', { 'data-bs-note': '' }, n.cards + ' 卡')))
                : h('div', { 'data-bs-empty': '' }, '还没有笔记。'))),
          h('div', { 'data-bs-card': '' },
            note
              ? h('div', {},
                h('div', { 'data-bs-row': '', style: { marginBottom: 8 } },
                  h('div', { 'data-bs-grow': '' }, h('div', { 'data-bs-label': '' }, note.meta.title)),
                  note.meta.kind === 'file'
                    ? h('span', { 'data-bs-note': '', style: { wordBreak: 'break-all' } }, note.meta.path || '')
                    : h('a', {
                      href: `https://www.bilibili.com/video/${note.meta.bvid}`,
                      target: '_blank', rel: 'noreferrer',
                      style: { fontSize: 11 },
                    }, '打开原视频')),
                h('div', { 'data-bs-note': '', style: { marginBottom: 10 } },
                  note.meta.kind === 'file'
                    ? `${note.meta.topicName} · ${note.meta.unitTitle || ''} · 资料 · ${fmtDate(note.meta.createdAt)}`
                    : `${note.meta.topicName} · ${note.meta.unitTitle || ''} · ${fmtMin(note.meta.duration)} · ${fmtDate(note.meta.createdAt)}`),
                Md({ text: note.markdown }))
              : h('div', { 'data-bs-empty': '' }, '左边选一条笔记。'))))

      // 资料（本地文件）
      const filesTab = h('div', { 'data-bs-page': '', style: { padding: 0, gap: 12 } },
        h('div', { 'data-bs-card': '' },
          h('div', { 'data-bs-label': '' }, '添加本地资料'),
          h('div', { 'data-bs-note': '' }, '支持 txt / md / csv / json / 代码 / html / ipynb / docx / pptx / xlsx / epub / pdf（已内置 pypdf；扫描件读不到）。只读，不改原文件。'),
          h('div', { 'data-bs-row': '' },
            h('div', { 'data-bs-grow': '' },
              h('input', {
                'data-bs-input': '', value: filePath,
                placeholder: '文件路径，如 C:\\Users\\…\\资料.docx',
                onChange: (e) => setFilePath(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter') addMaterialPath(filePath, fileTopic || curTopic?.id) },
              })),
            h('select', {
              'data-bs-select': '', style: { width: 150, flex: 'none' }, value: fileTopic || curTopic?.id || '',
              onChange: (e) => setFileTopic(e.target.value),
            }, topics.map((t) => h('option', { key: t.id, value: t.id }, t.name))),
            Btn({ primary: true, disabled: busy === 'fileAdd' || !filePath.trim(), onClick: () => addMaterialPath(filePath, fileTopic || curTopic?.id) }, '加入')),
          h('div', { 'data-bs-note': '' }, '加入后不会自动读；点「总结」才会抽文字、写笔记、出复习卡。')),

        h('div', { 'data-bs-card': '' },
          h('div', { 'data-bs-label': '' }, '从文件夹找 / 搜'),
          h('div', { 'data-bs-row': '' },
            h('div', { 'data-bs-grow': '' },
              h('input', {
                'data-bs-input': '', value: folder,
                placeholder: st.config?.filesDir ? `默认：${st.config.filesDir}` : '资料文件夹（可去设置里填默认）',
                onChange: (e) => setFolder(e.target.value),
              }))),
          h('div', { 'data-bs-row': '' },
            h('div', { 'data-bs-grow': '' },
              h('input', {
                'data-bs-input': '', value: fileQuery, placeholder: '搜什么？按文件名和正文搜',
                onChange: (e) => setFileQuery(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter') searchFolder() },
              })),
            Btn({ small: true, disabled: busy === 'search', onClick: searchFolder }, busy === 'search' ? '搜…' : '搜索'),
            Btn({ small: true, disabled: busy === 'scan', onClick: scanFolder }, busy === 'scan' ? '扫…' : '扫描全部')),
          scanInfo ? h('div', { 'data-bs-note': '' }, scanInfo) : null,
          scanResults.length
            ? h('div', { 'data-bs-list': '' }, scanResults.slice(0, 15).map((f) => h('div', { key: f.path, 'data-bs-item': '', style: { flexWrap: 'wrap' } },
              h('div', { 'data-bs-grow': '', style: { minWidth: 200 } },
                h('div', {}, f.name),
                h('div', { 'data-bs-note': '' }, (f.ext || '') + ' · ' + Math.round((f.size || 0) / 1024) + ' KB' + (f.snippet ? ' · ' + f.snippet : ''))),
              Btn({ small: true, onClick: () => addMaterialPath(f.path, fileTopic || curTopic?.id) }, '加入'),
              Btn({ small: true, primary: true, disabled: st.running || busy === 'fileLearn', onClick: () => summarizePath(f.path, fileTopic || curTopic?.id) }, '总结'))))
            : h('div', { 'data-bs-empty': '' }, '扫描或搜索后会列在这里。')),

        h('div', { 'data-bs-card': '' },
          h('div', { 'data-bs-row': '' },
            h('div', { 'data-bs-grow': '' }, h('div', { 'data-bs-label': '' }, '资料库')),
            h('span', { 'data-bs-note': '' }, `${mCounts.total} 份 · 待总结 ${mCounts.new}`)),
          materials.length
            ? h('div', { 'data-bs-list': '' }, materials.map((m) => h('div', { key: m.id, 'data-bs-item': '', style: { flexWrap: 'wrap' } },
              h('div', { 'data-bs-grow': '', style: { minWidth: 220 } },
                h('div', {}, m.name),
                h('div', { 'data-bs-note': '', style: { wordBreak: 'break-all' } }, `${m.topicName || ''} · ${Math.round((m.size || 0) / 1024)} KB · ${m.path}`)),
              Pill({ tone: m.status === 'summarized' ? 'ok' : m.status === 'failed' ? 'bad' : '' },
                m.status === 'summarized' ? '已总结' : m.status === 'failed' ? '失败' : '待总结'),
              Btn({ small: true, primary: true, disabled: st.running || busy === 'fileLearn', onClick: () => summarizePath(m.path, m.topicId) }, '总结'),
              Btn({ small: true, danger: true, onClick: () => removeMaterial(m.id) }, '移除'))))
            : h('div', { 'data-bs-empty': '' }, '还没有资料。上面加一个，或从文件夹搜一个。')))

      // 复习
      const current = reviewCards[0]
      const grade = async (g) => {
        if (!current) return
        setBusy('grade')
        try {
          await jpost('/review', { cardId: current.id, grade: g })
          setReviewCards((list) => list.slice(1))
          setReveal(false)
          const r = await jget('/review?limit=20')
          setReviewStats(r.stats || null)
          if (!(r.cards || []).length) setReviewCards([])
        } catch (e) { say('评分失败：' + (e?.message ?? e), true) }
        setBusy('')
      }
      const reviewTab = h('div', { 'data-bs-page': '', style: { padding: 0, gap: 12 } },
        h('div', { 'data-bs-grid': '' },
          h('div', { 'data-bs-stat': '' }, h('div', { 'data-bs-num': '' }, String(num(reviewStats?.due ?? cards.due))), h('div', { 'data-bs-k': '' }, '到期')),
          h('div', { 'data-bs-stat': '' }, h('div', { 'data-bs-num': '' }, String(num(reviewStats?.total ?? cards.total))), h('div', { 'data-bs-k': '' }, '卡片总数')),
          h('div', { 'data-bs-stat': '' }, h('div', { 'data-bs-num': '' }, String(num(reviewStats?.learned ?? cards.learned))), h('div', { 'data-bs-k': '' }, '复习过'))),
        current
          ? h('div', { 'data-bs-card': '', 'data-bs-flip': '' },
            h('div', { 'data-bs-note': '' }, current.title || ''),
            h('div', { 'data-bs-label': '', style: { fontSize: 14, lineHeight: '22px' } }, current.q),
            reveal
              ? h('div', { 'data-bs-answer': '' },
                h('div', { 'data-bs-pre': '', style: { maxHeight: 200 } }, current.a),
                h('div', { 'data-bs-row': '', style: { marginTop: 10 } },
                  Btn({ small: true, danger: true, onClick: () => grade(0), disabled: busy === 'grade' }, '再来一次'),
                  Btn({ small: true, onClick: () => grade(1), disabled: busy === 'grade' }, '困难'),
                  Btn({ small: true, onClick: () => grade(2), disabled: busy === 'grade' }, '一般'),
                  Btn({ small: true, primary: true, onClick: () => grade(3), disabled: busy === 'grade' }, '简单')))
              : h('div', { 'data-bs-row': '' },
                Btn({ primary: true, onClick: () => setReveal(true) }, '看答案'),
                h('span', { 'data-bs-note': '' }, `还剩 ${reviewCards.length} 张`)))
          : h('div', { 'data-bs-card': '' },
            h('div', { 'data-bs-empty': '' }, '今天没有到期的卡。学一课就会自动出新卡。'),
            h('div', { 'data-bs-row': '' }, Btn({ onClick: () => { jget('/review?limit=20').then((r) => { setReviewCards(r.cards || []); setReviewStats(r.stats || {}) }).catch(() => {}) } }, '重新查'))))

      // 设置
      const setC = (k, v) => setDraftCfg((d) => ({ ...(d || {}), [k]: v }))
      const saveCfg = async () => {
        setBusy('cfg')
        try {
          const patch = {}
          for (const k of ['auto', 'studyAt', 'maxPerDay', 'minMinutes', 'maxMinutes', 'cardsPerNote', 'noteLevel', 'runTimeoutMinutes', 'maxTranscriptChars', 'pythonPath', 'credentialPath', 'modelProvider', 'modelName', 'dshBin', 'headlessProfile', 'filesDir']) {
            if (draftCfg && draftCfg[k] !== undefined) patch[k] = draftCfg[k]
          }
          const r = await jpost('/config', { patch })
          say(r.hostOk ? '已保存' : '已保存到插件（宿主设置没同步成功，不影响使用）', !r.hostOk)
          load(true)
        } catch (e) { say('保存失败：' + (e?.message ?? e), true) }
        setBusy('')
      }
      const importCred = async () => {
        setBusy('cred')
        try {
          const r = await jpost('/import-credential', {})
          say('已从「刷B站」导入登录凭证')
          load(true)
        } catch (e) { say('导入失败：' + (e?.message ?? e), true) }
        setBusy('')
      }
      const checkLogin = async () => {
        setBusy('login')
        try {
          const r = await jpost('/check-login', {})
          say(r.loggedIn ? `已登录：${r.uname}（uid ${r.mid}）` : '凭证在，但 B 站说登录失效了', !r.loggedIn)
        } catch (e) { say('检查失败：' + (e?.message ?? e), true) }
        setBusy('')
      }
      const startLogin = async () => {
        setBusy('login')
        try {
          const r = await jpost('/login/start', {})
          if (r.ok) {
            setLogin({ key: r.key, qr: r.qr, state: 'waiting' })
            say('用 B站 App 扫下面的二维码')
          } else say(r.error || '出码失败', true)
        } catch (e) { say('出码失败：' + (e?.message ?? e), true) }
        setBusy('')
      }
      const cfgTab = h('div', { 'data-bs-page': '', style: { padding: 0, gap: 12 } },
        h('div', { 'data-bs-card': '' },
          h('div', { 'data-bs-label': '' }, '学习节奏'),
          Toggle({ checked: draftCfg?.auto, onChange: (v) => setC('auto', v), label: '到点自动学', hint: '每天到了下面的时间，自己学一课；学完写日报' }),
          h('div', { 'data-bs-grid': '' },
            Field({ label: '每天几点', hint: 'HH:MM' }, h('input', { 'data-bs-input': '', value: draftCfg?.studyAt ?? '', onChange: (e) => setC('studyAt', e.target.value) })),
            Field({ label: '每天最多几课' }, h('input', { 'data-bs-input': '', type: 'number', min: 0, max: 6, value: draftCfg?.maxPerDay ?? 1, onChange: (e) => setC('maxPerDay', Number(e.target.value)) })),
            Field({ label: '视频最短（分钟）' }, h('input', { 'data-bs-input': '', type: 'number', min: 1, max: 120, value: draftCfg?.minMinutes ?? 4, onChange: (e) => setC('minMinutes', Number(e.target.value)) })),
            Field({ label: '视频最长（分钟）' }, h('input', { 'data-bs-input': '', type: 'number', min: 2, max: 300, value: draftCfg?.maxMinutes ?? 75, onChange: (e) => setC('maxMinutes', Number(e.target.value)) })),
            Field({ label: '每条笔记几张卡' }, h('input', { 'data-bs-input': '', type: 'number', min: 0, max: 12, value: draftCfg?.cardsPerNote ?? 6, onChange: (e) => setC('cardsPerNote', Number(e.target.value)) })),
            Field({ label: '笔记详细程度' }, h('select', { 'data-bs-select': '', value: draftCfg?.noteLevel ?? 'standard', onChange: (e) => setC('noteLevel', e.target.value) },
              h('option', { value: 'brief' }, '简略'),
              h('option', { value: 'standard' }, '标准'),
              h('option', { value: 'deep' }, '深入')))),
          Field({ label: '资料文件夹', hint: '「资料」页默认从这里扫描 / 搜索；留空也能在资料页临时填' },
            h('input', { 'data-bs-input': '', placeholder: '例如 D:\\学习资料', value: draftCfg?.filesDir ?? '', onChange: (e) => setC('filesDir', e.target.value) }))),

        h('div', { 'data-bs-card': '' },
          h('div', { 'data-bs-label': '' }, '模型（留空 = 用 profile 默认的 deepseek-account / deepseek-flash）'),
          h('div', { 'data-bs-grid': '' },
            Field({ label: 'provider' }, h('input', { 'data-bs-input': '', placeholder: 'deepseek-account', value: draftCfg?.modelProvider ?? '', onChange: (e) => setC('modelProvider', e.target.value) })),
            Field({ label: 'model' }, h('input', { 'data-bs-input': '', placeholder: 'deepseek-flash', value: draftCfg?.modelName ?? '', onChange: (e) => setC('modelName', e.target.value) })),
            Field({ label: '一课最多跑（分钟）' }, h('input', { 'data-bs-input': '', type: 'number', min: 1, max: 60, value: draftCfg?.runTimeoutMinutes ?? 12, onChange: (e) => setC('runTimeoutMinutes', Number(e.target.value)) })),
            Field({ label: '字幕最多递给模型（字）' }, h('input', { 'data-bs-input': '', type: 'number', min: 4000, max: 60000, value: draftCfg?.maxTranscriptChars ?? 32000, onChange: (e) => setC('maxTranscriptChars', Number(e.target.value)) })))),

        h('div', { 'data-bs-card': '' },
          h('div', { 'data-bs-label': '' }, '环境'),
          h('div', { 'data-bs-row': '' },
            Pill({ tone: env.pythonOk ? 'ok' : 'bad' }, env.pythonOk ? 'Python ✓' : 'Python ✗'),
            Pill({ tone: env.credentialOk ? 'ok' : 'bad' }, env.credentialOk ? '登录凭证 ✓' : '登录凭证 ✗'),
            Pill({ tone: env.profileOk ? 'ok' : 'bad' }, env.profileOk ? '学习 profile ✓' : '学习 profile ✗'),
            Pill({ tone: env.readerOk ? 'ok' : 'bad' }, env.readerOk ? '阅读器 ✓' : '阅读器 ✗')),
          h('div', { 'data-bs-note': '', style: { wordBreak: 'break-all' } }, `Python：${env.python || '没找到'} · 凭证：${env.credentialPath || '没有'}`),
          h('div', { 'data-bs-note': '', style: { wordBreak: 'break-all' } }, `数据目录：${st.home}`),
          h('div', { 'data-bs-row': '' },
            Btn({ small: true, primary: true, onClick: startLogin, disabled: busy === 'login' }, '扫码登录'),
            Btn({ small: true, onClick: importCred, disabled: busy === 'cred' }, '从「刷B站」导入登录'),
            Btn({ small: true, onClick: checkLogin, disabled: busy === 'login' }, '检查登录')),
          login
            ? h('div', { 'data-bs-row': '', style: { alignItems: 'flex-start', gap: 14, marginTop: 6 } },
              login.state === 'expired'
                ? h('div', { 'data-bs-grow': '' },
                  h('div', { 'data-bs-note': '' }, login.error || '二维码过期了'),
                  Btn({ small: true, onClick: startLogin, disabled: busy === 'login' }, '重新出码'))
                : h('div', { 'data-bs-row': '', style: { alignItems: 'flex-start', gap: 14 } },
                  h('img', {
                    src: login.qr, width: 180, height: 180, alt: 'B站登录二维码',
                    style: { borderRadius: 8, background: '#fff', flex: 'none' },
                  }),
                  h('div', { 'data-bs-grow': '' },
                    h('div', { 'data-bs-label': '' }, login.state === 'scanned' ? '已扫码，请在手机上确认' : '用 B站 App 扫一扫'),
                    h('div', { 'data-bs-note': '' }, '二维码约 2 分钟有效；登录成功后凭证会存到插件自己的家目录。'),
                    Btn({ small: true, onClick: () => setLogin(null) }, '取消'))))
            : null,
          h('div', { 'data-bs-grid': '' },
            Field({ label: 'pythonPath（可空）' }, h('input', { 'data-bs-input': '', value: draftCfg?.pythonPath ?? '', onChange: (e) => setC('pythonPath', e.target.value) })),
            Field({ label: 'credentialPath（可空）' }, h('input', { 'data-bs-input': '', value: draftCfg?.credentialPath ?? '', onChange: (e) => setC('credentialPath', e.target.value) })),
            Field({ label: 'headlessProfile' }, h('input', { 'data-bs-input': '', value: draftCfg?.headlessProfile ?? 'bili-study', onChange: (e) => setC('headlessProfile', e.target.value) })),
            Field({ label: 'dshBin（可空）' }, h('input', { 'data-bs-input': '', value: draftCfg?.dshBin ?? '', onChange: (e) => setC('dshBin', e.target.value) }))),
          h('div', { 'data-bs-note': '' }, '凭证用来读 B 站 AI 字幕。没有它，绝大多数视频会被当成「没有字幕」跳过。')),

        h('div', { 'data-bs-row': '' },
          Btn({ primary: true, onClick: saveCfg, disabled: busy === 'cfg' }, busy === 'cfg' ? '保存中…' : '保存设置'),
          Btn({ onClick: () => load(true) }, '重新读状态')))

      return h('div', { 'data-bs-page': '' },
        header,
        toast ? h('div', { 'data-bs-toast': '', ...(toastBad ? { 'data-bad': '' } : {}) }, toast) : null,
        h('div', { 'data-bs-tabs': '' }, tabs.map(([id, label]) => h('button', {
          key: id, 'data-bs-tab': '', ...(tab === id ? { 'data-on': '' } : {}),
          onClick: () => setTab(id),
        }, label))),
        tab === 'home' ? homeTab : tab === 'topics' ? topicsTab : tab === 'notes' ? notesTab : tab === 'files' ? filesTab : tab === 'review' ? reviewTab : cfgTab,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', 'dsh-bili-learn')
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(() => () => style.remove(), 'dsh-bili-learn: 设置页样式')

        const slots = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots
        if (!slots) return
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'bili-study', order: 31, label: 'B站学习' },
          () => h(Panel),
        ))
      },
    }
  },
})
