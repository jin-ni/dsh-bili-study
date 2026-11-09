# B站学习（dsh-bili-study）

一个 DSH 插件：**自己找课 / 读本地资料 → 读进去 → 写结构化笔记 → 出复习卡**，按节奏每天学一点。
**学习内容、单元、看哪条视频、读哪份文件都由你定**；不想选的时候它才自己找。

不是「收藏夹」也不是「总结工具」：它会把视频字幕或本地文档完整读进去，产出一份能用来复习、做题的笔记，
并把最值得记的点做成间隔重复的复习卡；每天到点自己学一课，写一份学习日报。

## 它怎么学

**B 站视频**

```
到点（或点「学一课」/「学这条」）
  → 有指定视频：直接学它（不受时长范围限制）
  → 没有指定视频：按当前单元在 B 站搜课（按时长/播放量筛，跳过已学）
  → 逐条试读，挑第一条**有字幕**的（没字幕的跳过；指定视频没字幕会明确报错）
  → 把带时间戳的字幕交给一个**最小权限**的 headless 会话
     （那个 profile 拿不到文件、命令、网络，只拿得到模型）
  → 模型只回一个 JSON：一句话 / 要点 / 概念 / 公式 / 例子 / 易错点 / 疑问 / 复习卡 / 下一步
  → 插件落盘：notes/<主题>/<bvid>.md + 复习卡 + 日报 + 单元进度
```

**本地资料**

```
在「资料」页加文件 / 从文件夹搜文件
  → 点「总结」：用 DSH 自带 Python 抽文字（docx / pptx / xlsx / pdf / txt / md / 代码…）
  → 同一套最小权限 headless 会话：只回 JSON 笔记
  → 落盘：notes/<主题>/<f-id>.md + 复习卡 + 日报
```

四种学的方式：

1. **自动找课**：到点学当前单元，它自己搜、自己挑。
2. **指定视频**：概览里贴 BV 号 / B 站链接 → 「学这条」，或主题里「加入自选」后点「学这条」。
   自选视频会排在自动找课前面，且不受时长范围限制。
3. **自定内容**：主题里可以加单元、改名、设为当前、删除；「当前单元」就是下一课要学的方向。
4. **本地资料**：加文件 / 扫文件夹 / 按关键词搜文件，点「总结」写进同一套笔记与复习卡。

> 指定视频会归到「当前单元」下。想让某条视频/资料记到某个单元，先在该单元点「设为当前」。

## 资料支持哪些格式

- **直接读**：`.txt .md .csv .tsv .json .yaml .xml .html .ipynb`、常见代码后缀、`.docx`、`.pptx`、`.xlsx`、`.epub`
- **PDF**：插件内置纯 Python 的 `pypdf`（`vendor/pypdf`，6.9.2，BSD-3），离线可用，不依赖宿主 Python 装包。
- 扫描件 / 纯图片：抽不到文字，会明确报错。
- 只读：不改原文件、不移动、不删除。

## 装

**从 GitHub 装（推荐分享给别人）**

```powershell
dsh plugin --profile desktop add github:jin-ni/fuzzy-pancake
# web 版把 desktop 换成 web；装完重启一次 DSH
```

**本机 / 开发用 link**

```powershell
# 1) 复制到稳定位置（插件不能依赖工作区还在）
New-Item -ItemType Directory -Force "$env:USERPROFILE\.dsh\plugins" | Out-Null
Remove-Item "$env:USERPROFILE\.dsh\plugins\dsh-bili-study" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force "<本目录>" "$env:USERPROFILE\.dsh\plugins\dsh-bili-study"

# 2) 装进 desktop profile（会自动把 bundle 加进 dsh.profile.bundles）
dsh plugin --profile desktop add "link:$env:USERPROFILE\.dsh\plugins\dsh-bili-study"

# 3) 重启一次 DeepSeek Harness
```

重启后进 **设置 → B站学习**。

## 分享给别人

插件是自包含的：拷走整个目录即可，**不会带你的学习数据**（笔记/复习卡/资料库都在各自的
`~/.dsh/bili-study/`，不在插件目录里）。

