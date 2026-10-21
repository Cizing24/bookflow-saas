# Phase 4 — Production Readiness & Portfolio Delivery

## 最終整合（2026-10-22）

PR [#1](https://github.com/Cizing24/bookflow-saas/pull/1) 整合 Phase 4 至 main。起始 main 為 `8f3d2b5b93e011f11a54f62e3acc36b06d31e55f`，Phase 3 為 `911dad5`，Phase 4 為 `e87d474deb5c6be853122ba92905c03aa2ea8ca4`；前兩者皆為 Phase 4 ancestor，前四個 Migration 原文保留。起始工作樹乾淨，PR 無衝突，[原 head PR CI](https://github.com/Cizing24/bookflow-saas/actions/runs/39653021045) 全部成功。

本次將 README 下載分支改為 main，補齊 [交付與驗收清單](RELEASE_CHECKLIST.md)。最新 PR head 必須重新通過 CI 才合併，合併後另確認 main push CI；下方 Phase 4 開發證據保留為歷史紀錄，不代表合併後的 SHA。本次不部署 Production、不建立收費資源、不刪除正式資料。

本次整合重新執行的本機結果：`db:generate`／`db:migrate`、`verify`（Lint／Typecheck／Unit 30／Integration 28／空 DB 六個 Migration／Build／Format）、隔離備份還原（七張表與 Booking 保護）、schema diff、Seed 連跑兩次、正式伺服器 Playwright 15 項全部成功。桌面／平板／手機各 20 HTTP 請求均為 1 成功／19 衝突。38 個本機文件連結有效，已知本機 Session Secret 在 125 個受追蹤檔案與 44 個 static 檔案的匹配為 0；此掃描不代表所有可能機密的全面證明。正式依賴 audit 0；完整 audit 仍為既有開發工具 5 high，已重新確認 braces 3.0.3／micromatch 4.0.8／eslint-config-next 16.4.2 尚無相容發布修補版。本機沒有 Docker CLI，Docker 驗證由最新 GitHub CI 執行。

合併後精確 main SHA 以 [PR #1 的 merge commit](https://github.com/Cizing24/bookflow-saas/pull/1) 為準；[main CI 清單](https://github.com/Cizing24/bookflow-saas/actions?query=branch%3Amain+event%3Apush) 必須核對同一 SHA 的成功結果，不能以歷史綠燈取代。此文件在 PR 合併前隨同受測提交納入，以避免合併後再產生未驗證的補記提交。

## Phase 4 開發交付歷史

更新日期：2026-10-22（Asia/Taipei）。本機工程驗收與乾淨 Linux CI／Docker 驗證皆完成。沒有取得指定部署平台／正式 Secrets／Production 發布授權，未部署公開 Demo、未寄送正式 Email。

歷史結果保留於 [Phase 1](history/PHASE1_STATUS.md)、[Phase 2](history/PHASE2_STATUS.md)、[Phase 3](history/PHASE3_STATUS.md)。沒有以過去 CI success 代替本次結果。

## 本次交付

| 範圍      | 交付                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| 平台管理  | `/platform`、真實 Session、獨立 PlatformAdmin、25 店分頁、啟停、統計、稽核與離線權限 CLI                          |
| 店家停用  | 公開預約及管理拒絕；既有私人連結可查看／取消，不刪歷史                                                            |
| 交易安全  | Tenant lock、expectedActive、同交易稽核、設定寫入鎖後 Membership 重驗                                             |
| HTTP 強化 | 共享認證限流、Origin、安全 Cookie、JSON 64 KiB、null PATCH 驗證、no-store、安全 headers                           |
| UI        | 一致元件、焦點／reduced-motion、平台狀態／分頁、手機表格捲動、詳情鍵盤操作                                        |
| 部署      | Production Build、Docker tools/runtime、Health、正式 env、Migration/worker、備份還原／回滾                        |
| CI        | PostgreSQL、npm ci、Migration/Seed、Lint/Typecheck/Format/Unit/Integration、audit、Build、15 項 E2E、Docker smoke |
| 作品文件  | README 架構／ERD／真實截圖、TECHNICAL_DEEP_DIVE，更新所有技術交接文件                                             |

第五個 append-only Migration 新增 Tenant.active、PlatformAdmin、PlatformEvent；第六個校正新外鍵 ON UPDATE CASCADE，保留已套用的第五個原文。前四個 Migration 原文、複合 FK、CHECK、GiST exclusion、occupied／終態 trigger 保留。沒有 reset、db push、正式 Migration、Production 發布、合併 main 或 force push。

## 本機實際驗證

Windows、Node.js 22.23.1、專案本機 PostgreSQL 18.4（127.0.0.1:5433）、Next.js 16.4.2 Webpack。整合測試用真實 PostgreSQL；營運測試只注入 Session identity，E2E 用真正 Better Auth Session。所有顧客／帳號 fixture 皆為合成資料且只清除自身範圍。

| 檢查                           | 結果                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| db:migrate                     | 6 個 Migration 套用成功                                                                                            |
| test:migrations                | 隨機空 DB 成功重建 6 個 Migration；讀回排程約束、索引、trigger、extension、營運／平台資料表，清除自身暫時 DB       |
| lint／typecheck                | 通過                                                                                                               |
| Unit                           | 30 項通過                                                                                                          |
| Integration                    | 28 項通過                                                                                                          |
| Prisma schema drift            | No difference detected（自訂 SQL 約束另驗）                                                                        |
| 公開 bundle 機密檢查           | 本機正式產物 44 個 static 檔案，已知本機 Session Secret 的 literal matches 為 0；未輸出 Secret 值                  |
| 本機備份還原                   | 成功還原至唯一暫時 DB，比對 7 張核心表數量、GiST 與兩個 trigger，清理自身暫時資料                                  |
| Production Build               | 通過，TypeScript 保持啟用                                                                                          |
| Production Server E2E          | 15 項通過：Chromium 桌面、平板與手機各 5 項                                                                        |
| HTTP 併發                      | 桌面／平板／手機每種裝置 20 請求，1 成功／19 衝突，讀回 1 筆有效預約；20 條獨立 DB connection 的既有約束回歸也通過 |
| 正式相依 npm audit --omit=dev  | 0 vulnerabilities                                                                                                  |
| 含開發相依 npm audit           | 5 high（同一 braces 公告的相依鏈）；registry latest 3.0.3 仍受影響，尚無修補版                                     |
| Seed                           | 成功連續執行兩次，示範資料與帳號可重跑且不重設                                                                     |
| 平台授權 CLI                   | grant／revoke 均成功；讀回合成 Demo 帳號 PlatformAdmin 數量為 0，ADMIN_GRANTED／ADMIN_REVOKED 稽核存在             |
| format:check／git diff --check | 通過                                                                                                               |

完整 E2E 涵蓋註冊建店、服務／員工／排班、匿名成功預約、管理列表與行事曆、顧客改期／取消、取消釋放／重訂、租戶隔離、Staff 權限、未登入與越權拒絕、遺失 HTTP 回應冪等、平台 Owner 隔離／啟停／稽核／CSRF／Cookie／撤權。資料庫測試另外涵蓋終態、版本競爭、Token 範圍、Outbox 並行與重試。

初輪平台 E2E 對串流 not-found 頁面斷言 HTTP 404 而失敗；Next.js 內附文件確認串流開始後保留 200。修正為同時驗證公開 API 404、瀏覽器 not-found 內容與不存在預約按鈕，再重跑完整矩陣並擴增平板為十五項全數通過，沒有降低 API 授權或隱藏錯誤。受限 sandbox 的 DB socket／Build EPERM 改以允許本機程序的權限完成，沒有移除檢查。

最後 UI 整合修正已淘汰的第一階段排班說明；登出若 API 失敗，保留管理畫面並顯示失敗，成功重試才導頁。E2E 模擬 503、驗證 Session 仍有效，再成功登出並確認後續管理 API 401。

## 乾淨 Linux CI 與交付證據

- 分支：`phase4-production-readiness`，Repository：[Cizing24/bookflow-saas](https://github.com/Cizing24/bookflow-saas/tree/phase4-production-readiness)。
- 最終程式／測試提交：`6288fe71091788f4b7f34c8b99c998329bab810f`。
- [GitHub Actions run 39651311159](https://github.com/Cizing24/bookflow-saas/actions/runs/39651311159)：整輪 **success**，job `119400048978`，已讀回全部步驟與完成後日誌。
- Ubuntu 乾淨 checkout／npm ci、Node 22.23.1、PostgreSQL 18.6；成功套用 6 個 Migration、Seed、schema diff 無差異、Lint／Typecheck／Format、Unit 30、Integration 28、Migration 重建、正式依賴 audit 0、Production Build、Playwright 15。
- 日誌確認桌面／平板／手機 HTTP race 各為 1 success／19 conflicts，包含最終登出 503 與成功重試回歸。
- Docker tools/runtime build 皆 success；tools 連線真實 PostgreSQL 執行 migrate，讀回 No pending migrations；runtime 以 PORT=3001 啟動，Docker 自身回報 healthy 後才檢查 `/health` 200 `{"status":"ok"}` 與 `/api/auth/get-session` 200 `null`。沒有 mock DB 或略過動態模組。
- 首輪容器建置因 tools 階段讀 Prisma config 時缺 DATABASE_URL 而失敗；追加非機密 build-only placeholder 後重跑成功。另讓 healthcheck 隨 PORT 運作並驗證 Docker 自身健康狀態，沒有忽略失敗。
- 後續文件提交僅回填已完成證據與限制，不變動以上受測程式、依賴或 Workflow。文件路徑由 CI paths-ignore 排除，不將文件提交宣稱為新一輪測試。

## 尚未完成與已知邊界

- 公開 Production／Demo：尚無指定部署帳戶、目標 DB／網域與 Secrets 的授權交接；見 DEPLOYMENT。GitHub 分支已推送並核對 SHA；本次 CI success 見下方。
- Docker：本機沒有 Docker CLI；GitHub runner 已實際完成 tools/runtime Build、容器 Migration、Docker healthy 與動態 Session smoke。
- 正式 Email：未提供 Gateway／寄件網域／授權收件者，不宣稱寄送或投遞成功。worker／告警須由正式平台配置；SENT 僅表示 Provider 接受，Gateway 必須去重。
- 備份：已提供可操作的備份／隔離還原及回滾流程；正式環境與真實資料量的還原演練、RPO／RTO、PITR 尚無授權環境。
- 商用帳號／隱私：Email 驗證／復原／邀請、Owner 移轉、Token 撤銷／輪替、資料保留／刪除、訂閱金流不在本次交付範圍。
- 容量：同店鎖、Provider 期間持鎖、Outbox／限流資料保留、大量資料聚合仍需容量工程；行事曆 92 天／2000 筆、列表最近 200 筆。20 併發不代表 SLA。
- 安全邊界：不是 PostgreSQL RLS、不是完整 nonce CSP。Auth body 需 proxy 上限，預設不信任 IP headers。HTTPS Cookie／TLS／HSTS／最小 DB 權限需部署環境再驗。
- 上游提示：pg 8 adapter 提示未來 pg 9 的 query 排隊棄用；目前測試通過，未因此關閉警告或改用未驗證版本。
- 開發工具安全：`eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` 共 5 high，根因為 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)。本次查詢 registry latest braces=3.0.3、micromatch=4.0.8，公告涵蓋 braces <=3.0.3；沒有可採用的發布修補版。npm audit 建議降至 eslint-config-next 14.2.35，與 Next.js 16 工具鏈不一致，未採用強制降版或隱藏公告。正式 runtime 相依掃描為 0，後續需追蹤上游。
