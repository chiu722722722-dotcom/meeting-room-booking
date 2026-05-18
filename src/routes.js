import express from "express";
import crypto from "node:crypto";
import { healthCheckDatabase } from "./db.js";
import { buildLineWorksAuthUrl, exchangeLineWorksCode, fetchLineWorksUser, sendBotMessageToAdminChannel, sendBotMessageToUser } from "./lineWorks.js";

export const router = express.Router();

router.get("/api/health", async (req, res) => {
  try {
    const database = await healthCheckDatabase();
    res.json({ ok: true, database });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

router.get("/api/auth/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

router.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

router.get("/auth/line-works", (req, res) => {
  const state = crypto.randomBytes(24).toString("hex");
  req.session.lineWorksState = state;
  res.redirect(buildLineWorksAuthUrl(state));
});

router.get("/auth/line-works/callback", async (req, res, next) => {
  try {
    const { code, state } = req.query;
    if (!code || !state || state !== req.session.lineWorksState) {
      res.status(400).send("Invalid LINE WORKS login state.");
      return;
    }

    const token = await exchangeLineWorksCode(String(code));
    const lineWorksUser = await fetchLineWorksUser(token.access_token);

    req.session.user = {
      id: lineWorksUser.userId || lineWorksUser.id || lineWorksUser.email,
      lineWorksUserId: lineWorksUser.userId || lineWorksUser.id || "",
      name: lineWorksUser.userName || lineWorksUser.displayName || lineWorksUser.email || "LINE WORKS User",
      email: lineWorksUser.email || "",
      role: "user",
    };

    res.redirect("/");
  } catch (error) {
    next(error);
  }
});

router.post("/api/line-works/test-message", requireAdmin, async (req, res, next) => {
  try {
    const text = req.body?.text || "LINE WORKS 會議室預約系統測試通知";
    const results = [];

    if (req.session.user?.lineWorksUserId) {
      results.push(await sendBotMessageToUser(req.session.user.lineWorksUserId, text));
    }
    results.push(await sendBotMessageToAdminChannel(text));

    res.json({ ok: true, results });
  } catch (error) {
    next(error);
  }
});

router.get("/api/rooms", placeholder("rooms list"));
router.post("/api/rooms", requirePermission("rooms"), placeholder("create room"));
router.patch("/api/rooms/:id", requirePermission("rooms"), placeholder("update room"));
router.delete("/api/rooms/:id", requirePermission("rooms"), placeholder("delete room"));

router.get("/api/bookings", placeholder("bookings list"));
router.post("/api/bookings", placeholder("create booking and notify user/admin channel"));
router.delete("/api/bookings/:id", placeholder("cancel booking and notify user/admin channel"));

router.get("/api/reports/summary", requirePermission("reports"), placeholder("report summary"));
router.get("/api/users", requirePermission("accounts"), placeholder("users list"));
router.post("/api/users", requirePermission("accounts"), placeholder("create user"));
router.patch("/api/users/:id", requirePermission("accounts"), placeholder("update user"));
router.delete("/api/users/:id", requirePermission("accounts"), placeholder("delete user"));

function placeholder(name) {
  return (req, res) => {
    res.status(501).json({ ok: false, message: `${name} API is planned but not implemented yet.` });
  };
}

function requireAdmin(req, res, next) {
  if (req.session.user?.role === "admin") {
    next();
    return;
  }
  res.status(403).json({ ok: false, message: "Admin permission required." });
}

function requirePermission(permission) {
  return (req, res, next) => {
    const role = req.session.user?.role;
    const rolePermissions = {
      admin: ["reports", "rooms", "accounts"],
      manager: ["reports", "rooms"],
      viewer: ["reports"],
      user: [],
    };

    if ((rolePermissions[role] || []).includes(permission)) {
      next();
      return;
    }
    res.status(403).json({ ok: false, message: "Permission denied." });
  };
}
