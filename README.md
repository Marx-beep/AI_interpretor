# AI 同声口译台

这是一个可直接运行的 Windows 桌面版口译工具，适合做同声传译训练和人机协作演示：

- 左侧上传英文音频并自动转写
- 中间进行实时英文语音录入
- 右侧对比原音频与录入文本，并生成中文翻译与摘要

## 桌面版成品

可直接分发的可执行文件在：

`dist/AI-Interpreting-Console.exe`

双击后程序会：

<<<<<<< Updated upstream
1. 启动本地服务
2. 自动打开默认浏览器中的口译界面
3. 弹出一个小控制面板窗口，方便重新打开页面或退出程序
=======
> 注意：不同供应商对 `/audio/transcriptions` 兼容程度不同。若转写报错，请切换到支持语音转写的模型或供应商。
>
> 已内置本地兜底：DeepSeek 等不支持媒体转写时，会自动尝试本机 Python ASR；`faster-whisper` 不可用时会继续切换到 OpenAI Whisper。

### DeepSeek 使用流程

DeepSeek API 只负责文本重述和翻译，不提供音频转写接口：

1. 供应商选择 `DeepSeek`，模型优先选择 `deepseek-v4-flash`
2. 填写 API Key 后先点击“测试 API”，确认显示“API 测试成功”
3. Panel A 上传音视频时，程序会先使用本机 Whisper 转写，再调用 DeepSeek 重述和翻译
4. 也可以直接粘贴“手动源语文本”；手动文本会优先于已上传的媒体
5. Panel B 首次使用需要允许麦克风权限；桌面版使用本地录音，停止后统一转写并自动评分

首次运行本地 Whisper 时需要下载约 75 MB 的模型，转写按钮可能等待较长时间；后续会复用本地缓存。

本地音频转写超过 180 秒会自动终止并显示错误；DeepSeek 文本请求超过 45 秒会显示超时错误，不会一直停留在处理中。
>>>>>>> Stashed changes

## 使用说明

1. 打开 `AI-Interpreting-Console.exe`
2. 在页面顶部填写 `API Base URL`、`API Key`、转写模型和对话模型，并点击“保存本地配置”
3. 左侧上传英文音频，点击“转写上传音频”
4. 中间点击“开始录入”，浏览器会尝试调用麦克风做英文识别
5. 点击“翻译与总结”，右侧会生成中文译文和摘要

## 分发建议

- 最简单的发送方式是直接发送 `dist/AI-Interpreting-Console.exe`
- 如果接收方电脑拦截未知程序，建议你把 `dist/AI-Interpreting-Console.exe` 压缩成 zip 再发送
- 若接收方缺少浏览器麦克风权限，需要在浏览器里手动允许麦克风访问

## 开发文件

- `index.html` 页面结构
- `styles.css` 页面样式
- `app.js` 前端交互逻辑
- `desktop.py` 桌面启动器与本地 API 代理

## 注意事项

- 实时语音识别依赖浏览器的 `SpeechRecognition / webkitSpeechRecognition`，推荐 Chrome 或 Edge
- 当前“对比”是轻量词级相似度分析，适合训练观察，不等同于专业 ASR 评测
- API Key 保存在本机浏览器本地存储中，发给别人时不会自动带上你的密钥
