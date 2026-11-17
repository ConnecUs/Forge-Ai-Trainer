import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATASETS_DIR = path.join(DATA_DIR, 'datasets');
const RUNS_DIR = path.join(DATA_DIR, 'runs');
const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge');
const SKILLS_DIR = path.join(DATA_DIR, 'skills');
const DATASETS_INDEX_PATH = path.join(DATA_DIR, 'datasets.json');
const RUNS_INDEX_PATH = path.join(DATA_DIR, 'runs.json');
const KNOWLEDGE_INDEX_PATH = path.join(DATA_DIR, 'knowledge.json');
const SKILLS_INDEX_PATH = path.join(DATA_DIR, 'skills.json');
const TRAINED_MODELS_INDEX_PATH = path.join(DATA_DIR, 'trained_models.json');
const WORKSPACE_PROJECTS_DIR = path.resolve(ROOT_DIR, '..');
const BOOK_TO_SKILL_DIR =
  process.env.BOOK_TO_SKILL_DIR || 'C:\\25th_Dynasty_Workspace\\myBookToSkills';

const PORT = Number(process.env.FROGE_PORT || 8901);
const MODEL_HUB_URL = (process.env.MODEL_HUB_URL || 'http://127.0.0.1:8899').replace(/\/$/, '');

const SEED_DATASETS = [
  {
    id: 'personal',
    name: 'Personal knowledge',
    kind: 'Documents',
    examples: 1248,
    size: '4.8 MB',
    created: '2026-11-14',
  },
  {
    id: 'dialogue',
    name: 'Assistant conversations',
    kind: 'Conversations',
    examples: 856,
    size: '2.1 MB',
    created: '2026-11-13',
  },
  {
    id: 'workflow',
    name: 'Daily workflows',
    kind: 'Screen',
    examples: 312,
    size: '18.4 MB',
    created: '2026-11-12',
  },
];

const activeProcesses = new Map();

const fileLocks = new Map();

function withFileLock(filePath, task) {
  const previous = fileLocks.get(filePath) || Promise.resolve();
  const next = previous.then(task, task);
  const tail = next.catch(() => {});
  fileLocks.set(filePath, tail);
  return next;
}

async function ensureStorage() {
  await fs.mkdir(DATASETS_DIR, { recursive: true });
  await fs.mkdir(RUNS_DIR, { recursive: true });
  await fs.mkdir(KNOWLEDGE_DIR, { recursive: true });
  await fs.mkdir(SKILLS_DIR, { recursive: true });

  try {
    await fs.access(DATASETS_INDEX_PATH);
  } catch {
    await writeJson(DATASETS_INDEX_PATH, SEED_DATASETS);
  }

  try {
    await fs.access(RUNS_INDEX_PATH);
  } catch {
    await writeJson(RUNS_INDEX_PATH, []);
  }

  try {
    await fs.access(KNOWLEDGE_INDEX_PATH);
  } catch {
    await writeJson(KNOWLEDGE_INDEX_PATH, []);
  }

  try {
    await fs.access(SKILLS_INDEX_PATH);
  } catch {
    await writeJson(SKILLS_INDEX_PATH, []);
  }

  try {
    await fs.access(TRAINED_MODELS_INDEX_PATH);
  } catch {
    await writeJson(TRAINED_MODELS_INDEX_PATH, {});
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw.trim()) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (err) {
    if (err && typeof err === 'object' && err.code === 'ENOENT') {
      return fallback;
    }
    throw err;
  }
}

async function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
  const payload = JSON.stringify(data, null, 2);
  await fs.writeFile(tmpPath, payload, 'utf8');
  try {
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
}

let cachedPythonCommand = null;

