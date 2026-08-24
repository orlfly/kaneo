import { config } from "dotenv-mono";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  accountTableRelations,
  activityTableRelations,
  apikeyTableRelations,
  assetTableRelations,
  chatMessageTableRelations,
  columnTableRelations,
  commentTableRelations,
  externalLinkTableRelations,
  githubIntegrationTableRelations,
  integrationTableRelations,
  labelTableRelations,
  notificationTableRelations,
  projectTableRelations,
  sessionTableRelations,
  taskRelationTableRelations,
  taskTableRelations,
  teamMemberTableRelations,
  teamTableRelations,
  timeEntryTableRelations,
  userNotificationPreferenceTableRelations,
  userNotificationTeamProjectTableRelations,
  userNotificationTeamRuleTableRelations,
  userTableRelations,
  verificationTableRelations,
  workflowRuleTableRelations,
} from "./relations";
import { resolveDatabaseConnectionString } from "./resolve-database-url";
import {
  accountTable,
  activityTable,
  apikeyTable,
  assetTable,
  chatConfigTable,
  chatMessageTable,
  columnTable,
  commentTable,
  deviceCodeTable,
  externalLinkTable,
  githubIntegrationTable,
  integrationTable,
  labelTable,
  notificationTable,
  projectTable,
  sessionTable,
  taskRelationTable,
  taskTable,
  teamMemberTable,
  teamTable,
  timeEntryTable,
  userAvatarTable,
  userNotificationPreferenceTable,
  userNotificationTeamProjectTable,
  userNotificationTeamRuleTable,
  userTable,
  verificationTable,
  workflowRuleTable,
} from "./schema";

config();

export const schema = {
  accountTable,
  assetTable,
  activityTable,
  apikeyTable,
  columnTable,
  commentTable,
  chatConfigTable,
  chatMessageTable,
  deviceCodeTable,
  externalLinkTable,
  githubIntegrationTable,
  integrationTable,
  labelTable,
  notificationTable,
  projectTable,
  sessionTable,
  taskRelationTable,
  taskTable,
  teamMemberTable,
  teamTable,
  timeEntryTable,
  userTable,
  userAvatarTable,
  userNotificationPreferenceTable,
  userNotificationTeamProjectTable,
  userNotificationTeamRuleTable,
  verificationTable,
  workflowRuleTable,
  accountTableRelations,
  assetTableRelations,
  activityTableRelations,
  apikeyTableRelations,
  columnTableRelations,
  commentTableRelations,
  chatMessageTableRelations,
  externalLinkTableRelations,
  githubIntegrationTableRelations,
  integrationTableRelations,
  labelTableRelations,
  notificationTableRelations,
  projectTableRelations,
  sessionTableRelations,
  taskRelationTableRelations,
  taskTableRelations,
  teamMemberTableRelations,
  teamTableRelations,
  timeEntryTableRelations,
  userTableRelations,
  userNotificationPreferenceTableRelations,
  userNotificationTeamProjectTableRelations,
  userNotificationTeamRuleTableRelations,
  verificationTableRelations,
  workflowRuleTableRelations,
};

type DatabaseInstance = ReturnType<typeof drizzle<typeof schema>>;

let pool: Pool | undefined;
let dbInstance: DatabaseInstance | undefined;

export function getDatabasePool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: resolveDatabaseConnectionString(),
      // Fail fast when Railway's internal network is slow rather than hanging
      // indefinitely and blocking every API request.
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: 10,
    });
  }

  return pool;
}

export function getDatabase(): DatabaseInstance {
  if (!dbInstance) {
    dbInstance = drizzle(getDatabasePool(), {
      schema,
    });
  }

  return dbInstance;
}

const db = new Proxy({} as DatabaseInstance, {
  get(_target, property, receiver) {
    const value = Reflect.get(getDatabase(), property, receiver);

    if (typeof value === "function") {
      return value.bind(getDatabase());
    }

    return value;
  },
});

export default db;
