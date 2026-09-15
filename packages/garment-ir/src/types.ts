/**
 * GarmentIR: Canonical Garment Intermediate Representation (v0.1.0)
 *
 * Designed to act as the single source of truth between:
 *   - AI reconstruction pipelines (ReWeaver, Garment Particles, GarmentRec, SAM 2)
 *   - Pattern & CAD editors (Seamer, Atelier)
 *   - Physical validators and cloth simulation engines
 *   - Export modules (DXF, SVG, PDF, glTF)
 *
 * Principles:
 * 1. Independent of any specific CAD editor or ML model.
 * 2. Explicit uncertainty: confidence ratings, unobserved vs inferred flags, alternative hypotheses.
 * 3. Provenance & Evidence: links inferred elements back to source image/video media.
 * 4. Human corrections: preserves user overrides for active learning and personalization.
 */

export type SpatialUnit2D = 'mm' | 'cm' | 'inch';
export type SpatialUnit3D = 'm' | 'mm' | 'cm';
export type AngleUnit = 'degrees' | 'radians';
export type MassDensityUnit = 'g/m2' | 'oz/yd2';

export interface GarmentUnits {
  spatial_2d: SpatialUnit2D;
  spatial_3d: SpatialUnit3D;
  angles: AngleUnit;
  mass_density: MassDensityUnit;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface SourceMediaReference {
  id: string;
  type: 'image' | 'video' | 'multiview_bundle';
  uri: string;
  viewpoint_label?: 'front' | 'back' | 'left' | 'right' | 'perspective' | string;
  timestamp_seconds?: number;
  frame_index?: number;
}

export interface ProvenanceEvidence {
  source_media_ids: string[];
  observed: boolean; // true = directly visible in source media; false = inferred/estimated
  confidence: number; // 0.0 (unconfident) to 1.0 (certain)
  notes?: string;
  bounding_box_2d?: [number, number, number, number]; // [min_x, min_y, max_x, max_y] normalized in source frame
}

export interface ModelMetadata {
  name: string;
  version: string;
  checkpoint?: string;
  run_timestamp?: string;
  device?: string;
}

export interface HumanCorrection {
  timestamp: string;
  author: string;
  field_path: string;
  original_value: unknown;
  corrected_value: unknown;
  rationale?: string;
}

export type EdgeGeometryKind = 'line' | 'cubic_bezier' | 'arc' | 'polyline';

export interface GarmentNotch {
  id: string;
  t: number; // normalized position along edge [0.0, 1.0]
  type: 'single' | 'double' | 'slit' | 'tee';
  depth_mm?: number;
  label?: string;
}

export interface PanelEdge {
  id: string;
  name?: string;
  kind: EdgeGeometryKind;
  start: Point2D;
  end: Point2D;
  /** Cubic bezier control points (world 2D coordinates), length 2: [c1, c2] */
  control_points?: [Point2D, Point2D];
  /** Dense polyline samples for vision-extracted boundaries (in panel 2D coordinates) */
  polyline_samples?: Point2D[];
  notches?: GarmentNotch[];
  seam_allowance_mm?: number;
  confidence?: number;
  provenance?: ProvenanceEvidence;
}

export interface PanelBoundary {
  /** Ordered sequence of edges forming the closed outer loop of the panel */
  edges: PanelEdge[];
  closed: boolean;
}

export type InternalFeatureType =
  | 'dart'
  | 'pleat'
  | 'gather'
  | 'style_line'
  | 'fold_line'
  | 'pocket_placement'
  | 'button_marking';

export interface InternalFeature {
  id: string;
  name?: string;
  type: InternalFeatureType;
  /** Path geometry or outline of the internal feature */
  points: Point2D[];
  /** For darts/folds: fold angle in degrees (0 = flat, positive/negative = valley/mountain) */
  fold_angle_deg?: number;
  /** Target intake width in mm (e.g. dart intake at base) */
  intake_mm?: number;
  confidence?: number;
  provenance?: ProvenanceEvidence;
}

export interface GrainLine {
  /** Angle in degrees relative to panel X axis (0 = +X, 90 = +Y). Default is 90 (+Y / vertical) */
  angle_deg: number;
  direction?: Vector2D;
}

export type BodyRegion =
  | 'torso_front'
  | 'torso_back'
  | 'torso_side_left'
  | 'torso_side_right'
  | 'waist_front'
  | 'waist_back'
  | 'sleeve_left'
  | 'sleeve_right'
  | 'collar'
  | 'cuff_left'
  | 'cuff_right'
  | 'leg_left_front'
  | 'leg_left_back'
  | 'leg_right_front'
  | 'leg_right_back'
  | 'custom';

export interface CylinderBinding {
  /** Avatar cylinder name: 'Torso', 'Neck', 'LeftUpperArm', 'RightUpperArm', 'LeftUpperLeg', etc. */
  cylinder_name: string;
  /** Circumferential angle in degrees: 0 = front center, 180 = back center, 90 = left */
  u_degrees: number;
  /** Axial position along cylinder from 0.0 (start bone) to 1.0 (end bone) */
  v: number;
  /** Radial offset outward from body surface in mm (default ~10mm) */
  radial_offset_mm?: number;
  /** Whether the panel is curved around cylinder or flat tangent */
  mode?: 'curved' | 'flat';
}

export interface PanelPlacement3D {
  body_region?: BodyRegion;
  cylinder_binding?: CylinderBinding;
  /** Direct 3D rigid transform in world space */
  translation?: [number, number, number]; // in 3D units (meters)
  rotation_euler_deg?: [number, number, number];
  matrix_4x4?: number[]; // 16 elements column-major
  flip_normal?: boolean;
}

export type PanelCategory =
  | 'body_front'
  | 'body_back'
  | 'waistband'
  | 'sleeve'
  | 'collar'
  | 'cuff'
  | 'pocket'
  | 'yoke'
  | 'skirt_front'
  | 'skirt_back'
  | 'trouser_front'
  | 'trouser_back'
  | 'lining'
  | 'interfacing'
  | 'other';

export interface GarmentPanel {
  id: string;
  name: string;
  category: PanelCategory;
  material_id: string;
  boundary: PanelBoundary;
  internal_features?: InternalFeature[];
  grain_line: GrainLine;
  seam_allowance_mm?: number;
  placement_3d?: PanelPlacement3D;
  /** 2D position and rotation for visual canvas layout (in mm) */
  layout_position?: Point2D;
  layout_rotation_deg?: number;
  confidence?: number;
  provenance?: ProvenanceEvidence;
  human_corrections?: HumanCorrection[];
}

export interface SeamEdgeReference {
  panel_id: string;
  edge_id: string;
  /** Invert edge direction when stitching (so endpoints match) */
  reversed?: boolean;
  /** Optional parameter span [0..1] if seam only attaches to part of the edge */
  t_start?: number;
  t_end?: number;
  /** Whether this targets a mirrored copy in symmetric garments */
  mirrored?: boolean;
}

export type SeamType =
  | 'plain'
  | 'gathered'
  | 'flat_felled'
  | 'french'
  | 'bound'
  | 'overlocked'
  | 'zipper'
  | 'buttoned'
  | 'dart_closing';

export interface GarmentSeam {
  id: string;
  name?: string;
  edges_a: SeamEdgeReference[];
  edges_b: SeamEdgeReference[];
  seam_type?: SeamType;
  /** When gathered: ratio of edge A length to edge B length (e.g. 1.8 for 1.8x gathering) */
  gather_ratio?: number;
  /** Sewing order index on assembly timeline */
  assembly_order?: number;
  confidence?: number;
  provenance?: ProvenanceEvidence;
  /** Alternative interpretations if seam topology was ambiguous in reference images */
  hypotheses?: AlternativeSeamHypothesis[];
}

export interface AlternativeSeamHypothesis {
  id: string;
  label: string;
  confidence: number;
  edges_a: SeamEdgeReference[];
  edges_b: SeamEdgeReference[];
  rationale: string;
}

export interface GarmentMaterial {
  id: string;
  name: string;
  stretch_warp: number; // 0..100 (100 = highly elastic)
  stretch_weft: number; // 0..100
  bend_stiffness: number; // 0..100 (100 = rigid)
  thickness_mm: number;
  density_gsm: number; // grams per square meter (g/m²)
  color?: string; // hex color e.g. '#2d3742'
  roughness?: number;
  metalness?: number;
  opacity?: number;
  texture_url?: string;
  confidence?: number;
}

export interface WearerBody {
  gender: 'female' | 'male' | 'neutral';
  unit: 'metric' | 'imperial';
  /** Standard measurement values: height, chest_girth, waist_girth, hip_girth, etc. */
  measurements: Record<string, number>;
  avatar_preset?: string;
}

export interface GarmentLandmark {
  id: string;
  name: string;
  panel_id?: string;
  coord_2d?: Point2D;
  coord_3d?: Point3D;
  confidence?: number;
  provenance?: ProvenanceEvidence;
}

export interface GarmentHypothesis {
  id: string;
  aspect: 'closure_type' | 'rear_construction' | 'lining' | 'panel_count' | string;
  description: string;
  confidence: number;
  chosen: boolean;
  alternatives: {
    label: string;
    confidence: number;
    description: string;
  }[];
}

export interface GarmentIR {
  schema_version: '0.1.0';
  metadata: {
    id: string;
    name: string;
    category: string;
    description?: string;
    created_at: string;
    updated_at: string;
    source_media?: SourceMediaReference[];
    reconstruction_model?: ModelMetadata;
  };
  units: GarmentUnits;
  materials: GarmentMaterial[];
  panels: GarmentPanel[];
  seams: GarmentSeam[];
  wearer?: WearerBody;
  landmarks?: GarmentLandmark[];
  hypotheses?: GarmentHypothesis[];
  human_corrections?: HumanCorrection[];
}