async function getPythonCapabilities(pythonCmd) {
  try {
    const { stdout } = await execFileAsync(
      pythonCmd,
      [path.join(__dirname, 'check_env.py')],
      { timeout: 15000 }
    );
    return JSON.parse(stdout.trim());
  } catch (err) {
    return {
      pythonVersion: null,
      cudaAvailable: false,
      packages: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function scorePythonCapabilities(caps) {
  if (!caps || !caps.pythonVersion) return -1;
  let score = caps.cudaAvailable ? 100 : 0;
  const pkgs = caps.packages || {};
  for (const key of ['torch', 'transformers', 'peft', 'trl', 'datasets', 'accelerate', 'bitsandbytes']) {
    if (pkgs[key]) score += 10;
  }
  return score;
}

async function resolvePythonCommand(forceRefresh = false) {
  if (process.env.FROGE_PYTHON) {
    return process.env.FROGE_PYTHON;
  }
  if (cachedPythonCommand && !forceRefresh) {
    return cachedPythonCommand;
  }

  const candidates = [
    path.join(ROOT_DIR, '.venv', 'Scripts', 'python.exe'),
    path.join(ROOT_DIR, '.venv', 'bin', 'python'),
    'C:\\Python312\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Python313\\python.exe',
    'python',
  ];

  const existingCandidates = [];
  for (const candidate of candidates) {
    if (candidate.includes(path.sep)) {
      try {
        await fs.access(candidate);
        existingCandidates.push(candidate);
      } catch {
        // skip missing path
      }
    } else {
      existingCandidates.push(candidate);
    }
  }

  const results = await Promise.all(
    existingCandidates.map(async (candidate) => {
      const caps = await getPythonCapabilities(candidate);
      return { candidate, score: scorePythonCapabilities(caps) };
    })
  );

  let bestCmd = 'python';
  let bestScore = -1;
  for (const { candidate, score } of results) {
    if (score > bestScore) {
      bestScore = score;
      bestCmd = candidate;
    }
  }

  cachedPythonCommand = bestCmd;
  return bestCmd;
}

async function getGpuTelemetry() {
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      [
        '--query-gpu=name,memory.total,memory.free,memory.used,utilization.gpu,temperature.gpu',
        '--format=csv,noheader,nounits',
      ],
      { timeout: 3000 }
    );
    const firstLine = stdout.trim().split(/\r?\n/)[0];
    if (!firstLine) return null;
    const [name, totalMb, freeMb, usedMb, utilPct, tempC] = firstLine
      .split(',')
      .map((part) => part.trim());
    return {
      name,
      totalMb: Number(totalMb),
      freeMb: Number(freeMb),
      usedMb: Number(usedMb),
      utilizationPct: Number(utilPct),
      temperatureC: Number(tempC),
    };
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  return `${value.toFixed(unitIdx === 0 ? 0 : 2)} ${units[unitIdx]}`;
}

function extractRepoDisplayName(dirPath, fallbackName) {
  const parts = String(dirPath || '').split(/[\\/]/).filter(Boolean);
  const hfPart = parts.find((p) => p.startsWith('models--'));
  if (hfPart) {
    return hfPart.replace(/^models--/, '').replace(/--/g, '/');
  }
  return parts[parts.length - 1] || fallbackName;
}

const NON_LLM_ARCH_PATTERN = /(Autoencoder|Vocoder|UNet|Transformer2D|Transformer3D|CLIPText|T5Encoder|UMT5Encoder|Connectors)/i;
const TRAINABLE_LLM_ARCH_PATTERN = /(ForCausalLM|ForConditionalGeneration)$/i;

async function inspectSafeTensorsDirectory(dirPath) {
  const cfgPath = path.join(dirPath, 'config.json');
  const hasTokenizer = await Promise.any([
    fs.access(path.join(dirPath, 'tokenizer.json')),
    fs.access(path.join(dirPath, 'tokenizer_config.json')),
  ])
    .then(() => true)
    .catch(() => false);

  try {
    const raw = await fs.readFile(cfgPath, 'utf8');
    const cfg = JSON.parse(raw);
    const archList = Array.isArray(cfg.architectures) ? cfg.architectures : [];
    const arch = archList[0] || cfg.model_type || cfg._class_name || 'Unknown';

    if (!hasTokenizer) {
      return { trainable: false, architecture: arch, reason: 'Missing tokenizer files' };
    }
    if (NON_LLM_ARCH_PATTERN.test(arch)) {
      return { trainable: false, architecture: arch, reason: 'Diffusion/video component' };
    }
    if (TRAINABLE_LLM_ARCH_PATTERN.test(arch)) {
      return { trainable: true, architecture: arch, reason: 'Verified HuggingFace LLM' };
    }
    return { trainable: false, architecture: arch, reason: `Unsupported architecture (${arch})` };
  } catch {
    return { trainable: false, architecture: 'Unknown', reason: 'Missing config.json' };
  }
}

async function enrichAndDeduplicateHubModels(rawModels) {
  const dirGroups = new Map();
  const passthrough = [];

  for (const model of rawModels) {
    const format = String(model.format || model.type || '');
    if (format === 'SafeTensors' && !model.is_lora && model.directory) {
      const existing = dirGroups.get(model.directory) || [];
      existing.push(model);
      dirGroups.set(model.directory, existing);
    } else if (model.is_lora) {
      passthrough.push({
        ...model,
        trainable: false,
        trainableReason: 'LoRA adapter (not a base model)',
      });
    } else if (format === 'GGUF' || format === 'ONNX') {
      passthrough.push({
        ...model,
        trainable: false,
        trainableReason: `${format} quantized/inference artifact`,
      });
    } else {
      passthrough.push({
        ...model,
        trainable: false,
        trainableReason: `${format || 'Unknown'} format not supported for LoRA`,
      });
    }
  }

  const verifiedDirs = await Promise.all(
    Array.from(dirGroups.entries()).map(async ([dirPath, files]) => {
      const first = files[0];
      const totalBytes = files.reduce((sum, f) => sum + Number(f.size_bytes || 0), 0);
      const inspection = await inspectSafeTensorsDirectory(dirPath);
      return {
        ...first,
        name: extractRepoDisplayName(dirPath, first.name),
        path: dirPath,
        size_bytes: totalBytes,
        size_formatted: formatBytes(totalBytes),
        architecture: inspection.architecture,
        trainable: inspection.trainable,
        trainableReason: inspection.reason,
      };
    })
  );

  const combined = [...verifiedDirs, ...passthrough];
  combined.sort((a, b) => Number(Boolean(b.trainable)) - Number(Boolean(a.trainable)));
  return combined;
}

async function fetchModelHub() {
  const response = await fetch(`${MODEL_HUB_URL}/api/models`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Model Hub returned HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (!payload?.success || !payload?.data) {
    throw new Error('Unexpected response shape from Model Hub');
  }
  return payload.data;
}

async function saveRunSnapshot(run) {
  if (!run?.id) return;
  const runDir = path.join(RUNS_DIR, run.id);
  try {
    await fs.access(runDir);
    await writeJson(path.join(runDir, 'run.json'), run);
  } catch {
    // Run directory does not exist (e.g., deleted)
  }
}

async function updateRun(runId, updater) {
  return withFileLock(RUNS_INDEX_PATH, async () => {
    const runs = await readJson(RUNS_INDEX_PATH, []);
    let updatedRun = null;
    const nextRuns = runs.map((run) => {
      if (run.id !== runId) return run;
      updatedRun = updater(run);
      return updatedRun;
    });
    if (updatedRun) {
      await writeJson(RUNS_INDEX_PATH, nextRuns);
      await saveRunSnapshot(updatedRun);
    }
    return updatedRun;
  });
}

async function findLatestTrainerState(outputDir) {
  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    const checkpoints = entries
      .filter((e) => e.isDirectory() && /^checkpoint-\d+$/.test(e.name))
      .map((e) => ({
        name: e.name,
        step: Number(e.name.replace('checkpoint-', '')),
      }))
      .sort((a, b) => b.step - a.step);

    for (const cp of checkpoints) {
      const statePath = path.join(outputDir, cp.name, 'trainer_state.json');
      try {
        return await readJson(statePath, null);
      } catch {
        // try older checkpoint
      }
    }
  } catch {
    // ignore missing outputDir
  }
  return null;
}

async function reconstructCompletedRunFromDisk(runId, runDir) {
  const outputDir = path.join(runDir, 'output');
  const adapterWeightsPath = path.join(outputDir, 'adapter_model.safetensors');
  const adapterConfigPath = path.join(outputDir, 'adapter_config.json');

  try {
    await fs.access(adapterWeightsPath);
  } catch {
    return null;
  }

  const adapterConfig = await readJson(adapterConfigPath, {}).catch(() => ({}));
  const trainerState = await findLatestTrainerState(outputDir);
  const stat = await fs.stat(adapterWeightsPath);
  const created = stat.mtime.toISOString().slice(0, 10);

  const modelPath = adapterConfig?.base_model_name_or_path || '';
  const modelName = modelPath ? extractRepoDisplayName(modelPath, 'Recovered model') : 'Recovered model';
  const logHistory = Array.isArray(trainerState?.log_history) ? trainerState.log_history : [];
  const lossHistory = logHistory
    .filter((entry) => typeof entry?.loss === 'number')
    .map((entry) => ({
      step: Number(entry.step ?? 0),
      loss: Number(Number(entry.loss).toFixed(4)),
    }))
    .slice(-100);

  const lastLossEntry = [...logHistory].reverse().find((entry) => typeof entry?.loss === 'number');
  const firstLrEntry = logHistory.find((entry) => typeof entry?.learning_rate === 'number');
  const epochs = Number(trainerState?.num_train_epochs || 3);
  const rank = Number(adapterConfig?.r || 16);
  const learningRate = firstLrEntry ? String(firstLrEntry.learning_rate) : '0.0002';

  return {
    id: runId,
    name: `${modelName.split('/').pop() || 'Recovered'} fine-tune`,
    model: modelName,
    modelPath: modelPath || undefined,
    method: 'QLoRA',
    dataset: 'Local dataset',
    epochs,
    rank,
    learningRate,
    progress: 100,
    status: 'completed',
    currentLoss:
      typeof lastLossEntry?.loss === 'number'
        ? Number(Number(lastLossEntry.loss).toFixed(4))
        : undefined,
    lossHistory,
    logs: [
      `Recovered completed training run from disk (${lossHistory.length} recorded steps)`,
      `Completed: ${outputDir}`,
    ],
    outputDir,
    created,
  };
}

async function reconcileRunsOnStartup() {
  return withFileLock(RUNS_INDEX_PATH, async () => {
    const runs = await readJson(RUNS_INDEX_PATH, []);
    let changed = false;

    const reconciled = await Promise.all(
      runs.map(async (run) => {
        const outputDir = run.outputDir || path.join(RUNS_DIR, run.id, 'output');
        if (run.status === 'running' && !activeProcesses.has(run.id)) {
          changed = true;
          const hasAdapter = await fs
            .access(path.join(outputDir, 'adapter_model.safetensors'))
            .then(() => true)
            .catch(() => false);
          if (hasAdapter) {
            return {
              ...run,
              progress: 100,
              status: 'completed',
              outputDir,
              logs: [...(run.logs || []).slice(-120), `Completed: ${outputDir}`],
            };
          }
          return {
            ...run,
            status: 'failed',
            error: run.error || 'Worker interrupted (server restarted)',
            logs: [...(run.logs || []).slice(-120), 'Worker interrupted (server restarted)'],
          };
        }
        return run;
      })
    );

    const knownIds = new Set(reconciled.map((r) => r.id));
    const dirEntries = await fs.readdir(RUNS_DIR, { withFileTypes: true }).catch(() => []);
    for (const entry of dirEntries) {
      if (!entry.isDirectory() || knownIds.has(entry.name)) continue;
      const runDir = path.join(RUNS_DIR, entry.name);
      const snapshotPath = path.join(runDir, 'run.json');
      let recovered = await readJson(snapshotPath, null).catch(() => null);
      if (!recovered) {
        recovered = await reconstructCompletedRunFromDisk(entry.name, runDir);
      }
      if (recovered && recovered.id === entry.name) {
        reconciled.push(recovered);
        await saveRunSnapshot(recovered);
        changed = true;
      }
    }

    if (changed) {
      reconciled.sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
      await writeJson(RUNS_INDEX_PATH, reconciled);
    }
  });
}

async function killRunWorker(runId) {
  const proc = activeProcesses.get(runId);
  if (proc?.pid) {
    if (process.platform === 'win32') {
      await execFileAsync('taskkill', ['/F', '/T', '/PID', String(proc.pid)], {
        timeout: 4000,
      }).catch(() => {});
    } else {
      try {
        proc.kill('SIGKILL');
      } catch {
        // already exited
      }
    }
    activeProcesses.delete(runId);
  }

  if (process.platform === 'win32' && /^[0-9a-f-]{8,}$/i.test(String(runId))) {
    const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'train_worker\\.py' -and $_.CommandLine -match '${runId}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    await execFileAsync('powershell.exe', ['-NoProfile', '-Command', ps], {
      timeout: 4000,
    }).catch(() => {});
  }
}

