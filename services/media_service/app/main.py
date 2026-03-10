"""
Media Analysis Service — long-running async consumer for image, video, and audio analysis.

Consumes from 'media:analyze' stream and performs:
1. Image analysis: OCR (pytesseract), logo detection (CLIP zero-shot), object/scene labels
2. Video analysis: keyframe extraction (ffmpeg), per-frame image analysis, speech-to-text (whisper)
3. Audio analysis: speech-to-text (whisper)

Publishes MediaResultEvent to 'media:results' and updates the Mention record in Postgres.
Consumer group: 'media-service'
"""

import asyncio
import json
import logging
import os
import signal
import subprocess
import tempfile
from pathlib import Path

import httpx
import numpy as np
import torch
from PIL import Image
from sqlalchemy import update

from shared.database import create_db
from shared.url_validator import validate_url
from shared.events import (
    STREAM_MEDIA_ANALYSIS,
    STREAM_MEDIA_RESULTS,
    EventBus,
    MediaResultEvent,
)
from shared.models import Mention

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

GROUP_NAME = "media-service"
CONSUMER_NAME = f"media-{os.getpid()}"
BATCH_SIZE = int(os.getenv("MEDIA_BATCH_SIZE", "5"))
DOWNLOAD_TIMEOUT = int(os.getenv("MEDIA_DOWNLOAD_TIMEOUT", "120"))
MAX_MEDIA_SIZE_MB = int(os.getenv("MAX_MEDIA_SIZE_MB", "200"))
MAX_VIDEO_KEYFRAMES = int(os.getenv("MAX_VIDEO_KEYFRAMES", "10"))
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base")
CLIP_MODEL_NAME = os.getenv("CLIP_MODEL_NAME", "openai/clip-vit-base-patch32")

# Well-known brand labels for CLIP zero-shot logo detection
LOGO_CANDIDATES = [
    "Apple logo",
    "Google logo",
    "Microsoft logo",
    "Amazon logo",
    "Nike logo",
    "Adidas logo",
    "Coca-Cola logo",
    "Samsung logo",
    "Toyota logo",
    "Facebook logo",
    "Twitter logo",
    "Instagram logo",
    "YouTube logo",
    "Netflix logo",
    "Starbucks logo",
    "McDonald's logo",
    "BMW logo",
    "Mercedes-Benz logo",
    "Tesla logo",
    "Pepsi logo",
    "no brand logo",
]
LOGO_CONFIDENCE_THRESHOLD = float(os.getenv("LOGO_CONFIDENCE_THRESHOLD", "0.35"))

# ---------------------------------------------------------------------------
# Lazy-loaded ML models (heavy; only initialise once on first use)
# ---------------------------------------------------------------------------

_ocr_engine = None
_whisper_model = None
_clip_model = None
_clip_processor = None
_clip_text_features = None


def _get_ocr_engine():
    """Return an EasyOCR reader, falling back to pytesseract wrapper."""
    global _ocr_engine
    if _ocr_engine is not None:
        return _ocr_engine

    try:
        import easyocr

        _ocr_engine = easyocr.Reader(["en"], gpu=torch.cuda.is_available())
        logger.info("OCR engine: EasyOCR (GPU=%s)", torch.cuda.is_available())
        return _ocr_engine
    except ImportError:
        pass

    try:
        import pytesseract  # noqa: F401 — availability check

        # Wrap pytesseract in a duck-typed object with .readtext()
        class _TesseractWrapper:
            @staticmethod
            def readtext(image_input, detail=0):  # noqa: ARG004
                if isinstance(image_input, np.ndarray):
                    img = Image.fromarray(image_input)
                elif isinstance(image_input, str):
                    img = Image.open(image_input)
                else:
                    img = image_input
                text = pytesseract.image_to_string(img)
                return [line.strip() for line in text.splitlines() if line.strip()]

        _ocr_engine = _TesseractWrapper()
        logger.info("OCR engine: pytesseract")
        return _ocr_engine
    except ImportError:
        logger.warning("No OCR engine available (install easyocr or pytesseract)")
        return None


