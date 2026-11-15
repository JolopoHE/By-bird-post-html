/* ===== 鳥鳥傳信：資料存取層（BirdAPI） =====
 * main.js 所有「跟資料有關」的讀寫都只透過這裡。
 * 目前背後是 localStorage + data.js 假資料，扮演一個「假的後端」；
 * 之後接上後端時，只要把下面每個函式的內容換成 fetch，main.js 不用改。
 *
 * 約定：
 * - 會跟伺服器溝通的函式一律回傳 Promise（現在是立即完成，換成 fetch 後介面不變）。
 * - 失敗時 reject 一個 { code, message }，main.js 直接把 message 顯示給使用者。
 * - 回傳的資料都是複本，改了不會影響這層裡存的東西（模擬「資料在伺服器上」）。
 * - 時間一律用「秒」（Date.now() / 1000）。每封信帶 expiresAt＝到期時間，壽命由這層計算。
 * - prefs 是純前端的偏好設定（同步、只存本機），接後端後也留在瀏覽器。
 */
window.BirdAPI = (function () {
  "use strict";

  // ---------- 假後端的規則（正式值待與後端討論；前端顯示也讀這裡） ----------
  var RULES = {
    life: 180,           // 信寄出後能活多久（秒）。測試用短時間，正式版改成幾小時或幾天
    likeBonus: 60,       // 按讚續命（秒）
    replyBonus: 120,     // 回信續命（秒）
    storeMax: 100,       // 存信箱上限
    titleMax: 20, contentMax: 500, authorMax: 12, replyMax: 200,  // 字數上限（後端防線）
    privateMax: 300,     // 私人傳書每則上限
    reportNoteMax: 100   // 檢舉補充說明上限
  };

  // 檢舉原因（前後端共用的代碼，後端定稿後以後端為準）
  var REPORT_REASONS = [
    { k: "spam",    label: "垃圾訊息／廣告" },
    { k: "abuse",   label: "辱罵或騷擾" },
    { k: "adult",   label: "不當內容" },
    { k: "privacy", label: "洩漏個人資料" },
    { k: "other",   label: "其他" }
  ];

  // 模擬私人傳書的對象：真實的鳥號由後端發放，這裡放幾個示範帳號讓前端可以測試
  var SIM_PRIVATE = true;          // 示範帳號會自動回信（接後端後改成 false）
  var SIM_PM_REPLY = [4, 10];      // 幾秒後回信
  var DEMO_USERS = [
    { code: "BIRD-MIMI01", name: "小米", avatar: "sparrow" },
    { code: "BIRD-AZHE02", name: "阿哲", avatar: "pigeon" },
    { code: "BIRD-YUKI03", name: "Yuki", avatar: "owl" },
    { code: "BIRD-MOMO04", name: "Momo", avatar: "sparrow" }
  ];
  var PM_REPLIES = ["收到你的信了，謝謝你特地寫給我。", "哈哈，我也是這樣想的！", "最近過得好嗎？",
                    "這句話我會好好收著。", "鳥飛得好快，一下就到了。", "改天再聊，晚安。"];

  // ---------- 模擬網路狀況（測試載入中／失敗重試用，平常保持 0） ----------
  var MOCK_DELAY = [0, 0];     // 每次請求延遲幾毫秒（隨機區間）
  var MOCK_FAIL = 0;           // 每次請求失敗的機率（0～1）

  // ---------- 模擬其他使用者對「我寄出的信」按讚、回信（接後端後改成 false） ----------
  var SIM_FEEDBACK = true;
  var SIM_GAP = [14, 26];      // 每隔幾秒檢查一次
  var SIM_CHANCE = 0.45;       // 每次檢查時，每封還活著的信收到回應的機率
  var SIM_MAX = 12;            // 每封信最多模擬幾則回應
  var FAKE_NAMES = ["阿哲", "小米", "Yuki", "老王", "Momo", "阿芳", "Ken", "小安", "Lily", "阿凱"];
  var FAKE_REPLIES = ["寫得真好，謝謝你。", "我也有一樣的感覺！", "看完心情變好了。", "加油，你不是一個人。",
                      "哈哈哈這個我喜歡。", "希望能再收到你的信。", "路過留個腳印。", "被你的信暖到了。"];

  // ---------- localStorage（只有這個檔案會碰） ----------
  function load(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function persist(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 存不了就只留在記憶體 */ }
  }

  // 「伺服器」上的資料
  var saved = load("birdmail_saved", []);   // 存信箱裡的信（完整內容）
  var seen = load("birdmail_seen", []);     // 讀過或掃掉的信 id，不再重複送來
  var mine = load("birdmail_mine", []);     // 自己寄出的信
  var life = load("birdmail_life", {});     // 每封信的到期時間（秒）
  var acts = load("birdmail_acts", {});     // 每封信的讚與回信：{ likes, replies, liked, unread }
  var eggs = load("birdmail_eggs", {});     // 收集到的蛋：{ 種類: 數量 }

  function nowS() { return Date.now() / 1000; }
  function remain(id) { return (life[id] || 0) - nowS(); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function err(code, message) { return { code: code, message: message }; }

  // 舊版寄出的信沒有壽命紀錄，補上
  mine.forEach(function (d) { if (life[d.id] === undefined) life[d.id] = nowS() + RULES.life; });

  // 圖片太大時本機空間存不下，就只存文字（圖片留到這次關閉頁面為止）
  function persistMine() {
    try { localStorage.setItem("birdmail_mine", JSON.stringify(mine)); }
    catch (e) {
      persist("birdmail_mine", mine.map(function (d) {
        var c = {}; for (var k in d) if (k !== "image") c[k] = d[k]; return c;
      }));
    }
  }

  function actsOf(id) { return acts[id] || (acts[id] = { likes: [], replies: [], liked: false, unread: 0 }); }
  function withLife(d) { var c = copy(d); c.expiresAt = life[d.id] || 0; return c; }

  // 包成非同步請求：模擬延遲與失敗，回傳複本
  function request(fn) {
    return new Promise(function (resolve, reject) {
      var wait = rand(MOCK_DELAY[0], MOCK_DELAY[1]);
      function run() {
        if (Math.random() < MOCK_FAIL) { reject(err("NETWORK", "網路好像不太穩，再試一次")); return; }
        try { resolve(copy(fn())); } catch (e) { reject(e && e.code ? e : err("UNKNOWN", "出了點問題，再試一次")); }
      }
      if (wait > 0) setTimeout(run, wait); else run();
    });
  }

  // ---------- 收信 ----------
  // 取下一封要送給我的信。exclude：前端畫面上已有、或正被鳥叼著的信 id。沒信可送回傳 null。
  // （正式版由後端負責隨機與不重複；假資料只有 20 封，全部看過後會重新開放）
  function nextLetter(exclude) {
    return request(function () {
      var busy = {};
      (exclude || []).forEach(function (id) { busy[id] = 1; });
      saved.forEach(function (d) { busy[d.id] = 1; });
      // 前端測試階段：自己寄出的信也會放進信件池，壽命到了就不再出現
      var pool = window.MOCK_LETTERS.concat(mine).filter(function (d) {
        return !busy[d.id] && !(d.mine && remain(d.id) <= 0);
      });
      if (!pool.length) return null;
      var fresh = pool.filter(function (d) { return seen.indexOf(d.id) < 0; });
      if (!fresh.length) { seen = []; persist("birdmail_seen", seen); fresh = pool; }
      var pick = pickOne(fresh);
      // 假資料沒有寄出時間：每次重新送來時當成一封「已經寄出一陣子」的新信
      if (!pick.mine && remain(pick.id) <= 0) {
        life[pick.id] = nowS() + RULES.life * rand(0.45, 1);
        persist("birdmail_life", life);
      }
      return withLife(pick);
    });
  }

  // 讀過或掃掉的信，之後不再送給我
  function markSeen(id) {
    return request(function () {
      if (seen.indexOf(id) < 0) { seen.push(id); persist("birdmail_seen", seen); }
      return true;
    });
  }

  // ---------- 寄信 ----------
  // draft：{ bird, author, title, content, image?（dataURL）, file?（{ name, size }） }
  function sendLetter(draft) {
    return request(function () {
      var title = String(draft.title || "").trim(), content = String(draft.content || "").trim();
      if (!title || !content) throw err("EMPTY", "標題和內容都要寫");
      if (title.length > RULES.titleMax || content.length > RULES.contentMax) throw err("TOO_LONG", "字數超過上限了");
      var data = {
        id: "me-" + Date.now(), bird: draft.bird,
        author: String(draft.author || "").trim().slice(0, RULES.authorMax) || "匿名",
        title: title, content: content, mine: true
      };
      if (draft.image) data.image = draft.image;
      if (draft.file) data.file = draft.file;
      mine.push(data);
      persistMine();
      life[data.id] = nowS() + RULES.life;
      persist("birdmail_life", life);
      return withLife(data);
    });
  }

  // ---------- 按讚、回信 ----------
  // kind："like" 或 "reply"。成功回傳 { expiresAt }（續命後的到期時間）
  function respond(id, kind, author, text) {
    return request(function () {
      if (life[id] !== undefined && remain(id) <= 0) throw err("EXPIRED", "這封信已經被風吹走了");
      var name = String(author || "").trim().slice(0, RULES.authorMax) || "匿名";
      var a = actsOf(id);
      if (kind === "like") {
        if (a.liked) throw err("ALREADY_LIKED", "你已經按過讚了");
        a.likes.push(name); a.liked = true;
      } else {
        text = String(text || "").trim();
        if (!text) throw err("EMPTY", "回信還沒有內容");
        a.replies.push({ author: name, text: text.slice(0, RULES.replyMax) });
      }
      persist("birdmail_acts", acts);
      life[id] = Math.max(life[id] || 0, nowS()) + (kind === "like" ? RULES.likeBonus : RULES.replyBonus);
      persist("birdmail_life", life);
      return { expiresAt: life[id] };
    });
  }

  // 一封信收到的讚與回信：{ likes: [名字], replies: [{ author, text }], liked: 我是否按過讚 }
  function getActs(id) {
    return request(function () {
      var a = acts[id] || {};
      return { likes: a.likes || [], replies: a.replies || [], liked: !!a.liked };
    });
  }

  // ---------- 存信箱 ----------
  function getSaved() { return request(function () { return saved; }); }
  function getSavedCount() { return request(function () { return saved.length; }); }

  function save(letter) {
    return request(function () {
      if (saved.some(function (d) { return d.id === letter.id; })) throw err("ALREADY_SAVED", "這封信已經在存信箱裡了");
      if (saved.length >= RULES.storeMax) throw err("STORE_FULL", "存信箱滿了，先丟掉幾封舊信吧");
      var c = copy(letter); delete c.expiresAt;      // 收藏後永久保留，不需要壽命
      saved.push(c);
      persist("birdmail_saved", saved);
      return saved.length;
    });
  }

  function unsave(id) {
    return request(function () {
      saved = saved.filter(function (d) { return d.id !== id; });
      persist("birdmail_saved", saved);
      return saved.length;
    });
  }

  // ---------- 我寄出的信與回應通知 ----------
  // 每封附上 expiresAt、likeCount、replyCount、unread（新回應數）、saved（我是否收藏了它）
  function getSent() {
    return request(function () {
      return mine.map(function (d) {
        var c = withLife(d), a = acts[d.id] || {};
        c.likeCount = (a.likes || []).length;
        c.replyCount = (a.replies || []).length;
        c.unread = a.unread || 0;
        c.saved = saved.some(function (s) { return s.id === d.id; });
        return c;
      });
    });
  }

  function sentUnread() {
    return mine.reduce(function (n, d) { return n + ((acts[d.id] && acts[d.id].unread) || 0); }, 0);
  }
  function privateUnread() {
    return Object.keys(threads).reduce(function (n, k) { return n + (threads[k].unread || 0); }, 0);
  }
  // 郵箱旗子上的總數＝寄出的信的新回應＋私人傳書的新訊息
  function getUnreadCount() {
    return request(function () { return sentUnread() + privateUnread(); });
  }
  // 分開的數字：{ sent: 新回應, priv: 新傳書 }
  function getUnreadDetail() {
    return request(function () { return { sent: sentUnread(), priv: privateUnread() }; });
  }

  // 看過「我寄出的信」後，新回應全部標成已讀
  function markSentRead() {
    return request(function () {
      mine.forEach(function (d) { if (acts[d.id]) acts[d.id].unread = 0; });
      persist("birdmail_acts", acts);
      return true;
    });
  }

  // 訂閱「我寄出的信收到新回應」。
  // callback({ letter, kind, author, text, expiresAt })
  // 現在由下方的模擬產生；接後端後改成輪詢或 WebSocket，callback 格式不變。
  var listeners = [];
  function onFeedback(cb) { listeners.push(cb); }

  function receiveFeedback(data, kind, name, text) {
    var a = actsOf(data.id);
    if (kind === "like") a.likes.push(name); else a.replies.push({ author: name, text: text });
    a.unread = (a.unread || 0) + 1;
    persist("birdmail_acts", acts);
    life[data.id] = Math.max(life[data.id] || 0, nowS()) + (kind === "like" ? RULES.likeBonus : RULES.replyBonus);
    persist("birdmail_life", life);
    var ev = { letter: withLife(data), kind: kind, author: name, text: text || "", expiresAt: life[data.id] };
    listeners.forEach(function (cb) { try { cb(copy(ev)); } catch (e) { console.error(e); } });
  }

  function simulateFeedback() {
    mine.forEach(function (data) {
      if (remain(data.id) <= 0 || Math.random() > SIM_CHANCE) return;
      var a = acts[data.id];
      if (a && a.likes.length + a.replies.length >= SIM_MAX) return;
      var name = pickOne(FAKE_NAMES);
      if (Math.random() < 0.7) receiveFeedback(data, "like", name);
      else receiveFeedback(data, "reply", name, pickOne(FAKE_REPLIES));
    });
  }
  function simLoop() {
    setTimeout(function () { simulateFeedback(); simLoop(); }, rand(SIM_GAP[0], SIM_GAP[1]) * 1000);
  }
  if (SIM_FEEDBACK) simLoop();

  // ---------- 斑鳩蛋收藏 ----------
  function getEggs() { return request(function () { return eggs; }); }
  function addEgg(kind) {
    return request(function () {
      eggs[kind] = (eggs[kind] || 0) + 1;
      persist("birdmail_eggs", eggs);
      return eggs;
    });
  }

  // ---------- 個人檔案（目前是訪客預設，之後換成登入帳號） ----------
  var CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var uid = load("birdmail_uid", null);       // 鳥號：別人用它寄私人傳書給我（正式版由後端發放）
  if (!uid) {
    uid = "BIRD-";
    for (var ci = 0; ci < 6; ci++) uid += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    persist("birdmail_uid", uid);
  }
  var joined = load("birdmail_joined", null); // 第一次來的時間
  if (!joined) { joined = nowS(); persist("birdmail_joined", joined); }
  var BIRD_TYPES = ["sparrow", "pigeon", "owl"];

  function getProfile() {
    return request(function () {
      var likes = 0, replies = 0, eggTotal = 0, eggKinds = 0;
      mine.forEach(function (d) {
        var a = acts[d.id];
        if (a) { likes += a.likes.length; replies += a.replies.length; }
      });
      Object.keys(eggs).forEach(function (k) { if (eggs[k] > 0) { eggTotal += eggs[k]; eggKinds++; } });
      return {
        id: uid, name: prefs.get("name", ""), avatar: load("birdmail_avatar", "sparrow"),
        joinedAt: joined, guest: true,        // guest：還沒有登入帳號
        stats: { sent: mine.length, likes: likes, replies: replies, saved: saved.length, seen: seen.length, eggs: eggTotal, eggKinds: eggKinds },
        eggs: eggs
      };
    });
  }

  // p：{ name?, avatar? }。暱稱同時是寫信、回信的預設署名
  function updateProfile(p) {
    return request(function () {
      if (p.name != null) {
        var n = String(p.name).trim();
        if (n.length > RULES.authorMax) throw err("TOO_LONG", "暱稱最多 " + RULES.authorMax + " 個字");
        prefs.set("name", n);
      }
      if (p.avatar != null) {
        if (BIRD_TYPES.indexOf(p.avatar) < 0) throw err("INVALID", "沒有這種鳥");
        persist("birdmail_avatar", p.avatar);
      }
      return true;
    });
  }

  // 帳號：還沒有後端，先留好介面。接上後 login／register 成功回傳 profile，logout 回傳 true
  function notReady() { return Promise.reject(err("NOT_IMPLEMENTED", "帳號系統還在準備中，等後端接上就能使用")); }
  var auth = { login: notReady, register: notReady, logout: notReady };

  // ---------- 私人傳書（一對一，只有雙方看得到；沒有壽命，不會被風吹走） ----------
  // thread：{ id（對方鳥號）, peer: { code, name, avatar }, messages: [{ id, from: "me"|"peer", text, at }], unread, blocked }
  var threads = load("birdmail_threads", {});
  var pmListeners = [];
  var pmSeq = 0;

  function findUser(code) { return DEMO_USERS.filter(function (u) { return u.code === code; })[0]; }
  function lastOf(t) { return t.messages[t.messages.length - 1] || null; }
  function onPrivate(cb) { pmListeners.push(cb); }   // cb({ threadId, peer, message })：收到新的傳書

  // 對話清單（新的在前）。每筆：{ id, peer, last, unread, blocked }
  function getThreads() {
    return request(function () {
      return Object.keys(threads).map(function (k) {
        var t = threads[k];
        return { id: t.id, peer: t.peer, last: lastOf(t), unread: t.unread || 0, blocked: !!t.blocked };
      }).sort(function (a, b) { return (b.last ? b.last.at : 0) - (a.last ? a.last.at : 0); });
    });
  }

  function getThread(id) {
    return request(function () {
      var t = threads[id];
      if (!t) throw err("NOT_FOUND", "找不到這個對話");
      return t;
    });
  }

  function markThreadRead(id) {
    return request(function () {
      if (threads[id]) { threads[id].unread = 0; persist("birdmail_threads", threads); }
      return true;
    });
  }

  // 寄一則私人傳書給對方的鳥號；對方沒有對話就自動建立。成功回傳 { threadId, message }
  function sendPrivate(to, text) {
    return request(function () {
      var code = String(to || "").trim().toUpperCase();
      text = String(text || "").trim();
      if (!code) throw err("EMPTY", "請輸入對方的鳥號");
      if (code === uid) throw err("SELF", "不能傳書給自己");
      var user = findUser(code);
      if (!user) throw err("USER_NOT_FOUND", "找不到這個鳥號，請跟對方確認一下");
      if (!text) throw err("EMPTY", "還沒有寫內容");
      if (text.length > RULES.privateMax) throw err("TOO_LONG", "字數超過上限了");
      var t = threads[code] || (threads[code] = { id: code, peer: copy(user), messages: [], unread: 0, blocked: false });
      if (t.blocked) throw err("BLOCKED", "你封鎖了對方，先解除封鎖才能傳書");
      var m = { id: "pm-" + Date.now() + "-" + (++pmSeq), from: "me", text: text, at: nowS() };
      t.messages.push(m);
      persist("birdmail_threads", threads);
      if (SIM_PRIVATE) schedulePeerReply(code);
      return { threadId: code, message: m };
    });
  }

  // 封鎖／解除封鎖對方：封鎖後雙方都不能再傳書
  function blockPeer(id, flag) {
    return request(function () {
      if (!threads[id]) throw err("NOT_FOUND", "找不到這個對話");
      threads[id].blocked = !!flag;
      persist("birdmail_threads", threads);
      return !!flag;
    });
  }

  // 模擬示範帳號回信
  function schedulePeerReply(code) {
    setTimeout(function () {
      var t = threads[code];
      if (!t || t.blocked) return;
      var m = { id: "pm-" + Date.now() + "-" + (++pmSeq), from: "peer", text: pickOne(PM_REPLIES), at: nowS() };
      t.messages.push(m);
      t.unread = (t.unread || 0) + 1;
      persist("birdmail_threads", threads);
      var ev = { threadId: code, peer: copy(t.peer), message: copy(m) };
      pmListeners.forEach(function (cb) { try { cb(copy(ev)); } catch (e) { console.error(e); } });
    }, rand(SIM_PM_REPLY[0], SIM_PM_REPLY[1]) * 1000);
  }

  // ---------- 檢舉 ----------
  // target：{ type: "letter"|"message"|"user", id, reason: REPORT_REASONS 的 k, note? }
  var reports = load("birdmail_reports", []);   // 目前只記在本機，之後由後端接手審核
  function report(target) {
    return request(function () {
      var reason = String(target.reason || "");
      if (!REPORT_REASONS.some(function (r) { return r.k === reason; })) throw err("EMPTY", "請先選一個檢舉原因");
      var key = target.type + ":" + target.id;
      if (reports.some(function (r) { return r.key === key; })) throw err("ALREADY_REPORTED", "你已經檢舉過了，我們會處理");
      reports.push({ key: key, type: target.type, id: target.id, reason: reason,
                     note: String(target.note || "").slice(0, RULES.reportNoteMax), at: nowS() });
      persist("birdmail_reports", reports);
      return true;
    });
  }

  // ---------- 純前端偏好（同步，只存本機） ----------
  // 鍵：name（上次的署名）、mute（音效開關）、welcome（是否已送過歡迎信）
  var prefs = {
    get: function (key, fallback) { return load("birdmail_" + key, fallback); },
    set: function (key, value) { persist("birdmail_" + key, value); }
  };

  return {
    RULES: copy(RULES),
    nextLetter: nextLetter, markSeen: markSeen,
    sendLetter: sendLetter,
    respond: respond, getActs: getActs,
    getSaved: getSaved, getSavedCount: getSavedCount, save: save, unsave: unsave,
    getSent: getSent, getUnreadCount: getUnreadCount, getUnreadDetail: getUnreadDetail,
    markSentRead: markSentRead, onFeedback: onFeedback,
    getEggs: getEggs, addEgg: addEgg,
    getProfile: getProfile, updateProfile: updateProfile, auth: auth,
    getThreads: getThreads, getThread: getThread, markThreadRead: markThreadRead,
    sendPrivate: sendPrivate, blockPeer: blockPeer, onPrivate: onPrivate,
    REPORT_REASONS: copy(REPORT_REASONS), report: report,
    prefs: prefs
  };
})();
