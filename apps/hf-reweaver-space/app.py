"""
Hugging Face Space Application for ReWeaver ZeroGPU Reconstruction.
Hosts both an interactive Gradio UI and a programmatic JSON/NPZ API endpoint.
"""

from __future__ import annotations
import os
import sys
import tempfile
import json
from pathlib import Path
from typing import Optional, Tuple
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Ensure local modules can be loaded
_APP_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _APP_DIR.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# Optional ZeroGPU space decorator
try:
    import spaces
    has_spaces = True
except ImportError:
    has_spaces = False
    # Mock decorator for local or CPU testing
    class spaces:
        @staticmethod
        def GPU(duration: int = 60):
            def decorator(fn):
                return fn
            return decorator

import gradio as gr

# Hotfix for Gradio / Pydantic 2.11+ schema generation bug:
# TypeError: argument of type 'bool' is not iterable in gradio_client.utils.get_type
try:
    import gradio_client.utils as _gc_utils

    _orig_get_type = getattr(_gc_utils, "get_type", None)
    if _orig_get_type:
        def _safe_get_type(schema):
            if isinstance(schema, bool):
                return "bool"
            return _orig_get_type(schema)
        _gc_utils.get_type = _safe_get_type

    _orig_schema_to_type = getattr(_gc_utils, "_json_schema_to_python_type", None)
    if _orig_schema_to_type:
        def _safe_schema_to_type(schema, defs=None):
            if isinstance(schema, bool):
                return "bool"
            return _orig_schema_to_type(schema, defs)
        _gc_utils._json_schema_to_python_type = _safe_schema_to_type
except Exception:
    pass

import torch
try:
    from reweaver import (
        ReWeaverInferencePipeline,
        ReWeaverRawOutput,
        reweaver_to_garment_ir,
    )
except ImportError:
    from services.reconstruction.reweaver import (
        ReWeaverInferencePipeline,
        ReWeaverRawOutput,
        reweaver_to_garment_ir,
    )

# Global pipeline instance (kept in memory on CPU)
_PIPELINE: Optional[ReWeaverInferencePipeline] = None
_CURRENT_VARIANT: str = "GCD_ori"


def get_pipeline(variant: str = "GCD_ori") -> ReWeaverInferencePipeline:
    global _PIPELINE, _CURRENT_VARIANT
    if _PIPELINE is None or _CURRENT_VARIANT != variant:
        device = "cuda" if torch.cuda.is_available() and not has_spaces else "cpu"
        _PIPELINE = ReWeaverInferencePipeline.from_pretrained(
            repo_id="SII-LiMing/ReWeaver",
            variant=variant,
            device=device,
        )
        _CURRENT_VARIANT = variant
    return _PIPELINE


def render_pattern_2d_plot(raw_output: ReWeaverRawOutput) -> np.ndarray:
    """Generates an image showing the 2D pattern panels laid out on canvas."""
    fig, ax = plt.subplots(figsize=(8, 6), dpi=120)
    ax.set_facecolor("#f8fafc")
    ax.set_title("Reconstructed 2D Sewing Panels", fontsize=12, fontweight="bold", pad=12)

    palette = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"]

    # Offset each panel horizontally for inspection
    x_offset = 0.0
    for p_idx, (k, p_val) in enumerate(raw_output.flatten_pred.items()):
        color = palette[p_idx % len(palette)]
        scale = p_val.scale_pred * 1000.0  # mm

        min_x, max_x = float("inf"), float("-inf")
        for edge in p_val.edge_points:
            pts = np.array(edge) * scale
            pts[:, 0] += x_offset
            ax.plot(pts[:, 0], pts[:, 1], color=color, linewidth=2)
            min_x = min(min_x, float(pts[:, 0].min()))
            max_x = max(max_x, float(pts[:, 0].max()))

        # Label panel
        mid_x = (min_x + max_x) / 2.0
        ax.text(mid_x, 0, f"Panel {k}", color=color, ha="center", va="center", fontweight="bold")
        panel_w = max_x - min_x if max_x > min_x else 100.0
        x_offset += panel_w + 50.0  # 50mm margin

    ax.axis("equal")
    ax.grid(True, linestyle="--", alpha=0.4)
    ax.set_xlabel("Width (mm)", fontsize=9)
    ax.set_ylabel("Height (mm)", fontsize=9)
    fig.tight_layout()

    # Convert plot to RGB array
    fig.canvas.draw()
    img_arr = np.frombuffer(fig.canvas.tostring_rgb(), dtype=np.uint8)
    img_arr = img_arr.reshape(fig.canvas.get_width_height()[::-1] + (3,))
    plt.close(fig)
    return img_arr


