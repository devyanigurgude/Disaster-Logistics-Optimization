"""
optimizer_bridge.py
Handles compiling and calling the C++ optimizer executable.
Python → C++ → Python data flow.
"""

from __future__ import annotations

import json
import subprocess
import shutil
import os
import logging
from pathlib import Path
from typing import Any, Dict

logger = logging.getLogger(__name__)

# Paths
BASE_DIR      = Path(__file__).resolve().parent.parent.parent
CPP_DIR       = BASE_DIR / "cpp"
BIN_DIR       = BASE_DIR / "bin"
OPTIMIZER_SRC = CPP_DIR / "optimizer.cpp"
OPTIMIZER_BIN = BIN_DIR / "optimizer"

# Windows compatibility
if os.name == "nt":
    OPTIMIZER_BIN = BIN_DIR / "optimizer.exe"


def ensure_compiled() -> bool:
    """
    Compile optimizer.cpp if the binary is missing or older than the source.
    Returns True if the binary is available after this call.
    """
    BIN_DIR.mkdir(parents=True, exist_ok=True)

    # Check if recompile is needed
    if OPTIMIZER_BIN.exists():
        src_mtime = OPTIMIZER_SRC.stat().st_mtime
        bin_mtime = OPTIMIZER_BIN.stat().st_mtime
        if bin_mtime >= src_mtime:
            logger.debug("optimizer binary is up-to-date, skipping compile.")
            return True

    logger.info("Compiling C++ optimizer...")

    # Try cmake first, fall back to direct g++
    if shutil.which("cmake") and shutil.which("make"):
        return _compile_with_cmake()
    elif shutil.which("g++"):
        return _compile_with_gpp()
    else:
        logger.error("Neither cmake nor g++ found. Cannot compile optimizer.")
        return False


def _compile_with_cmake() -> bool:
    build_dir = CPP_DIR / "build"
    build_dir.mkdir(exist_ok=True)
    try:
        subprocess.run(
            ["cmake", "..", f"-DCMAKE_BUILD_TYPE=Release"],
            cwd=build_dir, check=True, capture_output=True, text=True,
        )
        subprocess.run(
            ["cmake", "--build", ".", "--config", "Release"],
            cwd=build_dir, check=True, capture_output=True, text=True,
        )
        # Copy binary to bin/
        built = build_dir / "optimizer"
        if not built.exists():
            built = build_dir / "Release" / "optimizer.exe"  # Windows
        if built.exists():
            shutil.copy2(built, OPTIMIZER_BIN)
            logger.info(f"Compiled successfully via cmake → {OPTIMIZER_BIN}")
            return True
        logger.error("cmake build succeeded but binary not found.")
        return False
    except subprocess.CalledProcessError as e:
        logger.error(f"cmake compile failed: {e.stderr}")
        return False


def _compile_with_gpp() -> bool:
    try:
        result = subprocess.run(
            [
                "g++", "-std=c++17", "-O2", "-o",
                str(OPTIMIZER_BIN), str(OPTIMIZER_SRC),
            ],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            logger.info(f"Compiled successfully via g++ → {OPTIMIZER_BIN}")
            return True
        logger.error(f"g++ compile failed:\n{result.stderr}")
        return False
    except FileNotFoundError:
        logger.error("g++ not found on PATH.")
        return False


def run_optimizer(payload: Dict[str, Any], timeout: int = 30) -> Dict[str, Any]:
    """
    Call the C++ optimizer binary.

    Args:
        payload:  Dict matching the optimizer's JSON input schema.
        timeout:  Max seconds to wait (default 30s).

    Returns:
        Parsed JSON dict from C++ stdout.

    Raises:
        RuntimeError: If binary unavailable, times out, or returns an error.
    """
    if not OPTIMIZER_BIN.exists():
        if not ensure_compiled():
            raise RuntimeError(
                "C++ optimizer binary not available. "
                "Install g++ or cmake and rebuild."
            )

    input_json = json.dumps(payload, ensure_ascii=False)
    logger.debug(f"Sending to optimizer:\n{input_json}")

    try:
        proc = subprocess.run(
            [str(OPTIMIZER_BIN)],
            input=input_json,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"Optimizer timed out after {timeout}s")
    except FileNotFoundError:
        raise RuntimeError("Optimizer binary not found or not executable.")

    stderr_out = proc.stderr.strip()
    if stderr_out:
        logger.warning(f"Optimizer stderr: {stderr_out}")

    if proc.returncode != 0:
        raise RuntimeError(
            f"Optimizer exited with code {proc.returncode}. "
            f"stderr: {stderr_out or '(none)'}"
        )

    stdout = proc.stdout.strip()
    if not stdout:
        raise RuntimeError("Optimizer returned empty output.")

    logger.debug(f"Optimizer output:\n{stdout}")

    try:
        result = json.loads(stdout)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Optimizer returned invalid JSON: {e}\nRaw: {stdout[:500]}")

    if result.get("status") == "error":
        raise RuntimeError(f"Optimizer error: {result.get('message', 'unknown')}")

    return result
