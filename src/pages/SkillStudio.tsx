import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  BookMarked,
  CheckCircle2,
  Database,
  FileText,
  FolderSearch,
  Layers3,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeading from '@/components/layout/PageHeading';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LexiconTerm, LexiconTip, SettingLabel } from '@/components/ui/lexicon-tip';
import {
  buildSkillPackage,
  compileDatasetFromKnowledge,
  deleteKnowledgeSource,
  deleteSkillPackage,
  fetchKnowledgeStatus,
  fetchSkillFiles,
  ingestKnowledgeSource,
} from '@/lib/api';
import type {
  CompileDatasetFormat,
  KnowledgeSourceRecord,
  SkillValidationLens,
} from '@/types/trainer';

type IngestTab = 'upload' | 'path' | 'paste';

interface CompileTarget {
  label: string;
  sourceId?: string;
  skillId?: string;
  workspaceSkillPath?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export default function SkillStudio() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ['knowledge-status'],
    queryFn: fetchKnowledgeStatus,
  });

  const bookToSkill = statusQuery.data?.bookToSkill;
  const knowledgeSources = statusQuery.data?.knowledgeSources ?? [];
  const skills = statusQuery.data?.skills ?? [];
  const workspaceSkills = statusQuery.data?.workspaceSkills ?? [];

  const [ingestTab, setIngestTab] = useState<IngestTab>('upload');
  const [sourceName, setSourceName] = useState('');
  const [extractMode, setExtractMode] = useState<'text' | 'technical'>('text');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [localPathInput, setLocalPathInput] = useState('');
  const [rawTextInput, setRawTextInput] = useState('');
  const [ingesting, setIngesting] = useState(false);

  const [buildTarget, setBuildTarget] = useState<KnowledgeSourceRecord | null>(null);
  const [skillTitle, setSkillTitle] = useState('');
  const [skillSlug, setSkillSlug] = useState('');
  const [skillDesc, setSkillDesc] = useState('');
  const [skillLens, setSkillLens] = useState<SkillValidationLens>('claude');
  const [buildingSkill, setBuildingSkill] = useState(false);

  const [compileTarget, setCompileTarget] = useState<CompileTarget | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [compileFormat, setCompileFormat] = useState<CompileDatasetFormat>('messages');
  const [targetTokens, setTargetTokens] = useState(450);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [compiling, setCompiling] = useState(false);

  const [previewTitle, setPreviewTitle] = useState('');
  const [previewFiles, setPreviewFiles] = useState<Array<{ name: string; content: string }>>([]);
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['knowledge-status'] });
    void queryClient.invalidateQueries({ queryKey: ['datasets'] });
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIngesting(true);
    try {
      const uploadedFiles =
        ingestTab === 'upload' && selectedFiles.length > 0
          ? await Promise.all(
              selectedFiles.map(async (f) => ({
                name: f.name,
                contentBase64: await fileToBase64(f),
              }))
            )
          : undefined;

      const localPaths =
        ingestTab === 'path' && localPathInput.trim()
          ? localPathInput
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

      const rawText = ingestTab === 'paste' && rawTextInput.trim() ? rawTextInput : undefined;

      const record = await ingestKnowledgeSource({
        name: sourceName.trim() || undefined,
        mode: extractMode,
        uploadedFiles,
        localPaths,
        rawText,
      });

      setSourceName('');
      setSelectedFiles([]);
      setLocalPathInput('');
      setRawTextInput('');
      refreshAll();
      toast.success(
        `Extracted "${record.name}" (${record.chaptersDetected} sections · ~${record.estimatedTokens.toLocaleString()} tokens)`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Extraction failed');
    } finally {
      setIngesting(false);
    }
  };

  const openBuildDialog = (src: KnowledgeSourceRecord) => {
    setBuildTarget(src);
    setSkillTitle(src.name);
    setSkillSlug(
      src.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    );
    setSkillDesc(
      `Domain skill distilled from ${src.name} (${src.chaptersDetected} chapters, ${src.glossaryCount} lexicon terms).`
    );
  };

  const handleBuildSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buildTarget) return;
    setBuildingSkill(true);
    try {
      const built = await buildSkillPackage({
        sourceId: buildTarget.id,
        slug: skillSlug.trim(),
        title: skillTitle.trim(),
        description: skillDesc.trim(),
        lens: skillLens,
      });
      setBuildTarget(null);
      refreshAll();
      toast.success(
        `Built skill "${built.slug}" (${built.chaptersCount} chapters · ${
          built.validation.passed ? 'validated' : 'review warnings'
        })`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Skill build failed');
    } finally {
      setBuildingSkill(false);
    }
  };

  const openCompileDialog = (target: CompileTarget) => {
    setCompileTarget(target);
    setDatasetName(`${target.label} (${compileFormat})`);
    setSystemPrompt('');
  };

  const handleCompileDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compileTarget) return;
    setCompiling(true);
    try {
      const { dataset, stats } = await compileDatasetFromKnowledge({
        sourceId: compileTarget.sourceId,
        skillId: compileTarget.skillId,
        workspaceSkillPath: compileTarget.workspaceSkillPath,
        name: datasetName.trim() || undefined,
        format: compileFormat,
        targetTokens,
        systemPrompt: systemPrompt.trim() || undefined,
      });
      setCompileTarget(null);
      refreshAll();
      toast.success(
        `Compiled "${dataset.name}" — ${stats.examples} examples (~${stats.avgTokensPerExample} tokens/ex)`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dataset compilation failed');
    } finally {
      setCompiling(false);
    }
  };

  const handlePreviewSkill = async (id: string, title: string, workspacePath?: string) => {
    try {
      const { files } = await fetchSkillFiles(id, workspacePath);
      setPreviewTitle(title);
      setPreviewFiles(files);
      setActiveFileIdx(0);
      setPreviewOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load skill files');
    }
  };

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow="myBookToSkills Engine · Collect · Structure · Train"
        title="Skill & knowledge studio"
        description={
          <>
            Collect books, docs, and notes into sanitized{' '}
            <LexiconTerm termKey="knowledgeSource" label="knowledge sources" />, structure them into{' '}
            <LexiconTerm termKey="agentSkill" label="Agent Skills" /> to cut the{' '}
            <LexiconTerm termKey="discoveryLoopTax" />, and compile clean JSONL datasets for your AI
            trainees.
          </>
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11 gap-2" onClick={refreshAll}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button asChild className="h-11 gap-2">
              <Link to="/datasets">
                <Database size={15} />
                View datasets
              </Link>
            </Button>
          </div>
        }
      />

      {/* Extractor & Engine Status */}
      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`h-2 w-2 rounded-full ${
                bookToSkill?.available ? 'bg-primary' : 'bg-destructive'
              }`}
            />
            <span className="text-sm font-medium">
              {bookToSkill?.available
                ? `myBookToSkills extractor engine connected (${bookToSkill.rootDir})`
                : bookToSkill?.error || 'Checking myBookToSkills engine…'}
            </span>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {knowledgeSources.length} sources · {skills.length} built skills ·{' '}
            {workspaceSkills.length} workspace skills
          </span>
        </div>

        {bookToSkill?.extractors && bookToSkill.extractors.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {bookToSkill.extractors.map((ext) => (
              <LexiconTip key={ext.label} termKey="extractionMode">
                <span
                  className={`badge cursor-help text-[11px] ${
                    ext.ready
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'text-muted-foreground'
                  }`}
                >
                  {ext.ready ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {ext.label}
                </span>
              </LexiconTip>
            ))}
          </div>
        )}
      </section>

      {/* Knowledge Collector + Pipeline Summary */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="panel min-w-0 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-title flex items-center gap-2">
                <BookMarked size={18} className="text-primary" />
                Collect &amp; extract knowledge
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Supports PDF, EPUB, DOCX, RTF, HTML, Markdown, and TXT with automatic chapter
                detection and Unicode sanitization.
              </p>
            </div>

            <div className="flex rounded-lg border border-border bg-background p-1">
              {(
                [
                  { id: 'upload', label: 'Upload files', icon: Upload },
                  { id: 'path', label: 'Local path / folder', icon: FolderSearch },
                  { id: 'paste', label: 'Paste notes', icon: FileText },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setIngestTab(id)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    ingestTab === id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={(e) => void handleIngest(e)} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <SettingLabel
                  htmlFor="knowledge-name"
                  label="Knowledge bundle name"
                  termKey="knowledgeSource"
                />
                <input
                  id="knowledge-name"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="e.g. Kushite Lore Bible or Rust Handbook"
                  className="field min-h-10 text-sm"
                />
              </div>

              <div>
                <SettingLabel
                  htmlFor="extract-mode"
                  label="Extraction mode"
                  termKey="extractionMode"
                />
                <select
                  id="extract-mode"
                  value={extractMode}
                  onChange={(e) => setExtractMode(e.target.value as 'text' | 'technical')}
                  className="field min-h-10 text-sm"
                >
                  <option value="text">Text (fast chain)</option>
                  <option value="technical">Technical (tables/formulas)</option>
                </select>
              </div>
            </div>

            {ingestTab === 'upload' && (
              <div>
                <label
                  htmlFor="knowledge-upload"
                  className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background p-6 text-center transition-colors hover:border-primary/40"
                >
                  <Upload size={22} className="text-primary" />
                  <span className="mt-2 text-sm font-medium">
                    {selectedFiles.length > 0
                      ? `${selectedFiles.length} file(s) selected`
                      : 'Choose PDF, EPUB, DOCX, RTF, HTML, MD, or TXT files'}
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">
                    {selectedFiles.length > 0
                      ? selectedFiles.map((f) => f.name).join(', ')
                      : 'Multi-file bundles are merged, sanitized, and indexed by chapter.'}
                  </span>
                  <input
                    id="knowledge-upload"
                    type="file"
                    multiple
                    accept=".pdf,.epub,.docx,.rtf,.html,.htm,.md,.markdown,.txt,.rst,.adoc"
                    className="sr-only"
                    onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
                  />
                </label>
              </div>
            )}

            {ingestTab === 'path' && (
              <div>
                <SettingLabel
                  htmlFor="knowledge-paths"
                  label="Local file, folder, or glob paths (one per line)"
                  termKey="knowledgeSource"
                  rightSlot={
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() =>
                        setLocalPathInput(
                          'C:\\25th_Dynasty_Workspace\\myBookToSkills\\docs\\working_docs\\The Lost Archer.pdf'
                        )
                      }
                    >
                      Load sample PDF path
                    </button>
                  }
                />
                <textarea
                  id="knowledge-paths"
                  rows={3}
                  value={localPathInput}
                  onChange={(e) => setLocalPathInput(e.target.value)}
                  placeholder="C:\path\to\book.pdf or C:\path\to\docs_folder"
                  className="field font-mono text-xs"
                />
              </div>
            )}

            {ingestTab === 'paste' && (
              <div>
                <SettingLabel
                  htmlFor="knowledge-paste"
                  label="Raw documentation, chapters, or lexicon notes"
                  termKey="securityScan"
                />
                <textarea
                  id="knowledge-paste"
                  rows={5}
                  value={rawTextInput}
                  onChange={(e) => setRawTextInput(e.target.value)}
                  placeholder="# Chapter 1&#10;**Term**: Clear definition...&#10;1. Actionable rule..."
                  className="field text-sm"
                />
              </div>
            )}

            <Button type="submit" disabled={ingesting} className="h-11 w-full gap-2">
              <Sparkles size={16} />
              {ingesting ? 'Extracting & sanitizing knowledge…' : 'Extract & ready knowledge source'}
            </Button>
          </form>
        </section>

        {/* Extracted Knowledge Sources */}
        <section className="panel min-w-0 p-6">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Ready knowledge sources</h2>
            <span className="badge font-mono">{knowledgeSources.length}</span>
          </div>

          <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {knowledgeSources.map((src) => (
              <article
                key={src.id}
                className="rounded-xl border border-border bg-background p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{src.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {src.chaptersDetected} sections · ~{src.estimatedTokens.toLocaleString()} tokens
                      · {src.glossaryCount} terms · {src.patternCount} rules
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <LexiconTip termKey="securityScan">
                      <span
                        className={`badge cursor-help text-[10px] ${
                          src.securityFindings.length === 0
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                        }`}
                      >
                        <ShieldCheck size={11} />
                        {src.securityFindings.length === 0
                          ? 'Clean'
                          : `${src.securityFindings.length} advisory`}
                      </span>
                    </LexiconTip>
                    <button
                      type="button"
                      aria-label={`Delete ${src.name}`}
                      onClick={() =>
                        void deleteKnowledgeSource(src.id).then(() => {
                          refreshAll();
                          toast.success('Knowledge source removed');
                        })
                      }
                      className="icon-button h-8 w-8 hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {src.invisibleRemoved > 0 && (
                  <p className="mt-2 text-[11px] text-amber-300">
                    Sanitizer stripped {src.invisibleRemoved} invisible Unicode code point(s).
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => openBuildDialog(src)}
                  >
                    <Layers3 size={13} />
                    Build Skill
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() =>
                      openCompileDialog({ label: src.name, sourceId: src.id })
                    }
                  >
                    <Database size={13} />
                    Compile Dataset
                  </Button>
                </div>
              </article>
            ))}

            {!knowledgeSources.length && (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No knowledge sources extracted yet. Upload a PDF/EPUB/DOCX/Markdown file or point at
                a local folder to begin.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Built Skills + Discovered Workspace Skills */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel min-w-0 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="section-title">Built Agent Skills</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Validated with <LexiconTerm termKey="validationLens" /> and scanned with{' '}
                <LexiconTerm termKey="securityScan" />.
              </p>
            </div>
            <span className="badge font-mono">{skills.length}</span>
          </div>

          <div className="mt-4 space-y-3">
            {skills.map((skill) => (
              <article
                key={skill.id}
                className="rounded-xl border border-border bg-background p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{skill.title}</h3>
                      <span className="badge font-mono text-[10px]">{skill.lens}</span>
                      <span
                        className={`badge text-[10px] ${
                          skill.validation.passed
                            ? 'border-primary/30 bg-primary/10 text-primary'
                            : 'border-amber-400/30 text-amber-300'
                        }`}
                      >
                        {skill.validation.passed ? 'Audit passed' : 'Audit warnings'}
                      </span>
                      <span
                        className={`badge text-[10px] ${
                          skill.securityScan.passed
                            ? 'border-emerald-500/30 text-emerald-300'
                            : 'border-amber-400/30 text-amber-300'
                        }`}
                      >
                        {skill.securityScan.passed
                          ? 'Scan clean'
                          : `${skill.securityScan.findings.length} scan notes`}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {skill.chaptersCount} chapters · {skill.glossaryCount} glossary ·{' '}
                      {skill.patternsCount} patterns
                    </p>
                  </div>

                  <button
                    type="button"
                    aria-label={`Delete ${skill.title}`}
                    onClick={() =>
                      void deleteSkillPackage(skill.id).then(() => {
                        refreshAll();
                        toast.success('Skill removed');
                      })
                    }
                    className="icon-button h-8 w-8 hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => void handlePreviewSkill(skill.id, skill.title)}
                  >
                    <FileText size={13} />
                    Inspect files
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() =>
                      openCompileDialog({ label: skill.title, skillId: skill.id })
                    }
                  >
                    <Plus size={13} />
                    Compile to JSONL Dataset
                  </Button>
                </div>
              </article>
            ))}

            {!skills.length && (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                Extract a knowledge source above and click <strong>Build Skill</strong> to generate{' '}
                <code>SKILL.md</code>, chapters, glossary, patterns, and cheatsheet.
              </p>
            )}
          </div>
        </section>

        <section className="panel min-w-0 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="section-title">Workspace skills ready to compile</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Existing skills discovered in <code>myBookToSkills</code> &amp; workspace{' '}
                <code>.agents/skills</code>.
              </p>
            </div>
            <span className="badge font-mono">{workspaceSkills.length}</span>
          </div>

          <div className="mt-4 max-h-[380px] space-y-3 overflow-y-auto pr-1">
            {workspaceSkills.map((ws) => (
              <article
                key={ws.id}
                className="rounded-xl border border-border bg-background p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-mono text-sm font-semibold">{ws.name}</h3>
                    {ws.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {ws.description}
                      </p>
                    )}
                    <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                      {ws.chaptersCount} chapter files · {ws.skillDir}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => void handlePreviewSkill(ws.slug, ws.name, ws.skillDir)}
                  >
                    <FileText size={13} />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() =>
                      openCompileDialog({
                        label: ws.name,
                        workspaceSkillPath: ws.skillDir,
                      })
                    }
                  >
                    <ArrowUpRight size={13} />
                    Compile to Dataset
                  </Button>
                </div>
              </article>
            ))}

            {!workspaceSkills.length && (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No external workspace skills found.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Build Skill Dialog */}
      <Dialog open={Boolean(buildTarget)} onOpenChange={(open) => !open && setBuildTarget(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <p className="eyebrow text-[10px] text-primary">myBookToSkills · Skill Compiler</p>
            <DialogTitle className="text-xl">Build validated Agent Skill</DialogTitle>
          </DialogHeader>

          <form onSubmit={(e) => void handleBuildSkill(e)} className="mt-2 space-y-4">
            <div>
              <SettingLabel htmlFor="skill-title" label="Skill title" termKey="agentSkill" />
              <input
                id="skill-title"
                value={skillTitle}
                onChange={(e) => setSkillTitle(e.target.value)}
                className="field min-h-10 text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <SettingLabel htmlFor="skill-slug" label="Skill slug" termKey="agentSkill" />
                <input
                  id="skill-slug"
                  value={skillSlug}
                  onChange={(e) => setSkillSlug(e.target.value)}
                  className="field min-h-10 font-mono text-xs"
                  required
                />
              </div>
              <div>
                <SettingLabel
                  htmlFor="skill-lens"
                  label="Validation lens"
                  termKey="validationLens"
                />
                <select
                  id="skill-lens"
                  value={skillLens}
                  onChange={(e) => setSkillLens(e.target.value as SkillValidationLens)}
                  className="field min-h-10 text-sm"
                >
                  <option value="claude">Claude Code</option>
                  <option value="copilot">GitHub Copilot CLI</option>
                  <option value="amp">Sourcegraph Amp</option>
                </select>
              </div>
            </div>

            <div>
              <SettingLabel
                htmlFor="skill-desc"
                label="Skill description"
                termKey="validationLens"
              />
              <textarea
                id="skill-desc"
                rows={3}
                value={skillDesc}
                onChange={(e) => setSkillDesc(e.target.value)}
                className="field text-sm"
                required
              />
            </div>

            <Button type="submit" disabled={buildingSkill} className="h-11 w-full gap-2">
              <Layers3 size={15} />
              {buildingSkill ? 'Building & validating skill…' : 'Generate & audit skill package'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Compile to Dataset Dialog */}
      <Dialog
        open={Boolean(compileTarget)}
        onOpenChange={(open) => !open && setCompileTarget(null)}
      >
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <p className="eyebrow text-[10px] text-primary">AI-Trainee Dataset Forge</p>
            <DialogTitle className="text-xl">Compile to JSONL training dataset</DialogTitle>
          </DialogHeader>

          <form onSubmit={(e) => void handleCompileDataset(e)} className="mt-2 space-y-4">
            <div>
              <SettingLabel
                htmlFor="compile-name"
                label="Dataset name"
                termKey="trainingDataset"
              />
              <input
                id="compile-name"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                className="field min-h-10 text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <SettingLabel
                  htmlFor="compile-format"
                  label="JSONL schema"
                  termKey="compileFormat"
                />
                <select
                  id="compile-format"
                  value={compileFormat}
                  onChange={(e) => setCompileFormat(e.target.value as CompileDatasetFormat)}
                  className="field min-h-10 text-sm"
                >
                  <option value="messages">Messages (SFT Chat)</option>
                  <option value="instruction">Instruction Q&amp;A</option>
                  <option value="text">Domain Prose (Text)</option>
                </select>
              </div>
              <div>
                <SettingLabel
                  htmlFor="compile-tokens"
                  label="Target chunk tokens"
                  termKey="targetTokens"
                />
                <input
                  id="compile-tokens"
                  type="number"
                  min={150}
                  max={1800}
                  value={targetTokens}
                  onChange={(e) => setTargetTokens(Number(e.target.value) || 450)}
                  className="field min-h-10 text-sm"
                />
              </div>
            </div>

            {compileFormat === 'messages' && (
              <div>
                <SettingLabel
                  htmlFor="compile-system"
                  label="Trainee system framing (optional)"
                  termKey="compileFormat"
                />
                <textarea
                  id="compile-system"
                  rows={2}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Defaults to a grounded specialist persona for this skill."
                  className="field text-sm"
                />
              </div>
            )}

            <Button type="submit" disabled={compiling} className="h-11 w-full gap-2">
              <Database size={15} />
              {compiling ? 'Compiling deduplicated JSONL…' : 'Compile & save to dataset library'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Skill File Inspector Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex max-h-[86vh] flex-col sm:max-w-[820px]">
          <DialogHeader>
            <p className="eyebrow text-[10px] text-primary">Agent Skill Files</p>
            <DialogTitle className="text-xl">{previewTitle}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
            {previewFiles.map((file, idx) => (
              <button
                key={file.name}
                type="button"
                onClick={() => setActiveFileIdx(idx)}
                className={`rounded-md border px-2.5 py-1 font-mono text-xs transition-colors ${
                  activeFileIdx === idx
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                {file.name}
              </button>
            ))}
          </div>

          <pre className="mt-2 flex-1 overflow-auto rounded-xl border border-border bg-background p-4 font-mono text-xs leading-6 text-foreground">
            {previewFiles[activeFileIdx]?.content || 'No files found.'}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
