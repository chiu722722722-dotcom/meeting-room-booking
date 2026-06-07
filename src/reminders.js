import crypto from "node:crypto";
import { pool, query } from "./db.js";
import { sendBotMessageToUser } from "./lineWorks.js";

const CHECK_INTERVAL_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
let timer = null;
let running = false;

export function startReminderScheduler() {
  if (!pool || timer) return;

  const run = () => {
    runReminderCycle().catch((error) => {
      console.error("Reminder scheduler failed:", error);
    });
  };

  setTimeout(run, 10000);
  timer = setInterval(run, CHECK_INTERVAL_MS);
  timer.unref?.();
  console.log("Booking reminder scheduler started.");
}

export async function runReminderCycle() {
  if (running || !pool) return { skipped: true };
  running = true;

  try {
    await queueDueReminders();
    const reminders = await getPendingReminders();

    for (const reminder of reminders) {
      await deliverReminder(reminder);
    }

    return { processed: reminders.length };
  } finally {
    running = false;
  }
}

async function queueDueReminders() {
  await query(
    `insert into booking_reminders (booking_id)
     select bookings.id
     from bookings
     join users on users.id = bookings.user_id
     where bookings.status = 'active'
       and users.line_works_user_id is not null
       and users.line_works_user_id <> ''
       and ((bookings.date + bookings.start_time) at time zone 'Asia/Taipei') > now() + interval '45 minutes'
       and ((bookings.date + bookings.start_time) at time zone 'Asia/Taipei') <= now() + interval '60 minutes'
     on conflict (booking_id) do nothing`,
  );
}

async function getPendingReminders() {
  const result = await query(
    `select
       booking_reminders.booking_id,
       booking_reminders.attempts,
       bookings.subject,
       bookings.date,
       bookings.start_time,
       bookings.end_time,
       rooms.name as room_name,
       users.line_works_user_id
     from booking_reminders
     join bookings on bookings.id = booking_reminders.booking_id
     join rooms on rooms.id = bookings.room_id
     join users on users.id = bookings.user_id
     where booking_reminders.status in ('pending', 'failed')
       and booking_reminders.attempts < $1
       and booking_reminders.next_attempt_at <= now()
       and bookings.status = 'active'
       and ((bookings.date + bookings.start_time) at time zone 'Asia/Taipei') > now()
     order by bookings.date, bookings.start_time
     limit 20`,
    [MAX_ATTEMPTS],
  );
  return result.rows;
}

async function deliverReminder(reminder) {
  const date = toDateString(reminder.date);
  const start = String(reminder.start_time).slice(0, 5);
  const end = String(reminder.end_time).slice(0, 5);
  const text = [
    "會議提醒",
    `您預約的「${reminder.subject}」將於一小時後開始。`,
    `會議室：${reminder.room_name}`,
    `時間：${date} ${start}-${end}`,
  ].join("\n");

  try {
    const result = await sendBotMessageToUser(reminder.line_works_user_id, text);
    if (result?.skipped) throw new Error(result.reason || "LINE WORKS reminder was skipped.");
    await query(
      `update booking_reminders
       set status = 'sent', attempts = attempts + 1, sent_at = now(), last_error = null, updated_at = now()
       where booking_id = $1`,
      [reminder.booking_id],
    );
    await query(
      `insert into audit_logs (id, action, target_type, target_id, payload)
       values ($1, 'booking.reminder_sent', 'booking', $2, $3)`,
      [
        crypto.randomUUID(),
        reminder.booking_id,
        JSON.stringify({ subject: reminder.subject, date, start, end, roomName: reminder.room_name }),
      ],
    );
  } catch (error) {
    await query(
      `update booking_reminders
       set status = 'failed',
           attempts = attempts + 1,
           last_error = $2,
           next_attempt_at = now() + interval '5 minutes',
           updated_at = now()
       where booking_id = $1`,
      [reminder.booking_id, String(error.message || error).slice(0, 500)],
    );
    console.warn(`Reminder delivery failed for booking ${reminder.booking_id}:`, error.message);
  }
}

function toDateString(value) {
  if (typeof value === "string") return value.slice(0, 10);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
