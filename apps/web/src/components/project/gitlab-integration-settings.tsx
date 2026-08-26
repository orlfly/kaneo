import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  GitBranch,
  Import,
  Link,
  RefreshCw,
  Unlink,
  XCircle,
} from "lucide-react";
import React from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod/v4";
import { GitLabRepositoryBrowserModal } from "@/components/project/gitlab-repository-browser-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { VerifyGitLabAccessResponse } from "@/fetchers/gitlab-integration/verify-gitlab-access";
import {
  useCreateGitLabIntegration,
  useDeleteGitLabIntegration,
  useVerifyGitLabAccess,
} from "@/hooks/mutations/gitlab-integration/use-create-gitlab-integration";
import useImportGitLabIssues from "@/hooks/mutations/gitlab-integration/use-import-gitlab-issues";
import { useUpdateGitLabIntegration } from "@/hooks/mutations/gitlab-integration/use-update-gitlab-integration";
import useGetGitLabIntegration from "@/hooks/queries/gitlab-integration/use-get-gitlab-integration";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";

type GitLabIntegrationFormValues = {
  baseUrl: string;
  accessToken: string;
  repositoryOwner: string;
  repositoryName: string;
};

type GitLabVerificationSnapshot = {
  baseUrl: string;
  accessToken: string;
  repositoryOwner: string;
  repositoryName: string;
};

type GitLabVerificationState = {
  result: VerifyGitLabAccessResponse;
  verified: GitLabVerificationSnapshot;
};

function createVerificationSnapshot(
  values: GitLabIntegrationFormValues,
): GitLabVerificationSnapshot {
  return {
    baseUrl: values.baseUrl.trim(),
    accessToken: values.accessToken.trim(),
    repositoryOwner: values.repositoryOwner.trim(),
    repositoryName: values.repositoryName.trim(),
  };
}

