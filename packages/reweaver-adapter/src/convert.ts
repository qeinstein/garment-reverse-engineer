import type {
  GarmentIR,
  GarmentPanel,
  GarmentSeam,
  PanelEdge,
  Point2D,
  Point3D,
  PanelPlacement3D,
} from '@garment-ir/core';
import type { ReWeaverRawOutput, ReWeaverAdapterOptions } from './types.js';

/**
 * Calculates 3D centroid from a patch point cloud.
 */
function computeCentroid(points?: number[][][] | number[][]): [number, number, number] {
  if (!points || points.length === 0) {
    return [0.0, 1.0, 0.0];
  }

  // Handle nested [H, W, 3] or flat [N, 3]
  const flatPoints: number[][] = [];
  if (Array.isArray(points[0]) && Array.isArray(points[0][0])) {
    for (const row of points as number[][][]) {
      for (const pt of row) {
        flatPoints.push(pt);
      }
    }
  } else {
    for (const pt of points as number[][]) {
      flatPoints.push(pt);
    }
  }

  if (flatPoints.length === 0) {
    return [0.0, 1.0, 0.0];
  }

  let sumX = 0, sumY = 0, sumZ = 0;
  for (const pt of flatPoints) {
    sumX += pt[0] ?? 0;
    sumY += pt[1] ?? 0;
    sumZ += pt[2] ?? 0;
  }

  const n = flatPoints.length;
  return [sumX / n, sumY / n, sumZ / n];
}

/**
 * Connects, reorders, and snaps edges sequentially so they form a continuous,
 * watertight closed boundary loop without gaps.
 */
function orderAndChainEdges(edges: PanelEdge[]): PanelEdge[] {
  if (edges.length <= 1) return edges;

  const unused = [...edges];
  const ordered: PanelEdge[] = [];

  // Start with the first edge
  let current = unused.shift()!;
  ordered.push(current);

  while (unused.length > 0) {
    const currentEnd = current.end;
    let bestIdx = -1;
    let bestDist = Infinity;
    let mustReverse = false;

    for (let i = 0; i < unused.length; i++) {
      const candidate = unused[i];
      const dStart = Math.hypot(candidate.start.x - currentEnd.x, candidate.start.y - currentEnd.y);
      const dEnd = Math.hypot(candidate.end.x - currentEnd.x, candidate.end.y - currentEnd.y);

      if (dStart < bestDist) {
        bestDist = dStart;
        bestIdx = i;
        mustReverse = false;
      }
      if (dEnd < bestDist) {
        bestDist = dEnd;
        bestIdx = i;
        mustReverse = true;
      }
    }

    if (bestIdx === -1) break;

    const [nextEdge] = unused.splice(bestIdx, 1);
    let samples = nextEdge.polyline_samples
      ? [...nextEdge.polyline_samples]
      : [{ ...nextEdge.start }, { ...nextEdge.end }];

    if (mustReverse) {
      samples.reverse();
    }

    // Snap start to currentEnd exactly
    samples[0] = { x: currentEnd.x, y: currentEnd.y };

    const newStart = samples[0];
    const newEnd = samples[samples.length - 1];

    current = {
      ...nextEdge,
      start: newStart,
      end: newEnd,
      polyline_samples: samples,
    };
    ordered.push(current);
  }

  // Snap last edge end to first edge start to guarantee exact closure
  if (ordered.length > 2) {
    const firstStart = ordered[0].start;
    const last = ordered[ordered.length - 1];
    if (last.polyline_samples && last.polyline_samples.length > 0) {
      last.polyline_samples[last.polyline_samples.length - 1] = { x: firstStart.x, y: firstStart.y };
    }
    last.end = { x: firstStart.x, y: firstStart.y };
  }

  return ordered;
}

/**
 * Translates a ReWeaver raw output bundle into a canonical GarmentIR document.
 */
