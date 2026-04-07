"""
Lightweight Social Studio platform metadata.

This module intentionally avoids importing any heavy vision dependencies so the
platform-discovery endpoint can stay fast.
"""

from __future__ import annotations

from dataclasses import dataclass


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
