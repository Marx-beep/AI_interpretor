const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopBridge", {
  transcribeAudio: (payload) => ipcRenderer.invoke("transcribe-audio", payload),
  chatCompletion: (payload) => ipcRenderer.invoke("chat-completion", payload),
  readLocalApiKey: () => ipcRenderer.invoke("read-local-api-key"),
});
