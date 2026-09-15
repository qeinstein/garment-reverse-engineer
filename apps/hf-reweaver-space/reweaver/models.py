"""
Model management and checkpoint resolution for ReWeaver.
Supports downloading weights from Hugging Face Hub (SII-LiMing/ReWeaver)
and running in ZeroGPU or local environments.
"""

from __future__ import annotations
import os
import sys
from pathlib import Path
from typing import Optional, NamedTuple, Any
import torch
import torch.nn as nn

# Ensure vendor/reweaver is on sys.path for internal ReWeaver imports
_CURRENT_DIR = Path(__file__).resolve().parent
_LOCAL_VENDOR = _CURRENT_DIR / "vendor"
_REPO_ROOT = _CURRENT_DIR.parent.parent.parent
_VENDOR_REWEAVER = _REPO_ROOT / "vendor" / "reweaver"

for vendor_dir in [_LOCAL_VENDOR, _VENDOR_REWEAVER]:
    if vendor_dir.exists() and str(vendor_dir) not in sys.path:
        sys.path.insert(0, str(vendor_dir))

# Default HF repo containing official weights
HF_REWEAVER_REPO = "SII-LiMing/ReWeaver"
DEFAULT_VARIANT = "GCD_ori"  # or "tileable"


class ReWeaverModelBundle(NamedTuple):
    img_encoder: nn.Module
    complex_stitch: nn.Module
    flatten: nn.Module
    variant: str
    device: str


def strip_ddp_prefix(state_dict: dict) -> dict:
    """Removes 'module.' prefixes produced by DistributedDataParallel training."""
    clean_dict = {}
    for k, v in state_dict.items():
        if k.startswith("module."):
            clean_dict[k[7:]] = v
        else:
            clean_dict[k] = v
    return clean_dict


def resolve_model_weights(
    repo_id: str = HF_REWEAVER_REPO,
    variant: str = DEFAULT_VARIANT,
    local_dir: Optional[str | Path] = None,
) -> dict[str, Path]:
    """
    Resolves checkpoint file paths for img_encoder, complex_stitch, and flatten.
    Downloads from Hugging Face Hub if not already cached locally.
    """
    if local_dir is not None:
        local_path = Path(local_dir)
        files = {
            "img_encoder": local_path / variant / "img_encoder.pth",
            "complex_stitch": local_path / variant / "complex_stitch.pth",
            "flatten": local_path / variant / "flatten.pth",
        }
        if all(p.exists() for p in files.values()):
            return files

    # Download from Hugging Face Hub
    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        raise ImportError(
            "huggingface_hub is required to download ReWeaver weights. "
            "Install it via `pip install huggingface_hub`."
        )

    cache_base = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface" / "hub"))
    downloaded_files = {}
    for key, filename in [
        ("img_encoder", f"{variant}/img_encoder.pth"),
        ("complex_stitch", f"{variant}/complex_stitch.pth"),
        ("flatten", f"{variant}/flatten.pth"),
    ]:
        path = hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            local_dir=str(cache_base / "reweaver_weights"),
        )
        downloaded_files[key] = Path(path)

    return downloaded_files


def load_reweaver_models(
    weights: Optional[dict[str, Path]] = None,
    repo_id: str = HF_REWEAVER_REPO,
    variant: str = DEFAULT_VARIANT,
    device: str = "cpu",
) -> ReWeaverModelBundle:
    """
    Instantiates ReWeaver models and loads pretrained weights onto the specified device.
    """
    try:
        from config import ComplexStitchConfig, FlattenConfig, ImageEncoderConfig
        from vggtencoder.aggregator import Aggregator
        from models.complex_stitch import ComplexStitchModel
        from models.flatten import FlattenModel
    except ImportError as e:
        raise ImportError(
            f"Could not import ReWeaver model modules: {e}. "
            f"Ensure vendor/reweaver is cloned or in sys.path (looked at {_VENDOR_REWEAVER})."
        )

    if weights is None:
        weights = resolve_model_weights(repo_id=repo_id, variant=variant)

    # 1. Image Encoder
    img_enc_cfg = ImageEncoderConfig()
    img_encoder = Aggregator(img_enc_cfg)
    img_enc_state = torch.load(weights["img_encoder"], map_location="cpu")
    img_encoder.load_state_dict(strip_ddp_prefix(img_enc_state))
    img_encoder.to(device).eval()

    # 2. Complex Stitch Model
    complex_cfg = ComplexStitchConfig()
    complex_cfg.d_model = 768
    complex_cfg.topo_embed_dim = 768
    complex_stitch = ComplexStitchModel(complex_cfg)
    complex_state = torch.load(weights["complex_stitch"], map_location="cpu")
    complex_stitch.load_state_dict(strip_ddp_prefix(complex_state))
    complex_stitch.to(device).eval()

    # 3. Flatten Model
    flatten_cfg = FlattenConfig()
    flatten_model = FlattenModel(flatten_cfg)
    flatten_state = torch.load(weights["flatten"], map_location="cpu")
    flatten_model.load_state_dict(strip_ddp_prefix(flatten_state))
    flatten_model.to(device).eval()

    return ReWeaverModelBundle(
        img_encoder=img_encoder,
        complex_stitch=complex_stitch,
        flatten=flatten_model,
        variant=variant,
        device=device,
    )
