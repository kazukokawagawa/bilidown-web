# bilidown 1.2.6 → Next.js + shadcn 技术规格

> 本文面向将 Electron 版 **bilidown 1.2.6**（Electron + Vue 2 + Element UI）迁移为 **Next.js App Router + TypeScript + Tailwind + shadcn/ui** 网站的实现工程师。
> 所有结论均来自对解包产物的静态阅读，行号可复核；凡无法从代码确证的地方都显式标注「未能确认」并给出推断。
>
> 逆向基线（只读，勿修改）：
> - `C:/Users/25800/Downloads/app_readable/renderer/app.1f770f5f_modules/5008.js`（9,233 行，应用 UI 单模块）
> - `C:/Users/25800/Downloads/app_readable/main-process/background_modules/0154.js`（222 行，Electron 主进程）
> - `C:/Users/25800/Downloads/app_readable/renderer/chunk-vendors.6f104f4c_modules/*.js`（第三方库）
>
> 校验命令示例：`rg -n "playurl" renderer/app.1f770f5f_modules/5008.js`

---

## 0. 阅读约定

| 缩写 | 实体 | 说明 |
|---|---|---|
| **5008** | `renderer/app.1f770f5f_modules/5008.js` | 全部页面/组件/store/API/Dexie 都在此文件 |
| **0154** | `main-process/background_modules/0154.js` | 主进程：窗口、协议、aria2c、托盘、更新、IPC |
| **vendor/xxxx** | `renderer/chunk-vendors.6f104f4c_modules/xxxx.js` | 第三方库模块 |
| **Dexie** | vendor/4143（Dexie 3.x） | IndexedDB ORM |
| **aria2 客户端** | vendor/9506 → vendor/4459 → vendor/4008 | JSON-RPC over HTTP |

行号写法：`5008:1582` 表示 5008.js 第 1582 行；区间用 `5008:1627-1709`。

> asar 内没有 sourcemap，变量名均为压缩名。本文在描述行为时使用语义化命名，并同时给出压缩名（如 `je()`、`di()`）以便对照。

---

## 1. 页面与路由

### 1.0 路由表（5008:9001-9017）

```js
$["default"].use(xe.Ay);                       // VueRouter
const As = [
  { path: "/",         redirect: "/search" },
  { path: "/search",   name: "search",   component: _e },  // Xe  (5008:2300)
  { path: "/setting",  name: "setting",  component: Si },  // ki  (5008:4444)
  { path: "/acount",   name: "acount",   component: ji },  // Ei  (5008:4799)
  { path: "/download", name: "download", component: _a },  // Xa  (5008:8245)
  { path: "/tools",    name: "tools",    component: ls },  // rs  (5008:8999)
];
const cs = new xe.Ay({ routes: As });
cs.beforeEach((t, e, i) => { Ct.commit("updateActiveRouterName", t.name); $notify.close(); i(); });
```

- 路由模式：**hash 还是 history 未能确认**（Electron 内用 `app://./index.html` 加载，代码里未见 `mode` 配置，默认 hash）。迁移到 Next.js 用 App Router 的常规路径即可。
- 全局守卫只做两件事：写入 Vuex `ativeRouterName`（侧边栏高亮）、关闭全部 toast。
- `VueRouter.prototype.push` 被包了一层 `.catch(t => t)`（5008:9014-9017），用于吞掉重复导航异常。Next.js 用 `router.push` 时忽略即可。

**页面组件与选项对象对应关系**（便于定位）：

| 路由 | 组件变量 | render 函数 | 选项对象 | 行号范围 |
|---|---|---|---|---|
| 全局外壳 App | `Ce` | `tt` (5008:61) | `Me/ye` (5008:956) | 61-1167 |
| /search | `_e` | `ke` (5008:1170) | `Ke/Ze` (5008:1428) | 1170-2300 |
| /setting | `Si` | `$e` (5008:2302) | `xi/Ci` (5008:4204) | 2302-4444 |
| /acount | `ji` | `Bi` (5008:4446) | `Li/Fi` (5008:4564) | 4446-4799 |
| /download | `_a` | `Pi` (5008:4801) | `Ka/Za` (5008:6849) | 4801-8245 |
| /tools | `ls` | `$a` (5008:8247) | `ns` (5008:8683) | 8247-9000 |

### 1.1 全局外壳（App，5008:61-343 + 956-1165）

布局三块（固定定位，CSS 变量在 `renderer/css/app.css`，`[dark-theme]` 切换）：

1. **左侧竖直菜单 `.app-left-menu`**（宽 50px，`el-menu` 竖向）：
   - 顶部头像区 `.acount`：未登录显示默认占位图（点击进 /acount）；已登录显示 `user.face` 圆形头像（点击：若已在 /acount 则 `shell.openExternal("https://space.bilibili.com/<uid>/")`，否则跳 /acount）；大会员追加一个「大」角标 `.biliMajorMembers`。
   - `el-menu-item index="search"` 图标 `el-icon-search`。
   - `el-menu-item index="download"` 图标 `el-icon-download`，当 `waitDown.length > 0` 且当前不在 download 页时挂 `el-badge`（`max=99`）。
   - `el-menu-item index="tools"` 图标 `icon-kuozhan`，**仅当 `setting.tools === true` 时出现**（默认 false，工具页默认隐藏）。
   - `el-menu-item index="acount"` 图标 `el-icon-user`。
   - 主题开关 `label.theme-toggle`（checkbox + 太阳 SVG），点击 `toggleTheme`：写 `localStorage.theme = "dark"|"light"` 并设置 `document.documentElement[dark-theme]`（属性名是 `dark-theme`，值 "dark"/"light"，见 5008:995-999、1153-1159）。
   - 底部 `.left-menu-setting`：设置项 `index="setting"`，当 `newVersion` 为真且不在设置页时挂红点 `el-badge is-dot type=success`。
   - 菜单项 `select` 触发 `menuClick` → 播放点击音效；路由不变时不跳转。

2. **自绘标题栏 `.native-bar`**（`frame:false`，窗口控制）：
   - 三个按钮 `.minimize / .fullscreen / .close`，统一走 `le(event)`（5008:855-865）：按 `event.target.className` 精确匹配字符串（"minimize"/"fullscreen"/"close"），调用 `BrowserWindow.getFocusedWindow()` 的 `minimize()` / `isMaximized()?unmaximize():maximize()` / `close()`。
   - 注意：**className 必须完全等于**这三个值，因为原实现用 `===` 比较。迁移时这是纯桌面逻辑，Web 端删除。
   - 该栏是拖动区（CSS `-webkit-app-region: drag`，未在 JS 中出现，属样式约定；未能确认具体规则）。

3. **内容区 `.main`**：`<keep-alive><router-view/></keep-alive>`，即**所有页面常驻内存**，切页不销毁（直接导致搜索页 `clipboard-change` 监听始终有效）。

4. **全局弹层**：
   - 关机倒计时对话框 `.shutdown-dialog`（不可 ESC/点遮罩关闭）：文案「你在**设置**中开启了**自动关机设置**…将在 N 秒后自动关机」，唯一按钮「取消」→ `cancelAutoShotDown()`。
   - 离线遮罩 `.offline`（`v-show="!online"`）：另一套标题栏 + 插画 + 「您已离线，请检查网络连接状态。」

App 的 `mounted`（5008:965-1079）是**整个应用的启动序列**，迁移时必须按序复刻：

1. `router.push("/download")` → `$nextTick` 找到 `$options.name === "Download"` 的子组件执行 `initSaveTasksEvent()` → `router.push("/search")`。
   （目的：让 Download 组件先挂载，注册主进程 `save-tasks` 的落库回调。）
