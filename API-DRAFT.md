# 給後端隊友的介面草案（DRAFT，待前端確認後定稿）

> 這份由規格推導出來，是**提案**，不是已與後端討論過的結論。定稿前請使用者檢查並與後端兩位對齊。
> 前端目前用 localStorage + data.js 模擬，所有存取應集中在 `api.js`，之後只換這一層。

## 責任劃分
| 事項 | 負責 |
|---|---|
| 壽命計算（以寄出時間為準）、過期刪除 | 後端 |
| 變老階段顯示（泛黃、污漬、缺角） | 前端（依剩餘壽命比例，門檻 30%/55%/80%） |
| 送信分配（隨機、不重複送同一人） | 後端 |
| 收信區 12 封上限、鳥的行為、休息區 | 前端 |
| 字數與檔案大小上限 | 前端檢查（體驗）＋後端檢查（防線） |
| 內容審核／檢舉 | 後端（前端預留檢舉按鈕） |

## 資料模型

**Letter（信）**
- `id`
- `type`：`note`（純文字／信封／麻雀）、`postcard`（文字＋圖片／明信片／鴿子）、`parcel`（大型檔案／包裹／貓頭鷹）
- `title`（≤20 字）、`body`（≤500 字）、`author`（署名 ≤12 字）
- `imageUrl`（postcard，≤10MB）、`file`（parcel：`name`、`size`、`url`，≤100MB）
- `sentAt`（寄出時間，壽命以此為準）
- `expiresAt` 或 `lifeRemainingSec`（剩餘壽命）
- `likeCount`、`replyCount`

**Feedback（回應）**
- `id`、`letterId`、`kind`（`like`／`reply`）、`author`（署名）、`text`（回信 ≤200 字）、`createdAt`
- 每封信前端模擬上限 12 則（正式規則待定）

**User**
- `id`（鳥號，BIRD-XXXXXX，唯一、可公開，別人用它寄私人傳書）、暱稱／署名、頭像（`sparrow`／`pigeon`／`owl`）、`joinedAt`
- 已讀（seen）清單、收藏（saved）清單（上限 100）、彩蛋（eggs）收集

**Thread（私人傳書對話）**
- `id`（可用對方的鳥號）、`peer`（`code`、`name`、`avatar`）、`messages`（`id`、`from`：`me`／`peer`、`text`≤300 字、`at`）、`unread`、`blocked`

**Report（檢舉）**
- `type`（`letter`／`message`／`user`）、`id`、`reason`（`spam`／`abuse`／`adult`／`privacy`／`other`）、`note`≤100 字、`at`

## API 清單（草案）
1. **取得下一封要送給我的信**：後端負責隨機且不重複（排除我已讀／掃過／自己的信的規則待定；目前前端行為是自己的信也會進池子送回自己）
2. **寄信**：含文字；圖片 10MB、檔案 100MB 的上傳方式需討論（直傳／預簽名 URL）
3. **按讚**、**回信**：成功後信獲得續命（目前測試值：讚 +60 秒、回信 +120 秒；正式值待定）
4. **我寄出的信**：每封含剩餘壽命、讚數、回信數、是否有新回應；可取得回應內容
5. **收藏／取消收藏**：上限 100，超過回錯誤
6. **通知**：我寄出的信的未讀回應數；標記為已讀（看過「我寄出的信」後歸零）
7. **標記已讀／掃除**：記錄讀過或掃過的信，之後不再送給同一人
8. **檢舉**：前端已實作畫面，目前只存在本機
9. **個人檔案**：讀取（含統計）、修改暱稱與頭像
10. **帳號**：登入、註冊、登出（前端只留介面，尚未有畫面）
11. **私人傳書**：對話清單、單一對話、寄出（以鳥號找人）、標已讀、封鎖／解除封鎖、新訊息推播

