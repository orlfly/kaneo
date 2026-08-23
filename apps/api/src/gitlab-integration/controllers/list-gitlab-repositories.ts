import { HTTPException } from "hono/http-exception";
import { normalizeGitLabBaseUrl } from "../../plugins/gitlab/config";
import {
  createGitLabClient,
  verifyGitLabToken,
} from "../../plugins/gitlab/utils/gitlab-api";

type RepoRow = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: { login: string };
  html_url: string;
};

async function listGitLabRepositories({
  baseUrl,
  accessToken,
}: {
  baseUrl: string;
  accessToken: string;
}): Promise<{ repositories: RepoRow[] }> {
  const normalized = normalizeGitLabBaseUrl(baseUrl);

  try {
    await verifyGitLabToken(normalized, accessToken);
  } catch {
    throw new HTTPException(401, {
      message: "Invalid GitLab token or could not reach instance.",
    });
  }

  const client = createGitLabClient({
    baseUrl: normalized,
    accessToken,
  });

  const all: RepoRow[] = [];
  let page = 1;

  while (true) {
    const batch = await client.listUserRepos(page, 50);
    if (!batch.length) break;

    for (const repo of batch) {
      const ownerLogin = repo.owner?.login ?? repo.owner?.username ?? "";
      all.push({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        owner: { login: ownerLogin },
        html_url: repo.html_url,
      });
    }

    if (batch.length < 50) break;
    page += 1;
    if (page > 50) break;
  }

  return { repositories: all };
}

export default listGitLabRepositories;
