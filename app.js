const storageKey = "interpreting-console-config";
const dialogueTurnCount = 8;

const state = {
  uploadedFile: null,
  sourceLanguage: "unknown",
  targetLanguage: "unknown",
  sourceRestatement: "",
  sourceHints: "",
  machineTranslation: "",
  liveTranscript: "",
  liveDetectedLanguage: "unknown",
  hasRecordingStarted: false,
  hasRecordingCompleted: false,
  recognition: null,
  isRecognizing: false,
  timerId: null,
  timerTarget: null,
  recordingSeconds: 0,
  comparisonRefreshTimerId: null,
  translationTips: [],
  micStream: null,
  mediaRecorder: null,
  micChunks: [],
  micMode: "speech",
  activeMicSession: null,
  micDraft: {
    finalText: "",
    interimText: "",
    detectedLanguage: "unknown",
  },
  dialogue: {
    topic: "",
    turns: [],
    records: [],
    generatedTitle: "",
    phase: "idle",
    started: false,
    resultsVisible: false,
    referencesLoading: false,
    recordingStartPending: false,
    currentTurnIndex: -1,
    currentDraft: "",
    pendingFinish: false,
  },
};

const providerPresets = {
  openai: {
    name: "OpenAI",
    apiBase: "https://api.openai.com/v1",
    models: ["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"],
    hint: "官方推荐：语音转写可用 gpt-4o-mini-transcribe 或 whisper-1。",
  },
  deepseek: {
    name: "DeepSeek",
    apiBase: "https://api.deepseek.com",
    models: ["deepseek-v4-flash", "deepseek-chat", "deepseek-reasoner"],
    hint: "DeepSeek 走文本能力：音视频可播放，但建议手动粘贴源语文本后再生成重述。",
  },
  dashscope: {
    name: "阿里云百炼",
    apiBase: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-plus", "qwen-turbo", "qwen-max"],
    hint: "使用百炼 OpenAI 兼容模式；请在阿里云侧开通对应模型。",
  },
  openrouter: {
    name: "OpenRouter",
    apiBase: "https://openrouter.ai/api/v1",
    models: ["openai/gpt-4o-mini-transcribe", "deepseek/deepseek-chat"],
    hint: "OpenRouter 为聚合网关，模型可按账号权限使用。",
  },
  custom: {
    name: "自定义",
    apiBase: "",
    models: [],
    hint: "可手动填写 OpenAI 兼容网关 URL 与模型。",
  },
};

const el = {
  providerPreset: document.getElementById("providerPreset"),
  apiBase: document.getElementById("apiBase"),
  apiKey: document.getElementById("apiKey"),
  modelName: document.getElementById("modelName"),
  modelOptions: document.getElementById("modelOptions"),
  providerHint: document.getElementById("providerHint"),
  saveConfigBtn: document.getElementById("saveConfigBtn"),
  configStatus: document.getElementById("configStatus"),

  mediaFileInput: document.getElementById("mediaFileInput"),
  audioPlayer: document.getElementById("audioPlayer"),
  videoPlayer: document.getElementById("videoPlayer"),
  uploadStatus: document.getElementById("uploadStatus"),
  transcribeAudioBtn: document.getElementById("transcribeAudioBtn"),
  translateAudioBtn: document.getElementById("translateAudioBtn"),
  generateHintsMode: document.getElementById("generateHintsMode"),
  antiCheatMode: document.getElementById("antiCheatMode"),
  manualSourceText: document.getElementById("manualSourceText"),

  sourceLanguageLabel: document.getElementById("sourceLanguageLabel"),
  targetLanguageLabel: document.getElementById("targetLanguageLabel"),
  audioTranscript: document.getElementById("audioTranscript"),
  sourceHints: document.getElementById("sourceHints"),
  sourceHintsStatus: document.getElementById("sourceHintsStatus"),
  machineTranslation: document.getElementById("machineTranslation"),
  audioWordCount: document.getElementById("audioWordCount"),
  translationStatus: document.getElementById("translationStatus"),

  startMicBtn: document.getElementById("startMicBtn"),
  clearMicBtn: document.getElementById("clearMicBtn"),
  micInputLanguage: document.getElementById("micInputLanguage"),
  micStatus: document.getElementById("micStatus"),
  recordingTimer: document.getElementById("recordingTimer"),
  liveTranscript: document.getElementById("liveTranscript"),
  liveWordCount: document.getElementById("liveWordCount"),
  liveDetectedLanguage: document.getElementById("liveDetectedLanguage"),
  liveInterpretingNote: document.getElementById("liveInterpretingNote"),

  summaryOutput: document.getElementById("summaryOutput"),
  differenceList: document.getElementById("differenceList"),
  compareScore: document.getElementById("compareScore"),
  audioTranscriptMirror: document.getElementById("audioTranscriptMirror"),
  liveTranscriptMirror: document.getElementById("liveTranscriptMirror"),
  runCompareBtn: document.getElementById("runCompareBtn"),

  dialogueTopic: document.getElementById("dialogueTopic"),
  generateDialogueBtn: document.getElementById("generateDialogueBtn"),
  startDialogueBtn: document.getElementById("startDialogueBtn"),
  dialogueRecordBtn: document.getElementById("dialogueRecordBtn"),
  endDialogueBtn: document.getElementById("endDialogueBtn"),
  dialogueStatus: document.getElementById("dialogueStatus"),
  dialogueTask: document.getElementById("dialogueTask"),
  dialogueTimer: document.getElementById("dialogueTimer"),
  dialoguePrompt: document.getElementById("dialoguePrompt"),
  dialogueTimeline: document.getElementById("dialogueTimeline"),
};

function setStatusBadge(element, text, muted = false) {
  if (!element) {
    return;
  }
  element.textContent = text;
  element.classList.toggle("muted", muted);
}

function setSessionButtonRecordingState(button, isRecording, idleLabel, recordingLabel) {
  if (!button) {
    return;
  }
  button.classList.toggle("is-recording", isRecording);
  button.textContent = isRecording ? recordingLabel : idleLabel;
}

function setPanelBMicButtonRecordingState(isRecording) {
  setSessionButtonRecordingState(el.startMicBtn, isRecording, "开始录入", "录制中 · 点击停止");
}

function setDialogueMicButtonRecordingState(isRecording) {
  setSessionButtonRecordingState(el.dialogueRecordBtn, isRecording, "点击开始口译录入", "口译录音中 · 点击停止");
  el.dialogueRecordBtn?.classList.remove("is-processing");
}

function setDialogueMicButtonProcessingState(isProcessing) {
  if (!el.dialogueRecordBtn) {
    return;
  }
  el.dialogueRecordBtn.disabled = isProcessing;
  el.dialogueRecordBtn.classList.toggle("is-processing", isProcessing);
  if (isProcessing) {
    el.dialogueRecordBtn.classList.remove("is-recording");
    el.dialogueRecordBtn.textContent = "处理中...";
    return;
  }
  if (!state.activeMicSession || state.activeMicSession.kind !== "dialogue") {
    el.dialogueRecordBtn.textContent = "点击开始口译录入";
  }
}