2. `he.checkIfTableHasData("download")` 为真 → `router.push({name:"download", query:{echo:"true"}})`（恢复上次未完成任务）。
3. `navigator.onLine` 为真 → `supportAndDataUpdateCheck()`（拉 `support.json`），否则 `online=false`；监听 `online`（延迟 1s 重拉）/`offline`。
4. 读 `localStorage: aface / zanzhucode`，缺省写入内置 base64 图；commit 到 store。
5. 读 `defaultDownPath / setting / theme / buid / renameRule / folderRenameRule`：
   - `theme` 缺省 "light"；为 "dark" 时把开关设为 checked 并设 `dark-theme="dark"`，160ms 后注入一段过渡样式避免首屏闪。
   - `renameRule` 缺省写 `"%title%"` 并 commit；`folderRenameRule` 缺省写 `""` 且**强制 commit ""**（5008:1007-1008，注意与 localStorage 读到的值不一致，是个小 bug）。
   - `setting` 缺省调用 `Xt()` 写入默认设置（见 §3.4）。
6. `checkUpdate()`（见 §2.4）。
7. `window.addEventListener("unhandledrejection", e => e.preventDefault())` —— 吞掉所有未处理的 Promise 异常。
8. 给所有 `.el-button--primary` 绑定 click 音效（DOM 级 hack）。
9. 若 `localStorage.user` 存在：先 commit 本地缓存的 user，再请求 `nav` 校验；见 §2.2.1。
10. `ipcRenderer.send("check-tray-status", setting.tray)`、`send("listen-clipboard-status-change", setting.listenClipBoard)`。
11. 380ms 后在 /search 页弹节日/欢迎 toast（§9.6）。
12. 校验 `defaultDownPath` 是否还存在（`fs.existsSync`）：不存在 → 3.8s 后报错并把路径重置为 `app.getPath("desktop")`；从未设置过 → 同样落桌面。
13. `mt.pcvisited()`，若 `localStorage.buid` 存在再 `mt.pccount(buid)`。

### 1.2 首页 `/`

只有 `redirect: "/search"`。侧边栏「首页」概念不存在，首页即搜索页。

### 1.3 /search —— 链接解析页（不是关键词搜索）

**结论先行：整个应用没有任何 B 站「搜索」接口调用**（全文 `api.bilibili.com` 仅 8 处，见 §2.2）。/search 的职责是：把用户粘贴的 B 站链接/AV 号解析成 BV，拉 `view`，再决定「直接建单任务」还是「列出分P/合集让用户勾选」。

**UI 结构**（5008:1170-1314）：

```
div.search (contextmenu 拦截 → 自定义右键菜单)
├─ div.search-content
│  ├─ input.search-input   placeholder="请输入链接"  v-model.trim="nativeLink"  @keydown.enter="search"
│  ├─ button                "搜索"  @click="search"
│  └─ i.search-clear-icon  icon-guanbi  v-show="nativeLink"  @click="clearNativeLink"
└─ el-collapse (accordion, v-show="mediaData.heji.length || mediaData.fenp.length", v-model="activeName")
   └─ el-collapse-item title="已选择 [ n / m ]" name="视频"
      ├─ el-checkbox (v-for selectPages, border, label=page, v-model=selectedP)
      │    文案：第{page}集 | {name}
      └─ el-checkbox 全选(A) + b-button "下一步(Enter)" 或 "取消"
```

- 输入框自动聚焦（`mounted` 与 `beforeRouteEnter` 两处）。
- 无结果卡片、无封面展示：单视频在解析成功后**直接加入待下载并跳转 /download**，用户看不到确认界面。
- 右键菜单（`onContextmenu`，5008:1521-1547）：两项，「粘贴（V）」→ `clipboard.readText()` 填入输入框 + 音效；「了解更多」→ 打开 `https://zhouql.vip/`。
- 快捷键（`document.keydown`，仅在 `route.name === "search"` 时生效，5008:1493-1518）：
  - `Ctrl+B`：输入框未聚焦 → 聚焦并提示「已拿到焦点，可直接粘贴链接」；已聚焦且有内容 → 清空输入并 `resetData()`。
  - `Ctrl+A`：输入框未聚焦且存在分P → 全选/取消全选。
  - `Enter`：输入框未聚焦且存在分P → 执行 `getPagesDetails()`（阻止默认行为）。
  - 注意 `Enter` 也会被输入框自身的 `@keydown.enter` 触发一次 `search()`。
- `Shift+点击` 分P 复选框可区间多选（5008:1682-1704，直接操作 DOM）。
- 分P 数 > 4 时给 `.el-collapse-item__content` 加 `el-checkbox-overflow-99` 类（滚动）；> 120 时 toast 警告「强烈建议分几次下载」。

**数据/交互方法**（5008:1520-2298）：

| 方法 | 作用 |
|---|---|
| `search()` | 空则 warning；`resetData()`；`parseBv(nativeLink)`；成功 → `getVideoDetail(bv)`，失败 → error「仅支持由UP上传的单视频，合集和分集视频。」 |
| `parseBv(t)` | 见 §4.1 解析规则表 |
| `getVideoDetail(bv)` | 拉 view，分派单视频/分集/合集；见 §4.2-4.3 |
| `fenpHandler / hejiHandler` | 建立 `selectPages` 与 `selectedP` |
| `getPagesDetails()` | 遍历勾选页，逐集拉 playurl 建任务，节流 150ms/集 |
| `revokePagesReq()` | 取消「下一步」循环：清空 waitDown，状态置 cancel |
| `commitWaitDownArr()` | 把本地 waitDown 提交到 Vuex，跳 /download |
| `singleHandler / buildVideoAudioObj` | 任务对象构建与清晰度选择，见 §4.4-4.6 |
| `resetData()` | 重置全部本地状态（含 mediaData） |

**本地状态**（`data()`，5008:1429-1458）：`pagesReqState("pending"|"active"|"cancel")`、`checkAll`、`isIndeterminate`、`waitDown[]`、`waitDownCache{cid: task|-1}`、`nativeLink`、`activeName`、`selectedP:number[]`、`selectPages[{name,page}]`、`bv`、`p`、`mediaData{vid,type,idSet{aid,bv,cid},uid,upname,hejiTitle,title,pic,pubdate,desc,duration,fenp[],heji[],zimu[]}`。

### 1.4 /setting

单页纵向列表，每行一个 `.setting-menu`（左标题 + 右控件）。完整清单见 §5。页面底部有「版本」行与赞助区块（作者头像、微信赞助按钮、官网/文档链接）。

两个大对话框：
- **自定义文件命名设置** `.rename-dialog`（5008:3110+）：变量按钮（%title%/%upnn%/%uid%/%aqn%/%vqn%/%bv%/%cid% 等）、输入框、实时预览、随机示例按钮 `randomRuleToRename`、保存 `updateRenameRule`。
- **文件夹命名规则** `folderRenameDialogVisible`：同一套交互，函数为 `wi()` / `Vi()`。

### 1.5 /acount

见 §7。

### 1.6 /download

三个 `el-tab-pane`（5008:4826 / 5257 / 5492），tab 标题动态显示数量：`待下载(n)`、`下载中(n)`、`已下载(total)`。

