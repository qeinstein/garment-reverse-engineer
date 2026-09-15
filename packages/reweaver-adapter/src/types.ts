/**
 * TypeScript interfaces matching the raw output of ReWeaver.
 */

export interface PanelFlattenPrediction {
  panel_index: number;
  /** Shape: [num_edges, points_per_edge, 2] in local panel space */
  edge_points: number[][][];
  /** Metric scale multiplier */
  scale_pred: number;
}

export interface ReWeaverRawOutput {
  name: string;
  /** 3D curve points: [num_curves, 50, 3] */
  curve_points: number[][][];
  /** Curve confidence probabilities: [num_curves] */
  curve_valid_prob: number[];
  /** 3D patch points: [num_patches, ...] */
  patch_points?: number[][][];
  /** Scaled 3D patch points: [num_patches, ...] */
  patch_points_scaled?: number[][][];
  /** Patch confidence probabilities: [num_patches] */
  patch_valid_prob?: number[];
  /** Patch-curve continuous similarity matrix: [num_patches, num_curves] */
  patch_curve_similarity?: number[][];
  /** Patch-curve boolean connectivity matrix: [num_patches, num_curves] */
  patch_curve_connectivity: boolean[][];
  /** Flattened 2D pattern panel boundaries keyed by panel ID */
  flatten_pred: Record<string, PanelFlattenPrediction>;
  /** Metadata on inference environment */
  metadata?: Record<string, unknown>;
}

export interface ReWeaverAdapterOptions {
  /** Garment title / name override */
  garmentName?: string;
  /** Garment category override */
  category?: string;
  /** Default fabric mass density in g/m2 (default 220) */
  defaultMaterialGsm?: number;
  /** Minimum curve validity probability required to form a seam (default 0.3) */
  minSeamConfidence?: number;
  /** Whether to simplify dense polyline points if nearly collinear (default false) */
  simplifyToleranceMm?: number;
}
