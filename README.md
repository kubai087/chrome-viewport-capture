# 视口截图 Chrome 插件

给设计走查使用的 F12 风格视口预览与 Retina 截图工具。点击工具栏图标、输入视口宽高，插件会让网页按指定的 CSS 视口和 100% 页面缩放渲染；当屏幕放不下时，只缩小浏览器里的预览，不改变网页感知到的尺寸。

## Release 安装

1. 在 [Releases](https://github.com/kubai087/chrome-viewport-capture/releases/latest) 下载：
   - `chrome-viewport-capture.zip`
   - `chrome-viewport-capture.zip.sha256`
2. 将两个文件放在同一目录并校验：

   ```bash
   shasum -a 256 -c chrome-viewport-capture.zip.sha256
   ```

3. 把 ZIP 解压到不会被自动清理的固定目录。
4. 打开 `chrome://extensions/`。
5. 开启右上角的「开发者模式」。
6. 点击「加载已解压的扩展程序」，选择解压后的 `chrome-viewport-capture` 文件夹。
7. 在 Chrome 工具栏的扩展菜单中固定「视口截图」。

也可以把 [Agent 安装提示词](./AGENT_INSTALL_PROMPT.md) 整段复制给其他 Agent，让它协助下载、校验、安装和验证。

## 源码安装

1. 打开 `chrome://extensions/`。
2. 开启右上角的「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择本项目文件夹 `chrome-viewport-capture`。
5. 在 Chrome 工具栏的扩展菜单中固定「视口截图」。

安装时 Chrome 会提示插件可以“访问页面调试程序后端”“读取和更改您在所有网站上的所有数据”，并可管理下载。这是 `debugger` 与 `downloads` 权限的标准警告：插件通过与 DevTools Device Mode 相同的底层协议模拟视口和截图。插件仅在点击按钮后连接当前标签页，不上传页面内容，截图只保存到 Chrome 的默认下载目录。

## 使用

1. 打开要检查的普通网页。
2. 点击工具栏里的「视口截图」。
3. 选择常用桌面、Mac 16 英寸（`1728×1117`）、Mac 14 英寸（`1512×982`）预设，或输入自定义宽高。
4. 点击「预览并保存截图」。
5. 继续在当前页面检查设计；完成后重新打开面板，点击「退出预览并恢复」。

截图文件名示例：

```text
viewport-1920x1080-100pct-retina-2026-07-22T01-02-03-456Z.png
```

## 尺寸口径

插件把三个容易混淆的尺寸分开处理：

- **页面视口**：输入 `1920×1080` 后，页面读取到的 `window.innerWidth × window.innerHeight` 就是 `1920×1080`。
- **页面缩放**：始终保持 Chrome 网页缩放为 `100%`，页面的媒体查询、布局断点和元素 CSS 尺寸不会因适屏而改变。
- **预览比例**：按 `min(可用宽度 / 目标宽度, 可用高度 / 目标高度, 100%)` 自动计算，只影响屏幕上看到的预览大小。
- **截图像素**：固定使用 DPR 2；`1920×1080` 视口保存为 `3840×2160` PNG。

例如当前 Chrome 内容区最多只有 `1728×1000`，输入 `1920×1080` 时预览比例会取 `90%`。页面仍认为自己处于 `1920×1080 / 100%`，保存的截图仍是 `3840×2160`；只是整个页面被等比缩小后显示在当前屏幕里。

## 行为与限制

- 开始预览时会把当前 Chrome 窗口最大化，以取得尽可能大的设计检查区域。
- 截图完成后会保留预览，方便继续检查页面交互；「退出预览」会恢复进入前的窗口状态和网页缩放。
- 同一时间只保留一个预览。切换到另一个标签页重新预览时，会先恢复上一个页面。
- Chrome 内置页、Chrome Web Store、扩展页面及其他受保护页面不支持模拟或截图。
- DevTools 和插件不能同时调试同一个标签页；如果已经打开 DevTools，请先关闭再操作。
- 预览期间 Chrome 会显示“正在调试此浏览器”的提示，这是 Debugger API 的正常安全提示。
- 目标视口支持宽 `400–3840`、高 `300–2160`；极端大于当前可用区域的尺寸可能无法生成可靠预览。

实现依据：[Chrome DevTools Device Mode](https://developer.chrome.com/docs/devtools/device-mode)、[Chrome Debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger)、[CDP Emulation](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/) 与 [CDP Page.captureScreenshot](https://chromedevtools.github.io/devtools-protocol/1-3/Page/#method-captureScreenshot)。

## 本地检查

```bash
npm test
npm run check
npm run package:release
```