**待下载 tab**
- 顶部动作条（仅在 `download.length > 0` 时显示）：
  - `b-button「存储：<downDirectory>」` → `selectCacheDownPath()`，仅修改**本次批次**的下载目录（会话级，不写 localStorage）。
  - `b-button「自定义批量」` → 打开类型选择对话框。
  - `b-button「下载视频」(success)` → `downAllTask()`：全部按「有声视频（+混流）」入队。
  - `b-button「清空」(danger)` → `removeAllTack()`。
- 列表项 `li`（key = `cid`）：左侧封面（点击 `previewVideo` 打开预览）、右侧标题、音质下拉（`amap`）、画质下拉（`vmap`）、`audio：<asize>` / `video：<vsize>`、发布与时长、简介、右上角删除 `icon-guanbi`；按类型显示 `封面 / xml弹幕 / ass弹幕 / nfo刮削 / 音频 / 下载` 快捷按钮（受 `setting.pic/xml/ass/guaxiao/music` 控制显隐）。

**自定义批量对话框**（5008:5820-6080）：
- 9 个 `el-checkbox`：`封面(1)、NFO刮削(5)、XML弹幕(2)、ASS弹幕(3)、SRT字幕(4)、音频MP3(10)、音频(6)、无声视频(8)、有声视频(9)`；SRT 需登录（未登录显示「此功能需 登录」）。
- 当选中类型 > 1 时出现两个开关（仅前端记忆）：
  - 「大于一项创建文件夹」`createFolder`（写 `localStorage.createFolder`）。
  - 「文件夹名前添加序号」`createFolderAddIndex`（写 `localStorage.createFolderAddIndex`，仅当上一个开关开启时显示）。
- 底部「开始下载」→ `pushAllTask()`。

**下载中 tab**：顶部「清空」（`removeAllDownloadingTask`）、「开始/暂停」（`pauseAll` 切换）；列表项显示封面、标题、`当前任务：<tip>`、`progressMB`、速度、状态徽标 `b-status--<status>`、进度条 `b-progress`。速度为 `"0.00 bytes/s"` 时显示「重试中，可能需要一些时间...」。

**已下载 tab**：顶部「导入」「导出」「清空记录」；列表项：封面（点击 `saveCover`）、标题、`downDate`、复制BV、浏览器打开、打开文件夹、删除记录、`upname`（点击进 UP 空间）、`type` 描述串；`totalCount > 15` 时底部 `el-pagination`（`page-size=15`，layout `prev, pager, next`）。

**预览对话框**：内嵌 Plyr 播放器（`BPlayer` 组件，5008:9097-9153），source 来自 `previewVideo` 的 mp4 直链；切页时 `handlerClose` 暂停。

### 1.7 /tools

见 §6。

### 1.8 全局行为

| 行为 | 实现 | 位置 |
|---|---|---|
| 剪贴板监听 | 主进程 `setInterval(500ms)` 轮询 `clipboard.readText()`，变化即 `webContents.send("clipboard-change", text)`；渲染层在 /search 的 `mounted` 里监听，解析成功则自动填链接 + `listen-clipboard-focus` + 跳转 + 直接拉详情 | 0154:192-203；5008:1479-1491 |
| 剪贴板窗口置顶 | 主进程收到 `listen-clipboard-focus`：`setAlwaysOnTop(true)` → 10ms 后 `false` → `show()+focus()` | 0154:207-214 |
| 自定义右键菜单 | 仅 /search 页面注册，两项（粘贴 / 了解更多） | 5008:1521 |
| 提示音 | 6 个 `new Audio(module)`，由 `zt(type)` 播放：click/hover/no/yes/saoma/success；受 `setting.soundTip` 控制 | 5008:533-592 |
| toast | 全局 `$notify`（vue-notification 风格）：`zIndex=2`、`maxWidth="36%"`、`position.top="45px"`、`topOffset="-68px"`、`left="calc(50% + 25px)"`；封装 `loading1/loading2/info/warning/error/success/hi/close` | 5008:9225-9230 |
| 离线 | `navigator.onLine` + online/offline 事件，全屏遮罩 | 5008:974-980 / 238-339 |
| 自动关机 | 全部下载完成且待下载为空 → `$emit("shutdown")` → 30s 倒计时（每秒 -1）→ `ipc.send("shutdown")` → 主进程 `shutdown /s /t 0` | 5008:1113-1130、7434-7438；0154:137-139 |
| 单实例/协议 | 见 §8 | 0154:29-40、215-220 |

---

## 2. 网络 API 清单

### 2.1 请求层（5008:390-400）

```js
const st = axios.create({ baseURL: "https://www.bilibili.com/" });
st.interceptors.request.use(
  (config) => { if (!navigator.onLine) throw new Error("网络连接失败"); return config; },
  (err) => Promise.resolve(err),          // 注意：错误分支返回 resolve，不是 reject
);
var nt = st;
```

要点：

- 所有请求都是 **GET**，且 URL 全部写成绝对地址（`baseURL` 实际不参与拼接）。
- **没有统一注入 header**：不放 `User-Agent`、不放 `Referer`、不放 `Cookie`。
- 只有 `member.bilibili.com/x2/creative/h5/calendar/event` 显式 `{ withCredentials: true }`（5008:410-414），其余用默认。
- 请求头由 **Electron 主进程统一注入**（0154:91-97）：

```js
session.defaultSession.webRequest.onBeforeSendHeaders((details, cb) => {
  if (details.url.includes("bilibili.com") || details.url.includes("bilivideo")) {
    details.requestHeaders["User-Agent"] =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36";
    details.requestHeaders["Referer"] = "https://www.bilibili.com";
  }
  cb({ cancel: false, requestHeaders: details.requestHeaders });
});
```

- `index.html` 里有 `<meta name="referrer" content="no-referrer">`，但上面的 `onBeforeSendHeaders` 会再写回 Referer，最终以主进程为准。
- **Cookie 如何携带**：登录成功后渲染层用 `document.cookie` 写入（无 `domain` 参数、`SameSite=None`、30 天），其余请求依赖 Chromium 的 cookie jar 自动附带；`webPreferences.webSecurity = false`（0154:81）关闭了同源/CORS 限制，这是它能跨域带 cookie 的前提。
  > **未能确认**：`app://` 源下写入的 cookie 是否真的会匹配到 `api.bilibili.com`。代码里没有任何 `Cookie` 头的显式拼装，也没有主进程 `session.cookies.set` 调用，因此只能推断「依赖关闭 webSecurity 后的 Chromium cookie 行为」。**Web 版必须改为服务端代理 + 服务端 Cookie 头**，见 §8。
- 渲染层**从未使用 WBI 签名**，详见 §2.6。

### 2.2 B 站接口逐条

> 下表 URL 均为完整地址；`nt.get(url)` 即 axios GET。响应统一为 `{ code, message, data, ... }`，业务代码大多比较字符串 `"0" == code`。

