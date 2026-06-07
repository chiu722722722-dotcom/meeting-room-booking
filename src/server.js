import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { initDatabase, pool } from "./db.js";
import { startReminderScheduler } from "./reminders.js";
import { router } from "./routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const app = express();
const PgSession = connectPgSimple(session);

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(
  session({
    store: pool
      ? new PgSession({
          pool,
          createTableIfMissing: true,
        })
      : undefined,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);

app.use(router);
app.use(express.static(path.resolve(root, "web")));
app.get("*", (req, res) => {
  res.sendFile(path.resolve(root, "web/index.html"));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ ok: false, message: error.status ? error.message : "Internal server error." });
});

initDatabase()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`Meeting room booking system is running on port ${config.port}`);
      startReminderScheduler();
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  });
