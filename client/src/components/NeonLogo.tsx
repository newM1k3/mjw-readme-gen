export function NeonLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "sm" ? "text-lg" : size === "lg" ? "text-4xl" : "text-2xl";
  return (
    <span className={`neon-logo ${sizeClass}`}>
      <span className="neon-b">mjw</span>
      <span className="text-foreground/40 mx-1">·</span>
      <span className="neon-g">readme</span>
      <span className="text-foreground/40 mx-1">·</span>
      <span className="neon-b">gen</span>
    </span>
  );
}