@spaces.GPU(duration=60)
def reconstruct_garment(
    front_img,
    right_img,
    back_img,
    left_img,
    variant: str = "GCD_ori",
) -> Tuple[str, Optional[str], Optional[np.ndarray]]:
    """
    Main ZeroGPU inference endpoint.
    Takes 4 viewpoint images, executes ReWeaver, and returns GarmentIR JSON, NPZ file, and 2D plot.
    """
    if front_img is None:
        raise gr.Error("At least the front view image is required.")

    # Fill in missing views if only partial photos are uploaded
    views = [front_img]
    views.append(right_img if right_img is not None else front_img)
    views.append(back_img if back_img is not None else front_img)
    views.append(left_img if left_img is not None else views[1])

    pipeline = get_pipeline(variant=variant)
    exec_device = "cuda" if torch.cuda.is_available() else "cpu"

    # Forward pass
    raw_output = pipeline.reconstruct(
        images=views,
        sample_name="reconstructed_garment",
        device=exec_device,
    )

    # 1. Convert to GarmentIR
    garment_ir = reweaver_to_garment_ir(raw_output)
    garment_ir_json = json.dumps(garment_ir, indent=2)

    # 2. Save NPZ bundle to temporary file
    temp_dir = tempfile.mkdtemp()
    npz_path = os.path.join(temp_dir, "reweaver_output.npz")
    raw_output.save_npz(npz_path)

    # 3. Render 2D pattern visualizer
    pattern_plot = render_pattern_2d_plot(raw_output)

    return garment_ir_json, npz_path, pattern_plot


# Build Gradio UI
with gr.Blocks(title="ReWeaver ZeroGPU Garment Reconstructor", theme=gr.themes.Soft()) as demo:
    gr.Markdown(
        """
        # 🧵 ReWeaver ZeroGPU Garment Reconstructor
        **AI-Powered Reverse Engineering from Multi-View Photos to Usable 2D Sewing Patterns**
        
        Upload 4 viewpoints of an existing garment (Front, Right Side, Back, Left Side).
        ReWeaver predicts 3D draped panels, 2D pattern boundaries, and seam connectivity, formatted into canonical **GarmentIR**.
        """
    )

    with gr.Row():
        with gr.Column(scale=1):
            gr.Markdown("### 📷 Input Multi-View Images")
            with gr.Row():
                front_in = gr.Image(label="Front View (0°)", type="pil")
                right_in = gr.Image(label="Right Side (90°)", type="pil")
            with gr.Row():
                back_in = gr.Image(label="Back View (180°)", type="pil")
                left_in = gr.Image(label="Left Side (270°)", type="pil")

            variant_in = gr.Dropdown(
                choices=["GCD_ori", "tileable"],
                value="GCD_ori",
                label="Model Checkpoint Variant",
                info="GCD_ori is trained on photographic textures; tileable on procedural repeating textures.",
            )

            btn_run = gr.Button("🚀 Reconstruct Garment", variant="primary", size="lg")

        with gr.Column(scale=1):
            gr.Markdown("### 📐 Reconstructed Output")
            with gr.Tabs():
                with gr.TabItem("2D Pattern Preview"):
                    plot_out = gr.Image(label="Recovered 2D Sewing Panels")

                with gr.TabItem("GarmentIR (JSON)"):
                    json_out = gr.Code(label="Canonical GarmentIR v0.1.0", language="json")

                with gr.TabItem("Download"):
                    file_out = gr.File(label="Download Raw Model Bundle (.npz)")

    btn_run.click(
        fn=reconstruct_garment,
        inputs=[front_in, right_in, back_in, left_in, variant_in],
        outputs=[json_out, file_out, plot_out],
        api_name="reconstruct",
    )

if __name__ == "__main__":
    demo.launch()
