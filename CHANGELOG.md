# Changelog

## 0.4.0 — 2026-11-09

- **内置 B 站扫码登录**：设置 → 环境 →「扫码登录」，手机 B站 App 扫码即可；
  凭证写到 `~/.dsh/bili-study/bili_credential.json`，不再依赖「刷B站」。
- 内置 `qrcode-generator`（MIT）在宿主里画二维码，不依赖 Python qrcode/Pillow。
- 分享包：`dsh-bili-study-0.4.0.zip`（zip/link 安装）。
- 许可证与第三方署名：`LICENSE`、`NOTICE.md`。

## 0.3.1 — 2026-11-09

- 内置 `pypdf` 6.9.2（`vendor/pypdf`，BSD-3），PDF 文字提取离线可用。
- 扫描版 PDF 明确报 `PDF_NO_TEXT`，不假装读到。

## 0.3.0 — 2026-11-09

- 本地资料：添加文件 / 扫描文件夹 / 按文件名和正文搜索 → 总结成笔记与复习卡。
- 支持 txt/md/csv/json/代码/html/ipynb/docx/pptx/xlsx/epub/pdf。
- 新增工具：`bili_study_files`、`bili_study_file_search`、`bili_study_file_learn`。

## 0.2.0 — 2026-11-08

- 自选视频：按 BV 号/链接加入自选，自动课时优先学。
- 学习内容可编辑：单元加/删/改名/设为当前。
- `bili_study_learn` 支持 `bvid`。

## 0.1.0 — 2026-11-08

- 首个版本：B 站找课、读字幕、结构化笔记、SM-2 复习卡、日报、定时自动学。
- 最小权限 headless profile（无文件/命令/网络）。
