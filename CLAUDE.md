# CLAUDE.md — 量化基金危機模擬遊戲(LTCM 1998)

> 給 Claude Code 的專案記憶檔。每次開工前先讀本檔,再讀 `docs/PLAN.md` 中對應的里程碑與任務。

## 專案一句話

玩家扮演一支高槓桿量化避險基金的經理人,從 1998/6/1 玩到 1998/9/30,沿著真實時間線自由決策、從新聞與傳聞中讀出危機線索,目標是在價差回歸前保持償付能力。劇情靈感來自 LTCM 事件,但遊戲內人物與機構一律化名。LLM 用來扮演談判對象、風控長顧問,以及結局後的事後檢討。

## 技術棧

- Next.js(App Router)+ TypeScript(strict)+ React
- 狀態管理:Zustand;樣式:Tailwind CSS;動畫:Framer Motion
- 圖表:TradingView `lightweight-charts`(Apache-2.0)
- 驗證:Zod(LLM 輸出、內容檔、存檔都要過 schema)
- LLM:伺服器端 Route Handler(`app/api/llm/*`)經 `src/llm/provider.ts` 介面呼叫,預設 Anthropic SDK;模型名稱由環境變數 `LLM_MODEL` 指定,不要寫死在程式碼裡
- 測試:Vitest(單元/情境)、Playwright(冒煙測試)
- 套件管理:pnpm;部署:Vercel

## 常用指令

```bash
pnpm dev            # 本機開發
pnpm test           # Vitest 全部測試
pnpm test:engine    # 只跑引擎測試(src/engine)
pnpm lint           # ESLint + Prettier 檢查
pnpm typecheck      # tsc --noEmit
pnpm content:check  # 驗證 content/ 底下所有 JSON 是否符合 schema
pnpm eval:llm       # 用真實 API 跑 LLM 評測(需要 ANTHROPIC_API_KEY)
pnpm e2e            # Playwright 冒煙測試
```

任務完成的標準:`pnpm lint && pnpm typecheck && pnpm test && pnpm content:check` 全部通過。

## 架構鐵律(不得違反)

1. **LLM 演戲、引擎算數。** 價格、股本、保證金、談判是否成交、結局判定只能由 `src/engine` 計算。LLM 只產生文字與結構化「提議」,永遠不能直接修改遊戲狀態。
2. **引擎是純函式。** `src/engine` 不可 import React、Next.js、`fetch` 或任何 I/O;同樣的 `(state, actions, seed)` 必須得到同樣的結果。隨機數一律用 `src/engine/rng.ts` 的帶種子產生器。
3. **時間鎖。** 送進 LLM 的任何上下文只能包含「遊戲當下日期以前」已釋出的資訊(`releaseDate <= state.date`)。上下文一律由 `src/llm/context.ts` 組裝,不要在別處拼 prompt。
4. **每個 LLM 輸出都要過防護層。** 流程是 Zod 解析 → 劇透過濾 → 引擎邊界檢查 → 失敗最多重試 2 次 → 改用 `content/fallback/` 的手寫台詞。
5. **沒有 API key 也要能完整玩完。** `LLM_ENABLED=false` 時全部改走備用台詞;CI 一律用 mock provider。
6. **API key 只存在伺服器端。** 前端程式碼不得出現金鑰,也不得直接呼叫 LLM 供應商。
7. **史實與虛構分開標示。** 史實內容放在 `content/history/`,必須附 `sourceUrl`;LLM 或作者虛構的內容 `isFiction: true`,UI 要顯示「虛構情節」或「模擬推演」。
8. **不照搬新聞原文。** 所有新聞文字都是自行改寫的摘要,不貼當年報導的原文。
9. **不使用真實人名。** 遊戲內角色、基金、銀行、央行一律化名,化名表在 `docs/PLAN.md` 4.5,新增角色前要先查證不與真實機構同名;真實名稱只出現在結局畫面的「史實對照」與資料來源。

## 目錄結構

```
src/
  engine/        # 純 TS 遊戲引擎:state、clock、market、margin、actions、endings、rng
  llm/           # provider 介面、context 組裝、prompts、guard(防護層)、schemas
  content/       # 讀取並驗證 content/ 的載入器
  ui/            # React 元件(終端機風格)
  store/         # Zustand store,把引擎接到 UI
app/
  page.tsx       # 遊戲主畫面
  api/llm/       # negotiate/、advisor/、debrief/ 三個 Route Handler
content/
  params.json    # 所有可調參數(價格模型、保證金、衝擊係數、難度)
  scenario.json  # 開局狀態、交易日曆、歷史價差路徑
  news/          # 新聞與傳聞(每則一筆 JSON,依日期命名)
  npcs/          # NPC 人設卡
  history/       # 史實事件與數字(附出處),用於結局對照與事後檢討
  fallback/      # LLM 失敗時的手寫備用台詞
  spoilers.json  # 劇透過濾用的關鍵字與日期規則
tests/
  engine/        # 單元測試
  scenarios/     # 黃金劇本測試(史實路線 → B;提早減碼 → S)
  llm/           # 防護層測試(mock provider)
evals/           # 真實 API 的 LLM 評測(劇透率、注入攻擊、角色一致性)
docs/
  PLAN.md        # 完整計劃書(規格、任務、驗收標準)
  PROGRESS.md    # 任務勾選清單,每完成一項就更新
```

## 程式碼慣例

- 型別先行:新功能先在 `src/engine/types.ts` 或 `src/llm/schemas.ts` 定義型別或 Zod schema,再寫實作。
- 引擎相關改動一律先寫(或先改)測試。
- 金額單位一律是「百萬美元」(`usdM`);日期一律用 ISO 字串 `YYYY-MM-DD`;比例用 0–1 的小數。
- 數值參數不要寫死在程式碼中,全部放在 `content/params.json`。
- 使用者看得到的文字放在 content 或 i18n 檔,預設語言為繁體中文。
- 一個任務一個 commit(或一個 PR);commit 訊息寫上任務編號,例如 `T2.3 margin call spiral`。

## 工作方式

- 開工時先說明你要做 `docs/PLAN.md` 的哪個任務編號,並列出會動到的檔案。
- 規格不清楚或與本檔衝突時,先停下來問,不要自己猜一個新規則。
- 完成後更新 `docs/PROGRESS.md`,並在回覆中附上測試結果。
- 不要擅自加入計劃書沒列的功能;想到的點子寫進 `docs/PLAN.md` 的「待確認事項」。