function setMicMode(mode) {
  state.micMode = mode;
  if (mode === "local") {
    if (state.activeMicSession?.kind === "dialogue") {
      setStatusBadge(el.dialogueStatus, "本地录音兜底中", false);
    } else {
      setStatusBadge(el.micStatus, "本地录音模式（语音识别网络异常时兜底）", true);
    }
  }
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function startTimer(targetEl) {
  stopTimer();
  state.timerTarget = targetEl;
  if (state.timerTarget) {
    state.timerTarget.textContent = "00:00";
  }
  state.timerId = window.setInterval(() => {
    state.recordingSeconds += 1;
    if (state.timerTarget) {
      state.timerTarget.textContent = formatTime(state.recordingSeconds);
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
  state.timerTarget = null;
}

async function ensureMicStream() {
  if (state.micStream) {
    return state.micStream;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前环境不支持麦克风权限接口");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  state.micStream = stream;
  return stream;
}

function encodePcm16Wav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, text) {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channels = [];
  for (let channel = 0; channel < numChannels; channel += 1) {
    channels.push(audioBuffer.getChannelData(channel));
  }

  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

async function convertRecordingBlobToWav(blob) {
  if (!blob || blob.size === 0) {
    throw new Error("录音数据为空");
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("当前环境不支持音频解码，请改用手动文本输入");
  }
  const audioContext = new AudioContextCtor();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    return encodePcm16Wav(audioBuffer);
  } finally {
    await audioContext.close();
  }
}

function normalizeLanguageCode(rawCode) {
  if (!rawCode) {
    return "unknown";
  }
  const code = String(rawCode).toLowerCase();
  if (code.startsWith("zh")) {
    return "zh";
  }
  if (code.startsWith("en")) {
    return "en";
  }
  return "unknown";
}

function inferLanguageFromText(text) {
  if (!text) {
    return "unknown";
  }
  const zhCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const enCount = (text.match(/[a-zA-Z]/g) || []).length;
  if (zhCount === 0 && enCount === 0) {
    return "unknown";
  }
  return zhCount >= enCount ? "zh" : "en";
}

function languageLabel(code) {
  if (code === "zh") {
    return "中文";
  }
  if (code === "en") {
    return "English";
  }
  return "未识别";
}

function getTargetLanguage(sourceLanguage) {
  if (sourceLanguage === "en") {
    return "zh";
  }
  if (sourceLanguage === "zh") {
    return "en";
  }
  return "unknown";
}

function normalizeTranscriptText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function getApiConfig() {
  return {
    apiKey: el.apiKey.value.trim(),
    apiBase: el.apiBase.value.trim(),
    modelName: el.modelName.value.trim(),
  };
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

async function callDesktopChatCompletion(payload) {
  if (window.desktopBridge?.chatCompletion) {
    return window.desktopBridge.chatCompletion(payload);
  }
  if (window.pywebview?.api?.chat_completion) {
    return window.pywebview.api.chat_completion(payload);
  }
  return null;
}

async function loadApiKeyFromLocalFile() {
  if (!window.desktopBridge?.readLocalApiKey || el.apiKey.value.trim()) {
    return;
  }
  try {
    const key = await window.desktopBridge.readLocalApiKey();
    if (key) {
      el.apiKey.value = key;
      el.configStatus.textContent = "已从本地 api 文件读取 API Key";
    }
  } catch {
    // ignore local file read failures
  }
}

function parseMaybeJson(content) {
  if (typeof content === "object" && content !== null) {
    return content;
  }
  if (typeof content !== "string") {
    return null;
  }
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function requestChatJson({ apiBase, apiKey, model, messages }) {
  if (window.desktopBridge?.chatCompletion || window.pywebview?.api?.chat_completion) {
    const result = await callDesktopChatCompletion({
      apiBase,
      apiKey,
      model,
      messages,
      responseFormatJson: true,
      temperature: 0.2,
    });
    const content = result?.choices?.[0]?.message?.content || "{}";
    return parseMaybeJson(content) || {};
  }

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
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`文本模型调用失败：${response.status}`);
  }

  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content || "{}";
  return parseMaybeJson(content) || {};
}

async function transcribeMicBlob(blob) {
  const { apiKey, apiBase, modelName } = getApiConfig();

  if (!apiKey || !apiBase || !modelName) {
    throw new Error("请先填写 API 配置后再使用麦克风");
  }

  const wavBlob = await convertRecordingBlobToWav(blob);
  const arrayBuffer = await wavBlob.arrayBuffer();
  const result = await callDesktopTranscribe({
    apiBase,
    apiKey,
    model: modelName,
    fileName: "mic-input.wav",
    mimeType: "audio/wav",
    bytes: Array.from(new Uint8Array(arrayBuffer)),
  });

  const text = normalizeTranscriptText(result?.text || "");
  if (!text) {
    throw new Error("麦克风录音转写为空");
  }
  const normalizedLanguage = normalizeLanguageCode(result?.language);
  return {
    text,
    language: normalizedLanguage === "unknown" ? inferLanguageFromText(text) : normalizedLanguage,
  };
}

function finishMicSession(successPayload, errorMessage) {
  const session = state.activeMicSession;
  if (!session) {
    return;
  }

  stopTimer();
  state.isRecognizing = false;
  setPanelBMicButtonRecordingState(false);
  setDialogueMicButtonRecordingState(false);

  state.activeMicSession = null;
  state.micDraft = {
    finalText: "",
    interimText: "",
    detectedLanguage: "unknown",
  };

  if (errorMessage) {
    session.onError?.(errorMessage);
    return;
  }

  session.onComplete?.(successPayload);
}

async function startLocalMicRecording(session) {
  const stream = await ensureMicStream();
  const preferredType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";
  const recorder = new MediaRecorder(stream, { mimeType: preferredType });
  state.mediaRecorder = recorder;
  state.micChunks = [];

  recorder.onstart = () => {
    state.isRecognizing = true;
    session.onStart?.();
  };

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      state.micChunks.push(event.data);
    }
  };

  recorder.onerror = (event) => {
    finishMicSession(null, `录音异常: ${event.error?.name || "unknown"}`);
  };

  recorder.onstop = async () => {
    try {
      if (state.micChunks.length === 0) {
        throw new Error("未采集到录音数据，请检查麦克风权限");
      }
      const blob = new Blob(state.micChunks, { type: preferredType });
      const parsed = await transcribeMicBlob(blob);
      finishMicSession(parsed);
    } catch (error) {
      finishMicSession(null, `本地转写失败: ${error.message}`);
    }
  };

  recorder.start();
}

function stopCurrentMicCapture() {
  if (!state.activeMicSession) {
    return;
  }
  if (state.micMode === "local" || !state.recognition) {
    if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
      state.mediaRecorder.stop();
    }
    return;
  }
  state.recognition.stop();
}

function startMicCapture(session) {
  if (state.isRecognizing || state.activeMicSession) {
    return false;
  }

  state.activeMicSession = session;
  state.micDraft = {
    finalText: "",
    interimText: "",
    detectedLanguage: "unknown",
  };
  state.recordingSeconds = 0;
  if (session.timerEl) {
    session.timerEl.textContent = "00:00";
  }

  if (state.micMode === "local" || !state.recognition) {
    startLocalMicRecording(session).catch((error) => {
      finishMicSession(null, `启动失败: ${error.message}`);
    });
    return true;
  }

  try {
    state.recognition.lang = session.resolveRecognitionLang();
    state.recognition.start();
    return true;
  } catch (error) {
    finishMicSession(null, `启动失败: ${error.message}`);
    return false;
  }
}

function createPanelBMicSession() {
  return {
    kind: "panelB",
    timerEl: el.recordingTimer,
    resolveRecognitionLang() {
      const selected = el.micInputLanguage.value;
      if (selected === "zh") {
        return "zh-CN";
      }
      if (selected === "en") {
        return "en-US";
      }
      return state.targetLanguage === "zh" ? "zh-CN" : "en-US";
    },
    onStart() {
      state.hasRecordingStarted = true;
      setStatusBadge(el.micStatus, state.micMode === "local" ? "麦克风录音中（本地转写）" : "麦克风录入中", false);
      setPanelBMicButtonRecordingState(true);
      startTimer(el.recordingTimer);
      refreshOutputsAndComparison();
    },
    onInterim({ finalText, interimText, detectedLanguage }) {
      el.liveTranscript.dataset.finalText = finalText;
      el.liveTranscript.value = `${finalText}${interimText}`.trim();
      state.liveTranscript = el.liveTranscript.value;
      state.liveDetectedLanguage = detectedLanguage;
      refreshLanguagePanels();
      refreshOutputsAndComparison({ throttled: true });
    },
    onComplete({ text, language }) {
      state.hasRecordingCompleted = true;
      state.liveDetectedLanguage = language;
      el.liveTranscript.dataset.finalText = text;
      el.liveTranscript.value = text;
      state.liveTranscript = text;
      setStatusBadge(el.micStatus, state.micMode === "local" ? "麦克风已停止（本地转写完成）" : "麦克风已停止", true);
      refreshLanguagePanels();
      refreshOutputsAndComparison();
    },
    onError(message) {
      setStatusBadge(el.micStatus, message, true);
      refreshOutputsAndComparison();
    },
  };
}

function getDialogueCurrentRecord() {
  if (state.dialogue.currentTurnIndex < 0) {
    return null;
  }
  return state.dialogue.records[state.dialogue.currentTurnIndex] || null;
}

function updateDialogueRecord(record, patch) {
  if (!record) {
    return;
  }
  Object.assign(record, patch);
}

function createDialogueMicSession() {
  return {
    kind: "dialogue",
    timerEl: el.dialogueTimer,
    resolveRecognitionLang() {
      const record = getDialogueCurrentRecord();
      return record?.targetLanguage === "zh" ? "zh-CN" : "en-US";
    },
    onStart() {
      state.dialogue.recordingStartPending = false;
      state.dialogue.phase = "recording";
      state.dialogue.currentDraft = "";
      setDialogueMicButtonRecordingState(true);
      renderDialogueState();
      startTimer(el.dialogueTimer);
    },
    onInterim({ fullText }) {
      state.dialogue.currentDraft = fullText;
      renderDialogueState();
    },
    onComplete({ text, language }) {
      state.dialogue.recordingStartPending = false;
      const record = getDialogueCurrentRecord();
      updateDialogueRecord(record, {
        userTranscript: text,
        userDetectedLanguage: language,
      });
      state.dialogue.currentDraft = "";
      setDialogueMicButtonRecordingState(false);

      if (state.dialogue.pendingFinish) {
        finishDialogueTraining();
        return;
      }

      playDialogueTurn(state.dialogue.currentTurnIndex + 1);
    },
    onError(message) {
      state.dialogue.recordingStartPending = false;
      state.dialogue.phase = "awaiting";
      state.dialogue.currentDraft = "";
      setDialogueMicButtonRecordingState(false);
      setStatusBadge(el.dialogueStatus, message, true);
      renderDialogueState();
    },
  };
}

function refreshProviderModelOptions(providerKey) {
  const preset = providerPresets[providerKey] || providerPresets.custom;
  el.modelOptions.innerHTML = "";
  preset.models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    el.modelOptions.appendChild(option);
  });
  el.providerHint.textContent = preset.hint;
}

