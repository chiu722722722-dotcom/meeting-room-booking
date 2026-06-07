# LINE WORKS 掛載設定清單

正式網址：

```text
https://www.cheapneeder.com
```

SSO Redirect URL：

```text
https://www.cheapneeder.com/auth/line-works/callback
```

## 1. 先掛 LINE WORKS 選單入口

在 LINE WORKS Admin 設定一個選單或捷徑，讓使用者可以從 LINE WORKS 打開系統。

建議設定：

| 項目 | 值 |
| --- | --- |
| 顯示名稱 | 會議室預約 |
| URL | `https://www.cheapneeder.com` |
| 類型 | URL / Web link |
| 圖示 | 正方形 PNG |

## 2. 設定 LINE WORKS SSO

到 LINE WORKS Developer Console 建立 OAuth / SSO App。

需要填入：

| 項目 | 值 |
| --- | --- |
| Redirect URL | `https://www.cheapneeder.com/auth/line-works/callback` |
| Response Type | `code` |
| OAuth Scope | `openid profile email` |

建立後取得：

- Client ID
- Client Secret
- LINE WORKS domain / tenant 資訊

接著到 DigitalOcean App Platform 的環境變數新增：

```text
LINE_WORKS_CLIENT_ID=你的 Client ID
LINE_WORKS_CLIENT_SECRET=你的 Client Secret
LINE_WORKS_REDIRECT_URI=https://www.cheapneeder.com/auth/line-works/callback
LINE_WORKS_AUTHORIZATION_URL=https://auth.worksmobile.com/oauth2/v2.0/authorize
LINE_WORKS_TOKEN_URL=https://auth.worksmobile.com/oauth2/v2.0/token
LINE_WORKS_USERINFO_URL=https://auth.worksmobile.com/oauth2/v2.0/userinfo
```

設定完成後，後台登入頁會出現「使用 LINE WORKS 登入」。

## 3. 設定 Bot 通知

若要在預約建立 / 刪除時通知 LINE WORKS 聊天室，需要在 Developer Console 建立 Bot 與 Service Account。

需要準備：

- Bot ID
- Service Account ID
- Private Key
- 通知聊天室 Channel ID
- OAuth Scope：`bot.message`

DigitalOcean 環境變數：

```text
LINE_WORKS_BOT_ID=你的 Bot ID
LINE_WORKS_SERVICE_ACCOUNT_ID=你的 Service Account ID
LINE_WORKS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
LINE_WORKS_BOT_SCOPE=bot.message
LINE_WORKS_ADMIN_CHANNEL_ID=通知聊天室 Channel ID
```

`LINE_WORKS_PRIVATE_KEY` 請設定成 Secret，不要提交到 Git。

## 4. 測試

1. 打開 `https://www.cheapneeder.com`
2. 進入後台管理
3. 點「使用 LINE WORKS 登入」
4. 完成 LINE WORKS 授權後應回到預約系統
5. 建立一筆測試預約
6. 確認聊天室收到通知
7. 到後台「操作紀錄」確認有 log

## 5. 目前系統已完成的接線口

- `/auth/line-works`
- `/auth/line-works/callback`
- LINE WORKS 使用者登入後自動建立或更新本系統帳號
- WOFF ID：`goQlqEM2d0eZwBKMM7xw3Q`
- WOFF 開啟後使用 LINE WORKS access token 自動建立本站 session
- 預約建立 / 刪除時呼叫 LINE WORKS Bot 通知
- Bot 通知支援 Service Account JWT 自動換 access token
