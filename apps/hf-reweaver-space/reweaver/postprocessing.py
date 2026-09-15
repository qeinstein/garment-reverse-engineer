"""
Postprocessing logic for converting raw ReWeaver model output tensors
into structured ReWeaverRawOutput dataclasses.
"""

from __future__ import annotations
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import torch
from .schemas import ReWeaverRawOutput, PanelFlattenPrediction


def _to_numpy(tensor_or_array: Any) -> np.ndarray:
    """Safely detach and convert PyTorch tensor or sequence to numpy ndarray."""
    if isinstance(tensor_or_array, torch.Tensor):
        return tensor_or_array.detach().cpu().numpy()
    elif isinstance(tensor_or_array, np.ndarray):
        return tensor_or_array
    elif isinstance(tensor_or_array, (list, tuple)):
        # If elements are tensors, detach them
        if len(tensor_or_array) > 0 and isinstance(tensor_or_array[0], torch.Tensor):
            return np.array([t.detach().cpu().numpy() for t in tensor_or_array])
        return np.array(tensor_or_array)
    return np.array(tensor_or_array)


def format_raw_output(
    infer_output: Dict[str, Any],
    sample_name: str = "reconstructed_garment",
    metadata: Optional[Dict[str, Any]] = None,
) -> ReWeaverRawOutput:
    """
    Transforms the dictionary returned by FlattenModel.infer into a clean ReWeaverRawOutput.
    Handles device transfers, tensor flattening, and panel indexing.
    """
    # 1. 3D Curves
    curve_points_np = _to_numpy(infer_output.get("curve_points", []))
    curve_valid_np = _to_numpy(infer_output.get("curve_valid_prob", []))

    # 2. 3D Patches
    patch_points_np = _to_numpy(infer_output.get("patch_points", []))
    patch_scaled_raw = infer_output.get("patch_points_scaled", [])
    if isinstance(patch_scaled_raw, (list, tuple)):
        patch_scaled_list = [
            _to_numpy(p).tolist() for p in patch_scaled_raw
        ]
    else:
        patch_scaled_list = _to_numpy(patch_scaled_raw).tolist()

    patch_valid_np = _to_numpy(infer_output.get("patch_valid_prob", []))

    # 3. Connectivity & Similarity
    sim_np = _to_numpy(infer_output.get("patch_curve_similarity", []))
    conn_np = _to_numpy(infer_output.get("patch_curve_connectivity", []))

    # 4. 2D Flattened Panels
    flatten_dict_raw = infer_output.get("flatten_pred", {})
    flatten_pred: Dict[str, PanelFlattenPrediction] = {}

    for panel_key, p_val in flatten_dict_raw.items():
        if isinstance(p_val, dict):
            edge_pts_np = _to_numpy(p_val.get("edge_points", []))
            scale_val = p_val.get("scale_pred", 1.0)
            if isinstance(scale_val, (torch.Tensor, np.ndarray)):
                scale_float = float(_to_numpy(scale_val).flat[0])
            elif isinstance(scale_val, (list, tuple)) and len(scale_val) > 0:
                scale_float = float(scale_val[0])
            else:
                scale_float = float(scale_val)

            panel_idx = int(panel_key) if str(panel_key).isdigit() else len(flatten_pred)
            flatten_pred[str(panel_key)] = PanelFlattenPrediction(
                panel_index=panel_idx,
                edge_points=edge_pts_np.tolist(),
                scale_pred=scale_float,
            )

    return ReWeaverRawOutput(
        name=sample_name,
        curve_points=curve_points_np.tolist(),
        curve_valid_prob=curve_valid_np.tolist(),
        patch_points=patch_points_np.tolist(),
        patch_points_scaled=patch_scaled_list,
        patch_valid_prob=patch_valid_np.tolist(),
        patch_curve_similarity=sim_np.tolist(),
        patch_curve_connectivity=conn_np.astype(bool).tolist(),
        flatten_pred=flatten_pred,
        metadata=metadata or {},
    )


def extract_seams_from_connectivity(
    connectivity: List[List[bool]],
    curve_valid_prob: Optional[List[float]] = None,
    min_confidence: float = 0.3,
) -> List[Dict[str, Any]]:
    """
    Derives sewing seams from bipartite patch-curve connectivity.
    For each curve connected to exactly two panels, identifies the matching panel edges.
    """
    conn_matrix = np.array(connectivity, dtype=bool)  # Shape: (P, C)
    num_patches, num_curves = conn_matrix.shape

    seam_records: List[Dict[str, Any]] = []

    for c in range(num_curves):
        connected_panels = np.where(conn_matrix[:, c])[0]
        confidence = float(curve_valid_prob[c]) if curve_valid_prob and c < len(curve_valid_prob) else 0.8

        if confidence < min_confidence:
            continue

        if len(connected_panels) == 2:
            p1, p2 = int(connected_panels[0]), int(connected_panels[1])
            # Find the edge indices within each panel's local curve order
            p1_active_curves = np.where(conn_matrix[p1, :])[0]
            p2_active_curves = np.where(conn_matrix[p2, :])[0]

            edge_idx_1 = int(np.where(p1_active_curves == c)[0][0])
            edge_idx_2 = int(np.where(p2_active_curves == c)[0][0])

            seam_records.append({
                "seam_id": f"seam_c{c}",
                "curve_index": c,
                "confidence": confidence,
                "panel_a": p1,
                "edge_a": edge_idx_1,
                "panel_b": p2,
                "edge_b": edge_idx_2,
            })

    return seam_records
