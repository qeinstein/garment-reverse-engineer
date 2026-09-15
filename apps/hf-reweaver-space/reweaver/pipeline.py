"""
High-level ReWeaver inference pipeline.
Orchestrates preprocessing, model execution, and postprocessing.
Fully compatible with Hugging Face ZeroGPU (@spaces.GPU).
"""

from __future__ import annotations
from typing import List, Optional, Dict, Any, Union
from pathlib import Path
import time
import torch
import numpy as np

from .schemas import ReWeaverRawOutput
from .preprocessing import preprocess_multiview_images, ImageInputType
from .models import load_reweaver_models, ReWeaverModelBundle, HF_REWEAVER_REPO, DEFAULT_VARIANT
from .postprocessing import format_raw_output


class ReWeaverInferencePipeline:
    """
    End-to-end inference pipeline for ReWeaver.
    Can be kept resident on CPU and invoked dynamically on CUDA inside @spaces.GPU.
    """

    def __init__(self, models: ReWeaverModelBundle):
        self.models = models

    @classmethod
    def from_pretrained(
        cls,
        repo_id: str = HF_REWEAVER_REPO,
        variant: str = DEFAULT_VARIANT,
        device: str = "cpu",
        local_weights_dir: Optional[str | Path] = None,
    ) -> ReWeaverInferencePipeline:
        """
        Factory method to initialize the pipeline from Hugging Face or local files.
        """
        weights = None
        if local_weights_dir is not None:
            local_path = Path(local_weights_dir)
            weights = {
                "img_encoder": local_path / variant / "img_encoder.pth",
                "complex_stitch": local_path / variant / "complex_stitch.pth",
                "flatten": local_path / variant / "flatten.pth",
            }

        models = load_reweaver_models(
            weights=weights,
            repo_id=repo_id,
            variant=variant,
            device=device,
        )
        return cls(models)

    @torch.no_grad()
    def reconstruct(
        self,
        images: List[ImageInputType],
        sample_name: str = "reconstructed_garment",
        device: Optional[str] = None,
    ) -> ReWeaverRawOutput:
        """
        Executes reconstruction on a set of multi-view images (e.g. 4 views).

        Args:
            images: 4 viewpoint images (front, right, back, left).
            sample_name: Optional identifier for the garment.
            device: Target torch device (e.g. 'cuda' or 'cpu'). If None, uses model's current device.

        Returns:
            ReWeaverRawOutput bundle containing 2D panel edges, 3D curves/patches, and connectivity.
        """
        t0 = time.time()
        exec_device = device or self.models.device

        # Dynamically transfer models to target device if needed (e.g. inside @spaces.GPU)
        img_encoder = self.models.img_encoder.to(exec_device).eval()
        complex_stitch = self.models.complex_stitch.to(exec_device).eval()
        flatten_model = self.models.flatten.to(exec_device).eval()

        # 1. Preprocess images: [1, S, 3, 518, 518]
        imgs = preprocess_multiview_images(images, device=exec_device)

        # 2. Vision Feature Extraction
        # img_encoder takes [B, S, C, H, W] and outputs tokens [B, S, N, D]
        img_tokens, _ = img_encoder(imgs)
        B, S, N, D = img_tokens.shape
        img_tokens = img_tokens.reshape(B, S * N, D)

        # 3. 3D Curve and Patch Prediction
        curve_pred, patch_pred, curve_features, patch_features = complex_stitch(img_tokens)

        # 4. Adaptive Scaled Patch Points
        # complex_stitch may be wrapped in DDP or plain Module
        stitch_module = getattr(complex_stitch, "module", complex_stitch)
        if hasattr(stitch_module, "get_scaled_points"):
            pred_scaled = stitch_module.get_scaled_points(patch_features)
        elif hasattr(stitch_module, "forward_scaled_points"):
            pred_scaled = stitch_module.forward_scaled_points(patch_features)
        else:
            pred_scaled = stitch_module.patch_model.forward_scaled_points(patch_features)
        patch_pred["pred_patch_points_scaled"] = pred_scaled["pred_patch_points_scaled"]

        # 5. 2D Pattern Edge Decoding & Filtering
        flatten_mod = getattr(flatten_model, "module", flatten_model)
        all_pred = flatten_mod.infer(
            curve_pred,
            patch_pred,
            curve_features,
            patch_features,
            names=[sample_name],
        )

        inference_time = time.time() - t0

        metadata = {
            "model_variant": self.models.variant,
            "device": str(exec_device),
            "num_views": S,
            "inference_duration_seconds": round(inference_time, 3),
        }

        # 6. Format Raw Output
        raw_output = format_raw_output(
            infer_output=all_pred[0],
            sample_name=sample_name,
            metadata=metadata,
        )

        # Clean up CUDA cache if running on GPU
        if "cuda" in str(exec_device) and torch.cuda.is_available():
            torch.cuda.empty_cache()

        return raw_output
