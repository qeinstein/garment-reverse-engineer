# Development Log & Project Status

This document tracks development progress, environment setup, architecture decisions, discovered constraints, integration notes, and the roadmap.

---

## 1. Environment & Setup

* **Operating System**: Linux x86_64
* **Node.js**: v20.20.1
* **npm**: 10.8.2
* **pnpm**: 12.4.2 (managed with `corepack` / `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`)
* **Python**: 3.11.2
* **GitHub CLI (`gh`)**: Logged in as `qeinstein`. Upstream repositories forked to:
  * `qeinstein/atelier` (fork of `ahzs645/atelier`)
  * `qeinstein/seamer-studio` (fork of `ahzs645/seamer-studio`)
* **Vendor Repositories**:
  * Tracked as Git submodules in `vendor/atelier` and `vendor/seamer-studio`.
  * `vendor/seamer-studio/vendor/body-model` initialized via git submodule.

### Commands Used
```bash
# Fork upstream repositories
gh repo fork ahzs645/atelier --clone=false
gh repo fork ahzs645/seamer-studio --clone=false

# Add submodules
git submodule add https://github.com/qeinstein/atelier.git vendor/atelier
git submodule add https://github.com/qeinstein/seamer-studio.git vendor/seamer-studio

# Build monorepo packages
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm build

# Run unit and integration tests (23 tests across 4 suites)
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm test

# Convert GarmentIR document to Seamer .seamer format via CLI
pnpm convert packages/garment-ir/fixtures/pencil-skirt.json dist/output-pencil-skirt.seamer
```

---

## 2. Architecture & Monorepo Structure

```
garment-reverse-engineer/
├── apps/
│   └── web/                   # Web application interface (editor/viewer)
├── services/
│   └── reconstruction/        # ML reconstruction orchestrator / job runner
├── packages/
│   ├── garment-ir/            # Canonical Garment Intermediate Representation (schema, types, validation)
│   ├── seamer-adapter/        # Translates GarmentIR -> Seamer Pattern & Seamer -> GarmentIR
│   └── validation/            # Topology, seam consistency, and physical validity checks
├── notebooks/
│   └── kaggle/                # Kaggle GPU execution notebooks (ReWeaver, Garment Particles)
├── vendor/
│   ├── atelier/               # Submodule: CAD/editor runtime
│   └── seamer-studio/         # Submodule: Garment CAD & WebGPU cloth sim
├── tests/
│   └── vertical-slice.test.ts # End-to-end integration test (GarmentIR -> Seamer -> 2D -> 3D)
└── docs/
    ├── ARCHITECTURE_RESEARCH.md
    └── DEVELOPMENT.md
```

---

## 3. Key Architecture Decisions

1. **GarmentIR as Canonical Representation**:
   * External ML models (ReWeaver, Garment Particles, GarmentRec) produce GarmentIR.
   * CAD editors (Seamer Studio, Atelier) consume GarmentIR via `@garment-ir/seamer-adapter`.
   * No ML model or external editor is canonical.
2. **First-Class Uncertainty & Hypotheses**:
   * Predictions carry confidence ratings `[0.0, 1.0]` and distinction between `observed` and `inferred`.
   * Unseen closures (e.g. back zipper vs side zipper) or ambiguous seam topologies encode `hypotheses` rather than hallucinating hidden garment construction.
   * Inferred features trace back to source video/image frame IDs (`provenance`).
3. **Structured User Corrections**:
   * User edits are tracked as structured delta events (`HumanCorrection`) to serve as future personalization and active-learning training signals.
4. **Offline Heavy Compute**:
   * Reconstruction models execute on remote/Kaggle GPUs; the local web app handles CAD editing, 2D pattern inspection, and client-side simulation.

---

## 4. Discovered Constraints & Integration Notes

1. **Seamer 2D / 3D Coordinate Conventions**:
   * 2D coordinates, seam allowances, and particle distances are in **millimeters (`mm`)**.
   * 3D coordinates in the simulator and Three.js viewport are in **meters (`m`)** (divided by 1000).
   * GarmentIR explicit units handle this translation deterministically.
2. **PiecePath ID Encoding & Seam Targeting**:
   * In Seamer, seam `fromPaths` and `toPaths` directly reference `PiecePath.id` (not the underlying `ConstrainablePath.id`).
   * `@garment-ir/seamer-adapter` encodes PiecePath IDs stably as `PP_${panel_id}__${edge_id}` and decodes them losslessly on round-trip.
