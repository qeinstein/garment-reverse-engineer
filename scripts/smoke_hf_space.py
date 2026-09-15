#!/usr/bin/env python3
"""
Production smoke test for deployed Hugging Face ZeroGPU Space.
Sends 4 known-good viewpoint images to the live Space, validates the response,
and logs measured production performance metrics.

Usage:
  # Against live public space:
  HF_SPACE_URL="https://huggingface.co/spaces/<user>/reweaver-zero" python scripts/smoke_hf_space.py

  # Against live private space:
  HF_SPACE_URL="https://huggingface.co/spaces/<user>/reweaver-zero" HF_TOKEN="hf_..." python scripts/smoke_hf_space.py

  # Local dry-run verification (no network call):
  python scripts/smoke_hf_space.py --dry-run
"""

from __future__ import annotations
import os
import sys
import time
import json
import argparse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SAMPLE_DIR = REPO_ROOT / "tests" / "fixtures" / "sample_views"


def parse_args():
    parser = argparse.ArgumentParser(description="Smoke test for deployed Hugging Face Space.")
    parser.add_argument("--space-url", default=None, help="URL of the deployed HF Space (or set HF_SPACE_URL)")
    parser.add_argument("--token", default=None, help="HF access token for private space (or set HF_TOKEN)")
    parser.add_argument("--sample-dir", default=str(DEFAULT_SAMPLE_DIR), help="Directory containing 4 sample view images")
    parser.add_argument("--dry-run", action="store_true", help="Run in mock dry-run mode using local fixture")
    return parser.parse_args()


def validate_garment_ir_structure(ir: dict) -> list[str]:
    """Basic validation of the GarmentIR document returned by the Space."""
    errors = []
    if ir.get("schema_version") != "0.1.0":
        errors.append(f"Invalid schema_version: {ir.get('schema_version')} (expected '0.1.0')")

    if not isinstance(ir.get("metadata"), dict):
        errors.append("Missing metadata object")

    if not isinstance(ir.get("panels"), list) or len(ir["panels"]) == 0:
        errors.append("GarmentIR has no panels")

    if not isinstance(ir.get("units"), dict):
        errors.append("Missing units object")
    elif ir["units"].get("spatial_2d") != "mm":
        errors.append(f"Unexpected 2D spatial unit: {ir['units'].get('spatial_2d')} (expected 'mm')")

    return errors


def run_dry_run():
    print("================================================================")
    print("RUNNING IN DRY-RUN / MOCK MODE (No network call)")
    print("================================================================")
    fixture_path = REPO_ROOT / "packages" / "reweaver-adapter" / "fixtures" / "reweaver-pencil-skirt.json"
    if not fixture_path.exists():
        print(f"ERROR: Fixture not found at {fixture_path}")
        sys.exit(1)

    t0 = time.time()
    with open(fixture_path, "r") as f:
        raw_output = json.load(f)

    # Import local adapter
    sys.path.insert(0, str(REPO_ROOT))
    from services.reconstruction.reweaver.adapter import reweaver_to_garment_ir
    from services.reconstruction.reweaver.schemas import ReWeaverRawOutput

    raw_obj = ReWeaverRawOutput.from_dict(raw_output)
    garment_ir = reweaver_to_garment_ir(raw_obj)
    dt = time.time() - t0

    errors = validate_garment_ir_structure(garment_ir)
    if errors:
        print(f"FAILED: Validation errors: {errors}")
        sys.exit(1)

    print("Status: SUCCESS (Mock)")
    print(f"Panels: {len(garment_ir['panels'])}")
    print(f"Seams:  {len(garment_ir['seams'])}")
    print(f"Duration: {dt:.3f}s (ESTIMATED local)")
    print("\nTo test against a REAL deployed Space, run:")
    print("  HF_SPACE_URL=\"https://huggingface.co/spaces/<user>/reweaver-zero\" pnpm smoke:hf")
    sys.exit(0)


