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
    titleMax: 20, contentMax: 500, authorMax: 12, replyMax: 200   // 字數上限（後端防線）
  };

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

  function getUnreadCount() {
    return request(function () {
      return mine.reduce(function (n, d) { return n + ((acts[d.id] && acts[d.id].unread) || 0); }, 0);
    });
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
    getSent: getSent, getUnreadCount: getUnreadCount, markSentRead: markSentRead, onFeedback: onFeedback,
    getEggs: getEggs, addEgg: addEgg,
    prefs: prefs
  };
})();
