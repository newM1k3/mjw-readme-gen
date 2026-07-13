import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload, Github, Cpu, FileText, Bookmark, BookmarkPlus,
  Trash2, RotateCcw, GitCompare, LogIn, ToggleLeft, ToggleRight, X, Loader2, Square
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NeonLogo } from "@/components/NeonLogo";
import { TerminalLoader } from "@/components/TerminalLoader";
import { AnalysisSummary } from "@/components/AnalysisSummary";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { CompareView } from "@/components/CompareView";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useStreamGenerate, type GenerationResult } from "@/hooks/useStreamGenerate";

// ─── LocalStorage helpers ─────────────────────────────────────────────────

const LS_MODEL = "mjw-readme-model";
const LS_BANNER = "mjw-readme-banner";

function lsGet(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function lsSet(key: string, val: string) {
  try { localStorage.setItem(key, val); } catch {}
}

// ─── DropZone ─────────────────────────────────────────────────────────────

function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed cursor-pointer transition-colors p-6 flex flex-col items-center gap-3 ${
        dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
      }`}
    >
      <Upload className={`w-8 h-8 ${dragging ? "text-primary" : "text-muted-foreground"}`} />
      <div className="text-center">
        <div className="text-xs font-mono font-bold">Drop ZIP archive here</div>
        <div className="text-[11px] text-muted-foreground mt-1">or click to browse</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </div>
  );
}

// ─── History Item Row ─────────────────────────────────────────────────────

function HistoryRow({
  item,
  isSelected,
  compareIds,
  onLoad,
  onDelete,
  onRerun,
  onToggleCompare,
}: {
  item: any;
  isSelected: boolean;
  compareIds: string[];
  onLoad: () => void;
  onDelete: () => void;
  onRerun: () => void;
  onToggleCompare: () => void;
}) {
  const inCompare = compareIds.includes(item.id);
  const canAddCompare = compareIds.length < 2 || inCompare;

  return (
    <div className={`border-b border-border/40 p-3 transition-colors ${isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-card"}`}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={onLoad} className="flex-1 text-left min-w-0">
          <div className="text-xs font-mono font-bold truncate">{item.projectName || "Untitled"}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            <span className="text-[10px] px-1.5 py-0.5 bg-secondary text-muted-foreground">{item.source}</span>
            {(item.stack as string[]).slice(0, 3).map((s: string) => (
              <span key={s} className="text-[10px] px-1.5 py-0.5 bg-secondary text-muted-foreground">{s}</span>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {new Date(item.createdAt).toLocaleString()}
          </div>
        </button>
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={onRerun} title="Re-run" className="p-1 text-muted-foreground hover:text-primary transition-colors">
            <RotateCcw className="w-3 h-3" />
          </button>
          <button
            onClick={onToggleCompare}
            title={inCompare ? "Remove from compare" : "Add to compare"}
            disabled={!canAddCompare}
            className={`p-1 transition-colors ${inCompare ? "text-primary" : "text-muted-foreground hover:text-primary"} disabled:opacity-30`}
          >
            <GitCompare className="w-3 h-3" />
          </button>
          <button onClick={onDelete} title="Delete" className="p-1 text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function GeneratorPage() {
  const { user, isAuthenticated, logout } = useAuth();

  // Model & banner preferences (localStorage)
  const [selectedModel, setSelectedModel] = useState<string>(() => lsGet(LS_MODEL, ""));
  const [includeBanner, setIncludeBanner] = useState<boolean>(() => lsGet(LS_BANNER, "true") === "true");

  // Source mode
  const [sourceMode, setSourceMode] = useState<"zip" | "github">("zip");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [projectNameOverride, setProjectNameOverride] = useState("");

  // Style reference
  const [referenceContent, setReferenceContent] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  // Generation state
  const [isAnalyzing, setIsAnalyzing] = useState(false); // pre-stream phase
  const [currentResult, setCurrentResult] = useState<GenerationResult | null>(null);

  // Streaming
  const { streamingText, isStreaming, startZip, startUrl, startRerun, abort } = useStreamGenerate();

  // History & compare
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareItems, setCompareItems] = useState<{ a: GenerationResult; b: GenerationResult } | null>(null);

  // tRPC queries & mutations
  const utils = trpc.useUtils();
  const { data: models = [] } = trpc.readme.listModels.useQuery();
  const { data: history = [], refetch: refetchHistory } = trpc.readme.history.useQuery(undefined, { enabled: isAuthenticated });
  const { data: templates = [], refetch: refetchTemplates } = trpc.templates.list.useQuery(undefined, { enabled: isAuthenticated });

  const deleteGen = trpc.readme.deleteGeneration.useMutation();
  const createTemplate = trpc.templates.create.useMutation();
  const deleteTemplate = trpc.templates.delete.useMutation();
  const historyItemQuery = trpc.readme.historyItem.useQuery(
    { id: selectedHistoryId! },
    { enabled: selectedHistoryId !== null && isAuthenticated }
  );

  // Persist preferences
  useEffect(() => { lsSet(LS_MODEL, selectedModel); }, [selectedModel]);
  useEffect(() => { lsSet(LS_BANNER, String(includeBanner)); }, [includeBanner]);

  // Set default model once loaded
  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].id);
    }
  }, [models, selectedModel]);

  // Load history item into view
  useEffect(() => {
    if (historyItemQuery.data) {
      setCurrentResult({
        ...historyItemQuery.data,
        stack: historyItemQuery.data.stack as string[],
        scripts: historyItemQuery.data.scripts as string[],
        envVars: historyItemQuery.data.envVars as string[],
        deployment: historyItemQuery.data.deployment as string[],
        createdAt: historyItemQuery.data.createdAt instanceof Date
          ? historyItemQuery.data.createdAt.toISOString()
          : String(historyItemQuery.data.createdAt),
        modelLabel: historyItemQuery.data.modelLabel || undefined,
        templateName: historyItemQuery.data.templateName || undefined,
        hasReference: historyItemQuery.data.hasReference ? 1 : 0,
      });
    }
  }, [historyItemQuery.data]);

  // Apply selected template
  useEffect(() => {
    if (selectedTemplate) {
      const t = templates.find((t: any) => String(t.id) === selectedTemplate);
      if (t) {
        setReferenceContent(t.content);
        setReferenceName(t.name);
      }
    }
  }, [selectedTemplate, templates]);

  const getEffectiveReference = () => referenceContent || "";

  const streamCallbacks = {
    onDone: (generation: GenerationResult) => {
      setCurrentResult(generation);
      setSelectedHistoryId(generation.id);
      refetchHistory();
      toast.success("README generated!");
    },
    onError: (message: string) => {
      toast.error(message || "Generation failed");
    },
  };

  const handleGenerate = async () => {
    if (!isAuthenticated) { toast.error("Please log in to generate READMEs"); return; }
    if (sourceMode === "zip" && !zipFile) { toast.error("Please upload a ZIP file"); return; }
    if (sourceMode === "github" && !githubUrl.trim()) { toast.error("Please enter a GitHub URL"); return; }

    setIsAnalyzing(true);
    setCurrentResult(null);

    const modelId = selectedModel || undefined;
    const referenceReadme = getEffectiveReference() || undefined;
    const templateName = selectedTemplate
      ? (templates.find((t: any) => String(t.id) === selectedTemplate) as any)?.name || ""
      : "";

    // The analyzing phase ends once the first token arrives
    const wrappedCallbacks = {
      ...streamCallbacks,
      onToken: () => { setIsAnalyzing(false); },
    };

    const nameOverride = projectNameOverride.trim() || undefined;

    if (sourceMode === "zip" && zipFile) {
      const arrayBuffer = await zipFile.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
      const base64 = btoa(binary);
      setIsAnalyzing(true);
      await startZip(
        { fileBase64: base64, fileName: zipFile.name, modelId, referenceReadme, templateName, includeBanner, projectNameOverride: nameOverride },
        wrappedCallbacks
      );
    } else {
      setIsAnalyzing(true);
      await startUrl(
        { url: githubUrl.trim(), modelId, referenceReadme, templateName, includeBanner, projectNameOverride: nameOverride },
        wrappedCallbacks
      );
    }

    setIsAnalyzing(false);
  };

  const handleRerun = async (id: string) => {
    if (!isAuthenticated) return;
    setIsAnalyzing(true);
    setCurrentResult(null);

    const wrappedCallbacks = {
      ...streamCallbacks,
      onToken: () => { setIsAnalyzing(false); },
    };

    await startRerun(
      { id, modelId: selectedModel || undefined, referenceReadme: getEffectiveReference() || undefined, includeBanner },
      wrappedCallbacks
    );

    setIsAnalyzing(false);
  };

  const handleAbort = () => {
    abort();
    setIsAnalyzing(false);
    toast.info("Generation cancelled");
  };

  const handleDelete = async (id: string) => {
    await deleteGen.mutateAsync({ id });
    if (selectedHistoryId === id) { setCurrentResult(null); setSelectedHistoryId(null); }
    refetchHistory();
    toast.success("Deleted");
  };

  const handleToggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  const handleStartCompare = async () => {
    if (compareIds.length !== 2) { toast.error("Select exactly 2 items to compare"); return; }
    const [a, b] = compareIds;
    const aItem = await utils.readme.historyItem.fetch({ id: a });
    const bItem = await utils.readme.historyItem.fetch({ id: b });
    const toIso = (d: Date | string) => d instanceof Date ? d.toISOString() : String(d);
    setCompareItems({
      a: { ...aItem, stack: aItem.stack as string[], scripts: aItem.scripts as string[], envVars: aItem.envVars as string[], deployment: aItem.deployment as string[], createdAt: toIso(aItem.createdAt) },
      b: { ...bItem, stack: bItem.stack as string[], scripts: bItem.scripts as string[], envVars: bItem.envVars as string[], deployment: bItem.deployment as string[], createdAt: toIso(bItem.createdAt) },
    });
  };

  const handleSaveTemplate = async () => {
    if (!saveTemplateName.trim()) { toast.error("Enter a template name"); return; }
    if (!referenceContent.trim()) { toast.error("No reference content to save"); return; }
    await createTemplate.mutateAsync({ name: saveTemplateName.trim(), content: referenceContent });
    refetchTemplates();
    setSaveTemplateName("");
    setShowSaveTemplate(false);
    toast.success("Template saved");
  };

  const handleDeleteTemplate = async (id: string) => {
    await deleteTemplate.mutateAsync({ id });
    if (id === selectedTemplate) setSelectedTemplate("");
    refetchTemplates();
    toast.success("Template deleted");
  };

  const handleReferenceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setReferenceContent(ev.target?.result as string || "");
      setReferenceName(f.name);
      setSelectedTemplate("");
    };
    reader.readAsText(f);
  };

  const modelLabel = models.find((m: any) => m.id === selectedModel)?.label || selectedModel;
  const isActive = isAnalyzing || isStreaming;

  // The live content to show in the preview pane during/after streaming
  const liveContent = isStreaming ? streamingText : (currentResult?.readme || "");

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <header className="border-b border-border shrink-0 flex items-center justify-between px-4 py-2">
        <NeonLogo size="sm" />
        <div className="flex items-center gap-3">
          {isActive && (
            <button
              onClick={handleAbort}
              className="flex items-center gap-1.5 text-[11px] font-mono text-destructive border border-destructive/40 px-2 py-1 hover:bg-destructive/10 transition-colors"
            >
              <Square className="w-3 h-3" />
              Stop
            </button>
          )}
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-muted-foreground hidden sm:block">{user.name}</span>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogIn className="w-3 h-3" />
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => window.location.href = getLoginUrl()}
              className="flex items-center gap-1.5 text-[11px] font-mono text-primary hover:underline"
            >
              <LogIn className="w-3 h-3" />
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left Sidebar ────────────────────────────────────────────── */}
        <aside className="w-72 border-r border-border flex flex-col overflow-hidden shrink-0">
          <div className="overflow-y-auto flex-1">

            {/* Source Mode */}
            <section className="border-b border-border p-4">
              <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground mb-3">Source</div>
              <div className="flex gap-0 mb-3">
                <button
                  onClick={() => setSourceMode("zip")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-mono border transition-colors ${
                    sourceMode === "zip" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Upload className="w-3 h-3" />ZIP
                </button>
                <button
                  onClick={() => setSourceMode("github")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-mono border border-l-0 transition-colors ${
                    sourceMode === "github" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Github className="w-3 h-3" />GitHub
                </button>
              </div>

              {sourceMode === "zip" ? (
                <>
                  <DropZone onFile={setZipFile} />
                  {zipFile && (
                    <div className="mt-2 flex items-center justify-between text-[11px] font-mono bg-card border border-border px-2 py-1">
                      <span className="truncate text-foreground/70">{zipFile.name}</span>
                      <button onClick={() => setZipFile(null)} className="ml-2 text-muted-foreground hover:text-destructive shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <input
                  type="text"
                  placeholder="https://github.com/owner/repo"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  className="w-full bg-card border border-border px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary placeholder:text-muted-foreground/50"
                />
              )}
            </section>

            {/* Project Name Override */}
            <section className="border-b border-border p-4">
              <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground mb-1">Project Name</div>
              <div className="text-[10px] text-muted-foreground mb-2">Override auto-detected name</div>
              <input
                type="text"
                placeholder="e.g. PuzzleFlow AI"
                value={projectNameOverride}
                onChange={(e) => setProjectNameOverride(e.target.value)}
                className="w-full bg-card border border-border px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary placeholder:text-muted-foreground/50"
              />
            </section>

            {/* Model Picker */}
            <section className="border-b border-border p-4">
              <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground mb-2">Model</div>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-card border border-border px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-primary"
              >
                {models.length === 0 && <option value="">Loading models…</option>}
                {models.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.label || m.id}</option>
                ))}
              </select>
            </section>

            {/* Style Reference */}
            <section className="border-b border-border p-4">
              <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground mb-2">Style Reference</div>

              {/* Saved templates */}
              {templates.length > 0 && (
                <div className="mb-2">
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    className="w-full bg-card border border-border px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-primary"
                  >
                    <option value="">— Pick saved template —</option>
                    {templates.map((t: any) => (
                      <option key={t.id} value={String(t.id)}>{t.name}</option>
                    ))}
                  </select>
                  {selectedTemplate && (
                    <button
                      onClick={() => handleDeleteTemplate(selectedTemplate)}
                      className="mt-1 flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-2.5 h-2.5" />Delete template
                    </button>
                  )}
                </div>
              )}

              {/* Upload reference file */}
              <label className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                <FileText className="w-3 h-3" />
                Upload .md / .txt reference
                <input type="file" accept=".md,.txt" className="hidden" onChange={handleReferenceFile} />
              </label>

              {referenceContent && (
                <div className="mt-2 flex items-center justify-between text-[11px] font-mono bg-card border border-border px-2 py-1">
                  <span className="truncate text-foreground/70">{referenceName || "reference"} ({referenceContent.length} chars)</span>
                  <button onClick={() => { setReferenceContent(""); setReferenceName(""); setSelectedTemplate(""); }} className="ml-2 text-muted-foreground hover:text-destructive shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Save as template */}
              {referenceContent && isAuthenticated && (
                <div className="mt-2">
                  {showSaveTemplate ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        placeholder="Template name"
                        value={saveTemplateName}
                        onChange={(e) => setSaveTemplateName(e.target.value)}
                        className="flex-1 bg-card border border-border px-2 py-1 text-xs font-mono focus:outline-none focus:border-primary"
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveTemplate(); }}
                      />
                      <button onClick={handleSaveTemplate} className="px-2 py-1 bg-primary text-primary-foreground text-xs font-mono">Save</button>
                      <button onClick={() => setShowSaveTemplate(false)} className="px-2 py-1 border border-border text-xs font-mono text-muted-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowSaveTemplate(true)}
                      className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground"
                    >
                      <BookmarkPlus className="w-3 h-3" />
                      Save as template
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* MJW Banner Toggle */}
            <section className="border-b border-border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">MJW Banner</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Prepend design banner</div>
                </div>
                <button
                  onClick={() => setIncludeBanner((p) => !p)}
                  className={`transition-colors ${includeBanner ? "text-primary" : "text-muted-foreground"}`}
                >
                  {includeBanner ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                </button>
              </div>
            </section>

            {/* Generate Button */}
            <section className="p-4">
              {!isAuthenticated ? (
                <button
                  onClick={() => window.location.href = getLoginUrl()}
                  className="w-full py-3 border border-border text-xs font-mono font-bold flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  Sign in to Generate
                </button>
              ) : isActive ? (
                <button
                  onClick={handleAbort}
                  className="w-full py-3 bg-destructive/20 border border-destructive text-destructive text-xs font-mono font-bold flex items-center justify-center gap-2 hover:bg-destructive/30 transition-colors active:scale-[0.98]"
                >
                  <Square className="w-4 h-4" />
                  Stop Generation
                </button>
              ) : (
                <button
                  onClick={handleGenerate}
                  className="w-full py-3 bg-primary text-primary-foreground text-xs font-mono font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors active:scale-[0.98]"
                >
                  <Cpu className="w-4 h-4" />
                  Generate README
                </button>
              )}
            </section>
          </div>

          {/* History */}
          {isAuthenticated && (
            <div className="border-t border-border flex flex-col" style={{ maxHeight: "45%" }}>
              <div className="flex items-center justify-between px-4 py-2 shrink-0">
                <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">
                  History ({history.length})
                </div>
                {compareIds.length === 2 && (
                  <button
                    onClick={handleStartCompare}
                    className="text-[10px] font-mono text-primary hover:underline flex items-center gap-1"
                  >
                    <GitCompare className="w-3 h-3" />Compare
                  </button>
                )}
              </div>
              {compareIds.length > 0 && (
                <div className="px-4 pb-2 flex items-center gap-1 text-[10px] font-mono text-muted-foreground shrink-0">
                  <GitCompare className="w-3 h-3" />
                  {compareIds.length}/2 selected
                  <button onClick={() => setCompareIds([])} className="ml-auto text-destructive hover:underline">clear</button>
                </div>
              )}
              <div className="overflow-y-auto flex-1">
                {history.length === 0 ? (
                  <div className="px-4 py-6 text-[11px] text-muted-foreground text-center">No generations yet</div>
                ) : (
                  history.map((item: any) => (
                    <HistoryRow
                      key={item.id}
                      item={item}
                      isSelected={selectedHistoryId === item.id}
                      compareIds={compareIds}
                      onLoad={() => setSelectedHistoryId(item.id)}
                      onDelete={() => handleDelete(item.id)}
                      onRerun={() => handleRerun(item.id)}
                      onToggleCompare={() => handleToggleCompare(item.id)}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </aside>

        {/* ── Right Pane: Preview / Compare ───────────────────────────── */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {compareItems ? (
            <CompareView
              itemA={compareItems.a}
              itemB={compareItems.b}
              onClose={() => { setCompareItems(null); setCompareIds([]); }}
            />
          ) : isAnalyzing ? (
            /* Pre-stream: show terminal loader with analysis steps */
            <TerminalLoader modelLabel={modelLabel} isStreaming={false} />
          ) : isStreaming ? (
            /* Streaming: show live preview with terminal loader overlay at top */
            <div className="flex flex-col h-full overflow-hidden">
              <div className="shrink-0" style={{ height: "160px" }}>
                <TerminalLoader modelLabel={modelLabel} isStreaming tokenCount={streamingText.length} />
              </div>
              <div className="flex-1 overflow-hidden border-t border-border">
                <MarkdownPreview
                  content={streamingText}
                  filename="README.md"
                  isStreaming
                />
              </div>
            </div>
          ) : currentResult ? (
            /* Done: show full result */
            <div className="flex flex-col h-full overflow-hidden">
              <div className="border-b border-border bg-card px-4 py-2 shrink-0">
                <AnalysisSummary data={{ ...currentResult, modelLabel: currentResult.modelLabel || currentResult.model }} />
              </div>
              <div className="flex-1 overflow-hidden">
                <MarkdownPreview
                  content={currentResult.readme}
                  filename={`${currentResult.projectName || "README"}.md`}
                />
              </div>
            </div>
          ) : (
            /* Idle: welcome screen */
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <NeonLogo size="lg" />
              <div className="mt-6 text-xs font-mono text-muted-foreground max-w-sm leading-relaxed">
                Upload a ZIP archive or paste a GitHub URL, choose your model and optional style reference, then hit Generate.
              </div>
              <div className="mt-8 grid grid-cols-3 gap-4 text-[11px] font-mono text-muted-foreground max-w-md">
                <div className="border border-border/40 p-3 text-center">
                  <Upload className="w-4 h-4 mx-auto mb-2 text-primary" />
                  ZIP Upload
                </div>
                <div className="border border-border/40 p-3 text-center">
                  <Github className="w-4 h-4 mx-auto mb-2 text-primary" />
                  GitHub URL
                </div>
                <div className="border border-border/40 p-3 text-center">
                  <GitCompare className="w-4 h-4 mx-auto mb-2 text-primary" />
                  Diff & Merge
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
