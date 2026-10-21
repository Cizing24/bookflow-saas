# BookFlow 技術面試手冊

## 解決的問題與架構選擇

店家以試算表或訊息人工安排服務，會遇到人員資格、休息／休假、前後緩衝、重複送單與同時搶訂。BookFlow 將這些規則收斂至可測的 Application Service 與 Availability Engine，再由 PostgreSQL 約束兜底。小團隊採 Modular Monolith，讓 Session、Membership、Booking、Event、Outbox 共用交易，避免為了分散式架構增加補償交易。

React UI → Route Handler（Origin／限流／JSON／Zod）→ Application Service（Session／RBAC／流程）→ 純函式 domain 與租戶 repository → PostgreSQL。沒有將授權寄託在 client 隱藏按鈕，也沒有任意 Server Action 繞過這條路徑。Next.js 頁面從伺服器檢查 Session，HTTP 每次仍獨立檢查。

## 多租戶與兩種管理權限

共享 schema，每筆業務資料有 tenantId。Membership 的 `[tenantId,userId]` 授權目前使用者；角色每次重讀。Owner 管成員與店家政策，Admin 管營運，Staff 只操作已綁定 staffId 的自身資料。沒有綁定則使用無匹配 scope，不能以 query 的 staffId 自行擴權。

Service／Staff／Customer 的 `[tenantId,id]` UNIQUE 與 Booking 複合 FK 防止跨租戶關聯，即使有人繞過 UI 直接執行 INSERT，也無法將 A 店預約連到 B 店服務。這是資料關聯隔離，**不是 PostgreSQL RLS**；直接持有應用 DB 帳號或原始碼執行權限屬受信任邊界。

PlatformAdmin 是獨立資料表，不是 Membership.role 的第四種值。它只授權平台統計、店家狀態及稽核，不授權顧客、預約詳情或通知。Owner 無法透過成員 API 建立平台權限；只有受信任離線 CLI 可以授予／撤銷，並留下 PlatformEvent。平台 API 只投影店家基本狀態與預約數，不回傳聯絡個資、Session 或 Token。

停用與建立預約／設定寫入共用 Tenant row lock。停用先取得鎖時，後續建單在鎖內讀到 active=false 而失敗；建單先取得鎖時則可以在停用前完成。這個線性化點可解釋併發結果，不以畫面何時送出判斷。已停用店家的管理 API 拒絕；既有顧客 capability 仍可讀取／取消，改期被排程 context 拒絕。平台啟停使用 expectedActive 防止舊頁面覆寫最新狀態。

## 時區與可用時段

輸入排班為店家 IANA timezone 的星期／分鐘；Booking 儲存 timestamptz UTC。Availability Engine 交集店家營業與員工 WORK，扣除 BREAK、指定日期 absence 與 CONFIRMED busy range，再套服務時長、前後緩衝、提前分鐘、最遠日期與間隔。DST 跳時不生成不存在的時刻，重複小時保留不同 offset 的 UTC instant。前端顯示 offset，不自行生成假時段。

店家和員工共用時區；跨午夜工作以兩個日段表達。跨日連續服務未提供。服務 endAt、價格、名稱與緩衝皆由伺服器推導並快照；顧客不能修改總金額或 endAt。

## 為何查詢可用後仍要資料庫約束

兩個請求都可能先看見空時段。Application Service 在 transaction 取得 Tenant row lock，再重新讀取排程與有效占用，計算後才建立。READ COMMITTED 的鎖後讀取可見前一筆提交。鎖讓同店設定修改和建單具備可解釋順序；不同店家不共用鎖。

DB trigger 依服務快照計算 occupiedStartAt／occupiedEndAt，GiST partial exclusion 對 `status='CONFIRMED'` 的同店同員工 `tstzrange(...,'[)')` 禁止交集。半開區間允許相鄰預約，緩衝仍是占用。取消移出 partial index，自動釋放範圍。直接 SQL 的競爭可能得到 23P01 或 deadlock rollback，仍不能留下兩筆重疊有效預約；應用將已辨識衝突轉中文 409。

20 請求競爭的驗收是 1 成功／19 衝突，讀回只有 1 筆有效占用。另以 20 條獨立 PostgreSQL connection 驗證約束，避免只測到單一應用鎖。這是正確性測試，不能推導生產吞吐量或 SLA。同店鎖與寄信鎖最長等待成本須以後續負載測試評估；若改成 resource 細鎖，要一併處理設定更新、資格、跨資源改期與冪等競爭。

## 冪等、樂觀版本與狀態機

公開建單有 tenant-scoped idempotencyKey UNIQUE，正規化請求 SHA-256 比對內容。同鍵同內容回原編號與目前狀態，同鍵不同內容 409；取消不刪除冪等 identity。UI 在不確定網路結果時沿用同一鍵。建立後丟失回應的瀏覽器測試，會讓真實伺服器提交後主動 abort HTTP response，再重送證明沒有重複。

