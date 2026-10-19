# bilidown-web

把 Electron 桌面应用 **bilidown 1.2.6**（B站视频下载器）迁移为 **Next.js + shadcn/ui** 网站，并附带 **Electron 桌面版壳**：同一套代码既可用浏览器访问，也可打包成 Windows 桌面应用，直接使用本机下载目录、系统托盘、协议链接、通知与关机等本地能力。

原应用（Electron `app.asar`）先经过解包与可读化还原，再逆向出完整规格（`docs/original-spec.md`）→ 按规格重建本仓库（`docs/blueprint.md` 为迁移设计蓝图）。逆向过程产物未包含在仓库中，仓库只保留可运行源码与规格文档。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 16 App Router · React 19 · TypeScript strict · Tailwind CSS v4 · shadcn/ui（radix）· lucide-react · sonner · **ffmpeg.wasm**（服务端没有 ffmpeg 时在浏览器内无损合并音视频） |
| 服务端（替代原 Electron 主进程） | Next.js Route Handlers（Node runtime）· B站 API 代理（UA/Referer/Cookie）· 服务端下载引擎（fetch 流式下载 DASH）· ffmpeg 合并 · JSON 持久化 · SSE 进度推送 |
| 桌面壳（Electron） | Electron 44 · 内嵌 Next standalone 服务 · preload + contextBridge 白名单 IPC · 托盘 / 通知 / 目录选择 / 资源管理器 / `bilidown://` 协议 / 自动关机 |
| 数据存储 | `data/tasks.json`（任务）、`data/settings.json`（设置含登录 Cookie）；桌面版存放在用户数据目录 |
| 下载文件 | 默认 `downloads/`，可在设置页改为任意绝对路径 |

## 界面预览

| 首页（解析 + 下载选项） | 搜索（增强功能） |
|---|---|
| ![首页](screenshots/home.png) | ![搜索](screenshots/search.png) |

| 下载任务（SSE 实时进度） | 设置 |
|---|---|
| ![下载任务](screenshots/downloads.png) | ![设置](screenshots/settings.png) |

| 工具（7 个实用工具） | 账号（扫码登录） |
|---|---|
| ![工具](screenshots/tools.png) | ![账号](screenshots/account.png) |

| 番剧剧集列表（ep → 正片 + PV） | 批量全选 13 集 |
|---|---|
| ![番剧剧集列表](screenshots/bangumi-episodes.png) | ![番剧批量全选](screenshots/bangumi-episodes-selected.png) |

> 截图来自 Next 构建页面 + Edge headless 实拍，位于 `screenshots/`。

## 快速开始

要求：Node.js ≥ 20、npm；**ffmpeg 是可选项**——装了就用服务端 ffmpeg 合并；没装时服务端会分别保存音视频分片，可在下载页点「浏览器合并」，用浏览器（含手机网页端）里的 ffmpeg.wasm 无损合成 MP4，无需在服务器安装 ffmpeg。

```powershell
cd bilidown-web
npm install
npm run dev          # 开发模式，默认 http://localhost:3000
npm run build        # 生产构建
npm run start        # 生产启动（standalone 启动器，默认 3000；可用 -- --port 3100 指定端口）
```

启动后在浏览器打开对应地址即可。首页粘贴 B 站视频链接/BV/av 号/b23 短链/番剧 ep、ss 即可解析下载。

### 桌面版（Electron）

```powershell
# 开发模式：同时启动 Next dev(3100) 与 Electron 窗口
npm run electron:dev

# 构建后以桌面模式运行（内嵌 standalone 服务，不依赖 next start）
npm run build
npm run electron:start

# 冒烟测试：启动内嵌服务 + 窗口，校验页面渲染与 preload 桥接后自动退出
npm run electron:smoke

# 打包 Windows 便携版 exe（输出 release/bilidown-0.2.0-portable.exe，约 142MB）
npm run electron:build
```

## 功能

| 路由 | 功能 |
|---|---|
| `/` 首页 | 解析任意输入（BV/av/链接/b23 短链/ep/ss）→ 展示视频信息、封面、UP主、统计、**分P列表、合集（ugc_season）与番剧 season 剧集列表（正片 + PV/预告等小节）** → 勾选分P/合集/剧集批量下载（**多选时下载面板按各条目时长汇总「预计总大小」**）、清晰度、编码（AVC/HEVC/AV1）、**音频质量（自动 / Hi-Res 无损 / 杜比全景声 / 192K / 132K / 64K）**、仅音频、**内嵌弹幕 / 单独保存弹幕文件** → 批量创建下载任务（列表下载按列表名建子文件夹）；官方 iframe 在线预览；**单P视频（无分P/合集列表）左栏展示完整详情卡：完整简介、全部数据、视频参数、B站标签与下载提示，卡片与右栏底部对齐不留空白**；最近任务 |
| `/search` 搜索 | **增强功能**（原桌面版没有关键词搜索接口）：B站关键词搜索（视频/UP主、排序、分页）；搜索不可用时可直接回首页粘贴链接 |
| `/downloads` 下载 | 任务统计 + 状态 Tabs；实时进度（SSE）、速度、剩余时间；暂停/继续/取消/重试/删除；下载文件、复制路径；**列表名 / 内嵌弹幕 / 弹幕文件徽标与弹幕数量、弹幕文件夹路径**；**服务端无 ffmpeg 时的「浏览器合并」（ffmpeg.wasm，手机网页端可用）与音视频分片单独下载**；导出/导入 JSON、清理已完成、清空全部 |
| `/account` 账号 | B站扫码登录（服务端保存 Cookie）、用户信息、退出登录；登录后可下载 1080P+ 等高清清晰度 |
| `/settings` 设置 | 下载目录、命名模板、最大并发、默认清晰度、**默认音频质量**、优先编码、ffmpeg 检测、合并开关、字幕内嵌、**列表单独文件夹、弹幕内嵌、单独保存弹幕、弹幕字号/不透明度**、主题（浅色/深色/跟随系统）、剪贴板监听、自动检查更新、代理、清空记录/恢复默认 |
| `/tools` 工具 | 链接解析、BV ⇄ AV 互转、CC 字幕 JSON → SRT、SRT → 纯文本、封面提取、音频转 MP3、音视频手动混流、正则测试 |

