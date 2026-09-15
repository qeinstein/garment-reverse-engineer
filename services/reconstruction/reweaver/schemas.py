"""
Schema definitions for raw ReWeaver output bundles.
Preserves full ML fidelity without loss before conversion to canonical GarmentIR.
"""

from __future__ import annotations
import json
import io
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional
from pathlib import Path
import numpy as np


@dataclass
class PanelFlattenPrediction:
    """Flattened 2D edge geometry and scale for an individual pattern panel."""
    panel_index: int
    # Shape: [num_edges, points_per_edge, 2] in local panel coordinates (normalized)
    edge_points: List[List[List[float]]]
    scale_pred: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "panel_index": self.panel_index,
            "edge_points": self.edge_points,
            "scale_pred": self.scale_pred,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PanelFlattenPrediction:
        return cls(
            panel_index=int(data.get("panel_index", 0)),
            edge_points=data.get("edge_points", []),
            scale_pred=float(data.get("scale_pred", 1.0)),
        )


@dataclass
class ReWeaverRawOutput:
    """
    Complete raw output bundle produced by ReWeaver inference.
    Maps 1:1 to the internal tensors produced by ComplexStitchModel and FlattenModel.
    """
    name: str
    # 3D border curves: [num_curves, 50, 3] in canonical [-1, 1] frame
    curve_points: List[List[List[float]]]
    curve_valid_prob: List[float]

    # 3D surface patches: [num_patches, points_per_patch, 3] or grid
    patch_points: List[List[List[float]]]
    patch_points_scaled: List[List[List[float]]]
    patch_valid_prob: List[float]

    # Patch-to-curve incidence & similarity: [num_patches, num_curves]
    patch_curve_similarity: List[List[float]]
    patch_curve_connectivity: List[List[bool]]

    # 2D flattened panels: keyed by panel index string
    flatten_pred: Dict[str, PanelFlattenPrediction]

    # Execution provenance and environment metadata
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "curve_points": self.curve_points,
            "curve_valid_prob": self.curve_valid_prob,
            "patch_points": self.patch_points,
            "patch_points_scaled": self.patch_points_scaled,
            "patch_valid_prob": self.patch_valid_prob,
            "patch_curve_similarity": self.patch_curve_similarity,
            "patch_curve_connectivity": self.patch_curve_connectivity,
            "flatten_pred": {k: v.to_dict() for k, v in self.flatten_pred.items()},
            "metadata": self.metadata,
        }

    def to_json(self, indent: Optional[int] = None) -> str:
        return json.dumps(self.to_dict(), indent=indent)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ReWeaverRawOutput:
        flatten_pred_raw = data.get("flatten_pred", {})
        flatten_pred = {}
        for k, v in flatten_pred_raw.items():
            if isinstance(v, dict):
                # If nested as edge_points / scale_pred
                panel_idx = v.get("panel_index", int(k) if k.isdigit() else 0)
                edge_pts = v.get("edge_points", [])
                # scale_pred might be float or single-element list
                scale = v.get("scale_pred", 1.0)
                if isinstance(scale, (list, tuple)) and len(scale) > 0:
                    scale = scale[0]
                flatten_pred[str(k)] = PanelFlattenPrediction(
                    panel_index=int(panel_idx),
                    edge_points=edge_pts,
                    scale_pred=float(scale),
                )

        return cls(
            name=str(data.get("name", "reweaver_output")),
            curve_points=data.get("curve_points", []),
            curve_valid_prob=data.get("curve_valid_prob", []),
            patch_points=data.get("patch_points", []),
            patch_points_scaled=data.get("patch_points_scaled", []),
            patch_valid_prob=data.get("patch_valid_prob", []),
            patch_curve_similarity=data.get("patch_curve_similarity", []),
            patch_curve_connectivity=data.get("patch_curve_connectivity", []),
            flatten_pred=flatten_pred,
            metadata=data.get("metadata", {}),
        )

    @classmethod
    def from_json(cls, json_str: str) -> ReWeaverRawOutput:
        return cls.from_dict(json.loads(json_str))

    def save_npz(self, filepath: str | Path) -> None:
        """Save bundle to compressed NumPy .npz file (matching ReWeaver upstream format)."""
        save_dict = {
            "name": np.array(self.name),
            "curve_points": np.array(self.curve_points, dtype=np.float32),
            "curve_valid_prob": np.array(self.curve_valid_prob, dtype=np.float32),
            "patch_points": np.array(self.patch_points, dtype=object),
            "patch_points_scaled": np.array(self.patch_points_scaled, dtype=object),
            "patch_valid_prob": np.array(self.patch_valid_prob, dtype=np.float32),
            "patch_curve_similarity": np.array(self.patch_curve_similarity, dtype=np.float32),
            "patch_curve_connectivity": np.array(self.patch_curve_connectivity, dtype=bool),
            "flatten_pred": np.array({
                k: {
                    "edge_points": np.array(v.edge_points, dtype=np.float32),
                    "scale_pred": np.array([v.scale_pred], dtype=np.float32),
                }
                for k, v in self.flatten_pred.items()
            }, dtype=object),
        }
        np.savez_compressed(filepath, **save_dict)

    def to_npz_bytes(self) -> bytes:
        """Serialize bundle to .npz bytes in memory for network transmission."""
        buf = io.BytesIO()
        self.save_npz(buf)
        return buf.getvalue()

    @classmethod
    def load_npz(cls, filepath_or_buffer: str | Path | io.BytesIO | bytes) -> ReWeaverRawOutput:
        """Load from compressed NumPy .npz file or byte buffer."""
        if isinstance(filepath_or_buffer, bytes):
            filepath_or_buffer = io.BytesIO(filepath_or_buffer)
        npz = np.load(filepath_or_buffer, allow_pickle=True)
        name = str(npz["name"].item()) if "name" in npz else "reweaver_sample"
        curve_points = npz["curve_points"].tolist() if "curve_points" in npz else []
        curve_valid_prob = npz["curve_valid_prob"].tolist() if "curve_valid_prob" in npz else []
        patch_points = npz["patch_points"].tolist() if "patch_points" in npz else []
        patch_points_scaled = npz["patch_points_scaled"].tolist() if "patch_points_scaled" in npz else []
        patch_valid_prob = npz["patch_valid_prob"].tolist() if "patch_valid_prob" in npz else []
        patch_curve_similarity = npz["patch_curve_similarity"].tolist() if "patch_curve_similarity" in npz else []
        patch_curve_connectivity = npz["patch_curve_connectivity"].tolist() if "patch_curve_connectivity" in npz else []

        flatten_pred: Dict[str, PanelFlattenPrediction] = {}
        if "flatten_pred" in npz:
            raw_flatten = npz["flatten_pred"].item() if hasattr(npz["flatten_pred"], "item") else npz["flatten_pred"]
            if isinstance(raw_flatten, dict):
                for k, v in raw_flatten.items():
                    edge_pts = v["edge_points"].tolist() if hasattr(v["edge_points"], "tolist") else v["edge_points"]
                    scale_arr = v["scale_pred"]
                    scale = float(scale_arr[0]) if hasattr(scale_arr, "__getitem__") else float(scale_arr)
                    flatten_pred[str(k)] = PanelFlattenPrediction(
                        panel_index=int(k) if str(k).isdigit() else 0,
                        edge_points=edge_pts,
                        scale_pred=scale,
                    )

        return cls(
            name=name,
            curve_points=curve_points,
            curve_valid_prob=curve_valid_prob,
            patch_points=patch_points,
            patch_points_scaled=patch_points_scaled,
            patch_valid_prob=patch_valid_prob,
            patch_curve_similarity=patch_curve_similarity,
            patch_curve_connectivity=patch_curve_connectivity,
            flatten_pred=flatten_pred,
            metadata={"format": "npz"},
        )
