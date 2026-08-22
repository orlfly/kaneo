import { eq } from "drizzle-orm";
import db from "../../database";
import { labelTable } from "../../database/schema";

function getLabelsByTeamId(teamId: string) {
  return db
    .select()
    .from(labelTable)
    .where(eq(labelTable.teamId, teamId));
}

export default getLabelsByTeamId;