### 下载流程（与原版对应）

1. 解析输入 → `/api/bili/video`（`/x/web-interface/view`）
2. 取流 → `/api/bili/streams`（`/x/player/playurl?fnval=4048&fourk=1&fnver=0`，解析 DASH video/audio，支持 112/116 补拉、Hi-Res/杜比音频；audioQualityId 指定音频质量，0 表示自动）
3. 建任务 → `POST /api/tasks`，服务端下载引擎：
   - 用当前登录 Cookie 重新取流（不信任过期直链）
   - 流式下载 video/audio 到 `downloads/.tmp/<taskId>/`，支持 backupUrl 切换、Range 续传、暂停/取消
   - 需要时拉取 B 站 CC 字幕（SRT）与弹幕 XML，弹幕转 ASS；`ffmpeg` 合并音视频并把字幕/弹幕封装为 MKV 软字幕轨道（无 ffmpeg 时回退 MP4/M4A）
   - `ffmpeg -y -i video.m4s -i audio.m4s -c copy -movflags +faststart <name>.mp4` 合并（仅音频则直接保存 .m4a；选 Hi-Res 无损音轨时转封装为 .flac，无 ffmpeg/转封装失败时回退保存 .m4s 并提示）
   - 服务端没有 ffmpeg（或设置里关闭了合并）时，任务输出 `<name>.video.m4s` + `<name>.audio.m4s`（`format=m4s`）；下载页任务行提供「浏览器合并」：从 `/api/tasks/[id]/file?part=video|audio` 取回分片，在浏览器内用 ffmpeg.wasm `-c copy` 合成 MP4（容器不支持时自动回退 MKV）并直接保存到设备
   - 按命名模板落盘；列表（合集/多P）任务按列表名建子文件夹；勾选「单独保存弹幕文件」时把 XML/ASS 写入同目录的 `弹幕/` 子文件夹
   - 更新任务状态与 `data/tasks.json`
4. 进度通过 `GET /api/tasks/events`（SSE）实时推送到前端；完成后可 `GET /api/tasks/[id]/file` 下载（支持 Range）。

### 批量下载、列表文件夹与弹幕

- 首页解析出**合集（ugc_season）**时展示「合集列表」，可勾选/全选剧集；多P视频展示「分P 列表」。分P与合集选择会合并去重后批量创建任务。
- 下载面板的「预计大小」随勾选实时计算：单条时显示该条目预估体积；**多选时按主分P码率（bandwidth/8）× 各条目时长累加，显示「预计总大小 约 X（N 集 / N 个分P）」**，切换清晰度或增删选集都会更新；分P与剧集重复勾选按 bvid:cid:page 去重（与批量建任务数量一致）。
- 任务携带 `listTitle` / `listIndex`：默认（设置页「列表下载单独文件夹」开启）落在 `<下载目录>/<列表名>/P<序号> <标题>.<ext>`，关闭后直接落下载目录。
- 单P视频（没有多P列表、也不是多集合集/番剧）在首页左栏展示「视频详情」卡：完整简介（视频卡只显示 3 行摘要）、全部互动数据、视频类型/版权/BV/av/分P/发布时间等参数、B站视频标签与下载提示；卡片在 `lg` 下拉满左栏高度、内容区内部滚动，与右栏「下载选项 + 开始下载」底部对齐，避免大片空白。
- 「内嵌弹幕」把弹幕 XML 转成 ASS 并作为 MKV 的软字幕轨道封装（不重编码，播放器可开关）；「单独保存弹幕文件」把同一份 XML 与 ASS 保存到视频同目录的 `弹幕/` 子文件夹。
- 弹幕字号、不透明度在设置页配置；弹幕接口失败或无弹幕时任务仍正常完成，并在任务上给出提示。

### 音频质量（Hi-Res 无损 / 杜比全景声）

