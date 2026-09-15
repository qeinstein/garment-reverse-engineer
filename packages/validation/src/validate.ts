import type { GarmentIR, GarmentPanel, PanelEdge, Point2D, GarmentMaterial } from '@garment-ir/core';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  code: string;
  message: string;
  severity: ValidationSeverity;
  path: string;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const KNOWN_CYLINDERS = new Set([
  'Torso',
  'Neck',
  'LeftUpperArm',
  'RightUpperArm',
  'LeftLowerArm',
  'RightLowerArm',
  'LeftShoulder',
  'RightShoulder',
  'LeftUpperLeg',
  'RightUpperLeg',
  'LeftLowerLeg',
  'RightLowerLeg'
]);

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function edgeLength(edge: PanelEdge): number {
  if (edge.kind === 'line') {
    return dist(edge.start, edge.end);
  }
  if (edge.kind === 'cubic_bezier' && edge.control_points && edge.control_points.length === 2) {
    const [c1, c2] = edge.control_points;
    // Simpson's rule or 16-sample approximation
    let len = 0;
    let prev = edge.start;
    const samples = 16;
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const mt = 1 - t;
      const pt: Point2D = {
        x: mt * mt * mt * edge.start.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * edge.end.x,
        y: mt * mt * mt * edge.start.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * edge.end.y
      };
      len += dist(prev, pt);
      prev = pt;
    }
    return len;
  }
  if (edge.polyline_samples && edge.polyline_samples.length > 1) {
    let len = 0;
    for (let i = 1; i < edge.polyline_samples.length; i++) {
      len += dist(edge.polyline_samples[i - 1], edge.polyline_samples[i]);
    }
    return len;
  }
  return dist(edge.start, edge.end);
}

