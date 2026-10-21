# Phase 2 — Scheduling Engine 交接狀態

更新日期：2026-10-21（Asia/Taipei）。本階段排程、資料庫一致性與完整預約流程已完成 Windows 本機與 GitHub Linux CI 驗收，未部署 Production。Phase 1 歷史結果完整保留於 [history/PHASE1_STATUS.md](history/PHASE1_STATUS.md)。

## 本次完成

- 沿用第一階段 Repository、認證、多租戶、角色、服務、人員、店家時間、公開預約與管理列表。
- 員工每週多段 WORK / BREAK，指定日期全日／部分請假、休假、臨時停班；員工服務資格與管理 UI。
- 店家時區作為所有員工唯一時區；UTC 儲存、DST 跳時／秋季雙 offset、含 offset 的預約確認。
- 可測試的 Availability Engine：服務分鐘、工作／休息／停班、既有占用、前後緩衝、提前分鐘、最遠天數、格線。
- 公開頁只展示後端日期與時段；交易鎖內重讀設定與重新驗證；失效時段回應中文 409。
- PostgreSQL `btree_gist` + `tstzrange(...,'[)')` partial exclusion，緩衝快照與不可偽造的 Trigger 占用端點。零緩衝相鄰合法，取消釋放。
- 租戶內唯一 Idempotency Key、正規化請求 SHA-256；相同內容重送回傳同筆，不同內容 409，取消重送保留 CANCELLED。
- 管理者取消介面、公開衝突／無時段／網路重試／成功與已取消狀態。
- 新增第三個 append-only Migration；既有兩個 Migration 沒有修改；既有服務資格回填與新店 Seed 行為保持相容。
- README、ARCHITECTURE、ROADMAP、STATUS 與 Linux CI 流程更新，新增乾淨資料庫重建檢查。

## 本機驗證結果

環境：Windows、Node.js 22.23.1、PostgreSQL 18.4 專案本機 cluster（127.0.0.1:5433）、Prisma 7.10.1。測試未使用 Mock Database。Compose PostgreSQL 18.6 的本機執行邊界與 Phase 1 相同，此電腦未使用 Docker。

| 檢查                                                | 實際結果                                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| npm run db:migrate                                  | 三個 Migration 全部成功套用，前兩個保留原樣                                                                                      |
| npm run test:migrations                             | 隨機全新 PostgreSQL 資料庫成功套用三個 Migration；讀回四個排程約束、三個新增索引、Trigger 與 btree_gist；清除自身暫時 DB         |
| Prisma migrate diff                                 | `--from-config-datasource --to-schema prisma/schema.prisma --exit-code`：No difference detected；自訂約束另由 SQL / 整合測試驗證 |
| npm run lint                                        | 通過                                                                                                                             |
| npm run typecheck                                   | 通過                                                                                                                             |
| npm test                                            | 18 項通過（原 8 項＋10 項排程 Domain Tests）                                                                                     |
| npm run test:integration -- --reporter=verbose      | 15 項通過（原 4 項＋11 項排程真實資料庫測試）                                                                                    |
| npm run build                                       | 通過，Next.js 正式 Webpack Build，未停用 TypeScript                                                                              |
| E2E_SERVER_COMMAND='npm run start' npm run test:e2e | 6 項通過，Chromium 桌面／手機各 3 項完整情境                                                                                     |
| npm run format:check                                | 通過                                                                                                                             |
| git diff --check                                    | 通過                                                                                                                             |
| npm audit --omit=dev                                | 0 vulnerabilities                                                                                                                |

測試 fixture 具有唯一租戶與帳號身份，測試後只清除自身合成資料。Database tests 與 E2E 拒絕非 localhost 或名稱含 prod 的資料庫。測試使用的 CREATEDB 權限僅為本機重建驗證，不代表正式 runtime 權限需求。

## 併發實測數字

| 情境                                                           | 同時請求 |     成功回應／寫入 |                        失敗／衝突 | 最終結果                                 |
| -------------------------------------------------------------- | -------: | -----------------: | --------------------------------: | ---------------------------------------- |
| 20 個不同 PostgreSQL backend PID，直接 INSERT 同一員工同一時段 |       20 |                  1 | 19（最新一輪全部 SQLSTATE 23P01） | 1 筆有效預約                             |
| 直接呼叫 Application Service 搶同一時段                        |       20 |                  1 |         19（安全的 AppError 409） | 1 筆有效預約                             |
| 桌面 E2E，20 個真實 HTTP POST 搶同一時段                       |       20 |      1（HTTP 200） |                    19（HTTP 409） | 1 筆有效預約                             |
| 手機 E2E，20 個真實 HTTP POST 搶同一時段                       |       20 |      1（HTTP 200） |                    19（HTTP 409） | 1 筆有效預約                             |
| 相同冪等鍵及相同內容，Application Service 並發重送             |       20 |      20 次成功回應 |                                 0 | 同一筆編號，只有 1 筆寫入                |
| E2E，服務端建單成功後刻意丟棄回應，再從畫面重送                |        2 | 原單成功＋原單讀回 |              首次回應模擬網路中斷 | 相同編號、1 筆有效預約；桌面／手機均通過 |

