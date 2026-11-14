# BookFlow 公開 Demo 部署

狀態：部署準備中，尚無已驗收的公開 URL。2026-11-14；分支 `codex/demo-deployment-2026-11-14`。

拓撲為 Vercel Hobby Next.js App Router + 獨立 Neon Free PostgreSQL 18 Demo branch。保留 Prisma 7 `pg` adapter 與既有 Better Auth，不切換 Auth 服務。`vercel.json` 使用 Singapore `sin1`，由獨立 Demo 專案發布，不能綁到既有 booking-system 或 Portfolio 專案。

Web 使用 `.env.demo.example` 的 `NODE_ENV=production`、`DEPLOYMENT_ENV=public-demo`、runtime pooled `DATABASE_URL`、實際 HTTPS `BETTER_AUTH_URL`、隨機 `BETTER_AUTH_SECRET`、`TRUST_PROXY_IP=false`、`EMAIL_PROVIDER=disabled`。不將任何 Secret 前綴改成 NEXT_PUBLIC，不向瀏覽器傳 DB URL。

1. 在全新專用 `bookflow_demo` 上測過六份 append-only Migration；使用 direct TLS migrator URL，保留 DB 與 Runtime role 分離。
2. 受保護工作階段設定 `DEMO_DATABASE_HOST`、`DEMO_PROVISION_CONFIRM=CREATE_SYNTHETIC_DEMO`、私下保存的 `DEMO_OWNER_PASSWORD`（至少 24 字元）、有效 HTTPS Auth URL 與 Secret。
3. `npm ci`、`npm run db:generate`、`npm run db:migrate`、`npm run demo:provision`。Provision 使用既有 Better Auth 密碼契約建立合成 Owner、店家／人員／服務／時段，寫入 provisioning 稽核，不授予平台管理者。已有店家時拒絕，不放寬原 Seed production 禁令。
4. 注入 `DEMO_RUNTIME_PASSWORD` 並以 psql 執行一次 `scripts/demo-runtime-role.sql`。Web role 不能 DDL、寫 PlatformAdmin、修改 BookingEvent／PlatformEvent 或碰 Migration 表。
5. 獨立 Vercel project 僅部署通過 CI 的 Demo SHA。設定實際分配的 HTTPS Origin，再核對 Better Auth Cookie／Origin。標準 Node runtime 使用 pooled URL；Migration／備份保持 direct URL。
6. 公開入口預計使用部署 Origin 下 `/b/flow-studio`，只有實際 URL 確認且端對端驗收通過後才能加入 Portfolio。

公開預約固定聯絡資料為 `合成訪客`、`visitor@example.test`、`0000000000`。伺服器拒絕其他聯絡值；公開註冊關閉。每店最多保留 1000 筆合成預約（含已取消），達上限拒絕新建，避免無限制寫入。管理者帳密不公開，私人管理 Token 只交付該次瀏覽器。

此 Demo **不寄送 Email**，不配置 Gateway 或通知 Worker；Outbox 保留 PENDING，不能當作已寄送。即使誤設 HTTP Gateway，public-demo guard 也會拒絕派送。成功畫面說明保存私人管理連結。

免費計畫有 compute／storage／transfer 限額與冷啟動，無可用性保證；不自動升級或輸入付款資料。僅供個人求職合成展示，不能接真實商用預約。實際限額以 [Vercel Hobby](https://vercel.com/docs/plans/hobby) 與 [Neon](https://neon.com/pricing) 為準。
