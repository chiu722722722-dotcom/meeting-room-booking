import crypto from "node:crypto";
import { config } from "./config.js";

export function buildBookingNotification(title, booking, options = {}) {
  const fields = [
    ["會議主題", booking.subject],
    ["預約時間", `${booking.date} ${booking.start}-${booking.end}`],
    ["預約人數", `${booking.attendees} 人`],
    ["備註", booking.note || "無"],
  ];

  const bodyContents = [
    {
      type: "text",
      text: title,
      size: "xl",
      weight: "bold",
      color: options.accentColor || "#0F766E",
      wrap: true,
    },
    {
      type: "separator",
      margin: "md",
    },
    ...fields.map(([label, value]) => ({
      type: "box",
      layout: "vertical",
      margin: "md",
      contents: [
        {
          type: "text",
          text: label,
          size: "sm",
          color: "#6B7785",
          weight: "bold",
        },
        {
          type: "text",
          text: String(value),
          size: "md",
          color: "#1F2933",
          weight: "bold",
          wrap: true,
          margin: "xs",
        },
      ],
    })),
  ];

  const bubble = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      contents: bodyContents,
    },
  };

  if (options.cancelUrl) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#E8194B",
          action: {
            type: "uri",
            label: "取消預約",
            uri: options.cancelUrl,
          },
        },
      ],
    };
  }

  return {
    type: "flex",
    altText: `${title}：${booking.subject} ${booking.date} ${booking.start}-${booking.end}`,
    contents: bubble,
  };
}

export function buildCancelUrl(bookingId, userId) {
  const payload = `${bookingId}.${userId}`;
  const signature = sign(payload);
  const url = new URL(`/booking/cancel/${encodeURIComponent(bookingId)}`, config.appBaseUrl);
  url.searchParams.set("user", userId);
  url.searchParams.set("signature", signature);
  return url.toString();
}

export function verifyCancelSignature(bookingId, userId, signature) {
  if (!bookingId || !userId || !signature) return false;
  const expected = sign(`${bookingId}.${userId}`);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function sign(value) {
  return crypto.createHmac("sha256", config.sessionSecret).update(value).digest("base64url");
}