- 首页「下载选项」新增「音频质量」下拉，选项来自本次取流接口返回的 DASH 音频流：普通 AAC（30280=192K / 30232=132K / 30216=64K）、杜比全景声（30250，`dash.dolby.audio`）、Hi-Res 无损（30251，`dash.flac.audio`）；杜比与 Hi-Res 需要大会员，普通 AAC 按接口实际返回展示（游客也可能拿到 132K/192K，不做静态置灰）。
- 选择「自动（最佳音质）」时：仅音频模式优先 Hi-Res 无损 > 杜比全景声 > 最佳 AAC；视频模式优先最佳 AAC（保持原默认行为，避免默认把无损音轨封装进 MP4）。也可显式指定任一可用音轨；请求的音轨不可用时自动回退。
- 切换「音频质量」或「仅下载音频」会立即按当前清晰度/编码重新取流，下载面板的「实际音轨」与「预计大小」同步刷新；设置页可配置「默认音频质量」（0=自动）。
- 输出规则：仅音频 + Hi-Res 无损 → `.flac`（ffmpeg 转封装；失败或无 ffmpeg 时保存原始 `.m4s` 分片并在任务上提示）；仅音频 + AAC/杜比 → `.m4a`；视频任务选择杜比/Hi-Res 音轨时自动封装为 `.mkv`（兼容性更好），普通 AAC 仍为 `.mp4`。
- 任务记录 `audioQualityId` / `audioQualityName`：下载页元信息显示「仅音频 · 192K」，视频任务使用杜比/Hi-Res 音轨时显示「音轨 · Hi-Res 无损」徽标；旧任务与导入任务缺少字段时按「自动/空」兼容。

```text
downloads/
├─ 单视频.mp4
├─ 单视频.mkv                      # 内嵌字幕/弹幕
├─ 单视频.flac                     # 仅音频 Hi-Res 无损
└─ 合集名/
   ├─ P1 第1集.mp4
   ├─ P2 第2集.mkv                 # 内嵌弹幕
   └─ 弹幕/
      ├─ P1 第1集.xml
      ├─ P1 第1集.ass
      └─ P2 第2集.xml
```

### 番剧（PGC season）剧集列表

- 输入番剧 `ep` / `ss` 链接（或 b23.tv 短链、番剧视频 BV 号）时，除当前集信息外还会请求 `pgc/view/web/season`，把整季**正片剧集**与 **PV/预告等小节**映射为剧集列表（`collection.source = "pgc"`），首页显示「剧集列表（N）」。
- 默认勾选当前集，显示「当前」徽标；支持单集/多集/全选/取消全选，批量创建任务时按番剧名建子文件夹（`<下载目录>/<番剧名>/P<序号> <第N话 标题>.mp4`），任务标题/命名取每集的 `show_title`。
- 剧集卡片可跳转原始 `bangumi/play/epXXX` 链接；`view.redirect_url` 也会用于识别 BV 号输入对应的番剧，普通 UGC 视频/合集不受影响（合集仍显示「合集列表」）。
- 清晰度/下载权限跟随当前 B 站账号（大会员、付费/地区限制与网页端一致）；番剧接口失败时自动降级为单集信息，不阻断解析。

### 无 ffmpeg 环境 / 手机网页端：浏览器内 ffmpeg.wasm 合并

服务端没有安装 ffmpeg（例如手机访问的轻量部署、未装 ffmpeg 的容器/NAS）时，下载任务会分别保存音视频分片；此时不需要折腾服务器环境，直接在浏览器侧完成最后一步：

- 下载页任务行出现「浏览器合并」按钮：点击后从服务端取回 `video.m4s` / `audio.m4s`，在 Web Worker 里用 `ffmpeg.wasm`（单线程 core）执行 `-c copy` 无损封装；成功即触发浏览器下载（手机端保存到“文件/下载”，也可用「再次保存 / 分享」走系统分享面板）。
- 首次使用会下载约 31MB 合并引擎，之后走浏览器缓存（`/ffmpeg/*` 设置了 1 天缓存）；手机建议 Wi-Fi 下首次使用。
- 资源来自本仓库同源的 `public/ffmpeg/`，不依赖外部 CDN、不需要 COOP/COEP 跨源隔离头；构建前由 `scripts/prepare-ffmpeg-wasm.mjs`（`postinstall` / `predev` / `prebuild` 自动执行）从 `node_modules/@ffmpeg/*` 复制。
- 工具页「手动音视频混流」在服务端无 ffmpeg 时自动切换为浏览器内处理，文件不上传、不经过服务端。
- 合并只做封装（不重编码），音轨编码无法放进 MP4 时（如部分 MKV 音轨）自动回退 `.mkv`。

```text
服务端（无 ffmpeg）                       浏览器（手机 / 电脑）
video.m4s + audio.m4s  ── HTTP ──▶  ffmpeg.wasm (-c copy)  ──▶  <name>.mp4 保存到设备
```

## 桌面版（Electron）能力

桌面版用同一套 Next 代码运行在本机内嵌服务上（`.next/standalone`），由 Electron 主进程通过 preload 白名单暴露本地能力；浏览器访问时这些能力自动隐藏并优雅降级。

> 浏览器端 ffmpeg.wasm 资源（约 31MB）会被复制进 `.next/standalone` 并随桌面版打包，便携版 exe 体积会相应增加；桌面版同样可在服务端无 ffmpeg 时使用「浏览器合并」。

