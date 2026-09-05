# TXT Reader（墨读）

一个简单、离线、本地优先的桌面 TXT 阅读器。支持 UTF-8 与 GBK/GB18030 中文文本、长文本虚拟滚动、自动保存阅读位置和三档字号。

## 本地开发

要求 Node.js 22.12 或更高版本。

```powershell
npm install
npm start
```

## 验证与打包

```powershell
npm run verify
npm run test:e2e
npm run make
```

- `verify`：类型检查、Lint、单元/集成测试、文档校验与应用打包。
- `test:e2e`：在已打包应用上执行 Electron 端到端核心流程。
- `make`：生成 Windows x64 安装包与 ZIP 免安装包。

首次运行 `TXT-Reader-Setup.exe` 后，安装器会创建开始菜单和桌面快捷方式。后续可直接搜索“TXT Reader”启动应用。

应用只读用户选择的原始 TXT 文件，导入后将统一编码的副本存入 Electron `userData` 目录。移除书籍只会删除应用管理的副本，不会改动原始文件。

安装包生成后，可运行 `pwsh -NoProfile -File tests/validate-windows-release.ps1` 校验 RELEASES 中的版本、大小和 SHA-1；加上 `-CheckInstalled` 可同时检查本机安装版本及开始菜单、桌面快捷方式。
