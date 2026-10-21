# 部署、備份與回滾

本文件提供可重現部署流程。正式平台、DB、網域、寄信及 Secrets 仍由營運者授權；沒有公開 Demo 時，README 不提供虛構網址。所有指令在 repository 根目錄執行，正式環境禁止使用本機 trust cluster 或開發密碼。

## 外部授權交接

需要營運者完成的唯一外部授權交接是：**指定並授權可使用的部署帳戶／專案、PostgreSQL、HTTPS 網域及 Secrets（需要正式郵件時加上已驗證 Gateway），並明確授權首次 Production 發布**。授權後工程部署依下列程序執行；不必另行改寫應用。帳號驗證／忘記密碼尚未提供，公開商用須先評估此限制。

## 本機 Production Build

```powershell
npm ci
npm run setup:env
npm run db:generate
npm run db:migrate
npm run build
npm start
```

`GET /health` 查詢實際 Tenant.active 欄位；DB 未遷移或失聯回 503，成功 200。回應不含連線字串、版本、帳號或錯誤原文。應用程式與反向代理都不應記錄 request body、Cookie、Authorization、管理 Token 或 Email 原文。

## 容器部署

Dockerfile 提供 `tools`（Migration／worker／管理 CLI）及預設 `runtime`（standalone、非 root）兩個 image。Build 不需連線正式 DB、不接受 runtime Secrets，也不會自動套 Migration。基底 Node 版本固定；發布時記錄 image digest，定期經 CI 重建安全更新。

1. 將 `.env.production.example` 複製成 `.env.production`，透過部署主機的 Secrets 管理，檔案權限限營運帳戶。`BETTER_AUTH_URL` 必須為對外 HTTPS Origin，Secret 使用密碼學隨機至少 32 字元。DB TLS 憑證依供應商指示驗證，不能以關閉驗證處理連線錯誤。
2. 以 Migration 專用帳號執行備份與 Migration。Runtime 帳號只授予 public schema USAGE、應用資料表 SELECT／INSERT／UPDATE／DELETE；不得 CREATEDB、CREATEROLE、SUPERUSER 或 schema CREATE。Migration owner 保有 DDL 與 btree_gist 安裝權限。`PlatformAdmin` 變更由離線 CLI 管理；執行原始碼與 DB 憑證本身屬受信任營運邊界。
3. 先在隔離 staging（獨立 DB／Secrets／郵件）重跑相同 image 的完整驗收，確認備份可還原。Production 變更須有明確授權。

```powershell
$env:RELEASE_TAG = git rev-parse HEAD
docker compose -f compose.production.yaml build migrate web
# 使用 Migration 專用 DATABASE_URL 的 env-file 執行一次性工作。
docker run --rm --env-file .env.migration bookflow-tools:$env:RELEASE_TAG npm run db:migrate
# 將 .env.production 保持為 runtime 最小權限帳號。
docker compose -f compose.production.yaml up -d --no-deps web
```

`.env.migration` 使用 DDL 帳號、`.env.production` 使用 runtime 最小權限帳號。`web` 的 depends_on 可支援單帳號本機演練；正式流程使用上述獨立 Migration job 與 `--no-deps web`，避免 runtime 帳號執行 DDL。小型單主機範例不是零停機 orchestrator。

反向代理終止 TLS、將流量導向 127.0.0.1:3000，設定 request body 上限 64 KiB、request/header timeout 與 HTTPS HSTS。正式 origin 禁止直接對公網開放。只有代理**覆寫** `X-Real-IP` 並封鎖繞過代理路徑後才啟用 `TRUST_PROXY_IP=true`；預設共享 bucket 可以安全運作，但會限制全站總流量。認證另外保留 Better Auth endpoint 限流。

切流前後檢查公開 `/health`、註冊／登入、Secure + HttpOnly + SameSite=Lax Cookie、錯誤 Origin 拒絕、租戶隔離、預約／改期／取消、20 請求競爭及資產載入。不要向 Production 執行會建立 fixture 的測試套件；正式 smoke 使用事先授權的合成驗收店家與清理範圍。

## Email worker 與監控

用排程器每分鐘執行一次：

```powershell
docker compose -f compose.production.yaml --profile worker run --rm worker
```

Outbox claim 支援多 worker；Provider 必須依 Notification ID 持久化去重。配置 Gateway、寄件網域及授權測試收件者後，另驗證接受／投遞／退信。SENT 僅代表 Provider 接受。沒有真實憑證時保留 PENDING，不能當作寄送成功。

