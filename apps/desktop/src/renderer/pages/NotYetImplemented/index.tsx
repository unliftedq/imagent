import { EmptyState, Icons } from "@imagent/ui";

export interface NotYetImplementedProps {
  title: string;
  milestone: "M5" | "M6" | "M7" | "M8";
  description?: string;
}

export function NotYetImplemented({ title, milestone, description }: NotYetImplementedProps) {
  return (
    <div className="mx-auto max-w-3xl px-8 py-16">
      <EmptyState
        icon={<Icons.WarningCircle weight="duotone" className="size-10" />}
        title={`${title} — coming in ${milestone}`}
        description={
          description ??
          "This page hasn't shipped yet. The CLI can already do most of what's planned here — see the workplan for details."
        }
      />
    </div>
  );
}
