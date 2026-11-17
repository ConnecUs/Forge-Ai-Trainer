export type LexiconCategory =
  | 'Training'
  | 'Hyperparameter'
  | 'CUDA & Compute'
  | 'Dataset & Skill'
  | 'Telemetry'
  | 'Architecture';

export interface LexiconEntry {
  key: string;
  term: string;
  category: LexiconCategory;
  short: string;
  explanation: string;
  ruleOfThumb: string;
}

export const LEXICON: Record<string, LexiconEntry> = {
  runName: {
    key: 'runName',
    term: 'Run Name',
    category: 'Training',
    short: 'Human-readable identifier for this fine-tuning experiment and its resulting adapter.',
    explanation:
      'Labels the training job in Run History, the Trained Models registry, and your procedurally generated adapter dashboard.',
    ruleOfThumb: 'Include the domain and dataset version, e.g. "kush-lore-qlora-v2".',
  },
  baseModel: {
    key: 'baseModel',
    term: 'Base Model (SafeTensors)',
    category: 'Architecture',
    short: 'The pre-trained HuggingFace foundation model whose weights are adapted during training.',
    explanation:
      'LoRA and QLoRA attach small trainable adapter matrices onto a frozen SafeTensors base model. Quantized GGUF/ONNX inference files cannot be backpropagated directly.',
    ruleOfThumb: 'Pick a verified SafeTensors LLM (e.g. 3B–8B) sized for your GPU VRAM.',
  },
  trainingMethod: {
    key: 'trainingMethod',
    term: 'Training Method',
    category: 'Training',
    short: 'How weights are updated: 4-bit QLoRA, 16-bit LoRA, or Full fine-tune.',
    explanation:
      'QLoRA quantizes the frozen base weights to 4-bit NF4 and trains compact LoRA adapters—fitting 4B–8B models inside 16 GB VRAM. LoRA uses 16-bit base weights, while Full fine-tune updates every parameter (requiring 3x–4x model size in VRAM).',
    ruleOfThumb: 'Use QLoRA on 8–16 GB GPUs; leave Balance CUDA memory enabled.',
  },
  qlora: {
    key: 'qlora',
    term: 'QLoRA (4-bit NF4)',
    category: 'Training',
    short: 'Quantized Low-Rank Adaptation using 4-bit NormalFloat base weights.',
    explanation:
      'Compresses the base model into 4-bit NF4 with double quantization while computing gradients in bfloat16/float16 and updating only low-rank adapter matrices.',
    ruleOfThumb: 'Default choice for 16 GB RTX GPUs—preserves quality at ~1/4th the VRAM.',
  },
  lora: {
    key: 'lora',
    term: 'LoRA (Low-Rank Adaptation)',
    category: 'Training',
    short: 'Trains small rank-decomposed adapter matrices instead of rewriting all base weights.',
    explanation:
      'Freezes the base model in 16-bit precision and injects trainable A/B low-rank matrices into attention and MLP linear projections, producing portable ~15–60 MB adapters.',
    ruleOfThumb: 'Great when the 16-bit model comfortably fits inside ~75% of GPU VRAM.',
  },
  fullFineTune: {
    key: 'fullFineTune',
    term: 'Full Fine-Tune',
    category: 'Training',
    short: 'Updates 100% of the model parameters without adapters.',
    explanation:
      'Stores full weights, gradients, and optimizer states in memory simultaneously (~2.5x–4x model size). On a 16 GB GPU, models larger than ~4 GB overflow into CPU RAM/pagefile unless auto-balanced.',
    ruleOfThumb: 'Only use on small (<3B) models or multi-GPU/high-VRAM rigs; otherwise use QLoRA.',
  },
  trainingDataset: {
    key: 'trainingDataset',
    term: 'Training Dataset (JSONL)',
    category: 'Dataset & Skill',
    short: 'The curated JSON Lines corpus of examples used to teach your AI-trainee.',
    explanation:
      'Each line is a JSON object—either conversational {"messages": [...]} turns for chat SFT or {"text": "..."} chunks for domain prose adaptation.',
    ruleOfThumb: 'Clean, structured 50–1,000+ examples outperform noisy multi-megabyte dumps.',
  },
  epochs: {
    key: 'epochs',
    term: 'Epochs',
    category: 'Hyperparameter',
    short: 'How many complete passes the trainer makes over your entire dataset.',
    explanation:
      'Too few epochs under-teaches new skills; too many epochs overfits so the trainee memorizes phrasing verbatim and loses flexibility.',
    ruleOfThumb: 'Use 2–4 epochs for small skill/domain datasets (50–500 examples); 1–2 for large ones.',
  },
  loraRank: {
    key: 'loraRank',
    term: 'LoRA Rank (r) & Alpha (α)',
    category: 'Hyperparameter',
    short: 'Controls the capacity (width) and scaling strength of the trainable adapter.',
    explanation:
      'Rank r sets the inner dimension of each LoRA matrix pair. Froge sets lora_alpha = 2 × r automatically to keep update magnitude balanced across ranks.',
    ruleOfThumb: 'r=8 or r=16 for style/domain skills; r=32–64 for dense technical knowledge.',
  },
  learningRate: {
    key: 'learningRate',
    term: 'Learning Rate',
    category: 'Hyperparameter',
    short: 'Step size controlling how aggressively weights change per optimizer step.',
    explanation:
      'Too high causes loss spikes and unstable grad_norm; too low stalls convergence. LoRA adapters tolerate higher learning rates than full fine-tuning.',
    ruleOfThumb: 'Start at 0.0002 (2e-4) for QLoRA/LoRA; drop to 0.00005–0.0001 if loss spikes.',
  },
  autoBalanceCuda: {
    key: 'autoBalanceCuda',
    term: 'Balance CUDA Memory',
    category: 'CUDA & Compute',
    short: 'Caps GPU VRAM at ~85% and prevents CPU/pagefile system lockups.',
    explanation:
      'Reserves ~15% VRAM headroom for Windows desktop/display, enables gradient checkpointing + paged_adamw_8bit, and auto-switches oversized Full fine-tune or LoRA runs to 4-bit QLoRA.',
    ruleOfThumb: 'Keep enabled on single-GPU Windows workstations to avoid system freezes.',
  },
  tritonCuda: {
    key: 'tritonCuda',
    term: 'Triton & CUDA Toolkit',
    category: 'CUDA & Compute',
    short: 'Compiler path (ptxas, cuda.h, cuda.lib) used by PyTorch/Triton kernels on Windows.',
    explanation:
      'Froge automatically detects CUDA_PATH / CUDA_HOME or Triton’s bundled NVIDIA backend so GPU kernels initialize cleanly without missing-CUDA warnings.',
    ruleOfThumb: 'Use "Verify / Auto-fix CUDA" in Local Compute if CUDA or Triton shows inactive.',
  },
  vramHeadroom: {
    key: 'vramHeadroom',
    term: 'GPU VRAM & Utilization',
    category: 'CUDA & Compute',
    short: 'Video memory available on your NVIDIA GPU for model weights, activations, and optimizer states.',
    explanation:
      'Keeping peak VRAM under ~85–90% avoids spilling tensors across PCIe into system RAM, which slows steps from ~2s to ~180s.',
    ruleOfThumb: 'Watch free VRAM before starting concurrent inference or training jobs.',
  },
  trainingLoss: {
    key: 'trainingLoss',
    term: 'Training Loss',
    category: 'Telemetry',
    short: 'Cross-entropy error measuring how surprised the model is by target tokens.',
    explanation:
      'Lower loss means the trainee predicts your dataset’s phrasing and answers more accurately. Expect noisy step-by-step waves with an overall downward trend.',
    ruleOfThumb: 'Healthy SFT loss typically settles between ~0.8 and ~2.8 depending on domain novelty.',
  },
  meanTokenAccuracy: {
    key: 'meanTokenAccuracy',
    term: 'Mean Token Accuracy',
    category: 'Telemetry',
    short: 'Percentage of next-token predictions where the model’s top choice matched the dataset.',
    explanation:
      'Tracks direct learning progress alongside loss. Rising from ~25% toward 55–80%+ shows the trainee is absorbing structure and terminology.',
    ruleOfThumb: 'Watch for steady upward progress without hitting 99%+ (which signals memorization).',
  },
  outputEntropy: {
    key: 'outputEntropy',
    term: 'Output Token Entropy',
    category: 'Telemetry',
    short: 'Measures how uncertain or spread out the model’s token probability distribution is.',
    explanation:
      'High entropy means the model is guessing across many tokens; gradually decreasing entropy means it is becoming confident in your domain patterns.',
    ruleOfThumb: 'Should trend gently downward alongside loss, not collapse to near-zero instantly.',
  },
  gradNorm: {
    key: 'gradNorm',
    term: 'Gradient Norm',
    category: 'Telemetry',
    short: 'L2 magnitude of parameter gradients on each training step.',
    explanation:
      'Reveals optimization stability. Smooth values (e.g. 0.5–3.0) indicate healthy updates; huge spikes (>20–100) mean the learning rate is too aggressive or data contains noisy outliers.',
    ruleOfThumb: 'If grad_norm spikes repeatedly, lower learning rate or clean dataset chunks.',
  },
  targetModules: {
    key: 'targetModules',
    term: 'LoRA Target Modules',
    category: 'Architecture',
    short: 'Specific linear projection layers (q_proj, v_proj, mlp) receiving trainable adapters.',
    explanation:
      'Froge automatically detects language-model projections for newer multimodal architectures like Gemma 4 so vision/audio towers aren’t accidentally wrapped during text SFT.',
    ruleOfThumb: 'Targeting attention + MLP projections yields strongest skill retention.',
  },
  checkpoints: {
    key: 'checkpoints',
    term: 'Checkpoints & Adapters',
    category: 'Architecture',
    short: 'Per-epoch snapshots saved under data/runs/<id>/output/ during training.',
    explanation:
      'Each epoch writes a recoverable checkpoint directory (optimizer + adapter weights), and completion saves the final portable adapter_model.safetensors + tokenizer.',
    ruleOfThumb: 'Compare earlier vs final checkpoints if the last epoch begins overfitting.',
  },
  appAssignments: {
    key: 'appAssignments',
    term: 'App & Process Assignments',
    category: 'Architecture',
    short: 'Tracks which local apps, ports, or background processes are assigned or available to use an adapter.',
    explanation:
      'Lets you map trained adapters to workspace projects (e.g. Kush Engine, LyricForge, Model Hub) and probe live Windows PIDs and listening ports in real time.',
    ruleOfThumb: 'Mark targets "Assigned" for active production routing or "Available" for staging.',
  },
  knowledgeSource: {
    key: 'knowledgeSource',
    term: 'Knowledge Source',
    category: 'Dataset & Skill',
    short: 'Raw books, PDFs, EPUBs, DOCX, HTML, or notes extracted and sanitized into structured sections.',
    explanation:
      'Powered by myBookToSkills, Froge extracts clean text, detects chapter boundaries, strips invisible Unicode controls, and extracts candidate glossary terms and rules.',
    ruleOfThumb: 'Group related manuals or chapters into one coherent Knowledge Source before building a Skill.',
  },
  extractionMode: {
    key: 'extractionMode',
    term: 'Extraction Mode (Text vs Technical)',
    category: 'Dataset & Skill',
    short: 'Chooses between fast text-chain extraction or layout/table-aware technical extraction.',
    explanation:
      'Text mode uses pypdf/pdfminer/ebooklib/docx for clean prose and code. Technical mode prioritizes Docling for complex multi-column tables and formulas when installed.',
    ruleOfThumb: 'Use Text mode for most books, docs, and lore; Technical mode for table-heavy PDFs.',
  },
  agentSkill: {
    key: 'agentSkill',
    term: 'Agent Skill Package (SKILL.md)',
    category: 'Dataset & Skill',
    short: 'An open-standard skill bundle with SKILL.md, chapters/, glossary.md, patterns.md, and cheatsheet.md.',
    explanation:
      'Instead of dumping an entire book into context (the Discovery Loop Tax), skills organize knowledge into an index + on-demand chapter files—and can be compiled directly into SFT training datasets.',
    ruleOfThumb: 'Build a Skill first to audit structure, glossary, and security before compiling JSONL.',
  },
  validationLens: {
    key: 'validationLens',
    term: 'Skill Validation Lens',
    category: 'Dataset & Skill',
    short: 'Audits SKILL.md frontmatter and tool rules against Claude Code, Copilot CLI, or Amp specs.',
    explanation:
      'Runs myBookToSkills validate_skill.py to verify required metadata, slug formatting, line budgets, and host-specific frontmatter compatibility.',
    ruleOfThumb: 'Keep "Claude Code" lens by default; switch to Copilot or Amp if targeting those hosts.',
  },
  securityScan: {
    key: 'securityScan',
    term: 'Sanitization & Injection Scan',
    category: 'Dataset & Skill',
    short: 'Strips invisible Unicode bidi/zero-width chars and flags prompt-injection patterns.',
    explanation:
      'Uses myBookToSkills sanitize.py and scan_generated_skill.py to catch hidden control codepoints, fake system prefixes, or chat-template delimiters before they enter your dataset.',
    ruleOfThumb: 'Review any flagged advisory findings before training on untrusted external PDFs/HTML.',
  },
  compileFormat: {
    key: 'compileFormat',
    term: 'Dataset Compile Format',
    category: 'Dataset & Skill',
    short: 'Output JSONL schema: Messages (SFT Chat), Instruction Q&A, or Domain Prose.',
    explanation:
      'Messages wraps chapters, glossary terms, and patterns in system + user + assistant chat turns. Instruction omits the system prompt for lighter Q&A. Domain Prose outputs {"text": ...} chunks for continued pre-training.',
    ruleOfThumb: 'Choose "Messages (SFT Chat)" for instruct/chat models like Gemma 4 or Qwen.',
  },
  targetTokens: {
    key: 'targetTokens',
    term: 'Target Chunk Tokens',
    category: 'Dataset & Skill',
    short: 'Approximate token budget per compiled training example.',
    explanation:
      'Splits long chapters at paragraph boundaries so each example fits comfortably in GPU memory without losing semantic context.',
    ruleOfThumb: 'Use 350–500 tokens on 16 GB GPUs for fast, low-VRAM SFT batches.',
  },
  discoveryLoopTax: {
    key: 'discoveryLoopTax',
    term: 'Discovery Loop Tax',
    category: 'Dataset & Skill',
    short: 'Token waste caused when an AI repeatedly re-reads raw PDFs instead of structured chapters.',
    explanation:
      'Structuring sources once into chapters, glossary, and patterns cuts retrieval bloat 24x–51x and creates dramatically cleaner supervised fine-tuning examples.',
    ruleOfThumb: 'Structure messy sources into a Skill before compiling your AI-trainee dataset.',
  },
};

export type LexiconKey = keyof typeof LEXICON;
