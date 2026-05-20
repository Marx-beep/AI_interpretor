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

  if (!response.ok) {
    throw new Error(`转写失败：${response.status}`);
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