3. **Seam Interval Allocation**:
   * Seamer's `@seamer/cloth-sim` requires matching particle subdivisions on opposing edges of every seam (`computeSeamEdgeIntervals`).
   * If edge directions run counter to one another, `reversed: true` must be set in the `SeamRef`.
4. **Body Cylinders**:
   * The 12 avatar placement cylinders in `@seamer/body-model` are: `'Torso'`, `'Neck'`, `'LeftUpperArm'`, `'RightUpperArm'`, `'LeftLowerArm'`, `'RightLowerArm'`, `'LeftShoulder'`, `'RightShoulder'`, `'LeftUpperLeg'`, `'RightUpperLeg'`, `'LeftLowerLeg'`, `'RightLowerLeg'`.
   * GarmentIR panels specify semantic cylinder bindings (`cylinder_name`, `u_degrees`, `v`, `radial_offset_mm`, `mode: 'curved' | 'flat'`) or direct rigid translations/transforms.

---

## 5. Current Progress & Milestones

* [x] **Milestone 1**: Inspect repositories and create upstream forks (`qeinstein/atelier`, `qeinstein/seamer-studio`).
* [x] **Milestone 2**: Deep research into Seamer/Atelier data structures and simulation pipeline; created `docs/ARCHITECTURE_RESEARCH.md`.
* [x] **Milestone 3**: Design GarmentIR v0 (JSON schema, TypeScript interfaces, sample garment fixture in `packages/garment-ir`).
* [x] **Milestone 4**: Implement `packages/garment-ir` and `packages/validation` with full error/warning diagnostic checks.
* [x] **Milestone 5**: Implement `packages/seamer-adapter` (GarmentIR <-> Seamer Pattern compiler + CLI tool).
* [x] **Milestone 6**: Build and verify the end-to-end non-ML vertical slice:
  * Canonical GarmentIR (`PENCIL_SKIRT_FIXTURE`)
  * `validateGarmentIR` topology validation
  * `garmentIRToSeamer` adapter conversion
  * Seamer 2D geometry engine (`pieceOutline`)
  * Seamer 3D cloth preparation (`computeSeamEdgeIntervals`, `buildPieceCloth`)
  * Seamer 3D spatial arrangement (`arrangeParticles` on body cylinders)
  * Seamer physics constraint assembly (`buildSimData` generating anisotropic stretch, dihedral bending, and seam pairs)
* [x] **Milestone 7**: Unit tests for schema validation, seam integrity, panel-edge integrity, and adapter conversion (23 passing tests in Vitest).
* [ ] **Milestone 8**: ML Model Integration Phase (ReWeaver on Kaggle GPU).

---

## 6. Exact Next Task: ML Model Integration (ReWeaver on Kaggle GPU)

With the canonical GarmentIR core, validator, and Seamer adapter fully operational and verified, the next phase begins model integration:

### Step-by-Step Task Plan:
1. **Fork and Inspect `SII-LiMing/ReWeaver-Code`**:
   * Fork `SII-LiMing/ReWeaver-Code` using `gh repo fork SII-LiMing/ReWeaver-Code --clone=false`.
   * Inspect input requirements (sparse multi-view images, foreground masks, camera poses/SfM).
   * Inspect output representation: 2D panel topology, UV parameterization, 3D draped mesh, and seam connections.
2. **Develop Kaggle GPU Inference Notebook (`notebooks/kaggle/reweaver_inference.ipynb`)**:
   * Set up lightweight environment for Kaggle P100 / T4 GPUs.
   * Run ReWeaver inference on sample multi-view garment photos.
   * Dump raw output bundle (geometry, panels, seam pairs).
3. **Build `services/reconstruction/reweaver-to-garment-ir` Adapter**:
   * Convert ReWeaver 2D panel curves and seam pairings into `GarmentIR`.
   * Attach confidence estimates and source view provenance to all inferred edges.
   * Mark unobserved regions (e.g. closures without clear visibility) with explicit `hypotheses`.
4. **End-to-End Verification**:
   * Multi-view garment photos
   * → ReWeaver (Kaggle)
   * → `reweaver-to-garment-ir`
   * → `GarmentIR`
   * → `validateGarmentIR`
   * → `garmentIRToSeamer`
   * → Seamer Studio (editable 2D panels + 3D drape on avatar).
