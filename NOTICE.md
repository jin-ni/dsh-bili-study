# 第三方代码与署名

本插件（`dsh-bili-study`）本体以 **MIT** 协议发布，正文见 [LICENSE](LICENSE)。

## 包含的第三方代码

### 1. `lib/hostdeps.mjs`

- 来源：[dsh-bili-scroll](https://github.com/c1overzz/dsh-bili-scroll)（「刷B站」插件），MIT
- 用途：从宿主依赖树里取 `@deepseek-ai/schemastery` / `@deepseek-ai/dsh-tools`，取不到就退回本地等价实现
- 版权：Copyright (c) 2026 c1overzz

该文件的 MIT 许可正文：

```
MIT License

Copyright (c) 2026 c1overzz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 2. `vendor/pypdf/`

- 项目：[pypdf](https://github.com/py-pdf/pypdf) 6.9.2（纯 Python wheel）
- 许可：**BSD-3-Clause**，Copyright (c) 2006-2025 py-pdf contributors
- 完整许可见 `vendor/pypdf/LICENSE`
- 用途：读取 PDF 文字（离线内置，不依赖宿主 Python 装包）

### 3. `vendor/qrcode-generator.mjs`

- 项目：[qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4
- 许可：**MIT**，Copyright (c) 2009 Kazuhiko Arase
- 用途：把 B 站扫码登录链接画成二维码（GIF data URL），不依赖 Python 的 qrcode/Pillow
- 说明：二维码是 DENSO WAVE INCORPORATED 的注册商标

## 关于 B 站接口

本插件只调用 B 站公开 Web API（搜索、视频信息、字幕、扫码登录），没有包含第三方 B 站客户端代码，
也不做登录以外的写操作（不评论、不点赞、不投币）。

---
*本文件只是说明，不构成额外限制。*
