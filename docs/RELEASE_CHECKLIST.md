# 最終整合與交付檢查

本次目標是將 Phase 4 經 PR #1 合併至 main，保留 Phase 1–3 功能、Migration 歷史與測試。這是原始碼整合交付，不包含 Production 部署、收費雲端資源或正式資料異動。精確驗證證據見 [STATUS](STATUS.md)。

## 版本與檢查原則

- 核對遠端 main、phase3-business-operations、phase4-production-readiness，確認前兩者均為 Phase 4 的 ancestor。
- 前四個 SQL Migration 原文保留；Phase 4 僅追加兩個 Migration，總共六個。不可 reset 或 db push。
- 保留 Phase 1–3 測試，使用真實 PostgreSQL 重跑 Unit、Integration、Migration、Production Build 及桌面／平板／手機 E2E。
- PR 最新 head 檢查全部成功、無衝突、無待提交必要變更，才以綁定 head SHA 的一般 merge 合併；不強制合併、不繞過檢查。
- 合併後核對遠端 main SHA、PR merged 狀態與該 SHA 的 push CI。CI 包含 Docker tools/runtime、容器 Migration、healthy、DB health 及動態 Session smoke，不會部署。
- 正式相依 audit 與完整 audit 分別揭露。開發工具 braces 公告尚無發布修補版，不以關閉掃描或不相容降版掩蓋，持續追蹤殘餘風險。

## 功能驗收範圍

| 階段    | 保留的功能                                                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 | 註冊／登入／登出、Session、多租戶、Owner / Admin / Staff、建店、服務／人員／營業時間、公開預約、管理列表、DB 防撞、Seed                             |
| Phase 2 | 員工資格、多段 WORK / BREAK、日期停班、店家時區／DST、緩衝／提前／間隔政策、真實日期時段、冪等與併發防撞                                            |
| Phase 3 | 日週行事曆、改期／取消／完成／未到場、revision、BookingEvent、Staff 自身權限、顧客搜尋／歷史、期間統計、私人連結、Outbox／提醒／重試／Email preview |
| Phase 4 | 獨立平台權限、店家分頁與統計、啟停與稽核、共享認證限流、HTTP 安全、焦點與響應式、Health、Docker、CI、備份還原及回滾文件                             |

## Windows PowerShell 啟動與驗證

安裝 Node.js 22.12+（CI 使用 22.23.1）、Git 與 Docker Desktop（Linux containers，含 Compose）。Docker 必須已啟動。每一行成功後才執行下一行，所有 npm 指令均在 repository 根目錄執行。

```powershell
git clone --branch main https://github.com/Cizing24/bookflow-saas.git
cd bookflow-saas
git rev-parse HEAD
node --version
npm --version
docker compose version
npm ci
npm run setup:env
docker compose up -d --wait
npm run db:generate
npm run db:migrate
```

選用本機示範資料，密碼由本人設定，不使用正式憑證。Seed 不重設既有密碼、不授予平台權限、不寄信。

```powershell
$env:SEED_PASSWORD = Read-Host '設定至少 10 字元的本機示範密碼'
$env:SEED_DEMO_BOOKINGS = 'true'
npm run db:seed
Remove-Item Env:SEED_PASSWORD
Remove-Item Env:SEED_DEMO_BOOKINGS
npm run build
npm start
```

開啟 `http://localhost:3000`；示範店家為 `/b/flow-studio`，示範帳號為 `owner@bookflow.local`。使用 localhost，與預設 BETTER_AUTH_URL / Origin 一致。另一個 PowerShell 視窗可檢查：

```powershell
Invoke-RestMethod http://localhost:3000/health
```

開發模式可改用 `npm run dev`。停止網站按 Ctrl+C；停止 DB 使用 `docker compose stop`，保留 volume。沒有 Docker 時，安裝 PostgreSQL 18 binaries，以 README 的 `npm run db:local` 取代 Compose；兩種 DB 方案不可同時占用 5433。trust cluster 僅供私人本機使用。

先停止 3000 port 的網站，再於本機測試 DB 執行：

```powershell
npm run verify
npx playwright install chromium
$env:E2E_SERVER_COMMAND = 'npm run start'
npm run test:e2e
Remove-Item Env:E2E_SERVER_COMMAND
npm audit --omit=dev
```

備份還原演練另需 PostgreSQL 18 client（pg_dump / pg_restore）與 CREATEDB 權限。Windows 預設位置為 `C:/Program Files/PostgreSQL/18/bin`；其他路徑設定 `$env:PG_BIN` 後執行 `npm run test:backup`。使用 Docker DB 時也須安裝 client，此檢查不由 `npm run verify` 自動執行。

## 尚待人工驗收

- 依真實店家規則核對價格、服務資格、班表／休息／停班、預約與自助取消／改期截止、繁體中文文案。
- Owner / Admin / 綁定與未綁定 Staff / PlatformAdmin 的帳號權限、平台停用及重新啟用。
- 真實瀏覽器與裝置的鍵盤、輔助科技、觸控、行事曆長資料與窄螢幕；Chromium 裝置模擬不代表實機 Safari 已驗。
- 授權收件者的正式 Email Gateway 接受、去重、投遞與退信，以及 worker 排程、告警與重試。
- 隔離 staging 的 HTTPS／Secure Cookie／Proxy／DB 最小權限、真實資料量還原、容量與 RPO / RTO。不得將 fixture 測試指向 Production。
- 評估尚未提供的 Email 驗證、密碼復原／邀請、Owner 移轉、Token 輪替／撤銷、隱私刪除及訂閱金流，不得對外宣稱已完成。

## 正式部署前的環境與授權

另取得明確 Production 發布授權，以及部署帳戶／專案與預算、PostgreSQL 18、獨立 staging DB／Secrets、HTTPS 網域與 Proxy、Session Secret、Migration DDL 與 runtime 最小權限帳號、備份儲存／PITR／還原窗口。郵件需已驗證寄件網域、Gateway HTTPS URL／Token、授權測試收件者、冪等契約及 worker 排程。另指定告警接收者、隱私與資料保留政策、回滾負責人。

具體命令與安全邊界見 [DEPLOYMENT](DEPLOYMENT.md) 和 [OPERATIONS](OPERATIONS.md)。本次整合不代表已取得上述授權。
