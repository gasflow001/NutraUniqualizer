"""Build the final image-generation prompt from step1+step2+step3 state."""
from __future__ import annotations

from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


LATIN_LANGS_HINT = (
    "Render the text exactly as written in the user's original language. "
    "Do not transliterate. Keep diacritics."
)

NON_LATIN_LANGS = {"ja", "zh", "ko", "ar", "hi", "th", "he", "bn", "ta"}


def select_model(source_lang: str | None, requested: str = "auto") -> tuple[str, str | None]:
    """Returns (model, warning).

    requested ∈ {auto, GEM_PIX, GEM_PIX_2}.
    Auto: GEM_PIX_2 for non-Latin scripts (with a warning) and as the default.
    """
    requested = (requested or "auto").lower()
    if requested == "gem_pix":
        return "GEM_PIX", None
    if requested == "gem_pix_2":
        return "GEM_PIX_2", None

    lang = (source_lang or "en").lower()
    if lang in NON_LATIN_LANGS:
        return "GEM_PIX_2", "multilingual model auto-selected for non-Latin script"
    return "GEM_PIX_2", None


def _segment_text(seg) -> str:
    """Extract original text from a segment. Handles both single dict and array formats."""
    if not seg:
        return ""
    if isinstance(seg, list):
        parts = [_segment_text(s) for s in seg]
        return " | ".join(p for p in parts if p)
    if isinstance(seg, dict):
        return (seg.get("original") or "").strip()
    return ""


def _benefits_list(benefits: list[dict] | None) -> str:
    if not benefits:
        return "    (none)"
    items = []
    for b in benefits[:4]:  # cap to keep prompt short
        t = _segment_text(b)
        if t:
            items.append(f"    ✓ {t}")
    return "\n".join(items) if items else "    (none)"


def _badges_list(badges: list[dict] | None) -> str:
    if not badges:
        return "    (none)"
    items = [_segment_text(b) for b in badges[:5] if _segment_text(b)]
    return "\n".join(f"    • {t}" for t in items) if items else "    (none)"


def _layout_instructions(layout_data: dict | None, mode: str) -> str:
    if mode != "manual" or not layout_data:
        return (
            "Compose naturally for a Facebook 1:1 ad — product as focal point with "
            "supporting text/benefits/CTA placed in a balanced, readable arrangement."
        )
    zones = layout_data.get("zones") or []
    if not zones:
        return "Use a balanced ad composition; product is the focal point."
    lines = []
    for z in zones:
        label = z.get("label") or z.get("id") or "element"
        x, y, w, h = z.get("x", 0), z.get("y", 0), z.get("w", 0), z.get("h", 0)
        loc = _zone_to_phrase(x, y, w, h)
        lines.append(f"- {label}: {loc}")
    human = layout_data.get("human_subject") or {}
    if human.get("present"):
        lines.append(
            f"- human subject: {human.get('role', 'person')} on the {human.get('position', 'side')}"
        )
    return "\n".join(lines)


def _zone_to_phrase(x: float, y: float, w: float, h: float) -> str:
    cx, cy = x + w / 2, y + h / 2
    horiz = "left" if cx < 0.33 else ("right" if cx > 0.66 else "center")
    vert = "top" if cy < 0.33 else ("bottom" if cy > 0.66 else "middle")
    return f"{vert}-{horiz} area"


