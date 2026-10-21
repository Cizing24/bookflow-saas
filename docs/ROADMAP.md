# Roadmap

## Phase 1 — 核心與 MVP（完成）

帳號 Session、多租戶與角色、建立店家、服務與人員管理、每週營業時間、公開預約、預約列表、資料庫排他約束、Migration / Seed 與測試。歷史證據保留於 [Phase 1 交接](history/PHASE1_STATUS.md)。

## Phase 2 — Scheduling Engine（完成）

- 員工每週多段工作與休息、指定日期部分／全日停班、服務資格及管理介面。
- 店家時區統一政策、UTC 儲存、DST 跳時與重複 offset。
- 獨立 Availability Engine，服務長度、前後緩衝、提前時間、最遠日期與間隔。
- 真實後端日期／時段、交易內重新驗證、含緩衝的 PostgreSQL exclusion。
- 租戶內冪等鍵、管理者取消與釋放、20 條獨立 PostgreSQL 連線及 20 HTTP 請求併發測試。
- Domain / Database / E2E 回歸、全新資料庫 Migration 重建；確切結果以 [STATUS](STATUS.md) 為準。

## Phase 3 — Business Operations（完成）

- 完整預約狀態機、改期重驗、版本衝突、稽核、店家與顧客取消、完成與未到場。
- 真實資料日／週行事曆、員工欄位、篩選、詳情與操作面板、響應式介面。
- Owner / Admin / Staff 權限矩陣、帳號綁定、Staff 自身資料範圍及租戶隔離。
- 顧客搜尋、分頁、歷史與次數；完整期間 Dashboard 與店家時區趨勢。
- 256-bit 私人管理連結、取消／改期截止時間、同來源與共享公開限流。
- 交易 Outbox、可替換 Email Provider、延遲提醒、並行 claim、重試與本地預覽。
- 精確測試結果與剩餘邊界以 [STATUS](STATUS.md) 為準，未部署 Production。

## Phase 4 — Production Readiness & Portfolio Delivery（本次交付）

依 2026-10-22 本次需求，最終階段聚焦系統整合、驗收、安全與作品交付；原規劃的商業產品擴充移到下方，未擅自加入金流。

1. 前三階段回歸、平台登入／獨立權限、店家總覽／啟停／平台統計／稽核。
2. 停用與建單競爭、鎖後權限重驗、共享認證限流、JSON 大小、Session Cookie、CSRF 與安全 headers。
3. PostgreSQL Migration／Seed 的乾淨 GitHub CI、完整桌面／手機 E2E、20 請求與真實 DB 約束驗證。
4. Production Build、Docker tools/runtime、Health、環境範本、備份還原、部署與回滾操作。
5. 沿用 Design System，改善焦點與鍵盤／行動裝置、合成 Demo、README 架構圖／ERD／截圖與技術面試 Deep Dive。
6. Commit／授權 Push、讀回 CI 與確切成果；未取得外部平台／Secrets／Production 授權時保留部署邊界。

實際結果與未完成項目以 [STATUS](STATUS.md) 為準。

## 後續產品與正式營運工作（非本次範圍）

1. 訂閱、方案配額、自訂品牌、付款／訂金：先制定產品需求、資料契約與金流安全驗收。
2. 實際 Email Provider / Gateway 憑證、寄件網域、真實投遞與退信、冪等去重、部署 worker 排程與告警。
3. Email 驗證、密碼復原、Email 邀請、Owner 移轉及完整帳號營運流程。
4. 備份還原、隱私保留／撤銷／刪除、監控、最小 DB 權限與 Production 受控發版。
5. 高量資料 SQL 聚合／顧客查詢最佳化、Outbox 保留政策、WAF / Proxy 設定及容量評估。若需細化 Tenant lock，必須保留排程一致性、冪等及 DB exclusion。
6. 跨日連續服務、獨立員工時區或例外加班需另訂政策；目前保留店家時區、跨日拆班與停班扣除契約。

## 公開 Production 上線前

- HTTPS、正式 Origin、Secrets、最小 DB 權限、Migration 鎖表窗口與受控發布。
- 備份與還原、隱私政策、資料保留／刪除、監控與錯誤追蹤。
- 重跑部署環境 Migration、併發、Session Cookie、跨租戶隔離與瀏覽器矩陣。
- 持續依賴安全掃描，處理仍待上游修補的開發依賴告警。
- Production 切換須明確授權，本階段沒有部署。
