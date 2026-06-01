import json
import subprocess
import sys

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


def main() -> int:
    if len(sys.argv) < 2:
        print("missing input path", file=sys.stderr)
        return 2

    input_path = sys.argv[1]
    WhisperModel = ensure_faster_whisper()

    model = WhisperModel("tiny", device="cpu", compute_type="int8")
    segments, info = model.transcribe(input_path, beam_size=1, vad_filter=True)

    text_parts = []
    for seg in segments:
        txt = (seg.text or "").strip()
        if txt:
            text_parts.append(txt)

    payload = {
        "text": " ".join(text_parts).strip(),
        "language": getattr(info, "language", "") or "",
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
