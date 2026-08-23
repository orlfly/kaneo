import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGitLabClient,
  GitLabApiError,
  verifyGitLabToken,
} from "../../../apps/api/src/plugins/gitlab/utils/gitlab-api";

const originalAllowPrivate =
  process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS;

function makeResponse(status: number, body: string | object = ""): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = "true";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  if (originalAllowPrivate === undefined) {
    delete process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS;
  } else {
    process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = originalAllowPrivate;
  }
  vi.unstubAllGlobals();
});

const client = createGitLabClient({
  baseUrl: "https://gitlab.example.com",
  accessToken: "glpat-test",
});

function lastRequest() {
  const [input, init] = fetchMock.mock.calls.at(-1) as [
    string,
    { method?: string; body?: string; headers?: Record<string, string> },
  ];
  return {
    url: input as string,
    method: init?.method ?? "GET",
    body: init?.body ? JSON.parse(init.body as string) : undefined,
    token: init?.headers?.["PRIVATE-TOKEN"],
  };
}

describe("GitLab API client request building", () => {
  it("builds the URL-encoded project path and uses PRIVATE-TOKEN auth", async () => {
    fetchMock.mockResolvedValue(
      makeResponse(200, {
        id: 7,
        name: "my-app",
        path_with_namespace: "acme/my-app",
        web_url: "https://gitlab.example.com/acme/my-app",
        visibility: "public",
        namespace: { full_path: "acme" },
      }),
    );
    await client.getRepo("acme", "my-app");

    const req = lastRequest();
    expect(req.url).toBe(
      "https://gitlab.example.com/api/v4/projects/acme%2Fmy-app",
    );
    expect(req.token).toBe("glpat-test");
  });

  it("creates an issue and maps iid/description/web_url", async () => {
    fetchMock.mockResolvedValue(
      makeResponse(200, {
        id: 100,
        iid: 42,
        title: "Fix bug",
        description: "Steps…",
        state: "opened",
        web_url: "https://gitlab.example.com/acme/my-app/-/issues/42",
        labels: ["priority:high"],
        author: { id: 1, username: "jdoe", avatar_url: "http://a/x.png" },
      }),
    );
    const issue = await client.createIssue("acme", "my-app", {
      title: "Fix bug",
      body: "Steps…",
    });

    const req = lastRequest();
    expect(req.method).toBe("POST");
    expect(req.url).toContain("/issues");
    expect(req.body).toEqual({ title: "Fix bug", description: "Steps…" });

    expect(issue.number).toBe(42);
    expect(issue.body).toBe("Steps…");
    expect(issue.html_url).toContain("/-/issues/42");
    expect(issue.labels?.map((l) => l.name)).toEqual(["priority:high"]);
    expect(issue.user?.login).toBe("jdoe");
  });

  it("translates closed/open state into GitLab state_event", async () => {
    fetchMock.mockResolvedValue(
      makeResponse(200, {
        id: 100,
        iid: 42,
        title: "T",
        description: null,
        state: "closed",
        web_url: "https://gitlab.example.com/acme/my-app/-/issues/42",
      }),
    );
    await client.updateIssue("acme", "my-app", 42, { state: "closed" });
    let req = lastRequest();
    expect(req.body).toEqual({ state_event: "close" });
    expect("state" in req.body).toBe(false);

    fetchMock.mockResolvedValue(
      makeResponse(200, {
        id: 100,
        iid: 42,
        title: "T",
        description: null,
        state: "opened",
        web_url: "https://gitlab.example.com/acme/my-app/-/issues/42",
      }),
    );
    await client.updateIssue("acme", "my-app", 42, { state: "open" });
    req = lastRequest();
    expect(req.body).toEqual({ state_event: "reopen" });
  });
});

