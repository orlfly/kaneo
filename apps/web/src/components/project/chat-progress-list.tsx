import { CheckIcon, Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProgressEntry } from "@/fetchers/project/chat";
import { cn } from "@/lib/cn";

type Props = {
  entries: ProgressEntry[];
  /** When true, the latest item shows a spinner; earlier items collapse. */
  streaming: boolean;
};

function ChatProgressList({ entries, streaming }: Props) {
  const { t } = useTranslation();
  if (entries.length === 0) return null;

  return (
    <ul
      aria-label={t("chat:progressAriaLabel", {
        defaultValue: "Agent working steps",
      })}
      className="flex flex-col gap-1 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
    >
      {entries.map((entry, index) => {
        const isLatest = index === entries.length - 1;
        const showSpinner = streaming && isLatest;
        const label = entry.label;
        const ariaLabel = t("chat:progressItemAriaLabel", {
          defaultValue: "Agent is {{label}}",
          label,
        });
        return (
          <li
            key={`${entry.round}-${entry.tool}`}
            aria-label={ariaLabel}
            className={cn(
              "flex items-center gap-2",
              !showSpinner && !isLatest && "opacity-70",
            )}
          >
            {showSpinner ? (
              <Loader2Icon className="size-3 animate-spin shrink-0" />
            ) : (
              <CheckIcon className="size-3 shrink-0 text-emerald-500/80" />
            )}
            <span className="truncate">{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default ChatProgressList;
