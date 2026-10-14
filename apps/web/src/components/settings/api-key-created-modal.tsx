import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { copyToClipboard, selectElementText } from "@/lib/copy-to-clipboard";
import { toast } from "@/lib/toast";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

type ApiKeyCreatedModalProps = {
  apiKey: string;
  keyName: string;
  open: boolean;
  onClose: () => void;
};

export function ApiKeyCreatedModal({
  apiKey,
  keyName,
  open,
  onClose,
}: ApiKeyCreatedModalProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  // Set when neither clipboard route worked: the key stays on screen, selected,
  // so the user can finish the copy with the keyboard.
  const [needsManualCopy, setNeedsManualCopy] = useState(false);
  const keyRef = useRef<HTMLElement | null>(null);

  const handleCopy = async () => {
    // A plain-HTTP origin has no navigator.clipboard, so the helper falls back
    // to the legacy path. Only a failure on both routes is worth reporting.
    if (!(await copyToClipboard(apiKey))) {
      selectElementText(keyRef.current);
      setNeedsManualCopy(true);
      toast.error(t("settings:apiKey.createdModal.toastCopyFailed"));
      return;
    }
    setCopied(true);
    toast.success(t("settings:apiKey.createdModal.toastCopied"));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[446px]">
        <DialogHeader>
          <DialogTitle>{t("settings:apiKey.createdModal.title")}</DialogTitle>
          <DialogDescription>
            {t("settings:apiKey.createdModal.description", {
              keyName,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">
                {t("settings:apiKey.createdModal.yourApiKey")}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-7 gap-1.5 text-xs"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-success-foreground" />
                    {t("settings:apiKey.createdModal.copied")}
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    {t("settings:apiKey.createdModal.copy")}
                  </>
                )}
              </Button>
            </div>
            <div className="bg-sidebar border border-border rounded-sm p-2.5 max-h-24 overflow-y-auto">
              <code
                ref={keyRef}
                className="text-xs font-mono text-foreground break-all leading-relaxed"
              >
                {apiKey}
              </code>
            </div>
          </div>

          <Alert>
            <AlertTitle>
              {t("settings:apiKey.createdModal.alertTitle")}
            </AlertTitle>
            <AlertDescription>
              {t("settings:apiKey.createdModal.alertDescription")}
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            onClick={onClose}
            disabled={!copied && !needsManualCopy}
            className="h-8 text-xs w-full sm:w-auto"
          >
            {copied
              ? t("settings:apiKey.createdModal.done")
              : t("settings:apiKey.createdModal.copyToContinue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
