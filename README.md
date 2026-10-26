# 酒馆书屋 / ST Nook

Gloria · v2.0.3

[打开在线阅读器](https://gloria-yin.github.io/ST-nook/)

## 本地使用

下载 `index.html`，使用 Edge 打开即可。样式、脚本和图标已嵌入，阅读、编辑、批注和导出无需安装依赖，离线也能使用。

汇文明朝体、霞鹜文楷和霞鹜新致宋通过外部 CSS 按需加载，首次使用需要联网；离线时使用浏览器可用的字体缓存或系统字体。没有内嵌大型字体文件，HTML 小于 1 MB。

支持聊天记录导入、正则整理、文件排序与衔接预览、滚动与翻页阅读、文字编辑、批注、书摘长图、聊天日历和阅读记录。

书籍内容和统计缓存保存在当前浏览器中，不会写入 HTML 或上传到此仓库。正文字数与“爱你”次数会复用已保存的结果，正文变化后更新相应统计。可导出 TXT 小说或完整备份。

## 酒馆插件

独立插件位于 [ST-nook-extension](https://github.com/gloria-yin/ST-nook-extension)，此仓库只存放阅读器 HTML 和本说明。

插件支持链接版和文件版，可选择聊天、已开启的正则及角色头像。复制资料后在阅读器右上角点击“接收书籍”，也支持导出 `.stnook` 文件再导入。接收后进入“新建书籍”，供检查和编辑，再点击“生成书籍”保存。

链接版直接打开固定在线地址，沿用该网址的书架；文件版请回原 HTML 接收，沿用原文件的书架。聊天资料不写入 HTML 或网址。

插件的“打开方式”指浏览器，支持当前浏览器、通过系统协议打开已安装的 Microsoft Edge，或自行用其他浏览器打开。普通网页不能从酒馆直接打开 `file:///` 本地文件，也不能调出系统完整的浏览器选择窗口。

书籍保存在实际阅读器地址对应的浏览器数据中，不同浏览器和地址分别存储。旧版曾通过酒馆打开的书籍，可从旧书架导出完整备份后迁移。

## 字体

汇文明朝体、霞鹜文楷和霞鹜新致宋的来源及许可全文均已嵌入 `index.html`。

## 在终端更新 GitHub

在本地阅读器文件夹打开 PowerShell，修改完成后运行：

```powershell
git status
git add -- index.html README.md
git commit -m "Update ST Nook reader"
git push origin main
```

`git add` 只选这两个文件，不会上传提示词或原始图片。首次推送时若出现登录提示，按 Git Credential Manager 的提示登录 GitHub。

在线版由 GitHub Pages 发布。在仓库 Settings → Pages 中，选择 Deploy from a branch、`main` 分支、`/ (root)`，保存后等待部署完成。后续推送会自动更新 https://gloria-yin.github.io/ST-nook/ 。如果页面暂时还是旧版，可按 Ctrl+F5 刷新。

酒馆插件使用独立仓库。更新插件时，先进入它在 SillyTavern 的 `data/default-user/extensions/st-nook` 文件夹，再执行：

```powershell
git add -- manifest.json README.md extension
git commit -m "Update ST Nook extension"
git push origin main
```
