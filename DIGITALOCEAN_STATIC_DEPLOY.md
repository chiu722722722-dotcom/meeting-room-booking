# DigitalOcean App Platform 靜態網站部署步驟

這份步驟先部署目前可用的前端網頁。LINE WORKS SSO、Bot、正式資料庫先不啟用。

## 目前部署內容

部署資料夾：

- `web/index.html`
- `web/app.js`
- `web/styles.css`

目前資料仍存在瀏覽器 `localStorage`，所以這一版適合先上線試用與展示。不同使用者或不同瀏覽器的資料不會同步。

## 建議部署方式

使用 DigitalOcean App Platform 的 Static Site。

官方文件：

- https://docs.digitalocean.com/products/app-platform/how-to/create-apps/
- https://docs.digitalocean.com/products/app-platform/how-to/manage-static-sites/
- https://docs.digitalocean.com/products/app-platform/reference/app-spec/

## 部署前準備

1. 建立 GitHub repository
2. 將本專案推上 GitHub
3. 登入 DigitalOcean
4. 到 App Platform 建立新 App

## DigitalOcean App Platform 設定

建立 App 時請選：

- Source：GitHub repository
- Resource Type：Static Site
- Source Directory：`/web`
- Output Directory：`/`
- Index Document：`index.html`
- Catch-all Document：`index.html`
- Region：Singapore (`sgp`) 或預設可用區域
- Auto Deploy：開啟

如果 DigitalOcean 自動偵測成 Node.js service，請改成 Static Site，並確認 Source Directory 是 `/web`。

## App Spec 範例

可參考：

- `.do/app.example.yaml`

使用前請將：

```yaml
repo: YOUR_GITHUB_ACCOUNT/YOUR_REPOSITORY
```

改成你的 GitHub repo，例如：

```yaml
repo: company/meeting-room-booking
```

## 部署完成後測試

1. 開啟 DigitalOcean 提供的 `.ondigitalocean.app` 網址
2. 測試前台建立預約
3. 切換日 / 週 / 月
4. 切換到後台管理
5. 用預設帳號登入：
   - 帳號：`admin`
   - 密碼：`admin123`
6. 測試報表、會議室管理、帳號管理

## 注意事項

這一版是「可用網頁版」，但不是多人同步正式版。

正式多人系統需要下一階段：

- 後端 API
- PostgreSQL
- LINE WORKS SSO
- LINE WORKS Bot 通知
- 權限由後端驗證

目前先部署靜態站，可以最快拿到可使用的雲端網址。
