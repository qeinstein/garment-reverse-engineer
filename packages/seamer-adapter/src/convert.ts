import type {
  GarmentIR,
  GarmentPanel,
  GarmentMaterial,
  GarmentSeam,
  PanelEdge,
  Point2D,
  SeamEdgeReference
} from '@garment-ir/core';
import type {
  SeamerPattern,
  SeamerPiece,
  SeamerPiecePath,
  SeamerConstrainablePath,
  SeamerConstrainablePoint,
  SeamerSeam,
  SeamerMaterial,
  SeamerPatternSettings3D
} from './seamer-types.js';

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function defaultPatternSettings3D(): SeamerPatternSettings3D {
  return {
    cameraFov: 54.43,
    cameraPosition: [0.49, 0.83, 0.84],
    controlsTarget: [0.095, 0.77, 0.053],
    gravity: [0, -9.8, 0],
    avatarEnabled: true,
    showAvatar: true,
    showArrangementPoints: false,
    showTriangles: false,
    showSeams: true,
    lightingMode: 'flat',
    bokehFStop: 11,
    n8aoEnabled: false,
    n8aoRadius: 0.6,
    n8aoDistanceFalloff: 1.5,
    n8aoIntensity: 5,
    smaaScale: 2,
    forceLowEndHardware: false,
    handleSelfCollisions: true,
    debugFocusPoint: false
  };
}

function slot(color: string) {
  return {
    url: '',
    mediaId: null,
    color,
    scale: 100,
    normalUrl: '',
    normalMediaId: null,
    normalMapScale: 100,
    opacityUrl: '',
    opacityMediaId: null,
    opacityMapScale: 100
  };
}

/**
 * Encodes a stable unique PiecePath ID from panel ID and edge ID.
 */
export function encodePiecePathId(panelId: string, edgeId: string): string {
  return `PP_${panelId}__${edgeId}`;
}

/**
 * Decodes a PiecePath ID back to panel ID and edge ID.
 */
export function decodePiecePathId(piecePathId: string): { panelId: string; edgeId: string } {
  const stripped = piecePathId.startsWith('PP_') ? piecePathId.slice(3) : piecePathId;
  const parts = stripped.split('__');
  if (parts.length >= 2) {
    return { panelId: parts[0], edgeId: parts.slice(1).join('__') };
  }
  return { panelId: '', edgeId: piecePathId };
}

/**
 * Converts a GarmentIR document into an upstream-compatible Seamer Pattern.
 */