def _design_reference_section(analysis: dict | None) -> str:
    if not analysis:
        return (
            "No specific design reference provided. Create a fresh composition "
            "following standard nutra-ad conventions: medical/clinical feel, "
            "product as focal point, trust-building elements."
        )
    parts = []
    if analysis.get("scene_description"):
        parts.append(f"SCENE: {analysis['scene_description']}")
    if analysis.get("composition_style"):
        parts.append(f"COMPOSITION: {analysis['composition_style']}")
    if analysis.get("visual_metaphors"):
        metaphors = ", ".join(analysis["visual_metaphors"]) if isinstance(analysis["visual_metaphors"], list) else str(analysis["visual_metaphors"])
        parts.append(f"VISUAL METAPHORS to recreate (uniquely): {metaphors}")
    if analysis.get("mood"):
        parts.append(f"MOOD: {analysis['mood']}")
    if analysis.get("color_scheme") and isinstance(analysis["color_scheme"], dict):
        cs = analysis["color_scheme"]
        parts.append(f"COLOR SCHEME: primary {cs.get('primary','')}, secondary {cs.get('secondary','')}, accent {cs.get('accent','')}, bg {cs.get('background','')}")
    if analysis.get("ui_elements"):
        elems = ", ".join(analysis["ui_elements"]) if isinstance(analysis["ui_elements"], list) else str(analysis["ui_elements"])
        parts.append(f"UI ELEMENTS to include: {elems}")
    if analysis.get("props"):
        props = ", ".join(analysis["props"]) if isinstance(analysis["props"], list) else str(analysis["props"])
        parts.append(f"PROPS/OBJECTS in scene: {props}")
    hs = analysis.get("human_subjects") or {}
    if hs.get("present"):
        parts.append(f"HUMAN SUBJECT: {hs.get('description', 'present in scene')}")
    ts = analysis.get("text_styling") or {}
    if ts:
        styling = []
        if ts.get("headline_style"): styling.append(f"headline: {ts['headline_style']}")
        if ts.get("body_style"): styling.append(f"body: {ts['body_style']}")
        if ts.get("cta_style"): styling.append(f"CTA: {ts['cta_style']}")
        if styling:
            parts.append(f"TEXT STYLING: {'; '.join(styling)}")
    if analysis.get("unique_features"):
        feats = ", ".join(analysis["unique_features"]) if isinstance(analysis["unique_features"], list) else str(analysis["unique_features"])
        parts.append(f"UNIQUE FEATURES to preserve (in a fresh way): {feats}")
    return "\n".join(parts)


def build(
    *,
    segments: dict,
    layout: dict | None,
    layout_mode: str,
    product_meta: dict,
    aspect_ratio: str = "1:1",
    design_analysis: dict | None = None,
    has_certificate: bool = False,
    has_doctor: bool = False,
) -> str:
    """Render the final prompt from prompts/final_generation.txt with substitutions."""
    template = (PROMPTS_DIR / "final_generation.txt").read_text(encoding="utf-8")

    segs = segments.get("segments") or segments  # accept both shapes
    source_lang = segments.get("source_lang") or "en"

    palette = (layout or {}).get("palette") or ["#0B3B82", "#FFFFFF", "#F4A623", "#D9342B"]
    style = (layout or {}).get("style") or "photorealistic_medical_ad"
    mood = (layout or {}).get("mood") or "trust_urgency"
    visual_elements = (layout or {}).get("visual_elements") or [
        "checkmarks",
        "discount_badge",
        "cta_button",
    ]

    filled = template.format(
        aspect_ratio=aspect_ratio,
        brand_name=product_meta.get("brand_name") or "the product",
        package_type=product_meta.get("package_type") or "bottle",
        source_lang=source_lang,
        headline_original=_segment_text(segs.get("headline")),
        subheadline_original=_segment_text(segs.get("subheadline")),
        benefits_bullet_list=_benefits_list(segs.get("benefits")),
        cta_original=_segment_text(segs.get("cta")),
        badges_list=_badges_list(segs.get("badges")),
        layout_instructions=_layout_instructions(layout, layout_mode),
        style=style,
        mood=mood,
        palette_hex_list=", ".join(palette),
        visual_elements_list=", ".join(visual_elements),
        design_reference_section=_design_reference_section(design_analysis),
    )
    if has_certificate:
        filled += (
            "\n\nCERTIFICATE IMAGE (attached as an additional reference):\n"
            "An official certificate/seal image is attached. Include it in the creative as a "
            "visible, legible overlay element. Place it in a corner or side area (e.g. bottom-right "
            "or top-left) at roughly 15-20% of canvas size. It should be clearly readable but NOT "
            "the main focal point — the product remains the hero. Do NOT alter the certificate content, "
            "reproduce it exactly as-is. Tilt it slightly (5-10°) for a natural, organic look."
        )
    if has_doctor:
        filled += (
            "\n\nDOCTOR PHOTO (attached as an additional reference):\n"
            "A photo of a doctor/medical professional is attached. Place the doctor in the BACKGROUND "
            "on the LEFT or RIGHT side of the creative. The doctor should be partially visible "
            "(roughly 25-35% of canvas width), slightly blurred or softened compared to the product. "
            "The doctor adds trust and medical credibility but must NOT overshadow the product — "
            "the product jar/bottle remains the main focal point in the foreground. "
            "Reproduce the doctor's appearance faithfully from the attached photo. "
            "The doctor should wear a white coat and look professional and trustworthy."
        )
    return filled


def build_edit_prompt(base_prompt: str, instruction: str) -> str:
    return (
        base_prompt
        + "\n\n--- EDIT INSTRUCTION (apply to the attached current creative; "
        "second reference is the product to preserve) ---\n"
        + instruction.strip()
    )
