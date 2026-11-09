# vendor/pypdf

- 来源：pypdf 6.9.2（PyPI wheel，纯 Python）
- 许可：BSD-3-Clause，见 pypdf/LICENSE
- 用途：`reader/file_read.py` 读取 PDF 文字时 import
- 为什么要 vendor：DSH 自带 Python 没有 PDF 库，pip 直连 PyPI 在本机不通；
  把纯 Python 的 pypdf 放进插件里，离线、升级不丢，也不污染宿主运行时。