打包（排除 `__pycache__` 即可，其余都带上）：

```powershell
Compress-Archive -Path .\dsh-bili-study\* -DestinationPath .\dsh-bili-study-0.4.0.zip
```

对方：

```powershell
# 解压到任意目录后
dsh plugin --profile desktop add "link:<解压目录>"
# 重启一次 DSH；web 版把 desktop 换成 web
```

对方需要准备：

- **DSH 桌面版 / web**（0.2.x 实测；插件依赖 `webServer` / `tools` / `settings`）
- **B 站凭证**：在「B站学习 → 设置 → 环境」点「扫码登录」，用手机 B 站 App 扫一下即可；
  也可以装「刷B站」扫码后点「从『刷B站』导入登录」，或直接把 `bili_credential.json`
  （`sessdata` / `bili_jct` / `buvid3`）放到 `~/.dsh/bili-study/`。
  没有凭证时视频会被当成「没有字幕」，但本地资料总结不受影响。
- **文件总结**：用 DSH 自带 Python（带 `python-docx` / `python-pptx` / `openpyxl`）；PDF 已内置 `pypdf`
- **模型**：自动学习 profile 默认用 `deepseek-account / deepseek-flash`；
  别的环境可在「设置」里指定 provider/model，或改 `~/.dsh/profiles/bili-study/cordis.patch.yml`

它只做两件联网的事：读 B 站公开接口、调用你配置的模型。笔记、资料、复习卡都只在本地。

## 首次使用

1. **登录**：「设置 → 环境 → 扫码登录」，用手机 B 站 App 扫码（约 2 分钟有效）。
   也可以复用「刷B站」的凭证：点「从『刷B站』导入登录」。
   没有登录凭证时，B 站不会返回字幕，绝大多数视频会被判定成「没有字幕」。
2. **内容**：默认有「自动控制原理」和 8 个单元；可以在「主题」里改名、改关键词、加/删单元。
3. **视频**：概览贴 BV 号/链接直接学；或在主题里「加入自选」，之后它优先学你挑的。
4. **资料**：「设置」里填一个「资料文件夹」；「资料」页可以贴文件路径加入，或扫描/搜索文件夹里的文件。
5. **节奏**：「设置」里确认「到点自动学」和每天的时间（默认 21:00，每天 1 课）。
6. 想立刻看效果：点「学一课」/「学这条」/「总结」。约 1–4 分钟，完成后「概览」会出现日报和笔记。

## 数据在哪

全部在 `~/.dsh/bili-study/`（`$DSH_HOME/bili-study/`）：

| 路径 | 内容 |
| --- | --- |
| `topics.json` | 主题 + 学习计划（单元状态） |
| `notes/<主题>/<bvid>.md` | 视频笔记正文（Markdown，可拷走） |
| `notes/<主题>/<f-id>.md` | 资料笔记正文 |
| `notes/index.json` | 笔记索引（视频/资料都在这） |
| `cards.json` | 复习卡（SM-2 简化版） |
| `queue.json` | 每个主题的候选视频与「自选视频」 |
| `materials.json` | 资料库（路径、大小、总结状态） |
| `state.json` | 连续天数 / 今日进度 / 累计 |
| `out/<日期>.md` | 每天的学习日报 |
| `study.log` | 运行日志（排障用） |
| `config.json` | 配置（与设置页同步） |

## 13 个工具（任何 dsh 会话都能用）

| 工具 | 做什么 |
| --- | --- |
| `bili_study_status` | 进度、今日、待复习、各主题单元 |
| `bili_study_topics` | 列 / 加 / 改 / 删主题 |
| `bili_study_plan` | 列 / 加 / 改 / 删学习单元，设为当前 |
| `bili_study_search` | 搜 B 站视频 |
| `bili_study_watch` | 取一条视频的完整字幕（学习素材） |
| `bili_study_pick` | 自选视频：加 / 删 / 列（会检查有没有字幕） |
| `bili_study_files` | 资料库：列 / 加 / 删 / 读（返回抽出的文字） |
| `bili_study_file_search` | 在资料文件夹里搜文件（文件名 + 正文） |
| `bili_study_file_learn` | 总结资料；也可以给 `query` + `folder` 让它自己搜一条再总结 |
| `bili_study_note_save` | 把对话里学到的笔记存进学习库 |
| `bili_study_notes` | 列 / 读笔记 |
| `bili_study_review` | 取到期复习卡 / 评分 |
| `bili_study_learn` | 立刻在后台学一课；传 `bvid` 就学指定视频 |

