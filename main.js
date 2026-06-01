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
