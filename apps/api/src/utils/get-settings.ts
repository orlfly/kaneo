import { config } from "dotenv-mono";
import { isGithubSsoConfigured } from "./github-sso-env";

config();

function getSettings() {
  return {
    disableRegistration: process.env.DISABLE_REGISTRATION === "true",
    disablePasswordRegistration:
      process.env.DISABLE_PASSWORD_REGISTRATION === "true",
    disableEmailOtpSignIn: process.env.DISABLE_EMAIL_OTP_SIGN_IN === "true",
    disableWorkspaceCreation: process.env.DISABLE_WORKSPACE_CREATION === "true",
    isDemoMode: process.env.DEMO_MODE === "true",
    hasGithubSignIn: isGithubSsoConfigured(),
    hasGoogleSignIn:
      Boolean(process.env.GOOGLE_CLIENT_ID) &&
      Boolean(process.env.GOOGLE_CLIENT_SECRET),
    hasDiscordSignIn:
      Boolean(process.env.DISCORD_CLIENT_ID) &&
      Boolean(process.env.DISCORD_CLIENT_SECRET),
    hasCustomOAuth:
      Boolean(process.env.CUSTOM_OAUTH_CLIENT_ID) &&
      Boolean(process.env.CUSTOM_OAUTH_CLIENT_SECRET),
    hasGuestAccess: [
      "DISABLE_GUEST_ACCESS",
      "DISABLE_REGISTRATION",
      "DISABLE_PASSWORD_REGISTRATION",
      "DISABLE_LOGIN_FORM",
    ].every((key) => process.env[key] !== "true"),
    // SMTP-backed email (OTP sign-in, magic links) was removed with the email
    // module; the flag stays for config-shape compatibility.
    hasSmtp: false,
    disableLoginForm: process.env.DISABLE_LOGIN_FORM === "true",
    customOAuthAutoLogin: process.env.CUSTOM_OAUTH_AUTO_LOGIN === "true",
    customOAuthLogoutUrl: process.env.CUSTOM_OAUTH_LOGOUT_URL || null,
    // Billing was removed alongside the workspace concept. Hardcode to false
    // so existing consumers don't read a stale value. See change
    // "introduce-teams-remove-workspaces".
    billingEnabled: false,
  };
}

export default getSettings;
