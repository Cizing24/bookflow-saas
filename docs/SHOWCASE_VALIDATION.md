# BookFlow GitHub 展示驗證

日期：2026-11-21（Asia/Taipei）。本次只整理 README、架構說明與展示素材，不修改產品行為。

## 基準與既有成果

- 產品基準：`main` 的 `4c91336`。
- 文件基準：尚未合併的 [PR #2](https://github.com/Cizing24/bookflow-saas/pull/2)，`docs/readme-portfolio-overview` 的 `e8f7b2f`。本次 PR 疊在該文件分支，保留其內容與協作紀錄；由 main 補回仍有效的完整啟動、驗證與操作說明。
- [PR #3](https://github.com/Cizing24/bookflow-saas/pull/3) 是獨立公開 Demo 部署變更，本次未合併、未部署、未修改其公開服務。
- 原工作目錄的 `AGENTS.md`、`next-env.d.ts` 既有變更保留，本次使用獨立 worktree。
- 既有六張 `docs/images` 真實瀏覽器測試畫面原路徑保留；封面重用 `calendar-chromium.png`，不複製同一張圖。

## 架構核對

graphify AST 掃描 `src` 的 54 個檔案，取得 236 個節點、815 條關係；54 個檔案皆抽取成功，failed／skipped 為 0。AST 用來查模組與 import／call 關係，再人工讀以下來源核對業務語意：

| 元件或流程             | 實作依據                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| React UI 與 App Router | `src/app`、`src/components`；公開 `/b/[slug]`、店家 `/dashboard`、自助 `/manage`、平台 `/platform`。                                                  |
| HTTP 與輸入邊界        | `src/lib/http.ts`、`src/modules/shared/schemas.ts`、`src/app/api`；Route Handlers 呼叫 use case。                                                     |
| 認證與店家授權         | `src/lib/auth.ts`、`src/modules/identity/authorization.ts`、`src/modules/operations/access.ts`；Better Auth Session＋Membership，STAFF 綁定範圍。     |
| 平台權限               | `src/modules/platform/service.ts`；獨立 `PlatformAdmin`，啟停店家、`expectedActive` 與稽核同交易。                                                    |
| 排程與建單             | `src/modules/booking/domain.ts`、`service.ts`、`repository.ts`；純函式排程、資格、時區、鎖後重驗與冪等。                                              |
| 資料庫約束             | `prisma/schema.prisma` 與六個 `prisma/migrations/*/migration.sql`；tenant 複合 FK、CHECK、GiST exclusion、occupied range／status transition trigger。 |
| 異動與通知             | `src/modules/operations/service.ts`、`notifications.ts`、`tokens.ts`；預約、事件與通知同交易，SHA-256 管理 Token。                                    |
| Worker 與 Email        | `scripts/dispatch-notifications.ts`、`notifications.ts`；`SKIP LOCKED` claim、租約、版本檢查、失敗重試與可替換 Provider。                             |

AST 不能代替 SQL、交易語意或執行期權限驗證；未將整份 graph 當成完整依賴證明。圖中的 Email Gateway 是可設定的外部 adapter，沒有宣稱本機已寄出郵件。Worker 為 CLI 入口，正式定時派送需另配置排程。架構細節及歷史決策仍以 [ARCHITECTURE](ARCHITECTURE.md)／[TECHNICAL_DEEP_DIVE](TECHNICAL_DEEP_DIVE.md) 為準。

## 素材來源與公開範圍

本次新增素材來自本機 BookFlow，使用新建隔離 PostgreSQL 與 `prisma/seed.ts` 的合成資料。瀏覽器為 Playwright Chromium，桌面 viewport 1440 × 900；錄製前透過本機 API 登入合成帳號，不錄製密碼輸入。

預約確認頁的私人 `/manage#…` 連結在頁面繪製前以 CSS 遮罩，並以可見性斷言確認不會出現在公開素材。未錄製 Owner 的通知原文，未提交 Session、管理 Token、環境檔或資料庫內容。遮罩只為素材去識別，不改動產品程式。

| 素材                                | 內容                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `docs/images/calendar-chromium.png` | 重用既有真實週行事曆，作為 README 封面。                                   |
| `docs/media/public-booking.png`     | 顧客選服務、人員、日期與可用時段。                                         |
| `docs/media/bookings.png`           | 真實建單後由管理端讀回合成預約。                                           |
| `docs/media/scheduling.png`         | 員工服務資格與排班。                                                       |
| `docs/media/platform.png`           | 獨立平台管理與店家狀態。                                                   |
| `docs/media/demo.gif`               | 24.01 秒、192 幀，800 × 500，2,470,309 bytes；真實影片中的連續預約操作。   |
| `docs/media/demo.mp4`               | 89.68 秒，H.264／1280 × 800，582,528 bytes；可下載，未發布到外部影片平台。 |

## 本次驗證

執行環境：Windows、Node.js 24.22.1、PostgreSQL 18.4、Next.js 16.4.2 Webpack。資料庫僅綁定 localhost，與原專案的開發資料庫分開。

- 六個 migrations 在新建隔離資料庫成功套用；合成 Seed 與平台授權 CLI 成功。
- `npm test`：6 個測試檔、30 項通過。
- `npm run test:integration`：4 個測試檔、28 項通過。首輪新 cluster 的 `max_connections=20` 低於既有 20 條獨立連線測試的總需求，造成 11 項失敗、17 項通過；僅將本次隔離 cluster 調整為 100 並重啟後，完整重跑 28 項通過，未降低測試併發或修改程式。
- 錄製 smoke 成功：顧客選時段、填寫合成聯絡資料、真實建單、管理列表讀回、行事曆、員工排班、平台管理與手機 viewport。這是代表流程 smoke，不等於完整 E2E 矩陣。
- README 與兩份架構／驗證文件的本地連結皆有效；四張新增功能圖及重用封面／手機圖成功解碼。GIF 逐幀讀取、MP4／GIF 以 FFmpeg 完整解碼通過，並抽看 GIF 的選時段及成功畫面、影片的管理畫面。
- README Mermaid 經實際 parser／renderer 成功產出 `docs/media/architecture.svg`，並檢視渲染圖確認文字及箭頭可讀。
- 本次未重跑全部 E2E、Production Build、Docker、備份還原或完整 audit；歷史證據保留於 [STATUS](STATUS.md)，不混寫為本次結果。
- 本次沒有新增雙語文件。既有產品與 README 為繁體中文，English 技術術語與路徑保留。

## 遠端 CI 與相依風險

[PR #4 的 CI run 44795956224](https://github.com/Cizing24/bookflow-saas/actions/runs/44795956224)，程式與媒體提交 `8f022a11c13852da26abf6c654ddd5fe01679b3a`：

- 成功：乾淨安裝、Prisma 生成、六個 migrations、schema diff、Seed、Lint、Typecheck、Format、Unit 30、Migration 重建及 Integration 28。
- 失敗：`npm audit --omit=dev` 回報 4 vulnerabilities（1 moderate、3 high）。Next.js 16.4.2 被列為 moderate；`effect → @prisma/config → prisma` 相依鏈列為 high，三筆並非三個獨立根因。
- `effect` 公告為 [GHSA-7589-6fvf-x4pw](https://github.com/advisories/GHSA-7589-6fvf-x4pw)。Next.js 公告與套件適用版本以該 run 的 audit 原始輸出為準；套件被標記不等於已證明本系統所有路由皆可被利用。
- 後續 Production Build、Chromium E2E、Docker 建置及容器 smoke 被安全 gate 跳過；不能將歷史成功套用為本次通過。
- 本次僅文件／素材變更，未變動 package-lock、依賴或 workflow。沒有使用 `audit fix --force`（其建議包含 Prisma major 降版），也沒有忽略安全檢查。相依修補與回歸驗證仍待後續處理。

後續文件提交僅補記上述證據；應以 PR 的最新 check 為準，不以舊 run 當作新 SHA 的綠燈。

## 文案與保留資訊

依 speak-human-tw 進行繁體中文潤飾：以具體流程取代口號，分開本次結果與歷史驗收，保留角色、資料隔離、寄送語意及容量限制。依使用者直接完成的授權套用，不另外逐段確認。

| 原有表達                         | 調整原因                             | 本次寫法                                                           |
| -------------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| 「預約，從容有序。」             | 口號沒有交代產品用途。               | 「給工作室與服務店家的多租戶預約系統」，接上排班、預約及營運流程。 |
| 「本專案提供本機展示。」         | 無法交代另一個未合併部署 PR 的狀態。 | 明列本次本機素材與 PR #3 的部署變更屬不同分支。                    |
| 舊驗收與本次工作混在「測試」段落 | 日期和提交範圍容易被誤讀。           | 表格分列本次 Unit／媒體驗證與 2026-10-22 完整驗收。                |

保留：原安裝指令、Seed 行為、Windows PostgreSQL 替代方式、平台權限 CLI、完整驗證指令、架構／權限／營運／部署／狀態文件及既有真實協作聲明。