describe("GitLab API client response mapping", () => {
  it("maps merge_requests into the pull request shape (source_branch -> head.ref)", async () => {
    fetchMock.mockResolvedValue(
      makeResponse(200, [
        {
          iid: 5,
          title: "MR title",
          description: "desc",
          state: "opened",
          web_url: "https://gitlab.example.com/acme/my-app/-/merge_requests/5",
          source_branch: "tes-9-login-bug",
          merged_at: null,
          author: { username: "mcarroll" },
        },
      ]),
    );
    const pulls = await client.listPulls("acme", "my-app", 1);

    expect(pulls[0].number).toBe(5);
    expect(pulls[0].head?.ref).toBe("tes-9-login-bug");
    expect(pulls[0].merged).toBe(false);
    expect(pulls[0].user?.login).toBe("mcarroll");
    expect(pulls[0].html_url).toContain("/-/merge_requests/5");
  });

  it("synthesizes stable note URLs with #note_ anchors", async () => {
    fetchMock.mockResolvedValue(
      makeResponse(200, [
        {
          id: 9001,
          body: "A comment",
          created_at: "2026-08-23T00:00:00Z",
          author: { username: "mcarroll" },
        },
      ]),
    );
    const comments = await client.listIssueComments(
      "acme",
      "my-app",
      42,
      1,
      100,
    );
    expect(comments[0].html_url).toBe(
      "https://gitlab.example.com/acme/my-app/-/issues/42#note_9001",
    );
    expect(comments[0].user?.login).toBe("mcarroll");
  });
});

describe("GitLab label merge semantics", () => {
  it("adds labels by PUTting the merged full label list", async () => {
    fetchMock
      .mockResolvedValueOnce(
        // getIssue
        makeResponse(200, {
          id: 100,
          iid: 42,
          title: "T",
          description: "",
          state: "opened",
          web_url: "https://gitlab.example.com/acme/my-app/-/issues/42",
          labels: ["existing", "priority:low"],
        }),
      )
      .mockResolvedValueOnce(
        // listLabels
        makeResponse(200, [
          { id: 1, name: "existing", color: "#aaa" },
          { id: 2, name: "priority:high", color: "#bbb" },
        ]),
      )
      .mockResolvedValueOnce(makeResponse(200, {}));

    await client.addLabelsToIssue("acme", "my-app", 42, [2]);

    const req = lastRequest();
    expect(req.method).toBe("PUT");
    expect(req.body.labels).toBe("existing,priority:low,priority:high");
  });

  it("removes a label by PUTting the remaining names", async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeResponse(200, {
          id: 100,
          iid: 42,
          title: "T",
          description: "",
          state: "opened",
          web_url: "https://gitlab.example.com/acme/my-app/-/issues/42",
          labels: ["keep", "drop"],
        }),
      )
      .mockResolvedValueOnce(
        makeResponse(200, [
          { id: 1, name: "keep", color: "#aaa" },
          { id: 2, name: "drop", color: "#bbb" },
        ]),
      )
      .mockResolvedValueOnce(makeResponse(200, {}));

    await client.removeLabelFromIssue("acme", "my-app", 42, 2);

    const req = lastRequest();
    expect(req.method).toBe("PUT");
    expect(req.body.labels).toBe("keep");
  });
});

describe("GitLab API error handling", () => {
  it("rejects redirects explicitly", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302 }));
    await expect(
      verifyGitLabToken("https://gitlab.example.com", "t"),
    ).rejects.toThrow(GitLabApiError);
    await expect(
      verifyGitLabToken("https://gitlab.example.com", "t"),
    ).rejects.toMatchObject({ kind: "REDIRECT" });
  });

  it("throws typed errors on non-2xx responses", async () => {
    fetchMock.mockResolvedValue(
      makeResponse(401, { message: "401 Unauthorized" }),
    );
    await expect(
      verifyGitLabToken("https://gitlab.example.com", "bad"),
    ).rejects.toMatchObject({ status: 401, kind: "HTTP_ERROR" });
  });
});