| # | 用途 | URL | 关键参数 | 响应字段使用 |
|---|---|---|---|---|
| 1 | 登录态/用户信息 | `https://api.bilibili.com/x/web-interface/nav` | 无 | `data.isLogin`、`data.uname`、`data.face`、`data.money`、`data.vipStatus`、`data.mid` |
| 2 | 二维码生成 | `https://passport.bilibili.com/x/passport-login/web/qrcode/generate` | 无 | `data.data.url`（二维码内容）、`data.data.qrcode_key` |
| 3 | 二维码轮询 | `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=<key>` | `qrcode_key` | `data.code`（0/86101/86090/86038）、`data.url`（成功时携带 cookie 的跳转 URL）、`data.message` |
| 4 | 视频详情 | `https://api.bilibili.com/x/web-interface/view?bvid=<bv>` | `bvid` | `aid`、`bvid`、`cid`、`title`、`pic`、`pubdate`、`desc`、`duration`、`owner.mid/name`、`pages[]`、`ugc_season{title,sections[].title,episodes[]}` |
| 5 | 取流（DASH） | `https://api.bilibili.com/x/player/playurl?cid=<cid>&fourk=1&fnver=0&fnval=4048&bvid=<bv>` | `cid`、`fourk=1`、`fnver=0`、`fnval=4048`、`bvid` | `code`、`data.accept_quality[]`、`data.accept_description[]`、`data.dash.video[]/audio[]/flac.audio/dolby.audio`、`data.durl[]` |
| 6 | 取流（指定清晰度） | `https://api.bilibili.com/x/player/playurl?cid=<cid>&fourk=1&fnver=0&fnval=4048&bvid=<bv>&qn=<qn>` | 追加 `qn` | 同上；用于 VIP 补拉 112/116 等 |
| 7 | 字幕列表 | `https://api.bilibili.com/x/player/wbi/v2?aid=<aid>&cid=<cid>` | `aid`、`cid` | `data.subtitle.subtitles[].subtitle_url`、`.lan_doc` |
| 8 | 弹幕 XML | `https://api.bilibili.com/x/v1/dm/list.so?oid=<cid>` | `oid`（=cid） | 直接是 XML 文本（`<d p="...">text</d>`） |
| 9 | 视频详情（NFO 刮削用） | `https://api.bilibili.com/x/web-interface/view/detail?bvid=<bv>` | `bvid` | `data.Tags[]`、`data.View.title/tname/desc/pubdate`、`data.Card.card.name` |
| 10 | 预览播放（mp4） | `https://api.bilibili.com/x/player/playurl?avid=<aid>&cid=<cid>&qn=64&platform=html5&otype=json&high_quality=1` | `avid`、`cid`、`qn=64`、`platform=html5`、`otype=json`、`high_quality=1` | `data.data.durl[0].url`（直接用 Plyr 播） |
| 11 | 入站时间 | `https://member.bilibili.com/x2/creative/h5/calendar/event?ts=0`（`withCredentials: true`） | `ts=0` | `data.data.pfs.profile.jointime`（秒级时间戳） |

补充说明：

- **#1 nav**：启动时若本地有 `user` 缓存会重新校验；未登录则把 `user` 置空并把 `videoQn/audioQn/zimu` 回落为 `"16"/"64"/"false"`（5008:1018-1047）。
- **#4 view**：这是唯一的分P/合集信息源；`pages[].cid/part/duration/first_frame` 用于分集，`ugc_season.sections[].episodes[].cid/bvid/aid/title/arc.duration/arc.pic/arc.pubdate/page.part` 用于合集。
- **#5 playurl**：`fnval=4048` = DASH(16) + HDR(64) + 4K(128) + 杜比音频(256) + 杜比视界(512) + 8K(1024) + AV1(2048) 的组合值（B 站位掩码）。`fourk=1` 允许 4K。**没有 `qn` 时返回 `accept_quality` 全集**（通常不含需要单独请求的 112/116）。
- **#6** 只在「已登录且是大会员且 `accept_quality` 里有 `dash.video` 未覆盖的 qn，且该 qn 含 112 或 116」时逐個补拉（5008:2136-2163），拉回后按 `(qnCode, codecs)` 去重再 `sortVideoQnMap`。
- **#8** 返回 `application/xml`；代码用默认 `responseType`（字符串）解析。
- **#11** 只要 `jointime`，失败会走 catch 提示。

### 2.3 登录二维码（完整流程，5008:4606-4734）

1. 点击「B站扫码登录」→ `logon()`：`navigator.onLine` 检查 → `createLoginCode()` → `checkLoginCode()`。
2. `createLoginCode()`：
   - `codeState` 必须是 `"pending"`（否则忽略），置 `"creating"`，toast「正在请求登录二维码」，`sleep(300)`。
   - GET `passport.bilibili.com/x/passport-login/web/qrcode/generate`。
   - 若无 `data.data.url` → error「api error: createCode」并复位；否则保存 `oauthKey = data.data.qrcode_key`，置 `"created"`。
   - 用 `qrcode` 库（vendor/9118）在 `$refs.loginCode` 上渲染：`{ text: url, width: 120, height: 120, colorDark: "#4dab81", colorLight: "#ffffff", correctLevel: L }`，并清空 `title`。
3. `checkLoginCode()`：`while (codeState !== "pending" && oauthKey)` 循环：
   - GET `.../poll?qrcode_key=<key>`；
   - `data.code === 0` → 必须存在 `data.url`，否则按 api error 处理；成功 → `loginSuccessHandler(data.url)`；
   - `86101` → toast「等待扫码中...」；
   - `86090` → toast「已扫码，等待确认...」+ `loginWaitConfirmeHandler()`（背景换成「已扫码」图、二维码 img 透明度 0.4、播放扫码音效，只播一次）；
   - `86038` → `cancelLogin()` + warning「二维码已过期，登录操作已取消」；
   - 每次循环结束 `await sleep(1000)` → **轮询间隔 1 秒**；
   - 任何异常 → `cancelLogin()` + error(toast)。
4. `cookieHandler(url)`：取 `url.split("?")[1]`，按 `&` 切分，每段 `split("=")` 得 `[name, value]`：
   - `setCookie(name, value, 30, "None")` → `document.cookie = encodeURIComponent(name) + "=" + encodeURIComponent(value) + "; expires=<+30d UTC>; samesite=None"`（**无 domain / path**）；
   - 当 `name === "DedeUserID"` 时写 `localStorage.buid`。
   - 实际写入的键包括 `DedeUserID`、`DedeUserID__ckMd5`、`SESSDATA`、`bili_jct`、`sid`（B 站 crossDomain 返回的固定集合）。
5. `getUserInfo()`：#1 nav → 组装 `user = {state:true, uname, face: face + "@120w_120h_1c.avif", coin: floor(money), vip: !!vipStatus, uid: mid}`，commit + 写 `localStorage.user`；随后 #11 取 `jointime` 写 `localStorage.jointime`（格式化 `YYYY-MM-DD HH:mm:ss`）。
6. 登录成功后：toast「登录成功，默认画质已设置为1080P」；把 `setting.videoQn = "80"`、`setting.audioQn = "192"` 写入 localStorage 与 Vuex；350ms 后放彩带（canvas-confetti，vendor 内联在 5008:6089-6455 附近，颜色 `#fb7299,#6ff44d,#335eea,#fcf403,#a503fc,#fc03ad`，90 片）。
7. 退出登录 `exitLogin()`：ipc `clearCookie`（主进程清 `session.defaultSession.clearStorageData({storages:["cookies"]})`）→ 清 document.cookie → 清 Vuex/localStorage.user → 白名单外**删除所有 localStorage key**（白名单：`setting/defaultDownPath/theme/folderRenameRule/renameRule/createFolder/createFolderAddIndex`）→ 设置回落 16/64/zimu=false。

### 2.4 自有服务器 / 更新检查