async function startWorkerForRun(run) {
  if (activeProcesses.has(run.id)) {
    return;
  }

  await killRunWorker(run.id);

  const pythonCmd = await resolvePythonCommand();
  const caps = await getPythonCapabilities(pythonCmd);
  const runDir = path.join(RUNS_DIR, run.id);
  const outputDir = path.join(runDir, 'output');
  await fs.mkdir(outputDir, { recursive: true });
  await saveRunSnapshot(run);

  const datasets = await readJson(DATASETS_INDEX_PATH, []);
  const dataset = datasets.find((d) => d.name === run.dataset || d.id === run.dataset);
  let datasetFilePath = dataset?.filePath || '';

  if (!datasetFilePath && dataset?.content) {
    datasetFilePath = path.join(DATASETS_DIR, `${dataset.id}.jsonl`);
    await fs.writeFile(datasetFilePath, dataset.content, 'utf8');
  }

  const workerPath = path.join(__dirname, 'train_worker.py');
  const args = [
    workerPath,
    '--run-id',
    run.id,
    '--model-path',
    run.modelPath || run.model,
    '--dataset-path',
    datasetFilePath,
    '--output-dir',
    outputDir,
    '--method',
    run.method,
    '--epochs',
    String(run.epochs),
    '--rank',
    String(run.rank),
    '--lr',
    String(run.learningRate),
    run.autoBalance === false ? '--no-auto-balance' : '--auto-balance',
  ];

  const workerEnv = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
  };
  if (process.platform !== 'win32') {
    workerEnv.PYTORCH_ALLOC_CONF = 'expandable_segments:True';
  }
  if (caps?.cudaToolkitPath) {
    workerEnv.CUDA_PATH = caps.cudaToolkitPath;
    workerEnv.CUDA_HOME = caps.cudaToolkitPath;
    const binDir = path.join(caps.cudaToolkitPath, 'bin');
    workerEnv.PATH = `${binDir}${path.delimiter}${process.env.PATH || ''}`;
  }

  const child = spawn(pythonCmd, args, {
    cwd: ROOT_DIR,
    env: workerEnv,
  });

  activeProcesses.set(run.id, child);
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let ioQueue = Promise.resolve();

  const enqueueIo = (task) => {
    ioQueue = ioQueue.then(task, task);
    return ioQueue;
  };

  const processStdoutLines = async (lines) => {
    const parsedEvents = [];
    const plainLogs = [];

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('{')) {
        try {
          const event = JSON.parse(trimmed);
          if (event && typeof event.type === 'string') {
            parsedEvents.push(event);
            continue;
          }
        } catch {
          // fall through to plain log
        }
      }
      plainLogs.push(trimmed);
    }

    if (parsedEvents.length === 0 && plainLogs.length === 0) return;

    await updateRun(run.id, (current) => {
      let next = { ...current };
      for (const event of parsedEvents) {
        if (event.type === 'progress') {
          next = {
            ...next,
            progress: Math.min(100, Math.max(0, Number(event.progress ?? next.progress))),
            currentLoss:
              typeof event.loss === 'number' ? Number(event.loss.toFixed(4)) : next.currentLoss,
            lossHistory:
              typeof event.loss === 'number'
                ? [
                    ...(next.lossHistory || []),
                    { step: Number(event.step ?? 0), loss: Number(event.loss.toFixed(4)) },
                  ].slice(-100)
                : next.lossHistory,
            status: Number(event.progress) >= 100 ? 'completed' : next.status,
          };
        } else if (event.type === 'error') {
          next = {
            ...next,
            status: 'failed',
            error: event.message || 'Training failed',
            logs: [...(next.logs || []), `ERROR: ${event.message}`].slice(-120),
          };
        } else if (event.type === 'complete') {
          next = {
            ...next,
            progress: 100,
            status: 'completed',
            outputDir,
            logs: [...(next.logs || []), `Completed: ${outputDir}`].slice(-120),
          };
        }
      }
      if (plainLogs.length > 0) {
        next = {
          ...next,
          logs: [...(next.logs || []), ...plainLogs].slice(-120),
        };
      }
      return next;
    });
  };

  const processStderrLines = async (lines) => {
    const cleaned = [];
    for (const rawLine of lines) {
      const segments = rawLine.split('\r');
      const lastNonEmpty = [...segments].reverse().find((s) => s.trim().length > 0);
      if (lastNonEmpty && lastNonEmpty.trim()) {
        cleaned.push(lastNonEmpty.trim());
      }
    }
    if (cleaned.length === 0) return;
    await updateRun(run.id, (current) => ({
      ...current,
      logs: [...(current.logs || []), ...cleaned].slice(-120),
    }));
  };

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? '';
    if (lines.length > 0) {
      void enqueueIo(() => processStdoutLines(lines));
    }
  });

  child.stderr.on('data', (chunk) => {
    stderrBuffer += chunk.toString();
    const lines = stderrBuffer.split(/\r?\n/);
    stderrBuffer = lines.pop() ?? '';
    if (lines.length > 0) {
      void enqueueIo(() => processStderrLines(lines));
    }
  });

  child.on('error', (err) => {
    activeProcesses.delete(run.id);
    void enqueueIo(() =>
      updateRun(run.id, (current) => ({
        ...current,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        logs: [...(current.logs || []), `ERROR: ${err instanceof Error ? err.message : String(err)}`].slice(-120),
      }))
    );
  });

  child.on('close', async (code) => {
    if (stdoutBuffer.trim()) {
      const remainingStdout = [stdoutBuffer];
      stdoutBuffer = '';
      void enqueueIo(() => processStdoutLines(remainingStdout));
    }
    if (stderrBuffer.trim()) {
      const remainingStderr = [stderrBuffer];
      stderrBuffer = '';
      void enqueueIo(() => processStderrLines(remainingStderr));
    }
    await ioQueue;
    activeProcesses.delete(run.id);
    await updateRun(run.id, (current) => {
      if (current.status === 'completed' || current.status === 'failed' || current.status === 'paused') {
        return current;
      }
      if (code === 0) {
        return { ...current, progress: 100, status: 'completed', outputDir };
      }
      return {
        ...current,
        status: 'failed',
        error: current.error || `Worker exited with code ${code}`,
      };
    });
  });
}

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', async (_req, res) => {
  const pythonCommand = await resolvePythonCommand();
  res.json({ ok: true, modelHubUrl: MODEL_HUB_URL, pythonCommand });
});

app.get('/api/hub/models', async (req, res) => {
  try {
    const data = await fetchModelHub();
    const query = String(req.query.q || '').trim().toLowerCase();
    const format = String(req.query.format || '').trim().toLowerCase();

    let models = await enrichAndDeduplicateHubModels(
      Array.isArray(data.models) ? data.models : []
    );
    if (format && format !== 'all') {
      if (format === 'trainable') {
        models = models.filter((m) => Boolean(m.trainable));
      } else {
        models = models.filter((m) => String(m.format || m.type || '').toLowerCase() === format);
      }
    }
    if (query) {
      models = models.filter(
        (m) =>
          String(m.name || '').toLowerCase().includes(query) ||
          String(m.architecture || '').toLowerCase().includes(query) ||
          String(m.category || '').toLowerCase().includes(query) ||
          String(m.path || '').toLowerCase().includes(query)
      );
    }

    res.json({
      connected: true,
      hubUrl: MODEL_HUB_URL,
      models,
      totalCount: data.total_count ?? models.length,
      totalSizeFormatted: data.total_size_formatted ?? '0 B',
      lastScanned: data.last_scanned ?? null,
      scannedPaths: data.scanned_paths ?? [],
    });
  } catch (error) {
    res.json({
      connected: false,
      hubUrl: MODEL_HUB_URL,
      error: error instanceof Error ? error.message : 'Unable to reach Model Hub',
      models: [],
      totalCount: 0,
      totalSizeFormatted: '0 B',
      lastScanned: null,
      scannedPaths: [],
    });
  }
});

app.get('/api/environment', async (_req, res) => {
  const pythonCommand = await resolvePythonCommand();
  const [gpu, python, hubStatus] = await Promise.all([
    getGpuTelemetry(),
    getPythonCapabilities(pythonCommand),
    fetchModelHub()
      .then((data) => ({
        connected: true,
        modelCount: data.total_count ?? data.models?.length ?? 0,
        totalSizeFormatted: data.total_size_formatted ?? '0 B',
      }))
      .catch(() => ({ connected: false, modelCount: 0, totalSizeFormatted: '0 B' })),
  ]);

  const trainingReady = Boolean(
    python.cudaAvailable &&
      python.packages?.torch &&
      python.packages?.transformers &&
      python.packages?.peft &&
      python.packages?.trl
  );

  res.json({
    agentConnected: true,
    gpu,
    pythonCommand,
    python,
    trainingReady,
    hub: hubStatus,
  });
});

