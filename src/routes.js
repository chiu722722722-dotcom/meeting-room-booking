import express from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { config } from "./config.js";
import { healthCheckDatabase, query } from "./db.js";
import { buildBookingNotification, buildCancelUrl, verifyCancelSignature } from "./bookingNotifications.js";
import { buildLineWorksAuthUrl, exchangeLineWorksCode, fetchLineWorksUser, sendBotMessageToAdminChannel, sendBotMessageToUser } from "./lineWorks.js";

export const router = express.Router();

const rolePermissions = {
  admin: ["reports", "rooms", "accounts", "logs"],
  manager: ["reports", "rooms"],
  viewer: ["reports"],
  user: [],
};

router.get("/api/health", async (req, res) => {
  try {
    const database = await healthCheckDatabase();
    res.json({ ok: true, database });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

router.get("/api/bootstrap", async (req, res, next) => {
  try {
    res.json({
      rooms: await listRooms("all"),
      bookings: await listBookings(req.query.from, req.query.to),
      user: req.session.user || null,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/api/auth/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const result = await query("select * from users where username = $1", [username]);
    const user = result.rows[0];

    if (!user || user.status !== "active" || !user.password_hash || !(await bcrypt.compare(password || "", user.password_hash))) {
      res.status(401).json({ ok: false, message: "帳號或密碼錯誤，或帳號已停用。" });
      return;
    }

    req.session.user = toSessionUser(user);
    res.json({ ok: true, user: req.session.user });
  } catch (error) {
    next(error);
  }
});

router.post("/api/auth/woff", async (req, res, next) => {
  try {
    const accessToken = String(req.body?.accessToken || "");
    if (!accessToken) {
      res.status(400).json({ ok: false, message: "Missing WOFF access token." });
      return;
    }
    const lineWorksUser = await fetchLineWorksUser(accessToken);
    const user = await upsertLineWorksUser(lineWorksUser);
    req.session.user = toSessionUser(user);
    res.json({ ok: true, user: req.session.user });
  } catch (error) {
    next(error);
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
  if (!config.lineWorks.clientId || !config.lineWorks.clientSecret || !config.lineWorks.redirectUri) {
    res.status(503).send("LINE WORKS SSO is not configured.");
    return;
  }
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
    const user = await upsertLineWorksUser(lineWorksUser);
    req.session.user = toSessionUser(user);
    res.redirect("/");
  } catch (error) {
    next(error);
  }
});

router.get("/api/rooms", async (req, res, next) => {
  try {
    res.json({ rooms: await listRooms(req.query.status || "active") });
  } catch (error) {
    next(error);
  }
});

router.post("/api/rooms", requirePermission("rooms"), async (req, res, next) => {
  try {
    const room = normalizeRoom(req.body);
    const result = await query(
      `insert into rooms (id, name, capacity, equipment, status)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [crypto.randomUUID(), room.name, room.capacity, room.equipment, room.status],
    );
    await audit(req, "room.create", "room", result.rows[0].id, result.rows[0]);
    res.status(201).json({ room: mapRoom(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.patch("/api/rooms/:id", requirePermission("rooms"), async (req, res, next) => {
  try {
    const room = normalizeRoom(req.body);
    const result = await query(
      `update rooms
       set name = $2, capacity = $3, equipment = $4, status = $5, updated_at = now()
       where id = $1
       returning *`,
      [req.params.id, room.name, room.capacity, room.equipment, room.status],
    );
    if (!result.rowCount) {
      res.status(404).json({ ok: false, message: "找不到會議室。" });
      return;
    }
    await audit(req, "room.update", "room", result.rows[0].id, result.rows[0]);
    res.json({ room: mapRoom(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.delete("/api/rooms/:id", requirePermission("rooms"), async (req, res, next) => {
  try {
    const bookings = await query("select count(*)::int as count from bookings where room_id = $1", [req.params.id]);
    if (bookings.rows[0].count > 0) {
      const result = await query("update rooms set status = 'inactive', updated_at = now() where id = $1 returning *", [req.params.id]);
      await audit(req, "room.disable", "room", req.params.id, result.rows[0]);
      res.json({ room: mapRoom(result.rows[0]), disabled: true });
      return;
    }

    await query("delete from rooms where id = $1", [req.params.id]);
    await audit(req, "room.delete", "room", req.params.id, {});
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/api/bookings", async (req, res, next) => {
  try {
    res.json({ bookings: await listBookings(req.query.from, req.query.to) });
  } catch (error) {
    next(error);
  }
});

router.post("/api/bookings", requireUser, async (req, res, next) => {
  try {
    const booking = normalizeBooking({ ...req.body, host: req.session.user.name });
    const validation = await validateBooking(booking);
    if (!validation.ok) {
      res.status(400).json(validation);
      return;
    }

    const result = await query(
      `insert into bookings (id, room_id, user_id, host_name, subject, date, start_time, end_time, attendees, note, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
       returning *`,
      [
        crypto.randomUUID(),
        booking.roomId,
        req.session.user?.id || null,
        booking.host,
        booking.subject,
        booking.date,
        booking.start,
        booking.end,
        booking.attendees,
        booking.note,
      ],
    );
    const saved = mapBooking(result.rows[0]);
    await audit(req, "booking.create", "booking", saved.id, saved);
    notifyBookingChange(
      req.session.user,
      buildBookingNotification("會議室預約已建立", saved, {
        cancelUrl: buildCancelUrl(saved.id, req.session.user.id),
      }),
    );
    res.status(201).json({ booking: saved });
  } catch (error) {
    next(error);
  }
});

router.delete("/api/bookings/:id", requireUser, async (req, res, next) => {
  try {
    const bookingResult = await query("select * from bookings where id = $1", [req.params.id]);
    if (!bookingResult.rowCount) {
      res.status(404).json({ ok: false, message: "找不到預約。" });
      return;
    }
    const target = bookingResult.rows[0];
    if (target.user_id !== req.session.user.id && !req.session.user.isOwner) {
      res.status(403).json({ ok: false, message: "只能取消自己建立的預約。" });
      return;
    }
    const result = await query("delete from bookings where id = $1 returning *", [req.params.id]);
    const removed = mapBooking(result.rows[0]);
    await audit(req, "booking.delete", "booking", removed.id, removed);
    notifyBookingChange(
      req.session.user,
      buildBookingNotification("會議室預約已取消", removed, { accentColor: "#B42318" }),
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/booking/cancel/:id", async (req, res, next) => {
  try {
    const userId = String(req.query.user || "");
    const signature = String(req.query.signature || "");
    if (!verifyCancelSignature(req.params.id, userId, signature)) {
      sendCancelResultPage(res, 403, "取消連結無效", "此取消預約連結無效或已遭修改。");
      return;
    }

    const bookingResult = await query(
      `select bookings.*, users.line_works_user_id
       from bookings
       join users on users.id = bookings.user_id
       where bookings.id = $1`,
      [req.params.id],
    );
    if (!bookingResult.rowCount) {
      sendCancelResultPage(res, 404, "預約已不存在", "此預約可能已經取消。");
      return;
    }

    const target = bookingResult.rows[0];
    if (target.user_id !== userId) {
      sendCancelResultPage(res, 403, "無法取消預約", "此取消連結不屬於該預約人。");
      return;
    }

    const deleted = await query("delete from bookings where id = $1 returning *", [req.params.id]);
    const removed = mapBooking(deleted.rows[0]);
    await query(
      "insert into audit_logs (id, actor_user_id, action, target_type, target_id, payload) values ($1, $2, $3, $4, $5, $6)",
      [crypto.randomUUID(), userId, "booking.delete", "booking", removed.id, JSON.stringify(removed)],
    );

    const content = buildBookingNotification("會議室預約已取消", removed, { accentColor: "#B42318" });
    Promise.all([
      target.line_works_user_id ? sendBotMessageToUser(target.line_works_user_id, content) : null,
      sendBotMessageToAdminChannel(content),
    ]).catch((error) => console.warn("LINE WORKS cancellation notification skipped:", error.message));

    sendCancelResultPage(
      res,
      200,
      "預約已取消",
      `${removed.date} ${removed.start}-${removed.end} 的「${escapeHtml(removed.subject)}」已成功取消。`,
    );
  } catch (error) {
    next(error);
  }
});

router.get("/api/reports/summary", requirePermission("reports"), async (req, res, next) => {
  try {
    const range = getViewRange(req.query.date || new Date().toISOString().slice(0, 10), req.query.view || "day");
    const bookings = await listBookings(range.start, range.end);
    const rooms = await listRooms("all");
    res.json(buildReport(range, req.query.view || "day", bookings, rooms));
  } catch (error) {
    next(error);
  }
});

router.get("/api/audit-logs", requirePermission("logs"), async (req, res, next) => {
  try {
    const result = await query(
      `select audit_logs.*, users.display_name as actor_name, users.username as actor_username
       from audit_logs
       left join users on users.id = audit_logs.actor_user_id
       order by audit_logs.created_at desc
       limit 100`,
    );
    res.json({ logs: result.rows.map(mapAuditLog) });
  } catch (error) {
    next(error);
  }
});

router.get("/api/users", requirePermission("accounts"), async (req, res, next) => {
  try {
    const result = await query("select id, username, display_name, email, role, status from users order by created_at asc");
    res.json({ users: result.rows.map(mapUser) });
  } catch (error) {
    next(error);
  }
});

router.post("/api/users", requirePermission("accounts"), async (req, res, next) => {
  try {
    const user = await normalizeUser(req.body, true);
    const result = await query(
      `insert into users (id, username, display_name, email, password_hash, role, status)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, username, display_name, email, role, status`,
      [crypto.randomUUID(), user.username, user.name, user.email, user.passwordHash, user.role, user.status],
    );
    await audit(req, "user.create", "user", result.rows[0].id, result.rows[0]);
    res.status(201).json({ user: mapUser(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.patch("/api/users/:id", requirePermission("accounts"), async (req, res, next) => {
  try {
    const user = await normalizeUser(req.body, false);
    const passwordSql = user.passwordHash ? ", password_hash = $8" : "";
    const params = [req.params.id, user.username, user.name, user.email, user.role, user.status, new Date()];
    if (user.passwordHash) params.push(user.passwordHash);

    const result = await query(
      `update users
       set username = $2, display_name = $3, email = $4, role = $5, status = $6, updated_at = $7 ${passwordSql}
       where id = $1
       returning id, username, display_name, email, role, status`,
      params,
    );
    if (!result.rowCount) {
      res.status(404).json({ ok: false, message: "找不到帳號。" });
      return;
    }
    await audit(req, "user.update", "user", result.rows[0].id, result.rows[0]);
    res.json({ user: mapUser(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.delete("/api/users/:id", requirePermission("accounts"), async (req, res, next) => {
  try {
    const admins = await query("select count(*)::int as count from users where role = 'admin' and status = 'active'");
    const target = await query("select * from users where id = $1", [req.params.id]);
    if (!target.rowCount) {
      res.status(404).json({ ok: false, message: "找不到帳號。" });
      return;
    }
    if (target.rows[0].role === "admin" && admins.rows[0].count <= 1) {
      res.status(400).json({ ok: false, message: "至少需要保留一個啟用中的系統管理員。" });
      return;
    }
    await query("delete from users where id = $1", [req.params.id]);
    await audit(req, "user.delete", "user", req.params.id, {});
    res.json({ ok: true });
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

async function listRooms(status = "active") {
  const params = [];
  let where = "";
  if (status !== "all") {
    params.push(status);
    where = "where status = $1";
  }
  const result = await query(`select * from rooms ${where} order by name asc`, params);
  return result.rows.map(mapRoom);
}

async function listBookings(from, to) {
  const params = [];
  const where = ["status = 'active'"];
  if (from) {
    params.push(from);
    where.push(`date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    where.push(`date <= $${params.length}`);
  }
  const result = await query(
    `select * from bookings where ${where.join(" and ")} order by date asc, start_time asc, room_id asc`,
    params,
  );
  return result.rows.map(mapBooking);
}

function normalizeRoom(body) {
  const name = String(body?.name || "").trim();
  const equipment = String(body?.equipment || "").trim();
  const capacity = Number(body?.capacity);
  const status = body?.status === "inactive" ? "inactive" : "active";
  if (!name || !equipment || !Number.isFinite(capacity) || capacity <= 0) {
    throw userError("請完整填寫會議室資料。");
  }
  return { name, equipment, capacity, status };
}

function normalizeBooking(body) {
  const start = String(body?.start || "");
  const booking = {
    roomId: String(body?.roomId || ""),
    date: String(body?.date || ""),
    start,
    end: addMinutes(start, 60),
    attendees: Number(body?.attendees),
    host: String(body?.host || "").trim(),
    subject: String(body?.subject || "").trim(),
    note: String(body?.note || "").trim(),
  };
  if (!booking.roomId || !booking.date || !booking.start || !booking.end || !booking.host || !booking.subject) {
    throw userError("請完整填寫預約資料。");
  }
  return booking;
}

async function normalizeUser(body, requirePassword) {
  const username = String(body?.username || "").trim();
  const name = String(body?.name || "").trim();
  const password = String(body?.password || "");
  if (!username || !name) throw userError("請完整填寫帳號與姓名。");
  if (requirePassword && !password) throw userError("請填寫密碼。");
  return {
    username,
    name,
    email: String(body?.email || "").trim(),
    passwordHash: password ? await bcrypt.hash(password, 10) : "",
    role: ["admin", "manager", "viewer", "user"].includes(body?.role) ? body.role : "viewer",
    status: body?.status === "inactive" ? "inactive" : "active",
  };
}

async function validateBooking(booking) {
  if (toMinutes(booking.start) >= toMinutes(booking.end)) {
    return { ok: false, message: "結束時間必須晚於開始時間。" };
  }

  const roomResult = await query("select * from rooms where id = $1 and status = 'active'", [booking.roomId]);
  const room = roomResult.rows[0];
  if (!room) return { ok: false, message: "請選擇可用的會議室。" };
  if (booking.attendees > room.capacity) return { ok: false, message: `${room.name} 最多容納 ${room.capacity} 人。` };

  const conflict = await query(
    `select id from bookings
     where room_id = $1 and date = $2 and status = 'active'
       and $3::time < end_time and $4::time > start_time
     limit 1`,
    [booking.roomId, booking.date, booking.start, booking.end],
  );
  if (conflict.rowCount) return { ok: false, message: "此會議室在該時段已有預約，請改選其他時間或會議室。" };
  return { ok: true };
}

async function upsertLineWorksUser(lineWorksUser) {
  const id = lineWorksUser.userId || lineWorksUser.id || lineWorksUser.sub || lineWorksUser.email;
  const email = String(lineWorksUser.email || "").trim().toLowerCase();
  const ownerEmail = config.lineWorks.ownerEmail.trim().toLowerCase();
  const role = ownerEmail && email === ownerEmail ? "admin" : "user";
  const result = await query(
    `insert into users (id, line_works_user_id, username, display_name, email, role, status)
     values ($1, $2, $3, $4, $5, $6, 'active')
     on conflict (id) do update
       set line_works_user_id = excluded.line_works_user_id,
           display_name = excluded.display_name,
           email = excluded.email,
           role = case when excluded.role = 'admin' then 'admin' else users.role end,
           updated_at = now()
     returning *`,
    [
      id,
      lineWorksUser.userId || lineWorksUser.id || lineWorksUser.sub || "",
      lineWorksUser.email || lineWorksUser.preferred_username || id,
      lineWorksUser.userName || lineWorksUser.displayName || lineWorksUser.name || lineWorksUser.email || "LINE WORKS User",
      lineWorksUser.email || "",
      role,
    ],
  );
  return result.rows[0];
}

function buildReport(range, view, bookings, rooms) {
  const totalMinutes = bookings.reduce((sum, booking) => sum + (toMinutes(booking.end) - toMinutes(booking.start)), 0);
  const totalAttendees = bookings.reduce((sum, booking) => sum + Number(booking.attendees || 0), 0);
  const roomStats = rooms.map((room) => {
    const roomBookings = bookings.filter((booking) => booking.roomId === room.id);
    const minutes = roomBookings.reduce((sum, booking) => sum + (toMinutes(booking.end) - toMinutes(booking.start)), 0);
    return { roomId: room.id, name: room.name, count: roomBookings.length, hours: minutes / 60 };
  });
  const topRoom = [...roomStats].sort((a, b) => b.count - a.count || b.hours - a.hours)[0];
  const activeRoomCount = Math.max(1, rooms.filter((room) => room.status === "active").length);
  const usageRate = Math.min(100, Math.round((totalMinutes / 60 / (getRangeDayCount(range.start, range.end) * activeRoomCount * 11)) * 100));
  return {
    range,
    view,
    bookingCount: bookings.length,
    usageHours: totalMinutes / 60,
    averageAttendees: bookings.length ? totalAttendees / bookings.length : 0,
    topRoom: topRoom?.count ? topRoom.name : "-",
    usageRate,
    rooms: roomStats,
  };
}

function mapRoom(row) {
  return {
    id: row.id,
    name: row.name,
    capacity: Number(row.capacity),
    equipment: row.equipment,
    status: row.status,
  };
}

function mapBooking(row) {
  return {
    id: row.id,
    userId: row.user_id || "",
    roomId: row.room_id,
    date: toDateString(row.date),
    start: String(row.start_time).slice(0, 5),
    end: String(row.end_time).slice(0, 5),
    attendees: Number(row.attendees),
    host: row.host_name,
    subject: row.subject,
    note: row.note,
  };
}

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.display_name,
    email: row.email || "",
    role: row.role,
    status: row.status,
  };
}

function mapAuditLog(row) {
  return {
    id: row.id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id || "",
    actorName: row.actor_name || "系統",
    actorUsername: row.actor_username || "",
    payload: row.payload || {},
    createdAt: row.created_at,
  };
}

function toSessionUser(row) {
  const ownerEmail = config.lineWorks.ownerEmail.trim().toLowerCase();
  return {
    id: row.id,
    username: row.username,
    name: row.display_name,
    email: row.email || "",
    lineWorksUserId: row.line_works_user_id || "",
    role: row.role,
    isOwner: Boolean(ownerEmail && String(row.email || "").trim().toLowerCase() === ownerEmail),
  };
}

function getViewRange(date, view) {
  const base = new Date(`${date}T00:00:00`);
  if (view === "week") {
    const day = base.getDay() || 7;
    const start = new Date(base);
    start.setDate(base.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: toDateString(start), end: toDateString(end) };
  }
  if (view === "month") {
    return {
      start: toDateString(new Date(base.getFullYear(), base.getMonth(), 1)),
      end: toDateString(new Date(base.getFullYear(), base.getMonth() + 1, 0)),
    };
  }
  return { start: date, end: date };
}

function getRangeDayCount(start, end) {
  return Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000) + 1;
}

function toDateString(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function toMinutes(time) {
  const [hour, minute] = String(time).slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function addMinutes(time, amount) {
  const minutes = toMinutes(time) + amount;
  if (!Number.isFinite(minutes)) return "";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

async function audit(req, action, targetType, targetId, payload) {
  await query(
    "insert into audit_logs (id, actor_user_id, action, target_type, target_id, payload) values ($1, $2, $3, $4, $5, $6)",
    [crypto.randomUUID(), req.session.user?.id || null, action, targetType, targetId, JSON.stringify(payload || {})],
  );
}

function notifyBookingChange(user, content) {
  Promise.all([
    user?.lineWorksUserId ? sendBotMessageToUser(user.lineWorksUserId, content) : null,
    sendBotMessageToAdminChannel(content),
  ]).catch((error) => console.warn("LINE WORKS notification skipped:", error.message));
}

function sendCancelResultPage(res, status, title, message) {
  res.status(status).type("html").send(`<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #f3f6f8; color: #1f2933; }
      main { max-width: 520px; margin: 12vh auto; padding: 32px 24px; text-align: center; }
      h1 { margin: 0 0 16px; color: ${status < 400 ? "#0f766e" : "#b42318"}; }
      p { line-height: 1.7; }
      a { display: inline-block; margin-top: 18px; padding: 12px 20px; border-radius: 6px; background: #0f766e; color: white; text-decoration: none; }
    </style>
  </head>
  <body><main><h1>${title}</h1><p>${message}</p><a href="/">返回會議室預約</a></main></body>
</html>`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function requireAdmin(req, res, next) {
  if (req.session.user?.role === "admin") return next();
  res.status(403).json({ ok: false, message: "Admin permission required." });
}

function requireUser(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ ok: false, message: "請先使用 LINE WORKS 帳號登入。" });
}

function requirePermission(permission) {
  return (req, res, next) => {
    const role = req.session.user?.role;
    if ((rolePermissions[role] || []).includes(permission)) return next();
    res.status(403).json({ ok: false, message: "Permission denied." });
  };
}

function userError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}
