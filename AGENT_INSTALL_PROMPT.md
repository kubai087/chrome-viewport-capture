# 给 Agent 的安装提示词

复制下面整段发给你的 Agent，即可让它协助安装或更新「视口截图」Chrome 扩展：

```text
请帮我安装或更新「视口截图」Chrome 扩展，官方仓库是：
https://github.com/kubai087/chrome-viewport-capture

请严格按以下步骤执行：

1. 从公开 GitHub Release 下载最新安装包和校验文件：
   - https://github.com/kubai087/chrome-viewport-capture/releases/latest/download/chrome-viewport-capture.zip
   - https://github.com/kubai087/chrome-viewport-capture/releases/latest/download/chrome-viewport-capture.zip.sha256
2. 在临时目录使用 SHA-256 校验安装包；如果校验失败，立即停止，不要安装。
3. 将 ZIP 解压到不会被系统自动清理的固定目录：
   - macOS / Linux：~/Applications/ChromeExtensions/chrome-viewport-capture
   - Windows：%LOCALAPPDATA%\ChromeExtensions\chrome-viewport-capture
   如果旧版本已经存在，先移动到带时间戳的备份目录，再把新版本放回同一个固定路径；不要删除其他扩展或用户数据。
4. 读取解压后 manifest.json，确认扩展名称为「视口截图」，并记录版本号。
5. 打开 chrome://extensions/，开启「开发者模式」，选择「加载已解压的扩展程序」，加载上述固定目录，然后把扩展固定到工具栏。若浏览器限制导致 Agent 无法完成最后的系统文件选择，请停在该页面，并只告诉我需要点击的按钮和应选择的准确目录。
6. 安装时 Chrome 会提示扩展可以访问页面调试程序后端、读取和更改网站数据并管理下载。这是实现 DevTools/F12 同款视口模拟和本地截图所需的权限；扩展不会上传页面或截图。
7. 在一个普通 HTTPS 网页上做一次验证：打开扩展，选择任意预设，确认能显示预览状态并保存 PNG；随后点击「退出预览并恢复」。不要在 Chrome 内置页、Chrome Web Store 或已经打开 DevTools 的标签页测试。
8. 最后向我报告：安装目录、manifest 版本、SHA-256 校验结果、Chrome 是否成功加载，以及截图与恢复测试结果。除此之外不要修改任何浏览器设置或其他扩展。
```

## 手动安装说明

如果不使用 Agent，请参照项目 [README](./README.md) 的 Release 安装步骤。
