const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");

const LOCAL_ASR_TIMEOUT_MS = 180_000;
const API_TIMEOUT_MS = 45_000;

async function fetchWithTimeout(url, options, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)} 秒），请检查网络后重试`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

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

<<<<<<< Updated upstream
=======
function runPythonLocalAsr(inputPath, languageHint = "") {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "local_asr.py");
    const args = ["-X", "utf8", scriptPath, inputPath];
    if (languageHint === "zh" || languageHint === "en") {
      args.push(languageHint);
    }
    const child = spawn("python", args, {
      windowsHide: true,
      cwd: __dirname,
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        HF_HUB_DISABLE_XET: "1",
      },
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      reject(new Error("本地转写超过 180 秒，已自动终止。请缩短音频或检查本地 Whisper 模型"));
    }, LOCAL_ASR_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      reject(new Error(`无法启动本地转写：${err.message}`));
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `local_asr.py exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function transcribeWithLocalAsr({ fileName, bytes, mimeType, remoteError, languageHint }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-interpret-"));
  const safeName = fileName || "input-media";
  const ext = path.extname(safeName) || (mimeType?.includes("video") ? ".mp4" : ".wav");
  const tempPath = path.join(tempDir, `media${ext}`);

  try {
    fs.writeFileSync(tempPath, Buffer.from(bytes));
    const raw = await runPythonLocalAsr(tempPath, languageHint);
    const parsed = JSON.parse(raw);
    if (!parsed?.text) {
      throw new Error("local ASR returned empty text");
    }

    return {
      text: parsed.text,
      language: parsed.language || "",
      provider: "local-asr",
      engine: parsed.engine || "local-asr",
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

async function transcribeWithRetry({ apiBase, apiKey, model, fileName, mimeType, bytes, languageHint }) {
  const isDeepSeek = String(apiBase || "").toLowerCase().includes("api.deepseek.com")
    || String(model || "").toLowerCase().includes("deepseek");
  if (isDeepSeek) {
    return transcribeWithLocalAsr({
      fileName,
      bytes,
      mimeType,
      languageHint,
      remoteError: new Error("DeepSeek 不提供音频转写接口，已直接使用本机 Whisper"),
    });
  }

  const endpoint = `${apiBase.replace(/\/$/, "")}/audio/transcriptions`;
  const binary = Buffer.from(bytes);

  async function doRequest(responseFormat) {
    const file = new File([binary], fileName, { type: mimeType || "application/octet-stream" });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", model);
    formData.append("response_format", responseFormat);

    const response = await fetchWithTimeout(endpoint, {
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
    return transcribeWithLocalAsr({ fileName, bytes, mimeType, remoteError, languageHint });
  }
}

>>>>>>> Stashed changes
ipcMain.handle("transcribe-audio", async (_, payload) => {
  const { apiBase, apiKey, model, fileName, mimeType, bytes } = payload;
  const file = new File([Buffer.from(bytes)], fileName, { type: mimeType || "audio/mpeg" });
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", model);
  formData.append("language", "en");
  formData.append("response_format", "json");

  const response = await fetch(`${apiBase.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

<<<<<<< Updated upstream
  if (!response.ok) {
    throw new Error(`转写失败：${response.status}`);
=======
  try {
    const response = await fetchWithTimeout(`${apiBase.replace(/\/$/, "")}/chat/completions`, {
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
    throw new Error(`模型调用失败：${error.message}`);
>>>>>>> Stashed changes
  }

  return response.json();
});

ipcMain.handle("translate-and-summarize", async (_, payload) => {
  const { apiBase, apiKey, model, sourceText } = payload;
  const prompt = `You are assisting a simultaneous interpreting practice dashboard.\nTranslate the English content into natural Chinese.\nThen provide a concise Chinese summary with 3 bullet points.\nReturn strict JSON with keys translation and summary. summary must be an array of strings.\nEnglish content:\n${sourceText}`;

  const response = await fetch(`${apiBase.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return concise and accurate JSON only." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`翻译失败：${response.status}`);
  }

  return response.json();
});