对话里可以直接说：「学 BV1ES4y1j7ek」「把单元换成频域分析」「去 D:\学习资料 里搜『根轨迹』并总结第一篇」。

## 自动学习轮

- profile：`~/.dsh/profiles/bili-study`（首次加载插件时自动铺好，来自 `profile-template/`）
- 模型：`deepseek-account / deepseek-flash`（桌面端登录的账号额度）
- 权限：文件系统 / 命令 / 联网 / 子代理 / 技能 / 插件管理 / 目标与待办 **全部关闭**
- 超时：`runTimeoutMinutes`（默认 12 分钟），超时先 SIGTERM，5 秒后 SIGKILL
- 失败退避：失败后 30 分钟内不再自动重试；两课之间至少隔 45 分钟
- 自选视频优先：有自选时先学自选，没有才搜课

## 环境要求

- DSH 桌面版 / web profile（需要 `webServer` + `tools` + `settings` 服务）
- **B 站阅读器**：纯标准库（`reader/bili_read.py`），用「刷B站」的 venv 或 PATH 的 Python 即可
- **资料抽取**：优先用 DSH 自带运行时 Python（`resources/runtime/primary-runtime/.../python.exe`），
  它带 `python-docx` / `python-pptx` / `openpyxl`；没有就退到 `pythonPath` / 刷B站 venv / PATH
- 凭证：`sessdata` / `bili_jct` / `buvid3`（读字幕用；只读，不评论不点赞）

## 排障

- 设置页顶部出现「⚠️ 没找到 Python」：在「设置 → 环境」里填 `pythonPath`，或先装「刷B站」的依赖。
- 「这条视频没有字幕」：换一条有 CC/AI 字幕的；B 站没生成字幕的它不会硬猜。
- 资料总结报 `PDF_NO_TEXT`：这份 PDF 是扫描件/纯图片，需要 OCR（未内置）；换文字版 PDF 或 docx。
- 资料总结报「没抽到可用文字」：可能是扫描件/图片 PDF，需要 OCR（未内置）。
- 自动学没跑：确认「到点自动学」开着、今天还没到 `maxPerDay`、上一课结束已超过 45 分钟；
  看 `~/.dsh/bili-study/study.log` 与 `out/<日期>.md` 的最后一条。
- 指定视频记错了单元：先去「主题」把目标单元「设为当前」，再学。
- profile 铺不上：看 `study.log` 里 `自动学习轮 profile` 那行；可以手动把 `profile-template/bili-study`
  复制到 `~/.dsh/profiles/bili-study`。

## 开发

```powershell
# 语法检查（用桌面端自带的 Electron 当 node）
$env:ELECTRON_RUN_AS_NODE='1'
& "$env:USERPROFILE\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe" --check index.js
```

- `index.js`：host 半端（工具 / HTTP / 定时器 / 配置）
- `client.js`：设置页（`window.__ModuleLoader__` 自注册，`settings.section` 槽位）
- `lib/lesson.mjs`：一课流水线（找课 / 指定视频 / 资料 / 提示词 / headless / 解析 / 归档）
- `lib/store.mjs`：学习库（主题 / 笔记 / 复习卡 / 资料 / 日报）
- `lib/bili.mjs` + `reader/bili_read.py`：B 站只读数据源（WBI 签名 + 字幕）
- `lib/files.mjs` + `reader/file_read.py`：本地资料只读抽取（docx / pptx / xlsx / pdf / txt…）
- `lib/hostdeps.mjs`：从宿主树取 `schemastery` / `dsh-tools`（拿不到就本地等价实现；改编自 dsh-bili-scroll）

MIT。第三方代码与许可见 [NOTICE.md](NOTICE.md) 与 [LICENSE](LICENSE)。
