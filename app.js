const storageKey = "interpreting-console-config";

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
  recordingSeconds: 0,
  translationTips: [],
  micStream: null,
  mediaRecorder: null,
  micChunks: [],
  micMode: "speech",
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
};

function setMicButtonRecordingState(isRecording) {
  if (!el.startMicBtn) {
    return;
  }
  el.startMicBtn.classList.toggle("is-recording", isRecording);
  el.startMicBtn.textContent = isRecording ? "录制中 · 点击停止" : "开始录入";
}

function setMicMode(mode) {
  state.micMode = mode;
  if (mode === "local") {
    el.micStatus.textContent = "本地录音模式（语音识别网络异常时兜底）";
    el.micStatus.classList.add("muted");
  }
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
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit PCM
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

async function transcribeMicBlob(blob) {
  const apiKey = el.apiKey.value.trim();
  const apiBase = el.apiBase.value.trim();
  const modelName = el.modelName.value.trim();

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

  const text = (result?.text || "").trim();
  if (!text) {
    throw new Error("麦克风录音转写为空");
  }
  const normalizedLanguage = normalizeLanguageCode(result?.language);
  return {
    text,
    language: normalizedLanguage === "unknown" ? inferLanguageFromText(text) : normalizedLanguage,
  };
}

async function startLocalMicRecording() {
  const stream = await ensureMicStream();
  const preferredType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";
  const recorder = new MediaRecorder(stream, { mimeType: preferredType });
  state.mediaRecorder = recorder;
  state.micChunks = [];

  recorder.onstart = () => {
    state.isRecognizing = true;
    state.hasRecordingStarted = true;
    el.micStatus.textContent = "麦克风录音中（本地转写）";
    el.micStatus.classList.remove("muted");
    setMicButtonRecordingState(true);
    startTimer();
  };

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      state.micChunks.push(event.data);
    }
  };

  recorder.onerror = (event) => {
    state.isRecognizing = false;
    stopTimer();
    setMicButtonRecordingState(false);
    el.micStatus.textContent = `录音异常: ${event.error?.name || "unknown"}`;
    el.micStatus.classList.add("muted");
  };

  recorder.onstop = async () => {
    state.isRecognizing = false;
    stopTimer();
    setMicButtonRecordingState(false);
    if (state.hasRecordingStarted) {
      state.hasRecordingCompleted = true;
    }

    try {
      if (state.micChunks.length === 0) {
        throw new Error("未采集到录音数据，请检查麦克风权限");
      }
      const blob = new Blob(state.micChunks, { type: preferredType });
      const parsed = await transcribeMicBlob(blob);
      const base = el.liveTranscript.dataset.finalText || "";
      el.liveTranscript.dataset.finalText = `${base}${parsed.text} `;
      el.liveTranscript.value = el.liveTranscript.dataset.finalText.trim();
      state.liveTranscript = el.liveTranscript.value;
      state.liveDetectedLanguage = parsed.language === "unknown" ? inferLanguageFromText(parsed.text) : parsed.language;
      el.micStatus.textContent = "麦克风已停止（本地转写完成）";
      el.micStatus.classList.add("muted");
      refreshLanguagePanels();
      renderProtectedOutputs();
      updateComparison();
    } catch (error) {
      el.micStatus.textContent = `本地转写失败: ${error.message}`;
      el.micStatus.classList.add("muted");
    }
  };

  recorder.start();
}

function stopCurrentMicCapture() {
  if (state.micMode === "local") {
    if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
      state.mediaRecorder.stop();
    }
    return;
  }
  state.recognition?.stop();
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

