import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type GetProjectsRequest = InferRequestType<
  (typeof client)["project"]["$get"]
>["query"];

async function getProjects({ teamId, includeArchived }: GetProjectsRequest) {
  if (!teamId) return;

  const response = await client.project.$get({
    query: includeArchived ? { teamId, includeArchived } : { teamId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();

  return data;
}

export default getProjects;
