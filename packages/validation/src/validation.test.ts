import { describe, it, expect } from 'vitest';
import { PENCIL_SKIRT_FIXTURE } from '@garment-ir/core';
import { validateGarmentIR, edgeLength } from './validate.js';
import type { GarmentIR } from '@garment-ir/core';

describe('GarmentIR Validation Suite', () => {
  it('should validate the realistic pencil skirt fixture without any errors', () => {
    const result = validateGarmentIR(PENCIL_SKIRT_FIXTURE);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('should detect a boundary loop gap in panel edges', () => {
    const brokenGarment: GarmentIR = structuredClone(PENCIL_SKIRT_FIXTURE);
    // Break the loop by shifting an edge end point by 20mm
    brokenGarment.panels[0].boundary.edges[0].end = { x: 500, y: 500 };

    const result = validateGarmentIR(brokenGarment);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'PANEL_BOUNDARY_GAP')).toBe(true);
  });

  it('should detect missing panel references in seams', () => {
    const brokenGarment: GarmentIR = structuredClone(PENCIL_SKIRT_FIXTURE);
    brokenGarment.seams[0].edges_a[0].panel_id = 'non_existent_panel';

    const result = validateGarmentIR(brokenGarment);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'SEAM_PANEL_NOT_FOUND')).toBe(true);
  });

  it('should detect missing edge references in seams', () => {
    const brokenGarment: GarmentIR = structuredClone(PENCIL_SKIRT_FIXTURE);
    brokenGarment.seams[0].edges_a[0].edge_id = 'non_existent_edge';

    const result = validateGarmentIR(brokenGarment);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'SEAM_EDGE_NOT_FOUND')).toBe(true);
  });

  it('should detect missing material references', () => {
    const brokenGarment: GarmentIR = structuredClone(PENCIL_SKIRT_FIXTURE);
    brokenGarment.panels[0].material_id = 'ghost_fabric';

    const result = validateGarmentIR(brokenGarment);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MATERIAL_NOT_FOUND')).toBe(true);
  });

  it('should warn when seam lengths deviate significantly without a gather ratio', () => {
    const brokenGarment: GarmentIR = structuredClone(PENCIL_SKIRT_FIXTURE);
    // Make edge A 10x longer than edge B
    brokenGarment.panels[2].boundary.edges[0].start = { x: -1800, y: 0 };
    brokenGarment.panels[2].boundary.edges[0].end = { x: 1800, y: 0 };

    const result = validateGarmentIR(brokenGarment);
    expect(result.warnings.some((w) => w.code === 'SEAM_LENGTH_MISMATCH')).toBe(true);
  });

  it('should calculate accurate edge length for lines and cubic beziers', () => {
    const straightEdge = PENCIL_SKIRT_FIXTURE.panels[0].boundary.edges.find((e) => e.kind === 'line');
    expect(straightEdge).toBeDefined();
    const lenStraight = edgeLength(straightEdge!);
    expect(lenStraight).toBe(420); // from -210 to 210

    const waistCurve = PENCIL_SKIRT_FIXTURE.panels[0].boundary.edges.find((e) => e.id === 'edge_front_waist');
    expect(waistCurve).toBeDefined();
    expect(edgeLength(waistCurve!)).toBeCloseTo(360.4, 0);

    const sideCurve = PENCIL_SKIRT_FIXTURE.panels[0].boundary.edges.find((e) => e.id === 'edge_front_side_right');
    expect(sideCurve).toBeDefined();
    expect(edgeLength(sideCurve!)).toBeGreaterThan(560);
  });
});