獨立 PostgreSQL 連線測試在第一輪亦曾出現 GiST 併發檢查的 `40P01` 死結回滾，資料庫仍只留下 1 筆。測試明確接受 PostgreSQL 的排他拒絕或死結回滾，並驗證 19 筆全部失敗與最終有效筆數，不把連線或不明錯誤當作正確衝突。應用亦將已辨識的交易衝突安全轉換為 409。最新 DB 統計寫入 Git 忽略的 `.local-db/phase2-concurrency.json`，不含 PII 或憑證。

## 測試覆蓋與修正

- 不同員工同時可約、半開相鄰、取消後重約、緩衝不能偽造或穿越休息。
- 多段工作與店家時間交集、部分／全日停班、資格取消、過期時間、提前與最遠日期改動後重驗。
- 同鍵內容不同、取消後重送、跨租戶同鍵獨立、跨店 FK／排班／取消拒絕。
- 臺北日界、紐約春季不存在時間與秋季兩個不同 UTC 起點；實際寫入重複牆上時間的兩筆相鄰瞬間。
- E2E 保留第一階段註冊、登入、建店、服務編輯、人員、匿名預約、管理讀回、401／403、跨店 ID、同來源、STAFF 唯讀、ADMIN 可寫、快照與登出撤銷；新增排班編輯、資格、預約政策、休假、衝突、網路遺失回應、取消及 20 HTTP 競爭。
- 修正排班／公開選單的明確無障礙標籤；E2E 精確定位產品錯誤提示，避免誤讀 Next.js route announcer。畫面認證測試遵守 429 的重試等待，沒有關閉限流。

## 已知邊界與 Phase 3 接續

- 所有員工使用店家時區；跨日班段須拆成兩天，單筆服務完整占用不可跨午夜。獨立員工時區、跨日連續服務與指定日期加班不在本次需求內。
- 沿用 Tenant row lock，同店寫入序列化；20 請求驗證正確性，不代表已完成生產容量或大型店家吞吐驗收。
- 新增人員／服務預設對應當時同店所有資源，管理者可調整；變更排班或緩衝不追溯修改／取消既有 Booking。
- 冪等鍵隨 Booking 保留，未設清除工作。舊 API 客戶端允許不帶鍵；需重試去重的整合必須保存鍵。前端同頁保留鍵，重新載入後不承諾還原待確認請求。
- 本機 Turbopack CSS worker 反覆連線前退出；dev / build 改用官方支援的 Webpack，正式 Build 和瀏覽器驗證已通過。
- pg 8 adapter 仍有單連線 query 棄用提示，沒有影響驗收結果；升級 pg 9 前要重新驗證。CI 的 npm ci 仍提示 5 個 high 開發依賴告警；既有來源背景保留在 Phase 1 歷史。正式依賴本機與 CI 重掃皆為 0，沒有強制降級或關閉安全檢查。
- Production、通知／outbox、改期、邀請、稽核、付款訂閱、共享限流與反濫用、備份還原及隱私資料生命週期仍待獨立實作／上線驗收。

## GitHub 交付

Repository：[Cizing24/bookflow-saas](https://github.com/Cizing24/bookflow-saas)。主要實作 Commit 為 [9341387297754464e8deb69c41462c1e03a3f877](https://github.com/Cizing24/bookflow-saas/commit/9341387297754464e8deb69c41462c1e03a3f877)，已經使用者明確授權推送至 main，並從 GitHub ref 讀回一致 SHA，未使用 force push。

[BookFlow CI #3](https://github.com/Cizing24/bookflow-saas/actions/runs/39625393968) 已完成，status = completed、conclusion = success，驗證 SHA 即上述實作 Commit。Ubuntu runner 使用 Node.js 22.23.1 與 PostgreSQL 18.6 service container，實際通過 npm ci、三個 Migration、Lint、Typecheck、Prettier、18 項 Domain Tests、乾淨資料庫重建、15 項 Database Integration Tests、正式依賴安全掃描、正式 Webpack Build 與 6 項桌面／手機 E2E。這驗證的是 service container，沒有宣稱直接執行 compose.yaml。

已讀回 Linux job logs：獨立 DB 連線 1 成功／19 筆 23P01、Application Service 1 成功／19 筆 409、冪等 20 回應／1 寫入；桌面及手機 HTTP 各 1 成功／19 衝突。此後補記只變更交接文件，沒有改動已驗證程式；docs-only push 依 workflow paths-ignore 不重跑。

下一階段先依 README 啟動，閱讀 AGENTS、ARCHITECTURE、ROADMAP 與此狀態。禁止改寫已套用 Migration、移除 exclusion 或用只查 availability 取代 DB 約束；Production 部署仍需明確授權。
