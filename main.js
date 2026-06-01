const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn } = require("node:child_process");

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#f5efe4",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function runPythonLocalAsr(inputPath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "local_asr.py");
    const child = spawn("python", ["-X", "utf8", scriptPath, inputPath], {
      windowsHide: true,
      cwd: __dirname,
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (err) => reject(err));

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `local_asr.py exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function transcribeWithLocalAsr({ fileName, bytes, mimeType, remoteError }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-interpret-"));
  const safeName = fileName || "input-media";
  const ext = path.extname(safeName) || (mimeType?.includes("video") ? ".mp4" : ".wav");
  const tempPath = path.join(tempDir, `media${ext}`);

  try {
    fs.writeFileSync(tempPath, Buffer.from(bytes));
    const raw = await runPythonLocalAsr(tempPath);
    const parsed = JSON.parse(raw);
    if (!parsed?.text) {
      throw new Error("local ASR returned empty text");
    }

    return {
      text: parsed.text,
      language: parsed.language || "",
      provider: "local-asr",
      fallbackReason: String(remoteError?.message || "remote transcription unsupported"),
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
}

async function transcribeWithRetry({ apiBase, apiKey, model, fileName, mimeType, bytes }) {
  const endpoint = `${apiBase.replace(/\/$/, "")}/audio/transcriptions`;
  const binary = Buffer.from(bytes);

  async function doRequest(responseFormat) {
    const file = new File([binary], fileName, { type: mimeType || "application/octet-stream" });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", model);
    formData.append("response_format", responseFormat);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`转写失败：${response.status} ${detail}`);
    }

    return responseFormat === "text" ? { text: await response.text() } : response.json();
  }

  try {
    const is4oTranscribe = /gpt-4o(-mini)?-transcribe/i.test(model);
    if (is4oTranscribe) {
      return await doRequest("json");
    }

    try {
      return await doRequest("verbose_json");
    } catch {
      return await doRequest("json");
    }
  } catch (remoteError) {
    return transcribeWithLocalAsr({ fileName, bytes, mimeType, remoteError });
  }
}

function inferLanguageFromText(text) {
  const input = String(text || "");
  const zhCount = (input.match(/[\u4e00-\u9fff]/g) || []).length;
  const enCount = (input.match(/[a-zA-Z]/g) || []).length;
  if (zhCount === 0 && enCount === 0) {
    return "unknown";
  }
  return zhCount >= enCount ? "zh" : "en";
}

function extractSourceTextFromPrompt(content) {
  const marker = "Source text:\n";
  const text = String(content || "");
  const index = text.lastIndexOf(marker);
  if (index >= 0) {
    return text.slice(index + marker.length).trim();
  }
  return text.trim();
}

function normalizeLocalRestatement(sourceText) {
  return String(sourceText || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildLocalChatFallback(messages, remoteError) {
  const fallbackReason = String(remoteError?.message || remoteError || "网络不可用");
  const userMessage = [...(messages || [])]
    .reverse()
    .find((item) => item?.role === "user" && typeof item?.content === "string");
  const prompt = userMessage?.content || "";
  const sourceText = extractSourceTextFromPrompt(prompt);

  let payload;
  if (prompt.includes("Rewrite the following source speech in the SAME language")) {
    const language = inferLanguageFromText(sourceText);
    payload = {
      language,
      restatement: normalizeLocalRestatement(sourceText),
      local_fallback: true,
      fallback_reason: fallbackReason,
    };
  } else if (prompt.includes("Translate the source text")) {
    const toChinese = prompt.includes("into natural Chinese");
    payload = {
      translation: toChinese
        ? `【本地模式】网络异常，已自动切换本地流程并不中断训练。当前无法调用在线翻译模型，先展示源语重述供你继续口译：\n${normalizeLocalRestatement(sourceText)}`
        : `[Local Mode] Network issue detected. Training continues without interruption. Online translation is unavailable, so source restatement is shown below:\n${normalizeLocalRestatement(sourceText)}`,
      tips: [
        "本地模式建议：先按意群短句口译，再逐步补全细节。",
        "优先保留数字、专有名词和逻辑连接词，保证信息骨架不丢失。",
        "网络恢复后可再次点击“生成机器译文”刷新标准答案。",
      ],
      local_fallback: true,
      fallback_reason: fallbackReason,
    };
  } else {
    payload = {
      message: "本地模式兜底成功，流程继续运行。",
      local_fallback: true,
      fallback_reason: fallbackReason,
    };
  }

  return {
    id: "local-fallback",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "local-fallback",
    localFallback: true,
    fallbackReason,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: JSON.stringify(payload),
        },
        finish_reason: "stop",
      },
    ],
  };
}

ipcMain.handle("transcribe-audio", async (_, payload) => {
  return transcribeWithRetry(payload);
});

ipcMain.handle("chat-completion", async (_, payload) => {
  const {
    apiBase,
    apiKey,
    model,
    messages,
    responseFormatJson = true,
    temperature = 0.2,
  } = payload;

  try {
    const response = await fetch(`${apiBase.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        response_format: responseFormatJson ? { type: "json_object" } : undefined,
        messages,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`文本生成失败：${response.status} ${detail}`);
    }

    return response.json();
  } catch (error) {
    return buildLocalChatFallback(messages, error);
  }
});

ipcMain.handle("read-local-api-key", async () => {
  try {
    const keyPath = path.join(__dirname, "api");
    if (!fs.existsSync(keyPath)) {
      return "";
    }
    return fs.readFileSync(keyPath, "utf8").trim();
  } catch {
    return "";
  }
});
