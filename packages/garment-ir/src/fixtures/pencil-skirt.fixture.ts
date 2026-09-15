import type { GarmentIR } from '../types.js';

export const PENCIL_SKIRT_FIXTURE: GarmentIR = {
  schema_version: '0.1.0',
  metadata: {
    id: 'garment_pencil_skirt_001',
    name: 'Classic Tailored Pencil Skirt',
    category: 'skirt',
    description: 'High-waisted knee-length pencil skirt with darts, waistband, and back vent hypothesis.',
    created_at: '2026-09-15T12:00:00Z',
    updated_at: '2026-09-15T12:00:00Z',
    source_media: [
      {
        id: 'img_front_01',
        type: 'image',
        uri: 'file://assets/sample_skirt/front_view.jpg',
        viewpoint_label: 'front'
      },
      {
        id: 'img_back_01',
        type: 'image',
        uri: 'file://assets/sample_skirt/back_view.jpg',
        viewpoint_label: 'back'
      },
      {
        id: 'img_side_01',
        type: 'image',
        uri: 'file://assets/sample_skirt/side_view.jpg',
        viewpoint_label: 'right'
      }
    ],
    reconstruction_model: {
      name: 'ReWeaver-Hybrid',
      version: '1.2.0',
      checkpoint: 'reweaver_cloth_prior_v1.pth',
      device: 'kaggle-p100'
    }
  },
  units: {
    spatial_2d: 'mm',
    spatial_3d: 'm',
    angles: 'degrees',
    mass_density: 'g/m2'
  },
  materials: [
    {
      id: 'mat_wool_crepe',
      name: 'Wool Crepe Suit Fabric',
      stretch_warp: 12,
      stretch_weft: 15,
      bend_stiffness: 8,
      thickness_mm: 0.8,
      density_gsm: 240,
      color: '#2b2f38',
      roughness: 0.85,
      metalness: 0.05,
      opacity: 1.0,
      confidence: 0.92
    },
    {
      id: 'mat_interfacing',
      name: 'Fusible Waistband Interfacing',
      stretch_warp: 5,
      stretch_weft: 5,
      bend_stiffness: 40,
      thickness_mm: 0.4,
      density_gsm: 90,
      color: '#e2e4e8',
      confidence: 0.88
    }
  ],
  wearer: {
    gender: 'female',
    unit: 'metric',
    measurements: {
      height: 1680,
      waist_girth: 700,
      hip_girth: 960,
      waist_to_knee: 600
    },
    avatar_preset: 'female_standard_38'
  },
  panels: [
    {
      id: 'panel_skirt_front',
      name: 'Skirt Front',
      category: 'skirt_front',
      material_id: 'mat_wool_crepe',
      grain_line: {
        angle_deg: 90,
        direction: { x: 0, y: 1 }
      },
      seam_allowance_mm: 12.7,
      layout_position: { x: -250, y: 0 },
      layout_rotation_deg: 0,
      placement_3d: {
        body_region: 'torso_front',
        cylinder_binding: {
          cylinder_name: 'Torso',
          u_degrees: 0,
          v: 1.08,
          radial_offset_mm: 8,
          mode: 'curved'
        },
        flip_normal: false
      },
      confidence: 0.96,
      provenance: {
        source_media_ids: ['img_front_01', 'img_side_01'],
        observed: true,
        confidence: 0.96,
        notes: 'Front silhouette and waist curvature clearly observed.'
      },
      internal_features: [
        {
          id: 'dart_front_right',
          name: 'Front Right Waist Dart',
          type: 'dart',
          points: [
            { x: 80, y: 550 },
            { x: 95, y: 450 },
            { x: 110, y: 550 }
          ],
          intake_mm: 30,
          confidence: 0.94
        },
        {
          id: 'dart_front_left',
          name: 'Front Left Waist Dart',
          type: 'dart',
          points: [
            { x: -110, y: 550 },
            { x: -95, y: 450 },
            { x: -80, y: 550 }
          ],
          intake_mm: 30,
          confidence: 0.94
        }
      ],
      boundary: {
        closed: true,
        edges: [
          {
            id: 'edge_front_waist',
            name: 'Front Waistline',
            kind: 'cubic_bezier',
            start: { x: -180, y: 560 },
            end: { x: 180, y: 560 },
            control_points: [
              { x: -70, y: 550 },
              { x: 70, y: 550 }
            ],
            confidence: 0.95
          },
          {
            id: 'edge_front_side_right',
            name: 'Front Right Side Seam',
            kind: 'cubic_bezier',
            start: { x: 180, y: 560 },
            end: { x: 210, y: 0 },
            control_points: [
              { x: 245, y: 400 },
              { x: 220, y: 150 }
            ],
            confidence: 0.95
          },
          {
            id: 'edge_front_hem',
            name: 'Front Hem',
            kind: 'line',
            start: { x: 210, y: 0 },
            end: { x: -210, y: 0 },
            confidence: 0.98
          },
          {
            id: 'edge_front_side_left',
            name: 'Front Left Side Seam',
            kind: 'cubic_bezier',
            start: { x: -210, y: 0 },
            end: { x: -180, y: 560 },
            control_points: [
              { x: -220, y: 150 },
              { x: -245, y: 400 }
            ],
            confidence: 0.95
          }
        ]
      }
    },
    {
      id: 'panel_skirt_back',
      name: 'Skirt Back',
      category: 'skirt_back',
      material_id: 'mat_wool_crepe',
      grain_line: {
        angle_deg: 90,
        direction: { x: 0, y: 1 }
      },
      seam_allowance_mm: 12.7,
      layout_position: { x: 250, y: 0 },
      layout_rotation_deg: 0,
      placement_3d: {
        body_region: 'torso_back',
        cylinder_binding: {
          cylinder_name: 'Torso',
          u_degrees: 180,
          v: 1.08,
          radial_offset_mm: 8,
          mode: 'curved'
        },
        flip_normal: true
      },
      confidence: 0.93,
      provenance: {
        source_media_ids: ['img_back_01', 'img_side_01'],
        observed: true,
        confidence: 0.93,
        notes: 'Back contour observed; closure seam inferred from seam line shadow.'
      },
      internal_features: [
        {
          id: 'dart_back_right',
          name: 'Back Right Waist Dart',
          type: 'dart',
          points: [
            { x: 75, y: 565 },
            { x: 90, y: 430 },
            { x: 105, y: 565 }
          ],
          intake_mm: 30,
          confidence: 0.9
        },
        {
          id: 'dart_back_left',
          name: 'Back Left Waist Dart',
          type: 'dart',
          points: [
            { x: -105, y: 565 },
            { x: -90, y: 430 },
            { x: -75, y: 565 }
          ],
          intake_mm: 30,
          confidence: 0.9
        }
      ],
      boundary: {
        closed: true,
        edges: [
          {
            id: 'edge_back_waist',
            name: 'Back Waistline',
            kind: 'cubic_bezier',
            start: { x: -180, y: 565 },
            end: { x: 180, y: 565 },
            control_points: [
              { x: -60, y: 555 },
              { x: 60, y: 555 }
            ],
            confidence: 0.92
          },
          {
            id: 'edge_back_side_right',
            name: 'Back Right Side Seam',
            kind: 'cubic_bezier',
            start: { x: 180, y: 565 },
            end: { x: 210, y: 0 },
            control_points: [
              { x: 245, y: 400 },
              { x: 220, y: 150 }
            ],
            confidence: 0.94
          },
          {
            id: 'edge_back_hem',
            name: 'Back Hem',
            kind: 'line',
            start: { x: 210, y: 0 },
            end: { x: -210, y: 0 },
            confidence: 0.97
          },
          {
            id: 'edge_back_side_left',
            name: 'Back Left Side Seam',
            kind: 'cubic_bezier',
            start: { x: -210, y: 0 },
            end: { x: -180, y: 565 },
            control_points: [
              { x: -220, y: 150 },
              { x: -245, y: 400 }
            ],
            confidence: 0.94
          }
        ]
      }
    },
    {
      id: 'panel_waistband_front',
      name: 'Waistband Front',
      category: 'waistband',
      material_id: 'mat_wool_crepe',
      grain_line: {
        angle_deg: 0,
        direction: { x: 1, y: 0 }
      },
      seam_allowance_mm: 12.7,
      layout_position: { x: -250, y: 650 },
      placement_3d: {
        body_region: 'waist_front',
        cylinder_binding: {
          cylinder_name: 'Torso',
          u_degrees: 0,
          v: 0.62,
          radial_offset_mm: 10,
          mode: 'curved'
        },
        flip_normal: false
      },
      confidence: 0.95,
      boundary: {
        closed: true,
        edges: [
          {
            id: 'edge_wb_front_bottom',
            name: 'Waistband Front Bottom',
            kind: 'line',
            start: { x: -180, y: 0 },
            end: { x: 180, y: 0 },
            confidence: 0.95
          },
          {
            id: 'edge_wb_front_right',
            name: 'Waistband Front Right Side',
            kind: 'line',
            start: { x: 180, y: 0 },
            end: { x: 180, y: 45 },
            confidence: 0.96
          },
          {
            id: 'edge_wb_front_top',
            name: 'Waistband Front Top',
            kind: 'line',
            start: { x: 180, y: 45 },
            end: { x: -180, y: 45 },
            confidence: 0.95
          },
          {
            id: 'edge_wb_front_left',
            name: 'Waistband Front Left Side',
            kind: 'line',
            start: { x: -180, y: 45 },
            end: { x: -180, y: 0 },
            confidence: 0.96
          }
        ]
      }
    },
    {
      id: 'panel_waistband_back',
      name: 'Waistband Back',
      category: 'waistband',
      material_id: 'mat_wool_crepe',
      grain_line: {
        angle_deg: 0,
        direction: { x: 1, y: 0 }
      },
      seam_allowance_mm: 12.7,
      layout_position: { x: 250, y: 650 },
      placement_3d: {
        body_region: 'waist_back',
        cylinder_binding: {
          cylinder_name: 'Torso',
          u_degrees: 180,
          v: 0.63,
          radial_offset_mm: 10,
          mode: 'curved'
        },
        flip_normal: true
      },
      confidence: 0.92,
      boundary: {
        closed: true,
        edges: [
          {
            id: 'edge_wb_back_bottom',
            name: 'Waistband Back Bottom',
            kind: 'line',
            start: { x: -180, y: 0 },
            end: { x: 180, y: 0 },
            confidence: 0.93
          },
          {
            id: 'edge_wb_back_right',
            name: 'Waistband Back Right Side',
            kind: 'line',
            start: { x: 180, y: 0 },
            end: { x: 180, y: 45 },
            confidence: 0.94
          },
          {
            id: 'edge_wb_back_top',
            name: 'Waistband Back Top',
            kind: 'line',
            start: { x: 180, y: 45 },
            end: { x: -180, y: 45 },
            confidence: 0.93
          },
          {
            id: 'edge_wb_back_left',
            name: 'Waistband Back Left Side',
            kind: 'line',
            start: { x: -180, y: 45 },
            end: { x: -180, y: 0 },
            confidence: 0.94
          }
        ]
      }
    }
  ],
  seams: [
    {
      id: 'seam_side_right',
      name: 'Right Side Seam',
      seam_type: 'plain',
      edges_a: [
        {
          panel_id: 'panel_skirt_front',
          edge_id: 'edge_front_side_right',
          reversed: false
        }
      ],
      edges_b: [
        {
          panel_id: 'panel_skirt_back',
          edge_id: 'edge_back_side_right',
          reversed: false
        }
      ],
      confidence: 0.96,
      provenance: {
        source_media_ids: ['img_side_01'],
        observed: true,
        confidence: 0.96
      }
    },
    {
      id: 'seam_side_left',
      name: 'Left Side Seam',
      seam_type: 'plain',
      edges_a: [
        {
          panel_id: 'panel_skirt_front',
          edge_id: 'edge_front_side_left',
          reversed: false
        }
      ],
      edges_b: [
        {
          panel_id: 'panel_skirt_back',
          edge_id: 'edge_back_side_left',
          reversed: false
        }
      ],
      confidence: 0.95,
      provenance: {
        source_media_ids: ['img_front_01'],
        observed: true,
        confidence: 0.95
      }
    },
    {
      id: 'seam_waist_front',
      name: 'Front Waist Seam',
      seam_type: 'plain',
      edges_a: [
        {
          panel_id: 'panel_waistband_front',
          edge_id: 'edge_wb_front_bottom',
          reversed: false
        }
      ],
      edges_b: [
        {
          panel_id: 'panel_skirt_front',
          edge_id: 'edge_front_waist',
          reversed: false
        }
      ],
      confidence: 0.97
    },
    {
      id: 'seam_waist_back',
      name: 'Back Waist Seam',
      seam_type: 'plain',
      edges_a: [
        {
          panel_id: 'panel_waistband_back',
          edge_id: 'edge_wb_back_bottom',
          reversed: false
        }
      ],
      edges_b: [
        {
          panel_id: 'panel_skirt_back',
          edge_id: 'edge_back_waist',
          reversed: false
        }
      ],
      confidence: 0.94
    },
    {
      id: 'seam_wb_side_right',
      name: 'Waistband Right Side Join',
      seam_type: 'plain',
      edges_a: [
        {
          panel_id: 'panel_waistband_front',
          edge_id: 'edge_wb_front_right',
          reversed: false
        }
      ],
      edges_b: [
        {
          panel_id: 'panel_waistband_back',
          edge_id: 'edge_wb_back_right',
          reversed: true
        }
      ],
      confidence: 0.96
    },
    {
      id: 'seam_wb_side_left',
      name: 'Waistband Left Side Join',
      seam_type: 'plain',
      edges_a: [
        {
          panel_id: 'panel_waistband_front',
          edge_id: 'edge_wb_front_left',
          reversed: false
        }
      ],
      edges_b: [
        {
          panel_id: 'panel_waistband_back',
          edge_id: 'edge_wb_back_left',
          reversed: true
        }
      ],
      confidence: 0.96
    }
  ],
  hypotheses: [
    {
      id: 'hyp_closure_location',
      aspect: 'closure_type',
      description: 'Rear closure not directly visible in camera angle due to model hair covering neckline/upper back.',
      confidence: 0.8,
      chosen: true,
      alternatives: [
        {
          label: 'Center Back Invisible Zipper',
          confidence: 0.8,
          description: 'Standard 20cm invisible zipper running down center back from waistband.'
        },
        {
          label: 'Left Side Seam Invisible Zipper',
          confidence: 0.2,
          description: 'Side seam invisible zipper embedded in the left hip seam.'
        }
      ]
    }
  ],
  landmarks: [
    {
      id: 'lm_waist_center_front',
      name: 'Waist Center Front',
      panel_id: 'panel_skirt_front',
      coord_2d: { x: 0, y: 555 },
      confidence: 0.98
    },
    {
      id: 'lm_hem_center_front',
      name: 'Hem Center Front',
      panel_id: 'panel_skirt_front',
      coord_2d: { x: 0, y: 0 },
      confidence: 0.99
    }
  ]
};