監控 `/health` 503、HTTP 5xx／429 比例、DB 連線數與鎖等待、worker 排程 exit code，以及 PENDING 最舊 availableAt／attempts。服務的非預期錯誤只記固定訊息與 Error 類別；平台啟停及權限授予有 DB 稽核。設定日誌輪替、保留期間與告警路由，避免無限磁碟累積。派送指令會在完成後清除已過期超過 24 小時的 RateLimit counter；須確保 worker 排程持續執行。Outbox 尚無自動保留期限，需依資料保留政策設計清理工作，不能直接刪除冪等或稽核歷史。

## 備份與還原演練

本機可執行 `npm run test:backup`：限定 localhost development/test，使用 PostgreSQL client custom-format dump 還原到唯一新 DB，比對 7 張核心資料表數量、GiST 與兩個 Booking trigger，最後只刪自己的暫時 DB／dump。需 CREATEDB 與同 major client，可用 PG_BIN 指定目錄。請在無併發寫入時執行；不會寄信或對原 DB 做 restore。此 smoke 不替代正式資料量、遠端儲存與災難復原驗收。

使用與伺服器相同 major 的 PostgreSQL client。透過 PostgreSQL service file／PGPASSFILE 注入連線，檔案限營運者讀取，不把密碼放在 shell history 或 repo。以下 shell 範例適用 Linux 部署主機；Windows 使用 PostgreSQL bin 完整路徑，保留同一參數。

```bash
mkdir -p backups
pg_dump --dbname=service=bookflow_backup --format=custom --no-owner --no-acl --file=backups/bookflow.dump
pg_restore --list backups/bookflow.dump
# restore_drill 必須是新建、隔離、無真實流量的 DB。
createdb --maintenance-db=service=bookflow_migration restore_drill
pg_restore --dbname=service=bookflow_restore_drill --no-owner --no-acl --exit-on-error --single-transaction backups/bookflow.dump
```

演練後用隔離 DATABASE_URL 啟動相同 release，讀回 Tenant／Booking／稽核／Outbox 數量、Migration 紀錄、GiST exclusion、trigger 和 FK；驗證備份時間點的合成店家預約及取消流程。還原後停用通知排程，避免舊 Outbox 重寄。檔案必須加密儲存於異地，限制權限、記錄 SHA-256、定期試還原；建議初始每日快照、保留 30 天，再由業務核定 RPO／RTO 和 PITR。未實測正式資料量前不承諾還原時間。

## 發布與回滾

- 保存前一版 immutable image digest、Migration 清單、備份 ID、runtime 設定版本與驗收紀錄。
- Migration 一律 append-only `prisma migrate deploy`。本階段新增欄位／資料表與舊版相容；不可直接編輯已套 SQL。鎖表前需安排窗口，先評估 staging 時間與 active transactions。
- 發布失敗：停止新流量與 worker，切回已驗證的上一版 image；保留新增 schema。確認新舊資料語意相容後恢復流量。不可自動執行破壞性 down migration。
- 資料損壞：先凍結寫入、保存現況，再從備份／PITR 還原到**新 DB**並驗證；人工核准可能遺失的備份後資料，才切換連線。不得覆寫原 DB 來試驗。
- 啟用／停用店家須到 `/platform` 填寫原因；平台登入沿用 Better Auth 帳號與 Session，角色取自獨立 PlatformAdmin 資料表。伺服器營運者使用 `npm run platform:admin -- grant registered-email` 授權；`revoke` 撤銷，下一次請求立即生效。沒有公開授權 API；Seed 不會建立平台管理者。

## GitHub Actions

`.github/workflows/ci.yml` 在乾淨 Ubuntu runner 啟動 PostgreSQL service，執行 npm ci、generate、Migration、Seed、Lint、Typecheck、Format、Unit、重建 Migration、Integration、正式依賴 audit、Build、Chromium 桌面／平板／手機 E2E；再 Build Docker tools/runtime，執行容器 Migration，等待 Docker 自身 healthy，檢查 `/health` 與動態 `/api/auth/get-session`。任一步驟失敗即 job failure；`always()` 僅用於保留 Playwright 診斷 artifact。此 workflow 驗證部署產物，不會自行部署 Production。實際 success 連結與受測 SHA 見 STATUS。
