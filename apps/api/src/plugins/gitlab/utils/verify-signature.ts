import { timingSafeEqual } from "node:crypto";

/**
 * GitLab webhooks do not sign the payload. Instead GitLab sends the hook
 * `token` verbatim in the X-Gitlab-Token header, so verification is a
 * constant-time comparison of that token against our stored secret.
 */
export function verifyGitLabTokenHeader(
  _payload: string,
  secret: string,
  tokenHeader: string | undefined,
): boolean {
  if (!tokenHeader || !secret) {
    return false;
  }

  const provided = Buffer.from(tokenHeader.trim());
  const expected = Buffer.from(secret);

  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}

// Kept for clarity at call sites and to match the webhook-handler contract.
export function verifyGitLabWebhook(
  _payload: string,
  secret: string,
  tokenHeader: string | undefined,
): boolean {
  return verifyGitLabTokenHeader(_payload, secret, tokenHeader);
}
