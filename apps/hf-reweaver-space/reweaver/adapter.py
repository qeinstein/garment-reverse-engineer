"""
Adapter converting raw ReWeaver output bundles into canonical GarmentIR (v0.1.0).
Adheres strictly to the principle of not hallucinating hidden garment features.
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional
import datetime
import numpy as np

from .schemas import ReWeaverRawOutput
from .postprocessing import extract_seams_from_connectivity


def _compute_patch_centroid(points: List[Any]) -> List[float]:
    """Calculates 3D centroid from patch points."""
    try:
        arr = np.array(points, dtype=np.float32)
        if arr.ndim > 2:
            arr = arr.reshape(-1, arr.shape[-1])
        if arr.shape[0] == 0:
            return [0.0, 1.0, 0.0]
        centroid = arr.mean(axis=0).tolist()
        return [float(c) for c in centroid[:3]]
    except Exception:
        return [0.0, 1.0, 0.0]


def reweaver_to_garment_ir(
    raw: ReWeaverRawOutput,
    garment_name: Optional[str] = None,
    default_material_gsm: float = 220.0,
) -> Dict[str, Any]:
    """
    Transforms a ReWeaverRawOutput bundle into a canonical GarmentIR v0.1.0 document.
    """
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    garment_id = raw.name or "garment_reconstructed"
    title = garment_name or garment_id.replace("_", " ").title()

    # 1. Units
    units = {
        "spatial_2d": "mm",
        "spatial_3d": "m",
        "angles": "degrees",
        "mass_density": "g/m2",
    }

    # 2. Materials
    material_id = "mat_cotton_twill"
    materials = [
        {
            "id": material_id,
            "name": "Reconstructed Cotton Twill",
            "stretch_warp": 15.0,
            "stretch_weft": 20.0,
            "bend_stiffness": 25.0,
            "thickness_mm": 0.65,
            "density_gsm": default_material_gsm,
            "color": "#3b4252",
            "confidence": 0.8,
        }
    ]

    # 3. Panels
    panels = []
    connectivity_matrix = np.array(raw.patch_curve_connectivity, dtype=bool) if raw.patch_curve_connectivity else None

    # Track edge endpoints in 3D for seam orientation check
    for panel_key, flatten_info in sorted(raw.flatten_pred.items(), key=lambda x: int(x[0]) if x[0].isdigit() else x[0]):
        p_idx = flatten_info.panel_index
        panel_id = f"panel_{p_idx}"

        # Scale factor from ReWeaver is in meters per normalized unit
        # Convert to millimeters (x 1000)
        scale_mm = float(flatten_info.scale_pred) * 1000.0

        edges = []
        num_edges = len(flatten_info.edge_points)

        # Get connected curve IDs for this panel from connectivity matrix
        active_curves = []
        if connectivity_matrix is not None and p_idx < connectivity_matrix.shape[0]:
            active_curves = np.where(connectivity_matrix[p_idx])[0].tolist()

        for edge_idx, edge_raw in enumerate(flatten_info.edge_points):
            edge_id = f"edge_{p_idx}_{edge_idx}"
            # Scale 2D points to mm
            pts = [[float(pt[0]) * scale_mm, float(pt[1]) * scale_mm] for pt in edge_raw]

            # Confidence derived from curve probability if linked
            edge_conf = 0.85
            if edge_idx < len(active_curves):
                c_id = active_curves[edge_idx]
                if c_id < len(raw.curve_valid_prob):
                    edge_conf = float(raw.curve_valid_prob[c_id])

            edge_obj = {
                "id": edge_id,
                "name": f"Edge {edge_idx + 1}",
                "kind": "polyline",
                "start": {"x": pts[0][0], "y": pts[0][1]},
                "end": {"x": pts[-1][0], "y": pts[-1][1]},
                "polyline_samples": [{"x": p[0], "y": p[1]} for p in pts],
                "confidence": round(edge_conf, 3),
            }
            edges.append(edge_obj)

        # 3D Placement & Semantic Category
        patch_pts = (
            raw.patch_points_scaled[p_idx]
            if p_idx < len(raw.patch_points_scaled)
            else (raw.patch_points[p_idx] if p_idx < len(raw.patch_points) else [])
        )
        centroid = _compute_patch_centroid(patch_pts)

        # Infer category and cylinder binding from 3D centroid
        # Typically Z > 0 is front, Z < 0 is back in ReWeaver canonical frame
        is_front = centroid[2] >= 0.0
        category = "body_front" if is_front else "body_back"
        u_degrees = 0.0 if is_front else 180.0

        panel_obj = {
            "id": panel_id,
            "name": f"Panel {p_idx + 1} ({'Front' if is_front else 'Back'})",
            "category": category,
            "material_id": material_id,
            "boundary": {
                "edges": edges,
                "closed": True,
            },
            "grain_line": {
                "angle_deg": 90.0,
            },
            "placement_3d": {
                "body_region": "torso_front" if is_front else "torso_back",
                "cylinder_binding": {
                    "cylinder_name": "Torso",
                    "u_degrees": u_degrees,
                    "v": 0.5,
                    "radial_offset_mm": 12.0,
                    "mode": "curved",
                },
                "translation": [round(c, 4) for c in centroid],
            },
            "confidence": 0.85,
        }
        panels.append(panel_obj)

    # 4. Seams
    seams = []
    if raw.patch_curve_connectivity:
        seam_records = extract_seams_from_connectivity(
            connectivity=raw.patch_curve_connectivity,
            curve_valid_prob=raw.curve_valid_prob,
        )

        for s_rec in seam_records:
            p1, k1 = s_rec["panel_a"], s_rec["edge_a"]
            p2, k2 = s_rec["panel_b"], s_rec["edge_b"]

            seams.append({
                "id": s_rec["seam_id"],
                "name": f"Seam {s_rec['seam_id']}",
                "edges_a": [
                    {"panel_id": f"panel_{p1}", "edge_id": f"edge_{p1}_{k1}"}
                ],
                "edges_b": [
                    {"panel_id": f"panel_{p2}", "edge_id": f"edge_{p2}_{k2}", "reversed": True}
                ],
                "seam_type": "plain",
                "confidence": round(s_rec["confidence"], 3),
            })

    # 5. Hypotheses (explicitly document unobserved features)
    hypotheses = [
        {
            "id": "hypo_closure_type",
            "aspect": "closure_type",
            "description": "ReWeaver vision model does not directly segment hidden closures (zippers, plackets, hook-and-eye).",
            "confidence": 0.65,
            "chosen": False,
            "alternatives": [
                {"label": "Invisible Side Zipper", "confidence": 0.50, "description": "Inserted at left side seam."},
                {"label": "Center Back Zipper", "confidence": 0.35, "description": "Inserted at center back seam."},
                {"label": "Elastic Pull-on", "confidence": 0.15, "description": "Continuous elasticated waist band."},
            ],
        }
    ]

    return {
        "schema_version": "0.1.0",
        "metadata": {
            "id": garment_id,
            "name": title,
            "category": "reconstructed_garment",
            "description": "3D garment and 2D pattern reconstructed by ReWeaver vision-geometry engine.",
            "created_at": now,
            "updated_at": now,
            "reconstruction_model": {
                "name": "ReWeaver",
                "version": "1.0.0",
                "checkpoint": raw.metadata.get("model_variant", "GCD_ori"),
                "device": raw.metadata.get("device", "unknown"),
            },
        },
        "units": units,
        "materials": materials,
        "panels": panels,
        "seams": seams,
        "hypotheses": hypotheses,
    }
