import { useEffect, useState } from "react";

const ANALYSIS_STEPS = [
  "Uploading archive to storage",
  "Unpacking and scanning files",
  "Detecting stack & frameworks",
  "Parsing dependencies & scripts",
  "Reading config & env files",
  "Building repository context",
];

interface Props {
  modelLabel?: string;
  /** When true, analysis is done and LLM is streaming tokens */
  isStreaming?: boolean;
  /** Character count of tokens received so far */
  tokenCount?: number;
}

export function TerminalLoader({ modelLabel, isStreaming = false, tokenCount = 0 }: Props) {
  const [step, setStep] = useState(0);
  const [bar, setBar] = useState(0);

  useEffect(() => {
    if (isStreaming) {
      // All analysis steps complete
      setStep(ANALYSIS_STEPS.length);
      return;
    }
    const s = setInterval(() => setStep((p) => Math.min(p + 1, ANALYSIS_STEPS.length - 1)), 1600);
    const b = setInterval(() => setBar((p) => (p + 1) % 11), 160);
    return () => { clearInterval(s); clearInterval(b); };
  }, [isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;
    const b = setInterval(() => setBar((p) => (p + 1) % 11), 80);
    return () => clearInterval(b);
  }, [isStreaming]);

  const filled = "█".repeat(bar) + "░".repeat(10 - bar);
  const model = modelLabel || "AI model";

  return (
    <div className="bg-[oklch(0.08_0_0)] text-[#22ff88] font-mono text-xs p-6 h-full overflow-auto">
      <div className="text-[oklch(0.45_0_0)] mb-4">$ readme-gen analyze ./repo</div>

      {/* Analysis steps */}
      {ANALYSIS_STEPS.map((s, i) => (
        <div key={s} className={`mb-1.5 flex items-center gap-2 ${i > step ? "opacity-25" : ""}`}>
          {i < step && <span className="text-[#22ff88] w-8 shrink-0">[OK]</span>}
          {i === step && !isStreaming && <span className="text-yellow-400 w-8 shrink-0">[..]</span>}
          {(i > step || (i === step && isStreaming)) && <span className="text-[oklch(0.4_0_0)] w-8 shrink-0">[  ]</span>}
          <span>{s}</span>
          {i === step && !isStreaming && <span className="cursor-blink" />}
        </div>
      ))}

      {/* Streaming phase */}
      <div className={`mt-3 mb-1.5 flex items-center gap-2 ${!isStreaming ? "opacity-25" : ""}`}>
        {isStreaming
          ? <span className="text-yellow-400 w-8 shrink-0">[..]</span>
          : <span className="text-[oklch(0.4_0_0)] w-8 shrink-0">[  ]</span>
        }
        <span>
          {isStreaming
            ? `Writing README with ${model}…`
            : `Generate README with ${model}`}
        </span>
        {isStreaming && tokenCount > 0 && (
          <span className="text-[oklch(0.55_0_0)]">({tokenCount} chars)</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-5 text-[#22ff88]">
        [{filled}] {isStreaming ? "streaming…" : "working..."}
      </div>
    </div>
  );
}