| 用途 | URL | 说明 |
|---|---|---|
| 支持位/素材版本 | `https://zhouql.vip/bilibili/support/support.json?t=<ts>` | `{ support: boolean, faceUT: string }`；`support=false` 时置 `store.support=false`（控制赞助区展示）；`faceUT` 变化时拉下面两个 txt |
| 作者头像 | `https://zhouql.vip/bilibili/support/face.txt?t=<ts>` | 纯文本（data URI 或 base64），写 `localStorage.aface` |
| 赞助码 | `https://zhouql.vip/bilibili/support/zanzhucode.txt?t=<ts>` | 同上，写 `localStorage.zanzhucode` |
| 更新检查（渲染层） | `https://zhouql.vip/bdupdate/win32/latest.yml?<ts>` | 纯文本 YAML。取 `split("\n")[0].split(":")[1].trim()` 作版本号，`split("\n")[2].split(":")[1]` 作更新说明；与 `app.getVersion()` 不等 → `newVersion=true` |
| 更新下载（主进程） | electron-updater `setFeedURL("https://zhouql.vip/bdupdate/win32")` → `checkForUpdates()` | `download-progress.percent` → IPC `updateDownProgress`；`update-downloaded` → IPC `updateDownSuccess`；安装：spawn `cacheDir/pending/<fileName>`，500ms 后 `app.quit()` |
| 统计 | `https://bili.zhouql.vip/pcVisited`、`https://bili.zhouql.vip/pcCount/<uid>` | 启动打点；uid 来自 `localStorage.buid` |

> 更新说明在设置页以 `$alert` 展示，标题「新版本 x.y.z」，确认按钮「下载更新」→ `ipc.send("startUpdate")`。

### 2.5 aria2 JSON-RPC（下载引擎）

- 客户端：vendor/4008（JSON-RPC 基类）+ vendor/4459（aria2 方法名补全 + `token` 注入）+ 5008:6482-6574（业务封装 `class na`）。
- 传输：**HTTP POST** `http://localhost:<port>/jsonrpc`，`Content-Type: application/json`，body：

```json
{"method":"aria2.addUri","json-rpc":"2.0","id":0,
 "params":["token:zhouql",["https://cdn....m4s"],{"dir":"D:\\down","out":"BV1xx-123-720P高清avc1-video.m4s","timeout":15,"continue":true,"--retry-wait":1,"--max-tries":1,"--min-split-size":"15M","split":8}]}
```

- 秘密令牌固定字符串 **`zhouql`**；路径固定 `/jsonrpc`；host `localhost`；`secure=false`。
- 用到的方法：`getVersion`、`addUri`、`tellStatus`、`tellActive`、`forcePause`、`pauseAll`、`unpause`、`remove`、`purgeDownloadResult`。
- 连接方式：渲染层 `ipc.send("getAria2Port")` → 主进程 `webContents.send("Aria2Port", port)` → `new na("localhost", port, false, "zhouql", "/jsonrpc")`（5008:7591-7599）。
- 健康检查：`getVersion()` 能返回即视为可用，否则 `aria2Available=false`；每 30s 轮询一次（5008:6950-6955）。

### 2.6 是否使用 WBI 签名？

**没有。** 全量检索 `wbi|w_rid|wts|img_key|sub_key` 只命中一处：端点名 `/x/player/wbi/v2`（拉字幕），请求里**没有** `w_rid` / `wts` 参数，代码里也**没有** `img_key/sub_key` 的获取与 mixin 逻辑。

推论与迁移建议：

- 2023 年后 B 站对部分 web 接口强制 WBI，但 `playurl`、`view`、`nav`、`dm/list.so` 在带 Cookie + 正确 UA/Referer 时仍可用；`wbi/v2`（字幕）大概率需要 WBI，原实现只在「已登录」时调用，可能已失效或依赖登录态豁免。
- **Web 版建议在服务端实现 WBI**（原实现没有，属新增能力）：
  1. `GET https://api.bilibili.com/x/web-interface/nav` 取 `data.wbi_img.img_url/sub_url`，取文件名去后缀得 `img_key/sub_key`；
  2. `mixinKeyEncTab = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52]`；
  3. `raw = img_key + sub_key`，`mixinKey = mixinKeyEncTab.map(i => raw[i]).join("").slice(0,32)`；
  4. 参数按 key 升序拼 `k=v&...`（value 需 encodeURIComponent，过滤 `!'()*`），`w_rid = md5(query + mixinKey)`，追加 `wts=<秒>`。
- 上述算法**不在原代码中**，是迁移时补齐 B 站新校验所需。

### 2.7 视频/音频直链的请求头

- 直链来自 `data.dash.video[].baseUrl/backupUrl`（`upos-sz-*.bilivideo.com`）。
- 原实现对 `*.bilivideo.com` 的请求一律注入：UA（Chrome 112 Windows）+ `Referer: https://www.bilibili.com`。
- aria2 侧**没有**在 `addUri` 里传 `header`/`referer`，说明这些头来自随包的 `bin/aria2c.conf`（`--conf-path` 指向它）。**该 conf 不在 asar 内，未能确认其内容**；从能正常下载推断其中至少配置了 `user-agent` 与 `referer`（aria2 选项名：`user-agent=`、`referer=`、`header=`）。
- B 站直链带 `deadline` 与 `upsig` 等签名参数，**有效期约 2 小时**，任务排队久了必须重新取流（原实现的重取逻辑见 §4.5 `updateAudioVideoDownLink`）。

---

## 3. 数据模型

### 3.1 Dexie / IndexedDB（5008:873-889、6844）

```js
const de = {
  downloaded: "++id,uid,upname,title,pic,bv,path,downDate,type,&vid",
  download:   "++id,aModel,aSelect,aid,cid,asize,assFormatName,audioFullPath,bv," +
              "completedLength,coverFormatName,desc,downloadFolder,duration,fenpTitle," +
              "formatDuration,formatName,gid,guaxiaoFormatName,hejiTitle,index,isDownloading," +
              "paused,pic,progress,progressMB,pubdate,qn,speed,srtFormatName,status,taskStack," +
              "taskStackCache,tip,title,totalLength,type,upname,vModel,vSelect,vid,video," +
              "videoFormatName,videoFullPath,vmap,vsize,xmlFormatName,zimu",
};
const ue = new Dexie("downloadDatabase");
ue.version(1).stores(de);
ue.open();
ue.checkIfTableHasData = async (t) => (await ue[t].count()) > 0;
```

| 表 | 主键 | 索引（Dexie 语法） | 用途 |
|---|---|---|---|
| `downloaded` | `++id`（自增） | `uid, upname, title, pic, bv, path, downDate, type, &vid（vid 唯一）` | 已下载历史记录 |
| `download` | `++id` | 其余全部为普通索引（无唯一约束） | 退出时暂存「待下载 + 下载中」任务，下次启动 `echoDownload` 恢复 |

- 数据库连接在 5008:878 与 5008:6765 **各建了一次**（同名库两个实例），迁移时合并为一个。
- `downloaded` 去重键是 `vid`（同一 `vid` 再次 `put` 会抛 `ConstraintError`，代码捕获后改为「按 vid 查出旧记录 → Object.assign → put」，5008:7416-7429）。

### 3.2 下载任务对象（完整字段）

任务对象在 `singleHandler`（5008:1751-1830）、`getHejiPagesByUserSelect`（1884-1936）、`getFenjiPagesByUserSelect`（2034-2086）三处构造，字段一致：

