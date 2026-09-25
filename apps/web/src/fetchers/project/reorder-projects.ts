import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";

async function reorderProjects(
  teamId: string,
  projects: Array<{ id: string; position: number }>,
) {
  const response = await client.project.reorder.$put({
    query: { teamId },
    json: { projects },
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return response.json();
}

export default reorderProjects;
