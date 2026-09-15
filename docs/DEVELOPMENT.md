# Development Log & Project Status

This document tracks development progress, environment setup, architecture decisions, discovered constraints, and the roadmap.

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
└── docs/
    ├── ARCHITECTURE_RESEARCH.md
    └── DEVELOPMENT.md
```

---

## 3. Key Architecture Decisions

1. **GarmentIR as the Canonical Core**:
   * External ML models (ReWeaver, Garment Particles, GarmentRec) produce GarmentIR.
   * Editors (Seamer, Atelier) consume GarmentIR via dedicated adapters.
   * No ML model or editor schema is canonical.
2. **Explicit Uncertainty & Provenance**:
   * Predictions carry confidence ratings `[0, 1]` and distinction between `observed` and `inferred`.
   * Unseen closures or ambiguous seams encode `hypotheses` rather than hallucinating false certainty.
   * Inferred features trace back to source video/image frame IDs.
3. **Structured User Corrections**:
   * User edits are tracked as structured delta events to serve as future personalization and active-learning training signals.
4. **Offline Heavy Compute**:
   * Reconstruction models execute on remote/Kaggle GPUs; the local web app handles CAD editing, 2D pattern inspection, and client-side simulation.

---

## 4. Discovered Constraints

1. **Seamer Edge Direction & Resampling**:
   * In Seamer, boundary loops are stitched by connecting `PiecePath` spans. Seam constraints require matching particle intervals between `fromPaths` and `toPaths`. If edge directions are opposite, `reversed: true` must be set in the `SeamRef`.
2. **Coordinate Spaces**:
   * Seamer 2D coordinates are in **millimeters (`mm`)**.
   * Seamer 3D coordinates are in **meters (`m`)**.
   * GarmentIR standardizes on explicit unit specification (default `mm` for 2D, `m` for 3D).
3. **Cylinder Names**:
   * The 12 avatar placement cylinders in `@seamer/body-model` are: `'Torso'`, `'Neck'`, `'LeftUpperArm'`, `'RightUpperArm'`, `'LeftLowerArm'`, `'RightLowerArm'`, `'LeftShoulder'`, `'RightShoulder'`, `'LeftUpperLeg'`, `'RightUpperLeg'`, `'LeftLowerLeg'`, `'RightLowerLeg'`.
   * For garments arranged around the body, 3D placement can reference these canonical semantic body cylinders or supply explicit 3D orientation/positions.

---

## 5. Current Progress & Milestones

* [x] **Milestone 1**: Inspect repositories and create upstream forks (`qeinstein/atelier`, `qeinstein/seamer-studio`).
* [x] **Milestone 2**: Deep research into Seamer/Atelier data structures and simulation pipeline; created `docs/ARCHITECTURE_RESEARCH.md`.
* [ ] **Milestone 3**: Design GarmentIR v0 (JSON schema, TypeScript interfaces, sample garment fixture).
* [ ] **Milestone 4**: Implement `packages/garment-ir` and `packages/validation`.
* [ ] **Milestone 5**: Implement `packages/seamer-adapter` (GarmentIR -> Seamer Pattern compiler).
* [ ] **Milestone 6**: Build and verify the end-to-end non-ML vertical slice (sample GarmentIR -> adapter -> Seamer pattern -> 2D outline & 3D cloth build).
* [ ] **Milestone 7**: Unit tests for schema validation, seam integrity, panel-edge integrity, and adapter conversion.
* [ ] **Milestone 8**: Prepare next task roadmap for Kaggle GPU model integration (ReWeaver).
