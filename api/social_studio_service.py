"""
Social Studio service.

This module turns a user-uploaded ZIP of matched photos into platform-specific
recommendations. The design intentionally separates platform configuration from
the core pipeline so new destinations can be added with minimal backend churn.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Optional
import json
import logging
import math
import tempfile
import zipfile

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from config import settings
from face_recognition_service import get_face_recognition_service

try:
    from huggingface_hub import InferenceClient
except ImportError:  # pragma: no cover - optional dependency for local fallback mode
    InferenceClient = None

logger = logging.getLogger(__name__)

SUPPORTED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


@dataclass(frozen=True)
class PlatformDefinition:
    key: str
    label: str
    description: str
    narrative: str
    primary_copy_label: str
    secondary_copy_label: str
    suggestion_target: int
    card_noun: str


@dataclass
class ImageAsset:
    file_name: str
    path: Path
    width: int
    height: int
    orientation: str
    brightness: float
    contrast: float
    sharpness: float
    saturation: float
    face_count: int
    largest_face_ratio: float
    caption: str = ""


PLATFORM_DEFINITIONS = {
    "instagram": PlatformDefinition(
        key="instagram",
        label="Instagram",
        description="Build polished carousels and a caption that feels intentional.",
        narrative="curate image groups that feel cohesive in an Instagram post or carousel",
        primary_copy_label="Caption",
        secondary_copy_label="Carousel Hook",
        suggestion_target=3,
        card_noun="Post Set",
    ),
    "snapchat": PlatformDefinition(
        key="snapchat",
        label="Snapchat",
        description="Pick punchy story-ready images with overlay text that lands fast.",
        narrative="pick bright, immediate story moments that feel natural on Snapchat",
        primary_copy_label="Story Script",
        secondary_copy_label="Overlay Text",
        suggestion_target=3,
        card_noun="Story Flow",
    ),
    "tinder": PlatformDefinition(
        key="tinder",
        label="Tinder",
        description="Suggest dating-profile picks, ordering, and funny openers.",
        narrative="build a strong dating-profile mix with clear, attractive, and playful images",
        primary_copy_label="Profile Angle",
        secondary_copy_label="Funny Punchline",
        suggestion_target=3,
        card_noun="Dating Pick",
    ),
}


class SocialStudioError(Exception):
    """Raised when social-studio analysis cannot continue."""


def list_platforms() -> list[dict]:
    """Return UI-friendly platform metadata."""
    return [
        {
            "key": platform.key,
            "label": platform.label,
            "description": platform.description,
            "primary_copy_label": platform.primary_copy_label,
            "secondary_copy_label": platform.secondary_copy_label,
            "card_noun": platform.card_noun,
        }
        for platform in PLATFORM_DEFINITIONS.values()
    ]


def analyze_zip_for_platform(zip_bytes: bytes, platform_key: str, upload_name: str = "matches.zip") -> dict:
    """Analyze a ZIP archive and return platform-specific social suggestions."""
    platform = PLATFORM_DEFINITIONS.get(platform_key)
    if not platform:
        raise SocialStudioError(f"Unsupported platform '{platform_key}'.")

    zip_size_mb = len(zip_bytes) / (1024 * 1024)
    if zip_size_mb > settings.SOCIAL_STUDIO_MAX_ZIP_MB:
        raise SocialStudioError(
            f"ZIP file is too large ({zip_size_mb:.1f} MB). Max allowed is {settings.SOCIAL_STUDIO_MAX_ZIP_MB} MB."
        )

    social_dir = Path(settings.TEMP_STORAGE_PATH) / "social_studio"
    social_dir.mkdir(parents=True, exist_ok=True)

    try:
        with tempfile.TemporaryDirectory(dir=social_dir) as temp_dir:
            extracted = _extract_zip_images(zip_bytes, Path(temp_dir))
            assets = extracted["assets"]
            total_images = extracted["total_images"]

            if not assets:
                raise SocialStudioError("No supported images were found in that ZIP file.")

            _build_local_captions(assets)

            ai_mode = False
            packs = []
            summary = ""
            guidance = []
            warnings = extracted["warnings"][:]
            provider = "heuristic"
            model = None

            if settings.HF_TOKEN and InferenceClient is not None:
                if len(assets) > settings.SOCIAL_STUDIO_AI_IMAGE_LIMIT:
                    warnings.append(
                        f"The AI pass reviewed the top {settings.SOCIAL_STUDIO_AI_IMAGE_LIMIT} images to keep the analysis responsive."
                    )
                try:
                    packs, summary, guidance = _generate_multimodal_ai_recommendations(platform, assets)
                    ai_mode = True
                    provider = "huggingface-vision"
                    model = settings.HF_VISION_MODEL
                except Exception as e:  # pragma: no cover - depends on external provider
                    logger.warning("Vision AI recommendations failed, trying text-only fallback: %s", e)
                    warnings.append(
                        "The multimodal AI pass was unavailable, so we retried with the text-only recommender."
                    )
                    try:
                        packs, summary, guidance = _generate_text_ai_recommendations(platform, assets)
                        ai_mode = True
                        provider = "huggingface-text"
                        model = settings.HF_TEXT_MODEL
                    except Exception as text_error:  # pragma: no cover - depends on external provider
                        logger.warning("Text-only AI recommendations failed, using heuristic fallback: %s", text_error)
                        warnings.append(
                            "AI suggestions were unavailable, so we used the local fallback recommender."
                        )

            if not packs:
                packs, summary, guidance = _generate_fallback_recommendations(platform, assets)

            return {
                "platform": {
                    "key": platform.key,
                    "label": platform.label,
                    "description": platform.description,
                    "primary_copy_label": platform.primary_copy_label,
                    "secondary_copy_label": platform.secondary_copy_label,
                    "card_noun": platform.card_noun,
                },
                "analysis_mode": "ai" if ai_mode else "heuristic",
                "provider": provider,
                "model": model,
                "upload_name": upload_name,
                "total_images_in_zip": total_images,
                "analyzed_images": len(assets),
                "summary": summary,
                "guidance": guidance,
                "warnings": warnings,
                "packs": packs,
                "assets": [_serialize_asset(asset) for asset in assets],
            }
    except zipfile.BadZipFile as e:
        raise SocialStudioError("That file was not a readable ZIP archive.") from e


def _extract_zip_images(zip_bytes: bytes, temp_dir: Path) -> dict:
    """Extract a bounded number of supported images from an uploaded ZIP."""
    warnings = []
    with zipfile.ZipFile(BytesIO(zip_bytes)) as archive:
        image_members = [
            member
            for member in archive.infolist()
            if not member.is_dir() and Path(member.filename).suffix.lower() in SUPPORTED_IMAGE_SUFFIXES
        ]

        total_images = len(image_members)
        if total_images == 0:
            return {"assets": [], "total_images": 0, "warnings": warnings}

        selected_members = _sample_evenly(image_members, settings.SOCIAL_STUDIO_IMAGE_LIMIT)
        if total_images > len(selected_members):
            warnings.append(
                f"Analyzed {len(selected_members)} images out of {total_images} to keep recommendations fast."
            )

        face_service = _get_face_service_safe()
        assets = []
        used_names: dict[str, int] = {}
        for index, member in enumerate(selected_members, start=1):
            original_name = Path(member.filename).name or f"image_{index}.jpg"
            file_name = _dedupe_display_name(original_name, used_names)
            safe_path = temp_dir / f"{index:03d}_{Path(file_name).stem}.jpg"

            try:
                raw_bytes = archive.read(member)
                asset = _write_and_analyze_asset(raw_bytes, safe_path, file_name, face_service)
                if asset:
                    assets.append(asset)
            except (KeyError, UnidentifiedImageError, OSError, ValueError) as e:
                logger.warning("Skipping invalid ZIP image %s: %s", member.filename, e)

        return {"assets": assets, "total_images": total_images, "warnings": warnings}


def _write_and_analyze_asset(
    raw_bytes: bytes,
    target_path: Path,
    file_name: str,
    face_service,
) -> Optional[ImageAsset]:
    """Persist one uploaded image temporarily and compute its descriptive features."""
    with Image.open(BytesIO(raw_bytes)) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        width, height = image.size
        image.save(target_path, format="JPEG", quality=92)

    cv_image = cv2.imread(str(target_path), cv2.IMREAD_COLOR)
    if cv_image is None:
        raise ValueError("Image could not be decoded by OpenCV.")

    brightness, contrast, sharpness, saturation = _compute_visual_metrics(cv_image)
    face_count, largest_face_ratio = _compute_face_metrics(cv_image, face_service)
    orientation = "portrait" if height >= width else "landscape"

    return ImageAsset(
        file_name=file_name,
        path=target_path,
        width=width,
        height=height,
        orientation=orientation,
        brightness=brightness,
        contrast=contrast,
        sharpness=sharpness,
        saturation=saturation,
        face_count=face_count,
        largest_face_ratio=largest_face_ratio,
    )


def _compute_visual_metrics(cv_image: np.ndarray) -> tuple[float, float, float, float]:
    """Compute simple but useful image-quality metrics."""
    gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(cv_image, cv2.COLOR_BGR2HSV)

    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    saturation = float(np.mean(hsv[:, :, 1]))

    return brightness, contrast, sharpness, saturation


def _compute_face_metrics(cv_image: np.ndarray, face_service) -> tuple[int, float]:
    """Estimate face count and how dominant the biggest face is."""
    if face_service is None:
        return 0, 0.0

    try:
        resized = _resize_for_analysis(cv_image, settings.MAX_IMAGE_DIMENSION)
        faces = face_service.app.get(resized)
        if not faces:
            return 0, 0.0

        image_area = float(resized.shape[0] * resized.shape[1]) or 1.0
        largest_face_area = max(_bbox_area(face.bbox) for face in faces)
        return len(faces), largest_face_area / image_area
    except Exception as e:
        logger.warning("Face analysis failed during social-studio processing: %s", e)
        return 0, 0.0


def _resize_for_analysis(cv_image: np.ndarray, max_dimension: int) -> np.ndarray:
    """Downscale large images before running extra analysis work."""
    height, width = cv_image.shape[:2]
    longest_side = max(height, width)
    if longest_side <= max_dimension:
        return cv_image

    scale = max_dimension / float(longest_side)
    return cv2.resize(
        cv_image,
        (max(1, int(width * scale)), max(1, int(height * scale))),
        interpolation=cv2.INTER_AREA,
    )


def _bbox_area(bbox: np.ndarray) -> float:
    x1, y1, x2, y2 = bbox
    return max(0.0, (x2 - x1) * (y2 - y1))


def _build_local_captions(assets: list[ImageAsset]):
    """Fill per-image captions locally so the UI always has lightweight asset descriptions."""
    for asset in assets:
        asset.caption = _build_local_caption(asset)


def _build_local_caption(asset: ImageAsset) -> str:
    """Produce a light descriptive caption without an LLM."""
    vibe = "bright" if asset.brightness >= 140 else "moody"
    framing = "close portrait" if asset.largest_face_ratio >= 0.08 else asset.orientation
    clarity = "crisp" if asset.sharpness >= 120 else "soft"

    if asset.face_count >= 2:
        people = "group energy"
    elif asset.face_count == 1:
        people = "solo subject"
    else:
        people = "scene-driven moment"

    return f"{vibe} {clarity} {framing} with {people}".strip()


def _generate_multimodal_ai_recommendations(
    platform: PlatformDefinition,
    assets: list[ImageAsset],
) -> tuple[list[dict], str, list[str]]:
    """Use a vision-language model to analyze a focused image set directly."""
    selected_assets = _select_assets_for_ai(platform, assets)
    if not selected_assets:
        raise SocialStudioError("No images were available for the multimodal analysis pass.")

    client = InferenceClient(api_key=settings.HF_TOKEN)
    metrics_block = _build_asset_metrics_block(selected_assets)
    content = [
        {
            "type": "text",
            "text": (
                f"You are a social media creative director. Build {platform.label} recommendations from this photo set.\n"
                f"Goal: {platform.narrative}.\n"
                f"Return {platform.suggestion_target} packs.\n"
                f"Only use filenames from this list: {', '.join(asset.file_name for asset in selected_assets)}.\n"
                "Choose distinct images across packs when possible.\n"
                "Instagram should feel polished, Snapchat should feel immediate, and Tinder should stay strictly dating-oriented and playful.\n"
                "Use the image content first, and use these local metrics as extra context only:\n"
                f"{metrics_block}"
            ),
        }
    ]

    for asset in selected_assets:
        content.extend(
            [
                {
                    "type": "text",
                    "text": (
                        f"Image file: {asset.file_name}. "
                        f"Local caption: {asset.caption}. "
                        f"Faces={asset.face_count}, orientation={asset.orientation}, "
                        f"dominant_face_ratio={asset.largest_face_ratio:.3f}."
                    ),
                },
                {
                    "type": "image_url",
                    "image_url": {"url": _image_path_to_data_url(asset.path)},
                },
            ]
        )

    response_format = {
        "type": "json",
        "value": {
            "properties": {
                "summary": {"type": "string"},
                "guidance": {"type": "array", "items": {"type": "string"}},
                "packs": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "image_files": {"type": "array", "items": {"type": "string"}},
                            "rationale": {"type": "string"},
                            "primary_copy": {"type": "string"},
                            "secondary_copy": {"type": "string"},
                        },
                        "required": [
                            "title",
                            "image_files",
                            "rationale",
                            "primary_copy",
                            "secondary_copy",
                        ],
                    },
                },
            },
            "required": ["summary", "guidance", "packs"],
        },
    }

    response = client.chat_completion(
        model=settings.HF_VISION_MODEL,
        messages=[
            {
                "role": "system",
                "content": "Return valid JSON only. Do not use markdown fences or commentary outside the JSON object.",
            },
            {"role": "user", "content": content},
        ],
        response_format=response_format,
        max_tokens=1400,
        temperature=0.6,
    )
    content = _extract_chat_content(response)
    payload = _parse_json_payload(content)
    packs = _normalize_packs(payload.get("packs", []), assets, platform)
    if not packs:
        raise SocialStudioError("AI response did not include usable packs.")

    summary = str(payload.get("summary", "")).strip() or _fallback_summary(platform, packs)
    guidance = [str(item).strip() for item in payload.get("guidance", []) if str(item).strip()][:4]
    if not guidance:
        guidance = _fallback_guidance(platform)

    return packs, summary, guidance


def _generate_text_ai_recommendations(platform: PlatformDefinition, assets: list[ImageAsset]) -> tuple[list[dict], str, list[str]]:
    """Use a text model with local image descriptions when the vision model is unavailable."""
    client = InferenceClient(api_key=settings.HF_TOKEN)
    asset_lines = _build_asset_lines(assets)

    system_prompt = (
        "You are a social media creative director. Return valid JSON only. "
        "Do not wrap the answer in markdown fences."
    )
    user_prompt = f"""