app.post('/api/environment/setup', async (_req, res) => {
  try {
    const bestCmd = await resolvePythonCommand(true);
    let caps = await getPythonCapabilities(bestCmd);

    if (caps.cudaAvailable) {
      const missing = ['transformers', 'peft', 'trl', 'datasets', 'accelerate', 'bitsandbytes'].filter(
        (pkg) => !caps.packages?.[pkg]
      );
      if (missing.length > 0) {
        await execFileAsync(bestCmd, ['-m', 'pip', 'install', ...missing], {
          timeout: 300_000,
        });
        caps = await getPythonCapabilities(bestCmd);
      }
      if (caps.cudaToolkitPath) {
        process.env.CUDA_PATH = caps.cudaToolkitPath;
        process.env.CUDA_HOME = caps.cudaToolkitPath;
      }
      const cudaLabel = caps.cudaVersion ? `CUDA ${caps.cudaVersion}` : 'CUDA ready';
      const toolkitLabel = caps.tritonCudaReady ? ' · Triton toolkit wired' : '';
      res.json({
        ok: true,
        pythonCommand: bestCmd,
        python: caps,
        message: `Using ${bestCmd} (Python ${caps.pythonVersion}, ${cudaLabel}${toolkitLabel})`,
      });
      return;
    }

    // No CUDA Python found: create Python 3.12 .venv and install CUDA PyTorch + requirements
    const py312 = 'C:\\Python312\\python.exe';
    const basePy = await fs
      .access(py312)
      .then(() => py312)
      .catch(() => 'python');
    const venvDir = path.join(ROOT_DIR, '.venv');
    await fs.rm(venvDir, { recursive: true, force: true }).catch(() => {});
    await execFileAsync(basePy, ['-m', 'venv', venvDir], { timeout: 60_000 });
    const venvPy = path.join(venvDir, 'Scripts', 'python.exe');
    await execFileAsync(
      venvPy,
      ['-m', 'pip', 'install', '--index-url', 'https://download.pytorch.org/whl/cu126', 'torch'],
      { timeout: 600_000 }
    );
    await execFileAsync(
      venvPy,
      ['-m', 'pip', 'install', '-r', path.join(__dirname, 'requirements.txt')],
      { timeout: 600_000 }
    );
    cachedPythonCommand = venvPy;
    caps = await getPythonCapabilities(venvPy);
    if (caps.cudaToolkitPath) {
      process.env.CUDA_PATH = caps.cudaToolkitPath;
      process.env.CUDA_HOME = caps.cudaToolkitPath;
    }
    res.json({
      ok: Boolean(caps.cudaAvailable),
      pythonCommand: venvPy,
      python: caps,
      message: caps.cudaAvailable
        ? `Installed CUDA ${caps.cudaVersion || ''} PyTorch in ${venvPy}`.trim()
        : 'Installed packages, but CUDA is still unavailable',
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get('/api/datasets', async (_req, res) => {
  const datasets = await readJson(DATASETS_INDEX_PATH, []);
  res.json({ datasets });
});

app.post('/api/datasets', async (req, res) => {
  const { name, kind, examples, size, content } = req.body || {};
  if (!name || !kind) {
    res.status(400).json({ error: 'name and kind are required' });
    return;
  }

  const id = crypto.randomUUID();
  const ext = kind === 'Screen' ? 'json' : 'jsonl';
  let filePath;
  if (typeof content === 'string' && content.length > 0) {
    filePath = path.join(DATASETS_DIR, `${id}.${ext}`);
    await fs.writeFile(filePath, content, 'utf8');
  }

  const dataset = {
    id,
    name: String(name),
    kind,
    examples: Number(examples || 1),
    size: String(size || '0 KB'),
    content: typeof content === 'string' && content.length <= 200_000 ? content : undefined,
    filePath,
    created: new Date().toISOString().slice(0, 10),
  };

  await withFileLock(DATASETS_INDEX_PATH, async () => {
    const datasets = await readJson(DATASETS_INDEX_PATH, []);
    await writeJson(DATASETS_INDEX_PATH, [dataset, ...datasets]);
  });
  res.status(201).json({ dataset });
});

app.delete('/api/datasets/:id', async (req, res) => {
  await withFileLock(DATASETS_INDEX_PATH, async () => {
    const datasets = await readJson(DATASETS_INDEX_PATH, []);
    const target = datasets.find((d) => d.id === req.params.id);
    if (target?.filePath) {
      await fs.rm(target.filePath, { force: true }).catch(() => {});
    }
    await writeJson(
      DATASETS_INDEX_PATH,
      datasets.filter((d) => d.id !== req.params.id)
    );
  });
  res.json({ ok: true });
});

app.get('/api/datasets/:id/download', async (req, res) => {
  const datasets = await readJson(DATASETS_INDEX_PATH, []);
  const target = datasets.find((d) => d.id === req.params.id);
  if (!target) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }
  let content = target.content;
  if (!content && target.filePath) {
    content = await fs.readFile(target.filePath, 'utf8').catch(() => '');
  }
  if (!content) {
    res.status(404).json({ error: 'No stored content for sample dataset' });
    return;
  }
  res.type('text/plain').send(content);
});

app.get('/api/runs', async (_req, res) => {
  const runs = await readJson(RUNS_INDEX_PATH, []);
  res.json({ runs });
});

app.post('/api/runs', async (req, res) => {
  const {
    name,
    model,
    modelId,
    modelPath,
    method,
    dataset,
    epochs,
    rank,
    learningRate,
    autoBalance,
  } = req.body || {};

  if (!name || !model || !dataset) {
    res.status(400).json({ error: 'name, model, and dataset are required' });
    return;
  }

  const run = {
    id: crypto.randomUUID(),
    name: String(name),
    model: String(model),
    modelId: modelId ? String(modelId) : undefined,
    modelPath: modelPath ? String(modelPath) : undefined,
    method: method || 'QLoRA',
    dataset: String(dataset),
    epochs: Number(epochs || 3),
    rank: Number(rank || 16),
    learningRate: String(learningRate || '0.0002'),
    autoBalance: autoBalance !== false,
    progress: 0,
    status: 'running',
    lossHistory: [],
    logs: [`Queued training run against ${modelPath || model}`],
    created: new Date().toISOString().slice(0, 10),
  };

  await withFileLock(RUNS_INDEX_PATH, async () => {
    const runs = await readJson(RUNS_INDEX_PATH, []);
    await writeJson(RUNS_INDEX_PATH, [run, ...runs]);
  });

  void startWorkerForRun(run);
  res.status(201).json({ run });
});

app.post('/api/runs/:id/toggle', async (req, res) => {
  const target = await withFileLock(RUNS_INDEX_PATH, async () => {
    const runs = await readJson(RUNS_INDEX_PATH, []);
    return runs.find((r) => r.id === req.params.id) || null;
  });
  if (!target) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  if (target.status === 'completed') {
    res.json({ run: target });
    return;
  }

  if (target.status === 'running') {
    await killRunWorker(target.id);
    const updated = await updateRun(target.id, (r) => ({
      ...r,
      status: 'paused',
      logs: [...(r.logs || []).slice(-120), 'Paused by user'],
    }));
    res.json({ run: updated });
    return;
  }

  const updated = await updateRun(target.id, (r) => ({
    ...r,
    status: 'running',
    error: undefined,
    logs: [...(r.logs || []).slice(-120), 'Resuming training worker...'],
  }));
  if (updated) {
    void startWorkerForRun(updated);
  }
  res.json({ run: updated });
});

app.delete('/api/runs/:id', async (req, res) => {
  await killRunWorker(req.params.id);
  await withFileLock(RUNS_INDEX_PATH, async () => {
    const runs = await readJson(RUNS_INDEX_PATH, []);
    await writeJson(
      RUNS_INDEX_PATH,
      runs.filter((r) => r.id !== req.params.id)
    );
  });
  await withFileLock(TRAINED_MODELS_INDEX_PATH, async () => {
    const registry = await readJson(TRAINED_MODELS_INDEX_PATH, {});
    if (registry && typeof registry === 'object' && req.params.id in registry) {
      delete registry[req.params.id];
      await writeJson(TRAINED_MODELS_INDEX_PATH, registry);
    }
  });
  await fs.rm(path.join(RUNS_DIR, req.params.id), { recursive: true, force: true }).catch(() => {});
  res.json({ ok: true });
});

async function getDirectorySizeBytes(dirPath) {
  let total = 0;
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySizeBytes(full);
    } else if (entry.isFile()) {
      const stat = await fs.stat(full).catch(() => null);
      if (stat) total += stat.size;
    }
  }
  return total;
}

async function discoverWorkspaceApps() {
  const apps = [
    {
      id: 'service:model-hub',
      name: 'Model Hub',
      targetType: 'service',
      port: 8899,
      processName: 'python',
      pathOrCommand: MODEL_HUB_URL,
      source: 'local-service',
    },
  ];

  const entries = await fs.readdir(WORKSPACE_PROJECTS_DIR, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const projectDir = path.join(WORKSPACE_PROJECTS_DIR, entry.name);
    const pkg = await readJson(path.join(projectDir, 'package.json'), null).catch(() => null);
    let port;
    if (entry.name === 'Froge_Trainer') {
      port = 8080;
    } else if (pkg?.scripts && typeof pkg.scripts === 'object') {
      const scriptText = JSON.stringify(pkg.scripts);
      const portMatch = scriptText.match(/--port[= ](\d{4,5})|PORT=(\d{4,5})/);
      if (portMatch) {
        port = Number(portMatch[1] || portMatch[2]);
      }
    }
    apps.push({
      id: `workspace:${entry.name}`,
      name: pkg?.name && pkg.name !== 'vite_react_shadcn_ts' ? entry.name : entry.name,
      targetType: 'app',
      port,
      processName: pkg ? 'node' : 'python',
      pathOrCommand: projectDir,
      source: 'workspace',
    });
  }

  return apps;
}

let cachedLiveSnapshot = { fetchedAt: 0, ports: [], processes: [] };

async function getLiveRuntimeSnapshot(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && now - cachedLiveSnapshot.fetchedAt < 4000) {
    return cachedLiveSnapshot;
  }

  try {
    const psScript = [
      '$ports = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess',
      '$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Select-Object ProcessId, Name, CommandLine, WorkingSetSize',
      '[PSCustomObject]@{ ports = @($ports); processes = @($procs) } | ConvertTo-Json -Depth 3 -Compress',
    ].join('; ');

    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-Command', psScript],
      { timeout: 4000, maxBuffer: 8 * 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout.trim() || '{}');
    const ports = Array.isArray(parsed.ports) ? parsed.ports : parsed.ports ? [parsed.ports] : [];
    const processes = Array.isArray(parsed.processes)
      ? parsed.processes
      : parsed.processes
        ? [parsed.processes]
        : [];

    cachedLiveSnapshot = { fetchedAt: now, ports, processes };
    return cachedLiveSnapshot;
  } catch {
    return { fetchedAt: now, ports: [], processes: [] };
  }
}

function resolveAssignmentLiveState(assignment, liveSnapshot) {
  const port = assignment.port ? Number(assignment.port) : null;
  const procQuery = String(assignment.processName || '').trim().toLowerCase();
  const pathQuery = String(assignment.pathOrCommand || '').trim().toLowerCase();
  const appQuery = String(assignment.appName || '').trim().toLowerCase();

  let matchedPortConn = null;
  if (port) {
    matchedPortConn = liveSnapshot.ports.find((c) => Number(c.LocalPort) === port) || null;
  }

  let matchedProc = null;
  if (matchedPortConn?.OwningProcess) {
    matchedProc =
      liveSnapshot.processes.find(
        (p) => Number(p.ProcessId) === Number(matchedPortConn.OwningProcess)
      ) || null;
  }

  if (!matchedProc && pathQuery) {
    matchedProc =
      liveSnapshot.processes.find((p) =>
        String(p.CommandLine || '').toLowerCase().includes(pathQuery)
      ) || null;
  }

  if (!matchedProc && procQuery && procQuery !== 'node' && procQuery !== 'python') {
    matchedProc =
      liveSnapshot.processes.find(
        (p) =>
          String(p.Name || '').toLowerCase().includes(procQuery) ||
          String(p.CommandLine || '').toLowerCase().includes(procQuery)
      ) || null;
  }

  if (!matchedProc && !port && appQuery.length >= 3) {
    matchedProc =
      liveSnapshot.processes.find((p) =>
        String(p.CommandLine || '').toLowerCase().includes(appQuery)
      ) || null;
  }

  const matchedPid = matchedProc?.ProcessId || matchedPortConn?.OwningProcess || null;
  const listeningPorts = matchedPid
    ? liveSnapshot.ports
        .filter((c) => Number(c.OwningProcess) === Number(matchedPid))
        .map((c) => Number(c.LocalPort))
    : port && matchedPortConn
      ? [port]
      : [];

  const memoryMb = matchedProc?.WorkingSetSize
    ? Math.round(Number(matchedProc.WorkingSetSize) / (1024 * 1024))
    : undefined;

  return {
    ...assignment,
    liveStatus: matchedPid ? 'online' : 'offline',
    matchedPid: matchedPid ? Number(matchedPid) : undefined,
    matchedProcess: matchedProc?.Name || undefined,
    listeningPorts,
    memoryMb,
  };
}

function buildDefaultRegistryEntry(run, adapterConfig, modelName) {
  const tags = [run.method];
  if (adapterConfig?.peft_type) tags.push(String(adapterConfig.peft_type));
  if (adapterConfig?.task_type) tags.push(String(adapterConfig.task_type));

  return {
    id: run.id,
    displayName: run.name || `${modelName.split('/').pop() || 'Trained'} adapter`,
    availability: 'available',
    notes: '',
    tags: Array.from(new Set(tags.filter(Boolean))),
    assignments: [],
    telemetryLog: [
      {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        event: 'model_registered',
        message: `Trained adapter registered (${run.method}, rank ${adapterConfig?.r ?? run.rank})`,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

async function inspectTrainedModel(run, registryEntry, liveSnapshot) {
  const outputDir = run.outputDir || path.join(RUNS_DIR, run.id, 'output');
  const adapterConfig = await readJson(path.join(outputDir, 'adapter_config.json'), {}).catch(() => ({}));
  const trainerState = await findLatestTrainerState(outputDir);

  const baseModelPath = adapterConfig?.base_model_name_or_path || run.modelPath || '';
  const baseConfig = baseModelPath
    ? await readJson(path.join(baseModelPath, 'config.json'), null).catch(() => null)
    : null;

  const outputEntries = await fs.readdir(outputDir, { withFileTypes: true }).catch(() => []);
  const files = [];
  const checkpoints = [];
  let totalArtifactBytes = 0;
  let adapterBytes = 0;

  for (const entry of outputEntries) {
    const full = path.join(outputDir, entry.name);
    if (entry.isFile()) {
      const stat = await fs.stat(full).catch(() => null);
      if (stat) {
        totalArtifactBytes += stat.size;
        if (entry.name === 'adapter_model.safetensors') {
          adapterBytes = stat.size;
        }
        files.push({
          name: entry.name,
          sizeBytes: stat.size,
          sizeFormatted: formatBytes(stat.size),
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    } else if (entry.isDirectory() && /^checkpoint-\d+$/.test(entry.name)) {
      const step = Number(entry.name.replace('checkpoint-', ''));
      const sizeBytes = await getDirectorySizeBytes(full);
      const cpState = await readJson(path.join(full, 'trainer_state.json'), null).catch(() => null);
      const stat = await fs.stat(full).catch(() => null);
      totalArtifactBytes += sizeBytes;
      checkpoints.push({
        name: entry.name,
        step,
        epoch: typeof cpState?.epoch === 'number' ? Number(cpState.epoch.toFixed(2)) : undefined,
        sizeBytes,
        sizeFormatted: formatBytes(sizeBytes),
        modifiedAt: stat ? stat.mtime.toISOString() : undefined,
      });
    }
  }

  checkpoints.sort((a, b) => a.step - b.step);
  files.sort((a, b) => b.sizeBytes - a.sizeBytes);

  const logHistory = Array.isArray(trainerState?.log_history) ? trainerState.log_history : [];
  const telemetrySeries =
    logHistory.length > 0
      ? logHistory
          .filter((entry) => typeof entry?.step === 'number' || typeof entry?.loss === 'number')
          .map((entry) => ({
            step: Number(entry.step ?? 0),
            epoch: typeof entry.epoch === 'number' ? Number(entry.epoch.toFixed(3)) : undefined,
            loss: typeof entry.loss === 'number' ? Number(entry.loss.toFixed(4)) : undefined,
            learningRate:
              typeof entry.learning_rate === 'number' ? Number(entry.learning_rate) : undefined,
            gradNorm:
              typeof entry.grad_norm === 'number' ? Number(entry.grad_norm.toFixed(4)) : undefined,
            entropy:
              typeof entry.entropy === 'number' ? Number(entry.entropy.toFixed(4)) : undefined,
            meanTokenAccuracy:
              typeof entry.mean_token_accuracy === 'number'
                ? Number((entry.mean_token_accuracy * 100).toFixed(2))
                : undefined,
            numTokens: typeof entry.num_tokens === 'number' ? Number(entry.num_tokens) : undefined,
          }))
      : (run.lossHistory || []).map((pt) => ({
          step: pt.step,
          loss: pt.loss,
        }));

  const lossPoints = telemetrySeries.filter((p) => typeof p.loss === 'number');
  const accPoints = telemetrySeries.filter((p) => typeof p.meanTokenAccuracy === 'number');
  const lastPoint = telemetrySeries[telemetrySeries.length - 1];
  const bestLossPoint = lossPoints.reduce(
    (best, cur) => (!best || cur.loss < best.loss ? cur : best),
    null
  );
  const bestAccPoint = accPoints.reduce(
    (best, cur) => (!best || cur.meanTokenAccuracy > best.meanTokenAccuracy ? cur : best),
    null
  );

  const hasChatTemplate = files.some((f) => f.name === 'chat_template.jinja');
  const hasTokenizer = files.some((f) => f.name === 'tokenizer.json' || f.name === 'tokenizer_config.json');
  const adapterReady = adapterBytes > 0;

  const modelLower = `${run.model} ${baseModelPath}`.toLowerCase();
  const archName = Array.isArray(baseConfig?.architectures)
    ? baseConfig.architectures[0]
    : baseConfig?.model_type || 'CausalLM';
  const archetype = /orpheus|tts|speech|audio/.test(modelLower)
    ? 'Audio / Speech Causal LM'
    : /conditionalgeneration/i.test(String(archName)) || baseConfig?.vision_config
      ? 'Multimodal / Vision-Language'
      : 'Text Causal LM';

  const capabilities = [];
  if (adapterConfig?.peft_type) capabilities.push(`${adapterConfig.peft_type} Adapter`);
  capabilities.push(run.method === 'QLoRA' ? '4-bit NF4 QLoRA' : run.method);
  if (hasChatTemplate) capabilities.push('Chat Template');
  if (hasTokenizer) capabilities.push('Bundled Tokenizer');
  if (checkpoints.length > 0) capabilities.push(`${checkpoints.length} Checkpoints`);

  const metricsWidgets = [];
  if (lossPoints.length > 0) {
    metricsWidgets.push({
      id: 'loss',
      title: 'Training loss convergence',
      subtitle: bestLossPoint
        ? `Best ${bestLossPoint.loss.toFixed(4)} at step ${bestLossPoint.step}`
        : 'Step loss',
      dataKey: 'loss',
      unit: '',
      colorToken: 'primary',
    });
  }
  if (accPoints.length > 0) {
    metricsWidgets.push({
      id: 'accuracy',
      title: 'Mean token accuracy',
      subtitle: bestAccPoint
        ? `Peak ${bestAccPoint.meanTokenAccuracy.toFixed(1)}% at step ${bestAccPoint.step}`
        : 'Token prediction accuracy',
      dataKey: 'meanTokenAccuracy',
      unit: '%',
      colorToken: 'chart',
    });
  }
  if (telemetrySeries.some((p) => typeof p.entropy === 'number')) {
    metricsWidgets.push({
      id: 'entropy',
      title: 'Output token entropy',
      subtitle: 'Model distribution certainty over steps',
      dataKey: 'entropy',
      unit: '',
      colorToken: 'primary',
    });
  }
  if (telemetrySeries.some((p) => typeof p.gradNorm === 'number')) {
    metricsWidgets.push({
      id: 'gradNorm',
      title: 'Gradient norm stability',
      subtitle: 'Per-step gradient L2 norm',
      dataKey: 'gradNorm',
      unit: '',
      colorToken: 'chart',
    });
  }

  const effectiveRegistry =
    registryEntry || buildDefaultRegistryEntry(run, adapterConfig, run.model);
  const rawAssignments = Array.isArray(effectiveRegistry.assignments)
    ? effectiveRegistry.assignments
    : [];
  const assignments = rawAssignments.map((a) => resolveAssignmentLiveState(a, liveSnapshot));

  const assignedCount = assignments.filter((a) => a.status === 'assigned').length;
  const availableTargetCount = assignments.filter((a) => a.status === 'available').length;
  const onlineTargetCount = assignments.filter(
    (a) => a.status !== 'disabled' && a.liveStatus === 'online'
  ).length;

  const kpis = [
    {
      id: 'loss',
      label: 'Final / Best loss',
      value:
        typeof lastPoint?.loss === 'number'
          ? lastPoint.loss.toFixed(3)
          : typeof run.currentLoss === 'number'
            ? run.currentLoss.toFixed(3)
            : '—',
      detail: bestLossPoint ? `Best ${bestLossPoint.loss.toFixed(3)} · step ${bestLossPoint.step}` : 'No step loss logged',
    },
    ...(accPoints.length > 0
      ? [
          {
            id: 'accuracy',
            label: 'Token accuracy',
            value: `${(lastPoint?.meanTokenAccuracy ?? bestAccPoint?.meanTokenAccuracy ?? 0).toFixed(1)}%`,
            detail: bestAccPoint ? `Peak ${bestAccPoint.meanTokenAccuracy.toFixed(1)}%` : 'Mean token accuracy',
          },
        ]
      : []),
    {
      id: 'steps',
      label: 'Training budget',
      value: `${trainerState?.global_step ?? telemetrySeries.length} steps`,
      detail: `${trainerState?.num_train_epochs ?? run.epochs} epochs · rank ${adapterConfig?.r ?? run.rank}`,
    },
    {
      id: 'footprint',
      label: 'Adapter footprint',
      value: formatBytes(adapterBytes),
      detail: `${formatBytes(totalArtifactBytes)} total (${checkpoints.length} ckpts)`,
    },
    {
      id: 'assignments',
      label: 'App & process targets',
      value: `${assignedCount} assigned`,
      detail: `${availableTargetCount} available · ${onlineTargetCount} live online`,
    },
  ];

  const escapedBase = (baseModelPath || run.model).replace(/\\/g, '\\\\');
  const escapedAdapter = outputDir.replace(/\\/g, '\\\\');
  const pythonSnippet = [
    'from transformers import AutoModelForCausalLM, AutoTokenizer',
    'from peft import PeftModel',
    '',
    `base_model = "${escapedBase}"`,
    `adapter_dir = "${escapedAdapter}"`,
    '',
    'tokenizer = AutoTokenizer.from_pretrained(adapter_dir)',
    'model = AutoModelForCausalLM.from_pretrained(base_model, device_map="auto")',
    'model = PeftModel.from_pretrained(model, adapter_dir)',
  ].join('\n');

  const jsonDescriptor = JSON.stringify(
    {
      id: run.id,
      name: effectiveRegistry.displayName,
      availability: effectiveRegistry.availability,
      base_model: run.model,
      base_model_path: baseModelPath || undefined,
      adapter_path: outputDir,
      method: run.method,
      rank: adapterConfig?.r ?? run.rank,
      lora_alpha: adapterConfig?.lora_alpha ?? run.rank * 2,
      target_modules: adapterConfig?.target_modules ?? [],
      assignments: assignments.map((a) => ({
        app: a.appName,
        process: a.processName,
        status: a.status,
        port: a.port,
        liveStatus: a.liveStatus,
      })),
    },
    null,
    2
  );

  return {
    id: run.id,
    displayName: effectiveRegistry.displayName,
    runName: run.name,
    baseModel: run.model,
    baseModelPath: baseModelPath || undefined,
    outputDir,
    adapterReady,
    adapterBytes,
    adapterSizeFormatted: formatBytes(adapterBytes),
    totalArtifactBytes,
    totalArtifactSizeFormatted: formatBytes(totalArtifactBytes),
    method: run.method,
    dataset: run.dataset,
    epochs: Number(trainerState?.num_train_epochs ?? run.epochs),
    rank: Number(adapterConfig?.r ?? run.rank),
    loraAlpha: Number(adapterConfig?.lora_alpha ?? run.rank * 2),
    targetModules: Array.isArray(adapterConfig?.target_modules) ? adapterConfig.target_modules : [],
    learningRate: run.learningRate,
    created: run.created,
    availability: effectiveRegistry.availability || 'available',
    notes: effectiveRegistry.notes || '',
    tags: effectiveRegistry.tags || [],
    assignments,
    telemetryLog: (effectiveRegistry.telemetryLog || []).slice(-60),
    updatedAt: effectiveRegistry.updatedAt || run.created,
    architecture: {
      archetype,
      architectureName: archName,
      modelType: baseConfig?.model_type || undefined,
      hiddenSize: baseConfig?.hidden_size || undefined,
      numLayers: baseConfig?.num_hidden_layers || undefined,
      numHeads: baseConfig?.num_attention_heads || undefined,
      vocabSize: baseConfig?.vocab_size || undefined,
      maxPositionEmbeddings: baseConfig?.max_position_embeddings || undefined,
      torchDtype: baseConfig?.torch_dtype || undefined,
      hasChatTemplate,
      hasTokenizer,
    },
    telemetrySummary: {
      totalSteps: Number(trainerState?.global_step ?? telemetrySeries.length),
      maxSteps: Number(trainerState?.max_steps ?? telemetrySeries.length),
      epochsCompleted: Number(trainerState?.epoch ?? run.epochs),
      finalLoss: lastPoint?.loss,
      bestLoss: bestLossPoint?.loss,
      bestLossStep: bestLossPoint?.step,
      finalAccuracy: lastPoint?.meanTokenAccuracy,
      bestAccuracy: bestAccPoint?.meanTokenAccuracy,
      finalEntropy: lastPoint?.entropy,
      finalGradNorm: lastPoint?.gradNorm,
      totalTokensProcessed: lastPoint?.numTokens,
      totalFlos: typeof trainerState?.total_flos === 'number' ? trainerState.total_flos : undefined,
    },
    telemetrySeries,
    checkpoints,
    files,
    dashboardSpec: {
      archetype,
      capabilities,
      kpis,
      metricsWidgets,
      pythonSnippet,
      jsonDescriptor,
    },
  };
}

async function getReadyTrainedRuns() {
  const runs = await readJson(RUNS_INDEX_PATH, []);
  const ready = [];
  for (const run of runs) {
    if (run.status === 'completed') {
      ready.push(run);
      continue;
    }
    const outputDir = run.outputDir || path.join(RUNS_DIR, run.id, 'output');
    const hasAdapter = await fs
      .access(path.join(outputDir, 'adapter_model.safetensors'))
      .then(() => true)
      .catch(() => false);
    if (hasAdapter) {
      ready.push(run);
    }
  }
  return ready;
}

app.get('/api/trained-models', async (_req, res) => {
  const [readyRuns, registry, discoveredApps, liveSnapshot] = await Promise.all([
    getReadyTrainedRuns(),
    readJson(TRAINED_MODELS_INDEX_PATH, {}),
    discoverWorkspaceApps(),
    getLiveRuntimeSnapshot(),
  ]);

  const models = await Promise.all(
    readyRuns.map((run) => inspectTrainedModel(run, registry?.[run.id], liveSnapshot))
  );

  res.json({
    models,
    discoveredApps,
    liveProcessCount: liveSnapshot.processes.length,
    listeningPortCount: liveSnapshot.ports.length,
  });
});

app.get('/api/trained-models/:id', async (req, res) => {
  const [readyRuns, registry, discoveredApps, liveSnapshot, gpu] = await Promise.all([
    getReadyTrainedRuns(),
    readJson(TRAINED_MODELS_INDEX_PATH, {}),
    discoverWorkspaceApps(),
    getLiveRuntimeSnapshot(true),
    getGpuTelemetry(),
  ]);

  const run = readyRuns.find((r) => r.id === req.params.id);
  if (!run) {
    res.status(404).json({ error: 'Trained model not found' });
    return;
  }

  const model = await inspectTrainedModel(run, registry?.[run.id], liveSnapshot);
  res.json({
    model,
    discoveredApps,
    gpu,
    liveProcessCount: liveSnapshot.processes.length,
    listeningPortCount: liveSnapshot.ports.length,
  });
});

app.patch('/api/trained-models/:id', async (req, res) => {
  const readyRuns = await getReadyTrainedRuns();
  const run = readyRuns.find((r) => r.id === req.params.id);
  if (!run) {
    res.status(404).json({ error: 'Trained model not found' });
    return;
  }

  const outputDir = run.outputDir || path.join(RUNS_DIR, run.id, 'output');
  const adapterConfig = await readJson(path.join(outputDir, 'adapter_config.json'), {}).catch(() => ({}));
  const { displayName, availability, notes, tags } = req.body || {};

  await withFileLock(TRAINED_MODELS_INDEX_PATH, async () => {
    const registry = await readJson(TRAINED_MODELS_INDEX_PATH, {});
    const existing = registry?.[run.id] || buildDefaultRegistryEntry(run, adapterConfig, run.model);
    const changes = [];
    if (typeof availability === 'string' && availability !== existing.availability) {
      changes.push(`Availability -> ${availability}`);
    }
    if (typeof displayName === 'string' && displayName.trim() && displayName.trim() !== existing.displayName) {
      changes.push(`Renamed to "${displayName.trim()}"`);
    }

    const nextEntry = {
      ...existing,
      displayName:
        typeof displayName === 'string' && displayName.trim()
          ? displayName.trim()
          : existing.displayName,
      availability: ['available', 'assigned', 'archived'].includes(availability)
        ? availability
        : existing.availability,
      notes: typeof notes === 'string' ? notes : existing.notes,
      tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : existing.tags,
      telemetryLog:
        changes.length > 0
          ? [
              ...(existing.telemetryLog || []).slice(-59),
              {
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                event: 'model_updated',
                message: changes.join(' · '),
              },
            ]
          : existing.telemetryLog,
      updatedAt: new Date().toISOString(),
    };

    registry[run.id] = nextEntry;
    await writeJson(TRAINED_MODELS_INDEX_PATH, registry);
  });

  const [registry, liveSnapshot] = await Promise.all([
    readJson(TRAINED_MODELS_INDEX_PATH, {}),
    getLiveRuntimeSnapshot(),
  ]);
  const model = await inspectTrainedModel(run, registry?.[run.id], liveSnapshot);
  res.json({ model });
});

app.post('/api/trained-models/:id/assignments', async (req, res) => {
  const readyRuns = await getReadyTrainedRuns();
  const run = readyRuns.find((r) => r.id === req.params.id);
  if (!run) {
    res.status(404).json({ error: 'Trained model not found' });
    return;
  }

  const { appName, processName, targetType, status, port, pathOrCommand, endpoint, notes } =
    req.body || {};
  if (!appName || !String(appName).trim()) {
    res.status(400).json({ error: 'appName is required' });
    return;
  }

  const outputDir = run.outputDir || path.join(RUNS_DIR, run.id, 'output');
  const adapterConfig = await readJson(path.join(outputDir, 'adapter_config.json'), {}).catch(() => ({}));
  const normalizedStatus = ['assigned', 'available', 'disabled'].includes(status)
    ? status
    : 'assigned';

  await withFileLock(TRAINED_MODELS_INDEX_PATH, async () => {
    const registry = await readJson(TRAINED_MODELS_INDEX_PATH, {});
    const existing = registry?.[run.id] || buildDefaultRegistryEntry(run, adapterConfig, run.model);
    const assignment = {
      id: crypto.randomUUID(),
      appName: String(appName).trim(),
      processName: processName ? String(processName).trim() : '',
      targetType: ['app', 'process', 'service'].includes(targetType) ? targetType : 'app',
      status: normalizedStatus,
      port: port ? Number(port) : undefined,
      pathOrCommand: pathOrCommand ? String(pathOrCommand).trim() : '',
      endpoint: endpoint ? String(endpoint).trim() : '',
      notes: notes ? String(notes).trim() : '',
      updatedAt: new Date().toISOString(),
    };

    const nextAssignments = [assignment, ...(existing.assignments || [])];
    const hasAssigned = nextAssignments.some((a) => a.status === 'assigned');
    registry[run.id] = {
      ...existing,
      availability:
        existing.availability === 'archived'
          ? 'archived'
          : hasAssigned
            ? 'assigned'
            : 'available',
      assignments: nextAssignments,
      telemetryLog: [
        ...(existing.telemetryLog || []).slice(-59),
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          event: 'assignment_added',
          message: `Added ${assignment.appName} (${normalizedStatus}${assignment.port ? ` · :${assignment.port}` : ''})`,
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    await writeJson(TRAINED_MODELS_INDEX_PATH, registry);
  });

  const [registry, liveSnapshot] = await Promise.all([
    readJson(TRAINED_MODELS_INDEX_PATH, {}),
    getLiveRuntimeSnapshot(true),
  ]);
  const model = await inspectTrainedModel(run, registry?.[run.id], liveSnapshot);
  res.status(201).json({ model });
});

app.patch('/api/trained-models/:id/assignments/:assignmentId', async (req, res) => {
  const readyRuns = await getReadyTrainedRuns();
  const run = readyRuns.find((r) => r.id === req.params.id);
  if (!run) {
    res.status(404).json({ error: 'Trained model not found' });
    return;
  }

  const { status, port, processName, pathOrCommand, endpoint, notes } = req.body || {};
  let found = false;

  await withFileLock(TRAINED_MODELS_INDEX_PATH, async () => {
    const registry = await readJson(TRAINED_MODELS_INDEX_PATH, {});
    const existing = registry?.[run.id];
    if (!existing) return;

    let changedMsg = '';
    const nextAssignments = (existing.assignments || []).map((a) => {
      if (a.id !== req.params.assignmentId) return a;
      found = true;
      const nextStatus = ['assigned', 'available', 'disabled'].includes(status)
        ? status
        : a.status;
      changedMsg = `${a.appName} -> ${nextStatus}`;
      return {
        ...a,
        status: nextStatus,
        port: port !== undefined ? (port ? Number(port) : undefined) : a.port,
        processName: processName !== undefined ? String(processName).trim() : a.processName,
        pathOrCommand: pathOrCommand !== undefined ? String(pathOrCommand).trim() : a.pathOrCommand,
        endpoint: endpoint !== undefined ? String(endpoint).trim() : a.endpoint,
        notes: notes !== undefined ? String(notes).trim() : a.notes,
        updatedAt: new Date().toISOString(),
      };
    });

    if (!found) return;
    const hasAssigned = nextAssignments.some((a) => a.status === 'assigned');
    registry[run.id] = {
      ...existing,
      availability:
        existing.availability === 'archived'
          ? 'archived'
          : hasAssigned
            ? 'assigned'
            : 'available',
      assignments: nextAssignments,
      telemetryLog: [
        ...(existing.telemetryLog || []).slice(-59),
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          event: 'assignment_updated',
          message: changedMsg,
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    await writeJson(TRAINED_MODELS_INDEX_PATH, registry);
  });

  if (!found) {
    res.status(404).json({ error: 'Assignment not found' });
    return;
  }

  const [registry, liveSnapshot] = await Promise.all([
    readJson(TRAINED_MODELS_INDEX_PATH, {}),
    getLiveRuntimeSnapshot(true),
  ]);
  const model = await inspectTrainedModel(run, registry?.[run.id], liveSnapshot);
  res.json({ model });
});

app.delete('/api/trained-models/:id/assignments/:assignmentId', async (req, res) => {
  const readyRuns = await getReadyTrainedRuns();
  const run = readyRuns.find((r) => r.id === req.params.id);
  if (!run) {
    res.status(404).json({ error: 'Trained model not found' });
    return;
  }

  let removedName = '';
  await withFileLock(TRAINED_MODELS_INDEX_PATH, async () => {
    const registry = await readJson(TRAINED_MODELS_INDEX_PATH, {});
    const existing = registry?.[run.id];
    if (!existing) return;

    const target = (existing.assignments || []).find((a) => a.id === req.params.assignmentId);
    if (!target) return;
    removedName = target.appName;

    const nextAssignments = (existing.assignments || []).filter(
      (a) => a.id !== req.params.assignmentId
    );
    const hasAssigned = nextAssignments.some((a) => a.status === 'assigned');

    registry[run.id] = {
      ...existing,
      availability:
        existing.availability === 'archived'
          ? 'archived'
          : hasAssigned
            ? 'assigned'
            : 'available',
      assignments: nextAssignments,
      telemetryLog: [
        ...(existing.telemetryLog || []).slice(-59),
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          event: 'assignment_removed',
          message: `Removed assignment ${removedName}`,
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    await writeJson(TRAINED_MODELS_INDEX_PATH, registry);
  });

  const [registry, liveSnapshot] = await Promise.all([
    readJson(TRAINED_MODELS_INDEX_PATH, {}),
    getLiveRuntimeSnapshot(),
  ]);
  const model = await inspectTrainedModel(run, registry?.[run.id], liveSnapshot);
  res.json({ model });
});

app.post('/api/trained-models/:id/telemetry/ping', async (req, res) => {
  const readyRuns = await getReadyTrainedRuns();
  const run = readyRuns.find((r) => r.id === req.params.id);
  if (!run) {
    res.status(404).json({ error: 'Trained model not found' });
    return;
  }

  const outputDir = run.outputDir || path.join(RUNS_DIR, run.id, 'output');
  const adapterConfig = await readJson(path.join(outputDir, 'adapter_config.json'), {}).catch(() => ({}));
  const [liveSnapshot, gpu] = await Promise.all([
    getLiveRuntimeSnapshot(true),
    getGpuTelemetry(),
  ]);

  await withFileLock(TRAINED_MODELS_INDEX_PATH, async () => {
    const registry = await readJson(TRAINED_MODELS_INDEX_PATH, {});
    const existing = registry?.[run.id] || buildDefaultRegistryEntry(run, adapterConfig, run.model);
    const evaluated = (existing.assignments || []).map((a) =>
      resolveAssignmentLiveState(a, liveSnapshot)
    );
    const onlineCount = evaluated.filter((a) => a.liveStatus === 'online').length;
    const gpuSummary = gpu
      ? `GPU ${gpu.utilizationPct}% (${Math.round(gpu.freeMb / 1024)}GB free, ${gpu.temperatureC}°C)`
      : 'GPU telemetry unavailable';

    registry[run.id] = {
      ...existing,
      telemetryLog: [
        ...(existing.telemetryLog || []).slice(-59),
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          event: 'telemetry_probe',
          message: `Live probe: ${onlineCount}/${evaluated.length} targets online · ${gpuSummary}`,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    await writeJson(TRAINED_MODELS_INDEX_PATH, registry);
  });

  const registry = await readJson(TRAINED_MODELS_INDEX_PATH, {});
  const model = await inspectTrainedModel(run, registry?.[run.id], liveSnapshot);
  res.json({ model, gpu });
});

async function runBookSkillBridge(args) {
  const pythonCmd = await resolvePythonCommand();
  const bridgePath = path.join(__dirname, 'book_skill_bridge.py');
  const { stdout } = await execFileAsync(pythonCmd, [bridgePath, ...args], {
    timeout: 180_000,
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      BOOK_TO_SKILL_DIR,
      PYTHONIOENCODING: 'utf-8',
    },
  });
  return JSON.parse(stdout.trim());
}

async function discoverWorkspaceSkills() {
  const roots = [
    path.join(BOOK_TO_SKILL_DIR, '.agents', 'skills'),
    path.join(WORKSPACE_PROJECTS_DIR, 'MyViber', '.agents', 'skills'),
  ];
  const found = [];

  for (const root of roots) {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(root, entry.name);
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      const raw = await fs.readFile(skillMdPath, 'utf8').catch(() => '');
      if (!raw) continue;
      const nameMatch = raw.match(/^name:\s*(.+)$/m);
      const descMatch = raw.match(/^description:\s*(.+)$/m);
      const chaptersCount = await fs
        .readdir(path.join(skillDir, 'chapters'))
        .then((files) => files.filter((f) => f.endsWith('.md')).length)
        .catch(() => 0);

      found.push({
        id: `ws:${entry.name}`,
        slug: entry.name,
        name: (nameMatch?.[1] || entry.name).replace(/^["']|["']$/g, '').trim(),
        description: (descMatch?.[1] || '').replace(/^["']|["']$/g, '').trim(),
        skillDir,
        chaptersCount,
        sourceRoot: root,
      });
    }
  }
  return found;
}

app.get('/api/knowledge/status', async (_req, res) => {
  try {
    const [bridgeCheck, knowledgeSources, skills, workspaceSkills] = await Promise.all([
      runBookSkillBridge(['check']).catch((err) => ({
        available: false,
        rootDir: BOOK_TO_SKILL_DIR,
        error: err instanceof Error ? err.message : String(err),
        extractors: [],
      })),
      readJson(KNOWLEDGE_INDEX_PATH, []),
      readJson(SKILLS_INDEX_PATH, []),
      discoverWorkspaceSkills(),
    ]);

    res.json({
      bookToSkill: bridgeCheck,
      knowledgeSources,
      skills,
      workspaceSkills,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post('/api/knowledge/ingest', async (req, res) => {
  try {
    const { name, mode, localPaths, rawText, uploadedFiles } = req.body || {};
    const id = crypto.randomUUID();
    const sourceDir = path.join(KNOWLEDGE_DIR, id);
    const rawDir = path.join(sourceDir, 'raw');
    await fs.mkdir(rawDir, { recursive: true });

    const inputTargets = [];
    if (Array.isArray(localPaths)) {
      for (const p of localPaths) {
        const trimmed = String(p || '').trim();
        if (trimmed) inputTargets.push(trimmed);
      }
    }

    if (Array.isArray(uploadedFiles)) {
      for (const file of uploadedFiles) {
        if (!file?.name || !file?.contentBase64) continue;
        const safeName = path.basename(String(file.name)).replace(/[<>:"/\\|?*]/g, '_');
        const destPath = path.join(rawDir, safeName);
        const buf = Buffer.from(String(file.contentBase64), 'base64');
        await fs.writeFile(destPath, buf);
        inputTargets.push(destPath);
      }
    }

    if (typeof rawText === 'string' && rawText.trim().length > 0) {
      const textFile = path.join(rawDir, `${(name || 'notes').replace(/[^a-z0-9_-]/gi, '_')}.md`);
      await fs.writeFile(textFile, rawText, 'utf8');
      inputTargets.push(textFile);
    }

    if (inputTargets.length === 0) {
      await fs.rm(sourceDir, { recursive: true, force: true }).catch(() => {});
      res.status(400).json({ error: 'Provide a file upload, local file/folder path, or pasted text.' });
      return;
    }

    const extractMode = mode === 'technical' ? 'technical' : 'text';
    const meta = await runBookSkillBridge([
      'extract',
      '--inputs',
      ...inputTargets,
      '--mode',
      extractMode,
      '--name',
      String(name || '').trim(),
      '--output-dir',
      sourceDir,
    ]);

    const record = {
      id,
      name: String(name || meta.name || 'Knowledge bundle').trim(),
      mode: extractMode,
      sourceDir,
      totalSources: meta.totalSources,
      words: meta.words,
      chars: meta.chars,
      estimatedTokens: meta.estimatedTokens,
      chaptersDetected: meta.chaptersDetected,
      hasToc: meta.hasToc,
      invisibleRemoved: meta.invisibleRemoved,
      securityFindings: meta.securityFindings || [],
      glossaryCount: meta.glossaryCount || 0,
      patternCount: meta.patternCount || 0,
      sources: meta.sources || [],
      sectionsPreview: meta.sectionsPreview || [],
      glossaryPreview: meta.glossaryPreview || [],
      patternsPreview: meta.patternsPreview || [],
      created: new Date().toISOString().slice(0, 10),
    };

    await withFileLock(KNOWLEDGE_INDEX_PATH, async () => {
      const existing = await readJson(KNOWLEDGE_INDEX_PATH, []);
      await writeJson(KNOWLEDGE_INDEX_PATH, [record, ...existing]);
    });

    res.status(201).json({ knowledge: record });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.delete('/api/knowledge/:id', async (req, res) => {
  await withFileLock(KNOWLEDGE_INDEX_PATH, async () => {
    const items = await readJson(KNOWLEDGE_INDEX_PATH, []);
    await writeJson(
      KNOWLEDGE_INDEX_PATH,
      items.filter((k) => k.id !== req.params.id)
    );
  });
  await fs.rm(path.join(KNOWLEDGE_DIR, req.params.id), { recursive: true, force: true }).catch(() => {});
  res.json({ ok: true });
});

app.post('/api/skills/build', async (req, res) => {
  try {
    const { sourceId, slug, title, description, lens } = req.body || {};
    const knowledgeSources = await readJson(KNOWLEDGE_INDEX_PATH, []);
    const source = knowledgeSources.find((k) => k.id === sourceId);
    if (!source) {
      res.status(404).json({ error: 'Knowledge source not found' });
      return;
    }

    const id = crypto.randomUUID();
    const safeSlug = String(slug || title || source.name || id)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || `skill-${id.slice(0, 8)}`;

    const skillDir = path.join(SKILLS_DIR, `${safeSlug}-${id.slice(0, 6)}`);
    const selectedLens = ['claude', 'copilot', 'amp'].includes(lens) ? lens : 'claude';

    const built = await runBookSkillBridge([
      'build-skill',
      '--source-dir',
      source.sourceDir,
      '--slug',
      safeSlug,
      '--title',
      String(title || source.name),
      '--description',
      String(description || ''),
      '--lens',
      selectedLens,
      '--output-dir',
      skillDir,
    ]);

    const skillRecord = {
      id,
      sourceId: source.id,
      sourceName: source.name,
      slug: built.slug,
      title: built.title,
      description: built.description,
      lens: built.lens,
      skillDir: built.skillDir,
      chaptersCount: built.chaptersCount,
      glossaryCount: built.glossaryCount,
      patternsCount: built.patternsCount,
      validation: built.validation,
      securityScan: built.securityScan,
      created: new Date().toISOString().slice(0, 10),
    };

    await withFileLock(SKILLS_INDEX_PATH, async () => {
      const existing = await readJson(SKILLS_INDEX_PATH, []);
      await writeJson(SKILLS_INDEX_PATH, [skillRecord, ...existing]);
    });

    res.status(201).json({ skill: skillRecord });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get('/api/skills/:id/files', async (req, res) => {
  try {
    const skills = await readJson(SKILLS_INDEX_PATH, []);
    const target = skills.find((s) => s.id === req.params.id);
    let skillDir = target?.skillDir;

    if (!skillDir && req.query.workspacePath) {
      skillDir = String(req.query.workspacePath);
    }
    if (!skillDir) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }

    const files = [];
    for (const name of ['SKILL.md', 'glossary.md', 'patterns.md', 'cheatsheet.md']) {
      const content = await fs.readFile(path.join(skillDir, name), 'utf8').catch(() => null);
      if (content !== null) {
        files.push({ name, content });
      }
    }
    const chapters = await fs
      .readdir(path.join(skillDir, 'chapters'))
      .then((list) => list.filter((f) => f.endsWith('.md')).sort())
      .catch(() => []);
    for (const ch of chapters.slice(0, 12)) {
      const content = await fs.readFile(path.join(skillDir, 'chapters', ch), 'utf8').catch(() => null);
      if (content !== null) {
        files.push({ name: `chapters/${ch}`, content });
      }
    }
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.delete('/api/skills/:id', async (req, res) => {
  let removedDir = null;
  await withFileLock(SKILLS_INDEX_PATH, async () => {
    const skills = await readJson(SKILLS_INDEX_PATH, []);
    const target = skills.find((s) => s.id === req.params.id);
    removedDir = target?.skillDir || null;
    await writeJson(
      SKILLS_INDEX_PATH,
      skills.filter((s) => s.id !== req.params.id)
    );
  });
  if (removedDir) {
    await fs.rm(removedDir, { recursive: true, force: true }).catch(() => {});
  }
  res.json({ ok: true });
});

app.post('/api/datasets/compile', async (req, res) => {
  try {
    const { sourceId, skillId, workspaceSkillPath, name, format, targetTokens, systemPrompt } =
      req.body || {};

    let inputDir = '';
    let defaultName = 'Compiled Skill Dataset';
    let datasetKind = format === 'text' ? 'Documents' : 'Conversations';

    if (skillId) {
      const skills = await readJson(SKILLS_INDEX_PATH, []);
      const skill = skills.find((s) => s.id === skillId);
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' });
        return;
      }
      inputDir = skill.skillDir;
      defaultName = `${skill.title} (${format || 'messages'})`;
    } else if (workspaceSkillPath) {
      inputDir = String(workspaceSkillPath);
      defaultName = `${path.basename(inputDir)} (${format || 'messages'})`;
    } else if (sourceId) {
      const sources = await readJson(KNOWLEDGE_INDEX_PATH, []);
      const src = sources.find((k) => k.id === sourceId);
      if (!src) {
        res.status(404).json({ error: 'Knowledge source not found' });
        return;
      }
      inputDir = src.sourceDir;
      defaultName = `${src.name} (${format || 'messages'})`;
    } else {
      res.status(400).json({ error: 'Provide sourceId, skillId, or workspaceSkillPath' });
      return;
    }

    const datasetId = crypto.randomUUID();
    const outFile = path.join(DATASETS_DIR, `${datasetId}.jsonl`);
    const compileFormat = ['messages', 'instruction', 'text'].includes(format)
      ? format
      : 'messages';
    const tokensBudget = Number(targetTokens || 450);

    const stats = await runBookSkillBridge([
      'compile-dataset',
      '--input-dir',
      inputDir,
      '--format',
      compileFormat,
      '--target-tokens',
      String(tokensBudget),
      '--system-prompt',
      String(systemPrompt || ''),
      '--output-file',
      outFile,
    ]);

    const dataset = {
      id: datasetId,
      name: String(name || defaultName).trim(),
      kind: datasetKind,
      examples: Number(stats.examples),
      size: formatBytes(Number(stats.sizeBytes || 0)),
      filePath: outFile,
      created: new Date().toISOString().slice(0, 10),
    };

    await withFileLock(DATASETS_INDEX_PATH, async () => {
      const datasets = await readJson(DATASETS_INDEX_PATH, []);
      await writeJson(DATASETS_INDEX_PATH, [dataset, ...datasets]);
    });

    res.status(201).json({ dataset, stats });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get('/api/datasets/:id/preview', async (req, res) => {
  try {
    const datasets = await readJson(DATASETS_INDEX_PATH, []);
    const target = datasets.find((d) => d.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Dataset not found' });
      return;
    }
    let content = target.content || '';
    if (!content && target.filePath) {
      content = await fs.readFile(target.filePath, 'utf8').catch(() => '');
    }
    if (!content) {
      res.json({
        dataset: target,
        format: 'sample',
        totalLines: target.examples,
        avgChars: 0,
        sampleRows: [],
      });
      return;
    }

    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const parsedRows = [];
    let messagesCount = 0;
    let textCount = 0;
    let totalChars = 0;

    for (let i = 0; i < lines.length; i += 1) {
      totalChars += lines[i].length;
      try {
        const obj = JSON.parse(lines[i]);
        if (Array.isArray(obj.messages)) messagesCount += 1;
        else if (typeof obj.text === 'string') textCount += 1;
        if (i < 15) parsedRows.push(obj);
      } catch {
        if (i < 15) parsedRows.push({ raw: lines[i] });
      }
    }

    res.json({
      dataset: target,
      format:
        messagesCount > 0 && textCount === 0
          ? 'messages'
          : textCount > 0 && messagesCount === 0
            ? 'text'
            : 'mixed',
      totalLines: lines.length,
      avgChars: lines.length ? Math.round(totalChars / lines.length) : 0,
      sampleRows: parsedRows,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

ensureStorage()
  .then(() => reconcileRunsOnStartup())
  .then(() => {
    app.listen(PORT, '127.0.0.1', () => {
      console.log(`Froge Trainer agent listening on http://127.0.0.1:${PORT}`);
      console.log(`Model Hub target: ${MODEL_HUB_URL}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize Froge Trainer storage:', err);
    process.exit(1);
  });