| 字段 | 类型 | 默认值 | 含义 |
|---|---|---|---|
| `vid` | string | `Ut()`（时间戳 base24） | 一次「解析会话」的 ID，同一视频的多集共享 |
| `aid` | number | - | AV 号 |
| `bv` | string | - | BV 号 |
| `cid` | number | - | 分P 的 cid（列表 key） |
| `upname` | string | - | UP 主昵称 |
| `uid` | number/string | - | UP 主 mid |
| `type` | string | `"单视频"` | `"单视频"`/`"分集视频"`/`"合集视频"` |
| `title` | string | - | 单视频=视频标题；分集=`pages[].part`；合集=`episodes[].title` |
| `hejiTitle` | string | `""` | 合集名（`ugc_season.title` 或 `sections[i].title`） |
| `fenpTitle` | string | - | 分集所属视频标题（=mediaData.title） |
| `pic` | string | - | 封面 URL，追加 `@240w`（多选时 `@168w`） |
| `zimu` | `{src,desc}[]` | `[]` | 字幕列表（仅登录用户拉取） |
| `duration` | number | - | 秒 |
| `formatDuration` | string | - | `Ee(秒)` →「1小时2分钟3秒」 |
| `desc` | string | - | 简介（单视频=视频简介；合集=`page.part`） |
| `pubdate` | string | - | `Le(ts)` → `YYYY-MM-DD` |
| `aModel` | string | - | 当前选中的音质描述，形如 `192K mp4a`（名称与编码以竖线分隔） |
| `vModel` | string | - | 当前选中的画质描述，形如 `1080P 高清 avc1`（名称与编码以竖线分隔） |
| `aSelect` | string | = `aModel` | 下拉框初值（后端字段，前端只读） |
| `vSelect` | string | = `vModel` | 同上 |
| `video` | string | - | 视频直链**数组**（`backupUrl.concat(baseUrl)`） |
| `vsize` | string | - | 视频预估大小（`Ht(bandwidth*duration/8)`） |
| `audio` | string[] | `[]` | 音频直链数组；无音轨时为 `[]` |
| `asize` | number/string | `0` | 音频预估大小 |
| `index` | number/string | `"1"`（单视频）/ 勾选序号 | 集序号（用于 `%index%`） |
| `amap` | `{qnCode,qnDesc,codecs,link,size}[]` | - | 可选音质列表 |
| `vmap` | 同上 | - | 可选画质列表 |
| `qn` | `{video:{videoDesc,videoIndex},audio:{audioDesc,audioIndex}}` | - | 默认选中项下标（建单时的快照） |
| `isDownloading` | boolean | `false` | 是否已进入下载循环 |
| `taskStack` | string[] | `[]` | 待执行步骤队列（见 §4.7） |
| `taskStackCache` | string[] | `[]` | 步骤全集（用于生成 `type` 描述、判断重跑） |
| `audioFullPath` | string | `""` | 音频最终绝对路径 |
| `videoFullPath` | string | `""` | 视频最终绝对路径 |
| `downloadFolder` | string | `""` | 目标文件夹绝对路径 |
| `formatName` | string | `""` | 文件名主干（无扩展名） |
| `coverFormatName` | string | `""` | `<formatName>.jpg` |
| `audioFormatName` | string | `""` | `<bv>-<cid>-<aModel 去竖线>-audio.aac 或 .flac` |
| `videoFormatName` | string | `""` | `<bv>-<cid>-<vModel 去竖线>-video.m4s 或 .mp4` |
| `xmlFormatName` | string | `""` | `<formatName>.xml` |
| `assFormatName` | string | `""` | `<formatName>.ass` |
| `srtFormatName` | string | `""` | `<formatName> <字幕名>.srt` |
| `guaxiaoFormatName` | string | `""` | `<formatName>.nfo` |
| `status` | string | `"pending"` | pending/active/paused/complete/error/waiting |
| `paused` | boolean | `false` | 用户暂停标记 |
| `tip` | string | `""` | 当前步骤文案（"音频"/"视频"/"混流"/"封面"…） |
| `gid` | string | `""` | aria2 GID（完成后清空） |
| `totalLength` | string | `""` | 格式化总大小 |
| `completedLength` | string | `""` | 格式化已完成 |
| `speed` | string | `""` | 形如 `"1.20 MB/s"` |
| `progress` | number/string | `""` | 0~100（两位小数） |
| `progressMB` | string | `"--/--"` | `"completed / total"` 或 `"12.3%"`（ffmpeg 步骤） |

> 注意：`download` 表 schema 里还列了 `vmap`/`zimu`/`qn`/`video` 等字段，Dexie 只对列出的键建索引，**未列出的字段（如 `amap`、`audio`）也能存**（IndexedDB 无模式），只是不能按它们查询。

### 3.3 已下载记录 `downloaded`（5008:7392-7415）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 自增主键（导入时先删除，让库重新分配） |
| `vid` | string | 唯一键，来自任务 |
| `uid` | number | UP mid |
| `upname` | string | UP 昵称 |
| `title` | string | 单视频=标题；分集=`fenpTitle`；合集=`hejiTitle` |
| `pic` | string | 封面 |
| `bv` | string | BV 号 |
| `path` | string | `downloadFolder` |
| `downDate` | string | `YYYY-MM-DD HH:mm` |
| `type` | string | 形如 `"单视频 - [ 封面  XML弹幕 音频AAC 音频+  ]"`，由 `taskStackCache` 排序后拼接 |

`type` 生成细节（5008:7403-7415）：按 `oa` 优先级排序 `taskStackCache`，跳过 `["SUCCESS","混流","音频+","结果删除音频","删除aac"]`，若含「结果删除音频」则同时跳过「音频」，其余逐项 `" " + label + " "` 拼进 `" - [ ... ]"`。

### 3.4 设置项与 localStorage

**所有 key 一览**：

| key | 类型 | 默认值 | 写入点 | 说明 |
|---|---|---|---|---|
| `setting` | JSON string | 见下表 | 设置页 deep watch（5008:4429-4435） | 主设置对象 |
| `defaultDownPath` | string | `app.getPath("desktop")` | 设置页/首次启动 | 默认下载目录 |
| `theme` | `"light" / "dark"` | `"light"` | 侧边栏开关 | 主题 |
| `renameRule` | string | `"%title%"` | 命名对话框 | 文件命名模板 |
| `folderRenameRule` | string | `""` | 文件夹命名对话框 | 文件夹结构模板 |
| `createFolder` | JSON bool | `true` | 批量对话框 | 多类型时建子文件夹 |
| `createFolderAddIndex` | JSON bool | `false` | 批量对话框 | 子文件夹加序号 |
| `user` | JSON string | `{state:false,...}` | 登录/退出/启动校验 | 用户信息缓存 |
| `buid` | string | - | 登录成功 | `DedeUserID`，用于统计上报 |
| `jointime` | string | - | 工具页查询/登录 | 入站时间（已格式化） |
| `aface` | string(data URI) | 内置 base64 | 启动/素材更新 | 作者头像 |
| `zanzhucode` | string(data URI) | 内置 base64 | 启动/素材更新 | 赞助二维码 |
| `faceUT` | string | `""` | 素材更新 | 素材版本戳 |

**`setting` 对象全部字段（15 个）**，默认值来自 `Xt()`（5008:687-709）：

| 字段 | 类型 | 默认值 | 含义 / UI |
|---|---|---|---|
| `soundTip` | boolean | `true` | 系统提示音 |
| `tray` | boolean | `false` | 关闭窗口行为：false=退出程序，true=最小化到托盘 |
| `pic` | boolean | `true` | 下载封面 |
| `music` | boolean | `true` | 下载音频 |
| `xml` | boolean | `false` | 下载 XML 弹幕 |
| `ass` | boolean | `false` | 下载 ASS 弹幕 |
| `guaxiao` | boolean | `false` | 下载 NFO 刮削 |
| `zimu` | boolean | `false` | 下载 SRT 字幕（需登录） |
| `tools` | boolean | `false` | 显示「辅助工具」入口 |
| `shutdown` | boolean | `false` | 全部完成后自动关机 |
| `listenClipboard` | boolean | `false` | **注意大小写**：`Xt()` 写的是小写 `b`，设置页绑定的是 `listenClipBoard` |
| `listenClipBoard` | boolean | （同上，实际 undefined） | 监听剪切板；启动时 `send("listen-clipboard-status-change", setting.listenClipBoard)` 读的是大写 B |
| `maxDownCount` | number | `1`（`Xt()`）/ `2`（设置页 data 初值） | 并发数 1~4 |
| `videoQn` | string | `"16"` | 默认画质（qn 字符串） |
| `audioQn` | string | `"64"` | 默认音质（`64 / 132 / 192 / dubi / hi`） |
| `videoEncoding` | string | `"avc1"` | 编码偏好 `avc1 / av01 / hev1` |

