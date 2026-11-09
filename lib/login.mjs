/**
 * lib/login.mjs —— B 站扫码登录（扫码 → 轮询 → 写 bili_credential.json）
 *
 * 为什么自己做：
 *   之前只能复用「刷B站」的凭证；分享给别人时对方不一定装了刷B站。
 *   这里直接走 B 站 passport 的二维码登录接口，凭证落在插件自己的家目录。
 *
 * 注意：只保存读字幕需要的四个 cookie，不发任何评论/点赞。
 */
import { join } from 'node:path'
import qrcode from '../vendor/qrcode-generator.mjs'
import { writeJson } from './paths.mjs'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const HEADERS = {
  'user-agent': UA,
  referer: 'https://www.bilibili.com/',
  origin: 'https://www.bilibili.com',
  'accept-language': 'zh-CN,zh;q=0.9',
}

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('B 站返回的不是 JSON：' + text.slice(0, 120))
  }
  return { res, json }
}

/** 把登录 URL 画成二维码（GIF data URL） */
export function qrDataUrl(text) {
  const qr = qrcode(0, 'M')
  qr.addData(String(text))
  qr.make()
  return qr.createDataURL(5, 2)
}

/** 开始扫码：返回 { ok, key, url, qr } */
export async function start() {
  const { json } = await getJson('https://passport.bilibili.com/x/passport-login/web/qrcode/generate')
  if (json?.code !== 0) return { ok: false, error: `出码失败：${json?.message || json?.code || '未知'}` }
  const key = String(json.data?.qrcode_key || '')
  const url = String(json.data?.url || '')
  if (!key || !url) return { ok: false, error: '出码失败：B 站没返回 qrcode_key / url' }
  return { ok: true, key, url, qr: qrDataUrl(url) }
}

/** 从 Set-Cookie 头里取 cookie（key 小写） */
export function cookiesFrom(headers) {
  const out = {}
  let list = []
  try {
    list = typeof headers?.getSetCookie === 'function' ? headers.getSetCookie() : []
  } catch { list = [] }
  for (const raw of list) {
    const first = String(raw).split(';')[0]
    const i = first.indexOf('=')
    if (i <= 0) continue
    out[first.slice(0, i).trim().toLowerCase()] = first.slice(i + 1).trim()
  }
  return out
}

/** 从 B 站 crossDomain URL 里按原样取值（不要 decode，SESSDATA 要保持 %2C 形式） */
export function rawQuery(url, key) {
  const q = String(url || '').split('?')[1] || ''
  for (const part of q.split('&')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i) === key) return part.slice(i + 1)
  }
  return ''
}

async function fetchBuvid3() {
  try {
    const { json } = await getJson('https://api.bilibili.com/x/frontend/finger/spi')
    return String(json?.data?.b_3 || '')
  } catch {
    return ''
  }
}

/**
 * 轮询扫码结果
 * @returns {{ok:boolean,state:'waiting'|'scanned'|'expired'|'ok'|'error',error?:string,credential?:object}}
 */
export async function poll(key) {
  const url = `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(key)}&source=main-fe-header`
  const { res, json } = await getJson(url)
  if (json?.code !== 0) return { ok: false, state: 'error', error: `轮询失败：${json?.message || json?.code || '未知'}` }
  const code = Number(json.data?.code)
  if (code === 86101) return { ok: true, state: 'waiting' }
  if (code === 86090) return { ok: true, state: 'scanned' }
  if (code === 86038) return { ok: true, state: 'expired' }
  if (code !== 0) return { ok: false, state: 'error', error: `登录未完成：${json.data?.message || code}` }

  const cookies = cookiesFrom(res.headers)
  const cross = String(json.data?.url || '')
  // 优先 Set-Cookie（原样）；没有再用 crossDomain URL 的原始查询串
  const sessdata = cookies.sessdata || rawQuery(cross, 'SESSDATA') || ''
  const biliJct = cookies.bili_jct || rawQuery(cross, 'bili_jct') || ''
  const dede = cookies.dedeuserid || rawQuery(cross, 'DedeUserID') || ''
  if (!sessdata) return { ok: false, state: 'error', error: '登录成功了，但没拿到 SESSDATA（B 站接口可能变了）' }
  const buvid3 = cookies.buvid3 || await fetchBuvid3()
  return {
    ok: true,
    state: 'ok',
    credential: {
      sessdata,
      bili_jct: biliJct,
      buvid3,
      dedeuserid: dede,
    },
  }
}

/** 写进插件家目录，返回文件路径 */
export function saveCredential(home, credential) {
  const file = join(home, 'bili_credential.json')
  writeJson(file, {
    sessdata: String(credential.sessdata || ''),
    bili_jct: String(credential.bili_jct || ''),
    buvid3: String(credential.buvid3 || ''),
    dedeuserid: String(credential.dedeuserid || ''),
  })
  return file
}
