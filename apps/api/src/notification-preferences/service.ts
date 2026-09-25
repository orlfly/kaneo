import { and, eq, inArray, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import {
  projectTable,
  teamMemberTable,
  userNotificationPreferenceTable,
  userNotificationTeamProjectTable,
  userNotificationTeamRuleTable,
} from "../database/schema";
import { assertPublicWebhookDestination } from "../plugins/generic-webhook/config";
import { decryptSecret, encryptSecret } from "./secrets";

export type NotificationPreferenceProjectMode = "all" | "selected";

export type NotificationPreferenceResponse = {
  emailAddress: string | null;
  emailEnabled: boolean;
  ntfyEnabled: boolean;
  ntfyConfigured: boolean;
  ntfyServerUrl: string | null;
  ntfyTopic: string | null;
  ntfyTokenConfigured: boolean;
  maskedNtfyToken: string | null;
  gotifyEnabled: boolean;
  gotifyConfigured: boolean;
  gotifyServerUrl: string | null;
  gotifyTokenConfigured: boolean;
  maskedGotifyToken: string | null;
  webhookEnabled: boolean;
  webhookConfigured: boolean;
  webhookUrl: string | null;
  webhookSecretConfigured: boolean;
  maskedWebhookSecret: string | null;
  taskAssignmentEnabled: boolean;
  taskCommentEnabled: boolean;
  taskStatusChangeEnabled: boolean;
  dueDateReminderEnabled: boolean;
  dueDateReminderLeadTimeMinutes: number;
  teams: Array<{
    id: string;
    teamId: string;
    teamName: string;
    isActive: boolean;
    emailEnabled: boolean;
    ntfyEnabled: boolean;
    gotifyEnabled: boolean;
    webhookEnabled: boolean;
    projectMode: NotificationPreferenceProjectMode;
    selectedProjectIds: string[];
    createdAt: Date;
    updatedAt: Date;
  }>;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type UpdateNotificationPreferenceInput = {
  emailEnabled?: boolean;
  ntfyEnabled?: boolean;
  ntfyServerUrl?: string | null;
  ntfyTopic?: string | null;
  ntfyToken?: string | null;
  gotifyEnabled?: boolean;
  gotifyServerUrl?: string | null;
  gotifyToken?: string | null;
  webhookEnabled?: boolean;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  taskAssignmentEnabled?: boolean;
  taskCommentEnabled?: boolean;
  taskStatusChangeEnabled?: boolean;
  dueDateReminderEnabled?: boolean;
  dueDateReminderLeadTimeMinutes?: number;
};

export type UpsertTeamRuleInput = {
  isActive: boolean;
  emailEnabled: boolean;
  ntfyEnabled: boolean;
  gotifyEnabled: boolean;
  webhookEnabled: boolean;
  projectMode: NotificationPreferenceProjectMode;
  selectedProjectIds?: string[];
};

type TeamRuleChannelState = {
  emailEnabled: boolean;
  ntfyEnabled: boolean;
  gotifyEnabled: boolean;
  webhookEnabled: boolean;
};

function normalizeOptionalString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return value === null ? null : undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function maskValue(value: string | undefined | null): string | null {
  if (!value) return null;
  return value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : "••••";
}

function normalizeSecretInput(
  inputValue: string | null | undefined,
  existingValue: string | null | undefined,
) {
  if (inputValue === undefined) {
    return normalizeOptionalString(existingValue ?? undefined);
  }

  return normalizeOptionalString(inputValue);
}

async function assertTeamMembership(userId: string, teamId: string) {
  const [membership] = await db
    .select({ teamId: teamMemberTable.teamId })
    .from(teamMemberTable)
    .where(
      and(
        eq(teamMemberTable.userId, userId),
        eq(teamMemberTable.teamId, teamId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new HTTPException(403, {
      message: "You don't have access to this team",
    });
  }
}

export async function validateProjectSelection(
  teamId: string,
  selectedProjectIds: string[],
) {
  if (selectedProjectIds.length === 0) {
    throw new HTTPException(400, {
      message: "Select at least one project for selected project mode",
    });
  }

  const projects = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.teamId, teamId),
        inArray(projectTable.id, selectedProjectIds),
      ),
    );

  if (projects.length !== selectedProjectIds.length) {
    throw new HTTPException(400, {
      message: "One or more selected projects are invalid",
    });
  }
}

export async function getNotificationPreferences(
  userId: string,
  emailAddress: string | null,
): Promise<NotificationPreferenceResponse> {
  const preference = await db.query.userNotificationPreferenceTable.findFirst({
    where: eq(userNotificationPreferenceTable.userId, userId),
  });

  const decryptedPreference = preference
    ? {
        ...preference,
        ntfyToken: decryptSecret(preference.ntfyToken),
        gotifyToken: decryptSecret(preference.gotifyToken),
        webhookSecret: decryptSecret(preference.webhookSecret),
      }
    : null;

  const rules = await db.query.userNotificationTeamRuleTable.findMany({
    where: eq(userNotificationTeamRuleTable.userId, userId),
    with: {
      team: true,
      selectedProjects: true,
    },
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });

  return {
    emailAddress,
    emailEnabled: decryptedPreference?.emailEnabled ?? false,
    ntfyEnabled: decryptedPreference?.ntfyEnabled ?? false,
    ntfyConfigured: Boolean(
      decryptedPreference?.ntfyServerUrl && decryptedPreference?.ntfyTopic,
    ),
    ntfyServerUrl: decryptedPreference?.ntfyServerUrl ?? null,
    ntfyTopic: decryptedPreference?.ntfyTopic ?? null,
    ntfyTokenConfigured: Boolean(decryptedPreference?.ntfyToken),
    maskedNtfyToken: maskValue(decryptedPreference?.ntfyToken),
    gotifyEnabled: decryptedPreference?.gotifyEnabled ?? false,
    gotifyConfigured: Boolean(
      decryptedPreference?.gotifyServerUrl && decryptedPreference?.gotifyToken,
    ),
    gotifyServerUrl: decryptedPreference?.gotifyServerUrl ?? null,
    gotifyTokenConfigured: Boolean(decryptedPreference?.gotifyToken),
    maskedGotifyToken: maskValue(decryptedPreference?.gotifyToken),
    webhookEnabled: decryptedPreference?.webhookEnabled ?? false,
    webhookConfigured: Boolean(decryptedPreference?.webhookUrl),
    webhookUrl: decryptedPreference?.webhookUrl ?? null,
    webhookSecretConfigured: Boolean(decryptedPreference?.webhookSecret),
    maskedWebhookSecret: maskValue(decryptedPreference?.webhookSecret),
    taskAssignmentEnabled: preference?.taskAssignmentEnabled ?? true,
    taskCommentEnabled: preference?.taskCommentEnabled ?? true,
    taskStatusChangeEnabled: preference?.taskStatusChangeEnabled ?? true,
    dueDateReminderEnabled: preference?.dueDateReminderEnabled ?? true,
    dueDateReminderLeadTimeMinutes:
      preference?.dueDateReminderLeadTimeMinutes ?? 1440,
    teams: rules.map((rule) => ({
      id: rule.id,
      teamId: rule.teamId,
      teamName: rule.team.name,
      isActive: rule.isActive ?? true,
      emailEnabled: rule.emailEnabled ?? false,
      ntfyEnabled: rule.ntfyEnabled ?? false,
      gotifyEnabled: rule.gotifyEnabled ?? false,
      webhookEnabled: rule.webhookEnabled ?? false,
      projectMode:
        rule.projectMode === "selected" ? "selected" : ("all" as const),
      selectedProjectIds: rule.selectedProjects.map(
        (project) => project.projectId,
      ),
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    })),
    createdAt: preference?.createdAt ?? null,
    updatedAt: preference?.updatedAt ?? null,
  };
}

export async function updateNotificationPreferences(
  userId: string,
  emailAddress: string | null,
  input: UpdateNotificationPreferenceInput,
): Promise<NotificationPreferenceResponse> {
  const existing = await db.query.userNotificationPreferenceTable.findFirst({
    where: eq(userNotificationPreferenceTable.userId, userId),
  });

  const decryptedExisting = existing
    ? {
        ...existing,
        ntfyToken: decryptSecret(existing.ntfyToken),
        gotifyToken: decryptSecret(existing.gotifyToken),
        webhookSecret: decryptSecret(existing.webhookSecret),
      }
    : null;

  const ntfyServerUrl = normalizeOptionalString(
    input.ntfyServerUrl ?? decryptedExisting?.ntfyServerUrl,
  );
  const ntfyTopic = normalizeOptionalString(
    input.ntfyTopic ?? decryptedExisting?.ntfyTopic,
  );
  const ntfyToken = normalizeSecretInput(
    input.ntfyToken,
    decryptedExisting?.ntfyToken,
  );
  const gotifyServerUrl = normalizeOptionalString(
    input.gotifyServerUrl ?? decryptedExisting?.gotifyServerUrl,
  );
  const gotifyToken = normalizeSecretInput(
    input.gotifyToken,
    decryptedExisting?.gotifyToken,
  );
  const webhookUrl = normalizeOptionalString(
    input.webhookUrl ?? decryptedExisting?.webhookUrl,
  );
  const webhookSecret = normalizeSecretInput(
    input.webhookSecret,
    decryptedExisting?.webhookSecret,
  );

  const emailEnabled =
    input.emailEnabled ?? decryptedExisting?.emailEnabled ?? false;
  const ntfyEnabled =
    input.ntfyEnabled ?? decryptedExisting?.ntfyEnabled ?? false;
  const gotifyEnabled =
    input.gotifyEnabled ?? decryptedExisting?.gotifyEnabled ?? false;
  const webhookEnabled =
    input.webhookEnabled ?? decryptedExisting?.webhookEnabled ?? false;

  const enabledRuleCascade: TeamRuleChannelState = {
    emailEnabled: false,
    ntfyEnabled: false,
    gotifyEnabled: false,
    webhookEnabled: false,
  };

  const shouldValidateNtfy =
    ntfyEnabled ||
    input.ntfyServerUrl !== undefined ||
    input.ntfyTopic !== undefined ||
    input.ntfyToken !== undefined;

  const shouldValidateGotify =
    gotifyEnabled ||
    input.gotifyServerUrl !== undefined ||
    input.gotifyToken !== undefined;

  const shouldValidateWebhook =
    webhookEnabled ||
    input.webhookUrl !== undefined ||
    input.webhookSecret !== undefined;

  if (emailEnabled && !emailAddress) {
    throw new HTTPException(400, {
      message: "Email notifications require an account email address",
    });
  }

  if (shouldValidateNtfy) {
    if (!ntfyServerUrl || !ntfyTopic) {
      throw new HTTPException(400, {
        message: "ntfy requires a server URL and topic",
      });
    }

    try {
      new URL(ntfyServerUrl);
      await assertPublicWebhookDestination(ntfyServerUrl);
    } catch (error) {
      throw new HTTPException(400, {
        message:
          error instanceof Error ? error.message : "Invalid ntfy server URL",
      });
    }
  }

  if (shouldValidateGotify) {
    if (!gotifyServerUrl || !gotifyToken) {
      throw new HTTPException(400, {
        message: "Gotify requires a server URL and app token",
      });
    }

    try {
      new URL(gotifyServerUrl);
      await assertPublicWebhookDestination(gotifyServerUrl);
    } catch (error) {
      throw new HTTPException(400, {
        message:
          error instanceof Error ? error.message : "Invalid Gotify server URL",
      });
    }
  }

  if (shouldValidateWebhook) {
    if (!webhookUrl) {
      throw new HTTPException(400, {
        message: "Webhook notifications require an endpoint URL",
      });
    }

    try {
      new URL(webhookUrl);
      await assertPublicWebhookDestination(webhookUrl);
    } catch (error) {
      throw new HTTPException(400, {
        message: error instanceof Error ? error.message : "Invalid webhook URL",
      });
    }
  }

  const data = {
    userId,
    emailEnabled,
    ntfyEnabled,
    ntfyServerUrl,
    ntfyTopic,
    ntfyToken:
      input.ntfyToken === undefined
        ? (existing?.ntfyToken ?? null)
        : (encryptSecret(ntfyToken) ?? null),
    gotifyEnabled,
    gotifyServerUrl,
    gotifyToken:
      input.gotifyToken === undefined
        ? (existing?.gotifyToken ?? null)
        : (encryptSecret(gotifyToken) ?? null),
    webhookEnabled,
    webhookUrl,
    webhookSecret:
      input.webhookSecret === undefined
        ? (existing?.webhookSecret ?? null)
        : (encryptSecret(webhookSecret) ?? null),
    taskAssignmentEnabled:
      input.taskAssignmentEnabled ?? existing?.taskAssignmentEnabled ?? true,
    taskCommentEnabled:
      input.taskCommentEnabled ?? existing?.taskCommentEnabled ?? true,
    taskStatusChangeEnabled:
      input.taskStatusChangeEnabled ??
      existing?.taskStatusChangeEnabled ??
      true,
    dueDateReminderEnabled:
      input.dueDateReminderEnabled ?? existing?.dueDateReminderEnabled ?? true,
    dueDateReminderLeadTimeMinutes:
      input.dueDateReminderLeadTimeMinutes ??
      existing?.dueDateReminderLeadTimeMinutes ??
      1440,
  };

  if (existing) {
    await db
      .update(userNotificationPreferenceTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(userNotificationPreferenceTable.userId, userId));
  } else {
    await db.insert(userNotificationPreferenceTable).values(data);
  }

  const ruleCascade: {
    emailEnabled?: boolean;
    ntfyEnabled?: boolean;
    gotifyEnabled?: boolean;
    webhookEnabled?: boolean;
  } = {};

  const hadEmailEnabled = decryptedExisting?.emailEnabled ?? false;
  const hadNtfyEnabled = decryptedExisting?.ntfyEnabled ?? false;
  const hadGotifyEnabled = decryptedExisting?.gotifyEnabled ?? false;
  const hadWebhookEnabled = decryptedExisting?.webhookEnabled ?? false;

  if (!emailEnabled) {
    ruleCascade.emailEnabled = false;
  }

  if (!ntfyEnabled || !ntfyServerUrl || !ntfyTopic) {
    ruleCascade.ntfyEnabled = false;
  }

  if (!gotifyEnabled || !gotifyServerUrl || !data.gotifyToken) {
    ruleCascade.gotifyEnabled = false;
  }

  if (!webhookEnabled || !webhookUrl) {
    ruleCascade.webhookEnabled = false;
  }

  if (emailEnabled && !hadEmailEnabled && emailAddress) {
    enabledRuleCascade.emailEnabled = true;
  }

  if (ntfyEnabled && !hadNtfyEnabled && ntfyServerUrl && ntfyTopic) {
    enabledRuleCascade.ntfyEnabled = true;
  }

  if (
    gotifyEnabled &&
    !hadGotifyEnabled &&
    gotifyServerUrl &&
    data.gotifyToken
  ) {
    enabledRuleCascade.gotifyEnabled = true;
  }

  if (webhookEnabled && !hadWebhookEnabled && webhookUrl) {
    enabledRuleCascade.webhookEnabled = true;
  }

  const ruleEnableCascade = Object.fromEntries(
    Object.entries(enabledRuleCascade).filter(([, value]) => value),
  ) as Partial<TeamRuleChannelState>;

  if (
    Object.keys(ruleCascade).length > 0 ||
    Object.keys(ruleEnableCascade).length > 0
  ) {
    await db
      .update(userNotificationTeamRuleTable)
      .set({
        ...ruleEnableCascade,
        ...ruleCascade,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userNotificationTeamRuleTable.userId, userId),
          eq(userNotificationTeamRuleTable.isActive, true),
          or(
            eq(userNotificationTeamRuleTable.emailEnabled, true),
            eq(userNotificationTeamRuleTable.ntfyEnabled, true),
            eq(userNotificationTeamRuleTable.gotifyEnabled, true),
            eq(userNotificationTeamRuleTable.webhookEnabled, true),
          ),
        ),
      );
  }

  return getNotificationPreferences(userId, emailAddress);
}

