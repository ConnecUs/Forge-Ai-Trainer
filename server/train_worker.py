import argparse
import json
import os
import site
import sys
from pathlib import Path


def auto_configure_cuda_env() -> str | None:
    if sys.platform != "win32":
        os.environ.setdefault("PYTORCH_ALLOC_CONF", "expandable_segments:True")
    candidates = []
    for env_key in ("CUDA_PATH", "CUDA_HOME"):
        val = os.environ.get(env_key)
        if val:
            candidates.append(Path(val))

    program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
    cuda_root = Path(program_files) / "NVIDIA GPU Computing Toolkit" / "CUDA"
    if cuda_root.exists():
        candidates.extend(sorted(cuda_root.glob("v*"), reverse=True))

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
            resolved = str(candidate)
            os.environ["CUDA_PATH"] = resolved
            os.environ["CUDA_HOME"] = resolved
            bin_dir = str(candidate / "bin")
            current_path = os.environ.get("PATH", "")
            if bin_dir.lower() not in current_path.lower():
                os.environ["PATH"] = f"{bin_dir}{os.pathsep}{current_path}"
            return resolved
    return None


def emit(event_type: str, **payload) -> None:
    print(json.dumps({"type": event_type, **payload}), flush=True)


def validate_environment(model_path: str, dataset_path: str) -> None:
    if not dataset_path or not Path(dataset_path).exists():
        raise RuntimeError(
            "Selected dataset has no local file on disk. Import a TXT/JSONL file or create a conversation in Capture Studio first."
        )

    if model_path.lower().endswith(".gguf"):
        raise RuntimeError(
            f"'{Path(model_path).name}' is a quantized GGUF inference file. "
            "LoRA/QLoRA training requires a HuggingFace / SafeTensors model directory (or HF model ID), not a GGUF file."
        )

    if model_path.lower().endswith(".onnx"):
        raise RuntimeError(
            f"'{Path(model_path).name}' is an ONNX inference artifact and cannot be fine-tuned directly with PEFT/LoRA."
        )

    missing = []
    for pkg in ("torch", "transformers", "peft", "trl", "datasets", "accelerate"):
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)

    if missing:
        raise RuntimeError(
            f"Missing Python training packages: {', '.join(missing)}. "
            "Install them into Froge_Trainer/.venv using server/requirements.txt."
        )

    import torch

    if not torch.cuda.is_available():
        raise RuntimeError(
            "PyTorch CUDA is not available in this Python environment (CPU-only torch detected). "
            "Install CUDA-enabled PyTorch to train on your NVIDIA GPU."
        )


def resolve_lora_target_modules(model):
    import torch
    from peft.utils.constants import TRANSFORMERS_MODELS_TO_LORA_TARGET_MODULES_MAPPING

    model_type = getattr(getattr(model, "config", None), "model_type", None)
    if model_type in TRANSFORMERS_MODELS_TO_LORA_TARGET_MODULES_MAPPING:
        return None

    skip_subtrees = {
        "vision_tower",
        "audio_tower",
        "vision_model",
        "audio_model",
        "visual",
        "multi_modal_projector",
        "lm_head",
    }
    preferred_projections = {
        "q_proj",
        "k_proj",
        "v_proj",
        "o_proj",
        "gate_proj",
        "up_proj",
        "down_proj",
        "qkv_proj",
        "gate_up_proj",
        "c_attn",
        "c_proj",
        "c_fc",
        "W_pack",
    }

    preferred_matches = []
    all_linear_matches = []
    for name, module in model.named_modules():
        if not isinstance(module, torch.nn.Linear):
            continue
        parts = name.split(".")
        if any(skip in parts for skip in skip_subtrees):
            continue
        all_linear_matches.append(name)
        if parts[-1] in preferred_projections:
            preferred_matches.append(name)

    if preferred_matches:
        return preferred_matches
    if all_linear_matches:
        return all_linear_matches
    return "all-linear"


def estimate_model_weights_gb(model_source: str) -> float:
    path = Path(model_source)
    if not path.exists():
        return 0.0
    if path.is_file():
        return path.stat().st_size / (1024**3)
    weight_bytes = sum(
        p.stat().st_size
        for pattern in ("*.safetensors", "*.bin")
        for p in path.glob(pattern)
        if p.is_file()
    )
    return weight_bytes / (1024**3)


