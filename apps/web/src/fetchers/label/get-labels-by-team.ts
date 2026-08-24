import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetLabelsByTeamRequest = InferRequestType<
  (typeof client)["label"]["team"][":teamId"]["$get"]
>["param"];

async function getLabelsByTeam({ teamId }: GetLabelsByTeamRequest) {
  const response = await client.label.team[":teamId"].$get({
    param: {
      teamId,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();
  return data;
}

export default getLabelsByTeam;
