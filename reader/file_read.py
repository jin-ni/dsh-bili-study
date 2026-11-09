#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
file_read.py —— 「B站学习」的本地资料只读提取器

支持：txt / md / csv / json / 代码 / html / ipynb / docx / pptx / xlsx / epub / pdf*
  · docx/pptx/xlsx 需要 python-docx / python-pptx / openpyxl（DSH 自带运行时里有）
  · pdf 用插件自带的 pypdf（vendor/pypdf，纯 Python，离线可用）；扫描版会报 PDF_NO_TEXT。
  · 不写任何文件，只读。

命令（stdout 一行 JSON）：
  info   --path <file>
  read   --path <file> [--max-chars 60000]
  scan   --dir <folder> [--limit 200]
  search --dir <folder> --query <text> [--limit 20]

失败统一是 {"ok": false, "error": "...", "code": "..."}。
"""
import argparse
import html
import json
import os
import re
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path

# 插件自带的纯 Python 依赖（目前只有 pypdf）：放在 <plugin>/vendor/ 下，离线可用
_VENDOR = Path(__file__).resolve().parent.parent / "vendor"
if _VENDOR.is_dir() and str(_VENDOR) not in sys.path:
    sys.path.insert(0, str(_VENDOR))

MAX_FILE_BYTES = 40 * 1024 * 1024
TEXT_EXTS = {
    ".txt", ".md", ".markdown", ".rst", ".log", ".csv", ".tsv", ".json", ".jsonl",
    ".yaml", ".yml", ".xml", ".html", ".htm", ".py", ".js", ".mjs", ".cjs", ".ts",
    ".tsx", ".jsx", ".java", ".c", ".cc", ".cpp", ".h", ".hpp", ".cs", ".go",
    ".rs", ".rb", ".php", ".sh", ".ps1", ".bat", ".cmd", ".m", ".tex", ".ini",
    ".conf", ".toml", ".sql", ".ipynb",
}
OFFICE_EXTS = {".docx", ".pptx", ".xlsx"}
PDF_EXTS = {".pdf"}
SUPPORTED = TEXT_EXTS | OFFICE_EXTS | PDF_EXTS | {".epub"}
SKIP_DIRS = {".git", ".svn", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", ".idea", ".vscode", "$recycle.bin", "system volume information"}


def out(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def die(msg, code="ERROR"):
    out({"ok": False, "error": str(msg), "code": code})
    sys.exit(0)


def file_meta(path: Path):
    st = path.stat()
    return {
        "ok": True,
        "path": str(path.resolve()),
        "name": path.name,
        "title": path.stem,
        "ext": path.suffix.lower(),
        "size": int(st.st_size),
        "mtime": int(st.st_mtime),
        "supported": path.suffix.lower() in SUPPORTED,
    }


def clean_text(s: str) -> str:
    s = str(s or "").replace("\r\n", "\n").replace("\r", "\n")
    s = s.replace("\x00", "")
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{4,}", "\n\n\n", s)
    return s.strip()


# ── HTML / EPUB ──────────────────────────────────────────────────────────────
class _HtmlText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = 0
        self.block = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "table", "ul", "ol"}

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.skip += 1
        elif tag in self.block:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self.skip:
            self.skip -= 1
        elif tag in self.block:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def html_to_text(s: str) -> str:
    p = _HtmlText()
    p.feed(s)
    return clean_text("".join(p.parts))


# ── 各格式提取 ───────────────────────────────────────────────────────────────
def read_plain(path: Path) -> str:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return clean_text(raw.decode(enc))
        except UnicodeDecodeError:
            continue
    return clean_text(raw.decode("utf-8", "replace"))


def read_docx(path: Path) -> str:
    from docx import Document
    doc = Document(str(path))
    parts = []
    for p in doc.paragraphs:
        t = (p.text or "").strip()
        if t:
            parts.append(t)
    for ti, table in enumerate(doc.tables, 1):
        parts.append(f"\n[表格 {ti}]")
        for row in table.rows:
            cells = [c.text.strip().replace("\n", " ") for c in row.cells]
            if any(cells):
                parts.append(" | ".join(cells))
    return clean_text("\n".join(parts))


def read_pptx(path: Path) -> str:
    from pptx import Presentation
    prs = Presentation(str(path))
    parts = []
    for i, slide in enumerate(prs.slides, 1):
        parts.append(f"\n## 第 {i} 页")
        for shape in slide.shapes:
            if getattr(shape, "has_text_frame", False):
                t = (shape.text or "").strip()
                if t:
                    parts.append(t)
            if getattr(shape, "has_table", False):
                try:
                    for row in shape.table.rows:
                        cells = [c.text.strip().replace("\n", " ") for c in row.cells]
                        if any(cells):
                            parts.append(" | ".join(cells))
                except Exception:
                    pass
        try:
            notes = slide.notes_slide.notes_text_frame.text.strip()
            if notes:
                parts.append("[备注] " + notes)
        except Exception:
            pass
    return clean_text("\n".join(parts))


def read_xlsx(path: Path) -> str:
    from openpyxl import load_workbook
    wb = load_workbook(str(path), read_only=True, data_only=True)
    parts = []
    for ws in wb.worksheets:
        parts.append(f"\n## 工作表：{ws.title}")
        for ri, row in enumerate(ws.iter_rows(values_only=True)):
            if ri >= 300:
                parts.append("…（表格后面还有内容，已截断）")
                break
            vals = [str(v).strip() for v in row if v is not None and str(v).strip() != ""]
            if vals:
                parts.append(" | ".join(vals[:30]))
    try:
        wb.close()
    except Exception:
        pass
    return clean_text("\n".join(parts))


def read_pdf(path: Path):
    # 依次尝试常见纯 Python / 二进制库；一个都没有就明确说
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        pages = reader.pages[:80]
        text = "\n".join((p.extract_text() or "") for p in pages)
        return clean_text(text), "pypdf"
    except ImportError:
        pass
    except Exception as e:
        return "", f"READ_ERROR:{e}"
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(str(path))
        pages = reader.pages[:80]
        text = "\n".join((p.extract_text() or "") for p in pages)
        return clean_text(text), "PyPDF2"
    except ImportError:
        pass
    except Exception as e:
        return "", f"READ_ERROR:{e}"
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(str(path))
        text = "\n".join(page.get_text() for page in list(doc)[:80])
        return clean_text(text), "fitz"
    except ImportError:
        pass
    except Exception as e:
        return "", f"READ_ERROR:{e}"
    try:
        import pdfplumber
        with pdfplumber.open(str(path)) as pdf:
            text = "\n".join((p.extract_text() or "") for p in pdf.pages[:80])
        return clean_text(text), "pdfplumber"
    except ImportError:
        return "", "PDF_NO_LIB"
    except Exception as e:
        return "", f"READ_ERROR:{e}"


def read_epub(path: Path) -> str:
    parts = []
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if n.lower().endswith((".xhtml", ".html", ".htm"))]
        names.sort()
        for n in names[:120]:
            try:
                parts.append(html_to_text(z.read(n).decode("utf-8", "replace")))
            except Exception:
                continue
    return clean_text("\n\n".join(parts))


def read_ipynb(path: Path) -> str:
    try:
        data = json.loads(read_plain(path))
    except Exception as e:
        return f"（ipynb 解析失败：{e}）"
    parts = []
    for cell in data.get("cells", []):
        src = "".join(cell.get("source", []))
        if src.strip():
            kind = cell.get("cell_type", "")
            parts.append(f"[{kind}]\n{src.strip()}")
    return clean_text("\n\n".join(parts))


def extract(path: Path):
    ext = path.suffix.lower()
    if ext in (".html", ".htm"):
        return html_to_text(read_plain(path)), "html"
    if ext in (".ipynb",):
        return read_ipynb(path), "ipynb"
    if ext == ".docx":
        return read_docx(path), "docx"
    if ext == ".pptx":
        return read_pptx(path), "pptx"
    if ext == ".xlsx":
        return read_xlsx(path), "xlsx"
    if ext == ".pdf":
        return read_pdf(path)
    if ext == ".epub":
        return read_epub(path), "epub"
    if ext in TEXT_EXTS:
        return read_plain(path), "text"
    return "", "UNSUPPORTED"


def cmd_info(args):
    path = Path(args.path).expanduser()
    if not path.exists():
        die("文件不存在：" + str(path), "NOT_FOUND")
    if not path.is_file():
        die("不是一个文件：" + str(path), "NOT_FILE")
    meta = file_meta(path)
    out(meta)


def cmd_read(args):
    path = Path(args.path).expanduser()
    if not path.exists():
        die("文件不存在：" + str(path), "NOT_FOUND")
    if not path.is_file():
        die("不是一个文件：" + str(path), "NOT_FILE")
    if path.stat().st_size > MAX_FILE_BYTES:
        die("文件太大（>40MB）：" + path.name, "TOO_LARGE")
    meta = file_meta(path)
    if not meta["supported"]:
        die("暂不支持这个格式：%s（支持 txt/md/csv/json/代码/html/docx/pptx/xlsx/pdf/epub）" % meta["ext"], "UNSUPPORTED")
    try:
        text, engine = extract(path)
    except ImportError as e:
        die("读这个格式需要额外的 Python 包：%s" % e, "MISSING_LIB")
    except Exception as e:
        die("读取失败：%s" % e, "READ_ERROR")
    if engine == "PDF_NO_LIB":
        die("读 PDF 需要 pypdf / PyPDF2 / PyMuPDF / pdfplumber 之一，当前 Python 里一个都没有。可以先把 PDF 另存为 docx/txt，或装一个（pip install pypdf）。", "PDF_NO_LIB")
    if str(engine).startswith("READ_ERROR"):
        die("PDF 解析失败：%s" % engine, "READ_ERROR")
    text = text or ""
    if len(text.strip()) < 10:
        die("这个文件里没抽到可用文字（可能是扫描件/纯图片）", "PDF_NO_TEXT" if meta["ext"] == ".pdf" else "EMPTY")
    chars = len(text)
    maxc = max(2000, int(args.max_chars or 60000))
    clipped = False
    if chars > maxc:
        head = int(maxc * 0.9)
        tail = maxc - head
        text = text[:head] + "\n…（中间略去 %d 字）…\n" % (chars - maxc) + text[-tail:]
        clipped = True
    out({**meta, "ok": True, "chars": chars, "clipped": clipped, "engine": engine, "text": text})


def iter_files(root: Path, limit: int):
    count = 0
    for cur, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d.lower() not in SKIP_DIRS and not d.startswith(".")]
        for name in files:
            p = Path(cur) / name
            ext = p.suffix.lower()
            if ext not in SUPPORTED:
                continue
            try:
                st = p.stat()
            except OSError:
                continue
            if st.st_size > MAX_FILE_BYTES:
                continue
            yield {"path": str(p.resolve()), "name": name, "ext": ext, "size": int(st.st_size), "mtime": int(st.st_mtime)}
            count += 1
            if count >= limit:
                return


def cmd_scan(args):
    root = Path(args.dir).expanduser()
    if not root.exists() or not root.is_dir():
        die("文件夹不存在：" + str(root), "NOT_DIR")
    files = list(iter_files(root, max(1, min(int(args.limit or 200), 1000))))
    files.sort(key=lambda x: x["mtime"], reverse=True)
    out({"ok": True, "dir": str(root.resolve()), "count": len(files), "files": files})


def _snippet(text: str, q: str, width: int = 70):
    low = text.lower()
    i = low.find(q)
    if i < 0:
        return ""
    a = max(0, i - width)
    b = min(len(text), i + len(q) + width)
    s = text[a:b].replace("\n", " ")
    return ("…" if a > 0 else "") + s + ("…" if b < len(text) else "")


def cmd_search(args):
    root = Path(args.dir).expanduser()
    if not root.exists() or not root.is_dir():
        die("文件夹不存在：" + str(root), "NOT_DIR")
    q = str(args.query or "").strip()
    if not q:
        die("query 不能为空", "NO_QUERY")
    limit = max(1, min(int(args.limit or 20), 100))
    ql = q.lower()
    candidates = list(iter_files(root, 500))
    # 文件名先匹配（快）
    results = []
    rest = []
    for f in candidates:
        name_score = 100 if ql in f["name"].lower() else 0
        if name_score:
            results.append({**f, "score": name_score, "snippet": ""})
        else:
            rest.append(f)
    # 再搜内容（只读文本类 / Office；PDF 若没库就跳过）
    read_budget = 120
    pdf_skipped = 0
    for f in rest:
        if len(results) >= limit or read_budget <= 0:
            break
        if f["ext"] == ".pdf":
            pdf_skipped += 1
            continue
        read_budget -= 1
        try:
            text, engine = extract(Path(f["path"]))
        except Exception:
            continue
        if not text:
            continue
        if engine == "PDF_NO_LIB":
            pdf_skipped += 1
            continue
        low = text[:200000].lower()
        n = low.count(ql)
        if n <= 0:
            continue
        results.append({**f, "score": min(90, 10 + n * 5), "snippet": _snippet(text[:200000], ql)})
    results.sort(key=lambda x: (-x["score"], -x["mtime"]))
    out({"ok": True, "dir": str(root.resolve()), "query": q, "count": len(results), "results": results[:limit], "pdfSkipped": pdf_skipped})


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(prog="file_read.py")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("info")
    s.add_argument("--path", required=True)
    s.set_defaults(fn=cmd_info)

    s = sub.add_parser("read")
    s.add_argument("--path", required=True)
    s.add_argument("--max-chars", type=int, default=60000)
    s.set_defaults(fn=cmd_read)

    s = sub.add_parser("scan")
    s.add_argument("--dir", required=True)
    s.add_argument("--limit", type=int, default=200)
    s.set_defaults(fn=cmd_scan)

    s = sub.add_parser("search")
    s.add_argument("--dir", required=True)
    s.add_argument("--query", required=True)
    s.add_argument("--limit", type=int, default=20)
    s.set_defaults(fn=cmd_search)

    args = p.parse_args()
    try:
        args.fn(args)
    except SystemExit:
        raise
    except Exception as e:
        die("出错：%s" % e, "ERROR")


if __name__ == "__main__":
    main()
