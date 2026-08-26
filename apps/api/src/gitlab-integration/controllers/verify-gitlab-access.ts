import { HTTPException } from "hono/http-exception";
import { normalizeGitLabBaseUrl } from "../../plugins/gitlab/config";
import {
  createGitLabClient,
  GitLabApiError,
  getGitLabTokenInfo,
} from "../../plugins/gitlab/utils/gitlab-api";

async function verifyGitLabAccess({
  baseUrl,
  accessToken,
  repositoryOwner,
  repositoryName,
}: {
  baseUrl: string;
  accessToken: string;
  repositoryOwner: string;
  repositoryName: string;
}) {
  let tokenInfo: Awaited<ReturnType<typeof getGitLabTokenInfo>> | null = null;
  try {
    const normalized = normalizeGitLabBaseUrl(baseUrl);
    try {
      tokenInfo = await getGitLabTokenInfo(normalized, accessToken);
    } catch (error) {
      // A 404 from /user means the URL does not point at a GitLab instance
      // (or the token endpoint is misrouted), not a repository lookup
      // failure. Treat it like any other non-GitLab-instance signal.
      if (error instanceof GitLabApiError && error.status === 404) {
        return {
          isInstalled: false,
          hasRequiredPermissions: false,
          repositoryExists: false,
          repositoryPrivate: null,
          missingPermissions: [] as string[],
          authenticatedAs: null,
          tokenScopes: [] as string[],
          message: "The URL does not point to a GitLab instance.",
          failureReason: "not_a_gitlab_instance",
        };
      }
      throw error;
    }

    const client = createGitLabClient({
      baseUrl: normalized,
      accessToken,
    });

    const repo = await client.getRepo(repositoryOwner, repositoryName);

    const perms = repo.permissions;
    const hasIssuesWrite = perms?.admin === true || perms?.push === true;

    const authenticatedAs = tokenInfo
      ? {
          id: tokenInfo.user.id,
          username: tokenInfo.user.username,
          name: tokenInfo.user.name ?? null,
          avatarUrl: tokenInfo.user.avatar_url ?? null,
          bot: tokenInfo.user.bot ?? false,
        }
      : null;

    return {
      isInstalled: true,
      hasRequiredPermissions: Boolean(hasIssuesWrite),
      repositoryExists: true,
      repositoryPrivate: repo.private,
      missingPermissions: hasIssuesWrite ? [] : ["issues (write)"],
      authenticatedAs,
      tokenScopes: tokenInfo?.scopes ?? [],
      message: hasIssuesWrite
        ? `Token verified${authenticatedAs ? ` as ${authenticatedAs.username}` : ""}.`
        : "Token may not have sufficient permissions to manage issues.",
      failureReason: null,
    };
  } catch (error) {
    const err = error as { status?: number; message?: string };

    if (error instanceof GitLabApiError) {
      if (error.kind === "REDIRECT") {
        return {
          isInstalled: false,
          hasRequiredPermissions: false,
          repositoryExists: false,
          repositoryPrivate: null,
          missingPermissions: [] as string[],
          authenticatedAs: null,
          tokenScopes: [] as string[],
          message: `The GitLab URL redirected (HTTP ${error.status}). This usually means the server forces HTTPS. Please use the final URL directly.`,
          failureReason: "redirected",
        };
      }

      if (error.kind === "INVALID_JSON") {
        return {
          isInstalled: false,
          hasRequiredPermissions: false,
          repositoryExists: false,
          repositoryPrivate: null,
          missingPermissions: [] as string[],
          authenticatedAs: null,
          tokenScopes: [] as string[],
          message: "The URL does not point to a GitLab instance.",
          failureReason: "not_a_gitlab_instance",
        };
      }
    }

    if (err.status === 404) {
      return {
        isInstalled: false,
        hasRequiredPermissions: false,
        repositoryExists: false,
        repositoryPrivate: null,
        missingPermissions: [] as string[],
        authenticatedAs: tokenInfo
          ? {
              id: tokenInfo.user.id,
              username: tokenInfo.user.username,
              name: tokenInfo.user.name ?? null,
              avatarUrl: tokenInfo.user.avatar_url ?? null,
              bot: tokenInfo.user.bot ?? false,
            }
          : null,
        tokenScopes: tokenInfo?.scopes ?? [],
        message: "Repository not found or not accessible with this token.",
        failureReason: "repository_not_found",
      };
    }

    if (err.status === 401) {
      throw new HTTPException(401, {
        message: "Invalid GitLab token or unauthorized.",
      });
    }

    throw new HTTPException(500, {
      message:
        error instanceof Error
          ? error.message
          : "Failed to verify GitLab access",
    });
  }
}

export default verifyGitLabAccess;
