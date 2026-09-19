# TXT Reader（墨读）

一个简单、离线、本地优先的桌面电子书阅读器，支持 TXT 与 EPUB 导入。支持 UTF-8 与 GBK/GB18030 中文文本、长文本虚拟滚动、自动保存阅读位置和三档字号。

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

应用只读用户选择的原始 TXT / EPUB 文件，导入后将统一编码的副本存入 Electron `userData` 目录。移除书籍只会删除应用管理的副本，不会改动原始文件。

安装包生成后，可运行 `pwsh -NoProfile -File tests/validate-windows-release.ps1` 校验 RELEASES 中的版本、大小和 SHA-1；加上 `-CheckInstalled` 可同时检查本机安装版本及开始菜单、桌面快捷方式。

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `src/` | Electron 主进程、预加载脚本、React 界面与共享逻辑 |
| `config/` | Vite 构建、Vitest 单元测试和 Playwright 端到端测试配置 |
| `tests/` | 单元、集成、界面与端到端测试，以及文档和发布校验 |
| `scripts/` | Windows 安装包生成脚本 |
| `docs/` | 产品设计与技术设计文档 |

根目录保留项目说明、依赖清单，以及 Electron Forge、TypeScript、ESLint 和页面入口文件。构建和测试通过上述 npm 命令运行，无需手动指定配置路径。

- [产品设计](docs/PRODUCT_DESIGN.md)
- [技术设计](docs/TECHNICAL_DESIGN.md)

## EPUB 导入

支持 EPUB 2 / 3 的未加密文字书籍，按 spine 中的阅读顺序提取 XHTML 正文，保留标题、段落和换行。优先使用书内书名，缺失时使用文件名。导入后支持自动保存进度、重启续读和重复内容检测。

当前按纯文本阅读，不保留封面、图片、字体、CSS 排版或交互内容，也不提供目录跳转；不支持 DRM 加密书籍。原始文件最大 50 MiB，解压总大小最大 100 MiB，单个文字文档最大 10 MiB，最多 10000 个 ZIP 条目。解析失败不会添加书籍。

## 自动更新（Windows 安装版）

v0.2.0 起支持自动更新。旧版需要先覆盖安装一次新版 TXT-Reader-Setup.exe，书架与阅读进度仍保留在原来的 userData 目录。直接运行免安装目录不启用自动更新。

安装版启动约 30 秒后检查更新，此后每 4 小时检查一次；书架底部显示版本和更新状态，也可手动检查。有新版时后台下载，下次正常关闭并从快捷方式启动应用时生效，不打断阅读。断网仍可阅读，更新失败会显示重试提示。更新请求仅向 Electron 官方服务和 GitHub 获取发布信息及更新包，不上传书籍或阅读记录。

发布渠道：[GitHub Releases](https://github.com/zhj625/TXT-Reader/releases)。更新源使用 Electron 官方 update.electronjs.org 服务。只有正式发布且版本号更高的版本会被分发，本地修改或 Git commit 不会自动成为已发布版本。

### 发布新版

1. 修改 package.json 和 package-lock.json 的版本号（例如 0.2.1），提交代码。
2. 推送 main 和匹配版本的标签，例如 git tag v0.2.1 后 git push origin main v0.2.1。
3. GitHub Actions 自动执行完整验证、打包和 RELEASES 的大小与哈希校验，再将安装器、完整 nupkg 和 RELEASES 上传至草稿 Release；全部成功后才公开发布。失败时不会发布不完整的更新。
4. 已安装的阅读器自动检查并下载新版本；可在书架点击“检查更新”。官方更新服务可能存在短暂缓存，发布后不会立即在所有客户端出现。

不要覆盖已发布的版本；修复后递增版本号。手动发布也必须同时上传 out/make/squirrel.windows/x64 下的 TXT-Reader-Setup.exe、RELEASES 和对应版本的完整 nupkg，不能只上传安装器。自动更新依赖该仓库保持公开可访问。