function getTargetLanguage(sourceLanguage) {
  if (sourceLanguage === "en") {
    return "zh";
  }
  if (sourceLanguage === "zh") {
    return "en";
  }
  return "unknown";
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

function renderProtectedOutputs() {
  const hide = shouldHideOutputs();
  const sourceText = hide && state.sourceRestatement ? "防作弊模式：录音结束后显示源语重述。" : state.sourceRestatement;
  const machineText = hide && state.machineTranslation ? "防作弊模式：录音结束后显示机器标准译文。" : state.machineTranslation;

  el.audioTranscript.value = sourceText;
  el.sourceHints.value = state.sourceHints;
  el.machineTranslation.value = machineText;

  el.audioTranscriptMirror.textContent = machineText || "暂无内容";
  el.liveTranscriptMirror.textContent = el.liveTranscript.value || "暂无内容";

  const sourceTokens = hide ? countTokensForDisplay(state.sourceRestatement, state.sourceLanguage) : countTokensForDisplay(el.audioTranscript.value, state.sourceLanguage);
  el.audioWordCount.textContent = `${sourceTokens} tokens`;
  el.liveWordCount.textContent = `${countTokensForDisplay(el.liveTranscript.value, state.targetLanguage)} tokens`;

  if (hide && state.machineTranslation) {
    el.translationStatus.textContent = "已生成（防作弊模式暂不显示）";
  }
}

function updateComparison() {
  if (shouldHideOutputs()) {
    el.compareScore.textContent = "等待录音完成";
    el.differenceList.textContent = "防作弊模式开启：标准答案与评分将在你停止录音后自动揭晓。";
    el.summaryOutput.textContent = "请先完成录音，再查看对比与评分。";
    el.liveInterpretingNote.value = "防作弊模式开启：可先上传并播放媒体，系统会先生成答案但不显示；停止录音后统一展示。";
    renderProtectedOutputs();
    return;
  }

  const reference = (state.machineTranslation || "").trim();
  const attempt = (el.liveTranscript.value || "").trim();

  if (!reference && !attempt) {
    el.compareScore.textContent = "相似度 --";
    el.differenceList.textContent = "等待机器标准译文与口译文本。";
    el.summaryOutput.textContent = "生成机器译文后可进行评分。";
    el.liveInterpretingNote.value = "暂无可评分内容。";
    renderProtectedOutputs();
    return;
  }

  if (!reference) {
    el.compareScore.textContent = "相似度 --";
    el.differenceList.textContent = "缺少机器标准译文，请先点击“生成机器译文”。";
    el.summaryOutput.textContent = "标准答案未生成。";
    el.liveInterpretingNote.value = "请先生成机器标准译文，再进行评分。";
    renderProtectedOutputs();
    return;
  }

  if (!attempt) {
    el.compareScore.textContent = "相似度 0%";
    el.differenceList.textContent = "尚未检测到个人口译文本。";
    el.summaryOutput.textContent = "请开始麦克风录入后再评分。";
    el.liveInterpretingNote.value = "当前无口译文本。";
    renderProtectedOutputs();
    return;
  }

  const language = state.targetLanguage === "unknown" ? inferLanguageFromText(reference) : state.targetLanguage;
  const refTokens = uniqueTokens(tokenizeForScore(reference, language));
  const attTokens = uniqueTokens(tokenizeForScore(attempt, language));

  const jaccard = computeJaccardScore(refTokens, attTokens);
  const dice = computeDiceScore(reference, attempt);
  const score = Math.max(0, Math.min(100, Math.round((jaccard * 0.6 + dice * 0.4) * 100)));

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

  renderProtectedOutputs();
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
  const apiKey = el.apiKey.value.trim();
  const apiBase = el.apiBase.value.trim();
  const modelName = el.modelName.value.trim();
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
              content: `The following source text is in ${state.sourceLanguage === "zh" ? "Chinese" : "English"}.

Generate same-language keyword hints only, without translation, for long-form interpreting practice.

Requirements:
1. Split the source text by sentence meaning.
2. Extract exactly one keyword from each sentence whenever possible.
3. Prefer meaningful verbs first. If no strong verb is available, use a key noun, number, name, or other content word.
4. Do not output full sentences or long phrases. Each hint should usually be a single word, and at most a very short phrase.
5. Avoid function words such as is, are, of, in, to, the, a, an and similar low-information words.
6. Keep the original sentence order across the whole text.
7. Output one hint per line, preserving sentence order from top to bottom.

Return JSON: {"language":"en|zh","hints":"..."}

Source text:
${sourceText}`,
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

    renderProtectedOutputs();
    refreshLanguagePanels();
    updateComparison();

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
  const apiKey = el.apiKey.value.trim();
  const apiBase = el.apiBase.value.trim();
  const modelName = el.modelName.value.trim();

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
    renderProtectedOutputs();
    refreshLanguagePanels();
    updateComparison();
  } catch (error) {
    el.translationStatus.textContent = error.message;
  }
}

