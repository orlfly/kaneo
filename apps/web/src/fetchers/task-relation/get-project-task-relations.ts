import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";

/**
 * Every relation with an endpoint in the project, with both tasks hydrated.
 * One request per project: the Gantt chart needs the whole graph, not one
 * round trip per bar.
 */
async function getProjectTaskRelations(projectId: string) {
  const response = await client.project[":id"]["task-relations"].$get({
    param: { id: projectId },
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return response.json();
}

export default getProjectTaskRelations;
