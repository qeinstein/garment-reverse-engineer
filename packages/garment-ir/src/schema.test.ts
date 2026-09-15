import { describe, it, expect } from 'vitest';
import { PENCIL_SKIRT_FIXTURE } from './fixtures/pencil-skirt.fixture.js';
import type { GarmentIR } from './types.js';

describe('GarmentIR Schema & Fixtures', () => {
  it('should have a valid schema version and metadata', () => {
    expect(PENCIL_SKIRT_FIXTURE.schema_version).toBe('0.1.0');
    expect(PENCIL_SKIRT_FIXTURE.metadata.id).toBe('garment_pencil_skirt_001');
    expect(PENCIL_SKIRT_FIXTURE.metadata.name).toContain('Pencil Skirt');
    expect(PENCIL_SKIRT_FIXTURE.metadata.category).toBe('skirt');
    expect(PENCIL_SKIRT_FIXTURE.metadata.source_media).toBeDefined();
    expect(PENCIL_SKIRT_FIXTURE.metadata.source_media?.length).toBeGreaterThan(0);
    expect(PENCIL_SKIRT_FIXTURE.metadata.reconstruction_model).toBeDefined();
  });

  it('should define explicit units', () => {
    expect(PENCIL_SKIRT_FIXTURE.units.spatial_2d).toBe('mm');
    expect(PENCIL_SKIRT_FIXTURE.units.spatial_3d).toBe('m');
    expect(PENCIL_SKIRT_FIXTURE.units.angles).toBe('degrees');
    expect(PENCIL_SKIRT_FIXTURE.units.mass_density).toBe('g/m2');
  });

  it('should define 4 realistic panels for a pencil skirt', () => {
    expect(PENCIL_SKIRT_FIXTURE.panels).toHaveLength(4);
    const panelIds = PENCIL_SKIRT_FIXTURE.panels.map((p) => p.id);
    expect(panelIds).toContain('panel_skirt_front');
    expect(panelIds).toContain('panel_skirt_back');
    expect(panelIds).toContain('panel_waistband_front');
    expect(panelIds).toContain('panel_waistband_back');
  });

  it('should include internal dart features on front and back panels', () => {
    const front = PENCIL_SKIRT_FIXTURE.panels.find((p) => p.id === 'panel_skirt_front');
    expect(front?.internal_features).toBeDefined();
    expect(front?.internal_features?.length).toBe(2);
    expect(front?.internal_features?.[0].type).toBe('dart');

    const back = PENCIL_SKIRT_FIXTURE.panels.find((p) => p.id === 'panel_skirt_back');
    expect(back?.internal_features).toBeDefined();
    expect(back?.internal_features?.length).toBe(2);
  });

  it('should preserve uncertainty and hypotheses instead of hallucinating', () => {
    expect(PENCIL_SKIRT_FIXTURE.hypotheses).toBeDefined();
    expect(PENCIL_SKIRT_FIXTURE.hypotheses?.length).toBeGreaterThan(0);
    const closureHypothesis = PENCIL_SKIRT_FIXTURE.hypotheses?.[0];
    expect(closureHypothesis?.aspect).toBe('closure_type');
    expect(closureHypothesis?.alternatives.length).toBeGreaterThanOrEqual(2);
    expect(closureHypothesis?.alternatives[0].label).toContain('Center Back');
  });

  it('should retain provenance linking elements to source views', () => {
    const front = PENCIL_SKIRT_FIXTURE.panels.find((p) => p.id === 'panel_skirt_front');
    expect(front?.provenance).toBeDefined();
    expect(front?.provenance?.source_media_ids).toContain('img_front_01');
    expect(front?.provenance?.observed).toBe(true);
    expect(front?.provenance?.confidence).toBeGreaterThan(0.9);
  });

  it('should specify 3D cylinder arrangement bindings', () => {
    const front = PENCIL_SKIRT_FIXTURE.panels.find((p) => p.id === 'panel_skirt_front');
    expect(front?.placement_3d?.cylinder_binding?.cylinder_name).toBe('Torso');
    expect(front?.placement_3d?.cylinder_binding?.u_degrees).toBe(0);

    const back = PENCIL_SKIRT_FIXTURE.panels.find((p) => p.id === 'panel_skirt_back');
    expect(back?.placement_3d?.cylinder_binding?.cylinder_name).toBe('Torso');
    expect(back?.placement_3d?.cylinder_binding?.u_degrees).toBe(180);
    expect(back?.placement_3d?.flip_normal).toBe(true);
  });
});
