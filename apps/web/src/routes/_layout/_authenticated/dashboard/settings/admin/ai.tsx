import { createFileRoute } from "@tanstack/react-router";
import { BotIcon, SaveIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import useUpdateChatConfig from "@/hooks/mutations/admin/use-update-chat-config";
import useChatConfig, {
  type ChatConfig,
} from "@/hooks/queries/admin/use-chat-config";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/admin/ai",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { data: config, isLoading } = useChatConfig();
  const updateConfig = useUpdateChatConfig();

  const [form, setForm] = useState<ChatConfig>({
    enabled: false,
    baseUrl: "",
    apiKey: "",
    model: "",
    workdirRoot: null,
    enableCommandExecution: false,
    commandTimeoutMs: 60000,
  });

  useEffect(() => {
    if (config) {
      setForm({
        enabled: config.enabled,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        workdirRoot: config.workdirRoot ?? null,
        enableCommandExecution: config.enableCommandExecution ?? false,
        commandTimeoutMs: config.commandTimeoutMs ?? 60000,
      });
    }
  }, [config]);

  const handleSave = async () => {
    try {
      await updateConfig.mutateAsync({
        enabled: form.enabled,
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey.trim(),
        model: form.model.trim(),
        workdirRoot: form.workdirRoot,
        enableCommandExecution: form.enableCommandExecution,
        commandTimeoutMs: form.commandTimeoutMs,
      });
      toast.success(
        t("admin:ai.toast.saved", { defaultValue: "AI settings saved" }),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("admin:ai.toast.error", {
              defaultValue: "Failed to save settings",
            }),
      );
    }
  };

  return (
    <>
      <PageTitle title={t("admin:ai.pageTitle", { defaultValue: "AI" })} />
      <div className="mx-auto max-w-2xl space-y-8 p-2">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BotIcon className="size-5" />
            <h1 className="text-2xl font-semibold">
              {t("admin:ai.pageTitle", { defaultValue: "AI Assistant" })}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("admin:ai.pageDescription", {
              defaultValue:
                "Configure the AI assistant used by project chat. Kaneo uses an OpenAI-compatible API.",
            })}
          </p>
        </div>

        <div className="rounded-md border bg-card p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base">
                {t("admin:ai.enableLabel", {
                  defaultValue: "Enable AI assistant",
                })}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("admin:ai.enableDescription", {
                  defaultValue:
                    "When disabled, the Chat tab shows a placeholder and the API returns 503.",
                })}
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={form.enabled}
                onChange={(e) =>
                  setForm({ ...form, enabled: e.target.checked })
                }
              />
              <div className="relative h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-background after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-base-url">
              {t("admin:ai.baseUrlLabel", {
                defaultValue: "API base URL",
              })}
            </Label>
            <Input
              id="ai-base-url"
              type="url"
              value={form.baseUrl}
              placeholder="https://api.openai.com"
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t("admin:ai.baseUrlHelp", {
                defaultValue:
                  "OpenAI-compatible endpoint. The client appends /v1/chat/completions.",
              })}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-api-key">
              {t("admin:ai.apiKeyLabel", { defaultValue: "API key" })}
            </Label>
            <Input
              id="ai-api-key"
              type="password"
              value={form.apiKey}
              placeholder="sk-..."
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t("admin:ai.apiKeyHelp", {
                defaultValue:
                  "Stored encrypted. Sent as Bearer token. Never returned in responses.",
              })}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-model">
              {t("admin:ai.modelLabel", { defaultValue: "Model" })}
            </Label>
            <Input
              id="ai-model"
              value={form.model}
              placeholder="gpt-4o"
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t("admin:ai.modelHelp", {
                defaultValue:
                  "Any model name accepted by your API. Default: gpt-4o.",
              })}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-workdir-root">
              {t("admin:ai.workdirRootLabel", {
                defaultValue: "Agent working directory root",
              })}
            </Label>
            <Input
              id="ai-workdir-root"
              value={form.workdirRoot ?? ""}
              placeholder="Leave empty for the default (data/agent-workdir)"
              onChange={(e) =>
                setForm({
                  ...form,
                  workdirRoot: e.target.value || null,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              {t("admin:ai.workdirRootHelp", {
                defaultValue:
                  "Server-side directory where pi-agent clones repos and stores uploaded files. Each project is isolated under agent-<projectId>.",
              })}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-command-timeout">
              {t("admin:ai.commandTimeoutLabel", {
                defaultValue: "Command timeout (ms)",
              })}
            </Label>
            <Input
              id="ai-command-timeout"
              type="number"
              value={String(form.commandTimeoutMs)}
              onChange={(e) =>
                setForm({
                  ...form,
                  commandTimeoutMs: Number(e.target.value) || 60000,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              {t("admin:ai.commandTimeoutHelp", {
                defaultValue:
                  "Max run time for agent_run_command. Default: 60000ms.",
              })}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base">
                {t("admin:ai.enableCommandLabel", {
                  defaultValue: "Enable command execution",
                })}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("admin:ai.enableCommandDescription", {
                  defaultValue:
                    "Allow pi-agent to run shell commands in the project working directory. Enable only if you trust the models and the environment.",
                })}
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={form.enableCommandExecution}
                onChange={(e) =>
                  setForm({
                    ...form,
                    enableCommandExecution: e.target.checked,
                  })
                }
              />
              <div className="relative h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-background after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={updateConfig.isPending || isLoading}
          >
            <SaveIcon className="size-4" />
            {updateConfig.isPending
              ? t("admin:ai.saving", { defaultValue: "Saving…" })
              : t("admin:ai.save", { defaultValue: "Save" })}
          </Button>
        </div>
      </div>
    </>
  );
}
