# Phase 3 — Business Operations 交接狀態

更新日期：2026-10-22（Asia/Taipei）。本階段已完成 Windows 本機真實 PostgreSQL 與正式 Build 的桌面／手機驗證，保留前兩階段多租戶與排程引擎。未部署 Production，未使用正式寄信憑證或寄送正式 Email。歷史結果保留於 [Phase 1](history/PHASE1_STATUS.md) 與 [Phase 2](history/PHASE2_STATUS.md)。

## 完成範圍

| 功能             | 實際交付                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 預約生命週期     | CONFIRMED、CANCELLED、COMPLETED、NO_SHOW；禁止終態回復與改期，DB trigger 再次保護；完成須服務結束、未到場須已開始                  |
| 詳情與修改／改期 | 管理面板調整服務、員工、時間；保留 Booking ID、交易內重驗排程與衝突、revision 拒絕舊畫面覆寫                                       |
| 顧客／店家取消   | 顧客受原開始時間與截止政策限制；店家可處理自身授權範圍；取消釋放緩衝占用，重送不重寫事件                                           |
| 稽核             | 建立與每次異動同交易記錄 UTC 時間、操作者、動作、前後狀態／服務／員工／時間／金額快照                                              |
| 專業行事曆       | 資料庫日／週查詢、員工欄位、服務與員工篩選、狀態文字與色彩、點選詳情、操作改期與取消；重疊歷史／替代預約分欄，DST 重複牆上時間分欄 |
| RBAC             | Owner 管理成員／截止設定；Admin 管理排班、服務、預約；Staff 只讀寫明確綁定的自身預約，無綁定時無工作資料；舊 overview 同時收緊範圍 |
| 顧客管理         | 同租戶搜尋、聯絡快照、Email 彙整預約次數與歷史分頁；Staff 無顧客名冊權限，只能取得自身工作必要聯絡資料                             |
| 通知             | 交易 Outbox、成立／取消／改期與開始前提醒、HTTP EmailProvider 介面、租約 claim、重試、過期提醒跳過、Owner 預覽與 worker 指令       |
| 自助管理         | 256-bit 隨機 Token、Booking 只存 SHA-256；fragment 連結、no-store / no-referrer、自助查看／改期／取消、截止分鐘設定                |
| Dashboard        | 店家時區今日預約、即將開始、期間完成／取消、各服務量、逐日趨勢；完整期間查詢，Staff 統計只含自身                                   |
| 公開反濫用       | PostgreSQL 原子共享限流、429 與 Retry-After；預設不信任 IP header，可信 Proxy 每 IP 模式需明確設定                                 |
| 文件             | README、ARCHITECTURE、ROADMAP、PERMISSIONS、OPERATIONS、Phase 2 歷史交接與本文件                                                   |

第四個 Migration 為 append-only：新增終態、截止設定、員工帳號複合 FK 綁定、Token 雜湊、revision、BookingEvent、Notification 與 RateLimit，保留前三個 Migration 原文、所有排程 CHECK、occupied trigger 與 GiST exclusion。沒有 reset、db push、資料清空或 Production Migration。

## 實際驗證結果

環境：Windows、Node.js 22.23.1、專案本機 PostgreSQL 18.4（127.0.0.1:5433）、Prisma 7.10.1、Next.js 16.4.2 Webpack。執行時間涵蓋 2026-10-21 至 2026-10-22。DB 測試沒有 Mock Database；營運整合測試僅注入 Session identity，Membership、查詢、交易與約束都使用真實 PostgreSQL。E2E 使用真實 Better Auth Session。

| 檢查                                                | 最終實際結果                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| npm run db:migrate                                  | 四個 Migration 成功套用到本機開發 DB                                                                                                       |
| npm run test:migrations                             | 隨機全新本機 DB 成功重建四個 Migration，讀回原排程約束、索引、occupied trigger、btree_gist 與新增營運資料表／狀態 trigger，清除自身暫時 DB |
| Prisma migrate diff                                 | --from-config-datasource --to-schema prisma/schema.prisma --exit-code：No difference detected；自訂 SQL 約束另由重建與整合測試驗證         |
| npm run lint                                        | 通過                                                                                                                                       |
| npm run typecheck                                   | 通過                                                                                                                                       |
| npm test                                            | 26 項通過（前階段 18＋狀態／截止／Token 4＋Provider 契約 2＋行事曆重疊 2）                                                                 |
| npm run test:integration                            | 24 項通過（前階段 15＋營運 9）                                                                                                             |
| npm run build                                       | 最新程式正式 Webpack Build 通過，TypeScript 保持啟用                                                                                       |
| E2E_SERVER_COMMAND='npm run start' npm run test:e2e | 8 項通過，Chromium 桌面／手機各 4 項完整情境                                                                                               |
| npm run format:check                                | 通過                                                                                                                                       |
| git diff --check                                    | 通過                                                                                                                                       |
| npm audit --omit=dev                                | 0 vulnerabilities                                                                                                                          |

所有 fixture 為唯一租戶／帳號／Email 的合成資料，測試只清除自己的資料。Outbox 測試限定其 fixture 租戶，未將其他店家的通知標為測試寄送成功。測試保留限流，認證遇到 429 時依 Retry-After 等待。

