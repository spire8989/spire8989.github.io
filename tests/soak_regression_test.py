"""Run the intentionally larger deterministic regression suites."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SUITES = (
    "simulation_system_test.py",
    "campaign_system_test.py",
    "campaign_replay_system_test.py",
)


def run() -> None:
    environment = os.environ.copy()
    environment["GRAIL_RUN_SOAK"] = "1"
    for suite in SUITES:
        print(f"SOAK: {suite}", flush=True)
        subprocess.run(
            [sys.executable, str(ROOT / "tests" / suite)],
            cwd=ROOT,
            env=environment,
            check=True,
        )
    print(f"PASS: {len(SUITES)} deterministic soak suites")


if __name__ == "__main__":
    run()