export function garmentIRToSeamer(garment: GarmentIR): SeamerPattern {
  const points: SeamerConstrainablePoint[] = [];
  const paths: SeamerConstrainablePath[] = [];
  const pieces: SeamerPiece[] = [];

  let pointCounter = 0;
  let pathCounter = 0;

  // Deduplicate points within a panel if they are coincident within 0.01mm
  const pointKey = (pt: Point2D) => `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`;

  for (const panel of garment.panels) {
    const localPointMap = new Map<string, string>();

    const getOrCreatePoint = (pt: Point2D, prefix = 'Pt'): string => {
      const k = pointKey(pt);
      const existing = localPointMap.get(k);
      if (existing) return existing;

      const id = `${prefix}_${pointCounter++}`;
      points.push({
        id,
        name: id,
        x: pt.x,
        y: pt.y
      });
      localPointMap.set(k, id);
      return id;
    };

    const mainPaths: SeamerPiecePath[] = [];
    const internalPaths: SeamerPiecePath[] = [];

    // Process boundary edges
    const edges = panel.boundary.edges;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (let ei = 0; ei < edges.length; ei++) {
      const edge = edges[ei];
      const startPtId = getOrCreatePoint(edge.start, `P_${panel.id}`);
      const endPtId = getOrCreatePoint(edge.end, `P_${panel.id}`);

      minX = Math.min(minX, edge.start.x, edge.end.x);
      minY = Math.min(minY, edge.start.y, edge.end.y);
      maxX = Math.max(maxX, edge.start.x, edge.end.x);
      maxY = Math.max(maxY, edge.start.y, edge.end.y);

      const pathId = `Path_${panel.id}_${edge.id}_${pathCounter++}`;

      if (edge.kind === 'cubic_bezier' && edge.control_points && edge.control_points.length === 2) {
        const [c1, c2] = edge.control_points;
        paths.push({
          id: pathId,
          name: edge.name ?? edge.id,
          pathType: 'curve',
          pathPoints: [
            {
              id: startPtId,
              handle: {
                v1: { x: 0, y: 0 },
                v2: { x: c1.x - edge.start.x, y: c1.y - edge.start.y },
                sameLength: false,
                sameAngle: false
              }
            },
            {
              id: endPtId,
              handle: {
                v1: { x: c2.x - edge.end.x, y: c2.y - edge.end.y },
                v2: { x: 0, y: 0 },
                sameLength: false,
                sameAngle: false
              }
            }
          ],
          basePoint: startPtId,
          version: 1
        });
      } else if (edge.kind === 'polyline' && edge.polyline_samples && edge.polyline_samples.length > 2) {
        const pathPts = [
          { id: startPtId },
          ...edge.polyline_samples.slice(1, -1).map((sample) => ({ id: getOrCreatePoint(sample, `P_${panel.id}`) })),
          { id: endPtId }
        ];
        paths.push({
          id: pathId,
          name: edge.name ?? edge.id,
          pathType: 'line',
          pathPoints: pathPts,
          basePoint: startPtId,
          version: 1
        });
      } else {
        // Straight line
        paths.push({
          id: pathId,
          name: edge.name ?? edge.id,
          pathType: 'line',
          pathPoints: [{ id: startPtId }, { id: endPtId }],
          basePoint: startPtId,
          version: 1
        });
      }

      const piecePathId = encodePiecePathId(panel.id, edge.id);
      mainPaths.push({
        id: piecePathId,
        name: edge.name ?? edge.id,
        path: pathId,
        from: startPtId,
        to: endPtId,
        reversed: false,
        notches: (edge.notches ?? []).map((n) => ({
          id: n.id,
          position: n.t,
          type: n.type,
          size: n.depth_mm ?? 6.35
        })),
        seamAllowance: edge.seam_allowance_mm ?? panel.seam_allowance_mm
      });
    }

    // Process internal features (darts, fold lines)
    for (const feat of panel.internal_features ?? []) {
      if (feat.points.length >= 2) {
        const featPts = feat.points.map((pt) => ({ id: getOrCreatePoint(pt, `P_${panel.id}`) }));
        const featPathId = `InternalPath_${panel.id}_${feat.id}_${pathCounter++}`;
        paths.push({
          id: featPathId,
          name: feat.name ?? feat.id,
          pathType: 'line',
          pathPoints: featPts,
          basePoint: featPts[0].id,
          version: 1
        });

        internalPaths.push({
          id: encodePiecePathId(panel.id, feat.id),
          name: feat.name ?? feat.id,
          path: featPathId,
          from: featPts[0].id,
          to: featPts[featPts.length - 1].id,
          reversed: false,
          notches: [],
          showIn3d: true
        });
      }
    }

    const cx = Number.isFinite(minX) && Number.isFinite(maxX) ? (minX + maxX) / 2 : 0;
    const cy = Number.isFinite(minY) && Number.isFinite(maxY) ? (minY + maxY) / 2 : 0;
    const originPointId = getOrCreatePoint({ x: cx, y: cy }, `Origin_${panel.id}`);

    // Compute grain direction vector
    const grainAngleRad = (panel.grain_line.angle_deg * Math.PI) / 180;
    const grainVec = panel.grain_line.direction ?? {
      x: Math.cos(grainAngleRad),
      y: Math.sin(grainAngleRad)
    };

    const cylinderBinding = panel.placement_3d?.cylinder_binding;
    const arrangement = {
      mode: cylinderBinding?.mode ?? 'curved',
      cylinderName: cylinderBinding?.cylinder_name ?? 'Torso',
      uDegrees: cylinderBinding?.u_degrees ?? 0,
      v: cylinderBinding?.v ?? 0.5,
      uOffsetMm: 0,
      vOffsetMm: 0,
      radialOffsetMm: cylinderBinding?.radial_offset_mm ?? 10,
      use2DPosition: !cylinderBinding,
      positionChanged: false,
      matrixWorld: panel.placement_3d?.matrix_4x4 ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      position: panel.placement_3d?.translation ?? [0, 0, 0]
    };

    pieces.push({
      id: panel.id,
      name: panel.name,
      label: null,
      type: 'dynamic',
      materialId: panel.material_id,
      origin: { id: `O_${panel.id}`, name: '', x: cx, y: cy },
      originPoint: originPointId,
      position: panel.layout_position ?? { x: cx, y: cy },
      rotation: panel.layout_rotation_deg ?? 0,
      grainVector: { id: `G_${panel.id}`, name: '', x: grainVec.x, y: grainVec.y },
      rightPieces: 1,
      leftPieces: 0,
      mirrorLeftPiecesAxis: 'X',
      mirrorX: false,
      mirrorY: false,
      seamAllowanceInside: false,
      seamAllowance: panel.seam_allowance_mm,
      mainPaths,
      internalPaths,
      settings3d: {
        arrangement,
        enable3d: true,
        frozen: false,
        flipNormals: panel.placement_3d?.flip_normal ?? false,
        filterExternalCollisionsByClothNormal: false,
        collisionLayer: 0,
        particleDistance: 10,
        savedPositions: []
      }
    });
  }

  // Convert seams
  const seams: SeamerSeam[] = garment.seams.map((seam) => ({
    id: seam.id,
    name: seam.name ?? seam.id,
    label: null,
    fromPaths: seam.edges_a.map((ref) => ({
      id: encodePiecePathId(ref.panel_id, ref.edge_id),
      mirrored: ref.mirrored ?? false,
      reversed: ref.reversed ?? false
    })),
    toPaths: seam.edges_b.map((ref) => ({
      id: encodePiecePathId(ref.panel_id, ref.edge_id),
      mirrored: ref.mirrored ?? false,
      reversed: ref.reversed ?? false
    }))
  }));

  // Convert materials
  const materials: SeamerMaterial[] = garment.materials.map((mat) => {
    const c = mat.color ?? '#2d3742';
    return {
      id: mat.id,
      name: mat.name,
      frontTexture: slot(c),
      backTexture: slot(c),
      useSeparateBackSide: false,
      stretchWarpValue: mat.stretch_warp,
      stretchWeftValue: mat.stretch_weft,
      bendValue: mat.bend_stiffness,
      thickness: mat.thickness_mm,
      weight: mat.density_gsm,
      roughness: mat.roughness ?? 0.85,
      metalness: mat.metalness ?? 0.05,
      specularIntensity: 0.25,
      opacity: mat.opacity ?? 1.0,
      normalScale: 1.0,
      alphaCutoff: 0,
      libraryItemId: null,
      libraryVersion: null,
      libraryUpdatedAt: null
    };
  });

  return {
    id: garment.metadata.id,
    name: garment.metadata.name,
    description: garment.metadata.description ?? '',
    lengthUnit: garment.units.spatial_2d === 'inch' ? 'inch' : garment.units.spatial_2d === 'cm' ? 'cm' : 'mm',
    angleUnit: garment.units.angles === 'radians' ? 'radians' : 'degrees',
    defaultNotchSize: 6.35,
    defaultNotchType: 'single',
    isPublic: false,
    pointLabeling: 'numeric',
    pointPrefix: 'A',
    points,
    variables: [],
    paths,
    pieces,
    seams,
    materials,
    seamAllowance: garment.panels[0]?.seam_allowance_mm ?? 12.7,
    versionName: '1.0',
    versionId: garment.metadata.id,
    versionNumber: 1,
    softwareVersion: '1.0.0',
    currentSize: '',
    images: [],
    frozenSnapshot: null,
    texts: [],
    body: {
      fields: garment.wearer?.measurements ?? { age: 35, height: 65, weight: 150 },
      gender: garment.wearer?.gender === 'male' ? 'male' : 'female',
      unitType: garment.wearer?.unit === 'imperial' ? 'imperial' : 'metric',
      bodyColor: '#b58a6a'
    },
    layers: [{ id: 'default', name: 'Default', visible: true, locked: false, order: 0, style: null }],
    currentLayerId: 'default',
    useBodyMeasurementsForSizes: false,
    gradingProfile: null,
    markerSettings: null,
    graphicsOffset: { x: 0, y: 0 },
    graphicsScale: 0.3,
    enable3d: true,
    showCompass: false,
    showGrid: true,
    snapToGrid: false,
    snapToGuides: false,
    showPieceNames: true,
    showMeasurements: true,
    showConstruction: true,
    viewMode: 'both',
    interactionMode: 'fast',
    settings3d: defaultPatternSettings3D(),
    hasChanged: false
  };
}