def plan_cuda_balance(model_source: str, requested_method: str, auto_balance: bool):
    import torch

    free_bytes, total_bytes = torch.cuda.mem_get_info(0)
    free_gb = free_bytes / (1024**3)
    total_gb = total_bytes / (1024**3)
    model_gb = estimate_model_weights_gb(model_source)

    # Keep ~15% GPU headroom so Windows desktop/DWM and display apps stay responsive
    gpu_budget_gb = max(4.0, min(free_gb * 0.90, total_gb * 0.85))
    effective_method = requested_method
    notes = []

    if auto_balance and model_gb > 0:
        if requested_method == "Full fine-tune" and (model_gb * 2.4) > gpu_budget_gb:
            effective_method = "QLoRA"
            notes.append(
                f"Auto-balanced CUDA: {model_gb:.1f} GB weights exceed Full fine-tune budget "
                f"({gpu_budget_gb:.1f} GB safe GPU cap / {total_gb:.1f} GB total); switching to 4-bit QLoRA + paged_adamw_8bit."
            )
        elif requested_method == "LoRA" and (model_gb * 1.25) > gpu_budget_gb:
            effective_method = "QLoRA"
            notes.append(
                f"Auto-balanced CUDA: {model_gb:.1f} GB weights exceed 16-bit LoRA budget "
                f"({gpu_budget_gb:.1f} GB safe GPU cap); switching to 4-bit QLoRA + paged_adamw_8bit."
            )

    max_memory = None
    if auto_balance:
        max_memory = {0: f"{gpu_budget_gb:.1f}GiB", "cpu": f"{max(12, int(model_gb * 1.5) + 4)}GiB"}

    return {
        "effective_method": effective_method,
        "model_gb": model_gb,
        "free_gb": free_gb,
        "total_gb": total_gb,
        "gpu_budget_gb": gpu_budget_gb,
        "max_memory": max_memory,
        "notes": notes,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Froge Trainer local LoRA/QLoRA worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--dataset-path", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--method", default="QLoRA")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--rank", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--auto-balance", dest="auto_balance", action="store_true")
    parser.add_argument("--no-auto-balance", dest="auto_balance", action="store_false")
    parser.set_defaults(auto_balance=True)
    args = parser.parse_args()

    try:
        cuda_toolkit = auto_configure_cuda_env()
        validate_environment(args.model_path, args.dataset_path)
        if cuda_toolkit:
            print(f"Auto-configured CUDA toolkit path: {cuda_toolkit}", flush=True)

        import importlib.util
        import torch
        from datasets import load_dataset
        from peft import LoraConfig
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TrainerCallback
        from trl import SFTConfig, SFTTrainer

        model_source = args.model_path
        if Path(model_source).is_file():
            model_source = str(Path(model_source).parent)

        balance = plan_cuda_balance(model_source, args.method, args.auto_balance)
        effective_method = balance["effective_method"]
        for note in balance["notes"]:
            print(note, flush=True)

        emit("progress", progress=5, step=0, loss=None)
        print(f"Loading dataset from {args.dataset_path}...", flush=True)
        dataset = load_dataset("json", data_files=args.dataset_path, split="train")

        print(
            f"Loading model from {model_source} ({effective_method}, GPU cap {balance['gpu_budget_gb']:.1f}/{balance['total_gb']:.1f} GiB)...",
            flush=True,
        )
        tokenizer = AutoTokenizer.from_pretrained(model_source, trust_remote_code=True)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        bf16_supported = torch.cuda.is_bf16_supported()
        compute_dtype = torch.bfloat16 if bf16_supported else torch.float16

        quant_config = None
        if effective_method == "QLoRA":
            quant_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=compute_dtype,
                bnb_4bit_use_double_quant=True,
            )

        load_kwargs = {
            "quantization_config": quant_config,
            "device_map": "auto",
            "trust_remote_code": True,
        }
        if quant_config is None:
            load_kwargs["dtype"] = compute_dtype
        if balance["max_memory"] is not None:
            load_kwargs["max_memory"] = balance["max_memory"]

        model = AutoModelForCausalLM.from_pretrained(model_source, **load_kwargs)

        peft_config = None
        if effective_method in ("QLoRA", "LoRA"):
            target_modules = resolve_lora_target_modules(model)
            if isinstance(target_modules, list):
                print(
                    f"Resolved {len(target_modules)} LoRA target modules for {getattr(model.config, 'model_type', 'model')}.",
                    flush=True,
                )
            peft_config = LoraConfig(
                r=args.rank,
                lora_alpha=args.rank * 2,
                lora_dropout=0.05,
                bias="none",
                task_type="CAUSAL_LM",
                target_modules=target_modules,
            )

        class FrogeProgressCallback(TrainerCallback):
            def on_log(self, _args, state, control, logs=None, **kwargs):
                if logs and "loss" in logs and state.max_steps > 0:
                    pct = min(99, max(10, int((state.global_step / state.max_steps) * 100)))
                    emit("progress", progress=pct, step=state.global_step, loss=float(logs["loss"]))

        if hasattr(model, "config") and getattr(model.config, "use_cache", None) is not None:
            model.config.use_cache = False

        has_bnb = importlib.util.find_spec("bitsandbytes") is not None
        optimizer_name = "paged_adamw_8bit" if (has_bnb and args.auto_balance) else "adamw_torch"

        os.makedirs(args.output_dir, exist_ok=True)
        sft_config = SFTConfig(
            output_dir=args.output_dir,
            num_train_epochs=args.epochs,
            per_device_train_batch_size=1,
            gradient_accumulation_steps=4,
            gradient_checkpointing=True,
            optim=optimizer_name,
            learning_rate=args.lr,
            logging_steps=1,
            save_strategy="epoch",
            bf16=bf16_supported,
            fp16=not bf16_supported,
            dataloader_pin_memory=False,
            report_to="none",
        )

        trainer = SFTTrainer(
            model=model,
            args=sft_config,
            train_dataset=dataset,
            processing_class=tokenizer,
            peft_config=peft_config,
            callbacks=[FrogeProgressCallback()],
        )

        trainer.train()
        trainer.save_model(args.output_dir)
        tokenizer.save_pretrained(args.output_dir)
        emit("complete", output_dir=args.output_dir)
        return 0
    except Exception as exc:
        emit("error", message=str(exc))
        return 1


if __name__ == "__main__":
    sys.exit(main())
