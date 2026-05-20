# DigitalOcean 正式資料庫部署

這份設定會把目前的靜態展示站升級成正式可儲存資料的版本：

- Node.js Web Service：執行後端 API 並同時提供 `web/` 前端
- PostgreSQL Database：儲存會議室、預約、帳號、報表資料
- Custom Domain：`www.cheapneeder.com`

## App Platform 設定

進入 DigitalOcean App Platform 的 `meeting-room-booking` App，將目前的 Static Site 改成 Web Service，或新增一個 Web Service 後移除原 Static Site。

建議設定：

| 項目 | 值 |
| --- | --- |
| Source | GitHub |
| Repository | `chiu722722722-dotcom/meeting-room-booking` |
| Branch | `main` |
| Source directory | `/` |
| Type | Web Service |
| Environment | Node.js |
| Build command | 留空或使用預設 |
| Run command | `npm start` |
| HTTP port | `8080` |
| Instance size | 最小方案即可先測試 |
| Deploy on push | Enable |

健康檢查路徑可設：

```text
/api/health
```

## PostgreSQL 設定

在同一個 App 裡新增 PostgreSQL database。正式使用建議選 Managed Database；若只是短期測試，可先用 Dev Database。

新增後，Web Service 的環境變數要設定：

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_BASE_URL` | `https://www.cheapneeder.com` |
| `SESSION_SECRET` | 一組長隨機字串 |
| `DATABASE_URL` | `${postgres-db.DATABASE_URL}` |

如果 DigitalOcean 產生的 database component 名稱不是 `postgres-db`，請把 `DATABASE_URL` 的值改成實際名稱，例如：

```text
${meeting-room-db.DATABASE_URL}
```

`SESSION_SECRET` 可以用下面方式產生：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 初始帳號

資料庫第一次啟動時會自動建立：

| 帳號 | 密碼 | 權限 |
| --- | --- | --- |
| `admin` | `admin123` | 系統管理員 |

第一次登入後，請到後台帳號管理新增正式管理員，並停用或修改預設密碼。

## 驗證

部署完成後測試：

```text
https://www.cheapneeder.com/api/health
```

成功時會看到：

```json
{
  "ok": true,
  "database": {
    "configured": true,
    "ok": true
  }
}
```

接著在網頁新增一筆預約，重新整理頁面後資料仍存在，就代表資料庫保存已完成。
