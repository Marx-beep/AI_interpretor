const storageKey = "interpreting-console-config";

const state = {
  uploadedFile: null,
  audioTranscript: "",
  liveTranscript: "",
  recognition: null,
  isRecognizing: false,
  timerId: null,
  recordingSeconds: 0,
};

const el = {
  apiBase: document.getElementById("apiBase"),
  apiKey: document.getElementById("apiKey"),
  transcriptionModel: document.getElementById("transcriptionModel"),
  chatModel: document.getElementById("chatModel"),
  saveConfigBtn: document.getElementById("saveConfigBtn"),
  configStatus: document.getElementById("configStatus"),
  audioFileInput: document.getElementById("audioFileInput"),
  audioPlayer: document.getElementById("audioPlayer"),
  uploadStatus: document.getElementById("uploadStatus"),
  transcribeAudioBtn: document.getElementById("transcribeAudioBtn"),
  translateAudioBtn: document.getElementById("translateAudioBtn"),
  audioTranscript: document.getElementById("audioTranscript"),
  audioWordCount: document.getElementById("audioWordCount"),
  startMicBtn: document.getElementById("startMicBtn"),
  stopMicBtn: document.getElementById("stopMicBtn"),
  clearMicBtn: document.getElementById("clearMicBtn"),
  micStatus: document.getElementById("micStatus"),
  liveTranscript: document.getElementById("liveTranscript"),
  liveWordCount: document.getElementById("liveWordCount"),
  translatedChinese: document.getElementById("translatedChinese"),
  translationStatus: document.getElementById("translationStatus"),
  summaryOutput: document.getElementById("summaryOutput"),
  differenceList: document.getElementById("differenceList"),
  compareScore: document.getElementById("compareScore"),
  audioTranscriptMirror: document.getElementById("audioTranscriptMirror"),
  liveTranscriptMirror: document.getElementById("liveTranscriptMirror"),
  runCompareBtn: document.getElementById("runCompareBtn"),
  recordingTimer: document.getElementById("recordingTimer"),
};

function loadConfig() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) {
    el.apiBase.value = "https://api.openai.com/v1";
    el.transcriptionModel.value = "whisper-1";
    el.chatModel.value = "gpt-4o-mini";
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    el.apiBase.value = parsed.apiBase || "https://api.openai.com/v1";
    el.apiKey.value = parsed.apiKey || "";
    el.transcriptionModel.value = parsed.transcriptionModel || "whisper-1";
    el.chatModel.value = parsed.chatModel || "gpt-4o-mini";
    el.configStatus.textContent = "已加载本地配置";
  } catch {
    el.configStatus.textContent = "配置读取失败";
  }
}

function saveConfig() {
  const payload = {
    apiBase: el.apiBase.value.trim(),
    apiKey: el.apiKey.value.trim(),
    transcriptionModel: el.transcriptionModel.value.trim(),
    chatModel: el.chatModel.value.trim(),
  };
  localStorage.setItem(storageKey, JSON.stringify(payload));
  el.configStatus.textContent = "已保存到浏览器本地";
}

