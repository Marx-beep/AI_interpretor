const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopBridge", {
  transcribeAudio: (payload) => ipcRenderer.invoke("transcribe-audio", payload),
  translateAndSummarize: (payload) => ipcRenderer.invoke("translate-and-summarize", payload),
});