def _get_whisper_model():
    """Load OpenAI Whisper model on first call."""
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model

    try:
        import whisper

        _whisper_model = whisper.load_model(WHISPER_MODEL_SIZE)
        logger.info("Whisper model loaded: %s", WHISPER_MODEL_SIZE)
        return _whisper_model
    except ImportError:
        logger.warning("whisper not installed — audio transcription disabled")
        return None


def _get_clip():
    """Load CLIP model + processor and pre-compute logo text features."""
    global _clip_model, _clip_processor, _clip_text_features
    if _clip_model is not None:
        return _clip_model, _clip_processor, _clip_text_features

    try:
        from transformers import CLIPModel, CLIPProcessor

        _clip_processor = CLIPProcessor.from_pretrained(CLIP_MODEL_NAME)
        _clip_model = CLIPModel.from_pretrained(CLIP_MODEL_NAME)
        _clip_model.eval()
        if torch.cuda.is_available():
            _clip_model = _clip_model.cuda()

        # Pre-compute text embeddings for logo candidates
        inputs = _clip_processor(text=LOGO_CANDIDATES, return_tensors="pt", padding=True)
        if torch.cuda.is_available():
            inputs = {k: v.cuda() for k, v in inputs.items()}
        with torch.no_grad():
            _clip_text_features = _clip_model.get_text_features(**inputs)
            _clip_text_features = _clip_text_features / _clip_text_features.norm(dim=-1, keepdim=True)

        logger.info("CLIP model loaded: %s", CLIP_MODEL_NAME)
        return _clip_model, _clip_processor, _clip_text_features
    except ImportError:
        logger.warning("transformers/CLIP not installed — logo detection disabled")
        return None, None, None


# ---------------------------------------------------------------------------
# Media download
# ---------------------------------------------------------------------------


async def download_media(url: str, dest_dir: str) -> str:
    """Download a media file from *url* into *dest_dir*. Returns local path."""
    validate_url(url)

    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=httpx.Timeout(DOWNLOAD_TIMEOUT, connect=30.0),
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()

        content_type = resp.headers.get("content-type", "application/octet-stream")
        ext = _ext_from_content_type(content_type, url)
        local_path = os.path.join(dest_dir, f"media{ext}")

        # Enforce size limit
        content_length = len(resp.content)
        if content_length > MAX_MEDIA_SIZE_MB * 1024 * 1024:
            raise ValueError(f"Media file too large ({content_length / 1024 / 1024:.1f} MB > {MAX_MEDIA_SIZE_MB} MB)")

        with open(local_path, "wb") as f:
            f.write(resp.content)

    return local_path


def _ext_from_content_type(ct: str, url: str) -> str:
    """Best-effort file extension from content type or URL."""
    mapping = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "video/quicktime": ".mov",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "audio/ogg": ".ogg",
        "audio/mp4": ".m4a",
    }
    for key, ext in mapping.items():
        if key in ct:
            return ext
    # Fallback: try URL extension
    suffix = Path(url.split("?")[0]).suffix.lower()
    return suffix if suffix else ".bin"


# ---------------------------------------------------------------------------
# Image analysis
# ---------------------------------------------------------------------------


def run_ocr(image: Image.Image) -> str:
    """Extract text from an image via OCR. Returns concatenated text."""
    engine = _get_ocr_engine()
    if engine is None:
        return ""
    try:
        img_array = np.array(image.convert("RGB"))
        results = engine.readtext(img_array, detail=0)
        return "\n".join(results).strip()
    except Exception as exc:
        logger.error("OCR failed: %s", exc)
        return ""


def detect_logos(image: Image.Image) -> list[dict]:
    """Zero-shot logo detection using CLIP. Returns list of {label, score}."""
    model, processor, text_features = _get_clip()
    if model is None:
        return []
    try:
        inputs = processor(images=image, return_tensors="pt")
        if torch.cuda.is_available():
            inputs = {k: v.cuda() for k, v in inputs.items()}
        with torch.no_grad():
            image_features = model.get_image_features(**inputs)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            similarity = (image_features @ text_features.T).squeeze(0)
            probs = similarity.softmax(dim=-1).cpu().numpy()

        detected = []
        for idx, (label, score) in enumerate(zip(LOGO_CANDIDATES, probs)):
            if label == "no brand logo":
                continue
            if float(score) >= LOGO_CONFIDENCE_THRESHOLD:
                detected.append({"label": label, "score": round(float(score), 4)})
        detected.sort(key=lambda x: x["score"], reverse=True)
        return detected
    except Exception as exc:
        logger.error("Logo detection failed: %s", exc)
        return []