export async function upsertTeamRule(
  userId: string,
  teamId: string,
  emailAddress: string | null,
  input: UpsertTeamRuleInput,
): Promise<NotificationPreferenceResponse> {
  await assertTeamMembership(userId, teamId);

  if (input.projectMode === "selected") {
    await validateProjectSelection(teamId, input.selectedProjectIds ?? []);
  }

  const preference = await db.query.userNotificationPreferenceTable.findFirst({
    where: eq(userNotificationPreferenceTable.userId, userId),
  });

  if (input.emailEnabled && (!preference?.emailEnabled || !emailAddress)) {
    throw new HTTPException(400, {
      message: "Enable email notifications globally before using them here",
    });
  }

  if (
    input.ntfyEnabled &&
    (!preference?.ntfyEnabled ||
      !preference.ntfyServerUrl ||
      !preference.ntfyTopic)
  ) {
    throw new HTTPException(400, {
      message: "Enable ntfy notifications globally before using them here",
    });
  }

  if (
    input.webhookEnabled &&
    (!preference?.webhookEnabled || !preference.webhookUrl)
  ) {
    throw new HTTPException(400, {
      message: "Enable webhook notifications globally before using them here",
    });
  }

  if (
    input.gotifyEnabled &&
    (!preference?.gotifyEnabled ||
      !preference.gotifyServerUrl ||
      !preference.gotifyToken)
  ) {
    throw new HTTPException(400, {
      message: "Enable Gotify notifications globally before using them here",
    });
  }

  const existing = await db.query.userNotificationTeamRuleTable.findFirst({
    where: and(
      eq(userNotificationTeamRuleTable.userId, userId),
      eq(userNotificationTeamRuleTable.teamId, teamId),
    ),
  });

  let ruleId = existing?.id;

  if (existing) {
    await db
      .update(userNotificationTeamRuleTable)
      .set({
        isActive: input.isActive,
        emailEnabled: input.emailEnabled,
        ntfyEnabled: input.ntfyEnabled,
        gotifyEnabled: input.gotifyEnabled,
        webhookEnabled: input.webhookEnabled,
        projectMode: input.projectMode,
        updatedAt: new Date(),
      })
      .where(eq(userNotificationTeamRuleTable.id, existing.id));
  } else {
    const [createdRule] = await db
      .insert(userNotificationTeamRuleTable)
      .values({
        userId,
        teamId,
        isActive: input.isActive,
        emailEnabled: input.emailEnabled,
        ntfyEnabled: input.ntfyEnabled,
        gotifyEnabled: input.gotifyEnabled,
        webhookEnabled: input.webhookEnabled,
        projectMode: input.projectMode,
      })
      .returning({ id: userNotificationTeamRuleTable.id });
    ruleId = createdRule?.id;
  }

  if (!ruleId) {
    throw new HTTPException(500, {
      message: "Failed to save notification team rule",
    });
  }

  const teamRuleId = ruleId;

  await db
    .delete(userNotificationTeamProjectTable)
    .where(eq(userNotificationTeamProjectTable.teamRuleId, teamRuleId));

  if (input.projectMode === "selected") {
    await db.insert(userNotificationTeamProjectTable).values(
      (input.selectedProjectIds ?? []).map((projectId) => ({
        teamId,
        teamRuleId: teamRuleId,
        projectId,
      })),
    );
  }

  return getNotificationPreferences(userId, emailAddress);
}

export async function deleteTeamRule(
  userId: string,
  teamId: string,
  emailAddress: string | null,
): Promise<NotificationPreferenceResponse> {
  await assertTeamMembership(userId, teamId);

  const existing = await db.query.userNotificationTeamRuleTable.findFirst({
    where: and(
      eq(userNotificationTeamRuleTable.userId, userId),
      eq(userNotificationTeamRuleTable.teamId, teamId),
    ),
  });

  if (!existing) {
    throw new HTTPException(404, {
      message: "Team notification rule not found",
    });
  }

  await db
    .delete(userNotificationTeamRuleTable)
    .where(eq(userNotificationTeamRuleTable.id, existing.id));

  return getNotificationPreferences(userId, emailAddress);
}
