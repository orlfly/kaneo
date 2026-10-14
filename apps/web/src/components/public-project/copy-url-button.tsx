import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { toast } from "@/lib/toast";

export function CopyUrlButton() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = async () => {
    if (!(await copyToClipboard(window.location.href))) {
      toast.error(t("publicProject:copyUrl.errorToast"));
      return;
    }
    setCopied(true);
    toast.success(t("publicProject:copyUrl.successToast"));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopyUrl}
      className="h-8 gap-2"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" />
          <span className="text-xs">{t("publicProject:copyUrl.copied")}</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span className="text-xs">{t("publicProject:copyUrl.share")}</span>
        </>
      )}
    </Button>
  );
}