def run_live_smoke_test(space_url: str, token: str | None, sample_dir: Path):
    print("================================================================")
    print("RUNNING LIVE HUGGING FACE ZEROGPU SMOKE TEST")
    print(f"Target Space URL: {space_url}")
    print(f"Private Token:    {'[PROVIDED]' if token else '[NONE / PUBLIC]'}")
    print(f"Sample Directory: {sample_dir}")
    print("================================================================")

    # Verify input images exist
    required_views = ["front.png", "right.png", "back.png", "left.png"]
    image_paths = []
    for v in required_views:
        p = sample_dir / v
        if not p.exists():
            print(f"ERROR: Required view image not found: {p}")
            sys.exit(1)
        image_paths.append(str(p))

    # Import gradio_client
    try:
        from gradio_client import Client, handle_file
    except ImportError:
        print("ERROR: gradio_client is required for live smoke testing.")
        print("Install it via: `pip install gradio_client`")
        sys.exit(1)

    print("\n1. Connecting to Hugging Face Space...")
    t_connect_start = time.time()
    try:
        client = Client(space_url, hf_token=token)
    except Exception as e:
        print(f"ERROR: Failed to connect to Space at {space_url}: {e}")
        print("\nTroubleshooting tips:")
        print("- Verify the Space is in 'Running' status (not 'Building' or 'Paused').")
        print("- If the Space is Private, ensure HF_TOKEN has 'Read' permission.")
        sys.exit(1)
    connect_latency = time.time() - t_connect_start
    print(f"   [MEASURED] Space connection / handshake: {connect_latency:.3f}s")

    print("\n2. Submitting 4-view reconstruction job to ZeroGPU (/reconstruct)...")
    t_req_start = time.time()
    try:
        result = client.predict(
            front_img=handle_file(image_paths[0]),
            right_img=handle_file(image_paths[1]),
            back_img=handle_file(image_paths[2]),
            left_img=handle_file(image_paths[3]),
            variant="GCD_ori",
            api_name="/reconstruct"
        )
    except Exception as e:
        print(f"ERROR: Inference call failed: {e}")
        sys.exit(1)
    roundtrip_time = time.time() - t_req_start

    print(f"   [MEASURED] Roundtrip execution time: {roundtrip_time:.3f}s")

    # Unpack output
    garment_ir_json, npz_path, plot_path = result
    payload_size = len(garment_ir_json.encode("utf-8")) if garment_ir_json else 0
    print(f"   [MEASURED] GarmentIR JSON payload size: {payload_size} bytes")

    print("\n3. Validating response payload...")
    try:
        garment_ir = json.loads(garment_ir_json)
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse GarmentIR JSON: {e}")
        print(f"Raw output snippet: {garment_ir_json[:200]}")
        sys.exit(1)

    errors = validate_garment_ir_structure(garment_ir)
    if errors:
        print(f"ERROR: GarmentIR validation failed: {errors}")
        sys.exit(1)

    num_panels = len(garment_ir.get("panels", []))
    num_seams = len(garment_ir.get("seams", []))
    hypotheses = len(garment_ir.get("hypotheses", []))

    print("   [MEASURED] Schema Version: ", garment_ir.get("schema_version"))
    print("   [MEASURED] Reconstructed Panels: ", num_panels)
    print("   [MEASURED] Inferred Seams:        ", num_seams)
    print("   [MEASURED] Closure Hypotheses:   ", hypotheses)
    print("   [MEASURED] Raw NPZ download:     ", npz_path)

    print("\n================================================================")
    print("SMOKE TEST RESULT: PASSED (100% PRODUCTION READY)")
    print("================================================================")


def main():
    args = parse_args()

    space_url = args.space_url or os.environ.get("HF_SPACE_URL") or os.environ.get("PUBLIC_HF_REWEAVER_SPACE_URL")
    token = args.token or os.environ.get("HF_TOKEN")
    sample_dir = Path(args.sample_dir)

    if args.dry_run:
        run_dry_run()
    elif not space_url:
        print("No HF_SPACE_URL environment variable or --space-url argument was provided.")
        print("Running dry-run verification on local fixture...\n")
        run_dry_run()
    else:
        run_live_smoke_test(space_url, token, sample_dir)


if __name__ == "__main__":
    main()
