import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateGarmentIR } from '@garment-ir/validation';
import { garmentIRToSeamer } from '@garment-ir/seamer-adapter';
import { reweaverToGarmentIR, type ReWeaverRawOutput } from '@garment-ir/reweaver-adapter';

import { pieceOutline } from '@seamer/pattern-model/utils/patternGeometry';
import {
  computeSeamEdgeIntervals,
  buildPieceCloth,
  arrangeParticles,
  buildSimData,
  type ArrangedPiece
} from '@seamer/cloth-sim';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('End-to-End ReWeaver Pipeline: ReWeaverRawOutput -> GarmentIR -> Seamer 2D/3D Drape', () => {
  const fixturePath = path.resolve(
    __dirname,
    '../packages/reweaver-adapter/fixtures/reweaver-pencil-skirt.json'
  );
  const rawOutput: ReWeaverRawOutput = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  let garmentIR: ReturnType<typeof reweaverToGarmentIR>;
  let seamerPattern: ReturnType<typeof garmentIRToSeamer>;
  let arrangedPieces: ArrangedPiece[] = [];

  it('Step 1: Ingests ReWeaverRawOutput and converts to canonical GarmentIR', () => {
    expect(rawOutput.name).toBe('pencil_skirt_reweaver_pred');
    expect(rawOutput.curve_points.length).toBe(6);
    expect(rawOutput.patch_curve_connectivity.length).toBe(2);

    garmentIR = reweaverToGarmentIR(rawOutput, {
      garmentName: 'Reconstructed Pencil Skirt',
      category: 'skirt',
    });

    expect(garmentIR.schema_version).toBe('0.1.0');
    expect(garmentIR.panels).toHaveLength(2);
    expect(garmentIR.seams).toHaveLength(2);
    expect(garmentIR.hypotheses).toBeDefined();
    expect(garmentIR.hypotheses!.length).toBeGreaterThan(0);
  });

  it('Step 2: Passes strict GarmentIR topology, physical validity, and seam integrity checks', () => {
    const report = validateGarmentIR(garmentIR);
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);

    // Verify both panels are watertight and properly bounded
    for (const panel of garmentIR.panels) {
      expect(panel.boundary.closed).toBe(true);
      expect(panel.boundary.edges.length).toBe(4);
      for (const edge of panel.boundary.edges) {
        expect(edge.polyline_samples).toBeDefined();
        expect(edge.polyline_samples!.length).toBeGreaterThanOrEqual(2);
      }
    }

    // Verify seams connect front to back
    const seam0 = garmentIR.seams[0];
    const seam1 = garmentIR.seams[1];
    expect(seam0.edges_a[0].panel_id).not.toBe(seam0.edges_b[0].panel_id);
    expect(seam1.edges_a[0].panel_id).not.toBe(seam1.edges_b[0].panel_id);
  });

  it('Step 3: Translates canonical GarmentIR to Seamer Pattern representation', () => {
    seamerPattern = garmentIRToSeamer(garmentIR);

    expect(seamerPattern.lengthUnit).toBe('mm');
    expect(seamerPattern.pieces).toHaveLength(2);
    expect(seamerPattern.seams).toHaveLength(2);

    const frontPiece = seamerPattern.pieces.find((p) => p.id === 'panel_0');
    const backPiece = seamerPattern.pieces.find((p) => p.id === 'panel_1');

    expect(frontPiece).toBeDefined();
    expect(backPiece).toBeDefined();
    expect(frontPiece?.settings3d.arrangement.cylinderName).toBe('Torso');
    expect(backPiece?.settings3d.arrangement.cylinderName).toBe('Torso');
  });

  it('Step 4: Seamer 2D geometry engine computes outline vertices and dimensions', () => {
    for (const piece of seamerPattern.pieces) {
      const outline = pieceOutline(seamerPattern as any, piece);
      expect(outline.length).toBeGreaterThan(10);

      // Verify outline coordinates are non-degenerate
      for (const pt of outline) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }

      // Verify coordinate dimensions match pencil skirt scale (~350mm width, ~600mm height)
      const xs = outline.map((p) => p.x);
      const ys = outline.map((p) => p.y);
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...ys) - Math.min(...ys);

      expect(width).toBeGreaterThan(250);
      expect(width).toBeLessThan(500);
      expect(height).toBeGreaterThan(450);
      expect(height).toBeLessThan(800);
    }
  });

  it('Step 5: Seamer cloth triangulator builds 3D meshes and seam intervals for all pieces', () => {
    const intervals = computeSeamEdgeIntervals(seamerPattern as any);
    expect(intervals.size).toBeGreaterThan(0);

    arrangedPieces = [];

    for (const piece of seamerPattern.pieces) {
      const cloth = buildPieceCloth(seamerPattern as any, piece, 20, intervals);
      expect(cloth).not.toBeNull();
      expect(cloth!.mesh.points.length).toBeGreaterThan(10);
      expect(cloth!.mesh.triangles.length).toBeGreaterThan(10);

      // Verify that every boundary edge in the piece has resampled particle correspondences
      for (const mainPath of (piece as any).mainPaths) {
        const edgeParticles = cloth!.edgeParticles.get(mainPath.id);
        expect(edgeParticles).toBeDefined();
        expect(edgeParticles!.length).toBeGreaterThanOrEqual(2);
      }

      // Arrange particles in 3D around Torso cylinder
      const positions3d = arrangeParticles(cloth!.mesh.points, piece.settings3d.arrangement, null);
      expect(positions3d.length).toBe(cloth!.mesh.points.length * 3);

      for (let i = 0; i < positions3d.length; i++) {
        expect(Number.isFinite(positions3d[i])).toBe(true);
      }

      arrangedPieces.push({
        cloth: cloth!,
        positions3d,
        frozen: false,
        fromSaved: false,
      });
    }

    expect(arrangedPieces).toHaveLength(2);
  });

  it('Step 6: Seamer physics assembler generates full GPU simulation constraints', () => {
    const simData = buildSimData(seamerPattern as any, arrangedPieces);

    expect(simData).toBeDefined();
    expect(simData.particleCount).toBeGreaterThan(50);
    expect(simData.positions.length).toBe(simData.particleCount * 4); // vec4 [x,y,z,invMass]
    expect(simData.stretchColors.length).toBeGreaterThan(0);
    expect(simData.bendColors.length).toBeGreaterThan(0);
    expect(simData.seams.length).toBe(simData.particleCount * 4);
    expect(simData.stitchCount).toBeGreaterThan(0);
    expect(simData.seamPairsBySeam.length).toBeGreaterThan(0);

    // Verify seam links connect front piece to back piece
    const totalSeamLinks = simData.seamPairsBySeam.reduce((acc, s) => acc + s.pairs.length / 2, 0);
    expect(totalSeamLinks).toBeGreaterThan(5);
  });
});