| 能力 | 说明 | IPC |
|---|---|---|
| 本地下载 | 内嵌服务把文件直接写入本机下载目录，默认 `%USERPROFILE%\Downloads\bilidown`；数据存于用户数据目录 | 内嵌服务 |
| 原生目录/文件选择 | 设置页「选择…」、下载目录选择 | `dialog:select-directory` / `dialog:select-file` |
| 打开目录 / 定位文件 | 设置与下载页「打开下载目录」；已完成任务「打开文件夹」直接调资源管理器 | `shell:open-path` / `shell:show-item` |
| 剪贴板监听 | 主进程每 600ms 轮询剪贴板，发现 B 站链接自动填入首页并解析（设置可开关） | `clipboard:watch` / `clipboard:change` |
| 协议链接 | 注册 `bilidown://parser?link=...`，点击链接唤起应用并自动解析（单实例） | `protocol:link` / `protocol:take` |
| 系统托盘 | 可选「关闭窗口最小化到托盘」，托盘菜单：显示主窗口 / 打开下载目录 / 退出 | `tray:set-enabled` |
| 下载完成通知 | 任务完成弹系统通知，点击回到主窗口 | `notify` |
| 自动关机 | 本轮任务全部完成后弹窗确认，确认后执行系统关机 | `power:shutdown` |
| 桌面能力设置 | 设置页「桌面版能力」卡：托盘、通知、自动关机、打开下载/数据目录 | 本地 localStorage 偏好 |

安全模型：`contextIsolation: true`、`nodeIntegration: false` + preload 白名单；外部链接仅允许 http(s)；退出/关机一律经主进程确认。

## 目录结构

```
bilidown-web/
├─ docs/
│  ├─ original-spec.md      # 原应用逆向规格（1492 行，含文件:行号索引）
│  └─ blueprint.md          # 迁移设计蓝图（API 契约 / 数据模型 / 分工）
├─ electron/
│  ├─ main.cjs              # 桌面主进程：内嵌服务、窗口、托盘、IPC、协议、关机
│  ├─ preload.cjs           # contextBridge 白名单注入 window.bilidownDesktop
│  └─ assets/logo.ico
├─ scripts/prepare-standalone.mjs   # 把 .next/static、public 复制进 standalone 供打包
├─ scripts/prepare-ffmpeg-wasm.mjs # 从 node_modules 复制浏览器端 ffmpeg.wasm 资源到 public/ffmpeg
├─ public/ffmpeg/                 # 构建时生成：浏览器端 ffmpeg.wasm 封装 + core（不纳入 git）
├─ data/                    # 运行时生成：tasks.json / settings.json
├─ downloads/               # 默认下载目录（可配置）
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx  globals.css
│  │  ├─ page.tsx               # 首页
│  │  ├─ search/ account/ downloads/ settings/ tools/
│  │  └─ api/                   # B站代理、任务、设置、系统、工具等 Route Handlers
│  ├─ server/                   # 服务端：bili 客户端/WBI、下载引擎、ffmpeg、浏览器 ffmpeg 资源检测、存储、SSE、设置
│  ├─ lib/                      # 类型契约、常量、API client、格式化、browser-ffmpeg.ts（浏览器合并）
│  ├─ hooks/                    # use-video/use-search/use-tasks/use-settings/use-account
│  └─ components/               # ui(shadcn) / layout / shared / home / search / downloads / account / settings / tools
```

## API 一览

- B站：`/api/bili/video`、`/api/bili/streams`、`/api/bili/search`、`/api/bili/suggest`、`/api/bili/nav`、`/api/bili/login/qrcode`、`/api/bili/login/poll`、`/api/bili/logout`、`/api/bili/resolve`
- 任务：`/api/tasks`（GET/POST/DELETE）、`/api/tasks/[id]/action`、`/api/tasks/[id]/file`（`?part=video|audio` 单独下载未合并的音视频分片，支持 Range）、`/api/tasks/[id]/reveal`、`/api/tasks/events`（SSE）、`/api/tasks/export`、`/api/tasks/import`
- 设置/系统：`/api/settings`（GET/PUT）、`/api/system/info`、`/api/update/check`
- 工具：`/api/tools/audio-to-mp3`、`/api/tools/mux`（multipart 上传，服务端 ffmpeg 处理）

## 与原桌面版的差异 / 降级说明