function resolveMicRecognitionLang() {
  const selected = el.micInputLanguage.value;
  if (selected === "zh") {
    return "zh-CN";
  }
  if (selected === "en") {
    return "en-US";
  }
  if (state.targetLanguage === "zh") {
    return "zh-CN";
  }
  return "en-US";
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
    state.hasRecordingStarted = true;
    el.micStatus.textContent = "麦克风录入中";
    el.micStatus.classList.remove("muted");
    setMicButtonRecordingState(true);
    startTimer();
    renderProtectedOutputs();
    updateComparison();
  };

  recognition.onend = () => {
    state.isRecognizing = false;
    if (state.hasRecordingStarted) {
      state.hasRecordingCompleted = true;
    }
    stopTimer();
    setMicButtonRecordingState(false);
    renderProtectedOutputs();
    updateComparison();
    if (el.micStatus.textContent === "麦克风录入中") {
      el.micStatus.textContent = "麦克风已停止";
      el.micStatus.classList.add("muted");
    }
  };

  recognition.onerror = (event) => {
    state.isRecognizing = false;
    stopTimer();
    if (event.error === "network") {
      el.micStatus.textContent = "识别异常: network，已切换到本地录音模式";
      setMicMode("local");
    } else {
      el.micStatus.textContent = `识别异常: ${event.error}`;
    }
    el.micStatus.classList.add("muted");
    setMicButtonRecordingState(false);
    renderProtectedOutputs();
    updateComparison();
  };

  recognition.onresult = (event) => {
    let finalTranscript = "";
    let interimTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += `${transcript} `;
      } else {
        interimTranscript += `${transcript} `;
      }
    }

    const base = el.liveTranscript.dataset.finalText || "";
    if (finalTranscript) {
      el.liveTranscript.dataset.finalText = `${base}${finalTranscript}`;
    }

    el.liveTranscript.value = `${el.liveTranscript.dataset.finalText || ""}${interimTranscript}`.trim();
    state.liveTranscript = el.liveTranscript.value;
    state.liveDetectedLanguage = inferLanguageFromText(state.liveTranscript);

    refreshLanguagePanels();
    renderProtectedOutputs();
    updateComparison();
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
el.runCompareBtn.addEventListener("click", updateComparison);

el.startMicBtn.addEventListener("click", () => {
  if (state.isRecognizing) {
    stopCurrentMicCapture();
    state.isRecognizing = false;
    if (state.hasRecordingStarted) {
      state.hasRecordingCompleted = true;
    }
    stopTimer();
    setMicButtonRecordingState(false);
    el.micStatus.textContent = "麦克风已停止";
    el.micStatus.classList.add("muted");
    renderProtectedOutputs();
    updateComparison();
    return;
  }

  state.recordingSeconds = 0;
  el.recordingTimer.textContent = "00:00";
  state.liveDetectedLanguage = "unknown";
  state.hasRecordingStarted = true;

  if (state.micMode === "local" || !state.recognition) {
    startLocalMicRecording().catch((error) => {
      el.micStatus.textContent = `启动失败: ${error.message}`;
      el.micStatus.classList.add("muted");
      setMicButtonRecordingState(false);
    });
    return;
  }

  state.recognition.lang = resolveMicRecognitionLang();
  try {
    state.recognition.start();
  } catch (error) {
    el.micStatus.textContent = `启动失败: ${error.message}`;
    el.micStatus.classList.add("muted");
    setMicButtonRecordingState(false);
  }
});

el.clearMicBtn.addEventListener("click", () => {
  stopCurrentMicCapture();
  el.liveTranscript.value = "";
  el.liveTranscript.dataset.finalText = "";
  state.liveTranscript = "";
  state.liveDetectedLanguage = "unknown";
  state.recordingSeconds = 0;
  el.recordingTimer.textContent = "00:00";
  setMicButtonRecordingState(false);
  refreshLanguagePanels();
  renderProtectedOutputs();
  updateComparison();
});

el.liveTranscript.addEventListener("input", () => {
  state.liveTranscript = el.liveTranscript.value;
  state.liveDetectedLanguage = inferLanguageFromText(state.liveTranscript);
  refreshLanguagePanels();
  renderProtectedOutputs();
  updateComparison();
});

el.antiCheatMode.addEventListener("change", () => {
  renderProtectedOutputs();
  updateComparison();
});

loadConfig();
applyProviderPreset(el.providerPreset.value, { keepModel: true });
loadApiKeyFromLocalFile();
setupRecognition();
setupDropzone();
setMicButtonRecordingState(false);
refreshLanguagePanels();
renderProtectedOutputs();
updateComparison();