def classify_scene(image: Image.Image) -> list[dict]:
    """Generate object/scene labels using CLIP zero-shot classification."""
    model, processor, _ = _get_clip()
    if model is None:
        return []

    scene_labels = [
        "outdoor landscape",
        "indoor room",
        "city street",
        "office",
        "food and drink",
        "people group",
        "single person portrait",
        "animal",
        "vehicle",
        "product shot",
        "sports event",
        "concert or event",
        "nature",
        "technology device",
        "text or document",
        "meme or infographic",
        "beach",
        "mountain",
        "building architecture",
    ]
    try:
        inputs_img = processor(images=image, return_tensors="pt")
        inputs_txt = processor(text=scene_labels, return_tensors="pt", padding=True)
        if torch.cuda.is_available():
            inputs_img = {k: v.cuda() for k, v in inputs_img.items()}
            inputs_txt = {k: v.cuda() for k, v in inputs_txt.items()}

        with torch.no_grad():
            img_feat = model.get_image_features(**inputs_img)
            txt_feat = model.get_text_features(**inputs_txt)
            img_feat = img_feat / img_feat.norm(dim=-1, keepdim=True)
            txt_feat = txt_feat / txt_feat.norm(dim=-1, keepdim=True)
            sims = (img_feat @ txt_feat.T).squeeze(0).softmax(dim=-1).cpu().numpy()

        results = []
        for label, score in zip(scene_labels, sims):
            if float(score) >= 0.08:
                results.append({"label": label, "score": round(float(score), 4)})
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:5]
    except Exception as exc:
        logger.error("Scene classification failed: %s", exc)
        return []


def analyze_image(image: Image.Image) -> dict:
    """Run full image analysis pipeline. Returns {ocr_text, logos, labels}."""
    ocr_text = run_ocr(image)
    logos = detect_logos(image)
    labels = classify_scene(image)
    return {
        "ocr_text": ocr_text,
        "logos": logos,
        "labels": labels,
    }


# ---------------------------------------------------------------------------
# Video analysis
# ---------------------------------------------------------------------------


def extract_keyframes(video_path: str, max_frames: int = MAX_VIDEO_KEYFRAMES) -> list[str]:
    """Extract keyframes from a video using ffmpeg scene-change detection.

    Falls back to uniform sampling if scene detection yields too few frames.
    Returns a list of image file paths.
    """
    out_dir = os.path.join(os.path.dirname(video_path), "frames")
    os.makedirs(out_dir, exist_ok=True)

    # Get video duration
    probe_cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        video_path,
    ]
    try:
        duration = float(subprocess.check_output(probe_cmd, stderr=subprocess.DEVNULL).decode().strip())
    except Exception:
        duration = 60.0

    # Try scene-change detection first
    pattern = os.path.join(out_dir, "scene_%04d.jpg")
    scene_cmd = [
        "ffmpeg",
        "-y",
        "-i",
        video_path,
        "-vf",
        "select='gt(scene,0.3)',setpts=N/FRAME_RATE/TB",
        "-frames:v",
        str(max_frames),
        "-vsync",
        "vfr",
        "-q:v",
        "2",
        pattern,
    ]
    try:
        subprocess.run(scene_cmd, capture_output=True, timeout=120)
    except Exception as exc:
        logger.warning("Scene detection failed: %s", exc)

    frames = sorted(Path(out_dir).glob("scene_*.jpg"))

    # Fallback: uniform sampling
    if len(frames) < 3:
        interval = max(duration / (max_frames + 1), 1.0)
        for i in range(max_frames):
            ts = interval * (i + 1)
            if ts >= duration:
                break
            out_file = os.path.join(out_dir, f"uniform_{i:04d}.jpg")
            cmd = [
                "ffmpeg",
                "-y",
                "-ss",
                str(ts),
                "-i",
                video_path,
                "-frames:v",
                "1",
                "-q:v",
                "2",
                out_file,
            ]
            try:
                subprocess.run(cmd, capture_output=True, timeout=30)
                if os.path.exists(out_file) and os.path.getsize(out_file) > 0:
                    frames.append(Path(out_file))
            except Exception:
                pass
        frames = sorted(set(frames))

    return [str(f) for f in frames[:max_frames]]


