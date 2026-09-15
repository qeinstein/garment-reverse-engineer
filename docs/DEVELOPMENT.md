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
4. **Zero-Cost Production Compute (Hugging Face ZeroGPU)**:
   * Replaced ad-hoc Kaggle notebooks with Hugging Face ZeroGPU Free Tier (`@spaces.GPU`).
   * ZeroGPU schedules high-end Nvidia A100 / L40S hardware dynamically on demand (bursting for ~3.5s per garment), running 100% free for a single primary user without maintaining idle cloud servers.
   * Portable runtime package (`services/reconstruction/reweaver`) can execute seamlessly on ZeroGPU, local CUDA, or local CPU.

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
5. **ReWeaver Runtime & Dependency Audit**:
   * **PyTorch3D is NOT a blocker**: Grep search verified `pytorch3d` was only in a commented-out import (`models/matcher_curve.py:9`). Native PyTorch Chamfer distance `@torch.jit.script def pairwise_shape_chamfer` is used instead.
   * **Pure PyTorch**: Zero native CUDA extensions (`.cu`/`.cpp`). No compilation steps needed during Space container boot.
   * **Weights Footprint**: Hosted on Hugging Face Hub (`SII-LiMing/ReWeaver`): `complex_stitch.pth` (1002 MB), `flatten.pth` (458 MB), `img_encoder.pth` (247 MB) = ~1.71 GB.
   * **Bipartite Seam Derivation**: Panel boundary edges correspond directly to the non-zero entries in `patch_curve_connectivity`. Shared 3D curves with incidence = 2 directly yield sewing seams with zero hallucination.

---

## 5. Current Progress & Milestones

* [x] **Milestone 1**: Inspect repositories and create upstream forks (`qeinstein/atelier`, `qeinstein/seamer-studio`).
* [x] **Milestone 2**: Deep research into Seamer/Atelier data structures and simulation pipeline; created `docs/ARCHITECTURE_RESEARCH.md`.
* [x] **Milestone 3**: Design GarmentIR v0 (JSON schema, TypeScript interfaces, sample garment fixture in `packages/garment-ir`).
* [x] **Milestone 4**: Implement `packages/garment-ir` and `packages/validation` with full error/warning diagnostic checks.
* [x] **Milestone 5**: Implement `packages/seamer-adapter` (GarmentIR <-> Seamer Pattern compiler + CLI tool).
* [x] **Milestone 6**: Build and verify the end-to-end non-ML vertical slice (Pencil Skirt fixture -> Seamer 2D/3D -> simulation constraints).
* [x] **Milestone 7**: Unit tests for schema validation, seam integrity, panel-edge integrity, and adapter conversion (23 passing tests).
* [x] **Milestone 8**: ML Model Integration Phase (ReWeaver on HF ZeroGPU + Canonical Adapter):
  * Upstream fork `qeinstein/ReWeaver-Code` audited and vendored.
  * Integration specs and ZeroGPU compatibility guides created (`docs/REWEAVER_INTEGRATION.md`, `docs/HF_ZEROGPU_COMPATIBILITY.md`).
  * Portable runtime package implemented (`services/reconstruction/reweaver/`: schemas, models, preprocessing, postprocessing, pipeline, adapter).
  * Hugging Face Space application built as a self-contained bundle (`apps/hf-reweaver-space/`).
  * TypeScript adapter package implemented (`packages/reweaver-adapter/`).
  * End-to-end ML integration test implemented (`tests/reweaver-pipeline.test.ts`).
* [x] **Milestone 9**: ZeroGPU Space Deployment Tooling & Contract:
  * Self-contained Space directory prepared in `apps/hf-reweaver-space/` ready for Git push to Hugging Face.
  * Complete manual deployment instructions documented in `docs/DEPLOYMENT_HF.md`.
  * Known-good 4-view synthetic test fixtures created in `tests/fixtures/sample_views/`.
  * Production smoke test runner created in `scripts/smoke_hf_space.py` (`pnpm smoke:hf`).
  * Formal Reconstruction API contract defined in `docs/RECONSTRUCTION_API.md`.
* [x] **Milestone 10**: Web Application (`apps/web`) & Vercel Deployment Readiness:
  * Built complete single-page application in `apps/web/` with 4-view image capture/upload UI.
  * Implemented `@gradio/client` integration with direct ZeroGPU mode and Vercel serverless proxy mode (`apps/web/src/lib/reconstruction/hf-client.ts`).
  * Implemented secure serverless proxy function (`apps/web/api/reconstruct.ts`) keeping `HF_TOKEN` strictly server-side.
  * Implemented 2D sewing pattern canvas (`apps/web/src/lib/editor/viewer2d.ts`) with pan/zoom and confidence ratings.
  * Implemented 3D Three.js viewport (`apps/web/src/lib/editor/viewer3d.ts`) with avatar torso geometry and orbit controls.
  * Implemented GarmentIR and `.seamer` pattern export utilities (`apps/web/src/lib/editor/exportSeamer.ts`).
  * Complete Vercel deployment instructions documented in `docs/DEPLOYMENT_VERCEL.md`.
  * Environment variable templates and security policies documented in `.env.example`.
  * 51 tests passing across 7 test suites with 0 build or lint errors.

---

## 6. Next Steps: Live User Deployment & Active Reconstruction

1. **User Deploys HF Space**:
   * Follow `docs/DEPLOYMENT_HF.md` to create `qeinstein/reweaver-zero` on Hugging Face Spaces (SDK: Gradio, Hardware: ZeroGPU).
   * Push contents of `apps/hf-reweaver-space/` to the Space repository.
   * Run `pnpm smoke:hf` with your live Space URL to verify the ZeroGPU GPU allocation and pipeline.
2. **User Deploys Web App to Vercel**:
   * Follow `docs/DEPLOYMENT_VERCEL.md` to deploy `apps/web` to Vercel.
   * Configure `PUBLIC_HF_REWEAVER_SPACE_URL` (and optional `HF_TOKEN` if using private Space).
3. **Interactive Human Correction & Drafting**:
   * Connect Seamer Studio interactive curve modification handles directly to GarmentIR delta events.
   * Implement measurement adaptation (avatar morphing and panel scaling).
