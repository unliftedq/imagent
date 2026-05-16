import type { ReactNode } from "react";

export function AssetField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-(length:--text-caption) font-semibold text-(--text-muted)">
        {label}
      </span>
      {children}
    </label>
  );
}