## 前端目前的介面（api.js / window.BirdAPI）
後端 API 對應到這些函式即可，前端其餘程式不用改。全部回傳 Promise，失敗 reject `{ code, message }`。

| 函式 | 對應 API | 回傳 |
|---|---|---|
| `nextLetter(excludeIds)` | 取得下一封信 | Letter（含 `expiresAt`）或 `null` |
| `markSeen(id)` | 標記已讀／掃除 | — |
| `sendLetter(draft)` | 寄信 | Letter（含 `id`、`expiresAt`） |
| `respond(id, kind, author, text)` | 按讚／回信 | `{ expiresAt }`（續命後） |
| `getActs(id)` | 取得一封信的回應 | `{ likes, replies, liked }` |
| `getSaved()`／`getSavedCount()`／`save(letter)`／`unsave(id)` | 收藏 | 清單／數量 |
| `getSent()` | 我寄出的信 | Letter[]，另含 `likeCount`、`replyCount`、`unread`、`saved` |
| `getUnreadCount()`／`markSentRead()` | 通知 | 數字／— |
| `onFeedback(cb)` | 新回應推播（輪詢或 WebSocket） | `cb({ letter, kind, author, text, expiresAt })` |
| `getEggs()`／`addEgg(kind)` | 彩蛋收集 | `{ 種類: 數量 }` |
| `getUnreadDetail()` | 通知（分開算） | `{ sent: 新回應, priv: 新傳書 }`；`getUnreadCount()` 回傳兩者相加 |
| `getProfile()` | 個人檔案 | `{ id, name, avatar, joinedAt, guest, stats, eggs }` |
| `updateProfile({ name?, avatar? })` | 修改個人檔案 | — |
| `auth.login()`／`register()`／`logout()` | 帳號 | 目前一律 reject `NOT_IMPLEMENTED` |
| `getThreads()` | 私人傳書清單（新的在前） | `{ id, peer, last, unread, blocked }[]` |
| `getThread(id)` | 單一對話 | Thread |
| `sendPrivate(鳥號, text)` | 寄私人傳書（沒有對話就建立） | `{ threadId, message }` |
| `markThreadRead(id)`／`blockPeer(id, flag)` | 已讀／封鎖 | — |
| `onPrivate(cb)` | 新傳書推播（輪詢或 WebSocket） | `cb({ threadId, peer, message })` |
| `REPORT_REASONS`／`report({ type, id, reason, note })` | 檢舉 | — |

目前用到的錯誤 code：`NETWORK`、`EMPTY`、`TOO_LONG`、`EXPIRED`、`ALREADY_LIKED`、`ALREADY_SAVED`、`STORE_FULL`、`INVALID`、`NOT_FOUND`、`SELF`（寄給自己）、`USER_NOT_FOUND`（找不到鳥號）、`BLOCKED`、`ALREADY_REPORTED`、`NOT_IMPLEMENTED`。
時間一律是秒（Unix time）。歡迎信（id `welcome`）由前端自己產生，不會送到後端。

## 錯誤情況（前端需要顯示什麼）
- 寄信失敗（網路／超過大小／字數）、載入失敗可重試、收藏滿 100、信已過期（回應時信已被風吹走）、檢舉成功提示。
- 建議後端回一致的 `{ code, message }` 與適當 HTTP 狀態碼，前端依 code 顯示對應提示。

## 待與後端討論
- 壽命正式數值、續命量與是否有上限
- 回應是否可被其他人看到（目前只有寄信者看得到）
- 帳號／身分：目前署名只存本機，換瀏覽器就是另一個人
- 檔案儲存與審核流程
- 私人傳書：鳥號怎麼發放與避免被亂猜、是否需要「好友／同意」才能收信、封鎖的範圍、訊息保存多久、是否允許附件、檢舉私人傳書時後端能否看到內容（隱私與審核的取捨）
- 帳號：登入方式（信箱／第三方）、訪客資料登入後要不要合併
