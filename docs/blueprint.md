# bilidown-web 迁移设计蓝图（Lead 契约）

将 Electron 应用 bilidown 1.2.6 迁移为 Next.js App Router + TypeScript + Tailwind + shadcn/ui 网站。
原应用参考代码在 ../app_readable/（已逆向美化），精确规格以 docs/original-spec.md 为准；本文件定义新项目结构、接口契约、数据模型与分工，所有实现必须遵守。

## 0. 关键技术决策

| 主题 | 决策 |
|---|---|
| 框架 | Next.js latest（App Router，src/），React 19，TypeScript strict，Tailwind + shadcn/ui |
| 包管理 | npm |
| 后端（迁移原主进程） | B站 API 代理（解决 CORS/Referer/Cookie）、二维码登录、服务端下载引擎（fetch 流式下载 DASH 音视频 → 本机 ffmpeg 合并）、任务持久化（JSON 文件）、SSE 进度推送 |
| 前端（迁移原渲染进程） | 解析/搜索/下载/账号/设置/工具六个页面；任务列表实时刷新；设置与任务状态由服务端提供 |
| 持久化 | data/tasks.json、data/settings.json（项目内自动创建）；下载文件默认 downloads/（可设置绝对路径） |
| 合并 | 本机已装 ffmpeg 9.0.1；命令：ffmpeg -y -i video.m4s -i audio.m4s -c copy out.mp4；缺失时降级分别保存 |
| 状态管理 | 页面内 React hooks + fetch 封装；任务更新用 EventSource SSE；不引入 Redux |
| 组件 | shadcn/ui：button input card badge tabs table progress dialog alert-dialog dropdown-menu select switch label separator scroll-area sonner tooltip skeleton avatar textarea sheet |
| 图标/主题 | lucide-react + next-themes（light/dark/system），中文界面 |
| 明确不做 | 托盘、单实例、bilidown:// 协议、自动更新安装、aria2c 外部进程、系统关机、静默文件系统访问（设置页标注「仅桌面版」或移除） |

