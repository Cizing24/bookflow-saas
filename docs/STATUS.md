# Phase 4 — Production Readiness & Portfolio Delivery

更新日期：2026-10-22（Asia/Taipei）。本機工程驗收完成；乾淨 Linux CI／Docker 驗證等待本次提交推送後讀回。沒有取得指定部署平台／正式 Secrets／Production 發布授權，未部署公開 Demo、未寄送正式 Email。

歷史結果保留於 [Phase 1](history/PHASE1_STATUS.md)、[Phase 2](history/PHASE2_STATUS.md)、[Phase 3](history/PHASE3_STATUS.md)。沒有以過去 CI success 代替本次結果。

## 本次交付

| 範圍                                                                                                                                          | 交付                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 平台管理                                                                                                                                      | `/platform`、真實 Session、獨立 PlatformAdmin、所有店家 25 筆分頁、啟用／停用、平台統計與最近 50 稽核；離線 CLI 授予／撤銷亦記錄                                                                    |
| 店家停用                                                                                                                                      | 公開入口與建單／改期拒絕、店家管理拒絕；既有私人連結仍可查看／取消；不刪歷史、不自動取消既有預約                                                                                                    |
| 交易安全                                                                                                                                      | 與建單共用 Tenant lock、expectedActive 防舊頁面、狀態＋稽核同交易、設定寫入鎖後重驗 Membership                                                                                                      |
| HTTP 強化                                                                                                                                     | 共享認證限流、精確 Origin、HttpOnly／Lax／HTTPS Secure Cookie、業務 JSON 64 KiB streaming 上限、JSON PATCH null 驗證、錯誤 no-store、基本 CSP／Permissions-Policy                                   |
| UI                                                                                                                                            | 沿用 Design System、focus-visible／reduced-motion、平台 loading／empty／error／分頁、手機 table 捲動、行事曆詳情聚焦／Escape／返回原事件                                                            |
| 部署                                                                                                                                          | Prisma schema drift                                                                                                                                                                                 | No difference detected（自訂 SQL 約束另驗） |
| 本機備份還原                                                                                                                                  | 成功還原至唯一暫時 DB，比對 7 張核心表數量、GiST 與兩個 trigger，清理自身暫時資料                                                                                                                   |
| Production Build、Docker tools／非 root standalone runtime、容器 health、正式 env 範本、Migration／worker、備份還原／發版／回滾與外部授權交接 |
| CI                                                                                                                                            | PostgreSQL service、npm ci、Migration／Seed、Lint／Typecheck／Format／Unit／Integration／Migration 重建／audit／Build／Playwright，再 Docker Build／容器 Migration／Health smoke；保留失敗 artifact |
| 作品文件                                                                                                                                      | README 商業問題／功能／架構／ERD／真實截圖／安裝／部署／限制、TECHNICAL_DEEP_DIVE 面試手冊，更新 ARCHITECTURE／PERMISSIONS／OPERATIONS／ROADMAP                                                     |

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
| 本機備份還原                   | 成功還原至唯一暫時 DB，比對 7 張核心表數量、GiST 與兩個 trigger，清理自身暫時資料                                  |
| Production Build               | 通過，TypeScript 保持啟用                                                                                          |
| Production Server E2E          | 15 項通過：Chromium 桌面、平板與手機各 5 項                                                                        |
| HTTP 併發                      | 桌面／平板／手機每種裝置 20 請求，1 成功／19 衝突，讀回 1 筆有效預約；20 條獨立 DB connection 的既有約束回歸也通過 |
| 正式相依 npm audit --omit=dev  | 0 vulnerabilities                                                                                                  |
| Seed                           | 成功連續執行兩次，示範資料與帳號可重跑且不重設                                                                     |
| format:check／git diff --check | 通過                                                                                                               |

完整 E2E 涵蓋註冊建店、服務／員工／排班、匿名成功預約、管理列表與行事曆、顧客改期／取消、取消釋放／重訂、租戶隔離、Staff 權限、未登入與越權拒絕、遺失 HTTP 回應冪等、平台 Owner 隔離／啟停／稽核／CSRF／Cookie／撤權。資料庫測試另外涵蓋終態、版本競爭、Token 範圍、Outbox 並行與重試。

初輪平台 E2E 對串流 not-found 頁面斷言 HTTP 404 而失敗；Next.js 內附文件確認串流開始後保留 200。修正為同時驗證公開 API 404、瀏覽器 not-found 內容與不存在預約按鈕，再重跑完整矩陣並擴增平板為十五項全數通過，沒有降低 API 授權或隱藏錯誤。受限 sandbox 的 DB socket／Build EPERM 改以允許本機程序的權限完成，沒有移除檢查。

## 尚未完成與已知邊界

- 公開 Production／Demo：尚無部署帳戶、目標 DB／網域與 Secrets 的授權交接；見 DEPLOYMENT。GitHub Push 權限可用，CI 結果將另讀回。
- Docker：本機沒有 Docker CLI，交由 GitHub runner 實際 Build 與 smoke；沒有把 Dockerfile 存在視為驗證通過。
- 正式 Email：未提供 Gateway／寄件網域／授權收件者，不宣稱寄送或投遞成功。worker／告警須由正式平台配置；SENT 僅表示 Provider 接受，Gateway 必須去重。
- 備份：已提供可操作的備份／隔離還原及回滾流程；正式環境與真實資料量的還原演練、RPO／RTO、PITR 尚無授權環境。
- 商用帳號／隱私：Email 驗證／復原／邀請、Owner 移轉、Token 撤銷／輪替、資料保留／刪除、訂閱金流不在本次交付範圍。
- 容量：同店鎖、Provider 期間持鎖、Outbox／限流資料保留、大量資料聚合仍需容量工程；行事曆 92 天／2000 筆、列表最近 200 筆。20 併發不代表 SLA。
- 安全邊界：不是 PostgreSQL RLS、不是完整 nonce CSP。Auth body 需 proxy 上限，預設不信任 IP headers。HTTPS Cookie／TLS／HSTS／最小 DB 權限需部署環境再驗。
- 上游提示：pg 8 adapter 提示未來 pg 9 的 query 排隊棄用；目前測試通過，未因此關閉警告或改用未驗證版本。