> **默认值不一致的三处**（实现时必须统一，建议以 `Xt()` 为准并在设置页 data 中同步）：
> 1. `maxDownCount`：`Xt()` = 1，设置页 data = 2。
> 2. `listenClipboard` / `listenClipBoard` 拼写不一致。
> 3. 设置页 `data.setting` 里 `listenClipBoard` 为小写 `b` 之外的键都存在，但 `Xt()` 用 `listenClipboard`，导致「监听剪切板」开关首次渲染为 undefined。

### 3.5 Vuex store（5008:466-527）

```js
state: {
  support: true, authorFace: "", zanzhuCode: "", ativeRouterName: "",
  defaultDownPath: "", renameRule: "", folderRenameRule: "",
  user: { state: false, uname: "", face: "", vip: false, cion: "", uid: "" },   // 注意 cion 是 coin 的笔误
  updateProgress: 0, newVersion: false, waitDown: [], setting: {}, remainVideoEncoding: [],
}
```

| mutation | 载荷 | 说明 |
|---|---|---|
| `updateFolderRenameRule` | string | 文件夹模板 |
| `updateRenameRule` | string | 文件模板 |
| `updateRemainVideoEncoding` | string[] | 备选编码列表（如 `["av01","hev1"]`） |
| `updateActiveRouterName` | string | 当前路由 name |
| `updateUpdateProgress` | number | 更新百分比（仅 UI） |
| `updateNewVersion` | boolean | 是否有新版 |
| `updateLoginInfo` | user 对象 | 登录信息 |
| `updateDefaultDownPath` | string | 默认目录 |
| `updateSetting` | object | 整体替换 setting |
| `modifySetting` | `{key,value}` | 单键修改（仅当原值 truthy 时生效） |
| `updateWaitDown` | task[] | 待下载队列 |
| `updateSupport` | boolean | 赞助位开关 |
| `updateAFace` / `updateZanzhucode` | string | 素材 |

迁移建议：`setting` 用 Zustand/React Context + localStorage 持久化；`waitDown` 改成 TanStack Query 缓存或直接以服务端任务表为准（Web 端不需要客户端队列）。

---

## 4. 下载流程（核心）

### 4.0 端到端时序

```
[输入] nativeLink（粘贴/剪贴板/协议）
  → parseBv()                        得到 bv（+ p）
  → GET /x/web-interface/view        view 数据
      ├─ 单视频(pages<=1 且无 ugc_season) → GET playurl → buildVideoAudioObj → singleHandler → 任务入 waitDown
      └─ 分集/合集 → 列出 selectPages → 用户勾选 → 逐集 GET playurl → 逐集建任务（150ms 间隔）
  → commitWaitDownArr()              Vuex.waitDown + 跳 /download
  → 用户点「下载视频」/「自定义批量」  → generateFolderPath() → 复制进 downloading（JSON 深拷贝）并生成 taskStack
  → downloadLoop()                   并发 <= setting.maxDownCount
  → startDownload(task)              按 taskStack 优先级逐步执行
      封面 → 直链下载写盘
      XML/ASS 弹幕 → dm/list.so
      SRT 字幕 → subtitle_url 拉取 + 转 SRT
      NFO 刮削 → view/detail 拼 XML
      音频 → aria2 addUri
      音频+ → 同上（不参与混流命名）
      有声/无声视频 → aria2 addUri
      音频MP3 → ffmpeg aac→mp3
      混流 → ffmpeg 合并 → 重命名 mp4
      SUCCESS → completeHandler() 落库 + 通知 + 清理 + 关机判断
```

### 4.1 输入解析 `parseBv()`（5008:1582-1626）

按顺序匹配，命中即返回：

| # | 条件 | 处理 |
|---|---|---|
| 1 | `!t 或 t.length < 4` | 返回 `""` |
| 2 | `t.toLowerCase().startsWith("bv")` | 原样返回（用户直接输入 BV 号） |
| 3 | 含 `video/BV` 且含 `?p=` | 先记 `this.p = t.split("?p=")[1].split("&")[0]`（分P 预选） |
| 4 | 含 `bilibili.com/video/BV` | `/?`→取 `split("video/")[1].split("/?")[0]`；否则 `?`→`split("?")[0]`；否则 `/`→`split("/")[0]` |
| 5 | 含 `bilibili.com/list/watchlater?bvid=` | `split("bvid=")[1].split("&")[0]` |
| 6 | 含 `bilibili.com/list/watchlater/?bvid=` | `split("?bvid=")[1].split("&")[0]` |
| 7 | 含 `https://m.bilibili.com/video/BV` | 同 #4 |
| 8 | 含 `https://bili2233.cn/` 或 `https://b23.tv/` | `Notify.loading2("链接解析中...")`；把链接规整为 `"https" + t.split("https")[1]`；GET 该短链（axios 自动跟随 302）；若 `i.data.code === "-404"` → 报「出错了，请检查链接是否正确」返回 `""`；否则 `i.request.responseURL.split("video/")[1].split("/")[0]` |
| 9 | 含 `av`（不区分大小写） | 取 `av` 后的数字（依次尝试 `/?`、`?`、`/` 截断），先 `Number` 校验（`oe()`：`/^\d+$/`），再 `We(avid)` 转 BV |
| 10 | 其它 | 返回 `""` → 上层报「仅支持由UP上传的单视频，合集和分集视频。」 |

**不支持 `ep`/`ss`（番剧/课程）**：全文件检索 `bangumi|ep_id|season_id` 无命中。

**AV ⇄ BV 算法**（5008:1408-1425，与 B 站官方一致）：

```js
const XOR = 23442827791579n, MAX_AID = 2251799813685247n, ALPHABET = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";

function av2bv(aid) {                       // We()
  const s = ["B","V","1","0","0","0","0","0","0","0","0","0"];
  let i = s.length - 1, v = (1n << 51n | BigInt(aid)) ^ XOR;
  while (v > 0) { s[i] = ALPHABET[Number(v % 58n)]; v /= 58n; i -= 1; }
  [s[3], s[9]] = [s[9], s[3]];
  [s[4], s[7]] = [s[7], s[4]];
  return s.join("");
}

function bv2av(bv) {                        // Ge()
  const a = Array.from(bv);
  [a[3], a[9]] = [a[9], a[3]];
  [a[4], a[7]] = [a[7], a[4]];
  a.splice(0, 3);
  const n = a.reduce((acc, ch) => acc * 58n + BigInt(ALPHABET.indexOf(ch)), 0n);
  return Number((n & MAX_AID) ^ XOR);
}
```

### 4.2 view 拉取与字段映射 `getVideoDetail(bv)`（5008:1627-1709）

