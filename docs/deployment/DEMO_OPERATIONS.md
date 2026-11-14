# BookFlow Demo 維運

公開訪客可建立合成預約，使用當次回傳的 `/manage#token` 檢視、改期、取消自己的預約。Token 不放 Query、不輸出日誌，也不出現在公開通知預覽。店家 Owner `owner@bookflow.example.test` 的密碼只交付操作者，不公開管理權限。

## 驗收

- `/health` 真正查詢 PostgreSQL，DB 失聯回 503。HTTPS 載入 UI、預約日期／時段由後端計算。
- 固定合成資料建單→使用管理 Token 讀回→改期→取消，狀態與 PostgreSQL 一致；舊 Token 不能讀其他預約。對不同 booking 使用錯誤 Token，應拒絕。
- 同員工同時段競爭只有一筆成功；其他租戶、非平台管理者、未授權訪客不能取得管理資料。公開 signup 403，偽造真實聯絡欄位回 400。
- 成功／失敗登入、Secure／HttpOnly／SameSite Cookie、錯誤 Origin、共享限流與 body 上限；不得關閉防護取得綠燈。
- 桌面、平板、390／320 px、鍵盤與私人連結流程；重啟後持久化、休眠喚醒、DB 失聯／恢復。無 Email 被寄送，不以流量觸發假排程。

## 保留、重置與備份

只接受固定合成聯絡值，不儲存訪客自行填寫的個資。每月由操作者檢查展示 DB／Outbox／RateLimit 與配額；每店 1000 筆上限在 Tenant lock 內檢查，冪等重試既有預約不佔新增額度。

資料集最長展示一個月後由操作者更新：另建專用 project／DB、重新 Migration／Provision／驗收，切換環境變數並輪替 Better Auth Secret，使舊 Session／管理連結失效；舊 DB 至少保留 7 天且先備份。不在線上清空資料、不混用開發／測試 DB、不在 public-demo 執行整套 fixture 測試。

沿用 `docs/DEPLOYMENT.md` 的 direct PostgreSQL 18 pg_dump／新 DB 還原流程。備份限制權限、加密保存、驗證 SHA-256；還原後不要啟動 Email worker。免費短歷史窗口不能替代備份。

## 更新、回滾與停止

CI 通過後保留前版 SHA／Vercel deployment URL、備份 ID；一次性執行向下相容 Migration，再發布 Demo。回滾到前一個已驗收 deployment，保留新增 schema；資料問題還原到新 DB，不覆寫現況。回滾後驗證 Token、Cookie、booking constraints 與健康檢查。

停止可暫停該 Demo project，DB 保留。刪除 project、branch 或備份需要另外確認，不因停止展示便自動刪除。監控 5xx／429、DB 連線數、Neon 月配額與 Vercel usage；帳戶警示不是費用硬封頂，不開啟付費用量。