function applyProviderPreset(providerKey, { keepModel = false } = {}) {
  const preset = providerPresets[providerKey] || providerPresets.custom;
  if (preset.apiBase) {
    el.apiBase.value = preset.apiBase;
  }
  refreshProviderModelOptions(providerKey);
  if (!keepModel && preset.models.length > 0) {
    el.modelName.value = preset.models[0];
  }
}

function loadConfig() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) {
    el.providerPreset.value = "openai";
    el.apiBase.value = "https://api.openai.com/v1";
    el.modelName.value = "gpt-4o-mini-transcribe";
    refreshProviderModelOptions("openai");
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    el.providerPreset.value = parsed.providerPreset || "openai";
    el.apiBase.value = parsed.apiBase || "https://api.openai.com/v1";
    el.apiKey.value = parsed.apiKey || "";
    refreshProviderModelOptions(el.providerPreset.value);
    el.modelName.value = parsed.modelName || parsed.transcriptionModel || "gpt-4o-mini-transcribe";
    el.configStatus.textContent = "已加载本地配置";
  } catch {
    el.configStatus.textContent = "配置读取失败";
    el.providerPreset.value = "openai";
    el.apiBase.value = "https://api.openai.com/v1";
    el.modelName.value = "gpt-4o-mini-transcribe";
    refreshProviderModelOptions("openai");
  }
}

function saveConfig() {
  const payload = {
    providerPreset: el.providerPreset.value,
    apiBase: el.apiBase.value.trim(),
    apiKey: el.apiKey.value.trim(),
    modelName: el.modelName.value.trim(),
  };
  localStorage.setItem(storageKey, JSON.stringify(payload));
  el.configStatus.textContent = "已保存到浏览器本地";
}

function isDeepSeekMode() {
  const apiBase = el.apiBase.value.trim().toLowerCase();
  const model = el.modelName.value.trim().toLowerCase();
  return apiBase.includes("api.deepseek.com") || model.includes("deepseek");
}

