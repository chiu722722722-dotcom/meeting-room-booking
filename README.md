# Meeting Room Booking

會議室預約系統原型與正式化部署準備。

## 先部署可用網頁版

DigitalOcean App Platform 先部署 `web/` 靜態網站：

- `web/index.html`
- `web/app.js`
- `web/styles.css`

設定方式請看：

- `DIGITALOCEAN_STATIC_DEPLOY.md`

## 本機預覽

```powershell
Set-Location web
node ..\server.js
```

開啟：

```text
http://127.0.0.1:8080
```

## 後台測試帳號

- 帳號：`admin`
- 密碼：`admin123`

## 正式版規劃

- `FORMAL_SYSTEM_PLAN.md`
- `CLOUD_DEPLOYMENT_PLAN.md`
- `API_SPEC.md`
- `LINE_WORKS_SETUP_CHECKLIST.md`
