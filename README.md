# BookFlow

**預約，從容有序。** 多租戶預約管理 SaaS，讓店家管理服務、人員與每週營業時間，顧客透過專屬網址直接預約，管理端即時看到真實資料。

Phase 2 已加入員工排班、休息與請假、服務資格、前後緩衝、預約政策與 DST 排程。預約衝突由 PostgreSQL 排他約束保護，包含 20 請求併發；公開預約使用冪等鍵避免重試重複寫入。介面為臺灣繁體中文，價格幣別為新臺幣。

## 畫面

以下為正式 Build 的瀏覽器測試畫面，內容是合成測試資料。

![預約管理端](docs/images/dashboard.png)

![公開預約流程](docs/images/public-booking.png)

## 技術

Next.js 16.4.2 App Router、React 19.3.1、TypeScript 6.0.3 strict、Prisma 7.10.1、Better Auth 1.7.12、PostgreSQL 18、Tailwind 4.3.3、shadcn/ui 基礎元件、Zod 4.6.7、Vitest 5.0.5、Playwright 1.64.1。直接依賴均固定版本，提交 package-lock.json。

選型依據：[Next.js 安裝](https://nextjs.org/docs/app/getting-started/installation)、[Prisma PostgreSQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)、[Better Auth Prisma](https://better-auth.com/docs/adapters/prisma)、[shadcn 手動安裝](https://ui.shadcn.com/docs/installation/manual)、[PostgreSQL 排他約束](https://www.postgresql.org/docs/18/rangetypes.html)、[PostgreSQL 支援版本](https://www.postgresql.org/support/versioning/)。2026-10-21 查詢時 Prisma latest 指向 8 RC，因此採穩定 7.10.1。

## 快速啟動（PowerShell）

需求：Node.js 22.12+（建議 22.23.1）、npm、Docker Compose。所有指令在 repository 根目錄執行。

```powershell
npm ci
npm run setup:env
docker compose up -d --wait
npm run db:generate
npm run db:migrate
npm run dev
```

開啟 **http://localhost:3000**。setup:env 只在 .env 不存在時建立檔案，並產生隨機 Session Secret。請使用 localhost，因為 Origin 與 Better Auth URL 預設固定為 http://localhost:3000；改網域或 Port 時必須同步調整 .env。資料庫預設綁定 127.0.0.1:5433，避免撞到既有 5432。

本機驗收操作：

1. 到 /register 註冊帳號（密碼至少 10 字元），會進入 /dashboard。
2. 建立店家，設定名稱、英文 Slug 與時區。
3. 在「服務項目」建立名稱、價格與分鐘數。
4. 在「服務人員」新增人員；調整「營業時間」與「員工排班」的服務資格、多段 WORK / BREAK、停班日期及預約政策。未設定專屬班表的人員沿用店家時間，所有員工使用店家時區。
5. 開啟 /b/你的-slug，選擇服務、人員、日期與時段，填寫姓名、Email、電話。
6. 取得預約成功畫面後，回到管理端「預約列表」確認紀錄；管理者可取消預約，取消後釋放包含緩衝的時段。

## 此 Windows 環境沒有 Docker 時

本次工作環境已有 PostgreSQL 18.4 binaries，可使用隔離的專案 cluster：

```powershell
npm run setup:env
npm run db:local
npm run db:generate
npm run db:migrate
npm run dev
```

db:local 預設使用 C:/Program Files/PostgreSQL/18/bin，可透過 PG_BIN 指定安裝位置。資料僅存於被 Git 忽略的 .local-db/data，綁定 127.0.0.1:5433。它使用 trust 認證，**只適用私人本機開發**，不能作為網路共享或正式資料庫。它不修改系統既有 PostgreSQL 服務。不要同時啟動 Compose 與此 cluster，兩者使用同一個 port。

停止本機 cluster：

```powershell
& "C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D ".local-db/data" stop -m fast
```

Docker 使用 `docker compose stop`，保留 volume。勿任意加入 -v，以免刪除資料。

## 選用 Seed

```powershell
$env:SEED_PASSWORD = '請自行選定至少10字元的本機密碼'
npm run db:seed
Remove-Item Env:SEED_PASSWORD
```

建立 owner@bookflow.local 與 /b/flow-studio 示範店家，包含兩項服務、兩位人員與週營業時間。Seed 可重跑，既有帳號密碼與資料不會被重設。示範資料不代表真實營運資料。也可完全不使用 Seed，直接註冊自己的帳號。

## 驗證

```powershell
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:migrations
npm run build
npx playwright install chromium
npm run test:e2e
npm run format:check
npm audit --omit=dev
```

`test:migrations` 需要本機測試帳號有 CREATEDB 權限，僅建立／清除其唯一命名的暫時資料庫。Integration tests 需要已遷移的 PostgreSQL；E2E 會啟動本機伺服器或重用 3000 port 的 BookFlow。測試使用獨立名稱的 fixture 並清除自己建立的資料，請使用開發或測試資料庫，勿將 DATABASE_URL 指向 Production。Better Auth 限流保持啟用，測試會遵守 X-Retry-After 重試。

正式編譯後本機運行：

```powershell
npm run build
npm start
```

API 寫入範例需攜帶 Origin: http://localhost:3000，管理 API 另外需要登入 Session Cookie。公開 API 回應只含公開資訊及本次預約結果，不可查詢其他顧客資料。

## 專案文件

- [架構與安全邊界](docs/ARCHITECTURE.md)
- [進度、驗證證據與已知限制](docs/STATUS.md)
- [後續路線](docs/ROADMAP.md)
- [開發規則](AGENTS.md)

Windows 的 Turbopack CSS worker 本次出現提前退出，dev / build 明確使用 Next.js 支援的 Webpack。所有 TypeScript 與安全檢查仍保持啟用。

尚未部署正式環境。邀請、通知、改期、完整稽核、訂閱付款屬後續階段；目前尚無公開預約反濫用保護與共享限流，公開營運前需依架構文件加固。