初輪新增 E2E 因行事曆 select 的 label 包含選項文字而無法精確定位「檢視」；已補上檢視、篩選、改期與成員選單的 aria-label，隨後重跑**完整八項桌面／手機矩陣**全數通過。截圖也已人工檢視：[桌面](images/calendar-chromium.png)、[手機](images/calendar-mobile.png)，皆為合成測試資料。

本機受限執行環境曾阻擋 PostgreSQL socket 與 Build 檔案操作，改以允許本機程序／連線的執行權限完成；沒有因此移除檢查、關閉安全機制或跳過 DB／瀏覽器驗證。

## 覆蓋的安全與一致性情境

- 完整狀態轉換矩陣、提前完成／未到場拒絕、截止時間恰好邊界與開始後拒絕。
- 改期排除自己、仍拒絕其他有效占用；同時兩筆改期搶同一時段只成功一筆；舊 revision 拒絕。
- 原 20 獨立 PostgreSQL 連線、Application Service 與冪等競爭回歸保留；桌面／手機 20 HTTP 請求各 1 成功、19 衝突。
- Staff 水平越權（其他員工預約／轉派）拒絕、無綁定查無資料、顧客名冊／通知／設定／成員垂直越權拒絕、跨租戶存取與綁定拒絕；DB 複合 FK 直接寫入也拒絕跨店綁定。
- Owner 成員新增／改角色／綁定／移除；下一個請求立即依新 Membership 限制或拒絕，不可移除／降權 Owner。
- 隨機管理 Token、無效 Token 拒絕、input Booking ID 無法轉移權限；顧客不能完成服務或標記未到場。
- 預約成立同交易寫入事件與兩筆 Outbox；冪等重試保留原預約，不再次回傳原始 Token。
- Provider HTTP payload 僅包含寄信契約，不將 DB 工作欄位／租約／Booking 資料轉交 Gateway；正式環境拒絕 preview，缺設定或 503 不回報成功。
- 寄信失敗保留重試、並行 worker 只 claim 一次、過期 PROCESSING 租約復原沿用同一去重 key、失效版本提醒跳過、PREVIEWED 的 sentAt 為 null。
- 顧客搜尋與歷史依租戶隔離、次數與真實 DB 一致；Staff Dashboard 同樣依自身 Booking scope 計算。
- 共享限流並發請求上限及過期 counter 重設。
- 既有 Phase 1 / 2 認證、營業時間、班表／休假／資格、DST、緩衝、跨店關聯、防衝突、遺失回應冪等與登出回歸完整保留。

## Git 交付與第四階段接續

交付分支為 `phase3-business-operations`，保留 main 與既有提交歷史；沒有合併 main、force push 或正式部署。提交 SHA 與遠端讀回結果由本次交付回報提供。Phase 3 的 Linux CI 尚未執行；不可沿用 Phase 2 的 CI success 當成本次驗證。

下一階段先閱讀 README、AGENTS、ARCHITECTURE、PERMISSIONS、OPERATIONS 與此文件。Phase 4 依 ROADMAP 制定商業化與上線需求，以下仍需另外完成：

- **正式 Email**：提供 Gateway／Provider 憑證、已驗證寄件網域與授權測試收件人；實測接受、冪等、投遞與退信。SENT 只表示 Provider 接受；本次沒有正式寄送。
- **部署與排程**：正式 worker 排程、失敗／延遲監控、HTTPS／Origin／Proxy／Secrets／最小權限與受控 Migration。新增雲端資源與 Production 部署需另外授權。
- **Exactly-once 邊界**：寄信為 at-least-once；Gateway 必須依 Notification ID 持久化去重，否則當機復原可能重複。Preview 是 PREVIEWED，不能當作 SENT。
- **舊預約與私人連結**：Phase 1 / 2 既有資料不回填 Token。新 Token 僅首次建單回應與成立通知提供；若首次回應遺失，從通知取回或聯絡店家。管理連結沒有自動失效／輪替介面，目前由狀態機與截止時間限制寫入，讀取僅提供該單的最小資料；撤銷／保留政策列入隱私生命週期工作。
- **容量與資料量**：保留同店 Tenant lock，寄信期間最多等待 HTTP timeout 10 秒。行事曆最多 92 天／2000 筆，超出須縮小；列表 200 筆、顧客歷史每頁 50 筆，統計查完整指定期間。大型店家需 SQL 聚合／顧客查詢／連線池／鎖等待與容量驗收。
- **個資與帳號營運**：相同 Email 彙整不是身分驗證；備份還原、資料保留／撤銷／刪除、Email 驗證、密碼復原、Email 邀請、Owner 移轉仍待實作。
- **產品邊界**：本次未加入訂閱付款、訂金、方案配額或自訂品牌，避免在 Business Operations 階段改變既有產品契約。
- **既有環境提示**：pg 8 adapter 仍提示未來 pg 9 的 query 排隊棄用；目前驗證通過。開發依賴背景保留於 Phase 2 歷史，本次未升級依賴；正式依賴安全掃描為 0。
