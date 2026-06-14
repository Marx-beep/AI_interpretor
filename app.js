const storageKey = "interpreting-console-config";

const state = {
  uploadedFile: null,
  audioTranscript: "",
  liveTranscript: "",
  recognition: null,
  isRecognizing: false,
  timerId: null,
  recordingSeconds: 0,
<<<<<<< Updated upstream
=======
  translationTips: [],
  micStream: null,
  mediaRecorder: null,
  micChunks: [],
  micMode: "speech",
  switchingToLocalMic: false,
  isProcessingSource: false,
  isTranscribingMic: false,
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
    models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"],
    hint: "DeepSeek 仅负责重述与翻译；上传音视频和麦克风录音会使用本机 Whisper 转写。手动源语文本优先于上传媒体。",
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
>>>>>>> Stashed changes
};

const el = {
  apiBase: document.getElementById("apiBase"),
  apiKey: document.getElementById("apiKey"),
  transcriptionModel: document.getElementById("transcriptionModel"),
  chatModel: document.getElementById("chatModel"),
  saveConfigBtn: document.getElementById("saveConfigBtn"),
  testConfigBtn: document.getElementById("testConfigBtn"),
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

<<<<<<< Updated upstream
=======
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

async function transcribeMicBlob(blob) {
  const apiKey = el.apiKey.value.trim() || "local";
  const apiBase = el.apiBase.value.trim() || "http://127.0.0.1";
  const modelName = el.modelName.value.trim() || "local-fallback";

  const arrayBuffer = await blob.arrayBuffer();
  const isMp4 = String(blob.type || "").includes("mp4");
  const result = await callDesktopTranscribe({
    apiBase,
    apiKey,
    model: modelName,
    fileName: isMp4 ? "mic-input.m4a" : "mic-input.webm",
    mimeType: blob.type || "audio/webm",
    languageHint: resolveMicRecognitionLang().startsWith("zh") ? "zh" : "en",
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
  if (state.isTranscribingMic) {
    throw new Error("上一段录音仍在转写，请等待完成");
  }
  const stream = await ensureMicStream();
  const preferredType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
    .find((type) => MediaRecorder.isTypeSupported(type)) || "";
  const recorder = preferredType
    ? new MediaRecorder(stream, { mimeType: preferredType })
    : new MediaRecorder(stream);
  state.mediaRecorder = recorder;
  state.micChunks = [];
  state.hasRecordingCompleted = false;

  recorder.onstart = () => {
    state.switchingToLocalMic = false;
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
    el.micStatus.textContent = "录音已停止，正在本地转写...";
    el.micStatus.classList.remove("muted");
    state.isTranscribingMic = true;
    el.startMicBtn.disabled = true;
    el.clearMicBtn.disabled = true;

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
      state.hasRecordingCompleted = true;
      el.micStatus.textContent = "麦克风已停止（本地转写完成）";
      el.micStatus.classList.add("muted");
      refreshLanguagePanels();
      renderProtectedOutputs();
      updateComparison();
    } catch (error) {
      el.micStatus.textContent = `本地转写失败: ${error.message}`;
      el.micStatus.classList.add("muted");
    } finally {
      state.isTranscribingMic = false;
      el.startMicBtn.disabled = false;
      el.clearMicBtn.disabled = false;
    }
  };

  recorder.start(1000);
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

>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
function wordCount(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function setTextMetrics() {
  el.audioWordCount.textContent = `${wordCount(el.audioTranscript.value)} words`;
  el.liveWordCount.textContent = `${wordCount(el.liveTranscript.value)} words`;
  el.audioTranscriptMirror.textContent = el.audioTranscript.value || "暂无内容";
  el.liveTranscriptMirror.textContent = el.liveTranscript.value || "暂无内容";
=======
async function testApiConfig() {
  const apiKey = el.apiKey.value.trim();
  const apiBase = el.apiBase.value.trim();
  const model = el.modelName.value.trim();
  if (!apiKey || !apiBase || !model) {
    el.configStatus.textContent = "请完整填写 API Base、API Key 和模型";
    return;
  }

  el.testConfigBtn.disabled = true;
  el.configStatus.textContent = "正在测试 API...";
  try {
    const parsed = await requestChatJson({
      apiBase,
      apiKey,
      model,
      messages: [
        { role: "system", content: "Return strict JSON only." },
        { role: "user", content: 'Return exactly {"status":"ok"}.' },
      ],
    });
    if (parsed.status !== "ok") {
      throw new Error("模型已响应，但未返回预期 JSON；请检查所选模型是否支持 JSON 输出");
    }
    saveConfig();
    el.configStatus.textContent = "API 测试成功，配置已保存";
  } catch (error) {
    el.configStatus.textContent = `API 测试失败：${error.message}`;
  } finally {
    el.testConfigBtn.disabled = false;
  }
}

function isDeepSeekMode() {
  const apiBase = el.apiBase.value.trim().toLowerCase();
  const model = el.modelName.value.trim().toLowerCase();
  return apiBase.includes("api.deepseek.com") || model.includes("deepseek");
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
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
=======
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
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    const candidate = fenced || content.match(/\{[\s\S]*\}/)?.[0];
    if (!candidate) {
      return null;
    }
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
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
    const parsed = parseMaybeJson(content);
    if (!parsed) {
      throw new Error("模型返回内容不是有效 JSON，请重试或更换模型");
    }
    if (result?.localFallback || result?.fallbackReason) {
      parsed.local_fallback = true;
      parsed.fallback_reason = String(result?.fallbackReason || parsed.fallback_reason || "网络异常");
    }
    return parsed;
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
  const parsed = parseMaybeJson(content);
  if (!parsed) {
    throw new Error("模型返回内容不是有效 JSON，请重试或更换模型");
  }
  return parsed;
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
  if (state.isProcessingSource) {
    el.uploadStatus.textContent = "源语重述正在处理中，请等待当前任务完成";
    return;
  }
  const apiKey = el.apiKey.value.trim() || "local";
  const apiBase = el.apiBase.value.trim() || "http://127.0.0.1";
  const modelName = el.modelName.value.trim() || "local-fallback";
  const manualSourceText = el.manualSourceText.value.trim();

  if (!el.apiBase.value.trim() || !el.apiKey.value.trim() || !el.modelName.value.trim()) {
    el.uploadStatus.textContent = "请先完整填写并测试 API Base、API Key 和模型";
    return;
  }

  if (!state.uploadedFile && !manualSourceText) {
    el.uploadStatus.textContent = "请先上传媒体，或在“手动源语文本”里输入内容";
    return;
  }

  el.uploadStatus.textContent = "转写与重述中...";
  state.isProcessingSource = true;
  el.transcribeAudioBtn.disabled = true;
  el.translateAudioBtn.disabled = true;

  try {
    let sourceText = "";
    let rawLanguage = "unknown";

    if (manualSourceText) {
      sourceText = manualSourceText;
      el.uploadStatus.textContent = "正在使用手动源语文本生成重述...";
    } else if (state.uploadedFile) {
      let transcriptResult;
      if (window.desktopBridge?.transcribeAudio || window.pywebview?.api?.transcribe_audio) {
        el.uploadStatus.textContent = "正在本地转写音频，请稍候...";
        const arrayBuffer = await state.uploadedFile.arrayBuffer();
        transcriptResult = await callDesktopTranscribe({
>>>>>>> Stashed changes
          apiBase,
          apiKey,
          model,
          fileName: state.uploadedFile.name,
          mimeType: state.uploadedFile.type,
          languageHint: "",
          bytes: Array.from(new Uint8Array(arrayBuffer)),
        }),
      });

      if (!response.ok) {
        throw new Error(`转写失败：${response.status}`);
      }

<<<<<<< Updated upstream
      result = await response.json();
=======
    if (!sourceText) {
      throw new Error("未获取到有效源语文本。你可以在“手动源语文本”中粘贴内容后重试。");
    }

    state.sourceLanguage = rawLanguage === "unknown" ? inferLanguageFromText(sourceText) : rawLanguage;
    state.targetLanguage = getTargetLanguage(state.sourceLanguage);
    el.uploadStatus.textContent = "音频转写完成，正在调用 DeepSeek 生成重述...";

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

    renderProtectedOutputs();
    refreshLanguagePanels();
    updateComparison();

    el.uploadStatus.textContent = restatement.local_fallback
      ? `源语重述已生成（本地模式：${restatement.fallback_reason || "网络异常"}）`
      : "源语重述已生成";
  } catch (error) {
    if (isDeepSeekMode() && state.uploadedFile) {
      el.uploadStatus.textContent = `${error.message}（DeepSeek 不支持时已尝试本地 ASR 兜底）`;
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
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
=======
  } finally {
    state.isProcessingSource = false;
    el.transcribeAudioBtn.disabled = false;
    el.translateAudioBtn.disabled = false;
  }
}

async function translateSourceRestatement() {
  const sourceText = (state.sourceRestatement || "").trim();
  const apiKey = el.apiKey.value.trim() || "local";
  const apiBase = el.apiBase.value.trim() || "http://127.0.0.1";
  const modelName = el.modelName.value.trim() || "local-fallback";
>>>>>>> Stashed changes

  if (!sourceText) {
    el.translationStatus.textContent = "缺少英文文本";
    return;
  }

<<<<<<< Updated upstream
  if (!apiKey || !apiBase || !model) {
    el.translationStatus.textContent = "请先填写 API 配置";
=======
  if (!el.apiBase.value.trim() || !el.apiKey.value.trim() || !el.modelName.value.trim()) {
    el.translationStatus.textContent = "请先完整填写并测试 API Base、API Key 和模型";
>>>>>>> Stashed changes
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
  if (window.desktopBridge?.transcribeAudio) {
    setMicMode("local");
    el.micStatus.textContent = "本地录音模式（停止后约数秒生成文本）";
    return;
  }

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
    if (state.switchingToLocalMic) {
      return;
    }
    state.isRecognizing = false;
    stopTimer();
    if (el.micStatus.textContent === "麦克风录入中") {
      el.micStatus.textContent = "麦克风已停止";
      el.micStatus.classList.add("muted");
    }
  };

  recognition.onerror = (event) => {
    state.isRecognizing = false;
<<<<<<< Updated upstream
    el.micStatus.textContent = `识别异常: ${event.error}`;
    el.micStatus.classList.add("muted");
=======
    stopTimer();
    if (event.error === "network") {
      state.switchingToLocalMic = true;
      el.micStatus.textContent = "在线识别不可用，正在自动切换到本地录音...";
      setMicMode("local");
      window.setTimeout(() => {
        startLocalMicRecording().catch((error) => {
          state.switchingToLocalMic = false;
          el.micStatus.textContent = `本地录音启动失败: ${error.message}`;
          el.micStatus.classList.add("muted");
          setMicButtonRecordingState(false);
        });
      }, 300);
    } else {
      el.micStatus.textContent = `识别异常: ${event.error}`;
      setMicButtonRecordingState(false);
    }
    el.micStatus.classList.add("muted");
    renderProtectedOutputs();
    updateComparison();
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
el.audioFileInput.addEventListener("change", (event) => handleFileSelect(event.target.files?.[0]));
el.transcribeAudioBtn.addEventListener("click", transcribeUploadedAudio);
el.translateAudioBtn.addEventListener("click", translateAndSummarize);
el.runCompareBtn.addEventListener("click", updateComparison);

el.startMicBtn.addEventListener("click", () => {
  if (!state.recognition || state.isRecognizing) {
=======
el.testConfigBtn.addEventListener("click", testApiConfig);
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
    stopTimer();
    setMicButtonRecordingState(false);
    if (state.micMode === "local") {
      el.micStatus.textContent = "录音已停止，正在准备本地转写...";
      el.micStatus.classList.remove("muted");
    } else {
      if (state.hasRecordingStarted) {
        state.hasRecordingCompleted = true;
      }
      el.micStatus.textContent = "麦克风已停止";
      el.micStatus.classList.add("muted");
      renderProtectedOutputs();
      updateComparison();
    }
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
=======
  if (state.isTranscribingMic) {
    el.micStatus.textContent = "录音仍在转写，请等待完成后再清空";
    return;
  }
  stopCurrentMicCapture();
>>>>>>> Stashed changes
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