function tokenizeForScore(text, language) {
  const input = (text || "").trim();
  if (!input) {
    return [];
  }

  const lang = language === "unknown" ? inferLanguageFromText(input) : language;
  if (lang === "zh") {
    return input
      .replace(/[\s，。！？；：、“”‘’（）《》【】,.!?;:'"()\[\]{}]/g, "")
      .split("")
      .filter(Boolean);
  }

  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function uniqueTokens(tokens) {
  return [...new Set(tokens)];
}

function computeJaccardScore(aTokens, bTokens) {
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  if (!aSet.size && !bSet.size) {
    return 1;
  }
  const intersection = [...aSet].filter((token) => bSet.has(token)).length;
  const union = new Set([...aSet, ...bSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function bigrams(text) {
  const normalized = (text || "").replace(/\s+/g, "").toLowerCase();
  if (normalized.length < 2) {
    return normalized ? [normalized] : [];
  }
  const result = [];
  for (let i = 0; i < normalized.length - 1; i += 1) {
    result.push(normalized.slice(i, i + 2));
  }
  return result;
}

function computeDiceScore(aText, bText) {
  const a = bigrams(aText);
  const b = bigrams(bText);
  if (!a.length && !b.length) {
    return 1;
  }
  const countMap = new Map();
  a.forEach((item) => {
    countMap.set(item, (countMap.get(item) || 0) + 1);
  });

  let intersection = 0;
  b.forEach((item) => {
    const count = countMap.get(item) || 0;
    if (count > 0) {
      intersection += 1;
      countMap.set(item, count - 1);
    }
  });

  return (2 * intersection) / (a.length + b.length);
}

function countTokensForDisplay(text, language) {
  const tokens = tokenizeForScore(text, language);
  return tokens.length;
}

function shouldHideOutputs() {
  return Boolean(el.antiCheatMode.checked && !state.hasRecordingCompleted);
}

function refreshLanguagePanels() {
  el.sourceLanguageLabel.textContent = languageLabel(state.sourceLanguage);
  el.targetLanguageLabel.textContent = languageLabel(state.targetLanguage);
  el.liveDetectedLanguage.textContent = languageLabel(state.liveDetectedLanguage);
  el.liveDetectedLanguage.classList.toggle("muted", state.liveDetectedLanguage === "unknown");
}

function clearScheduledComparisonRefresh() {
  if (!state.comparisonRefreshTimerId) {
    return;
  }
  window.clearTimeout(state.comparisonRefreshTimerId);
  state.comparisonRefreshTimerId = null;
}

function scheduleComparisonRefresh() {
  clearScheduledComparisonRefresh();
  state.comparisonRefreshTimerId = window.setTimeout(() => {
    state.comparisonRefreshTimerId = null;
    updateComparison({ skipRender: true });
  }, 180);
}

function refreshOutputsAndComparison({ throttled = false } = {}) {
  renderProtectedOutputs();
  if (throttled) {
    scheduleComparisonRefresh();
    return;
  }
  clearScheduledComparisonRefresh();
  updateComparison({ skipRender: true });
}

function renderProtectedOutputs() {
  const hide = shouldHideOutputs();
  const sourceText = hide && state.sourceRestatement ? "防作弊模式：录音结束后显示源语重述。" : state.sourceRestatement;
  const machineText = hide && state.machineTranslation ? "防作弊模式：录音结束后显示机器标准译文。" : state.machineTranslation;

  el.audioTranscript.value = sourceText;
  el.sourceHints.value = state.sourceHints;
  el.machineTranslation.value = machineText;

  el.audioTranscriptMirror.textContent = machineText || "暂无内容";
  el.liveTranscriptMirror.textContent = el.liveTranscript.value || "暂无内容";

  const sourceTokens = hide
    ? countTokensForDisplay(state.sourceRestatement, state.sourceLanguage)
    : countTokensForDisplay(el.audioTranscript.value, state.sourceLanguage);
  el.audioWordCount.textContent = `${sourceTokens} tokens`;
  el.liveWordCount.textContent = `${countTokensForDisplay(el.liveTranscript.value, state.targetLanguage)} tokens`;

  if (hide && state.machineTranslation) {
    el.translationStatus.textContent = "已生成（防作弊模式暂不显示）";
  }
}

function updateComparison({ skipRender = false } = {}) {
  if (shouldHideOutputs()) {
    el.compareScore.textContent = "等待录音完成";
    el.differenceList.textContent = "防作弊模式开启：标准答案与评分将在你停止录音后自动揭晓。";
    el.summaryOutput.textContent = "请先完成录音，再查看对比与评分。";
    el.liveInterpretingNote.value = "防作弊模式开启：可先上传并播放媒体，系统会先生成答案但不显示；停止录音后统一展示。";
    return;
  }

  const reference = (state.machineTranslation || "").trim();
  const attempt = (el.liveTranscript.value || "").trim();

  if (!reference && !attempt) {
    el.compareScore.textContent = "相似度 --";
    el.differenceList.textContent = "等待机器标准译文与口译文本。";
    el.summaryOutput.textContent = "生成机器译文后可进行评分。";
    el.liveInterpretingNote.value = "暂无可评分内容。";
    return;
  }

  if (!reference) {
    el.compareScore.textContent = "相似度 --";
    el.differenceList.textContent = "缺少机器标准译文，请先点击“生成机器译文”。";
    el.summaryOutput.textContent = "标准答案未生成。";
    el.liveInterpretingNote.value = "请先生成机器标准译文，再进行评分。";
    return;
  }

  if (!attempt) {
    el.compareScore.textContent = "相似度 0%";
    el.differenceList.textContent = "尚未检测到个人口译文本。";
    el.summaryOutput.textContent = "请开始麦克风录入后再评分。";
    el.liveInterpretingNote.value = "请先录入口译文本。";
    return;
  }

  const language = state.targetLanguage === "unknown" ? inferLanguageFromText(reference) : state.targetLanguage;
  const refTokens = uniqueTokens(tokenizeForScore(reference, language));
  const attTokens = uniqueTokens(tokenizeForScore(attempt, language));
  const jaccard = computeJaccardScore(refTokens, attTokens);
  const dice = computeDiceScore(reference, attempt);
  const score = Math.round((jaccard * 0.55 + dice * 0.45) * 100);

  const refSet = new Set(refTokens);
  const attSet = new Set(attTokens);
  const missed = refTokens.filter((token) => !attSet.has(token)).slice(0, 15);
  const extra = attTokens.filter((token) => !refSet.has(token)).slice(0, 15);

  el.compareScore.textContent = `相似度 ${score}%`;
  el.differenceList.textContent = [
    missed.length ? `可能遗漏: ${missed.join(language === "zh" ? "" : ", ")}` : "未发现明显遗漏。",
    extra.length ? `可能新增: ${extra.join(language === "zh" ? "" : ", ")}` : "未发现明显新增。",
  ].join("\n\n");

  const level = score >= 85
    ? "优秀：语义覆盖度高，继续保持语气与节奏稳定。"
    : score >= 65
      ? "良好：核心信息基本到位，建议减少遗漏并提升术语一致性。"
      : "需加强：建议先做短句分段口译，再逐步提高完整度。";

  const tips = state.translationTips.length
    ? `\n\n机器建议:\n${state.translationTips.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
    : "";

  el.summaryOutput.textContent = level;
  el.liveInterpretingNote.value = `当前评分: ${score}%\n${level}${tips}`;

  if (!skipRender) {
    renderProtectedOutputs();
  }
}

function resetOutputForNewMedia() {
  state.sourceLanguage = "unknown";
  state.targetLanguage = "unknown";
  state.sourceRestatement = "";
  state.sourceHints = "";
  state.machineTranslation = "";
  state.translationTips = [];
  state.hasRecordingStarted = false;
  state.hasRecordingCompleted = false;

  el.audioTranscript.value = "";
  el.sourceHints.value = "";
  el.machineTranslation.value = "";
  el.audioTranscriptMirror.textContent = "暂无内容";
  el.targetLanguageLabel.textContent = "未生成";
  el.sourceHintsStatus.textContent = "未生成";
  el.translationStatus.textContent = "待生成";
  el.summaryOutput.textContent = "等待评分完成。";
  el.differenceList.textContent = "等待录音结束后自动对比。";
  el.compareScore.textContent = "相似度 --";
  refreshLanguagePanels();
}

function resetDialogueState({ keepScript = true } = {}) {
  if (!keepScript) {
    state.dialogue.turns = [];
    state.dialogue.generatedTitle = "";
  }
  state.dialogue.records = state.dialogue.turns.map((turn, index) => ({
    index,
    speaker: turn.speaker,
    sourceLanguage: turn.language,
    sourceText: turn.text,
    targetLanguage: turn.language === "zh" ? "en" : "zh",
    userTranscript: "",
    userDetectedLanguage: "unknown",
    referenceTranslation: "",
  }));
  state.dialogue.phase = state.dialogue.turns.length ? "ready" : "idle";
  state.dialogue.started = false;
  state.dialogue.resultsVisible = false;
  state.dialogue.referencesLoading = false;
  state.dialogue.currentTurnIndex = -1;
  state.dialogue.currentDraft = "";
  state.dialogue.pendingFinish = false;
  if (el.dialogueTimer) {
    el.dialogueTimer.textContent = "00:00";
  }
  setDialogueMicButtonRecordingState(false);
}

function createDialogueBubbleRow({ side, avatarText, avatarClass, meta, text, bubbleClass }) {
  const row = document.createElement("div");
  row.className = `dialogue-row ${side}`;

  const avatar = document.createElement("div");
  avatar.className = `dialogue-avatar ${avatarClass}`;
  avatar.textContent = avatarText;

  const wrap = document.createElement("div");
  wrap.className = "dialogue-bubble-wrap";

  const metaEl = document.createElement("div");
  metaEl.className = "dialogue-meta";
  metaEl.textContent = meta;

  const bubble = document.createElement("div");
  bubble.className = `dialogue-bubble ${bubbleClass}`;
  bubble.textContent = text;

  wrap.append(metaEl, bubble);

  if (side === "right") {
    row.append(wrap, avatar);
  } else {
    row.append(avatar, wrap);
  }

  return row;
}

function createDialogueSystemBubble(text, extraClass = "") {
  const bubble = document.createElement("div");
  bubble.className = `dialogue-bubble system ${extraClass}`.trim();
  bubble.textContent = text;
  return bubble;
}

function renderDialogueTimeline() {
  const timeline = el.dialogueTimeline;
  if (!timeline) {
    return;
  }

  timeline.innerHTML = "";

  const header = document.createElement("div");
  header.className = "dialogue-divider";
  header.textContent = state.dialogue.generatedTitle || state.dialogue.topic || "对话训练";
  timeline.appendChild(header);

  if (!state.dialogue.turns.length) {
    timeline.appendChild(createDialogueSystemBubble("输入主题后先生成脚本。这里会变成一个可滚动的对话窗口，训练结束后再统一揭晓角色原文和你的口译转写。", "placeholder"));
    timeline.scrollTop = timeline.scrollHeight;
    return;
  }

  if (!state.dialogue.resultsVisible) {
    const intro = state.dialogue.started
      ? "训练进行中：你现在只会看到进度提示和录音状态，角色 A / B 的原文会在结束训练后统一显示。"
      : "脚本已生成。点击“开始训练”后，系统会按 A 中文、B 英文的顺序播报。";
    timeline.appendChild(createDialogueSystemBubble(intro));

    state.dialogue.records.forEach((record, index) => {
      const turnNo = index + 1;
      const isCurrent = index === state.dialogue.currentTurnIndex;
      const hasTranscript = Boolean(record.userTranscript);

      let sourceStatus = `第 ${turnNo} 轮：角色 ${record.speaker} 的原文暂不显示`;
      if (hasTranscript) {
        sourceStatus = `第 ${turnNo} 轮：角色 ${record.speaker} 已完成播报`;
      } else if (isCurrent && state.dialogue.phase === "speaking") {
        sourceStatus = `第 ${turnNo} 轮：角色 ${record.speaker} 正在语音发言`;
      } else if (isCurrent && (state.dialogue.phase === "awaiting" || state.dialogue.phase === "recording")) {
        sourceStatus = `第 ${turnNo} 轮：角色 ${record.speaker} 已发言，等待你的${record.targetLanguage === "zh" ? "中文" : "英文"}口译`;
      } else if (state.dialogue.phase === "readyToFinish") {
        sourceStatus = `第 ${turnNo} 轮：语音部分已结束，等待统一揭晓`;
      }

      timeline.appendChild(createDialogueBubbleRow({
        side: "left",
        avatarText: record.speaker,
        avatarClass: record.speaker === "A" ? "a" : "b",
        meta: `角色 ${record.speaker} · ${record.sourceLanguage === "zh" ? "中文" : "English"}`,
        text: sourceStatus,
        bubbleClass: hasTranscript || isCurrent ? "source" : "source placeholder",
      }));

      let userStatus = "你的口译转写将在结束训练后显示";
      if (hasTranscript) {
        userStatus = `本轮${record.targetLanguage === "zh" ? "中文" : "英文"}口译已记录`;
      } else if (isCurrent && state.dialogue.phase === "recording") {
        userStatus = state.dialogue.currentDraft
          ? "正在转写你的口译，结束训练后统一展示"
          : "正在录音，请完成本轮口译后停止录音";
      } else if (isCurrent && state.dialogue.phase === "awaiting") {
        userStatus = `请开始本轮${record.targetLanguage === "zh" ? "中文" : "英文"}口译`;
      }

      timeline.appendChild(createDialogueBubbleRow({
        side: "right",
        avatarText: "译",
        avatarClass: "you",
        meta: `你 · ${record.targetLanguage === "zh" ? "中文口译" : "English Interpreting"}`,
        text: userStatus,
        bubbleClass: hasTranscript ? "user" : "user placeholder",
      }));
    });
  } else {
    timeline.appendChild(createDialogueSystemBubble("训练已结束，以下是本轮完整对话和你的口译转写。"));

    state.dialogue.records.forEach((record, index) => {
      timeline.appendChild(createDialogueBubbleRow({
        side: "left",
        avatarText: record.speaker,
        avatarClass: record.speaker === "A" ? "a" : "b",
        meta: `第 ${index + 1} 轮 · 角色 ${record.speaker} · ${record.sourceLanguage === "zh" ? "中文" : "English"}`,
        text: record.sourceText,
        bubbleClass: "source",
      }));

      timeline.appendChild(createDialogueBubbleRow({
        side: "right",
        avatarText: "译",
        avatarClass: "you",
        meta: `你 · ${record.targetLanguage === "zh" ? "中文口译" : "English Interpreting"}`,
        text: record.userTranscript || "未录入",
        bubbleClass: record.userTranscript ? "user" : "user placeholder",
      }));

      timeline.appendChild(createDialogueBubbleRow({
        side: "right",
        avatarText: "参",
        avatarClass: "you",
        meta: `参考口译 · ${record.speaker === "A" ? "英文自然口译" : "中文自然口译"}`,
        text: state.dialogue.referencesLoading
          ? "正在生成本轮参考口译..."
          : (record.referenceTranslation || "参考口译暂未生成"),
        bubbleClass: state.dialogue.referencesLoading || !record.referenceTranslation ? "user placeholder" : "user",
      }));
    });
  }

  timeline.scrollTop = timeline.scrollHeight;
}

function renderDialogueState() {
  const record = getDialogueCurrentRecord();
  const isSpeaking = state.dialogue.phase === "speaking";
  const isAwaiting = state.dialogue.phase === "awaiting";
  const isRecordingDialogue = state.activeMicSession?.kind === "dialogue";
  const isRecordingStartPending = state.dialogue.recordingStartPending;
  el.dialogueTopic.value = state.dialogue.topic;
  el.dialogueTask.textContent = record
    ? `请将${record.sourceLanguage === "zh" ? "中文" : "英文"}口译成${record.targetLanguage === "zh" ? "中文" : "英文"}`
    : "先生成对话脚本";

  if (state.dialogue.phase === "generating") {
    setStatusBadge(el.dialogueStatus, "生成对话中...", false);
    el.dialoguePrompt.textContent = "系统正在围绕主题生成 4 轮来回的双语对话，请稍候。";
  } else if (state.dialogue.phase === "ready") {
    setStatusBadge(el.dialogueStatus, "可开始训练", false);
    el.dialoguePrompt.textContent = state.dialogue.generatedTitle
      ? `已生成主题场景：${state.dialogue.generatedTitle}。点击“开始训练”后，将只播放角色语音，不显示文本。`
      : "点击“开始训练”进入角色 A / B 口译训练。";
  } else if (isSpeaking) {
    setStatusBadge(el.dialogueStatus, "角色发言中", false);
    el.dialoguePrompt.textContent = record
      ? `请先听角色 ${record.speaker} 的语音内容，系统不会显示原文。`
      : "角色发言中。";
  } else if (state.dialogue.phase === "readyToFinish") {
    setStatusBadge(el.dialogueStatus, "全部轮次完成", false);
    el.dialoguePrompt.textContent = "所有轮次已经完成。点击“结束训练”查看原文与转写。";
  } else if (isAwaiting) {
    setStatusBadge(el.dialogueStatus, "等待你的口译", false);
    el.dialoguePrompt.textContent = record
      ? `角色 ${record.speaker} 已发言，请点击“开始口译录入”，完成${record.targetLanguage === "zh" ? "中文" : "英文"}口译。`
      : "等待你的口译。";
  } else if (state.dialogue.phase === "recording") {
    setStatusBadge(el.dialogueStatus, "口译录音中", false);
    el.dialoguePrompt.textContent = state.dialogue.currentDraft
      ? "正在记录你的口译，文本已转写但会在结束训练后统一展示。"
      : "正在录音，请完成本轮口译后点击按钮停止。";
  } else if (state.dialogue.phase === "generatingReferences") {
    setStatusBadge(el.dialogueStatus, "生成参考口译中", false);
    el.dialoguePrompt.textContent = "训练已结束，系统正在为每一轮生成自然口译版参考答案。";
  } else if (state.dialogue.phase === "finished") {
    setStatusBadge(el.dialogueStatus, "训练已结束", true);
    el.dialoguePrompt.textContent = "本轮训练已结束，下方已展示角色原文、用户转写与参考口译。";
  } else {
    setStatusBadge(el.dialogueStatus, "等待生成", true);
    el.dialoguePrompt.textContent = "输入主题后，先生成一个角色 A 中文、角色 B 英文的 4 轮来回训练脚本。";
  }

  el.generateDialogueBtn.disabled = state.dialogue.phase === "generating" || isRecordingDialogue || isSpeaking;
  el.startDialogueBtn.disabled = state.dialogue.turns.length === 0 || state.dialogue.started || isRecordingDialogue;
  el.dialogueRecordBtn.disabled = !state.dialogue.started || (!isAwaiting && !isRecordingDialogue) || isRecordingStartPending;
  el.endDialogueBtn.disabled = !state.dialogue.started && !state.dialogue.resultsVisible && state.dialogue.turns.length === 0;

  renderDialogueTimeline();
}

async function generateDialogueReferenceTranslations() {
  const { apiKey, apiBase, modelName } = getApiConfig();
  if (!apiKey || !apiBase || !modelName || !state.dialogue.records.length) {
    return;
  }

  const response = await requestChatJson({
    apiBase,
    apiKey,
    model: modelName,
    messages: [
      {
        role: "system",
        content: "You are a professional interpreting coach. Return strict JSON only.",
      },
      {
        role: "user",
        content: `下面是一组口译训练对话。请为每一轮生成“自然口译版”的参考口译，不要解释，不要点评，不要重复原文。\n\n要求：\n1. 如果角色 A 原文是中文，就给出自然、地道、适合现场口译输出的英文参考口译。\n2. 如果角色 B 原文是英文，就给出自然、清晰、适合现场口译输出的中文参考口译。\n3. 保持信息完整，但表达可以符合自然口译习惯，不必逐字直译。\n4. 返回 JSON：{"references":[{"index":0,"referenceTranslation":"..."},{"index":1,"referenceTranslation":"..."}]}\n5. references 的 index 必须与给定轮次一致。\n\n对话数据：\n${JSON.stringify(state.dialogue.records.map((record) => ({ index: record.index, speaker: record.speaker, sourceLanguage: record.sourceLanguage, targetLanguage: record.targetLanguage, sourceText: record.sourceText })))}`,
      },
    ],
  });

  const references = Array.isArray(response.references) ? response.references : [];
  references.forEach((item) => {
    const index = Number(item.index);
    const record = state.dialogue.records[index];
    if (!record) {
      return;
    }
    record.referenceTranslation = normalizeTranscriptText(item.referenceTranslation || "");
  });
}

function rankSpeechVoice(voice, language) {
  const name = `${voice.name || ""} ${voice.voiceURI || ""}`.toLowerCase();
  const lang = String(voice.lang || "").toLowerCase();
  let score = 0;

  if (language === "zh") {
    if (lang.startsWith("zh-cn")) score += 120;
    else if (lang.startsWith("zh")) score += 92;
    else if (lang.includes("cmn")) score += 72;

    if (name.includes("xiaoxiao")) score += 42;
    if (name.includes("xiaoyi")) score += 34;
    if (name.includes("yaoyao")) score += 28;
    if (name.includes("yunxi")) score += 24;
    if (name.includes("huihui")) score += 22;
    if (name.includes("tingting")) score += 18;
    if (name.includes("natural")) score += 36;
    if (name.includes("online")) score += 18;
    if (name.includes("microsoft")) score += 16;
    if (name.includes("google")) score += 10;
    if (name.includes("desktop")) score -= 6;
  } else {
    if (lang.startsWith("en-us")) score += 120;
    else if (lang.startsWith("en-gb")) score += 108;
    else if (lang.startsWith("en")) score += 92;

    if (name.includes("aria")) score += 44;
    if (name.includes("jenny")) score += 38;
    if (name.includes("guy")) score += 32;
    if (name.includes("davis")) score += 28;
    if (name.includes("libby")) score += 24;
    if (name.includes("sara")) score += 20;
    if (name.includes("natural")) score += 36;
    if (name.includes("online")) score += 18;
    if (name.includes("microsoft")) score += 16;
    if (name.includes("google")) score += 10;
    if (name.includes("desktop")) score -= 6;
  }

  if (voice.default) {
    score += 8;
  }

  return score;
}

function buildSpeechSegments(text, language) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .trim();

  if (!normalized) {
    return [];
  }

  const primaryParts = language === "zh"
    ? normalized.split(/(?<=[。！？；])/)
    : normalized.split(/(?<=[.!?;:])\s+/);

  const segments = [];
  primaryParts
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const maxLen = language === "zh" ? 38 : 220;
      if (part.length <= maxLen) {
        segments.push(part);
        return;
      }

      const secondaryParts = language === "zh"
        ? part.split(/(?<=[，、])/)
        : part.split(/(?<=,)\s+/);

      let buffer = "";
      secondaryParts.map((item) => item.trim()).filter(Boolean).forEach((item) => {
        const candidate = buffer ? `${buffer}${language === "zh" ? "" : " "}${item}` : item;
        if (candidate.length > maxLen && buffer) {
          segments.push(buffer);
          buffer = item;
        } else {
          buffer = candidate;
        }
      });

      if (buffer) {
        segments.push(buffer);
      }
    });

  return segments.length ? segments : [normalized];
}

function getSpeechConfig(language) {
  if (language === "zh") {
    return {
      lang: "zh-CN",
      rate: 0.92,
      pitch: 1.02,
      volume: 1,
      pauseMs: 220,
    };
  }

  return {
    lang: "en-US",
    rate: 0.95,
    pitch: 1,
    volume: 1,
    pauseMs: 180,
  };
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function chooseSpeechVoice(lang) {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const candidates = voices.filter((voice) => {
    const voiceLang = String(voice.lang || "").toLowerCase();
    return lang === "zh"
      ? voiceLang.startsWith("zh") || voiceLang.includes("cmn")
      : voiceLang.startsWith("en");
  });

  const pool = candidates.length ? candidates : voices;
  return pool
    .map((voice) => ({ voice, score: rankSpeechVoice(voice, lang) }))
    .sort((a, b) => b.score - a.score)[0]?.voice || null;
}

async function speakDialogueText(text, language) {
  if (!("speechSynthesis" in window)) {
    throw new Error("当前环境不支持浏览器语音合成");
  }

  const segments = buildSpeechSegments(text, language);
  const voice = chooseSpeechVoice(language);
  const config = getSpeechConfig(language);

  window.speechSynthesis.cancel();

  for (let i = 0; i < segments.length; i += 1) {
    await new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(segments[i]);
      utterance.lang = config.lang;
      utterance.rate = config.rate;
      utterance.pitch = config.pitch;
      utterance.volume = config.volume;
      if (voice) {
        utterance.voice = voice;
      }
      utterance.onend = () => resolve();
      utterance.onerror = (event) => reject(new Error(event.error || "speech synthesis failed"));
      window.speechSynthesis.speak(utterance);
    });

    if (i < segments.length - 1) {
      await sleep(config.pauseMs);
    }
  }
}

async function playDialogueTurn(index) {
  if (!state.dialogue.started) {
    return;
  }

  if (index >= state.dialogue.records.length) {
    state.dialogue.phase = "readyToFinish";
    state.dialogue.currentTurnIndex = state.dialogue.records.length - 1;
    renderDialogueState();
    return;
  }

  const record = state.dialogue.records[index];
  state.dialogue.currentTurnIndex = index;
  state.dialogue.phase = "speaking";
  renderDialogueState();

  try {
    await speakDialogueText(record.sourceText, record.sourceLanguage);
    if (!state.dialogue.started) {
      return;
    }
    state.dialogue.phase = "awaiting";
    renderDialogueState();
  } catch (error) {
    state.dialogue.phase = "awaiting";
    setStatusBadge(el.dialogueStatus, `语音播报失败: ${error.message}`, true);
    renderDialogueState();
  }
}

function normalizeDialogueTurns(rawTurns) {
  const normalized = [];
  for (const item of Array.isArray(rawTurns) ? rawTurns : []) {
    const speaker = String(item.speaker || item.role || "").toUpperCase();
    const language = normalizeLanguageCode(item.language || item.lang);
    const text = normalizeTranscriptText(item.text || item.content || "");
    if (!text) {
      continue;
    }
    normalized.push({
      speaker: speaker === "B" ? "B" : "A",
      language,
      text,
    });
  }

  return normalized
    .filter((item, index) => {
      const expectedSpeaker = index % 2 === 0 ? "A" : "B";
      const expectedLanguage = expectedSpeaker === "A" ? "zh" : "en";
      return item.speaker === expectedSpeaker && item.language === expectedLanguage;
    })
    .slice(0, dialogueTurnCount);
}

async function generateDialogueScript() {
  const { apiKey, apiBase, modelName } = getApiConfig();
  const topic = el.dialogueTopic.value.trim();

  if (!apiKey || !apiBase || !modelName) {
    setStatusBadge(el.dialogueStatus, "请先填写 API 配置", true);
    return;
  }

  if (!topic) {
    setStatusBadge(el.dialogueStatus, "请先输入主题", true);
    return;
  }

  if (state.dialogue.started) {
    setStatusBadge(el.dialogueStatus, "请先结束当前训练", true);
    return;
  }

  state.dialogue.topic = topic;
  state.dialogue.phase = "generating";
  renderDialogueState();

  try {
    const response = await requestChatJson({
      apiBase,
      apiKey,
      model: modelName,
      messages: [
        {
          role: "system",
          content: "You are a dialogue simulation planner for interpreter training. Return strict JSON only.",
        },
        {
          role: "user",
          content: `围绕主题“${topic}”，生成一个用于中英口译训练的双人对话。\n\n训练对象：已经通过大学英语六级的中国大学生。\n\n要求：\n1. 固定 4 轮来回，共 8 句。\n2. 角色 A 只说中文。\n3. 角色 B 只说英文。\n4. 必须严格 A、B、A、B 交替。\n5. 每一句都要足够长，在正常语速下朗读约 30 到 35 秒。\n6. 中文句子不要写成口号式短句，要像真实发言，信息要完整，通常应包含背景、观点、原因、补充说明或例子。\n7. 英文句子也不要过短，要像真实交流回应，通常应包含立场、解释、细节、让步、追问或延伸。\n8. 整体难度适配已通过英语六级的大学生：不能太简单，应该包含较自然的复杂句、抽象表达、逻辑连接、条件关系、因果关系和一定信息密度，但不要生僻到像专业学术论文。\n9. 每轮内容都应围绕同一主题自然推进，像真实对话，而不是彼此孤立的独白。\n10. 适当加入数字、事实、时间安排、利弊分析、比较、建议、担忧、回应等口译训练常见信息点。\n11. 不要输出解释，不要输出舞台说明，不要标注“这句话大约几秒”。\n12. 返回 JSON：{"title":"...","turns":[{"speaker":"A","language":"zh","text":"..."},{"speaker":"B","language":"en","text":"..."}]}\n13. turns 必须正好 8 条。`,
        },
      ],
    });

    const turns = normalizeDialogueTurns(response.turns);
    if (turns.length !== dialogueTurnCount) {
      throw new Error("生成的对话不符合 4 轮来回格式，请重试");
    }

    state.dialogue.generatedTitle = normalizeTranscriptText(response.title || topic);
    state.dialogue.topic = topic;
    state.dialogue.turns = turns;
    resetDialogueState({ keepScript: true });
    renderDialogueState();
  } catch (error) {
    state.dialogue.phase = "idle";
    setStatusBadge(el.dialogueStatus, error.message, true);
    renderDialogueState();
  }
}

function startDialogueTraining() {
  if (state.isRecognizing || state.activeMicSession) {
    setStatusBadge(el.dialogueStatus, "请先结束当前录音", true);
    return;
  }
  if (!state.dialogue.turns.length) {
    setStatusBadge(el.dialogueStatus, "请先生成对话脚本", true);
    return;
  }

  window.speechSynthesis?.cancel?.();
  resetDialogueState({ keepScript: true });
  state.dialogue.started = true;
  state.dialogue.phase = "speaking";
  renderDialogueState();
  playDialogueTurn(0);
}

async function finishDialogueTraining() {
  state.dialogue.pendingFinish = false;
  state.dialogue.started = false;
  state.dialogue.phase = "generatingReferences";
  state.dialogue.resultsVisible = true;
  state.dialogue.referencesLoading = true;
  state.dialogue.currentDraft = "";
  window.speechSynthesis?.cancel?.();
  setDialogueMicButtonRecordingState(false);
  if (el.dialogueTimer) {
    el.dialogueTimer.textContent = "00:00";
  }
  renderDialogueState();

  try {
    await generateDialogueReferenceTranslations();
  } catch {
    // Keep the training results visible even if reference generation fails.
  } finally {
    state.dialogue.referencesLoading = false;
    state.dialogue.phase = "finished";
  }
  renderDialogueState();
}

async function endDialogueTraining() {
  if (state.activeMicSession?.kind === "dialogue") {
    state.dialogue.pendingFinish = true;
    stopCurrentMicCapture();
    return;
  }
  await finishDialogueTraining();
}

function startDialogueRecording() {
  if (!state.dialogue.started || state.dialogue.phase !== "awaiting") {
    return;
  }
  state.dialogue.recordingStartPending = true;
  setDialogueMicButtonProcessingState(true);
  const didStart = startMicCapture(createDialogueMicSession());
  if (!didStart) {
    state.dialogue.recordingStartPending = false;
    setDialogueMicButtonProcessingState(false);
    renderDialogueState();
  }
}

function handleDialogueRecordToggle() {
  if (state.activeMicSession?.kind === "dialogue") {
    stopCurrentMicCapture();
    return;
  }
  startDialogueRecording();
}

async function transcribeWithOpenAI(file, { apiBase, apiKey, model }) {
  const endpoint = `${apiBase.replace(/\/$/, "")}/audio/transcriptions`;

  async function runRequest(responseFormat) {
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
      const text = await response.text();
      throw new Error(`转写失败：${response.status} ${text}`);
    }

    return responseFormat === "text" ? { text: await response.text() } : response.json();
  }

  const is4oTranscribe = /gpt-4o(-mini)?-transcribe/i.test(model);
  if (is4oTranscribe) {
    return runRequest("json");
  }

  try {
    return await runRequest("verbose_json");
  } catch {
    return runRequest("json");
  }
}

async function transcribeUploadedMedia() {
  const { apiKey, apiBase, modelName } = getApiConfig();
  const manualSourceText = el.manualSourceText.value.trim();
  const shouldGenerateHints = Boolean(el.generateHintsMode.checked);

  if (!apiKey || !apiBase || !modelName) {
    el.uploadStatus.textContent = "请先填写 API 配置";
    return;
  }

  if (!state.uploadedFile && !manualSourceText) {
    el.uploadStatus.textContent = "请先上传媒体，或在“手动源语文本”里输入内容";
    return;
  }

  el.uploadStatus.textContent = shouldGenerateHints ? "转写、重述与关键词提示生成中..." : "转写与重述中...";
  el.sourceHintsStatus.textContent = shouldGenerateHints ? "生成中..." : "未启用";

  try {
    let sourceText = "";
    let rawLanguage = "unknown";

    if (manualSourceText && !state.uploadedFile) {
      sourceText = manualSourceText;
    } else if (state.uploadedFile) {
      let transcriptResult;
      if (window.desktopBridge?.transcribeAudio || window.pywebview?.api?.transcribe_audio) {
        const arrayBuffer = await state.uploadedFile.arrayBuffer();
        transcriptResult = await callDesktopTranscribe({
          apiBase,
          apiKey,
          model: modelName,
          fileName: state.uploadedFile.name,
          mimeType: state.uploadedFile.type,
          bytes: Array.from(new Uint8Array(arrayBuffer)),
        });
      } else {
        transcriptResult = await transcribeWithOpenAI(state.uploadedFile, {
          apiBase,
          apiKey,
          model: modelName,
        });
      }
      sourceText = transcriptResult?.text?.trim() || "";
      rawLanguage = normalizeLanguageCode(transcriptResult?.language);
    }

    if (!sourceText) {
      throw new Error("未获取到有效源语文本。你可以在“手动源语文本”中粘贴内容后重试。");
    }

    state.sourceLanguage = rawLanguage === "unknown" ? inferLanguageFromText(sourceText) : rawLanguage;
    state.targetLanguage = getTargetLanguage(state.sourceLanguage);

    const restatement = await requestChatJson({
      apiBase,
      apiKey,
      model: modelName,
      messages: [
        {
          role: "system",
          content: "You are a professional interpreter assistant. Return strict JSON only.",
        },
        {
          role: "user",
          content: `Rewrite the following source speech in the SAME language without translating. Keep meaning faithful and expression natural. Return JSON: {"language":"en|zh","restatement":"..."}.\n\nSource text:\n${sourceText}`,
        },
      ],
    });

    state.sourceLanguage = normalizeLanguageCode(restatement.language) !== "unknown"
      ? normalizeLanguageCode(restatement.language)
      : state.sourceLanguage;
    state.targetLanguage = getTargetLanguage(state.sourceLanguage);
    state.sourceRestatement = (restatement.restatement || sourceText).trim();

    if (shouldGenerateHints) {
      try {
        const hintResult = await requestChatJson({
          apiBase,
          apiKey,
          model: modelName,
          messages: [
            {
              role: "system",
              content: "You are a professional interpreter coach. Return strict JSON only.",
            },
            {
              role: "user",
              content: `The following source text is in ${state.sourceLanguage === "zh" ? "Chinese" : "English"}.\n\nGenerate same-language keyword hints only, without translation, for long-form interpreting practice.\n\nRequirements:\n1. Split the source text by sentence meaning.\n2. Extract exactly one keyword from each sentence whenever possible.\n3. Prefer meaningful verbs first. If no strong verb is available, use a key noun, number, name, or other content word.\n4. Do not output full sentences or long phrases. Each hint should usually be a single word, and at most a very short phrase.\n5. Avoid function words such as is, are, of, in, to, the, a, an and similar low-information words.\n6. Keep the original sentence order across the whole text.\n7. Output one hint per line, preserving sentence order from top to bottom.\n\nReturn JSON: {"language":"en|zh","hints":"..."}\n\nSource text:\n${sourceText}`,
            },
          ],
        });

        state.sourceHints = (hintResult.hints || "").trim();
        el.sourceHintsStatus.textContent = state.sourceHints ? "已生成" : "为空";
      } catch {
        state.sourceHints = "";
        el.sourceHintsStatus.textContent = "生成失败";
      }
    } else {
      state.sourceHints = "";
      el.sourceHintsStatus.textContent = "未启用";
    }

    refreshLanguagePanels();
    refreshOutputsAndComparison();

    el.uploadStatus.textContent = shouldGenerateHints ? "源语重述与关键词提示已生成" : "源语重述已生成";
  } catch (error) {
    if (isDeepSeekMode() && state.uploadedFile) {
      el.uploadStatus.textContent = `${error.message}（DeepSeek 不支持时已尝试本地 ASR 兜底）`;
    } else {
      el.uploadStatus.textContent = error.message;
    }
  }
}

async function translateSourceRestatement() {
  const sourceText = (state.sourceRestatement || "").trim();
  const { apiKey, apiBase, modelName } = getApiConfig();

  if (!sourceText) {
    el.translationStatus.textContent = "请先生成源语重述";
    return;
  }

  if (!apiKey || !apiBase || !modelName) {
    el.translationStatus.textContent = "请先填写 API 配置";
    return;
  }

  if (state.sourceLanguage === "unknown") {
    state.sourceLanguage = inferLanguageFromText(sourceText);
    state.targetLanguage = getTargetLanguage(state.sourceLanguage);
  }

  if (state.targetLanguage === "unknown") {
    el.translationStatus.textContent = "未识别到有效中英文源语";
    return;
  }

  el.translationStatus.textContent = "翻译中...";

  const translationDirection = state.sourceLanguage === "en" ? "English to Chinese" : "Chinese to English";
  const targetLanguageName = state.targetLanguage === "zh" ? "Chinese" : "English";

  try {
    const parsed = await requestChatJson({
      apiBase,
      apiKey,
      model: modelName,
      messages: [
        {
          role: "system",
          content: "You are a professional interpreter evaluator. Return strict JSON only.",
        },
        {
          role: "user",
          content: `Task: ${translationDirection}. Translate the source text into natural ${targetLanguageName}. Return JSON with keys:\n1) translation: string\n2) tips: array of 3 short coaching tips for student interpreter in Chinese.\n\nSource text:\n${sourceText}`,
        },
      ],
    });

    state.machineTranslation = (parsed.translation || "").trim();
    state.translationTips = Array.isArray(parsed.tips) ? parsed.tips.map((item) => String(item)).slice(0, 3) : [];

    if (!state.machineTranslation) {
      throw new Error("机器译文为空，请重试");
    }

    el.translationStatus.textContent = shouldHideOutputs() ? "已生成（防作弊模式暂不显示）" : "已生成";
    refreshLanguagePanels();
    refreshOutputsAndComparison();
  } catch (error) {
    el.translationStatus.textContent = error.message;
  }
}

function setupRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setMicMode("local");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    state.isRecognizing = true;
    state.activeMicSession?.onStart?.();
  };

  recognition.onresult = (event) => {
    let finalTranscript = state.micDraft.finalText;
    let interimTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript = `${finalTranscript} ${transcript}`.trim();
      } else {
        interimTranscript += `${transcript} `;
      }
    }

    const fullText = `${finalTranscript} ${interimTranscript}`.trim();
    state.micDraft.finalText = finalTranscript;
    state.micDraft.interimText = interimTranscript.trim();
    state.micDraft.detectedLanguage = inferLanguageFromText(fullText);

    state.activeMicSession?.onInterim?.({
      finalText: finalTranscript,
      interimText: interimTranscript.trim(),
      fullText,
      detectedLanguage: state.micDraft.detectedLanguage,
    });
  };

  recognition.onerror = (event) => {
    if (event.error === "network") {
      setMicMode("local");
    }
    finishMicSession(null, `识别异常: ${event.error}`);
  };

  recognition.onend = () => {
    if (!state.activeMicSession) {
      return;
    }
    const finalText = normalizeTranscriptText(state.micDraft.finalText);
    const detectedLanguage = finalText ? inferLanguageFromText(finalText) : "unknown";
    if (!finalText) {
      finishMicSession(null, "未识别到有效语音内容");
      return;
    }
    finishMicSession({
      text: finalText,
      language: detectedLanguage,
    });
  };

  state.recognition = recognition;
}

function handleFileSelect(file) {
  if (!file) {
    return;
  }

  state.uploadedFile = file;
  resetOutputForNewMedia();

  const objectUrl = URL.createObjectURL(file);
  const isVideo = file.type.startsWith("video/");

  if (isVideo) {
    el.videoPlayer.hidden = false;
    el.videoPlayer.src = objectUrl;
    el.audioPlayer.hidden = true;
    el.audioPlayer.src = "";
  } else {
    el.audioPlayer.hidden = false;
    el.audioPlayer.src = objectUrl;
    el.videoPlayer.hidden = true;
    el.videoPlayer.src = "";
  }

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

function startPanelBMicFlow() {
  if (state.dialogue.started) {
    setStatusBadge(el.micStatus, "对话训练进行中，请先结束 Panel D 训练", true);
    return;
  }

  if (state.activeMicSession?.kind === "panelB") {
    stopCurrentMicCapture();
    return;
  }

  state.hasRecordingStarted = true;
  state.liveDetectedLanguage = "unknown";
  startMicCapture(createPanelBMicSession());
}

function clearPanelBTranscript() {
  stopCurrentMicCapture();
  el.liveTranscript.value = "";
  el.liveTranscript.dataset.finalText = "";
  state.liveTranscript = "";
  state.liveDetectedLanguage = "unknown";
  state.recordingSeconds = 0;
  el.recordingTimer.textContent = "00:00";
  setPanelBMicButtonRecordingState(false);
  refreshLanguagePanels();
  refreshOutputsAndComparison();
}

el.saveConfigBtn.addEventListener("click", saveConfig);
el.providerPreset.addEventListener("change", () => {
  applyProviderPreset(el.providerPreset.value);
  el.configStatus.textContent = "已切换供应商预设（可手动调整）";
});

el.apiBase.addEventListener("input", () => {
  const matched = Object.entries(providerPresets).find(([, preset]) => preset.apiBase && preset.apiBase === el.apiBase.value.trim());
  if (!matched) {
    el.providerPreset.value = "custom";
    refreshProviderModelOptions("custom");
  }
});

el.mediaFileInput.addEventListener("change", (event) => handleFileSelect(event.target.files?.[0]));
el.transcribeAudioBtn.addEventListener("click", transcribeUploadedMedia);
el.translateAudioBtn.addEventListener("click", translateSourceRestatement);
el.runCompareBtn.addEventListener("click", () => refreshOutputsAndComparison());

el.startMicBtn.addEventListener("click", startPanelBMicFlow);
el.clearMicBtn.addEventListener("click", clearPanelBTranscript);

el.liveTranscript.addEventListener("input", () => {
  state.liveTranscript = el.liveTranscript.value;
  state.liveDetectedLanguage = inferLanguageFromText(state.liveTranscript);
  refreshLanguagePanels();
  refreshOutputsAndComparison();
});

el.antiCheatMode.addEventListener("change", () => {
  refreshOutputsAndComparison();
});

el.dialogueTopic.addEventListener("input", () => {
  state.dialogue.topic = el.dialogueTopic.value.trim();
});

el.generateDialogueBtn.addEventListener("click", generateDialogueScript);
el.startDialogueBtn.addEventListener("click", startDialogueTraining);
el.dialogueRecordBtn.addEventListener("click", handleDialogueRecordToggle);
el.endDialogueBtn.addEventListener("click", endDialogueTraining);

window.speechSynthesis?.addEventListener?.("voiceschanged", () => {
  renderDialogueState();
});

loadConfig();
applyProviderPreset(el.providerPreset.value, { keepModel: true });
loadApiKeyFromLocalFile();
setupRecognition();
setupDropzone();
setPanelBMicButtonRecordingState(false);
resetDialogueState({ keepScript: false });
refreshLanguagePanels();
refreshOutputsAndComparison();
renderDialogueState();