export function validateGarmentIR(garment: GarmentIR, options: { maxLoopGapMm?: number } = {}): ValidationResult {
  const issues: ValidationIssue[] = [];
  const maxGap = options.maxLoopGapMm ?? 1.0;

  // 1. Schema version and root checks
  if (garment.schema_version !== '0.1.0') {
    issues.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      message: `Expected schema_version '0.1.0', received '${garment.schema_version}'`,
      severity: 'error',
      path: 'schema_version'
    });
  }

  if (!garment.panels || garment.panels.length === 0) {
    issues.push({
      code: 'NO_PANELS',
      message: 'Garment must contain at least one panel',
      severity: 'error',
      path: 'panels'
    });
  }

  // Material registry
  const materialIds = new Set(garment.materials?.map((m: GarmentMaterial) => m.id) ?? []);

  // Panel index
  const panelMap = new Map<string, GarmentPanel>();
  const panelEdgeMap = new Map<string, Map<string, PanelEdge>>();

  for (let pi = 0; pi < (garment.panels?.length ?? 0); pi++) {
    const panel = garment.panels[pi];
    const pPath = `panels[${pi}]`;

    if (!panel.id) {
      issues.push({
        code: 'MISSING_PANEL_ID',
        message: 'Panel is missing an id',
        severity: 'error',
        path: `${pPath}.id`
      });
      continue;
    }

    if (panelMap.has(panel.id)) {
      issues.push({
        code: 'DUPLICATE_PANEL_ID',
        message: `Duplicate panel id '${panel.id}'`,
        severity: 'error',
        path: `${pPath}.id`
      });
    }
    panelMap.set(panel.id, panel);

    // Check material reference
    if (!materialIds.has(panel.material_id)) {
      issues.push({
        code: 'MATERIAL_NOT_FOUND',
        message: `Panel '${panel.id}' references non-existent material '${panel.material_id}'`,
        severity: 'error',
        path: `${pPath}.material_id`
      });
    }

    // Check cylinder binding if present
    const cyl = panel.placement_3d?.cylinder_binding;
    if (cyl && !KNOWN_CYLINDERS.has(cyl.cylinder_name)) {
      issues.push({
        code: 'UNKNOWN_CYLINDER',
        message: `Panel '${panel.id}' binds to unknown cylinder '${cyl.cylinder_name}'`,
        severity: 'warning',
        path: `${pPath}.placement_3d.cylinder_binding.cylinder_name`
      });
    }

    // Validate boundary edges
    const edges = panel.boundary?.edges ?? [];
    if (edges.length < 3) {
      issues.push({
        code: 'INSUFFICIENT_EDGES',
        message: `Panel '${panel.id}' boundary has ${edges.length} edges; at least 3 are required for a 2D surface`,
        severity: 'error',
        path: `${pPath}.boundary.edges`
      });
    }

    const edgeMap = new Map<string, PanelEdge>();
    for (let ei = 0; ei < edges.length; ei++) {
      const edge = edges[ei];
      const ePath = `${pPath}.boundary.edges[${ei}]`;

      if (edgeMap.has(edge.id)) {
        issues.push({
          code: 'DUPLICATE_EDGE_ID',
          message: `Panel '${panel.id}' has duplicate edge id '${edge.id}'`,
          severity: 'error',
          path: `${ePath}.id`
        });
      }
      edgeMap.set(edge.id, edge);

      // Check loop continuity: edge[i].end must connect to edge[i+1].start
      if (edges.length >= 3) {
        const nextEdge = edges[(ei + 1) % edges.length];
        const gap = dist(edge.end, nextEdge.start);
        if (gap > maxGap) {
          issues.push({
            code: 'PANEL_BOUNDARY_GAP',
            message: `Panel '${panel.id}' boundary gap of ${gap.toFixed(2)}mm between edge '${edge.id}' end and '${nextEdge.id}' start exceeds tolerance ${maxGap}mm`,
            severity: 'error',
            path: `${ePath}.end`,
            details: { gap_mm: gap, from_edge: edge.id, to_edge: nextEdge.id }
          });
        }
      }
    }
    panelEdgeMap.set(panel.id, edgeMap);
  }

  // 2. Validate Seams
  for (let si = 0; si < (garment.seams?.length ?? 0); si++) {
    const seam = garment.seams[si];
    const sPath = `seams[${si}]`;

    if (!seam.edges_a || seam.edges_a.length === 0) {
      issues.push({
        code: 'EMPTY_SEAM_SIDE',
        message: `Seam '${seam.id}' side A is empty`,
        severity: 'error',
        path: `${sPath}.edges_a`
      });
    }

    if (!seam.edges_b || seam.edges_b.length === 0) {
      issues.push({
        code: 'EMPTY_SEAM_SIDE',
        message: `Seam '${seam.id}' side B is empty`,
        severity: 'error',
        path: `${sPath}.edges_b`
      });
    }

    let lengthA = 0;
    let lengthB = 0;

    for (const ref of seam.edges_a ?? []) {
      const panel = panelMap.get(ref.panel_id);
      if (!panel) {
        issues.push({
          code: 'SEAM_PANEL_NOT_FOUND',
          message: `Seam '${seam.id}' side A references missing panel '${ref.panel_id}'`,
          severity: 'error',
          path: `${sPath}.edges_a`
        });
        continue;
      }
      const edge = panelEdgeMap.get(ref.panel_id)?.get(ref.edge_id);
      if (!edge) {
        issues.push({
          code: 'SEAM_EDGE_NOT_FOUND',
          message: `Seam '${seam.id}' side A references missing edge '${ref.edge_id}' on panel '${ref.panel_id}'`,
          severity: 'error',
          path: `${sPath}.edges_a`
        });
        continue;
      }
      lengthA += edgeLength(edge);
    }

    for (const ref of seam.edges_b ?? []) {
      const panel = panelMap.get(ref.panel_id);
      if (!panel) {
        issues.push({
          code: 'SEAM_PANEL_NOT_FOUND',
          message: `Seam '${seam.id}' side B references missing panel '${ref.panel_id}'`,
          severity: 'error',
          path: `${sPath}.edges_b`
        });
        continue;
      }
      const edge = panelEdgeMap.get(ref.panel_id)?.get(ref.edge_id);
      if (!edge) {
        issues.push({
          code: 'SEAM_EDGE_NOT_FOUND',
          message: `Seam '${seam.id}' side B references missing edge '${ref.edge_id}' on panel '${ref.panel_id}'`,
          severity: 'error',
          path: `${sPath}.edges_b`
        });
        continue;
      }
      lengthB += edgeLength(edge);
    }

    // Length ratio check: warn if seam lengths deviate significantly without gather ratio
    if (lengthA > 0 && lengthB > 0 && !seam.gather_ratio) {
      const ratio = Math.max(lengthA, lengthB) / Math.min(lengthA, lengthB);
      if (ratio > 1.25) {
        issues.push({
          code: 'SEAM_LENGTH_MISMATCH',
          message: `Seam '${seam.id}' lengths differ significantly (${lengthA.toFixed(1)}mm vs ${lengthB.toFixed(1)}mm, ratio ${ratio.toFixed(2)}) without a gather_ratio specified`,
          severity: 'warning',
          path: sPath,
          details: { length_a: lengthA, length_b: lengthB, ratio }
        });
      }
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return {
    valid: errors.length === 0,
    issues,
    errors,
    warnings
  };
}