| 原功能（Electron） | Web 版实现 |
|---|---|
| aria2c 外部下载引擎 + JSON-RPC 轮询 | 服务端内置下载引擎（fetch 流式 + Range 续传 + ffmpeg 合并），不再依赖 aria2c |
| 未安装 ffmpeg | 服务端分别保存音视频分片（`format=m4s`）；下载页/工具页可改用浏览器端 ffmpeg.wasm（单线程，无需服务器 ffmpeg），首次约加载 31MB 引擎 |
| Dexie/IndexedDB 任务库 | 服务端 `data/tasks.json` + SSE 推送（多标签页共享） |
| localStorage 设置 | 服务端 `data/settings.json`（自动保存） |
| 二维码登录 + document.cookie | 服务端代理 passport 接口，Cookie 保存在服务端设置（不暴露给浏览器） |
| 主进程 500ms 剪贴板轮询 | 页面聚焦时的 Clipboard API 轮询 / 手动「粘贴」按钮；**桌面版已实现主进程 600ms 轮询自动解析** |
| 托盘 / 单实例 / `bilidown://` 协议 / 自动关机 | 浏览器不可实现，已移除；**桌面版均支持**（托盘可选、协议唤起、关机前确认） |
| electron-updater 自动更新安装 | 保留「检查更新」（读取更新源 latest.yml），不自动安装 |
| 打开资源管理器 / 选择目录对话框 | 「复制路径」+ 浏览器下载文件；**桌面版支持原生目录选择与资源管理器定位** |
| Plyr + mp4 直链预览 | 官方 `player.bilibili.com` iframe 预览（直链有 Referer 限制） |
| 合集（ugc_season）勾选下载 | **已实现**：合集剧集多选/全选、批量建任务、按合集名建子文件夹；番剧 PGC season（ep/ss）同样会展示剧集列表（正片 + PV/预告小节）并支持批量下载 |
| 弹幕 XML/ASS、NFO 刮削、封面/字幕随视频下载 | **弹幕已支持**（内嵌为 MKV 的 ASS 软字幕轨道，和/或单独保存 XML+ASS 到「弹幕」子文件夹）；NFO 刮削、封面随视频下载仍未迁移 |
| 导出 `.bilidownexport`（XOR 54 混淆） | 导出/导入普通 JSON；导入兼容原版 XOR 54 格式 |

## 验证记录（迁移完成时）

- `npx tsc --noEmit` 通过、`npx eslint .` 0 errors 0 warnings、`npm run build` 通过（Next 16 + Turbopack），全部页面与 API 路由编译成功。
- 端到端实测（生产模式 `next start`）：
  - `GET /api/bili/video?input=BV1GJ411x7h7` → 返回标题/分P/清晰度信息
  - `GET /api/bili/streams?...` → 返回 DASH 清晰度列表与流地址
  - `POST /api/tasks`（qn=16）→ 下载 14.7 MB 视频并 ffmpeg 合并为 `【官方 MV】Never Gonna Give You Up - Rick Astley.mp4`，任务状态 completed
  - SSE `/api/tasks/events` 实时推送 init/task-updated 事件
  - `GET /api/tasks/[id]/file` 支持 Range（HTTP 206，`video/mp4`，中文文件名 Content-Disposition）
  - `POST /api/bili/login/qrcode` 返回二维码 dataURL；`PUT /api/settings` 持久化成功
  - `POST /api/tools/audio-to-mp3` 上传视频返回 6.9 MB audio/mpeg
- 六个页面在开发/生产模式下均返回 HTTP 200 且 SSR 内容包含预期文案。
- 桌面版实测：
  - `npm run electron:smoke`（内嵌 standalone + Electron 窗口）通过：页面标题正确、preload 桥接 `window.bilidownDesktop.isDesktop === true`、首页 SSR 渲染出「解析下载」
  - `electron-builder --dir` 生成 `release/win-unpacked/bilidown.exe`（235MB），打包后 exe `--smoke-test` 退出码 0
  - `electron-builder --win portable` 生成单文件 `release/bilidown-0.2.0-portable.exe`（142MB），`--smoke-test` 退出码 0

## 已知限制

- 原 `app.asar` 内没有 source map，且原应用的部分资源（如 aria2c.conf、bin/aria2c.exe）在 asar 之外；Web 版按逆向规格重建逻辑，不保证与原版字节级一致。
- B站接口可能随版本变化；如遇风控可配置登录 Cookie（账号页扫码）提高成功率。
- 代理设置目前仅持久化字段，下载请求未实现代理转发（标注为限制）。
- 内置下载引擎为单进程内存队列，重启时进行中的任务会重置为「已暂停」，可在下载页手动继续。
- 桌面版使用内置下载引擎（不依赖 aria2c），原版「自定义批量」的 NFO 刮削、封面随视频下载等类型仍未迁移；弹幕（内嵌/单独保存）与字幕内嵌已支持。
- 弹幕来自 B 站公开的 XML 接口，仅返回近期/常用弹幕（实测热门视频 1200~7200 条不等，接口限制），不是全量历史弹幕；接口风控失败时下载会跳过弹幕并给出提示。
- 「内嵌弹幕」是封装为 MKV 的 ASS 软字幕轨道（可用播放器字幕菜单开关，不重新编码视频），不是把弹幕烧录进画面；需要播放器支持 ASS 字幕（VLC / PotPlayer / mpv 等）。
- 桌面版使用系统原生窗口边框（原版为无边框自绘标题栏），以换取稳定的缩放/最大化行为。
- 浏览器端 ffmpeg.wasm 为单线程实现：合并速度取决于设备性能；合并时需把分片读入内存（约 2~3 倍文件大小的内存峰值），超大文件在手机浏览器可能失败（>500MB 会先提示），失败不会影响已下载好的分片文件。
- 浏览器合并首次需下载约 31MB 引擎（`@ffmpeg/core`，单线程，无需 SharedArrayBuffer）；iOS Safari 建议 16+，个别浏览器对 blob 下载行为不同，可用任务行上的「再次保存 / 分享」重试。
- 浏览器端「音频转 MP3」暂未迁移到 WASM：服务端没有 ffmpeg 时该工具不可用（手动混流已支持浏览器端）。
- `@ffmpeg/core` 的许可证为 GPL-2.0-or-later（`@ffmpeg/ffmpeg` 为 MIT）；`public/ffmpeg` 是构建时从 `node_modules` 生成的产物、不纳入 git，但打包/再分发安装包时需遵守其许可证。
- 番剧剧集列表来自 `pgc/view/web/season`：可下载清晰度与权限跟随当前登录账号（大会员/付费/地区限制与网页端一致）；PV/预告等小节会作为独立小节列出，批量全选时也会一并创建任务，可按需取消勾选。
- 杜比全景声 / Hi-Res 无损音频需要大会员：接口未返回对应音轨时下拉中不会出现，显式请求不可用音轨会自动回退到自动选择。
- 仅音频选择 Hi-Res 无损时默认输出 `.flac`（需要服务端 ffmpeg 转封装）；ffmpeg 不可用或转封装失败会保存原始 `.m4s` 分片并给出提示，不会生成伪 `.flac` 文件。
- 视频任务选择杜比全景声 / Hi-Res 无损音轨时输出容器自动改为 `.mkv`（MP4 对这类音轨兼容性差），与内嵌字幕/弹幕触发的 MKV 行为一致。