1. 若当前在 /search：`$notify.loading2("链接解析中...")`；`await sleep(380)`（**固定 380ms 节流**）。
2. `GET x/web-interface/view?bvid=<bv>`；`"0" == code` 才继续，否则 toast「出错了，请检查链接后重试」。
3. 字段映射（`mediaData`）：
   - `idSet.aid = data.aid`、`idSet.bv = data.bvid`、`idSet.cid = data.cid`
   - `vid = Ut()`（本次解析会话 ID）
   - `title = data.title`、`pic = data.pic`（原图，使用时再拼 `@240w`）
   - `pubdate = Le(data.pubdate)` → `YYYY-MM-DD`
   - `desc = data.desc || "这个视频没有写简介哦！ -- 开发者提示"`
   - `duration = Ee(data.duration)` → 中文时长
   - `uid = data.owner.mid`、`upname = data.owner.name`
4. 分支判定（顺序很重要）：

```js
if (has("pages") && pages.length > 1 && has("ugc_season"))  fenpHandler(data);   // 合集里的多P：按分P
else if (has("ugc_season"))                                  hejiHandler(data);  // 合集
else if (has("pages") && pages.length > 1)                    fenpHandler(data);  // 普通分P
else { mediaData.fenp = []; mediaData.type = "单视频"; }
```

5. 单视频再拉一次 playurl（`Ne(bv, cid)`）：
   - `"0" != code` → 「当前视频可能已被删除。」
   - `accept_description?.includes("试看")` → 「当前视频是充电专属视频，不支持。」
   - `!dash && durl` → 提示不支持 DASH，并给 `https://zhouql.vip/bilibili/?<视频URL>` 的网页版下载链接。
   - 通过 → `singleHandler(dashData, viewData)` → `waitDown.push(task)` → `commitWaitDownArr()`。

> 注意：单视频路径**没有**「确认页」，解析成功即入队并跳转 /download。

### 4.3 分集 / 合集

**`fenpHandler(view)`**（5008:1710-1717）：

- toast「分集视频，请选择后下一步」；
- `mediaData.fenp = view.pages`、`type = "分集视频"`；
- `selectPages = pages.map((p, i) => ({ name: p.part, page: i + 1 }))`；
- 若 URL 带 `?p=N`，把 N 放进 `selectedP`；
- `pages.length > 120` → toast「当前分集数大于120，强烈建议分几次下载」。

**`hejiHandler(view)`**（5008:1718-1735）：

- toast「合集视频，请选择后下一步」、`type = "合集视频"`；
- 遍历 `ugc_season.sections[].episodes[]`，找到 `ep.cid === idSet.cid` 的那一集：
  - `hejiTitle = sections.length === 1 ? ugc_season.title : section.title`
  - `mediaData.heji = section.episodes`
  - `selectedP.push(该集在该 section 内的序号)`
- `selectPages = heji.map((e, i) => ({ name: e.title, page: i + 1 }))`。

**`getPagesDetails()`**（5008:1736-1750）：把 `pagesReqState` 置 `"active"`，然后：

- 分集 → `getFenjiPagesByUserSelect(selectedP, mediaData.fenp)`
- 合集 → `getHejiPagesByUserSelect(selectedP, mediaData.heji)`

两者逻辑几乎相同（5008:1831-1965 / 1976-2116）：

1. `selectedP.sort((a,b) => a-b)`，逐个处理；
2. 若 `pagesReqState === "pending"`（用户点了取消）→ 清空 `waitDown` 并 return；
3. 若 `waitDownCache[cid]` 命中且不为 `-1` → 复用该任务对象，重置 `gid/tip/taskStack/taskStackCache/status/progress/progressMB/speed/paused/isDownloading` 后 push；
4. 否则 `GET playurl`（分集用 `this.bv`，合集用 `ep.bvid`）：
   - `code != 0` → toast「第N集视频可能已被删除，已跳过」，缓存 `-1`，sleep 1200ms；
   - 含「试看」→ 充电专属，缓存 `-1`，sleep 1500ms；
   - 无 `dash` 有 `durl` → 提示不支持 DASH，sleep 2500ms；
   - 否则 `buildVideoAudioObj` → 建任务（字段同 §3.2，`index = 勾选序号`）；
   - 封面：分集 = `mediaData.pic || page.first_frame`；合集 = `ep.arc.pic`；都追加 `@168w`（多选）或 `@240w`（单选）；
   - 登录用户额外 `GET wbi/v2` 拉字幕，push 进 `task.zimu`；
5. toast「正在排序，填装分集 i / n 的数据...」（仅 /search 页）；
6. 每集结束 `await sleep(150)`（**限速 150ms**）；
7. 全部完成 → `commitWaitDownArr()`；异常 → toast + `revokePagesReq()`；finally 复位 `pagesReqState = "pending"`。

### 4.4 playurl 参数与清晰度映射

**两个取流函数**（5008:1322-1335）：

```js
// 不带 qn：拿全集（默认）
GET https://api.bilibili.com/x/player/playurl?cid=<cid>&fourk=1&fnver=0&fnval=4048&bvid=<bv>
// 带 qn：补拉指定清晰度（仅大会员、仅 112/116）
GET https://api.bilibili.com/x/player/playurl?cid=<cid>&fourk=1&fnver=0&fnval=4048&bvid=<bv>&qn=<qn>
```

参数语义：`fnval=4048` 请求 DASH + 全部高阶特性；`fourk=1` 解锁 4K；`fnver=0` 固定；**不传 `qn` 时返回 `accept_quality` 列表**。原实现从不传 `session`、`platform`（预览接口除外）与 `otype`。

**视频 qn → 名称 `je()`**（5008:1362-1391）：

| qn | 名称 | 备注 |
|---|---|---|
| 6 | 240P 极速 | 未登录可用 |
| 16 | 360P 流畅 | 默认值 `setting.videoQn` |
| 32 | 480P 清晰 | |
| 64 | 720P 高清 | |
| 74 | 720P60 高帧率 | 需登录 |
| 80 | 1080P 高清 | 需登录（登录后默认） |
| 112 | 1080P+ 高码率 | 需大会员（独立 qn 补拉） |
| 116 | 1080P60 高帧率 | 需大会员（独立 qn 补拉） |
| 120 | 4K 超清 | 需大会员 |
| 125 | HDR 真彩色 | 需大会员 |
| 126 | 杜比视界 | 需大会员 |
| 127 | 8K 超高清 | 需大会员 |
| 其它 | 未知Code | |

**音频 id → 名称 `Pe()`**（5008:1392-1407）：

| audio id | 名称 | 来源字段 |
|---|---|---|
| 30216 | 64K | `dash.audio[]` |
| 30232 | 132K | `dash.audio[]` |
| 30280 | 192K | `dash.audio[]` |
| 30250 | 杜比全景声 | `dash.dolby.audio[]` |
| 30251 | Hi-Res无损 | `dash.flac.audio` |
| 其它 | 未知Code | |

**默认清晰度候选表**：`ae`（视频，5008:731-825）与 `se`（音频，5008:826-832）是 `Map<设置值, 可用名称数组>`，用于「按设置值从高到低挑第一个存在的」：

```js
ae: "127" → ["8K 超高清","杜比视界","HDR 真彩色","4K 超清","1080P60 高帧率","1080P+ 高码率","1080P 高清","720P60 高帧率","720P 高清","480P 清晰","360P 流畅","240P 极速"]
    "126" → ["杜比视界","HDR 真彩色", ...]
    "125" → ["HDR 真彩色", ...]
    "120" → ["4K 超清", ...]
    "116" → ["1080P60 高帧率", ...]
    "112" → ["1080P+ 高码率", ...]