export function GitLabIntegrationSettings({
  projectId,
}: {
  projectId: string;
}) {
  const { t } = useTranslation();

  const gitlabIntegrationSchema = React.useMemo(
    () =>
      z.object({
        baseUrl: z
          .string()
          .min(1, t("settings:gitlabIntegration.validation.baseUrlRequired"))
          .refine((s) => {
            try {
              new URL(s);
              return true;
            } catch {
              return false;
            }
          }, t("settings:gitlabIntegration.validation.baseUrlInvalid")),
        accessToken: z.string(),
        repositoryOwner: z
          .string()
          .min(1, t("settings:gitlabIntegration.validation.ownerRequired"))
          .regex(
            // GitLab namespaces can nest groups (e.g. group/subgroup).
            /^[a-zA-Z0-9_./-]+$/,
            t("settings:gitlabIntegration.validation.ownerInvalid"),
          ),
        repositoryName: z
          .string()
          .min(1, t("settings:gitlabIntegration.validation.nameRequired"))
          .regex(
            /^[a-zA-Z0-9._-]+$/,
            t("settings:gitlabIntegration.validation.nameInvalid"),
          ),
      }),
    [t],
  );

  const {
    data: integration,
    isLoading,
    error: integrationError,
    refetch: refetchIntegration,
  } = useGetGitLabIntegration(projectId);
  const { mutateAsync: createIntegration, isPending: isCreating } =
    useCreateGitLabIntegration();
  const { mutateAsync: deleteIntegration, isPending: isDeleting } =
    useDeleteGitLabIntegration();
  const { mutateAsync: verifyAccess, isPending: isVerifying } =
    useVerifyGitLabAccess();
  const { mutateAsync: importIssues, isPending: isImporting } =
    useImportGitLabIssues();
  const { mutateAsync: updateGitLabSettings, isPending: isUpdatingSettings } =
    useUpdateGitLabIntegration();

  const [verificationResult, setVerificationResult] =
    React.useState<GitLabVerificationState | null>(null);
  const [showRepositoryBrowser, setShowRepositoryBrowser] =
    React.useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = React.useState(false);

  const form = useForm<GitLabIntegrationFormValues>({
    resolver: standardSchemaResolver(gitlabIntegrationSchema),
    defaultValues: {
      baseUrl: "",
      accessToken: "",
      repositoryOwner: "",
      repositoryName: "",
    },
  });

  const resetIntegrationForm = React.useCallback(() => {
    if (!integration?.baseUrl) {
      return;
    }

    form.reset({
      baseUrl: integration.baseUrl,
      accessToken: "",
      repositoryOwner: integration.repositoryOwner,
      repositoryName: integration.repositoryName,
    });
    // Intentionally clear verify state after reload: import must not run until the user re-verifies (token/URL may have changed).
    // Clear verify state when the form reloads so import cannot run against stale credentials.
    setVerificationResult(null);
    setShowWebhookSecret(false);
  }, [
    form.reset,
    integration?.baseUrl,
    integration?.repositoryOwner,
    integration?.repositoryName,
  ]);

  React.useEffect(() => {
    resetIntegrationForm();
  }, [resetIntegrationForm]);

  const runVerify = React.useCallback(
    async (data: GitLabIntegrationFormValues, showToast = true) => {
      const token = data.accessToken.trim();
      if (!token && integration) {
        return;
      }
      if (!token && !integration) {
        if (showToast) {
          toast.error(
            t("settings:gitlabIntegration.toast.tokenRequiredVerify"),
          );
        }
        setVerificationResult(null);
        return;
      }
      try {
        const snapshot = createVerificationSnapshot(data);
        const result = await verifyAccess({
          projectId,
          baseUrl: snapshot.baseUrl,
          accessToken: snapshot.accessToken,
          repositoryOwner: snapshot.repositoryOwner,
          repositoryName: snapshot.repositoryName,
        });
        setVerificationResult({
          result,
          verified: snapshot,
        });
        if (showToast) {
          if (result.isInstalled && result.hasRequiredPermissions) {
            toast.success(t("settings:gitlabIntegration.toast.verifyOk"));
          } else if (result.failureReason === "redirected") {
            toast.error(t("settings:gitlabIntegration.toast.redirected"));
          } else if (result.failureReason === "not_a_gitlab_instance") {
            toast.error(
              t("settings:gitlabIntegration.toast.notGitLabInstance"),
            );
          } else if (result.failureReason === "repository_not_found") {
            toast.error(t("settings:gitlabIntegration.toast.repoNotFound"));
          } else {
            toast.warning(t("settings:gitlabIntegration.toast.verifyWarning"));
          }
        }
      } catch (error) {
        if (showToast) {
          toast.error(
            error instanceof Error
              ? error.message
              : t("settings:gitlabIntegration.toast.verifyError"),
          );
        }
        setVerificationResult(null);
      }
    },
    [verifyAccess, integration, projectId, t],
  );

  const baseUrl = form.watch("baseUrl");
  const accessToken = form.watch("accessToken");
  const repositoryOwner = form.watch("repositoryOwner");
  const repositoryName = form.watch("repositoryName");
  const currentVerificationSnapshot = React.useMemo(
    () =>
      createVerificationSnapshot({
        baseUrl,
        accessToken,
        repositoryOwner,
        repositoryName,
      }),
    [baseUrl, accessToken, repositoryOwner, repositoryName],
  );

  React.useEffect(() => {
    setVerificationResult((current) => {
      if (!current) {
        return current;
      }

      const stillMatches =
        current.verified.baseUrl === currentVerificationSnapshot.baseUrl &&
        current.verified.accessToken ===
          currentVerificationSnapshot.accessToken &&
        current.verified.repositoryOwner ===
          currentVerificationSnapshot.repositoryOwner &&
        current.verified.repositoryName ===
          currentVerificationSnapshot.repositoryName;

      return stillMatches ? current : null;
    });
  }, [currentVerificationSnapshot]);

  React.useEffect(() => {
    if (
      !baseUrl ||
      !repositoryOwner ||
      !repositoryName ||
      !form.formState.isValid
    ) {
      return;
    }
    if (!accessToken.trim()) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      runVerify(form.getValues(), false);
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    baseUrl,
    repositoryOwner,
    repositoryName,
    accessToken,
    form.formState.isValid,
    runVerify,
    form.getValues,
  ]);

  const onSubmit = async (data: GitLabIntegrationFormValues) => {
    try {
      if (!data.accessToken.trim() && !integration) {
        toast.error(t("settings:gitlabIntegration.toast.tokenRequired"));
        return;
      }

      const snapshot = createVerificationSnapshot(data);
      const hasMatchingVerification =
        verificationResult?.result.isInstalled &&
        verificationResult.result.hasRequiredPermissions &&
        verificationResult.verified.baseUrl === snapshot.baseUrl &&
        verificationResult.verified.accessToken === snapshot.accessToken &&
        verificationResult.verified.repositoryOwner ===
          snapshot.repositoryOwner &&
        verificationResult.verified.repositoryName === snapshot.repositoryName;

      if (data.accessToken.trim() && !hasMatchingVerification) {
        const verification = await verifyAccess({
          projectId,
          baseUrl: snapshot.baseUrl,
          accessToken: snapshot.accessToken,
          repositoryOwner: snapshot.repositoryOwner,
          repositoryName: snapshot.repositoryName,
        });

        if (!verification.isInstalled || !verification.hasRequiredPermissions) {
          toast.error(t("settings:gitlabIntegration.toast.verifyFirst"));
          return;
        }
      }

      await createIntegration({
        projectId,
        data: {
          baseUrl: data.baseUrl,
          ...(data.accessToken.trim()
            ? { accessToken: data.accessToken.trim() }
            : {}),
          repositoryOwner: data.repositoryOwner,
          repositoryName: data.repositoryName,
        },
      });
      form.setValue("accessToken", "");
      toast.success(t("settings:gitlabIntegration.toast.updated"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:gitlabIntegration.toast.updateError"),
      );
    }
  };

  const handleDelete = async () => {
    try {
      await deleteIntegration(projectId);
      form.reset({
        baseUrl: "",
        accessToken: "",
        repositoryOwner: "",
        repositoryName: "",
      });
      setVerificationResult(null);
      toast.success(t("settings:gitlabIntegration.toast.removed"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:gitlabIntegration.toast.removeError"),
      );
    }
  };

  const handleImportIssues = async () => {
    try {
      await importIssues(projectId);
      toast.success(t("settings:gitlabIntegration.toast.issuesImported"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:gitlabIntegration.toast.importError"),
      );
    }
  };

  const handleRepositorySelect = (repository: {
    owner: string;
    name: string;
  }) => {
    form.setValue("repositoryOwner", repository.owner, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
    form.setValue("repositoryName", repository.name, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
    setShowRepositoryBrowser(false);
    setVerificationResult(null);
  };

  const handleCopyWebhookSecret = React.useCallback(async () => {
    if (!integration?.webhookSecret) {
      return;
    }

    try {
      await navigator.clipboard.writeText(integration.webhookSecret);
      toast.success(t("settings:gitlabIntegration.toast.secretCopied"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:gitlabIntegration.toast.unableToCopySecret"),
      );
    }
  }, [integration?.webhookSecret, t]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-muted rounded animate-pulse w-full" />
      </div>
    );
  }

  if (integrationError) {
    return (
      <div className="space-y-4 border border-destructive/25 rounded-md p-4 bg-sidebar">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">
              {t("common:error.title")}
            </p>
            <p className="text-sm text-muted-foreground">
              {integrationError instanceof Error
                ? integrationError.message
                : t("settings:gitlabIntegration.toast.updateError")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetchIntegration()}
          >
            {t("settings:gitlabIntegration.retry")}
          </Button>
        </div>
      </div>
    );
  }

  const isConnected = !!integration && integration.isActive;
  // Import stays disabled until the user verifies again after changing connection details (avoids importing with an unverified token).
  const hasVerifiedCurrentValues =
    verificationResult?.result.isInstalled &&
    verificationResult.result.hasRequiredPermissions &&
    verificationResult.verified.baseUrl ===
      currentVerificationSnapshot.baseUrl &&
    verificationResult.verified.accessToken ===
      currentVerificationSnapshot.accessToken &&
    verificationResult.verified.repositoryOwner ===
      currentVerificationSnapshot.repositoryOwner &&
    verificationResult.verified.repositoryName ===
      currentVerificationSnapshot.repositoryName;
  const canImport = isConnected && Boolean(hasVerifiedCurrentValues);

  const repoUrl =
    integration?.baseUrl && integration.repositoryOwner
      ? `${integration.baseUrl.replace(/\/$/, "")}/${integration.repositoryOwner}/${integration.repositoryName}`
      : null;

  return (
    <div className="space-y-4">
      <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              {t("settings:gitlabIntegration.connectionStatus")}
            </p>
            {isConnected ? (
              <p className="text-xs text-muted-foreground">
                {t("settings:gitlabIntegration.connectedActive")}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("settings:gitlabIntegration.notConnectedHint")}
              </p>
            )}
          </div>
          {isConnected ? (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle className="w-3 h-3" />
              {t("settings:gitlabIntegration.badgeConnected")}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <XCircle className="w-3 h-3" />
              {t("settings:gitlabIntegration.badgeNotConnected")}
            </Badge>
          )}
        </div>

        {isConnected && integration && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {t("settings:gitlabIntegration.repository")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("settings:gitlabIntegration.repositoryHint")}
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">
                  {integration.repositoryOwner}/{integration.repositoryName}
                </span>
                {repoUrl && (
                  <a
                    href={repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            <Separator />
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium">
                  {t("settings:gitlabIntegration.commentTaskLinkTitle")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("settings:gitlabIntegration.commentTaskLinkHint")}
                </p>
              </div>
              <Switch
                checked={integration.commentTaskLinkOnGitLabIssue ?? true}
                onCheckedChange={async (checked) => {
                  try {
                    await updateGitLabSettings({
                      projectId,
                      json: { commentTaskLinkOnGitLabIssue: checked },
                    });
                    toast.success(
                      checked
                        ? t("settings:gitlabIntegration.toast.commentOnEnabled")
                        : t(
                            "settings:gitlabIntegration.toast.commentOnDisabled",
                          ),
                    );
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : t(
                            "settings:gitlabIntegration.toast.settingsUpdateError",
                          ),
                    );
                  }
                }}
                disabled={isUpdatingSettings}
              />
            </div>

            {integration.webhookUrl && (
              <>
                <Separator />
                <div className="space-y-2 text-xs">
                  <p className="font-medium text-sm">
                    {t("settings:gitlabIntegration.webhookTitle")}
                  </p>
                  <p className="text-muted-foreground">
                    {t("settings:gitlabIntegration.webhookHint")}
                  </p>
                  <code className="block break-all rounded bg-muted px-2 py-1 text-[11px]">
                    {integration.webhookUrl}
                  </code>
                  <p className="text-muted-foreground mt-2">
                    {t("settings:gitlabIntegration.webhookSecretLabel")}
                  </p>
                  <div className="flex items-start gap-2">
                    <code className="block flex-1 break-all rounded bg-muted px-2 py-1 text-[11px]">
                      {showWebhookSecret
                        ? integration.webhookSecret
                        : "••••••••••••••••••••••••••••••••"}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setShowWebhookSecret((current) => !current)
                      }
                    >
                      {showWebhookSecret
                        ? t("settings:gitlabIntegration.webhookHide")
                        : t("settings:gitlabIntegration.webhookShow")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyWebhookSecret}
                    >
                      {t("settings:gitlabIntegration.webhookCopy")}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="baseUrl"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-medium">
                        {t("settings:gitlabIntegration.baseUrlLabel")}
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("settings:gitlabIntegration.baseUrlHint")}
                      </p>
                    </div>
                    <FormControl>
                      <Input
                        className="w-72"
                        placeholder="https://gitlab.example.com"
                        {...field}
                        disabled={isCreating || isDeleting}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="accessToken"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-medium">
                        {t("settings:gitlabIntegration.tokenLabel")}
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("settings:gitlabIntegration.tokenHint")}
                        {integration?.maskedAccessToken
                          ? ` (${t("settings:gitlabIntegration.currentToken")}: ${integration.maskedAccessToken})`
                          : null}
                      </p>
                    </div>
                    <FormControl>
                      <Input
                        className="w-72"
                        type="password"
                        autoComplete="off"
                        placeholder={
                          integration
                            ? t(
                                "settings:gitlabIntegration.tokenPlaceholderUpdate",
                              )
                            : t("settings:gitlabIntegration.tokenPlaceholder")
                        }
                        {...field}
                        disabled={isCreating || isDeleting}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="repositoryOwner"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-medium">
                        {t("settings:gitlabIntegration.ownerLabel")}
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("settings:gitlabIntegration.ownerHint")}
                      </p>
                    </div>
                    <FormControl>
                      <Input
                        className="w-64"
                        {...field}
                        disabled={isCreating || isDeleting}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="repositoryName"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-medium">
                        {t("settings:gitlabIntegration.repoNameLabel")}
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("settings:gitlabIntegration.repoNameHint")}
                      </p>
                    </div>
                    <FormControl>
                      <Input
                        className="w-64"
                        {...field}
                        disabled={isCreating || isDeleting}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {t("settings:gitlabIntegration.actionsTitle")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("settings:gitlabIntegration.actionsHint")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRepositoryBrowser(true)}
                  className="gap-2"
                  disabled={!baseUrl || !accessToken.trim()}
                >
                  <GitBranch className="size-3" />
                  {t("settings:gitlabIntegration.browse")}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => runVerify(form.getValues())}
                  disabled={
                    isVerifying ||
                    !baseUrl.trim() ||
                    !accessToken.trim() ||
                    !repositoryOwner.trim() ||
                    !repositoryName.trim() ||
                    (!accessToken.trim() && !integration)
                  }
                  className="gap-2"
                >
                  <RefreshCw
                    className={cn("size-3", isVerifying && "animate-spin")}
                  />
                  {t("settings:gitlabIntegration.verify")}
                </Button>

                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    isCreating ||
                    isDeleting ||
                    !form.formState.isValid ||
                    (verificationResult ? !hasVerifiedCurrentValues : false)
                  }
                  className="gap-2"
                >
                  <Link className="size-3" />
                  {isConnected
                    ? t("settings:gitlabIntegration.update")
                    : t("settings:gitlabIntegration.connect")}
                </Button>

                {isConnected && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isCreating || isDeleting}
                    className="gap-2"
                  >
                    <Unlink className="size-3" />
                    {t("settings:gitlabIntegration.disconnect")}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Form>

        {verificationResult && (
          <>
            <Separator />
            <div
              className={cn(
                "flex items-start gap-3 p-3 border rounded-md text-sm",
                verificationResult.result.isInstalled &&
                  verificationResult.result.hasRequiredPermissions
                  ? "border-success/25 bg-success/10"
                  : verificationResult.result.failureReason
                    ? "border-destructive/25 bg-destructive/10"
                    : "border-warning/25 bg-warning/10",
              )}
            >
              {verificationResult.result.isInstalled &&
              verificationResult.result.hasRequiredPermissions ? (
                <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-success-foreground" />
              ) : verificationResult.result.failureReason ? (
                <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive-foreground" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning-foreground" />
              )}
              <div className="flex-1">
                <p className="font-medium">
                  {verificationResult.result.message}
                </p>
              </div>
            </div>

            {(verificationResult.result.authenticatedAs ||
              verificationResult.result.tokenScopes.length > 0 ||
              verificationResult.result.repositoryPrivate !== null) && (
              <>
                <Separator />
                <div className="space-y-3 text-xs">
                  {verificationResult.result.authenticatedAs && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-20">
                        {t("settings:gitlabIntegration.authedAs")}
                      </span>
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        {verificationResult.result.authenticatedAs.avatarUrl ? (
                          <img
                            src={
                              verificationResult.result.authenticatedAs
                                .avatarUrl
                            }
                            alt=""
                            className="h-5 w-5 rounded-full"
                            referrerPolicy="no-referrer"
                          />
                        ) : null}
                        <span>
                          {verificationResult.result.authenticatedAs.username}
                          {verificationResult.result.authenticatedAs.name
                            ? ` (${verificationResult.result.authenticatedAs.name})`
                            : ""}
                        </span>
                        {verificationResult.result.authenticatedAs.bot && (
                          <Badge variant="outline" className="text-[10px]">
                            bot
                          </Badge>
                        )}
                      </span>
                    </div>
                  )}

                  {verificationResult.result.repositoryPrivate !== null && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-20">
                        {t("settings:gitlabIntegration.repoVisibility")}
                      </span>
                      <span className="font-medium text-foreground">
                        {verificationResult.result.repositoryPrivate
                          ? t("settings:gitlabIntegration.repoPrivate")
                          : t("settings:gitlabIntegration.repoPublic")}
                      </span>
                    </div>
                  )}

                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground min-w-20">
                      {t("settings:gitlabIntegration.tokenScopes")}
                    </span>
                    <span className="flex-1">
                      {verificationResult.result.tokenScopes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {verificationResult.result.tokenScopes.map(
                            (scope) => (
                              <Badge
                                key={scope}
                                variant="secondary"
                                className="text-[10px] font-mono"
                              >
                                {scope}
                              </Badge>
                            ),
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          {t("settings:gitlabIntegration.tokenScopesEmpty")}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {isConnected && (
        <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                {t("settings:gitlabIntegration.importSectionTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("settings:gitlabIntegration.importSectionHint")}
              </p>
            </div>
            <Button
              onClick={handleImportIssues}
              disabled={isImporting || !canImport}
              className="gap-2"
              size="sm"
              variant="outline"
            >
              {isImporting ? (
                <RefreshCw className="size-3 animate-spin" />
              ) : (
                <Import className="size-3" />
              )}
              {isImporting
                ? t("settings:gitlabIntegration.importing")
                : t("settings:gitlabIntegration.importIssues")}
            </Button>
          </div>
          {!canImport && (
            <>
              <Separator />
              <p className="text-xs text-muted-foreground">
                {t("settings:gitlabIntegration.importDisabledHint")}
              </p>
            </>
          )}
        </div>
      )}

      <GitLabRepositoryBrowserModal
        open={showRepositoryBrowser}
        projectId={projectId}
        onOpenChange={setShowRepositoryBrowser}
        onSelectRepository={handleRepositorySelect}
        selectedRepository={
          repositoryOwner && repositoryName
            ? `${repositoryOwner}/${repositoryName}`
            : undefined
        }
        baseUrl={baseUrl}
        accessToken={accessToken}
      />
    </div>
  );
}