/**
 * Converts a Seamer Pattern back into canonical GarmentIR.
 */
export function seamerToGarmentIR(pattern: SeamerPattern): GarmentIR {
  const pointsMap = new Map<string, SeamerConstrainablePoint>();
  for (const pt of pattern.points) pointsMap.set(pt.id, pt);

  const pathsMap = new Map<string, SeamerConstrainablePath>();
  for (const p of pattern.paths) pathsMap.set(p.id, p);

  const panels: GarmentPanel[] = pattern.pieces.map((piece) => {
    const edges: PanelEdge[] = piece.mainPaths.map((pp) => {
      const { edgeId } = decodePiecePathId(pp.id);
      const startPt = pointsMap.get(pp.from) ?? { id: pp.from, name: '', x: 0, y: 0 };
      const endPt = pointsMap.get(pp.to) ?? { id: pp.to, name: '', x: 0, y: 0 };
      const path = pathsMap.get(pp.path);

      let kind: PanelEdge['kind'] = 'line';
      let controlPoints: [Point2D, Point2D] | undefined = undefined;
      let polylineSamples: Point2D[] | undefined = undefined;

      if (path && path.pathType === 'curve' && path.pathPoints.length === 2) {
        const p0 = path.pathPoints[0];
        const p1 = path.pathPoints[1];
        if (p0.handle?.v2 || p1.handle?.v1) {
          kind = 'cubic_bezier';
          const hStart = p0.handle?.v2 ?? { x: 0, y: 0 };
          const hEnd = p1.handle?.v1 ?? { x: 0, y: 0 };
          controlPoints = [
            { x: startPt.x + hStart.x, y: startPt.y + hStart.y },
            { x: endPt.x + hEnd.x, y: endPt.y + hEnd.y }
          ];
        }
      } else if (path && path.pathPoints.length > 2) {
        kind = 'polyline';
        polylineSamples = path.pathPoints.map((ptRef) => {
          const pt = pointsMap.get(ptRef.id);
          return pt ? { x: pt.x, y: pt.y } : { x: 0, y: 0 };
        });
      }

      return {
        id: edgeId || pp.id,
        name: pp.name || edgeId || pp.id,
        kind,
        start: { x: startPt.x, y: startPt.y },
        end: { x: endPt.x, y: endPt.y },
        control_points: controlPoints,
        polyline_samples: polylineSamples,
        seam_allowance_mm: pp.seamAllowance ?? piece.seamAllowance ?? pattern.seamAllowance,
        notches: (pp.notches ?? []).map((n, idx) => ({
          id: n.id ?? `n_${idx}`,
          t: n.position ?? 0.5,
          type: n.type ?? 'single',
          depth_mm: n.size ?? 6.35
        }))
      };
    });

    const grainVec = piece.grainVector ?? { x: 0, y: 1 };
    const grainAngleDeg = (Math.atan2(grainVec.y, grainVec.x) * 180) / Math.PI;

    return {
      id: piece.id,
      name: piece.name,
      category: 'other',
      material_id: piece.materialId,
      grain_line: {
        angle_deg: grainAngleDeg,
        direction: { x: grainVec.x, y: grainVec.y }
      },
      seam_allowance_mm: piece.seamAllowance ?? pattern.seamAllowance,
      layout_position: piece.position,
      layout_rotation_deg: piece.rotation,
      placement_3d: {
        cylinder_binding: piece.settings3d.arrangement?.cylinderName
          ? {
              cylinder_name: piece.settings3d.arrangement.cylinderName,
              u_degrees: piece.settings3d.arrangement.uDegrees,
              v: piece.settings3d.arrangement.v,
              radial_offset_mm: piece.settings3d.arrangement.radialOffsetMm,
              mode: (piece.settings3d.arrangement.mode as 'curved' | 'flat') ?? 'curved'
            }
          : undefined,
        translation: piece.settings3d.arrangement?.position as [number, number, number] | undefined,
        matrix_4x4: piece.settings3d.arrangement?.matrixWorld,
        flip_normal: piece.settings3d.flipNormals
      },
      boundary: {
        closed: true,
        edges
      }
    };
  });

  const seams: GarmentSeam[] = pattern.seams.map((seam) => ({
    id: seam.id,
    name: seam.name,
    edges_a: seam.fromPaths.map((ref): SeamEdgeReference => {
      const { panelId, edgeId } = decodePiecePathId(ref.id);
      return {
        panel_id: panelId,
        edge_id: edgeId,
        reversed: ref.reversed,
        mirrored: ref.mirrored
      };
    }),
    edges_b: seam.toPaths.map((ref): SeamEdgeReference => {
      const { panelId, edgeId } = decodePiecePathId(ref.id);
      return {
        panel_id: panelId,
        edge_id: edgeId,
        reversed: ref.reversed,
        mirrored: ref.mirrored
      };
    })
  }));

  const materials: GarmentMaterial[] = pattern.materials.map((mat) => ({
    id: mat.id,
    name: mat.name,
    stretch_warp: mat.stretchWarpValue,
    stretch_weft: mat.stretchWeftValue,
    bend_stiffness: mat.bendValue,
    thickness_mm: mat.thickness,
    density_gsm: mat.weight,
    color: mat.frontTexture?.color,
    roughness: mat.roughness,
    metalness: mat.metalness,
    opacity: mat.opacity
  }));

  return {
    schema_version: '0.1.0',
    metadata: {
      id: pattern.id,
      name: pattern.name,
      category: 'garment',
      description: pattern.description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    units: {
      spatial_2d: pattern.lengthUnit === 'inch' ? 'inch' : pattern.lengthUnit === 'cm' ? 'cm' : 'mm',
      spatial_3d: 'm',
      angles: pattern.angleUnit === 'radians' ? 'radians' : 'degrees',
      mass_density: 'g/m2'
    },
    materials,
    panels,
    seams,
    wearer: {
      gender: pattern.body.gender === 'male' ? 'male' : 'female',
      unit: pattern.body.unitType === 'imperial' ? 'imperial' : 'metric',
      measurements: pattern.body.fields
    }
  };
}