function wordCount(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function setTextMetrics() {
  el.audioWordCount.textContent = `${wordCount(el.audioTranscript.value)} words`;
  el.liveWordCount.textContent = `${wordCount(el.liveTranscript.value)} words`;
  el.audioTranscriptMirror.textContent = el.audioTranscript.value || "暂无内容";
  el.liveTranscriptMirror.textContent = el.liveTranscript.value || "暂无内容";
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function startTimer() {
  stopTimer();
  state.timerId = window.setInterval(() => {
    state.recordingSeconds += 1;
    el.recordingTimer.textContent = formatTime(state.recordingSeconds);
  }, 1000);
}

function stopTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function updateComparison() {
  const left = normalizeText(el.audioTranscript.value);
  const right = normalizeText(el.liveTranscript.value);

  if (!left && !right) {
    el.compareScore.textContent = "相似度 --";
    el.differenceList.textContent = "等待两侧文本生成后自动对比。";
    return;
  }

  const leftWords = new Set(left.split(" ").filter(Boolean));
  const rightWords = new Set(right.split(" ").filter(Boolean));
  const intersection = [...leftWords].filter((word) => rightWords.has(word));
  const union = new Set([...leftWords, ...rightWords]);
  const score = union.size ? Math.round((intersection.length / union.size) * 100) : 0;

  const missed = [...leftWords].filter((word) => !rightWords.has(word)).slice(0, 12);
  const extra = [...rightWords].filter((word) => !leftWords.has(word)).slice(0, 12);

  el.compareScore.textContent = `相似度 ${score}%`;
  el.differenceList.textContent = [
    missed.length ? `实时录入可能遗漏: ${missed.join(", ")}` : "实时录入未发现明显遗漏。",
    extra.length ? `实时录入新增表达: ${extra.join(", ")}` : "实时录入未发现明显新增。",
  ].join("\n\n");
}

function normalizeText(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

async function callDesktopTranscribe(payload) {
  if (window.desktopBridge?.transcribeAudio) {
    return window.desktopBridge.transcribeAudio(payload);
  }
  if (window.pywebview?.api?.transcribe_audio) {
    return window.pywebview.api.transcribe_audio(payload);
  }
  return null;
}

async function callDesktopTranslate(payload) {
  if (window.desktopBridge?.translateAndSummarize) {
    return window.desktopBridge.translateAndSummarize(payload);
  }
  if (window.pywebview?.api?.translate_and_summarize) {
    return window.pywebview.api.translate_and_summarize(payload);
  }
  return null;
}

function isLocalDesktopServer() {
  return ["127.0.0.1", "localhost"].includes(window.location.hostname);
}

async function transcribeUploadedAudio() {
  if (!state.uploadedFile) {
    el.uploadStatus.textContent = "请先上传音频";
    return;
  }

  const apiKey = el.apiKey.value.trim();
  const apiBase = el.apiBase.value.trim();
  const model = el.transcriptionModel.value.trim();

  if (!apiKey || !apiBase || !model) {
    el.uploadStatus.textContent = "请先填写 API 配置";
    return;
  }

  el.uploadStatus.textContent = "转写中...";

  try {
    let result = null;
    if (window.desktopBridge?.transcribeAudio || window.pywebview?.api?.transcribe_audio) {
      const arrayBuffer = await state.uploadedFile.arrayBuffer();
      result = await callDesktopTranscribe({
        apiBase,
        apiKey,
        model,
        fileName: state.uploadedFile.name,
        mimeType: state.uploadedFile.type,
        bytes: Array.from(new Uint8Array(arrayBuffer)),
      });
    } else if (isLocalDesktopServer()) {
      const arrayBuffer = await state.uploadedFile.arrayBuffer();
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiBase,
          apiKey,
          model,
          fileName: state.uploadedFile.name,
          mimeType: state.uploadedFile.type,
          bytes: Array.from(new Uint8Array(arrayBuffer)),
        }),
      });

      if (!response.ok) {
        throw new Error(`转写失败：${response.status}`);
      }

      result = await response.json();
    } else {
      const formData = new FormData();
      formData.append("file", state.uploadedFile);
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

      result = await response.json();
    }
    el.audioTranscript.value = result.text || "";
    state.audioTranscript = el.audioTranscript.value;
    el.uploadStatus.textContent = "转写完成";
    setTextMetrics();
    updateComparison();
  } catch (error) {
    el.uploadStatus.textContent = error.message;
  }
}

async function translateAndSummarize() {
  const sourceText = [el.audioTranscript.value.trim(), el.liveTranscript.value.trim()].filter(Boolean).join("\n\n---\n\n");
  const apiKey = el.apiKey.value.trim();
  const apiBase = el.apiBase.value.trim();
  const model = el.chatModel.value.trim();

  if (!sourceText) {
    el.translationStatus.textContent = "缺少英文文本";
    return;
  }

  if (!apiKey || !apiBase || !model) {
    el.translationStatus.textContent = "请先填写 API 配置";
    return;
  }

  el.translationStatus.textContent = "生成中...";
  el.summaryOutput.textContent = "正在整理要点...";

  const prompt = `You are assisting a simultaneous interpreting practice dashboard.\nTranslate the English content into natural Chinese.\nThen provide a concise Chinese summary with 3 bullet points.\nReturn strict JSON with keys translation and summary. summary must be an array of strings.\nEnglish content:\n${sourceText}`;

  try {
    let result = null;
    if (window.desktopBridge?.translateAndSummarize || window.pywebview?.api?.translate_and_summarize) {
      result = await callDesktopTranslate({
        apiBase,
        apiKey,
        model,
        sourceText,
      });
    } else if (isLocalDesktopServer()) {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiBase,
          apiKey,
          model,
          sourceText,
        }),
      });

      if (!response.ok) {
        throw new Error(`翻译失败：${response.status}`);
      }

      result = await response.json();
    } else {
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

      result = await response.json();
    }
    const content = result.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    el.translatedChinese.value = parsed.translation || "";
    el.summaryOutput.textContent = Array.isArray(parsed.summary) ? parsed.summary.map((item, index) => `${index + 1}. ${item}`).join("\n") : "未返回摘要。";
    el.translationStatus.textContent = "已完成";
  } catch (error) {
    el.translationStatus.textContent = error.message;
    el.summaryOutput.textContent = "生成失败，请检查模型配置或网络连接。";
  }
}

function setupRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    el.micStatus.textContent = "当前浏览器不支持语音识别";
    el.startMicBtn.disabled = true;
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    state.isRecognizing = true;
    el.micStatus.textContent = "麦克风录入中";
    el.micStatus.classList.remove("muted");
    startTimer();
  };

  recognition.onend = () => {
    state.isRecognizing = false;
    stopTimer();
    if (el.micStatus.textContent === "麦克风录入中") {
      el.micStatus.textContent = "麦克风已停止";
      el.micStatus.classList.add("muted");
    }
  };

  recognition.onerror = (event) => {
    state.isRecognizing = false;
    el.micStatus.textContent = `识别异常: ${event.error}`;
    el.micStatus.classList.add("muted");
  };

  recognition.onresult = (event) => {
    let finalTranscript = "";
    let interimTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + " ";
      } else {
        interimTranscript += transcript + " ";
      }
    }

    const base = el.liveTranscript.dataset.finalText || "";
    if (finalTranscript) {
      el.liveTranscript.dataset.finalText = `${base}${finalTranscript}`;
    }
    el.liveTranscript.value = `${el.liveTranscript.dataset.finalText || ""}${interimTranscript}`.trim();
    state.liveTranscript = el.liveTranscript.value;
    setTextMetrics();
    updateComparison();
  };

  state.recognition = recognition;
}

function handleFileSelect(file) {
  if (!file) {
    return;
  }

  state.uploadedFile = file;
  const objectUrl = URL.createObjectURL(file);
  el.audioPlayer.src = objectUrl;
  el.uploadStatus.textContent = `${file.name} 已就绪`;
}

function setupDropzone() {
  const dropzone = document.querySelector(".upload-dropzone");
  const activeClass = "is-dragover";

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add(activeClass);
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove(activeClass);
    });
  });

  dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    handleFileSelect(file);
  });
}

el.saveConfigBtn.addEventListener("click", saveConfig);
el.audioFileInput.addEventListener("change", (event) => handleFileSelect(event.target.files?.[0]));
el.transcribeAudioBtn.addEventListener("click", transcribeUploadedAudio);
el.translateAudioBtn.addEventListener("click", translateAndSummarize);
el.runCompareBtn.addEventListener("click", updateComparison);

el.startMicBtn.addEventListener("click", () => {
  if (!state.recognition || state.isRecognizing) {
    return;
  }
  state.recordingSeconds = 0;
  el.recordingTimer.textContent = "00:00";
  try {
    state.recognition.start();
  } catch (error) {
    el.micStatus.textContent = `启动失败: ${error.message}`;
    el.micStatus.classList.add("muted");
  }
});

el.stopMicBtn.addEventListener("click", () => {
  state.recognition?.stop();
  stopTimer();
  el.micStatus.textContent = "麦克风已停止";
  el.micStatus.classList.add("muted");
});

el.clearMicBtn.addEventListener("click", () => {
  el.liveTranscript.value = "";
  el.liveTranscript.dataset.finalText = "";
  state.liveTranscript = "";
  state.recordingSeconds = 0;
  el.recordingTimer.textContent = "00:00";
  setTextMetrics();
  updateComparison();
});

el.audioTranscript.addEventListener("input", () => {
  state.audioTranscript = el.audioTranscript.value;
  setTextMetrics();
  updateComparison();
});

el.liveTranscript.addEventListener("input", () => {
  state.liveTranscript = el.liveTranscript.value;
  setTextMetrics();
  updateComparison();
});

loadConfig();
setupRecognition();
setupDropzone();
setTextMetrics();
updateComparison();
