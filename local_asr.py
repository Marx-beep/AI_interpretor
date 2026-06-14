import json
import os
from pathlib import Path
import subprocess
import sys

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def ensure_faster_whisper():
    try:
        from faster_whisper import WhisperModel  # type: ignore
        return WhisperModel
    except Exception:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "faster-whisper"], stdout=subprocess.DEVNULL)
        from faster_whisper import WhisperModel  # type: ignore
        return WhisperModel


def ensure_openai_whisper():
    try:
        import whisper  # type: ignore
        return whisper
    except Exception:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "openai-whisper"], stdout=subprocess.DEVNULL)
        import whisper  # type: ignore
        return whisper


def transcribe_with_faster_whisper(input_path: str, language: str | None = None) -> dict:
    WhisperModel = ensure_faster_whisper()
    model_cache = Path.home() / ".cache" / "ai-interpreting-console" / "faster-whisper"
    model_cache.mkdir(parents=True, exist_ok=True)
    model = WhisperModel(
        "tiny",
        device="cpu",
        compute_type="int8",
        download_root=str(model_cache),
    )
    segments, info = model.transcribe(input_path, beam_size=1, vad_filter=True, language=language)

    text_parts = []
    for seg in segments:
        txt = (seg.text or "").strip()
        if txt:
            text_parts.append(txt)

    return {
        "text": " ".join(text_parts).strip(),
        "language": getattr(info, "language", "") or "",
        "engine": "faster-whisper",
    }


def transcribe_with_openai_whisper(input_path: str, language: str | None = None) -> dict:
    whisper = ensure_openai_whisper()
    model_cache = Path.home() / ".cache" / "ai-interpreting-console" / "openai-whisper"
    model_cache.mkdir(parents=True, exist_ok=True)
    model = whisper.load_model("tiny", download_root=str(model_cache))
    result = model.transcribe(input_path, fp16=False, language=language)
    return {
        "text": str(result.get("text") or "").strip(),
        "language": str(result.get("language") or ""),
        "engine": "openai-whisper",
    }


def main() -> int:
    if len(sys.argv) < 2:
        print("missing input path", file=sys.stderr)
        return 2

    input_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] in {"zh", "en"} else None
    try:
        payload = transcribe_with_openai_whisper(input_path, language)
    except Exception as whisper_error:
        try:
            payload = transcribe_with_faster_whisper(input_path, language)
            payload["fallback_reason"] = str(whisper_error)
        except Exception as faster_error:
            raise RuntimeError(
                f"本地转写失败。openai-whisper: {whisper_error}; faster-whisper: {faster_error}"
            ) from faster_error

    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
