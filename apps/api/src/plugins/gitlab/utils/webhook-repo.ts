import { normalizeGitLabBaseUrl } from "../config";

/**
 * Derives the GitLab instance base URL from a webhook project. GitLab webhook
 * payloads carry project.web_url and project.path_with_namespace, so the
 * instance origin is web_url minus the project path.
 */
export function baseUrlFromProject(project: {
  web_url?: string;
  path_with_namespace?: string;
}): string {
  try {
    const webUrl = (project.web_url ?? "").replace(/\/+$/, "");
    const path = (project.path_with_namespace ?? "").replace(/^\/|\/$/g, "");
    if (!webUrl || !path || !webUrl.endsWith(`/${path}`)) {
      return "";
    }
    return normalizeGitLabBaseUrl(webUrl.slice(0, webUrl.length - path.length));
  } catch {
    return "";
  }
}

/** Splits a GitLab path_with_namespace into the namespace and project name. */
export function splitProjectPath(pathWithNamespace: string): {
  owner: string;
  name: string;
} {
  const path = pathWithNamespace.replace(/^\/|\/$/g, "");
  const idx = path.lastIndexOf("/");
  if (idx === -1) {
    return { owner: path, name: path };
  }
  return { owner: path.slice(0, idx), name: path.slice(idx + 1) };
}
