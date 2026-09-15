import { describe, it, expect } from 'vitest';
import { PENCIL_SKIRT_FIXTURE } from '@garment-ir/core';
import { garmentIRToSeamer, seamerToGarmentIR, encodePiecePathId, decodePiecePathId } from './convert.js';

describe('Seamer Adapter (GarmentIR <-> Seamer Pattern)', () => {
  it('should encode and decode PiecePath IDs stably', () => {
    const encoded = encodePiecePathId('panel_skirt_front', 'edge_front_waist');
    expect(encoded).toBe('PP_panel_skirt_front__edge_front_waist');
    const decoded = decodePiecePathId(encoded);
    expect(decoded.panelId).toBe('panel_skirt_front');
    expect(decoded.edgeId).toBe('edge_front_waist');
  });

  it('should convert GarmentIR to a valid Seamer Pattern structure', () => {
    const pattern = garmentIRToSeamer(PENCIL_SKIRT_FIXTURE);

    expect(pattern.id).toBe(PENCIL_SKIRT_FIXTURE.metadata.id);
    expect(pattern.name).toBe(PENCIL_SKIRT_FIXTURE.metadata.name);
    expect(pattern.lengthUnit).toBe('mm');
    expect(pattern.enable3d).toBe(true);

    // Verify pieces
    expect(pattern.pieces).toHaveLength(4);
    const pieceIds = pattern.pieces.map((p) => p.id);
    expect(pieceIds).toContain('panel_skirt_front');
    expect(pieceIds).toContain('panel_skirt_back');
    expect(pieceIds).toContain('panel_waistband_front');
    expect(pieceIds).toContain('panel_waistband_back');

    // Verify front piece settings
    const frontPiece = pattern.pieces.find((p) => p.id === 'panel_skirt_front');
    expect(frontPiece).toBeDefined();
    expect(frontPiece?.type).toBe('dynamic');
    expect(frontPiece?.settings3d.enable3d).toBe(true);
    expect(frontPiece?.settings3d.flipNormals).toBe(false);
    expect(frontPiece?.settings3d.arrangement.cylinderName).toBe('Torso');
    expect(frontPiece?.settings3d.arrangement.uDegrees).toBe(0);
    expect(frontPiece?.settings3d.arrangement.v).toBe(1.08);

    // Verify back piece flipped normal
    const backPiece = pattern.pieces.find((p) => p.id === 'panel_skirt_back');
    expect(backPiece?.settings3d.flipNormals).toBe(true);
    expect(backPiece?.settings3d.arrangement.uDegrees).toBe(180);

    // Verify materials
    expect(pattern.materials).toHaveLength(2);
    const wool = pattern.materials.find((m) => m.id === 'mat_wool_crepe');
    expect(wool).toBeDefined();
    expect(wool?.stretchWarpValue).toBe(12);
    expect(wool?.stretchWeftValue).toBe(15);
    expect(wool?.thickness).toBe(0.8);
    expect(wool?.weight).toBe(240);
  });

  it('should preserve every seam reference mapping to real PiecePath IDs', () => {
    const pattern = garmentIRToSeamer(PENCIL_SKIRT_FIXTURE);

    const allPiecePathIds = new Set<string>();
    for (const piece of pattern.pieces) {
      for (const pp of piece.mainPaths) allPiecePathIds.add(pp.id);
      for (const pp of piece.internalPaths) allPiecePathIds.add(pp.id);
    }

    expect(pattern.seams.length).toBe(PENCIL_SKIRT_FIXTURE.seams.length);

    for (const seam of pattern.seams) {
      expect(seam.fromPaths.length).toBeGreaterThan(0);
      expect(seam.toPaths.length).toBeGreaterThan(0);

      for (const ref of seam.fromPaths) {
        expect(allPiecePathIds.has(ref.id)).toBe(true);
      }
      for (const ref of seam.toPaths) {
        expect(allPiecePathIds.has(ref.id)).toBe(true);
      }
    }
  });

  it('should support round-trip conversion without loss of critical topology', () => {
    const seamerPattern = garmentIRToSeamer(PENCIL_SKIRT_FIXTURE);
    const recoveredGarment = seamerToGarmentIR(seamerPattern);

    expect(recoveredGarment.schema_version).toBe('0.1.0');
    expect(recoveredGarment.panels).toHaveLength(PENCIL_SKIRT_FIXTURE.panels.length);
    expect(recoveredGarment.seams).toHaveLength(PENCIL_SKIRT_FIXTURE.seams.length);
    expect(recoveredGarment.materials).toHaveLength(PENCIL_SKIRT_FIXTURE.materials.length);

    // Check panel edge counts
    const frontOriginal = PENCIL_SKIRT_FIXTURE.panels.find((p) => p.id === 'panel_skirt_front');
    const frontRecovered = recoveredGarment.panels.find((p) => p.id === 'panel_skirt_front');
    expect(frontRecovered?.boundary.edges.length).toBe(frontOriginal?.boundary.edges.length);

    // Check cylinder binding preserved
    expect(frontRecovered?.placement_3d?.cylinder_binding?.cylinder_name).toBe('Torso');
    expect(frontRecovered?.placement_3d?.cylinder_binding?.u_degrees).toBe(0);

    // Check seam connectivity preserved
    const sideSeamRecovered = recoveredGarment.seams.find((s) => s.id === 'seam_side_right');
    expect(sideSeamRecovered).toBeDefined();
    expect(sideSeamRecovered?.edges_a[0].panel_id).toBe('panel_skirt_front');
    expect(sideSeamRecovered?.edges_a[0].edge_id).toBe('edge_front_side_right');
    expect(sideSeamRecovered?.edges_b[0].panel_id).toBe('panel_skirt_back');
    expect(sideSeamRecovered?.edges_b[0].edge_id).toBe('edge_back_side_right');
  });
});
