# BookFlow 營運操作與 Email 設定

## 本機營運操作

1. 依 README 啟動資料庫、套用四個 Migration、啟動網站。
2. Owner 在「店家與成員」輸入**已註冊**成員 Email、Admin / Staff 角色與服務人員綁定。未綁定 Staff 看不到預約；沒有 Email 邀請與 Owner 移轉流程。
3. 在同頁設定取消與改期截止分鐘，預設 1440（24 小時），0 代表只要求尚未開始。管理者操作不受此截止時間限制。
4. 公開建單成功畫面保存「管理我的預約」私人連結。沒有連結的舊資料仍可由店家操作。
5. 「專業行事曆」切換日／週、日期、員工與服務；手機橫向捲動，點選預約查看詳情。操作面板可查詢後端時段、調整服務／人員／時間、取消、完成或標記未到場。服務結束前不能完成，開始前不能標記未到場；伺服器回傳具體錯誤。
6. 「顧客管理」搜尋姓名、Email、電話，查看以同店 Email 彙整的歷史與次數。Email 尚未驗證，不可當作身分證據；每次匿名輸入仍獨立保留聯絡快照。
7. 總覽設定起日與 1–92 天期間，查看真實期間統計、每日趨勢、各服務數量與即將開始預約。STAFF 數字只涵蓋自身。

## 開發 Email Preview

在本機 `.env` 設定 `EMAIL_PROVIDER=preview`，執行：

```powershell
npm run notifications:dispatch
```

Owner 到「店家與成員 → 通知與 Email 預覽」重新整理。已由 preview worker 處理的工作為 PREVIEWED，sentAt=null，沒有真的寄信。未到期提醒仍為 PENDING；通知預覽含管理連結，請勿貼到公開 Issue、Log 或截圖。Production runtime 拒絕使用 preview。

Preview 已處理的工作不會因更換 Provider 就自動重寄，以避免寄出合成測試資料。正式整合驗證須使用新的明確授權測試預約。

## 正式 Email Provider

應用提供可替換 `EmailProvider.send()` 介面與 HTTP Gateway adapter。以平台 Secrets 設定以下值，不提交到 Git：

| 變數                | 用途                                 |
| ------------------- | ------------------------------------ |
| NODE_ENV=production | 正式 worker 必須設定，禁止 preview   |
| EMAIL_PROVIDER=http | 選擇 HTTP Gateway                    |
| EMAIL_HTTP_URL      | 可信 Email Gateway HTTPS URL         |
| EMAIL_HTTP_TOKEN    | Gateway Bearer credential            |
| EMAIL_FROM          | 已在寄信服務驗證的寄件地址           |
| BETTER_AUTH_URL     | 網站正式 Origin；用於 Email 管理連結 |

Adapter POST JSON `{ id, recipient, subject, body, from }` 並附 Bearer、Content-Type 與 `Idempotency-Key: notification.id`。Gateway 將此契約轉交實際郵件供應商，必須持久化去重並只在接受工作後回應 2xx；非 2xx、10 秒逾時或缺少設定都保留 PENDING 重試。可依實際 Provider 實作另一個 EmailProvider，無須改動 Booking 交易。

此交付未提供或驗證任何正式服務憑證，也未寄送正式郵件。整合測試驗證成功／失敗／重試／並行與 preview 路徑；上線前另以已授權收件人測試真實 Gateway 接受、去重、投遞及退信。

## Worker 維運

- 排程器每分鐘執行 `npm run notifications:dispatch`，每輪最多 50 件，可同時執行多個 worker。部署排程器屬上線工作，本次未建立雲端資源或對外自動化。
- 失敗工作指數退避 30 秒至 1 小時，沒有直接丟棄。查詢 PENDING / PROCESSING、attempts、lastError 監控卡住與失敗；lease 過期會重新 claim。
- SENT 表示 Provider 接受，不代表收件匣已投遞。PREVIEWED 是本機預覽，SKIPPED 是過期版本或無效提醒。
- 改期產生新 revision 的改期通知與提醒；舊 revision 未送出的通知會跳過。取消也使舊提醒失效。開始不足 24 小時的新預約提醒會儘快處理；服務已開始則跳過提醒。
- worker 寄送期間持有 Tenant lock（HTTP 最多 10 秒），確保和取消／改期的先後順序一致。大型店家需另做吞吐量與鎖等待監控。
- 外部寄信採 at-least-once。若 Gateway 不支援冪等，不可宣稱無重複寄送風險。
- Outbox、聯絡快照、管理 Token 及稽核需依實際隱私政策規劃保留、撤銷與刪除。備份、還原與資料保留自動化未於此階段建置。

## 共享公開限流與 Proxy

預設不信任任何 IP header，各公開 endpoint 採共享 PostgreSQL bucket。每分鐘建立 120、日期／時段各 240、自助管理 60 次；回應 429 與 Retry-After: 60。先在反向代理強制覆寫 X-Real-IP，限制直連 Origin，才能設 `TRUST_PROXY_IP=true` 使用每 IP bucket。不要在可直連的開發環境開啟此設定；它不自動判斷代理可信度。

計數器到期後由同 key 的下次請求原子重設，worker 清除超過一天的舊 counter。部署前仍須按實際流量設計 WAF、告警、連線池及容量限制，不能將測試機上的 20 請求當作容量保證。