## 验证记录（合集批量 / 列表文件夹 / 弹幕功能）

- 静态检查：`npx tsc --noEmit`、`npx eslint`（src/server、src/app/api、src/hooks/use-video.ts、src/components/home、settings、downloads）均 0 错误 0 警告；`npm run build`（Next 16 + Turbopack）通过，全部路由编译成功并生成 standalone 产物。
- 合集映射：`GET /api/bili/video?input=BV1JD4y1U72G` → 合集「白勺啊达•生草鬼畜」4 个 section / 95 集，`currentEpisodeId` 与当前视频一致；非合集视频 `collection=null`。
- 列表文件夹 + 内嵌弹幕（实测）：合集剧集任务（qn=16，`embedDanmaku`+`saveDanmaku`）→ `downloads/<合集名>/P1 神 女 二 人 转.mkv`；`ffprobe` 显示 h264 + aac + **ass 字幕轨（default=1、language=chi、title=弹幕）**，音视频均为 `copy` 未重编码；任务 `danmakuCount=315`；同目录 `弹幕/P1 ….xml`（315 个 `<d>`）与 `弹幕/P1 ….ass`（315 条 Dialogue）均生成。
- 单独保存弹幕：`saveDanmaku`-only 任务 → MP4 + `弹幕/*.xml|.ass`；无弹幕视频（真实 stat.danmaku=0）→ 任务 completed、格式回退 MP4、提示「该视频没有可用弹幕」且不创建弹幕目录。
- 多P 列表：`BV1BKhH6qEh9` 的 P2/P3 打上 `listTitle` 后 → `downloads/<视频标题>/P2 ….mkv`、`P3 ….mp4`；关闭「列表下载单独文件夹」后直接落下载根目录。
- 弹幕时长 clamp：23s 视频内嵌弹幕后 MKV 容器 duration = 23.000s（修复前会被最后几条弹幕事件拉长到 29.45s）。
- 设置校验：`PUT /api/settings` 对 `danmakuFontSize` 19/81/40.5、`danmakuOpacity` 0.05/1.01 等返回 400 INVALID_SETTINGS；边界值 20/80/0.1/1 持久化成功；未知字段忽略。
- 导出/导入：导出的任务 JSON 含 `listTitle/listIndex/embedDanmaku/saveDanmaku/danmakuCount/danmakuPath`；删除后重新导入字段完整保留；缺少新字段的旧 JSON 导入为默认值（null/false/0）。
- UI：无头 Edge（真实接口 + CDP 交互）验证首页渲染「合集列表（95）」、当前集徽标、全选与两个弹幕开关；设置页渲染新设置项；下载页渲染「列表 · xxx」「内嵌弹幕 ×N」「弹幕文件」「弹幕：路径」且无 console error。
- 生产模式：重建后 `node scripts/start-standalone.mjs --port 3100` 与开发模式 `next dev:3000` 均 `/`、`/settings`、`/downloads` HTTP 200；`GET /api/tasks/[id]/file` 支持 Range（206，`bytes 0-15/74819875`）。
- 独立验收：另起验收角色做代码审阅 + 独立 E2E + 弹幕模块单元测试（42/42）通过，结论 PASS。

## 验证记录（浏览器端 ffmpeg.wasm 合并）