## 1. 目录结构与文件所有权（禁止跨范围改文件）

     bilidown-web/
     ├─ docs/original-spec.md, docs/blueprint.md
     ├─ data/（运行时生成，gitignore）  downloads/（默认下载目录，gitignore）
     ├─ src/app/
     │  ├─ layout.tsx [Lead]   globals.css [Lead]
     │  ├─ page.tsx [frontend-core]   search/page.tsx [frontend-core]
     │  ├─ downloads/page.tsx  account/page.tsx  settings/page.tsx  tools/page.tsx [frontend-aux]
     │  └─ api/** [backend]
     ├─ src/server/bili/client.ts, src/server/bili/wbi.ts
     ├─ src/server/download/manager.ts, worker.ts, naming.ts
     ├─ src/server/ffmpeg.ts, store.ts, settings.ts, events.ts, paths.ts   [以上 backend]
     ├─ src/lib/types.ts, constants.ts, api-client.ts, format.ts, utils.ts  [Lead]
     ├─ src/hooks/（core: use-video.ts use-search.ts；aux: use-tasks.ts use-settings.ts use-account.ts）
     ├─ src/components/ui/** [Lead]   layout/** [Lead]   shared/** [Lead]
     ├─ src/components/home/** search/** [frontend-core]
     └─ src/components/downloads/** account/** settings/** tools/** [frontend-aux]

## 2. API 契约

所有 Route Handler：export const runtime = 'nodejs'；错误统一返回 { error: string, code?: string } + 合适 4xx/5xx。

### 2.1 B站业务

| Method & Path | 说明 | 响应 |
|---|---|---|
| GET /api/bili/video?input= | 解析输入（BV/av/链接/b23 短链/ep/ss）并取视频信息 | { input: ParsedInput, video: VideoInfo } |
| GET /api/bili/streams?bvid=&cid=&qn=&codec=&audioOnly=&audioQualityId= | 可用清晰度/编码/音频质量 + DASH 播放流 | { qualities: QualityOption[], audioQualities: AudioQualityOption[], selected: StreamDetail } |
| GET /api/bili/search?keyword=&type=video或user&page=&order= | 搜索（WBI 签名，失败降级旧接口） | { items, page, total, hasMore } |
| GET /api/bili/suggest?term= | 搜索联想 | { items: string[] } |
| GET /api/bili/nav | 登录态 | { isLogin, user?: BiliUser } |
| POST /api/bili/login/qrcode | 生成二维码 | { key, url, image }（image 为 data:image/png;base64） |
| GET /api/bili/login/poll?key= | 轮询扫码 | { status: waiting/scanned/expired/confirmed, user? }；confirmed 时服务端保存 cookie |
| POST /api/bili/logout | 退出登录 | { ok: true } |
| POST /api/bili/resolve | 解析短链/输入（工具页） | { type, bvid?, aid?, epId?, seasonId?, url? } |

### 2.2 下载任务

| Method & Path | 说明 |
|---|---|
| GET /api/tasks | { tasks: DownloadTask[] }（createdAt 倒序） |
| POST /api/tasks | 创建并排队。body CreateTaskInput；返回 { task } |
| POST /api/tasks/[id]/action | body { action: pause/resume/cancel/retry/delete }；返回 { task? } |
| DELETE /api/tasks?status=completed或error或all | 批量清理 → { removed } |
| GET /api/tasks/events | SSE（见 §4） |
| GET /api/tasks/export | JSON { version: 1, exportedAt, tasks }（attachment） |
| POST /api/tasks/import | body 同上 → { imported } |
| GET /api/tasks/[id]/file | 已完成后文件下载（支持 Range，Content-Disposition） |
| POST /api/tasks/[id]/reveal | { path }（浏览器不能开资源管理器，UI 显示/复制） |

### 2.3 设置与系统

| Method & Path | 说明 |
|---|---|
| GET /api/settings | PublicSettings（cookie 打码：loggedIn + DedeUserID 预览） |
| PUT /api/settings | body Partial<AppSettings> → { settings } |
| GET /api/system/info | { version, platform, ffmpeg: {available, version?, path?}, downloadDir, downloadDirWritable } |
| GET /api/update/check | 请求 https://zhouql.vip/bdupdate/win32/latest.yml 解析 version → { latest?, current, hasUpdate }；失败返回 { hasUpdate: false, error } |

## 3. 类型契约（src/lib/types.ts，Lead 维护）

- ParsedInput：{ type: 'bvid' | 'av' | 'b23' | 'ep' | 'ss' | 'url', bvid?, aid?, epId?, seasonId?, url? }
- VideoInfo：bvid aid title cover desc duration pubdate owner{mid,name,face} stat{video,danmaku,reply,favorite,coin,share,like} pages[{cid,page,title,duration}] videos collection；另含可选补充字段 tname? copyright? tags?（tags 仅单P解析时由服务端补充）
- QualityOption：{ qn: number, label: string, codec: 'avc' | 'hevc' | 'av1', needsLogin: boolean }
- AudioQualityOption：{ id: number, label: string, kind: 'aac' | 'dolby' | 'flac', bandwidth?: number, needsLogin: boolean }（0/缺省 = 自动）
- StreamDetail：{ qn, label, video?: { url, backupUrls[], size?, bandwidth? }, audio?: { url, backupUrls[], size?, bandwidth? }, audioOnly, audioQuality?: AudioQualityOption }
- TaskStatus：queued / downloading / merging / completed / error / paused / cancelled
- DownloadTask：id bvid aid cid page title partTitle cover upName qn qualityName codec audioQualityId audioQualityName format(mp4/m4a/m4s/mkv/flac) status progress downloadedBytes totalBytes speed filePath fileName fileSize error createdAt updatedAt startedAt finishedAt sourceUrl audioOnly
- AppSettings：downloadDir namingTemplate maxConcurrent defaultQn defaultAudioQualityId preferCodec mergeWithFfmpeg ffmpegPath cookie proxy theme clipboardWatch autoCheckUpdate saveTaskHistory deleteTempAfterMerge
- PublicSettings：Omit<AppSettings, 'cookie'> & { loggedIn: boolean, cookiePreview?: { DedeUserID?: string } }
- BiliCookie：{ SESSDATA?, bili_jct?, DedeUserID?, DedeUserID__ckMd5?, sid?, buvid3? }
- BiliUser：{ mid, name, face, isLogin, vipStatus? }
- SearchVideoItem：{ type:'video', bvid, aid, title, cover, author, mid, duration, play, danmaku, pubdate, description }
- SearchUserItem：{ type:'user', mid, name, face, fans, videos, sign }
- CreateTaskInput：{ bvid, aid, cid, page, title, partTitle, cover, upName, qn, codec, audioOnly, audioQualityId?, sourceUrl }

## 4. 下载引擎（backend 实现）

- 单例 TaskManager 挂 globalThis（避免 dev 热更新重复实例）：内存 Map + 启动时从 data/tasks.json 恢复（downloading/merging 重置为 paused）。
- 队列按 maxConcurrent 启动；每个 worker 独立 AbortController。
- worker 步骤：
  1. 用当前 settings.cookie 重新调 playurl（不信任客户端过期 URL），按 qn+codec 选视频流、按 audioQualityId 选音频流（0/缺省 = 自动：仅音频优先 Hi-Res 无损 > 杜比全景声 > 最佳 AAC，视频优先最佳 AAC > Hi-Res > 杜比；请求的音轨不可用时回退自动）；
  2. 下载 video/audio 到 downloads/.tmp/<taskId>/video.m4s 与 audio.m4s，fetch 带 Referer: https://www.bilibili.com、User-Agent、Cookie；支持 backupUrl 切换、Range 续传（resume）；
  3. 进度：Content-Length 计算 total，节流 500ms emit；速度用最近 2s 采样；
  4. 合并：ffmpeg 可用且 mergeWithFfmpeg → ffmpeg -y -i video.m4s -i audio.m4s -c copy -movflags +faststart <final.mp4>；audioOnly → Hi-Res 无损转封装 .flac、其余直接保存 .m4a（FLAC 转封装失败或无 ffmpeg 时回退保存原始 .m4s 并在任务上提示）；视频任务音轨为杜比/Hi-Res 时合并为 MKV（MP4 兼容性差）；ffmpeg 缺失 → 分别保存 <name>.video.m4s 与 <name>.audio.m4s 并标记 warning；
  5. 按 namingTemplate 生成文件名（§4.1），移动到 downloadDir，status=completed；
  6. 失败 → error；cancel → 删除临时文件；pause → abort 保留临时文件（resume 续传）。
- SSE：GET /api/tasks/events，25s 心跳；事件：{ type: 'init', tasks }（连接时）、{ type: 'task-updated', task }、{ type: 'task-deleted', id }。
- 文件名模板默认 {title}，占位符 {title} {part} {bvid} {quality} {up} {cid} {page}；非法字符 \\/:*?"<>| → _；去尾点/空格；长度 ≤180。

### 4.1 目录结构

     downloads/
     ├─ <视频标题>.mp4                # 单P
     ├─ <视频标题>/P1 <分P标题>.mp4    # 多P
     ├─ <视频标题>.flac              # 仅音频 Hi-Res 无损
     └─ .tmp/<taskId>/video.m4s|audio.m4s

## 5. 前端页面规格

公共：页面为客户端组件（'use client'），用 src/lib/api-client.ts；sonner toast；Skeleton 加载；EmptyState 空状态。

### 5.1 布局（Lead）

- 左侧 Sidebar：LOGO bilidown + 六项导航（首页/搜索/下载/账号/设置/工具，lucide 图标），底部系统状态（ffmpeg/登录态）。
- 顶部 Header：全局搜索框（跳 /search）、主题切换、登录头像（去 /account）。
- 宽度 <768px 折叠为 Sheet。

### 5.2 首页 /（frontend-core）

1. 大输入框 + 解析按钮（支持 BV/AV/链接/b23 短链/ep/ss）；粘贴按钮（Clipboard API）；回车触发。
2. 视频卡片：封面、标题、UP主、播放/点赞/收藏、简介、分P列表（默认第一P）。
3. 清晰度 Select（/api/bili/streams；未登录高清置灰并提示登录）、编码 Select、音频质量 Select（自动 / Hi-Res 无损 / 杜比全景声 / 192K / 132K / 64K；杜比/Hi-Res 需大会员）、仅下载音频 Switch。
4. 开始下载 → POST /api/tasks → toast + 跳转下载页；在线预览用官方 iframe：https://player.bilibili.com/player.html?bvid=<bvid>&page=<page>&high_quality=1&danmaku=0
5. 底部最近任务 3 条（use-tasks 简单进度条）。

### 5.3 搜索页 /search（frontend-core）

- 搜索框 + 类型 Tabs（视频/UP主）+ 排序 Select（综合/播放多/最新/弹幕多）+ 分页。
- 视频卡片网格：封面（referrerPolicy 设为 no-referrer）、标题去 <em> 标签、UP主、播放量、时长、日期；点击跳 /?input=BV...
- UP主卡片：头像/昵称/粉丝/签名，点击新窗口打开 B站空间。
- URL 状态同步 ?keyword=&type=&page=&order=（router.replace）。

### 5.4 下载任务页 /downloads（frontend-aux）

- 统计卡（总数/下载中/已完成/失败）；状态 Tabs（全部/下载中/已完成/失败/已暂停）；任务行：封面、标题、分P、清晰度、大小、进度条（MB/s、剩余时间、已下载/总大小）、状态 Badge。
- 操作：暂停/继续/取消/重试/删除/下载文件（/api/tasks/[id]/file）/复制路径（reveal）。
- 顶部：导出 JSON、导入 JSON、清理已完成、清空全部（AlertDialog）、并发与下载目录显示。
- SSE 实时更新（use-tasks.ts：GET init + EventSource，卸载关闭）。

### 5.5 账号页 /account（frontend-aux）

- 未登录：说明 + 扫码登录按钮 → Dialog 二维码（2s 轮询，180s 超时），状态文案（等待扫码/已扫码/已过期→刷新）。
- 已登录：用户卡（头像/昵称/UID/VIP）、cookie 说明（服务端保存）、退出登录（确认）。
- 说明登录后 1080P+ 可用；cookie 安全提示。

### 5.6 设置页 /settings（frontend-aux）

- 下载：下载目录（Input/绝对路径 + 可写状态）、命名模板（占位符说明 + 实时预览）、最大并发 1-5、默认清晰度、默认音频质量（0=自动）、优先编码、合并开关、ffmpeg 路径 + 检测状态（/api/system/info）。
- 外观：主题 light/dark/system。
- 行为：剪贴板监听开关（说明浏览器限制：仅聚焦时每 2s 读，需权限）、自动检查更新、任务历史保存、合并后删临时文件。
- 网络：HTTP 代理（服务端下载用，留空禁用）。
- 危险区：恢复默认设置、清空任务记录。
- 保存：PUT /api/settings + toast（可自动保存）。

### 5.7 工具页 /tools（frontend-aux）

至少实现（以 docs/original-spec.md 为准补充）：
1. 链接解析器（粘贴任意链接/短链 → 类型/BV/标题，可跳首页）。
2. BV 与 AV 互转（客户端算法）。
3. 正则测试/提取（文本 + 正则 + flags，展示匹配与分组）。
4. 封面/直链提取（BV → /api/bili/video 显示大图 + 复制 URL）。

## 6. UI 约定

- shadcn neutral 基色、CSS 变量、class 暗色策略；卡片 rounded-xl border bg-card；页面容器 mx-auto max-w-6xl p-6。
- 中文文案；错误 sonner.error；破坏性操作 AlertDialog。
- B站图片一律 referrerPolicy 设为 no-referrer，用普通 img（避免 next.config remotePatterns 配置）。
- 不使用第三方图表/动画库。

## 7. 分工与验收

1. Lead（T1）：脚手架、主题、src/lib/*、src/components/ui|layout|shared/*、根布局；最终集成、npm run build 通过、dev server 实测页面与关键 API。
2. backend（T2）：src/server/**、src/app/api/**；验收：build 通过；curl 实测 /api/bili/video、/api/bili/search、/api/tasks 创建 + SSE + 完成后文件存在。
3. frontend-core（T3）：首页、搜索页、src/hooks/use-video.ts、src/hooks/use-search.ts、src/components/home/**、src/components/search/**；验收：无 TS 错误、主流程可点通。
4. frontend-aux（T4）：下载/账号/设置/工具页 + 对应 hooks/components；验收同上。
5. 禁止修改 src/lib/types.ts、src/lib/constants.ts、src/app/layout.tsx、globals.css、components/ui/**（Lead 所有）；需新增字段/组件先告知 Lead。

## 8. 原桌面功能 → Web 映射

| 原功能 | Web 实现 |
|---|---|
| aria2c 下载 | 服务端 Node fetch + ffmpeg 合并（§4） |
| Dexie 任务库 | 服务端 data/tasks.json + SSE |
| localStorage 设置 | 服务端 data/settings.json + /api/settings |
| 二维码登录（passport） | 服务端代理 /api/bili/login/*，cookie 存 settings |
| 剪贴板监听（500ms） | 页面聚焦内 2s Clipboard API 轮询（开关）+ 手动粘贴 |
| 托盘/单实例/协议/自动更新/关机 | 移除；设置页标注仅桌面版 |
| 打开下载目录 | 复制路径 + 浏览器下载文件 |
| 官方播放器预览 | bilibili player iframe |