import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono";

export type ListGitLabRepositoriesRequest = InferRequestType<
  (typeof client)["gitlab-integration"]["repositories"]["$post"]
>["json"];

export type ListGitLabRepositoriesResponse = InferResponseType<
  (typeof client)["gitlab-integration"]["repositories"]["$post"],
  200
>;

async function listGitLabRepositories(
  data: ListGitLabRepositoriesRequest,
): Promise<ListGitLabRepositoriesResponse> {
  const response = await client["gitlab-integration"].repositories.$post({
    json: data,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || "Request failed");
  }

  return response.json();
}

export default listGitLabRepositories;
