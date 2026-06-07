import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 8080),
  appBaseUrl: process.env.APP_BASE_URL || "http://127.0.0.1:8080",
  sessionSecret: process.env.SESSION_SECRET || "dev-session-secret-change-me",
  databaseUrl: process.env.DATABASE_URL || "",
  lineWorks: {
    clientId: process.env.LINE_WORKS_CLIENT_ID || "",
    clientSecret: process.env.LINE_WORKS_CLIENT_SECRET || "",
    domain: process.env.LINE_WORKS_DOMAIN || "",
    ownerEmail: process.env.LINE_WORKS_OWNER_EMAIL || "",
    redirectUri: process.env.LINE_WORKS_REDIRECT_URI || "",
    authorizationUrl: process.env.LINE_WORKS_AUTHORIZATION_URL || "https://auth.worksmobile.com/oauth2/v2.0/authorize",
    tokenUrl: process.env.LINE_WORKS_TOKEN_URL || "https://auth.worksmobile.com/oauth2/v2.0/token",
    userInfoUrl: process.env.LINE_WORKS_USERINFO_URL || "https://auth.worksmobile.com/oauth2/v2.0/userinfo",
    botId: process.env.LINE_WORKS_BOT_ID || "",
    serviceAccountId: process.env.LINE_WORKS_SERVICE_ACCOUNT_ID || "",
    privateKey: process.env.LINE_WORKS_PRIVATE_KEY || "",
    privateKeyPath: process.env.LINE_WORKS_PRIVATE_KEY_PATH || "",
    botScope: process.env.LINE_WORKS_BOT_SCOPE || "bot.message",
    adminChannelId: process.env.LINE_WORKS_ADMIN_CHANNEL_ID || "",
  },
};