- 静态检查：`npx tsc --noEmit` 通过、`npx eslint .` 0 errors 0 warnings、`npm run build`（Next 16 + Turbopack）通过，standalone 产物包含 `public/ffmpeg`（`ffmpeg-core.wasm` 32,232,419 字节）。
- 资源服务：`GET /ffmpeg/classes.js|worker.js|ffmpeg-core.js` 200 `application/javascript`、`/ffmpeg/ffmpeg-core.wasm` 200 `application/wasm`，均带 `Cache-Control: public, max-age=86400`（生产 standalone 实测）。
- 降级任务（把 ffmpegPath 指向不存在路径模拟无 ffmpeg）：360P 视频任务完成，`format=m4s`，落盘 `*.video.m4s`（9,292,223 B）与 `*.audio.m4s`（5,408,198 B）；`GET /api/tasks/[id]/file?part=video|audio` 均 200 且 Content-Length 正确，`part=audio` 的 Range 请求返回 206（`bytes 0-15/5408198`），非法 part 返回 400。
- 手机视口（390×844，headless Edge）实测下载页：首次点击弹出「浏览器内合并」确认（说明 30.7MB 引擎），确认后自动加载引擎 → 读取 9.3MB 视频 + 5.4MB 音频 → 合并 → **浏览器自动下载** `【官方 MV】Never Gonna Give You Up - Rick Astley.mp4`（14,767,126 B），无 console error；桌面视口同样通过。
- 合并结果 `ffprobe`：`h264` 视频 + `aac` 音频，时长 212.309s、容器 `mov,mp4`（与源视频一致，未重编码）。
- 生产 standalone（`node scripts/start-standalone.mjs --port 3200`，独立 data/downloads 目录）重复同样 E2E：移动视口合并下载成功，结果同上，无 console error。
- 工具页「手动音视频混流」在服务端无 ffmpeg 时自动切换浏览器模式（网络面板无任何 `/api/tools` 请求）：mp4 容器支持时输出 MP4；用 Theora+Vorbis 构造不支持 MP4 的输入时自动回退输出 `video.mkv`（`ffprobe`: theora + vorbis，5.003s）。
- 回归：测试后用户原设置（ffmpegPath/mergeWithFfmpeg/cookie）与任务列表已恢复原值；服务端 ffmpeg 合并/字幕弹幕内嵌代码路径未改动（worker 仅在“降级”分支新增分片路径字段），normalizeTask / importTasks 对缺失新字段的旧任务按 null 处理，旧数据/导入数据不会因新字段缺失而报错。

## 验证记录（番剧剧集列表）

- 接口映射（真实接口实测）：`GET /api/bili/video?input=<番剧链接>` 返回 `collection.source = "pgc"`、`title = 孤独摇滚！`、`currentEpisodeId = 693247`；`sections[0] = 正片`（12 集，首集 `第1话 孤独的转机`、时长 1415s、`sourceUrl = bangumi/play/ep693247`），`sections[1] = PV`（1 集，89s）。
- 输入类型覆盖：番剧 `ep` 链接、`ss43164`、番剧视频 BV 号（通过 `view.redirect_url` 识别）、`b23.tv/ep693247` 短链 4 种输入均得到同一剧集列表；普通 UGC 合集（`BV1JD4y1U72G`）仍返回 4 个 section/95 集且 `source` 缺省（「合集列表」），普通单视频无列表。
- 单集下载：番剧第 1 集创建任务（qn=16）下载完成；第 2 集任务（bvid/cid/aid 来自 PGC 映射）同样完成，落盘 `downloads/孤独摇滚！/P2 第2话 明天见.mp4`（`listTitle=孤独摇滚！`、`listIndex=2`），`sourceUrl` 为 bangumi ep 链接。
- 手机视口（390×844，headless Edge）实测首页：显示「剧集列表（13）」「正片」「PV」「第1话 孤独的转机」「当前」与番剧名；点击全选后显示「已选 13 / 13」、下载按钮变为「开始下载（13 个任务）」；无 console error。
- 回归：UGC 合集页面仍显示「合集列表（95）」；普通单视频不显示列表；任务行/B 站跳转优先使用 `task.sourceUrl`，番剧任务可直达 bangumi 播放页。
- 静态检查：`npx tsc --noEmit`、`npx eslint .`、`npm run build` 通过（见下方最近一次构建）。

## 验证记录（多选剧集时总大小预估修复）

- 问题：下载面板「预计大小」只取当前取流主条目的单个体积，多选时仅追加「/ 条目」；取消/切换所选集时不更新，仅勾选 PV 仍显示整集体积，多选剧集时无法预估总下载量。
- 修复：新增 `src/lib/selection.ts`（`selectionKey` / `collectSelectedItems`），统一分P 与合集/番剧剧集的 `bvid:cid:page` 去重口径，供 `useVideo.createDownloads`、下载面板体积预估与「已选 N 个条目」提示共用；预估按「主分P码率（`bandwidth/8`）× 各选中条目时长」累加，主分P 自身直接用服务端 `size`（更精确），码率缺失时回退 `size / 主分P时长`；多条选中显示「预计总大小 约 X（N 集 / N 个分P / N 个条目）」，单选中非主分P 的估算值加「约」，未选中/仅主分P 时保持原精确显示；下载按钮的任务数与 QualitySelector 提示均按去重后数量。
- 实测（dev server 3000 + headless Edge + 真实 B 站接口，0 console error）：
  - 番剧 `ep693247`（孤独摇滚）：默认单集「预计大小 247.5 MB」；全选 13 集「预计总大小 约 2.9 GB（13 集）」、按钮「开始下载（13 个任务）」；取消当前集（12 集）「约 2.7 GB（12 集）」；仅 PV（89s）「约 15.6 MB」；仅第 3 话「约 248.4 MB」；清空选择时仍显示主分P「247.5 MB」。
  - 清晰度 480P（13 集）「约 858.3 MB（13 集）」，切回 HDR 恢复约 2.9 GB；仅音频（13 集）「约 324.5 MB（13 集）」。
  - 同键去重（`BV1BKhH6qEh9` 的「合集第 1 集」与「分P P1」同 bvid/cid/page）：先后勾选后面板仍为 1 个任务、体积不变，「已选 N 个条目」提示按去重后 1 条不出现。
  - 多P 视频 `BV1BKhH6qEh9`：仅勾选 P2/P3「约 109.1 MB（2 个分P）」、按钮「开始下载（2 个任务）」。
  - 回归：单视频 `BV1GJ411x7h7`「预计大小 39.1 MB」；UGC 合集 `BV1JD4y1U72G` 全选 95 集「约 1.2 GB（95 集）」。
