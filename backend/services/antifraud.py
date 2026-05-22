"""Antifraud post-processor: pixel-level randomisation to break pHash families."""
from __future__ import annotations

import random
from io import BytesIO

import numpy as np
from PIL import Image, ImageEnhance


def antifraud_process(image_bytes: bytes, strength: float = 1.0) -> bytes:
    """Apply rotation + edge crop + color jitter + imperceptible noise."""
    strength = max(0.2, min(2.0, strength))

    img = Image.open(BytesIO(image_bytes)).convert("RGB")

    rot = random.uniform(-0.5, 0.5) * strength
    img = img.rotate(rot, resample=Image.BICUBIC, expand=False)

    w, h = img.size
    crop_px = max(1, int(round(random.randint(1, 3) * strength)))
    img = img.crop((crop_px, crop_px, w - crop_px, h - crop_px))
    img = img.resize((w, h), Image.LANCZOS)

    jitter = 0.02 * strength
    img = ImageEnhance.Brightness(img).enhance(random.uniform(1 - jitter, 1 + jitter))
    img = ImageEnhance.Contrast(img).enhance(random.uniform(1 - jitter, 1 + jitter))
    img = ImageEnhance.Color(img).enhance(random.uniform(1 - jitter, 1 + jitter))

    arr = np.array(img).astype(np.int16)
    amp = max(1, int(round(2 * strength)))
    noise = np.random.randint(-amp, amp + 1, arr.shape, dtype=np.int16)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr)

    out = BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()
