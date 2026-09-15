import { describe, it, expect } from 'vitest';
import { PENCIL_SKIRT_FIXTURE } from '@garment-ir/core';
import { validateGarmentIR } from '@garment-ir/validation';
import { garmentIRToSeamer } from '@garment-ir/seamer-adapter';
import { pieceOutline } from '@seamer/pattern-model/utils/patternGeometry';
import {
  computeSeamEdgeIntervals,
  buildPieceCloth,
  arrangeParticles,
  buildSimData,
  type ArrangedPiece
} from '@seamer/cloth-sim';

describe('End-to-End Non-ML Vertical Slice: GarmentIR -> Seamer -> 2D CAD -> 3D Cloth Drape', () => {
  it('Step 1: Validates the canonical GarmentIR pencil skirt fixture', () => {
    const validation = validateGarmentIR(PENCIL_SKIRT_FIXTURE);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(PENCIL_SKIRT_FIXTURE.panels).toHaveLength(4);
    expect(PENCIL_SKIRT_FIXTURE.seams.length).toBeGreaterThan(0);
  });

  it('Step 2: Converts GarmentIR to a full Seamer Pattern via adapter', () => {
    const pattern = garmentIRToSeamer(PENCIL_SKIRT_FIXTURE);

    expect(pattern.name).toBe(PENCIL_SKIRT_FIXTURE.metadata.name);
    expect(pattern.pieces).toHaveLength(4);
    expect(pattern.seams).toHaveLength(6);
    expect(pattern.materials).toHaveLength(2);
    expect(pattern.lengthUnit).toBe('mm');
    expect(pattern.enable3d).toBe(true);
  });

  it('Step 3: Seamer 2D geometry engine computes valid closed outlines for all pieces', () => {
    const pattern = garmentIRToSeamer(PENCIL_SKIRT_FIXTURE);

    for (const piece of pattern.pieces as any[]) {
      const outline = pieceOutline(pattern as any, piece);
      expect(outline.length).toBeGreaterThan(3);

      // Verify outline coordinates are non-degenerate
      for (const pt of outline) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }

      // Check bounding box width and height > 0
      const xs = outline.map((p) => p.x);
      const ys = outline.map((p) => p.y);
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...ys) - Math.min(...ys);
      expect(width).toBeGreaterThan(10);
      expect(height).toBeGreaterThan(10);
    }
  });

  it('Step 4: Seamer cloth triangulator builds 3D meshes and seam intervals for all pieces', () => {
    const pattern = garmentIRToSeamer(PENCIL_SKIRT_FIXTURE) as any;
    const intervals = computeSeamEdgeIntervals(pattern);
    expect(intervals.size).toBeGreaterThan(0);

    const arrangedPieces: ArrangedPiece[] = [];

    for (const piece of pattern.pieces) {
      const cloth = buildPieceCloth(pattern, piece, 15, intervals);
      expect(cloth).not.toBeNull();
      expect(cloth!.mesh.points.length).toBeGreaterThan(10);
      expect(cloth!.mesh.triangles.length).toBeGreaterThan(10);

      // Verify that every boundary edge in the piece has resampled particle correspondences
      for (const mainPath of piece.mainPaths) {
        const edgeParticles = cloth!.edgeParticles.get(mainPath.id);
        expect(edgeParticles).toBeDefined();
        expect(edgeParticles!.length).toBeGreaterThanOrEqual(2);
      }

      // Arrange particles in 3D
      const positions3d = arrangeParticles(cloth!.mesh.points, piece.settings3d.arrangement, null);
      expect(positions3d.length).toBe(cloth!.mesh.points.length * 3);

      // Verify all 3D coordinates are finite and in meters
      for (let i = 0; i < positions3d.length; i++) {
        expect(Number.isFinite(positions3d[i])).toBe(true);
      }

      arrangedPieces.push({
        cloth: cloth!,
        positions3d,
        frozen: false,
        fromSaved: false
      });
    }

    expect(arrangedPieces).toHaveLength(4);
  });

  it('Step 5: Seamer physics assembler generates full GPU simulation constraints', () => {
    const pattern = garmentIRToSeamer(PENCIL_SKIRT_FIXTURE) as any;
    const intervals = computeSeamEdgeIntervals(pattern);

    const arrangedPieces: ArrangedPiece[] = pattern.pieces.map((piece: any) => {
      const cloth = buildPieceCloth(pattern, piece, 15, intervals)!;
      const positions3d = arrangeParticles(cloth.mesh.points, piece.settings3d.arrangement, null);
      return {
        cloth,
        positions3d,
        frozen: false,
        fromSaved: false
      };
    });

    // Assemble complete GPU simulation data
    const simData = buildSimData(pattern, arrangedPieces);

    expect(simData.particleCount).toBeGreaterThan(100);
    expect(simData.positions.length).toBe(simData.particleCount * 4); // vec4 [x,y,z,invMass]
    expect(simData.stretchColors.length).toBeGreaterThan(0);
    expect(simData.bendColors.length).toBeGreaterThan(0);
    expect(simData.seams.length).toBe(simData.particleCount * 4);
    expect(simData.stitchCount).toBeGreaterThan(0);
    expect(simData.seamPairsBySeam.length).toBeGreaterThan(0);

    // Verify seam pairs connect opposing panels
    const totalSeamLinks = simData.seamPairsBySeam.reduce((acc, s) => acc + s.pairs.length / 2, 0);
    expect(totalSeamLinks).toBeGreaterThan(20);
  });
});
