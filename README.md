# AI+口译（中英双向口译训练台）

这是一个基于 Electron 的桌面口译训练工具，支持上传音频/视频、源语重述、双向翻译、麦克风口译录入与自动评分。

## 当前能力

- 上传媒体：支持音频与视频文件（如 mp3/mp4/m4a/wav/webm）
- 源语重述：先做语音转写，再生成同语种重述（不翻译）
- 双向翻译：根据识别到的源语自动执行英译中或中译英
- 个人口译：麦克风实时录入口译文本
- 自动评分：将个人口译与机器标准译文进行相似度评分
- 防作弊模式：录音结束前隐藏标准答案与评分
- 转写兜底：当云端 `/audio/transcriptions` 不可用时，自动切换本地 `faster-whisper` 转写

## 模型与 API 配置（已更新）

配置区支持“供应商预设 + 统一模型 + 单一 API Key”：

- 供应商预设：`OpenAI` / `DeepSeek` / `阿里云百炼(DashScope)` / `OpenRouter` / `自定义`
- API Base URL：可自动填充，也可手动改
- API Key：全流程共用同一个 Key
- 统一模型：转写、源语重述、机器翻译全部使用同一个模型名

> 注意：不同供应商对 `/audio/transcriptions` 兼容程度不同。若转写报错，请切换到支持语音转写的模型或供应商。
>
> 已内置本地兜底：DeepSeek 等不支持媒体转写时，会自动尝试本机 Python ASR（首次会下载 `faster-whisper tiny` 模型）。

## 防作弊流程

开启“防作弊模式”后：

1. 可先上传并播放媒体
2. 可提前生成源语重述与机器译文（系统内部可用）
3. 录音结束前不显示标准答案与评分
4. 点击停止录音后，统一揭晓标准答案、差异与分数

## 一键启动

项目根目录提供双击启动脚本：

- `双击打开口译台.bat`

该脚本会自动进入项目目录并执行 `npm start`。

## 开发启动

```bash
npm install
npm start
```

首次使用本地兜底转写时，需要可用的 Python 环境（已自动调用 `pip install faster-whisper`）。

## 打包

```bash
npm run dist
```

打包产物默认在：

- `dist/AI-Interpreting-Console.exe`

## 项目结构

- `index.html`：界面结构
- `styles.css`：界面样式
- `app.js`：前端交互逻辑（上传、转写、翻译、评分、防作弊）
- `main.js`：Electron 主进程与 API 代理调用
- `preload.js`：渲染进程与主进程桥接
- `package.json`：依赖与脚本

## 评分逻辑（当前实现）

当前为轻量评分，用于训练反馈，不等同于专业评测：

- Token 集合相似度（Jaccard）
- 字符二元组相似度（Dice）
- 综合分数与遗漏/新增提示

## 已知限制

- 麦克风实时识别依赖浏览器 `SpeechRecognition / webkitSpeechRecognition`
- 不同浏览器/系统对中英文实时识别效果有差异
- 部分第三方 OpenAI 兼容网关可能仅支持文本模型，不支持音频转写

## 安全提示

- API Key 会保存在本地浏览器存储（仅当前机器可见）
- 推送代码前请确认未将敏感密钥写入源码或配置文件
