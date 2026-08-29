import { Bot, Check, Download, FileDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAgentConfigTemplates,
  useDownloadAgentConfig,
} from "@/hooks/queries/agent/use-agents-config";
import { toast } from "@/lib/toast";

type AgentConfigPanelProps = {
  projectId: string;
};

export function AgentConfigPanel(_props: AgentConfigPanelProps) {
  const { t } = useTranslation();
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const { data: templates } = useAgentConfigTemplates();
  const downloadMutation = useDownloadAgentConfig();

  const handleDownload = async () => {
    try {
      await downloadMutation.mutateAsync();
      toast.success(
        t("agentConfig.downloadSuccess", {
          defaultValue: "Agent configuration package downloaded",
        }),
      );
      setShowDownloadDialog(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Download failed";
      toast.error(msg);
    }
  };

  const totalRoles = templates?.roles.length ?? 7;
  const totalSkills = templates?.skills.length ?? 5;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            {t("agentConfig.title", { defaultValue: "Agent Configuration" })}
          </h3>
        </div>
        <Button
          size="sm"
          onClick={() => setShowDownloadDialog(true)}
          disabled={downloadMutation.isPending}
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {downloadMutation.isPending
            ? t("agentConfig.downloading", { defaultValue: "Downloading..." })
            : t("agentConfig.download", { defaultValue: "Download Config" })}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("agentConfig.description", {
          defaultValue:
            "Download the agent configuration package, then run install.sh in your target directory to set up agent roles and skills for external code agents.",
        })}
      </p>

      {/* Available roles and skills */}
      <div className="space-y-3">
        {/* Roles */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-medium text-foreground/70">
              {t("agentConfig.roles", { defaultValue: "Roles" })}
            </span>
            <span className="text-xs text-muted-foreground">{totalRoles}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {templates?.roles.map((role) => (
              <Badge key={role.name} variant="outline" className="text-xs">
                <Check className="w-3 h-3 mr-1" />
                {role.description}
              </Badge>
            ))}
          </div>
        </div>

        {/* Skills */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-medium text-foreground/70">
              {t("agentConfig.skills", { defaultValue: "Skills" })}
            </span>
            <span className="text-xs text-muted-foreground">{totalSkills}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {templates?.skills.map((skill) => (
              <Badge key={skill.name} variant="outline" className="text-xs">
                <Check className="w-3 h-3 mr-1" />
                {skill.description}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Download dialog */}
      <Dialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("agentConfig.downloadTitle", {
                defaultValue: "Download Agent Configuration",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("agentConfig.downloadConfirm", {
                defaultValue:
                  "Download a zip package containing role definitions, skills, opencode.jsonc, and install.sh. Unzip it in your target directory and run ./install.sh to set up the agent configuration.",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDownloadDialog(false)}
            >
              {t("common:actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              size="sm"
              onClick={handleDownload}
              disabled={downloadMutation.isPending}
            >
              <FileDown className="w-3.5 h-3.5 mr-1.5" />
              {downloadMutation.isPending
                ? t("agentConfig.downloading", {
                    defaultValue: "Downloading...",
                  })
                : t("agentConfig.confirmDownload", {
                    defaultValue: "Download",
                  })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AgentConfigPanel;
