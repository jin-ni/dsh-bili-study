#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bili_read.py — 「B站学习」插件的只读数据源（Python 标准库，无第三方依赖）

为什么是 Python：
  · B 站的搜索 / 播放器接口要 WBI 签名 + 登录 Cookie，用标准库写一遍最稳；
  · 插件家目录里已经有「刷B站」装好的 Python，直接复用，不额外装依赖；
  · 只读不写：不登录、不评论、不点赞，凭证只用来读字幕。

命令（全部输出单行 JSON 到 stdout，失败也是 ok:false 而不是抛栈）：
  whoami
  search   --keyword 自动控制原理 [--pages 2] [--order pubdate|click|totalrank] [--limit 20]
  info     --bvid BV1xx
  subtitle --bvid BV1xx
  material --bvid BV1xx [--max-chars 30000]

凭证文件（JSON，键名大小写都认）：
  C:/Users/<你>/.dsh/bili-duty/bili_credential.json 或插件自己的 bili_credential.json
  字段：sessdata / bili_jct / buvid3 / dedeuserid
"""
import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
REFERER = "https://www.bilibili.com/"
TIMEOUT = 20

MIXIN_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
]


def out(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def die(msg, **extra):
    out({"ok": False, "error": str(msg), **extra})
    sys.exit(0)


def log(msg):
    sys.stderr.write(str(msg) + "\n")
    sys.stderr.flush()


# ── 凭证 ──────────────────────────────────────────────────────────────────────
def load_cred():
    path = os.environ.get("BILI_STUDY_CRED", "").strip()
    if path and os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                low = {str(k).lower(): v for k, v in data.items()}
                return low
        except Exception as e:
            log("读凭证失败：" + str(e))
    return {}


def cookie_header(cred):
    parts = []
    mapping = {
        "sessdata": "SESSDATA",
        "bili_jct": "bili_jct",
        "buvid3": "buvid3",
        "dedeuserid": "DedeUserID",
        "dedeuserid__ckmd5": "DedeUserID__ckMd5",
    }
    for k, name in mapping.items():
        v = cred.get(k)
        if v:
            parts.append("%s=%s" % (name, v))
    return "; ".join(parts)


# ── HTTP ─────────────────────────────────────────────────────────────────────
def http_get(url, cred, extra_headers=None, raw=False):
    headers = {
        "User-Agent": UA,
        "Referer": REFERER,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Accept-Encoding": "identity",
    }
    ck = cookie_header(cred)
    if ck:
        headers["Cookie"] = ck
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        body = resp.read()
        if raw:
            return body
        return json.loads(body.decode("utf-8", "replace"))


# ── WBI 签名 ──────────────────────────────────────────────────────────────────
_wbi_cache = {}


def wbi_keys(cred):
    if _wbi_cache.get("mixin"):
        return _wbi_cache["mixin"]
    data = http_get("https://api.bilibili.com/x/web-interface/nav", cred)
    if data.get("code") != 0:
        die("取 WBI 密钥失败：%s" % data.get("message"), code=data.get("code"))
    wbi = (data.get("data") or {}).get("wbi_img") or {}
    img = os.path.basename(urllib.parse.urlparse(wbi.get("img_url", "")).path).split(".")[0]
    sub = os.path.basename(urllib.parse.urlparse(wbi.get("sub_url", "")).path).split(".")[0]
    if not img or not sub:
        die("WBI 密钥不完整（B 站返回格式变了？）")
    orig = img + sub
    mixin = "".join(orig[i] for i in MIXIN_TAB if i < len(orig))[:32]
    _wbi_cache["mixin"] = mixin
    return mixin


def wbi_sign(params, cred):
    mixin = wbi_keys(cred)
    params = dict(params)
    params["wts"] = int(time.time())
    items = sorted(params.items())
    clean = []
    for k, v in items:
        s = re.sub(r"[!'()*]", "", str(v))
        clean.append((k, s))
    query = urllib.parse.urlencode(clean)
    w_rid = hashlib.md5((query + mixin).encode("utf-8")).hexdigest()
    clean.append(("w_rid", w_rid))
    return urllib.parse.urlencode(clean)


def api(url, params, cred):
    sep = "&" if "?" in url else "?"
    return http_get(url + sep + wbi_sign(params, cred), cred)


# ── 业务 ─────────────────────────────────────────────────────────────────────
def clean_html(s):
    s = re.sub(r"<[^>]+>", "", str(s or ""))
    return (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
             .replace("&quot;", '"').replace("&#39;", "'").strip())


def parse_duration(v):
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v or "0")
    if ":" in s:
        try:
            parts = [int(x) for x in s.split(":")]
        except ValueError:
            return 0
        n = 0
        for p in parts:
            n = n * 60 + p
        return n
    try:
        return int(float(s))
    except ValueError:
        return 0


def cmd_whoami(_args):
    cred = load_cred()
    if not cred.get("sessdata"):
        die("没有凭证（没有 SESSDATA）")
    data = http_get("https://api.bilibili.com/x/web-interface/nav", cred)
    d = data.get("data") or {}
    out({
        "ok": True,
        "loggedIn": bool(d.get("isLogin")),
        "uname": d.get("uname") or "",
        "mid": d.get("mid") or 0,
        "vip": bool((d.get("vipStatus") or 0)),
        "credentialPath": os.environ.get("BILI_STUDY_CRED", ""),
        "code": data.get("code"),
        "message": data.get("message"),
    })


def cmd_search(args):
    cred = load_cred()
    keyword = args.keyword.strip()
    if not keyword:
        die("keyword 不能为空")
    pages = max(1, min(int(args.pages or 2), 5))
    limit = max(1, min(int(args.limit or 20), 50))
    order = args.order or "pubdate"
    seen = set()
    items = []
    for page in range(1, pages + 1):
        data = api("https://api.bilibili.com/x/web-interface/wbi/search/type", {
            "search_type": "video",
            "keyword": keyword,
            "page": page,
            "order": order,
            "page_size": 30,
        }, cred)
        if data.get("code") != 0:
            if items:
                break
            die("搜索失败：%s" % data.get("message"), code=data.get("code"))
        rows = ((data.get("data") or {}).get("result") or [])
        for r in rows:
            bvid = str(r.get("bvid") or "")
            if not bvid or bvid in seen:
                continue
            seen.add(bvid)
            items.append({
                "bvid": bvid,
                "title": clean_html(r.get("title")),
                "up": clean_html(r.get("author")),
                "play": int(r.get("play") or 0),
                "danmaku": int(r.get("video_review") or 0),
                "duration": parse_duration(r.get("duration")),
                "pubdate": int(r.get("pubdate") or 0),
                "desc": clean_html(r.get("description"))[:220],
            })
            if len(items) >= limit:
                break
        if len(items) >= limit:
            break
        time.sleep(0.35)
    out({"ok": True, "keyword": keyword, "count": len(items), "items": items})


def video_info(bvid, cred):
    data = http_get(
        "https://api.bilibili.com/x/web-interface/view?bvid=" + urllib.parse.quote(bvid),
        cred,
    )
    if data.get("code") != 0:
        return {"ok": False, "error": "取视频信息失败：%s" % data.get("message"), "code": data.get("code")}
    d = data.get("data") or {}
    pages = d.get("pages") or []
    cid = int(pages[0].get("cid") or 0) if pages else 0
    return {
        "ok": True,
        "bvid": d.get("bvid") or bvid,
        "aid": int(d.get("aid") or 0),
        "title": clean_html(d.get("title")),
        "up": clean_html((d.get("owner") or {}).get("name")),
        "duration": int(d.get("duration") or 0),
        "pubdate": int(d.get("pubdate") or 0),
        "pic": d.get("pic") or "",
        "desc": clean_html(d.get("desc"))[:600],
        "cid": cid,
        "part": clean_html(pages[0].get("part")) if pages else "",
        "pages": len(pages),
    }


def cmd_info(args):
    out(video_info(args.bvid.strip(), load_cred()))


def fetch_subtitle(bvid, cid, cred):
    data = http_get(
        "https://api.bilibili.com/x/player/wbi/v2?" + wbi_sign({
            "bvid": bvid, "cid": cid,
        }, cred),
        cred,
    )
    if data.get("code") != 0:
        return {"ok": False, "error": "取字幕列表失败：%s" % data.get("message"), "code": data.get("code")}
    sub = (data.get("data") or {}).get("subtitle") or {}
    lst = sub.get("subtitles") or []
    if not lst:
        return {"ok": False, "error": "这本视频没有字幕（up 没传 / B 站没生成）", "subtitle": None}
    pick = None
    for s in lst:
        if str(s.get("lan") or "").startswith("zh"):
            pick = s
            break
    pick = pick or lst[0]
    url = str(pick.get("subtitle_url") or "")
    if url.startswith("//"):
        url = "https:" + url
    if not url:
        return {"ok": False, "error": "字幕地址是空的"}
    body = http_get(url, cred)
    lines = []
    for ln in (body.get("body") or []):
        text = re.sub(r"\s+", " ", str(ln.get("content") or "")).strip()
        if text:
            lines.append({"t": float(ln.get("from") or 0), "text": text})
    full = "\n".join(ln["text"] for ln in lines)
    return {
        "ok": True,
        "lang": pick.get("lan_doc") or pick.get("lan") or "",
        "count": len(lines),
        "lines": lines,
        "text": full,
    }


def cmd_subtitle(args):
    bvid = args.bvid.strip()
    cred = load_cred()
    info = video_info(bvid, cred)
    if not info.get("ok"):
        out(info)
        return
    sub = fetch_subtitle(bvid, info["cid"], cred)
    out({"ok": sub.get("ok", False), "bvid": bvid, "title": info.get("title"),
         "error": sub.get("error"), **{k: v for k, v in sub.items() if k in ("lang", "count", "lines", "text")}})


def clip_text(text, max_chars):
    if max_chars <= 0 or len(text) <= max_chars:
        return text, False
    head = int(max_chars * 0.82)
    tail = max_chars - head
    return (text[:head] + "\n…（中间略去 %d 字）…\n" % (len(text) - max_chars) + text[-tail:]), True


def cmd_material(args):
    bvid = args.bvid.strip()
    cred = load_cred()
    info = video_info(bvid, cred)
    if not info.get("ok"):
        out(info)
        return
    sub = fetch_subtitle(bvid, info["cid"], cred)
    text, clipped = clip_text(sub.get("text") or "", int(args.max_chars or 30000))
    out({
        "ok": True,
        "info": info,
        "subtitle": {
            "ok": bool(sub.get("ok")),
            "error": sub.get("error"),
            "lang": sub.get("lang"),
            "count": sub.get("count", 0),
            "text": text,
            "clipped": clipped,
            "chars": len(sub.get("text") or ""),
        },
        "lines": sub.get("lines") or [],
    })


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(prog="bili_read.py")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("whoami")
    s.set_defaults(fn=cmd_whoami)

    s = sub.add_parser("search")
    s.add_argument("--keyword", required=True)
    s.add_argument("--pages", type=int, default=2)
    s.add_argument("--order", default="pubdate")
    s.add_argument("--limit", type=int, default=20)
    s.set_defaults(fn=cmd_search)

    s = sub.add_parser("info")
    s.add_argument("--bvid", required=True)
    s.set_defaults(fn=cmd_info)

    s = sub.add_parser("subtitle")
    s.add_argument("--bvid", required=True)
    s.set_defaults(fn=cmd_subtitle)

    s = sub.add_parser("material")
    s.add_argument("--bvid", required=True)
    s.add_argument("--max-chars", type=int, default=30000)
    s.set_defaults(fn=cmd_material)

    args = p.parse_args()
    try:
        args.fn(args)
    except urllib.error.HTTPError as e:
        die("HTTP %s：%s" % (e.code, e.reason))
    except urllib.error.URLError as e:
        die("连不上 B 站：%s" % getattr(e, "reason", e))
    except Exception as e:
        die("出错：%s" % e)


if __name__ == "__main__":
    main()