def extract_audio(video_path: str) -> str | None:
    """Extract audio track from a video file. Returns path to WAV or None."""
    audio_path = video_path.rsplit(".", 1)[0] + "_audio.wav"
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        video_path,
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        audio_path,
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=180)
        if os.path.exists(audio_path) and os.path.getsize(audio_path) > 0:
            return audio_path
    except Exception as exc:
        logger.warning("Audio extraction failed: %s", exc)
    return None


# ---------------------------------------------------------------------------
# Audio / speech-to-text
# ---------------------------------------------------------------------------


def transcribe_audio(audio_path: str) -> str:
    """Transcribe audio file using OpenAI Whisper. Returns transcript text."""
    model = _get_whisper_model()
    if model is None:
        return ""
    try:
        result = model.transcribe(audio_path, fp16=torch.cuda.is_available())
        return result.get("text", "").strip()
    except Exception as exc:
        logger.error("Whisper transcription failed: %s", exc)
        return ""


# ---------------------------------------------------------------------------
# Top-level analysis dispatcher
# ---------------------------------------------------------------------------


async def analyze_media(media_url: str, media_type: str, tmp_dir: str) -> dict:
    """Download and analyse media. Returns {ocr_text, labels_json, transcript, logos}."""
    loop = asyncio.get_running_loop()

    local_path = await download_media(media_url, tmp_dir)
    logger.info("Downloaded media to %s (%s)", local_path, media_type)

    ocr_text = ""
    labels: list[dict] = []
    logos: list[dict] = []
    transcript = ""

    if media_type == "image":
        image = Image.open(local_path).convert("RGB")
        result = await loop.run_in_executor(None, analyze_image, image)
        ocr_text = result["ocr_text"]
        logos = result["logos"]
        labels = result["labels"]

    elif media_type == "video":
        # Keyframe extraction + per-frame image analysis
        frame_paths = await loop.run_in_executor(None, extract_keyframes, local_path)
        logger.info("Extracted %d keyframes", len(frame_paths))

        all_ocr_parts: list[str] = []
        all_labels: list[dict] = []
        all_logos: list[dict] = []

        for fp in frame_paths:
            try:
                img = Image.open(fp).convert("RGB")
                result = await loop.run_in_executor(None, analyze_image, img)
                if result["ocr_text"]:
                    all_ocr_parts.append(result["ocr_text"])
                all_labels.extend(result["labels"])
                all_logos.extend(result["logos"])
            except Exception as exc:
                logger.warning("Frame analysis failed for %s: %s", fp, exc)

        ocr_text = "\n---\n".join(all_ocr_parts)
        # Deduplicate and aggregate labels by best score
        labels = _dedupe_labels(all_labels)
        logos = _dedupe_labels(all_logos)

        # Audio track -> speech-to-text
        audio_path = await loop.run_in_executor(None, extract_audio, local_path)
        if audio_path:
            transcript = await loop.run_in_executor(None, transcribe_audio, audio_path)

    elif media_type == "audio":
        transcript = await loop.run_in_executor(None, transcribe_audio, local_path)

    else:
        logger.warning("Unknown media_type '%s' — skipping", media_type)

    return {
        "ocr_text": ocr_text,
        "labels_json": json.dumps({"scene_labels": labels, "logos": logos}),
        "transcript": transcript,
        "logos": logos,
    }


def _dedupe_labels(items: list[dict]) -> list[dict]:
    """Merge duplicate labels keeping the highest score."""
    best: dict[str, float] = {}
    for item in items:
        lbl = item["label"]
        scr = item["score"]
        if lbl not in best or scr > best[lbl]:
            best[lbl] = scr
    merged = [{"label": k, "score": v} for k, v in best.items()]
    merged.sort(key=lambda x: x["score"], reverse=True)
    return merged[:10]


# ---------------------------------------------------------------------------
# Database update
# ---------------------------------------------------------------------------