- 精度（独立验收角色用 `/api/bili/streams` 逐集取流核对）：主分P 单集 0.0%；3 集合计 -4.8%、全 13 集合计 -7.9%（各集实际码率与主分P 略有差异，合计口径为个位数百分比误差）；逐集折算个别偏差 10%~18%，属「统一按主分P码率折算」的估算精度，如需更准可改为逐集取流。
- 静态检查：`npx tsc --noEmit`、`npx eslint .`（0 errors / 0 warnings）、`npm run build`（Next 16 + Turbopack）通过。
- 生产包回归（standalone 3100 重启后）：首页 200、`/api/bili/video?input=ep693247` 返回 12 集正片 + PV；实测单集 247.5 MB、全选 13 集「约 2.9 GB（13 集）」、单视频 39.1 MB，无 console error。

![多选剧集时下载面板显示预计总大小](screenshots/multi-select-total-size.png)

## 验证记录（音频下载质量选择）

- 静态检查：`npx tsc --noEmit` 通过、`npx eslint`（改动文件）0 错误、`npm run build`（Next 16 + Turbopack）通过并生成 standalone 产物。
- 接口（真实登录态）：`GET /api/bili/streams?bvid=BV1mh4y1C7iQ&cid=1223345661` 返回 `audioQualities = [30251 Hi-Res 无损(flac), 30280 192K, 30232 132K, 30216 64K]`；视频模式默认 `selected.audioQuality=30280`，`audioOnly=1` 自动为 `30251`，`audioOnly=1&audioQualityId=30216` 精确命中，请求不存在的 `audioQualityId=30250` 回退自动，`audioQualityId=abc` → 400；杜比视频 `BV1kX4y197P4` 返回 `30250(dolby)` 且仅音频自动选中；游客 playurl 仍返回 30232/30280 且 CDN Range 206，因此 132K/192K 不做静态登录置灰（仅杜比/Hi-Res 标记需登录/大会员）。
- 生产模式落盘 E2E（`node scripts/start-standalone.mjs --port 3100`，ffmpeg 9.0.1）：
  - 仅音频 + 30216：`format=m4a`、任务 `audioQualityId=30216/audioQualityName=64K`，`ffprobe` = aac，1,747,939 B；
  - 仅音频 + 自动：解析为 30251，输出 `.flac`（58,962,477 B，`ffprobe` format=flac、codec=flac 48kHz/2ch）；
  - 480P 视频 + 30251：输出 `.mkv`（h264 + flac + 内嵌字幕/弹幕），63,882,021 B；
  - 模拟无 ffmpeg（设置页 ffmpegPath 指向不存在路径）：Hi-Res 仅音频任务回退 `format=m4s`、文件 `.m4s`，任务提示「未检测到可用的 ffmpeg，无法把 Hi-Res 无损音轨转封装为 FLAC，已保存原始 m4s 分片」；恢复设置后再次验证正常。
- UI（生产 standalone + headless Edge Playwright 受控场景）：首页填 BV → 回车后约 1.1s 出现「音频质量」下拉；下拉选项为自动（最佳音质）/ Hi-Res 无损 / 192K / 132K / 64K（杜比视频额外出现杜比全景声），下方显示「实际音轨：192K」；打开「仅下载音频」后重新取流、自动音轨变为 Hi-Res 无损、下载面板格式提示 FLAC 无损音频；无页面错误。截图见 `screenshots/audio-quality.png`、`screenshots/audio-quality-audio-only.png`。
- 独立验收：另起验收角色对契约/选择语义/边界/下载输出/前端联动做只读审查 + GET API 断言，结论通过（无 blocker）；其提出的两个非阻塞问题已在最终版本修复：杜比/Hi-Res 之外不再静态置灰 132K/192K；FLAC 转封装失败不再伪装 `.flac`。
- 回归：原有 64K/192K AAC 选择、视频默认 192K AAC、内嵌字幕/弹幕 MKV 流程不变；测试后已删除测试任务与文件，`data/tasks.json` 中原有任务保留、设置已恢复。

## 相关文档

- [原始应用逆向规格](docs/original-spec.md)
- [迁移设计蓝图](docs/blueprint.md)
- 原应用 `app.asar` 解码/可读化产物：仅本地保留，未纳入本仓库