export function reweaverToGarmentIR(
  raw: ReWeaverRawOutput,
  options: ReWeaverAdapterOptions = {}
): GarmentIR {
  const minSeamConf = options.minSeamConfidence ?? 0.3;
  const defaultGsm = options.defaultMaterialGsm ?? 220.0;
  const now = new Date().toISOString();

  const garmentId = raw.name || 'reconstructed_garment';
  const garmentName = options.garmentName || garmentId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const materialId = 'mat_cotton_twill';

  // 1. Build Panels
  const sortedPanelEntries = Object.entries(raw.flatten_pred).sort(
    ([a], [b]) => (Number.parseInt(a, 10) || 0) - (Number.parseInt(b, 10) || 0)
  );

  const panels: GarmentPanel[] = [];
  const conn = raw.patch_curve_connectivity;

  for (const [panelKey, flatten] of sortedPanelEntries) {
    const pIdx = flatten.panel_index ?? (Number.parseInt(panelKey, 10) || 0);
    const panelId = `panel_${pIdx}`;

    // ReWeaver scale_pred is in meters per normalized unit -> convert to mm (x 1000)
    const scaleMm = (flatten.scale_pred ?? 1.0) * 1000.0;

    // Find active curves for this patch from connectivity matrix
    const activeCurveIndices: number[] = [];
    if (conn && conn[pIdx]) {
      for (let c = 0; c < conn[pIdx].length; c++) {
        if (conn[pIdx][c]) {
          activeCurveIndices.push(c);
        }
      }
    }

    const edges: PanelEdge[] = [];
    for (let edgeIdx = 0; edgeIdx < flatten.edge_points.length; edgeIdx++) {
      const edgeId = `edge_${pIdx}_${edgeIdx}`;
      const rawPoints = flatten.edge_points[edgeIdx];

      // Convert local normalized points to mm
      const polylineSamples: Point2D[] = rawPoints.map((pt) => ({
        x: Math.round(pt[0] * scaleMm * 100) / 100,
        y: Math.round(pt[1] * scaleMm * 100) / 100,
      }));

      const start = polylineSamples[0] ?? { x: 0, y: 0 };
      const end = polylineSamples[polylineSamples.length - 1] ?? { x: 0, y: 0 };

      // Confidence from linked curve if present
      let edgeConfidence = 0.85;
      if (edgeIdx < activeCurveIndices.length) {
        const cIdx = activeCurveIndices[edgeIdx];
        if (raw.curve_valid_prob && cIdx < raw.curve_valid_prob.length) {
          edgeConfidence = raw.curve_valid_prob[cIdx];
        }
      }

      edges.push({
        id: edgeId,
        name: `Edge ${edgeIdx + 1}`,
        kind: 'polyline',
        start,
        end,
        polyline_samples: polylineSamples,
        confidence: Math.round(edgeConfidence * 100) / 100,
      });
    }

    // Chain and orient edges into a continuous, watertight loop
    const chainedEdges = orderAndChainEdges(edges);

    // Determine 3D centroid and placement
    const patchPoints =
      (raw.patch_points_scaled && raw.patch_points_scaled[pIdx]) ||
      (raw.patch_points && raw.patch_points[pIdx]);
    const centroid = computeCentroid(patchPoints as unknown as number[][][]);

    // Z >= 0 is front; Z < 0 is back
    const isFront = centroid[2] >= 0.0;
    const bodyRegion = isFront ? 'torso_front' : 'torso_back';
    const category = isFront ? 'body_front' : 'body_back';
    const uDegrees = isFront ? 0.0 : 180.0;

    const placement3d: PanelPlacement3D = {
      body_region: bodyRegion,
      cylinder_binding: {
        cylinder_name: 'Torso',
        u_degrees: uDegrees,
        v: 0.5,
        radial_offset_mm: 12.0,
        mode: 'curved',
      },
      translation: [
        Math.round(centroid[0] * 10000) / 10000,
        Math.round(centroid[1] * 10000) / 10000,
        Math.round(centroid[2] * 10000) / 10000,
      ],
    };

    panels.push({
      id: panelId,
      name: `Panel ${pIdx + 1} (${isFront ? 'Front' : 'Back'})`,
      category,
      material_id: materialId,
      boundary: {
        edges: chainedEdges,
        closed: true,
      },
      grain_line: {
        angle_deg: 90.0,
      },
      placement_3d: placement3d,
      confidence: 0.85,
    });
  }

  // 2. Build Seams from Bipartite Incidence
  const seams: GarmentSeam[] = [];

  if (conn && conn.length > 0) {
    const numPanels = conn.length;
    const numCurves = conn[0].length;

    // Cache active curve lists for each panel
    const panelActiveCurves: number[][] = [];
    for (let p = 0; p < numPanels; p++) {
      const active: number[] = [];
      for (let c = 0; c < numCurves; c++) {
        if (conn[p][c]) active.push(c);
      }
      panelActiveCurves.push(active);
    }

    for (let c = 0; c < numCurves; c++) {
      const connectedPanels: number[] = [];
      for (let p = 0; p < numPanels; p++) {
        if (conn[p][c]) {
          connectedPanels.push(p);
        }
      }

      const curveConf = raw.curve_valid_prob && c < raw.curve_valid_prob.length ? raw.curve_valid_prob[c] : 0.8;
      if (curveConf < minSeamConf) continue;

      if (connectedPanels.length === 2) {
        const p1 = connectedPanels[0];
        const p2 = connectedPanels[1];

        const edgeIdx1 = panelActiveCurves[p1].indexOf(c);
        const edgeIdx2 = panelActiveCurves[p2].indexOf(c);

        if (edgeIdx1 !== -1 && edgeIdx2 !== -1) {
          seams.push({
            id: `seam_c${c}_p${p1}_to_p${p2}`,
            name: `Seam ${p1 + 1}-${p2 + 1}`,
            edges_a: [{ panel_id: `panel_${p1}`, edge_id: `edge_${p1}_${edgeIdx1}` }],
            edges_b: [{ panel_id: `panel_${p2}`, edge_id: `edge_${p2}_${edgeIdx2}`, reversed: true }],
            seam_type: 'plain',
            confidence: Math.round(curveConf * 100) / 100,
          });
        }
      }
    }
  }

  return {
    schema_version: '0.1.0',
    metadata: {
      id: garmentId,
      name: garmentName,
      category: options.category || 'reconstructed_garment',
      description: 'Garment reconstructed by ReWeaver vision-geometry engine.',
      created_at: now,
      updated_at: now,
      reconstruction_model: {
        name: 'ReWeaver',
        version: '1.0.0',
        checkpoint: (raw.metadata?.model_variant as string) || 'GCD_ori',
        device: (raw.metadata?.device as string) || 'unknown',
      },
    },
    units: {
      spatial_2d: 'mm',
      spatial_3d: 'm',
      angles: 'degrees',
      mass_density: 'g/m2',
    },
    materials: [
      {
        id: materialId,
        name: 'Reconstructed Cotton Twill',
        stretch_warp: 15.0,
        stretch_weft: 20.0,
        bend_stiffness: 25.0,
        thickness_mm: 0.65,
        density_gsm: defaultGsm,
        color: '#3b4252',
        confidence: 0.8,
      },
    ],
    panels,
    seams,
    hypotheses: [
      {
        id: 'hypo_closure_type',
        aspect: 'closure_type',
        description:
          'Vision reconstruction cannot directly identify concealed closures (zippers, hooks, plackets).',
        confidence: 0.65,
        chosen: false,
        alternatives: [
          { label: 'Invisible Side Zipper', confidence: 0.5, description: 'Inserted into left side seam.' },
          { label: 'Center Back Zipper', confidence: 0.35, description: 'Inserted into rear seam.' },
          { label: 'Elastic Waistband', confidence: 0.15, description: 'Continuous pull-on construction.' },
        ],
      },
    ],
  };
}
