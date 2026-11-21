# 依賴安全修復與回歸驗證

日期：2026-11-21（Asia/Taipei）。[安全 PR #5](https://github.com/Cizing24/bookflow-saas/pull/5) 只修改 `package.json` 與 lockfile；修復提交為 `09001581a085ac7d8ae3ec02a5e76650f0dfd70f`，正常合併至 main 的提交為 `309891917987b7b53a50b2bb2554714120b49b5c`。

## 修復前後

| 檢查                            | 修復前                 | 修復後 |
| ------------------------------- | ---------------------- | ------ |
| `npm audit --omit=dev`          | 4：1 moderate、3 high  | 0      |
| `npm audit`（含開發相依）       | 11：8 moderate、3 high | 0      |
| Next.js／eslint-config-next     | 16.4.2                 | 16.4.6 |
| effect（`@prisma/config` 路徑） | 3.20.0                 | 3.22.1 |
| typescript-eslint               | 8.72.0                 | 8.73.0 |
| minimatch（該工具相依鏈）       | 10.2.6                 | 11.0.9 |

Prisma／Client／PG adapter 仍為 7.10.1，Better Auth 1.7.12、React 19.3.1、TypeScript 6.0.3 未變。沒有修改 API、排程、租戶授權、資料庫 schema 或 migrations。

## 選擇與邊界

- Next.js 採同一 minor 的 patch，eslint-config-next 與配套 SWC／env 同步至 16.4.6；原 React peer 與 Node 22.23.1 CI／Docker 符合 engine 範圍。[官方 release](https://github.com/vercel/next.js/releases/tag/v16.4.6)
- `@prisma/config` 7.10.1 固定引用 effect 3.20.0，因此 override 限定在這個父套件，改用含修補的 3.22.1。沒有採 effect 4，也沒有採 audit 提示的 Prisma major 降版。[Effect 公告](https://github.com/advisories/GHSA-7589-6fvf-x4pw)
- typescript-eslint 在既有相容範圍更新，帶入上游要求的 minimatch 11；沒有為了消除公告強制對所有使用者套用 minimatch major override。[minimatch 公告](https://github.com/advisories/GHSA-g3hv-75wg-m249)
- effect 問題涉及處理不可信字串的 Schema 模板，這裡的相依路徑屬 Prisma config／CLI；minimatch 路徑屬 lint 工具。套件被標記不代表已證明本系統所有公開路由可被利用，但建置、工具及正式相依都完成修補。
- override 移除條件：上游 `@prisma/config` 原生採用 effect 3.22.1 或更新安全版本，並重新通過生成、Migration、Build 與完整回歸。

未使用 `npm audit fix --force`，未降安全嚴重度門檻，未加入 ignore，未刪除測試。相依修復獨立於展示媒體 commit，保留原有架構與操作素材。

## 實際驗證

[安全 PR 的完整 CI run 44802071154](https://github.com/Cizing24/bookflow-saas/actions/runs/44802071154) 已成功，精確 head 為上述 `0900158`；Ubuntu、Node 22.23.1、真實 PostgreSQL 18.6。

| 驗證                                     | 實際結果                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 乾淨安裝、Prisma 生成、Seed、schema diff | 通過，schema 無差異                                                                                     |
| 六個 migrations 與空 DB 重建             | 通過，約束、索引、occupied range／status trigger 皆確認                                                 |
| Lint、Typecheck、Format                  | 通過                                                                                                    |
| Unit                                     | 30 項通過                                                                                               |
| PostgreSQL Integration                   | 28 項通過                                                                                               |
| Production Build                         | 通過，保留 Webpack 與 TypeScript 檢查                                                                   |
| 完整 Chromium E2E                        | 15 項通過，含桌面、平板、手機各 5 項                                                                    |
| HTTP 併發競爭                            | 三種裝置各 20 請求，均 1 success／19 conflicts                                                          |
| Docker runtime／tools build              | 兩個 target 實際成功                                                                                    |
| 容器 Migration／health／動態 Session     | 無待套用 Migration；Docker healthy 後 `/health` 回 `{"status":"ok"}`，`/api/auth/get-session` 回 `null` |
| 完整及正式相依 audit                     | 本機新 lockfile 與乾淨安裝皆 0；CI runtime audit 0                                                      |

E2E 包含真正 Better Auth Session、顧客預約、管理、租戶隔離、STAFF 範圍、改期／取消、冪等重試與平台權限；既有測試保持啟用。Docker smoke 使用真實資料庫與動態 Route Handler，沒有以 mock 代替。

安全 PR、README PR #2 與展示 PR #4 依正常 GitHub 流程整合，最新 head 的 check 與 main push CI 應分別確認。部署 PR #3 不在本次範圍，沒有發出部署或正式郵件。

audit 為當時已知公告的掃描結果，不是沒有未知漏洞的保證。真機、Safari／Firefox、生產容量及正式 Email 投遞仍維持既有限制。
