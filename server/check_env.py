import importlib.metadata
import importlib.util
import json
import os
import site
import sys
from pathlib import Path


def resolve_cuda_toolkit_dir():
    candidates = []
    for env_key in ("CUDA_PATH", "CUDA_HOME"):
        val = os.environ.get(env_key)
        if val:
            candidates.append(Path(val))

    program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
    cuda_root = Path(program_files) / "NVIDIA GPU Computing Toolkit" / "CUDA"
    if cuda_root.exists():
        versions = sorted(cuda_root.glob("v*"), reverse=True)
        candidates.extend(versions)

    site_dirs = []
    try:
        site_dirs.append(site.getusersitepackages())
    except Exception:
        pass
    try:
        site_dirs.extend(site.getsitepackages())
    except Exception:
        pass

    for sp in site_dirs:
        candidates.append(Path(sp) / "triton" / "backends" / "nvidia")

    for candidate in candidates:
        if (
            (candidate / "bin" / "ptxas.exe").exists()
            and (candidate / "include" / "cuda.h").exists()
            and (candidate / "lib" / "x64" / "cuda.lib").exists()
        ):
            return str(candidate)
    return None


PKGS = ["torch", "transformers", "peft", "trl", "datasets", "accelerate", "bitsandbytes"]
cuda_toolkit_path = resolve_cuda_toolkit_dir()
if cuda_toolkit_path:
    os.environ.setdefault("CUDA_PATH", cuda_toolkit_path)
    os.environ.setdefault("CUDA_HOME", cuda_toolkit_path)

info = {
    "pythonVersion": sys.version.split()[0],
    "cudaAvailable": False,
    "cudaVersion": None,
    "deviceName": None,
    "cudaToolkitPath": cuda_toolkit_path,
    "tritonCudaReady": bool(cuda_toolkit_path),
    "packages": {},
}

for pkg in PKGS:
    if importlib.util.find_spec(pkg) is None:
        info["packages"][pkg] = None
        continue
    try:
        info["packages"][pkg] = importlib.metadata.version(pkg)
    except Exception:
        info["packages"][pkg] = "installed"

if info["packages"].get("torch"):
    try:
        import torch

        info["cudaAvailable"] = bool(torch.cuda.is_available())
        info["cudaVersion"] = getattr(torch.version, "cuda", None)
        if info["cudaAvailable"]:
            info["deviceName"] = torch.cuda.get_device_name(0)
    except Exception:
        pass

print(json.dumps(info))
