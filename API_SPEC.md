# 會議室預約正式版 API 規格草案

## Auth

### POST /api/auth/login

系統自有帳密登入。

```json
{
  "username": "admin",
  "password": "********"
}
```

### POST /api/auth/logout

登出並清除 Session。

### GET /api/auth/me

取得目前登入者。

### GET /auth/line-works

導向 LINE WORKS OAuth / SSO 登入。

### GET /auth/line-works/callback

處理 LINE WORKS 登入 callback，建立或綁定本系統使用者。

## Rooms

### GET /api/rooms

取得會議室清單。

Query:

- `status=active|inactive|all`

### POST /api/rooms

新增會議室。需要 `rooms:write`。

```json
{
  "name": "A 會議室",
  "capacity": 6,
  "equipment": "白板、視訊鏡頭",
  "status": "active"
}
```

### PATCH /api/rooms/:id

編輯會議室。需要 `rooms:write`。

### DELETE /api/rooms/:id

刪除或停用會議室。若已有預約紀錄，正式系統應改為停用。

## Bookings

### GET /api/bookings

取得預約清單。

Query:

- `from=YYYY-MM-DD`
- `to=YYYY-MM-DD`
- `roomId=...`

### POST /api/bookings

建立預約。

```json
{
  "roomId": "a",
  "date": "2026-05-18",
  "start": "09:00",
  "end": "10:00",
  "attendees": 4,
  "subject": "部門週會",
  "note": "需要投影"
}
```

Rules:

- `end` 必須晚於 `start`
- 同會議室、同日期、時間不可重疊
- 人數不可超過會議室容量

### DELETE /api/bookings/:id

取消預約。

## Reports

### GET /api/reports/summary

Query:

- `view=day|week|month`
- `date=YYYY-MM-DD`

Response:

```json
{
  "range": {
    "start": "2026-05-18",
    "end": "2026-05-18"
  },
  "bookingCount": 3,
  "usageHours": 4.5,
  "averageAttendees": 5,
  "topRoom": "A 會議室",
  "usageRate": 18,
  "distribution": [
    { "label": "上午", "count": 2 },
    { "label": "下午", "count": 1 }
  ],
  "rooms": [
    { "roomId": "a", "name": "A 會議室", "count": 2, "hours": 3 }
  ]
}
```

## Users

### GET /api/users

取得使用者清單。需要 `accounts:write` 或 `accounts:read`。

### POST /api/users

新增使用者。需要 `accounts:write`。

### PATCH /api/users/:id

編輯使用者。需要 `accounts:write`。

### DELETE /api/users/:id

刪除或停用使用者。需要 `accounts:write`。

## LINE WORKS

### POST /api/line-works/test-message

發送測試訊息。需要系統管理員。

### Internal: sendBookingCreatedNotification

建立預約後觸發。

Targets:

- 預約人 LINE WORKS userId
- 管理頻道 channelId

### Internal: sendBookingCancelledNotification

取消預約後觸發。
