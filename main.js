const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");

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

  const is4oTranscribe = /gpt-4o(-mini)?-transcribe/i.test(model);
  if (is4oTranscribe) {
    return doRequest("json");
  }

  try {
    return await doRequest("verbose_json");
  } catch {
    return doRequest("json");
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
