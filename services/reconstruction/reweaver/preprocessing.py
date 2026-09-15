"""
Image preprocessing utilities for ReWeaver multi-view reconstruction.
Standardizes input images to 518x518 RGB tensors with GCD-TS normalization.
"""

from __future__ import annotations
from typing import List, Union, Tuple, Any
from pathlib import Path
import io
import base64
import numpy as np
import torch

# Standard normalization statistics from configs/eval_gcd.yaml and data.py
GCD_IMG_MEAN = [0.9329, 0.9249, 0.9200]
GCD_IMG_STD = [0.1885, 0.2093, 0.2226]
TARGET_IMAGE_SIZE = 518

ImageInputType = Union[str, Path, Any, np.ndarray, bytes]


def _get_pil_image_cls():
    try:
        from PIL import Image
        return Image
    except ImportError:
        raise ImportError("Pillow is required for image preprocessing. Install via `pip install pillow`.")


def load_image(source: ImageInputType) -> Any:
    """Load an image from a path, numpy array, raw bytes, base64 string, or PIL Image."""
    Image = _get_pil_image_cls()
    if isinstance(source, Image.Image):
        return source.convert("RGB")
    elif isinstance(source, (str, Path)):
        path = Path(source)
        if path.exists() and path.is_file():
            return Image.open(path).convert("RGB")
        # Check if it is a base64 encoded data URI
        if isinstance(source, str) and source.startswith("data:image"):
            encoded = source.split(",", 1)[1]
            return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")
        raise FileNotFoundError(f"Image path not found: {source}")
    elif isinstance(source, bytes):
        return Image.open(io.BytesIO(source)).convert("RGB")
    elif isinstance(source, np.ndarray):
        if source.dtype == np.float32 or source.dtype == np.float64:
            if source.max() <= 1.0:
                source = (source * 255.0).clip(0, 255).astype(np.uint8)
            else:
                source = source.clip(0, 255).astype(np.uint8)
        return Image.fromarray(source).convert("RGB")
    else:
        raise TypeError(f"Unsupported image input type: {type(source)}")


def prepare_single_image(
    source: ImageInputType,
    target_size: int = TARGET_IMAGE_SIZE,
    pad_color: Tuple[int, int, int] = (255, 255, 255),
) -> np.ndarray:
    """
    Load, square-pad, resize to target_size, and convert to (3, H, W) float32 in [0, 1].
    """
    Image = _get_pil_image_cls()
    img = load_image(source)
    w, h = img.size

    # Fit into square canvas while preserving aspect ratio
    max_side = max(w, h)
    if w != h:
        square_img = Image.new("RGB", (max_side, max_side), pad_color)
        paste_x = (max_side - w) // 2
        paste_y = (max_side - h) // 2
        square_img.paste(img, (paste_x, paste_y))
        img = square_img

    if img.size != (target_size, target_size):
        img = img.resize((target_size, target_size), Image.Resampling.BILINEAR)

    # Convert to float32 [0.0, 1.0] and transpose to (C, H, W)
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = arr.clip(0.0, 1.0)
    arr = np.transpose(arr, (2, 0, 1))  # (3, 518, 518)
    return arr


def preprocess_multiview_images(
    images: List[ImageInputType],
    device: torch.device | str = "cpu",
    mean: List[float] = GCD_IMG_MEAN,
    std: List[float] = GCD_IMG_STD,
) -> torch.Tensor:
    """
    Preprocesses a list of multi-view images (e.g. 4 views: front, right, back, left).
    Returns a PyTorch tensor of shape [1, S, 3, 518, 518] normalized with GCD statistics.
    """
    if len(images) == 0:
        raise ValueError("At least one viewpoint image must be provided.")

    processed_list = [prepare_single_image(img) for img in images]
    stacked = np.stack(processed_list, axis=0)  # Shape: (S, 3, H, W)

    # Normalize: (S, 3, H, W) - (1, 3, 1, 1) / (1, 3, 1, 1)
    mean_arr = np.array(mean, dtype=np.float32).reshape(1, 3, 1, 1)
    std_arr = np.array(std, dtype=np.float32).reshape(1, 3, 1, 1)
    normalized = (stacked - mean_arr) / std_arr

    # Add batch dimension: [1, S, 3, H, W]
    tensor = torch.tensor(normalized, dtype=torch.float32).unsqueeze(0)
    return tensor.to(device)
