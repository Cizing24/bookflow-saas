# Phase 1 交接狀態

更新日期：2026-10-21（Asia/Taipei）。交付範圍為本機可執行 MVP，未部署 Production。

## 已實作

- Next.js App Router、React、strict TypeScript、Tailwind、shadcn/ui 基礎元件、ESLint / Prettier、精確依賴與 lockfile。
- Better Auth Email / Password 註冊、登入、登出、資料庫 Session 與認證限流。
- User、Tenant、Membership、Staff、Service、Customer、Booking、BusinessHour 與認證資料表。
- OWNER / ADMIN 管理、STAFF 唯讀；集中式授權、scoped queries、複合外鍵的租戶隔離。
- 店家建立與切換、名稱 / Slug / IANA 時區、服務建立 / 編輯 / 停用、人員建立 / 編輯 / 停用、每週營業時間設定。
- Dashboard 與最近 200 筆預約列表，含顧客、服務、人員、時間、費用與狀態。
- /b/[slug] 公開預約：真實後端時段、90 天範圍、匿名聯絡資料、即時結果與編號。
- 交易中重新驗證服務、人員與營業時間；PostgreSQL 排他約束防止有效預約重疊，衝突回應 409。
- UTC 儲存與店家時區顯示、服務 / 價格 / 顧客聯絡資訊快照，拒絕任意結束時間與不在格線上的起始時間。
- Loading / Empty / Error / Success、桌面與手機介面、初始化前表單保護。
- Docker Compose PostgreSQL、隔離本機 PostgreSQL helper、2 個 Migration、可重跑 Seed、自動測試與 GitHub Actions CI。

## 本機驗證

驗證環境：Windows、Node.js 22.23.1、PostgreSQL 18.4 project-local cluster（127.0.0.1:5433）。Compose 固定 PostgreSQL 18.6，符合官方目前支援的修補版；此電腦沒有 Docker CLI，因此本機沒有執行 Compose。

| 指令                        | 結果                                                          |
| --------------------------- | ------------------------------------------------------------- |
| npm ci                      | 通過，從 lockfile 乾淨安裝                                    |
| npm run db:migrate          | 2 個 Migration 已成功套用                                     |
| npm run db:seed（連續兩次） | 通過，沒有重設既有帳號與資料                                  |
| npm run lint                | 通過                                                          |
| npm run typecheck           | 通過                                                          |
| npm test                    | 8 項通過                                                      |
| npm run test:integration    | 4 項通過                                                      |
| npm run build               | 通過                                                          |
| npm run test:e2e            | 正式 Build 模式下 4 項通過：桌面 / 手機完整場景與畫面註冊建店 |
| npm run format:check        | 通過                                                          |
| npm audit --omit=dev        | 0 vulnerabilities                                             |

E2E 包含：畫面註冊與建立店家、Owner 建立店家與管理服務、人員、匿名成功預約並於管理端讀回、401 / 403 隔離、跨店 ID 修改 404、公開跨店資源拒絕、併發 200 / 409、後端推導結束時間、跨來源拒絕、STAFF 唯讀 / ADMIN 可寫、相同 Email 不改寫舊聯絡人、任意起始時間拒絕、停用服務拒絕、登出後 Session 失效。測試會清除自身 fixture，較早除錯過程留下的同格式合成資料亦已定向清理。docs/images 為正式 Build 下的合成測試資料畫面，已檢視桌面、手機版與公開預約頁。

整合測試繞過應用層直接連 PostgreSQL，驗證併發排他、相鄰時段、取消後釋放、跨店外鍵、非法長度與零長預約。pg 8 在併發負面測試會發出單連線 query 的棄用提示；目前固定版本下測試通過，升級 pg 9 前需重新驗證 Prisma adapter。

## 已知限制與後續工作

- 沒有 Production 部署、正式域名、寄信服務、付款、完整排程、取消／改期、邀請管理、CRM 合併或完整稽核。
- Staff 是提供服務的人員，Membership 是登入權限；人員與帳號綁定、角色邀請 UI 留待 Phase 2。
- 目前每位人員皆能提供所有上架服務，共用一段店家每日營業時間。秋季 DST 重複時間只提供單一 offset；跨日營業尚未支援。
- 同店設定與預約寫入採 Tenant row lock，確保一致性，未來大流量需細化鎖定。
- 認證限流目前僅單程序記憶體；公開營運前需共享限流、可信 Proxy 政策、公開預約反濫用、Email 驗證／密碼復原、備份與隱私資料生命週期。
- npm audit 全依賴仍有 5 個 high 告警，皆源自開發用 eslint-config-next -> fast-glob -> micromatch -> braces；[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 官方目前標示沒有 patched version。未以 force 降級 Next 或關閉檢查，正式執行依賴掃描為 0。
- ESLint 固定 9.39.5，以符合 Next 官方 config 所依賴的 React / a11y plugins peer range；npm 有 EOL 提示。ESLint 10 需等上游 plugins 宣告支援後一併升級，沒有使用 force / legacy-peer-deps 繞過相容性。
- Docker Compose 在本機尚未執行；GitHub Linux CI 結果另記於交付紀錄，不能以本機 PostgreSQL 測試代稱 Compose 已通過。

## GitHub 交付

已建立並推送 https://github.com/Cizing24/bookflow-saas，主要實作 commit 為 cfd213a59a4c1dcab430403a1cd4a353ad99f88b。GitHub Linux CI 正在執行，已完成 PostgreSQL 18.6 容器啟動、乾淨安裝與 Migration。沒有使用 force push。

## 下一階段接手

先依 README 啟動，閱讀 ARCHITECTURE 與 AGENTS。保留兩個已套用的 Migration 與排他約束；測試只可使用開發或測試資料庫。優先依 ROADMAP 完成排程、取消／改期、通知與共享反濫用，再安排獨立的 Production 上線驗收。
