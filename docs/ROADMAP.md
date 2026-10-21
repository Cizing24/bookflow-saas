# Roadmap

## Phase 1 — 核心與 MVP（完成）

帳號 Session、多租戶與角色、建立店家、服務與人員管理、每週營業時間、公開預約、預約列表、資料庫排他約束、Migration / Seed 與測試。歷史證據保留於 [Phase 1 交接](history/PHASE1_STATUS.md)。

## Phase 2 — Scheduling Engine（本次交付）

- 員工每週多段工作與休息、指定日期部分／全日停班、服務資格及管理介面。
- 店家時區統一政策、UTC 儲存、DST 跳時與重複 offset。
- 獨立 Availability Engine，服務長度、前後緩衝、提前時間、最遠日期與間隔。
- 真實後端日期／時段、交易內重新驗證、含緩衝的 PostgreSQL exclusion。
- 租戶內冪等鍵、管理者取消與釋放、20 條獨立 PostgreSQL 連線及 20 HTTP 請求併發測試。
- Domain / Database / E2E 回歸、全新資料庫 Migration 重建；確切結果以 [STATUS](STATUS.md) 為準。

## Phase 3 — SaaS 商業化與營運

開始前先閱讀 STATUS、ARCHITECTURE、AGENTS，保留三個已套用的 Migration 與所有 DB 約束。以下為待拆分需求，未因 Phase 2 排程交付而視為已完成：

1. 訂閱、方案配額、自訂品牌、付款／訂金，需先確認產品需求與資料契約。
2. 改期與可稽核狀態轉換、Email 通知 / outbox、Email 驗證與密碼復原。
3. 邀請與角色管理、人員與帳號綁定、預約查詢分頁與報表。
4. 公開 API / 認證共享限流、可信 Proxy 與反濫用政策；日期計算的快取／容量規劃須保留交易重驗。
5. 若需要跨日連續服務、各員工獨立時區或例外加班，另外制定政策與驗收；目前是店家時區＋跨日拆班＋停班扣除。
6. 大流量時評估更細鎖定；必須維持設定一致性、冪等及資料庫 exclusion，不能只靠先查再寫。

## 公開 Production 上線前

- HTTPS、正式 Origin、Secrets、最小 DB 權限、Migration 鎖表窗口與受控發布。
- 備份與還原、隱私政策、資料保留／刪除、監控與錯誤追蹤。
- 重跑部署環境 Migration、併發、Session Cookie、跨租戶隔離與瀏覽器矩陣。
- 持續依賴安全掃描，處理仍待上游修補的開發依賴告警。
- Production 切換須明確授權，本階段沒有部署。
