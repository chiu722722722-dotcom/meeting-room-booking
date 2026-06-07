import fs from "node:fs/promises";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

let cachedBotToken = null;
let cachedBotTokenExpiresAt = 0;

export function buildLineWorksAuthUrl(state) {
  const url = new URL(config.lineWorks.authorizationUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.lineWorks.clientId);
  url.searchParams.set("redirect_uri", config.lineWorks.redirectUri);
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeLineWorksCode(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.lineWorks.redirectUri,
    client_id: config.lineWorks.clientId,
    client_secret: config.lineWorks.clientSecret,
  });
  if (config.lineWorks.domain) body.set("domain", config.lineWorks.domain);

  const response = await fetch(config.lineWorks.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`LINE WORKS token exchange failed: ${response.status}`);
  }
  return response.json();
}

export async function fetchLineWorksUser(accessToken) {
  const response = await fetch(config.lineWorks.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`LINE WORKS user info failed: ${response.status}`);
  }
  return response.json();
}

export async function createServiceAccountJwt() {
  const privateKey = await readPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: config.lineWorks.clientId,
      sub: config.lineWorks.serviceAccountId,
      iat: now,
      exp: now + 3600,
    },
    privateKey,
    { algorithm: "RS256" },
  );
}

async function readPrivateKey() {
  if (config.lineWorks.privateKey) {
    return config.lineWorks.privateKey.replace(/\\n/g, "\n");
  }
  if (config.lineWorks.privateKeyPath) {
    return fs.readFile(config.lineWorks.privateKeyPath, "utf8");
  }
  throw new Error("LINE WORKS private key is not configured.");
}

async function getBotAccessToken() {
  if (process.env.LINE_WORKS_BOT_ACCESS_TOKEN) return process.env.LINE_WORKS_BOT_ACCESS_TOKEN;
  if (cachedBotToken && cachedBotTokenExpiresAt > Date.now() + 60000) return cachedBotToken;
  if (!config.lineWorks.clientId || !config.lineWorks.clientSecret || !config.lineWorks.serviceAccountId) {
    throw new Error("LINE WORKS service account settings are not configured.");
  }

  const assertion = await createServiceAccountJwt();
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
    client_id: config.lineWorks.clientId,
    client_secret: config.lineWorks.clientSecret,
    scope: config.lineWorks.botScope,
  });

  const response = await fetch(config.lineWorks.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`LINE WORKS bot token failed: ${response.status}`);
  }

  const token = await response.json();
  cachedBotToken = token.access_token;
  cachedBotTokenExpiresAt = Date.now() + Number(token.expires_in || 3600) * 1000;
  return cachedBotToken;
}

export async function sendBotMessageToUser(userId, text) {
  return sendBotMessage(`/bots/${config.lineWorks.botId}/users/${encodeURIComponent(userId)}/messages`, text);
}

export async function sendBotMessageToAdminChannel(text) {
  if (!config.lineWorks.adminChannelId) return null;
  return sendBotMessage(`/bots/${config.lineWorks.botId}/channels/${encodeURIComponent(config.lineWorks.adminChannelId)}/messages`, text);
}

async function sendBotMessage(path, text) {
  if (!config.lineWorks.botId) {
    return { skipped: true, reason: "LINE_WORKS_BOT_ID is not configured." };
  }
  const token = await getBotAccessToken();

  const response = await fetch(`https://www.worksapis.com/v1.0${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: {
        type: "text",
        text,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`LINE WORKS bot message failed: ${response.status}`);
  }
  return { ok: true };
}