async def update_mention_media(
    session_factory,
    mention_id: int,
    ocr_text: str,
    labels_json: str,
    transcript: str,
):
    """Persist media analysis results back into the Mention row."""
    async with session_factory() as db:
        await db.execute(
            update(Mention)
            .where(Mention.id == mention_id)
            .values(
                media_ocr_text=ocr_text or None,
                media_labels=labels_json or None,
                media_transcript=transcript or None,
            )
        )
        await db.commit()
    logger.debug("Updated Mention %d with media results", mention_id)


# ---------------------------------------------------------------------------
# Consumer loop
# ---------------------------------------------------------------------------


async def process_message(
    bus: EventBus,
    session_factory,
    msg_id: str,
    data: dict,
):
    """Process a single media analysis request."""
    mention_id = int(data.get("mention_id", 0))
    project_id = int(data.get("project_id", 0))
    media_url = data.get("media_url", "")
    media_type = data.get("media_type", "image")

    if not media_url:
        logger.warning("No media_url in message %s — skipping", msg_id)
        return

    # Validate media URL against SSRF before processing
    try:
        validate_url(media_url)
    except ValueError as e:
        logger.warning("Skipping media item due to SSRF validation failure: %s — %s", media_url[:120], e)
        return

    logger.info(
        "Analysing %s media for mention %d (project %d): %s",
        media_type,
        mention_id,
        project_id,
        media_url[:120],
    )

    with tempfile.TemporaryDirectory(prefix="khushfus_media_") as tmp_dir:
        result = await analyze_media(media_url, media_type, tmp_dir)

    # Publish result event
    logo_names = ",".join(logo["label"] for logo in result.get("logos", []))
    event = MediaResultEvent(
        mention_id=mention_id,
        ocr_text=result["ocr_text"][:10000],  # cap field sizes
        labels=result["labels_json"][:10000],
        transcript=result["transcript"][:30000],
        logo_detected=logo_names,
    )
    await bus.publish(STREAM_MEDIA_RESULTS, event)

    # Update Postgres
    await update_mention_media(
        session_factory,
        mention_id,
        result["ocr_text"][:10000],
        result["labels_json"][:10000],
        result["transcript"][:30000],
    )

    logger.info(
        "Media analysis complete for mention %d — OCR=%d chars, logos=%s, transcript=%d chars",
        mention_id,
        len(result["ocr_text"]),
        logo_names or "(none)",
        len(result["transcript"]),
    )


async def process_loop(bus: EventBus, session_factory, shutdown_event: asyncio.Event):
    """Main consumer loop: read from media:analyze stream."""
    await bus.ensure_group(STREAM_MEDIA_ANALYSIS, GROUP_NAME)
    logger.info("Media Analysis Service listening on '%s'...", STREAM_MEDIA_ANALYSIS)

    while not shutdown_event.is_set():
        try:
            messages = await bus.consume(
                STREAM_MEDIA_ANALYSIS,
                GROUP_NAME,
                CONSUMER_NAME,
                count=BATCH_SIZE,
                block_ms=5000,
            )

            if not messages:
                continue

            for msg_id, data in messages:
                try:
                    await process_message(bus, session_factory, msg_id, data)
                except Exception as exc:
                    logger.error("Failed to process media message %s: %s", msg_id, exc, exc_info=True)
                finally:
                    await bus.ack(STREAM_MEDIA_ANALYSIS, GROUP_NAME, msg_id)

        except Exception as exc:
            logger.error("Media consumer loop error: %s", exc, exc_info=True)
            await asyncio.sleep(2)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


shutdown_event = asyncio.Event()


async def main():
    engine, session_factory = create_db(DATABASE_URL)
    bus = EventBus(REDIS_URL)
    await bus.connect()

    loop = asyncio.get_running_loop()
    try:
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, shutdown_event.set)
    except NotImplementedError:
        # Windows does not support add_signal_handler
        pass

    logger.info("Media Analysis Service started (group=%s, consumer=%s)", GROUP_NAME, CONSUMER_NAME)

    try:
        await process_loop(bus, session_factory, shutdown_event)
    finally:
        logger.info("Media Analysis Service shutting down gracefully")
        await bus.close()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