Create {platform.label} recommendations from this photo set.

Goal:
- {platform.narrative}
- Return exactly this JSON schema:
{{
  "summary": "short overview",
  "guidance": ["tip 1", "tip 2", "tip 3"],
  "packs": [
    {{
      "title": "string",
      "image_files": ["file1.jpg", "file2.jpg"],
      "rationale": "why these work together",
      "primary_copy": "text for {platform.primary_copy_label}",
      "secondary_copy": "text for {platform.secondary_copy_label}"
    }}
  ]
}}

Rules:
- Produce {platform.suggestion_target} packs.
- Only use filenames from the provided list.
- Choose distinct images across packs when possible.
- Keep the copy specific and platform-native.
- Tinder output is strictly dating-oriented and playful, not generic lifestyle copy.

Photos:
{chr(10).join(asset_lines)}
""".strip()

    response = client.chat_completion(
        model=settings.HF_TEXT_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=1400,
        temperature=0.8,
    )
    content = _extract_chat_content(response)
    payload = _parse_json_payload(content)
    packs = _normalize_packs(payload.get("packs", []), assets, platform)
    if not packs:
        raise SocialStudioError("AI response did not include usable packs.")

    summary = str(payload.get("summary", "")).strip() or _fallback_summary(platform, packs)
    guidance = [str(item).strip() for item in payload.get("guidance", []) if str(item).strip()][:4]
    if not guidance:
        guidance = _fallback_guidance(platform)

    return packs, summary, guidance


def _build_asset_lines(assets: list[ImageAsset]) -> list[str]:
    """Render asset metadata into prompt-friendly bullet lines."""
    return [
        (
            f"- {asset.file_name}: {asset.caption}; orientation={asset.orientation}; "
            f"faces={asset.face_count}; dominant_face_ratio={asset.largest_face_ratio:.3f}; "
            f"brightness={asset.brightness:.1f}; contrast={asset.contrast:.1f}; "
            f"sharpness={asset.sharpness:.1f}; saturation={asset.saturation:.1f}"
        )
        for asset in assets
    ]


def _build_asset_metrics_block(assets: list[ImageAsset]) -> str:
    """Create a compact metrics block for the multimodal prompt."""
    return "\n".join(_build_asset_lines(assets))


def _select_assets_for_ai(platform: PlatformDefinition, assets: list[ImageAsset]) -> list[ImageAsset]:
    """Pick a focused, high-signal subset for the multimodal prompt."""
    if len(assets) <= settings.SOCIAL_STUDIO_AI_IMAGE_LIMIT:
        return assets

    scores = _compute_platform_scores(platform.key, assets)
    ranked = sorted(assets, key=lambda asset: scores[asset.file_name], reverse=True)
    selected = ranked[: settings.SOCIAL_STUDIO_AI_IMAGE_LIMIT]
    return sorted(selected, key=lambda asset: asset.file_name)


def _image_path_to_data_url(path: Path) -> str:
    """Encode a local image into a data URL for the multimodal chat API."""
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def _extract_chat_content(response) -> str:
    """Extract text content from a Hugging Face chat-completion response."""
    if isinstance(response, str):
        return response

    choices = getattr(response, "choices", None)
    if choices:
        first_choice = choices[0]
        message = getattr(first_choice, "message", None)
        if message is not None:
            content = getattr(message, "content", None)
            if content:
                return content

    if isinstance(response, dict):
        choices = response.get("choices") or []
        if choices:
            message = choices[0].get("message") or {}
            content = message.get("content")
            if content:
                return content

    return str(response)


def _parse_json_payload(content: str) -> dict:
    """Parse raw LLM output into JSON, stripping code fences when needed."""
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        lines = [line for line in text.splitlines() if line.strip().lower() != "json"]
        text = "\n".join(lines).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


def _normalize_packs(raw_packs: list, assets: list[ImageAsset], platform: PlatformDefinition) -> list[dict]:
    """Normalize AI or fallback packs into a frontend-friendly shape."""
    known_files = {asset.file_name for asset in assets}
    packs = []

    for index, pack in enumerate(raw_packs, start=1):
        if not isinstance(pack, dict):
            continue

        image_files = [
            str(file_name).strip()
            for file_name in pack.get("image_files", [])
            if str(file_name).strip() in known_files
        ]
        if not image_files:
            continue

        packs.append(
            {
                "title": str(pack.get("title") or f"{platform.card_noun} {index}").strip(),
                "image_files": image_files,
                "rationale": str(pack.get("rationale") or "").strip(),
                "primary_copy": str(pack.get("primary_copy") or "").strip(),
                "secondary_copy": str(pack.get("secondary_copy") or "").strip(),
            }
        )

    return packs


def _generate_fallback_recommendations(platform: PlatformDefinition, assets: list[ImageAsset]) -> tuple[list[dict], str, list[str]]:
    """Create platform recommendations without external AI."""
    scores = _compute_platform_scores(platform.key, assets)
    ranked_assets = sorted(assets, key=lambda asset: scores[asset.file_name], reverse=True)

    if platform.key == "tinder":
        lead = ranked_assets[:1]
        backup = ranked_assets[1:4]
        packs = []
        if lead:
            asset = lead[0]
            packs.append(
                {
                    "title": "Lead Profile Shot",
                    "image_files": [asset.file_name],
                    "rationale": (
                        f"This image leads because it looks {asset.caption}, keeps your face readable, "
                        "and feels like the clearest first impression."
                    ),
                    "primary_copy": "Lead with this one to signal confidence without trying too hard.",
                    "secondary_copy": _tinder_punchline(asset),
                }
            )
        if backup:
            packs.append(
                {
                    "title": "Backup Mix",
                    "image_files": [asset.file_name for asset in backup],
                    "rationale": "These images add variety after the opener while still keeping the focus on you.",
                    "primary_copy": "Use this run as your supporting trio so the profile feels playful, not repetitive.",
                    "secondary_copy": "Not saying these photos will start the conversation, but they definitely will not hurt.",
                }
            )
        remaining = ranked_assets[4:5]
        if remaining:
            packs.append(
                {
                    "title": "Wild Card",
                    "image_files": [remaining[0].file_name],
                    "rationale": "Keep one slightly different image in reserve if you want the profile to feel less polished and more human.",
                    "primary_copy": "Swap this in if the profile needs a little more personality.",
                    "secondary_copy": "Proof that your camera roll has range and your jokes probably do too.",
                }
            )
        summary = "Built a dating-focused profile mix that prioritizes clear face visibility, sharpness, and a bit of range."
        return packs, summary, _fallback_guidance(platform)

    group_size = 3 if platform.key == "instagram" else 2
    packs = []
    cursor = 0
    for index in range(platform.suggestion_target):
        group = ranked_assets[cursor : cursor + group_size]
        if not group:
            break
        cursor += group_size

        packs.append(
            {
                "title": f"{platform.card_noun} {index + 1}",
                "image_files": [asset.file_name for asset in group],
                "rationale": _group_rationale(platform.key, group),
                "primary_copy": _primary_copy(platform.key, group),
                "secondary_copy": _secondary_copy(platform.key, group),
            }
        )

    summary = _fallback_summary(platform, packs)
    guidance = _fallback_guidance(platform)
    return packs, summary, guidance


def _compute_platform_scores(platform_key: str, assets: list[ImageAsset]) -> dict[str, float]:
    """Score images differently depending on the target platform."""
    sharpness = _normalize_metric([asset.sharpness for asset in assets])
    brightness = _normalize_metric([asset.brightness for asset in assets])
    contrast = _normalize_metric([asset.contrast for asset in assets])
    saturation = _normalize_metric([asset.saturation for asset in assets])
    face_ratio = _normalize_metric([asset.largest_face_ratio for asset in assets])
    face_count = _normalize_metric([float(asset.face_count) for asset in assets])

    scores = {}
    for index, asset in enumerate(assets):
        if platform_key == "instagram":
            score = (
                0.30 * sharpness[index]
                + 0.20 * saturation[index]
                + 0.15 * contrast[index]
                + 0.20 * face_ratio[index]
                + 0.15 * brightness[index]
            )
        elif platform_key == "snapchat":
            portrait_bonus = 0.12 if asset.orientation == "portrait" else 0.0
            score = (
                0.25 * brightness[index]
                + 0.20 * saturation[index]
                + 0.20 * sharpness[index]
                + 0.15 * face_count[index]
                + 0.08 * face_ratio[index]
                + portrait_bonus
            )
        else:
            solo_bonus = 0.18 if asset.face_count == 1 else 0.0
            penalty = 0.12 if asset.face_count > 2 else 0.0
            score = (
                0.30 * sharpness[index]
                + 0.25 * face_ratio[index]
                + 0.15 * brightness[index]
                + 0.15 * contrast[index]
                + 0.12 * saturation[index]
                + solo_bonus
                - penalty
            )

        scores[asset.file_name] = score

    return scores


def _normalize_metric(values: list[float]) -> list[float]:
    """Normalize a metric list to 0..1 without exploding on flat values."""
    if not values:
        return []
    minimum = min(values)
    maximum = max(values)
    if math.isclose(minimum, maximum):
        return [0.5 for _ in values]
    scale = maximum - minimum
    return [(value - minimum) / scale for value in values]


def _group_rationale(platform_key: str, group: list[ImageAsset]) -> str:
    captions = ", ".join(asset.caption for asset in group)
    if platform_key == "instagram":
        return f"This set balances variety and polish, with a clean visual rhythm across {captions}."
    return f"This flow works because the images feel immediate and readable in sequence: {captions}."


def _primary_copy(platform_key: str, group: list[ImageAsset]) -> str:
    lead_caption = group[0].caption
    if platform_key == "instagram":
        return f"Main character energy, zero chaos. {lead_caption.capitalize()}, and the rest of the carousel keeps the story moving."
    if platform_key == "snapchat":
        return f"Start with {lead_caption}, then let the rest of the snaps feel spontaneous instead of over-explained."
    return "Lead with the clearest shot, then let the supporting images add range without confusing the vibe."


def _secondary_copy(platform_key: str, group: list[ImageAsset]) -> str:
    if platform_key == "instagram":
        return "Swipe for the version of me that was clearly having a better day than my camera roll usually suggests."
    if platform_key == "snapchat":
        return "POV: I actually picked the good ones this time."
    return _tinder_punchline(group[0])


def _tinder_punchline(asset: ImageAsset) -> str:
    if asset.face_count == 1:
        return "Good lighting, decent jawline, and at least one full conversation in stock."
    return "If this photo says anything, it is that I leave the house and occasionally look photogenic."


def _fallback_summary(platform: PlatformDefinition, packs: list[dict]) -> str:
    if platform.key == "instagram":
        return "Picked the cleanest groups for a strong carousel rhythm and a caption that feels deliberate."
    if platform.key == "snapchat":
        return "Built quick-hit story flows that stay bright, readable, and easy to post fast."
    return "Ranked the set for dating-profile clarity, face readability, and a little personality."


def _fallback_guidance(platform: PlatformDefinition) -> list[str]:
    if platform.key == "instagram":
        return [
            "Lead with the strongest opener photo and let the supporting images vary the framing.",
            "Keep the caption personal and specific instead of writing a generic mood statement.",
            "If two images feel nearly identical, post the sharper one and save the other.",
        ]
    if platform.key == "snapchat":
        return [
            "Open with the brightest image so the story feels immediate.",
            "Use short overlay text and let the visuals do most of the work.",
            "Mix one close shot with one wider moment so the story does not feel repetitive.",
        ]
    return [
        "Lead with a clear solo shot where your face is easy to read.",
        "Do not stack too many nearly identical selfies in a row.",
        "A playful line works best when the photos already look relaxed and genuine.",
    ]


def _serialize_asset(asset: ImageAsset) -> dict:
    """Convert an analyzed asset into JSON-friendly metadata."""
    return {
        "file_name": asset.file_name,
        "caption": asset.caption,
        "orientation": asset.orientation,
        "width": asset.width,
        "height": asset.height,
        "face_count": asset.face_count,
        "largest_face_ratio": round(asset.largest_face_ratio, 4),
        "brightness": round(asset.brightness, 1),
        "contrast": round(asset.contrast, 1),
        "sharpness": round(asset.sharpness, 1),
        "saturation": round(asset.saturation, 1),
    }


def _sample_evenly(items: list, limit: int) -> list:
    """Sample evenly from a list while preserving order."""
    if len(items) <= limit:
        return items
    if limit <= 1:
        return items[:1]

    step = (len(items) - 1) / float(limit - 1)
    indices = sorted({round(index * step) for index in range(limit)})
    return [items[index] for index in indices]


def _dedupe_display_name(file_name: str, used_names: dict[str, int]) -> str:
    """Keep duplicate ZIP filenames distinct for prompts and UI cards."""
    candidate = Path(file_name).name or "image.jpg"
    occurrence = used_names.get(candidate, 0)
    used_names[candidate] = occurrence + 1
    if occurrence == 0:
        return candidate

    suffix = Path(candidate).suffix
    stem = Path(candidate).stem
    return f"{stem}_{occurrence + 1}{suffix}"


def _get_face_service_safe():
    """Load the face model only when possible, but do not block the feature on it."""
    try:
        return get_face_recognition_service()
    except Exception as e:
        logger.warning("Social studio could not initialize face analysis: %s", e)
        return None
