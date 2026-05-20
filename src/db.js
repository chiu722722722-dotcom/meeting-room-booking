import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const pool = config.databaseUrl
  ? new Pool({
      connectionString: normalizeDatabaseUrl(config.databaseUrl),
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    })
  : null;

function normalizeDatabaseUrl(databaseUrl) {
  if (process.env.NODE_ENV !== "production") return databaseUrl;
  const url = new URL(databaseUrl);
  url.searchParams.delete("sslmode");
  return url.toString();
}

export async function query(text, params = []) {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return pool.query(text, params);
}

export async function initDatabase() {
  if (!pool) return;
  const schema = await fs.readFile(path.resolve(__dirname, "../migrations/001_initial_schema.sql"), "utf8");
  await pool.query(schema);
  await seedDefaults();
}

async function seedDefaults() {
  const adminHash = await bcrypt.hash("admin123", 10);
  await query(
    `insert into users (id, username, display_name, password_hash, role, status)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (id) do nothing`,
    ["admin", "admin", "系統管理員", adminHash, "admin", "active"],
  );

  const rooms = [
    ["a", "A 會議室", 6, "白板、視訊鏡頭", "active"],
    ["b", "B 會議室", 10, "投影機、HDMI", "active"],
    ["c", "C 會議室", 16, "大型螢幕、麥克風", "active"],
  ];

  for (const room of rooms) {
    await query(
      `insert into rooms (id, name, capacity, equipment, status)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do nothing`,
      room,
    );
  }
}

export async function healthCheckDatabase() {
  if (!pool) return { configured: false, ok: false };
  await pool.query("select 1");
  return { configured: true, ok: true };
}
