# BookFlow Live Demo 驗收

執行日：2026-11-14 至 2026-11-15（Asia/Taipei）。

| 項目                 | 實際結果                                                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 公開入口             | https://bookflow-live-demo.vercel.app/b/flow-studio                                                                                                                                                  |
| Hosting              | Vercel `CIZING` Hobby，獨立 `bookflow-live-demo` project；Function 設定 `sin1`，建置機器 `iad1`                                                                                                      |
| App SHA              | `953a4942882db48fa5fecaaabf75776853e8ff52`；CLI 從此版本上傳，後續提交只有驗收程式及文件                                                                                                             |
| Deployment           | `dpl_6z9HjSTvLdG8GvEbB2cRnYpSNSGP`，READY；[固定版本](https://bookflow-live-demo-8yy3sac0b-cizing.vercel.app)／[發布詳情](https://vercel.com/cizing/bookflow-live-demo/6z9HjSTvLdG8GvEbB2cRnYpSNSGP) |
| Database             | Neon Free、PostgreSQL 18、AWS Singapore、獨立 project `morning-mode-34714172`／branch `demo-live-20261114`／DB `bookflow_demo`                                                                       |
| Migration／Provision | 6 份 Migration 已在新雲端 DB 套用；建立合成店家、兩名人員、服務、獨立私有 Owner 及 provisioning 稽核。原 Seed production 保護保留                                                                    |
| Runtime DB 權限      | `bookflow_runtime`，pooled TLS、無 schema CREATE／DDL、不能修改 PlatformAdmin 或稽核；直連 migrator 另行保管                                                                                         |
| 外部匿名瀏覽器       | [Public Demo Smoke PASS](https://github.com/Cizing24/bookflow-saas/actions/runs/43624519492)，由 GitHub-hosted Ubuntu Chromium 執行，沒有 GitHub／Vercel browser login 或 protection bypass          |
| 真實動態流程         | 從 UI 建立合成預約→私人 Token 讀回→改期→取消→讀回 CANCELLED；保留合成稽核與 PostgreSQL 紀錄                                                                                                          |
| 公開安全             | 同員工撞期 409、非合成聯絡值 400、錯誤 Origin 403、公開註冊 403、匿名管理 401、無效 Token 404，環境檔／debug 404                                                                                     |
| RWD                  | 1440、768、390、320 px；真實 UI、固定合成欄位、時段載入及無水平溢出通過                                                                                                                              |
| 證據                 | [公開驗收 artifact](https://github.com/Cizing24/bookflow-saas/actions/runs/43624519492/artifacts/14125044918)，四張匿名畫面截圖和 results.json；7 日保存，不包含 Token、帳密或個資                   |
| 核心 CI              | [應用版本 CI PASS](https://github.com/Cizing24/bookflow-saas/actions/runs/43622090512)；新驗收程式提交另外跑原 CI，狀態以 PR 檢查為準                                                                |
| 本機驗證             | Lint／Format／Typecheck／Build、32 unit、28 PostgreSQL integration 通過；Production 模式隔離 provisioning 成功且拒絕重跑，runtime npm audit 0                                                        |
| Email                | 不配置 Gateway、不執行通知 worker；public-demo guard 禁止寄信。Outbox PENDING 不等於已寄送                                                                                                           |
| 成本                 | 沒有新增付費訂閱／付款資料；限額內固定 US$0。免費服務有配額與冷啟動，沒有 SLA                                                                                                                        |

Vercel Agent setup、CLI 及 OAuth 已完成。新 Demo project 已移除平台 SSO 存取門檻，以供匿名訪客；應用 Better Auth、Cookie、Origin、RBAC 與 Token 防護保留。既有 booking-system 沒有修改。

初次未完整注入 Secrets 的發布因缺少 DATABASE_URL 失敗，未宣稱成功；修正後上述 deployment READY，外部完整預約 smoke 通過。Secrets 經受限檔案送入 Provider，未出現在來源／命令文字／報告。

尚未驗證：真實 Safari／手機、公開 Owner 成功登入的 Cookie 實測、雲端 DB 人工中斷／恢復、完整備份還原與長期冷啟動觀察。測試訪客沒有看到別人輸入個資，因伺服器只允許固定合成值；完整跨租戶規則另有本機 28 個 integration 驗證，沒有宣稱多租戶雲端全套情境皆已重跑。

本 PR 不合併；Portfolio 尚未整合，因另外兩案仍未上線。更新、停止、備份、資料集輪替與回滾依 DEMO_OPERATIONS.md。
