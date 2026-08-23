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
    const error = await response
      .json()
      .catch(() => ({ message: "Request failed" }));
    throw new Error(
      typeof error === "object" && error && "message" in error
        ? String((error as { message: string }).message)
        : "Request failed",
    );
  }

  return response.json();
}

export default verifyGitLabAccess;
