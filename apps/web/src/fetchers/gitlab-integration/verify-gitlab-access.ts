import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono";

export type VerifyGitLabAccessRequest = InferRequestType<
  (typeof client)["gitlab-integration"]["verify"]["$post"]
>["json"];

export type VerifyGitLabAccessResponse = InferResponseType<
  (typeof client)["gitlab-integration"]["verify"]["$post"],
  200
>;

async function verifyGitLabAccess(
  data: VerifyGitLabAccessRequest,
): Promise<VerifyGitLabAccessResponse> {
  const response = await client["gitlab-integration"].verify.$post({
    json: data,
  });

  if (!response.ok) {
    const raw = await response.text();
    let error: { message?: string } | null = null;
    try {
      error = JSON.parse(raw);
    } catch {
      // Surface the HTTP status so the toast remains actionable when the
      // server returns an empty or non-JSON body (e.g. proxies, 502 pages).
      throw new Error(`Request failed (HTTP ${response.status})`);
    }
    throw new Error(error?.message ?? "Request failed");
  }

  return response.json();
}

export default verifyGitLabAccess;