改期在原交易排除自己但保留其他 busy range，重驗 qualification、cutoff、服務與員工同租戶及 exclusion。revision 防止舊畫面覆寫；Booking ID 保持不變。CONFIRMED 可轉 CANCELLED、COMPLETED、NO_SHOW；終態不能回復或改期。完成須結束後、未到場須開始後。DB trigger 再防終態回復／修改資源時間。重複取消不新增事件。

## 顧客 capability

匿名 Email 只是聯絡方式，不是身份驗證。新的預約產生 256-bit random token，Booking 只存 SHA-256；輸入 Booking ID 不能擴大授權。`/manage#token` fragment 不上傳 access URL，前端移除 fragment 並保存在該分頁 sessionStorage；以同源 POST body 使用，回應 no-store／no-referrer。知道連結即有權限，不能分享。Outbox 為寄信包含原文連結，所以也是敏感資料，只供 Owner 查看。

原建單冪等重試不再次提供 token；首次回應遺失需從通知取得或聯絡店家。舊預約無 token。連結撤銷／輪替、帳號 Email 驗證、復原、隱私刪除流程仍是已知限制，不能宣稱達成完整商用帳號治理。

## Outbox 與寄送語意

Booking、BookingEvent、Notification 同 transaction，避免預約成功但通知工作消失。worker 用 SKIP LOCKED claim、leaseToken 和兩分鐘租約，失敗以固定碼重試，復原沿用 Notification ID。過期 revision 的通知與已取消／已過期提醒標記 SKIPPED。

DB 與外部 HTTP 不能形成單一交易，所以 at-least-once。Provider 已接受、DB 記 SENT 前當機可能重送；Gateway 必須持久化去重。SENT 只表示 Provider 接受，實際投遞／退信需 Provider 事件。Preview 標 PREVIEWED，sentAt=null，production 禁止 Preview。Provider timeout 10 秒；目前送信期間持有同店鎖，簡化一致性但會影響延遲。

## Web 邊界及取捨

Better Auth 驗證 Session，HTTPS Origin 使用 Secure cookie、HttpOnly、SameSite=Lax。管理與公開寫入檢查精確 Origin，缺 Origin 也拒絕；Better Auth 自有 CSRF／trusted origin 保留。共享 PostgreSQL 原子計數限制 auth/public endpoint，不信任任意 forwarding header。只有可信代理可啟用每 IP 模式；全站 bucket 限流可能誤傷大量正常流量，需 WAF／容量調整。

業務 JSON 使用 64 KiB stream 上限及 Zod 型別／範圍驗證；SQL parameter binding，React 轉義文字，沒有 dangerouslySetInnerHTML。禁止內嵌 object/frame、限制 form-action／base-uri；沒有宣稱目前是完整 nonce CSP。所有 API 錯誤 no-store、對外訊息不輸出 SQL／stack／個資。Auth request body 的上限由反向代理補上；不可只靠 Content-Length。

## 測試策略與可重現交付

Unit 測 domain/DST／狀態機／provider contract／calendar 分欄與 HTTP 邊界；Integration 用真實 PostgreSQL 驗證 FK、排他、角色、租戶、版本、outbox、平台停用；只有營運服務 Session identity 注入，沒有 mock DB。Playwright 用真實 Better Auth Session 跑 Chromium 桌面、平板、手機與 Production Build。Fixture 唯一命名，只刪自身資料，DB guard 拒絕遠端與 prod 命名資料庫。

CI 的新 PostgreSQL 自動 migrate/seed、重建隨機空 DB、npm ci 及 Docker health smoke，驗證初次安裝與容器契約。部署與備份／還原程序見 [DEPLOYMENT](DEPLOYMENT.md)，實際執行結果見 [STATUS](STATUS.md)。開發相依 audit 與正式相依 audit 分開報告；文件與靜態編譯無法取代 E2E 或正式授權驗證。

## 面試可以深入追問

1. 為什麼使用 Tenant lock？如果移除它，只保留 exclusion，設定更新與冪等有何競爭？
2. 如何將通知移到不持有 DB lock 的 worker？如何定義取消已寄出的提醒？
3. 如何加入付款訂金？先定義 pending reservation、付款逾時釋放、Webhook 簽章與事件冪等，不能直接把金流狀態當 Booking 狀態。
4. 大型店家如何改善？先量測鎖等待／SQL／索引，再改 SQL aggregate、資料分頁、連線池與資源鎖；不能直接拆服務而失去交易。
5. 如何支援資料刪除？先定義法規／業務保留與 capability 撤銷，讓顧客匿名化、稽核、備份、冪等 identity 不互相矛盾。
