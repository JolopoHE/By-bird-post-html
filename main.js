/* ===== 鳥鳥傳信：場景與送信鳥邏輯（第一階段） =====
 * 已完成：場景縮放、送信鳥狀態機（飛來→放信→走到休息區→小動作）、
 *         收信區上限、掃帚、撒飼料、拆信閱讀、已開外觀、存信箱、
 *         寫信寄出（選鳥、三種紙張、附件）、
 *         信件壽命（泛黃、被風吹走）、按讚與回信（署名後由鳥叼走）、斑鳩彩蛋、
 *         像素美術、音效、歡迎信、郵箱的「我寄出的信」與回應通知（鳥飛到鳥台）、環境小動畫。
 * 尚未做：接後端資料庫（目前別人的讚與回信是模擬的，見 api.js 的 SIM_FEEDBACK）。
 * 資料存取：全部透過 api.js（window.BirdAPI），之後接後端只換那一層。
 */
(function () {
  "use strict";

  // ---------- 設定值（要調整手感改這裡） ----------
  var STAGE_W = 1920, STAGE_H = 1080;
  var REST  = { x1: 192, y1: 168, x2: 1728, y2: 936 };   // 送信鳥休息區
  var INBOX = { x1: 276, y1: 252, x2: 1644, y2: 852 };   // 收信區（四邊離休息區外緣都是 84）
  var MAX_LETTERS = 12;        // 收信區同時最多幾封
  var MAX_BIRDS = 8;           // 休息區同時最多幾隻鳥
  var FLY_SPEED = 520;         // 飛行速度 px/秒
  var WALK_SPEED = 70;         // 走路速度 px/秒
  var ARRIVE_GAP = [6, 10];    // 平常每隔幾秒來一隻鳥
  var FEED_GAP = [2, 3.5];     // 撒飼料後每隔幾秒來一隻
  var FEED_BOOST = 15;         // 飼料加速持續秒數
  var FEED_COOLDOWN = 20;      // 飼料冷卻秒數
  var SPRITE = 144;            // 鳥的圖集每格顯示大小（48 像素 x 3 倍）
  var PAPER = { sparrow: "note", pigeon: "postcard", owl: "parcel" };
  var BIRD_NAME = { sparrow: "麻雀", pigeon: "鴿子", owl: "貓頭鷹" };
  var STORE_POS = { x: 960, y: 1005 };   // 存信箱在舞台上的位置
  var MAILBOX_POS = { x: 960, y: 212 };  // 鳥到郵箱前取信的位置
  var PERCH = [{ x: 868, y: 34 }, { x: 1052, y: 34 }];   // 郵箱兩側鳥台的位置

  // 第一次進來時由麻雀送來的說明信
  var WELCOME = {
    id: "welcome", bird: "sparrow", author: "鳥鳥傳信",
    title: "歡迎來到鳥鳥傳信",
    content: "嗨，歡迎！這裡的信都是由小鳥送來的，寄信人是其他像你一樣的訪客。\n\n" +
             "・點地上的信就能拆開來讀。喜歡的話收進下方的存信箱，可以永久保留。\n" +
             "・每封信都有壽命，時間到會被風吹走。按讚或回信能幫它續命。\n" +
             "・點上方的郵箱可以寫信，也能看自己寄出的信收到多少回應。有新回應時，會有小鳥飛到郵箱旁的鳥台上。\n" +
             "・左邊的飼料能吸引更多鳥來，右邊的掃帚能把地上的信一次掃乾淨。\n\n" +
             "偶爾會有一隻脖子上有黑環的斑鳩來訪，留意牠留下了什麼。"
  };
  var FILE_LIMIT = { pigeon: 10, owl: 100 };   // 附件大小上限（MB）

  // 信件壽命、續命量、存信箱上限是「後端規則」，數值在 api.js 最上方調整
  // （別人的讚與回信目前是模擬的，開關 SIM_FEEDBACK 也在 api.js）
  var API = window.BirdAPI;
  var LIFE = API.RULES.life;            // 寄出後能活多久（秒），用來算變老比例
  var LIKE_BONUS = API.RULES.likeBonus;
  var REPLY_BONUS = API.RULES.replyBonus;
  var STORE_MAX = API.RULES.storeMax;
  var DYING = 20;              // 剩幾秒時開始被風吹得抖動

  // 環頸斑鳩彩蛋
  var EGG_CHANCE = 0.12;       // 每次來鳥時，改成斑鳩來下蛋的機率
  var EGG_STAY = 45;           // 蛋留在地上幾秒
  var EGG_KINDS = [            // w 為出現權重
    { k: "white", name: "白蛋",   w: 40 },
    { k: "blue",  name: "淡藍蛋", w: 25 },
    { k: "pink",  name: "粉紅蛋", w: 20 },
    { k: "spot",  name: "斑點蛋", w: 12 },
    { k: "gold",  name: "金蛋",   w: 3 }
  ];

  // ---------- DOM ----------
  var stage = document.getElementById("stage");
  var letterLayer = document.getElementById("letter-layer");
  var birdLayer = document.getElementById("bird-layer");
  var seedLayer = document.getElementById("seed-layer");
  var toastEl = document.getElementById("toast");
  var feedBtn = document.getElementById("tool-feed");

  // ---------- 狀態 ----------
  var birds = [];
  var letters = [];
  var seeds = [];
  var reserved = 0;            // 已有鳥正要去放、但信還沒落地的位置數
  var nextSpawn = 1;           // 距離下一隻鳥出現的秒數
  var boostLeft = 0;           // 飼料加速剩餘秒數
  var feedCooldown = 0;
  var birdSeq = 0;

  // ---------- 資料：一律透過 api.js（BirdAPI），這裡不直接碰 localStorage ----------
  var prefs = API.prefs;       // 純前端偏好：name、mute、welcome
  // 每封信的到期時間（秒）只是前端的快取，來源是 API 回傳的 expiresAt
  var life = {};
  function nowS() { return Date.now() / 1000; }
  function remain(id) { return (life[id] || 0) - nowS(); }   // 剩餘壽命（秒）
  function noteLife(d) { if (d && d.expiresAt != null) life[d.id] = d.expiresAt; }
  // API 失敗時的共用處理：顯示錯誤訊息
  function fail(e) {
    console.warn("BirdAPI", e);
    toast((e && e.message) || "出了點問題，再試一次");
  }
  function quiet() { /* 背景動作失敗不打擾使用者 */ }

  // ---------- 音效：用 Web Audio 即時合成的 8-bit 風格短音，不需要音檔 ----------
  var audio = null;
  var muted = prefs.get("mute", false);
  function wakeAudio() {
    if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
    if (audio.state === "suspended") audio.resume();
  }
  // 瀏覽器規定要先有使用者操作才能出聲
  document.addEventListener("pointerdown", wakeAudio);

  function tone(freq, dur, type, vol, delay, slideTo) {
    var t = audio.currentTime + (delay || 0);
    var o = audio.createOscillator(), g = audio.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audio.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, delay, f0, f1) {
    var t = audio.currentTime + (delay || 0);
    var n = Math.floor(audio.sampleRate * dur), buf = audio.createBuffer(1, n, audio.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
    src.buffer = buf; f.type = "bandpass";
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(audio.destination);
    src.start(t);
  }
  var SFX = {
    drop:   function () { tone(190, 0.09, "square", 0.04, 0, 90); },                                   // 信落地
    open:   function () { tone(520, 0.07, "square", 0.05); tone(780, 0.1, "square", 0.05, 0.07); },     // 拆信
    close:  function () { tone(420, 0.06, "square", 0.035, 0, 300); },
    save:   function () { tone(523, 0.08, "square", 0.05); tone(659, 0.08, "square", 0.05, 0.08); tone(784, 0.14, "square", 0.05, 0.16); },
    like:   function () { tone(660, 0.08, "triangle", 0.09); tone(990, 0.16, "triangle", 0.09, 0.08); },
    send:   function () { tone(392, 0.08, "square", 0.05); tone(523, 0.08, "square", 0.05, 0.09); tone(659, 0.08, "square", 0.05, 0.18); tone(784, 0.18, "square", 0.05, 0.27); },
    sweep:  function () { noise(0.35, 0.12, 0, 900, 3000); noise(0.3, 0.1, 0.18, 1200, 4000); },        // 掃帚
    blow:   function () { noise(0.9, 0.07, 0, 500, 1800); },                                           // 被風吹走
    feed:   function () { for (var i = 0; i < 6; i++) noise(0.04, 0.09, i * 0.045, 2500 + i * 300, 3500); },
    egg:    function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, 0.1, "square", 0.05, i * 0.07); }); },
    chirp:  function () { tone(2400, 0.06, "sine", 0.07, 0, 3400); tone(2800, 0.07, "sine", 0.07, 0.09, 3600); },   // 鳥叫
    notify: function () { tone(880, 0.1, "triangle", 0.1); tone(1175, 0.1, "triangle", 0.1, 0.11); tone(1568, 0.22, "triangle", 0.1, 0.22); },
    flap:   function () { noise(0.08, 0.05, 0, 400, 900); noise(0.08, 0.05, 0.12, 400, 900); },
    gust:   function () { noise(1.4, 0.06, 0, 300, 1400); noise(0.9, 0.04, 0.3, 600, 2200); },         // 陣風
    whirl:  function () { noise(1.8, 0.035, 0, 500, 1100); },                                         // 小旋風
    deny:   function () { tone(200, 0.12, "square", 0.05); tone(150, 0.16, "square", 0.05, 0.12); }
  };
  function sfx(name) {
    if (muted || !audio || audio.state !== "running") return;
    try { SFX[name](); } catch (e) { /* 音效失敗不影響功能 */ }
  }

  // ---------- 小工具 ----------
  function rand(a, b) { return a + Math.random() * (b - a); }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }

  // 舞台等比縮放、置中
  function fit() {
    var s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    var ox = (window.innerWidth - STAGE_W * s) / 2;
    var oy = (window.innerHeight - STAGE_H * s) / 2;
    stage.style.transform = "translate(" + ox + "px," + oy + "px) scale(" + s + ")";
  }
  window.addEventListener("resize", fit);
  fit();

  // 休息區（外圈）隨機一點
  function ringPoint() {
    var m = 26;
    var bands = [
      { x1: REST.x1 + m, x2: REST.x2 - m, y1: REST.y1 + m, y2: INBOX.y1 - m },   // 上
      { x1: REST.x1 + m, x2: REST.x2 - m, y1: INBOX.y2 + m, y2: REST.y2 - m },   // 下
      { x1: REST.x1 + m, x2: INBOX.x1 - m, y1: INBOX.y1, y2: INBOX.y2 },         // 左
      { x1: INBOX.x2 + m, x2: REST.x2 - m, y1: INBOX.y1, y2: INBOX.y2 }          // 右
    ];
    var weights = [5, 5, 2, 2];
    var r = Math.random() * 14, i = 0;
    while (r > weights[i]) { r -= weights[i]; i++; }
    var b = bands[i];
    return { x: rand(b.x1, b.x2), y: rand(b.y1, b.y2) };
  }

  // 離 (x,y) 較近的休息區位置
  function ringPointNear(x, y, maxD) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < 14; i++) {
      var p = ringPoint(), d = dist(x, y, p.x, p.y);
      if (maxD && d < maxD && d > 60) return p;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  // 收信區內找一個盡量不跟其他信重疊的位置
  function dropPoint() {
    var best = null, bestScore = -1;
    for (var i = 0; i < 30; i++) {
      var p = { x: rand(INBOX.x1 + 120, INBOX.x2 - 120), y: rand(INBOX.y1 + 95, INBOX.y2 - 95) };
      var near = Infinity;
      for (var j = 0; j < letters.length; j++) {
        near = Math.min(near, dist(p.x, p.y, letters[j].x, letters[j].y));
      }
      for (var k = 0; k < birds.length; k++) {
        if (birds[k].dropAt) near = Math.min(near, dist(p.x, p.y, birds[k].dropAt.x, birds[k].dropAt.y));
      }
      if (near > bestScore) { bestScore = near; best = p; }
    }
    return best;
  }

  function edgePoint() {
    var side = Math.floor(Math.random() * 4);
    if (side === 0) return { x: -120, y: rand(0, STAGE_H) };
    if (side === 1) return { x: STAGE_W + 120, y: rand(0, STAGE_H) };
    if (side === 2) return { x: rand(0, STAGE_W), y: -120 };
    return { x: rand(0, STAGE_W), y: STAGE_H + 120 };
  }

  function markSeen(id) {
    if (id === WELCOME.id) return;      // 歡迎信是前端自己的，不用告訴後端
    API.markSeen(id).catch(quiet);
  }

  // 取下一封要送的信（回傳 Promise）。排除已在畫面上、正被鳥叼著的；
  // 其餘的挑選規則（不重複、排除已收藏）由 API 負責。
  function nextLetter() {
    // 第一次造訪：先送一封說明玩法的歡迎信（新手引導是前端的事，不經過後端）
    if (!prefs.get("welcome", false)) {
      prefs.set("welcome", true);
      life[WELCOME.id] = nowS() + LIFE * 2;
      return Promise.resolve(WELCOME);
    }
    var busy = [];
    letters.forEach(function (l) { busy.push(l.data.id); });
    birds.forEach(function (b) {
      if (b.cargo) busy.push(b.cargo.id);
      if (b.outgoing) busy.push(b.outgoing.id);   // 正要被叼走寄出的信
    });
    return API.nextLetter(busy).then(function (d) { noteLife(d); return d; });
  }

  // ---------- 信件 ----------
  function makeLetterEl(data) {
    var el = document.createElement("div");
    el.className = "letter " + PAPER[data.bird];
    var span = document.createElement("span");
    span.textContent = data.title;
    el.appendChild(span);
    return el;
  }

  function addLetter(data, x, y) {
    var el = makeLetterEl(data);
    el.style.left = x + "px";
    el.style.top = y + "px";
    var letter = { data: data, x: x, y: y, el: el, opened: false };
    el.addEventListener("click", function () { openLetter(letter); });
    letterLayer.appendChild(el);
    letters.push(letter);
    updateLetterImage(letter);
    sfx("drop");
  }

  // 依「紙張種類、是否拆過、變老階段」換圖。階段 0~3：越老越黃、污漬越多，最後缺角
  var AGE_STEPS = [0.3, 0.55, 0.8];
  function updateLetterImage(l) {
    var age = Math.max(0, Math.min(1, 1 - remain(l.data.id) / LIFE));
    var stage = age < AGE_STEPS[0] ? 0 : age < AGE_STEPS[1] ? 1 : age < AGE_STEPS[2] ? 2 : 3;
    var file = "assets/letter_" + PAPER[l.data.bird] + (l.opened ? "_open" : "") + (stage ? "_a" + stage : "") + ".png";
    if (file !== l.img) { l.img = file; l.el.style.backgroundImage = "url(" + file + ")"; }
  }
  // 先把所有階段的圖載入，換圖時才不會閃一下
  ["note", "postcard", "parcel"].forEach(function (p) {
    ["", "_open"].forEach(function (o) {
      ["", "_a1", "_a2", "_a3"].forEach(function (a) { new Image().src = "assets/letter_" + p + o + a + ".png"; });
    });
  });

  // 拆信：標記為已開、換成打開的外觀，並顯示內容
  function openLetter(letter) {
    letter.opened = true;
    letter.el.classList.add("opened");
    markSeen(letter.data.id);
    updateLetterImage(letter);
    sfx("open");
    showReader(letter.data, letter);
  }

  function sweepAll() {
    // 已署名、等鳥來叼的信不掃
    var targets = letters.filter(function (l) { return !l.leaving; });
    if (!targets.length) { toast("地上很乾淨，沒有信可以掃"); return; }
    targets.forEach(function (l) {
      markSeen(l.data.id);
      l.el.classList.remove("dying");
      l.el.classList.add("swept");
      setTimeout(function () { l.el.remove(); }, 550);
    });
    letters = letters.filter(function (l) { return l.leaving; });
    leaves.forEach(function (lf) { if (lf.state === "ground") { lf.lands = 9; liftLeaf(lf, rand(380, 520), rand(40, 90)); } });
    sfx("sweep");
    toast("信件全部掃乾淨了");
  }

  // ---------- 信件壽命 ----------
  function blowAway(l) {
    letters.splice(letters.indexOf(l), 1);
    markSeen(l.data.id);
    var el = l.el;
    el.classList.remove("dying");
    el.classList.add("blown");
    sfx("blow");
    // 先被風掀起來，再越吹越快、邊轉邊飛出畫面
    var from = parseFloat(el.style.rotate) || 0;
    var spin = rand(160, 300) * (Math.random() < 0.5 ? -1 : 1);
    var lift = rand(-220, -60);
    var anim = el.animate([
      { translate: "0px 0px", rotate: from + "deg", scale: 1, opacity: 1 },
      { translate: "90px " + (lift * 0.35).toFixed(0) + "px", rotate: (from + spin * 0.2).toFixed(0) + "deg", scale: 1.12, opacity: 1, offset: 0.25 },
      { translate: "620px " + (lift * 0.9).toFixed(0) + "px", rotate: (from + spin * 0.65).toFixed(0) + "deg", scale: 1.05, opacity: 0.9, offset: 0.7 },
      { translate: "1500px " + lift.toFixed(0) + "px", rotate: (from + spin).toFixed(0) + "deg", scale: 0.9, opacity: 0 }
    ], { duration: 1900, easing: "ease-in", fill: "forwards" });
    anim.onfinish = function () { el.remove(); };
    setTimeout(function () { el.remove(); }, 2200);   // 保險：動畫沒跑完也會清掉
  }

  function timeText(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ":" + ("0" + sec % 60).slice(-2);
  }

  // 每 0.25 秒更新一次：信紙泛黃、快到期時抖動、到期被風吹走
  function ageLetters() {
    letters.slice().forEach(function (l) {
      if (l.leaving) return;
      var r = remain(l.data.id);
      var isReading = reading && reading.letter === l;
      updateLetterImage(l);
      l.el.classList.toggle("dying", r > 0 && r < DYING);
      if (r <= 0 && !isReading) blowAway(l);     // 正在讀的信等關閉後才吹走
    });
    if (reading && reading.letter) {
      var left = remain(reading.data.id);
      document.getElementById("life-text").textContent =
        left > 0 ? "剩餘壽命 " + timeText(left) : "壽命已盡，關閉後就會被風吹走";
      var bar = document.getElementById("life-bar");
      bar.firstChild.style.width = Math.max(0, Math.min(100, left / LIFE * 100)) + "%";
      bar.classList.toggle("low", left < DYING);
    }
  }

  // ---------- 拆信閱讀視窗 ----------
  var overlay = document.getElementById("overlay");
  var reader = document.getElementById("reader");
  var readerPaper = document.getElementById("reader-paper");
  var storePanel = document.getElementById("store-panel");
  var compose = document.getElementById("compose");
  var btnSave = document.getElementById("btn-save");
  var btnDiscard = document.getElementById("btn-discard");
  var reading = null;          // { data, letter }；letter 為 null 表示從存信箱打開

  // from：信不是從地上點開時的來源，"store" 存信箱、"sent" 我寄出的信
  function showReader(data, letter, from) {
    reading = { data: data, letter: letter, from: from };
    readerPaper.className = "paper " + PAPER[data.bird];
    document.getElementById("reader-title").textContent = data.title;
    document.getElementById("reader-meta").textContent =
      "寄信人：" + data.author + "　・　由" + BIRD_NAME[data.bird] + "送達" + (data.mine ? "　・　你寄出的信" : "");
    document.getElementById("reader-content").textContent = data.content;

    // 附件目前是佔位：鴿子帶圖片、貓頭鷹帶檔案
    var attach = document.getElementById("reader-attach");
    attach.innerHTML = "";
    if (data.image) {
      var img = document.createElement("img");
      img.className = "attach-photo";
      img.src = data.image;
      attach.appendChild(img);
    } else if (data.file) {
      var chip = document.createElement("div");
      chip.className = "attach-file";
      chip.innerHTML = "<b></b><span></span>";
      chip.children[0].textContent = (data.file.name.split(".").pop() || "檔案").toUpperCase().slice(0, 5);
      chip.children[1].textContent = data.file.name + "（" + data.file.size + "）";
      attach.appendChild(chip);
    } else if (!data.mine && data.bird === "pigeon") {
      attach.innerHTML = '<div class="attach-image">（圖片附件）</div>';
    } else if (!data.mine && data.bird === "owl") {
      attach.innerHTML = '<div class="attach-file"><b>ZIP</b><span>附件檔案（佔位）</span></div>';
    }

    hideRespond();
    document.getElementById("reader-life").hidden = !letter;   // 存信箱裡的信永久保留，沒有壽命
    btnLike.hidden = btnReply.hidden = !letter;
    btnLike.disabled = true;        // 等 API 回來確認是否按過讚
    btnLike.textContent = "按讚";
    renderActs(data);
    btnSave.hidden = !letter;       // 地上的信才能收藏
    btnDiscard.hidden = from !== "store";   // 存信箱裡的信才能丟掉
    hidePanels();
    reader.hidden = false;
    overlay.hidden = false;
    readerPaper.scrollTop = 0;
    ageLetters();
  }

  // 顯示這封信收到的讚與回信，並更新按讚按鈕
  function renderActs(data) {
    var box = document.getElementById("reader-acts");
    box.innerHTML = "";
    if (data.id === WELCOME.id) { btnLike.disabled = false; return; }
    API.getActs(data.id).then(function (a) {
      if (!reading || reading.data !== data) return;     // 已經換成別封信了
      btnLike.disabled = a.liked;
      btnLike.textContent = a.liked ? "已按讚" : "按讚";
      drawActs(box, a);
    }, function (e) { btnLike.disabled = false; fail(e); });
  }
  function drawActs(box, a) {
    if (a.likes.length) {
      var like = document.createElement("div");
      like.className = "act-like";
      like.textContent = "♥ " + a.likes.length + " 個讚：" + a.likes.join("、");
      box.appendChild(like);
    }
    a.replies.forEach(function (r) {
      var row = document.createElement("div");
      row.className = "act-reply";
      var name = document.createElement("b");
      name.textContent = r.author + " 回信：";
      row.appendChild(name);
      row.appendChild(document.createTextNode(r.text));
      box.appendChild(row);
    });
  }

  // ---------- 按讚與回信 ----------
  var btnLike = document.getElementById("btn-like");
  var btnReply = document.getElementById("btn-reply");
  var respond = document.getElementById("respond");
  var rText = document.getElementById("r-text");
  var rAuthor = document.getElementById("r-author");
  var respondMode = null;      // "like" 或 "reply"

  // 找離信最近、正在休息的鳥來叼信（斑鳩只負責下蛋，不送信）
  function findCourier(x, y) {
    var best = null, bd = Infinity;
    birds.forEach(function (b) {
      var free = b.type !== "dove" && !b.cargo && !b.outgoing && !b.fetch &&
                 (b.state === "idle" || b.state === "peck" || (b.state === "walk" && !b.dropAt));
      var d = dist(b.x, b.y, x, y);
      if (free && d < bd) { bd = d; best = b; }
    });
    return best;
  }

  function hideRespond() {
    respond.hidden = true;
    respondMode = null;
    reader.classList.remove("responding");
    document.getElementById("reader-actions").hidden = false;
  }

  function startRespond(mode) {
    if (!reading || !reading.letter) return;
    if (remain(reading.data.id) <= 0) { toast("這封信的壽命已盡，來不及了"); return; }
    if (!findCourier(reading.letter.x, reading.letter.y)) {
      sfx("deny");
      toast("休息區沒有空閒的鳥，撒點飼料吸引鳥來吧");
      return;
    }
    respondMode = mode;
    rText.hidden = mode === "like";
    document.getElementById("r-hint").textContent = mode === "like"
      ? "按讚會幫這封信續命 " + LIKE_BONUS + " 秒"
      : "回信會幫這封信續命 " + REPLY_BONUS + " 秒";
    rAuthor.value = rAuthor.value || prefs.get("name", "");
    respond.hidden = false;
    reader.classList.add("responding");
    document.getElementById("reader-actions").hidden = true;
    (mode === "like" ? rAuthor : rText).focus();
  }

  var responding = false;       // 等 API 回應中，避免連按
  function confirmRespond() {
    var letter = reading && reading.letter;
    var mode = respondMode;
    if (!letter || !mode || responding) return;
    var text = rText.value.trim();
    if (mode === "reply" && !text) { toast("回信還沒有內容"); rText.focus(); return; }
    if (!findCourier(letter.x, letter.y)) { toast("鳥剛好都在忙，撒點飼料再試一次"); return; }

    var id = letter.data.id;
    var name = rAuthor.value.trim() || "匿名";
    prefs.set("name", rAuthor.value.trim());
    var bonus = mode === "like" ? LIKE_BONUS : REPLY_BONUS;
    // 歡迎信是前端自己的，續命也在前端算；其他信交給 API（互動可以續命）
    var req = id === WELCOME.id
      ? Promise.resolve({ expiresAt: Math.max(life[id] || 0, nowS()) + bonus })
      : API.respond(id, mode, name, text);
    responding = true;
    req.then(function (res) {
      responding = false;
      life[id] = res.expiresAt;
      markSeen(id);
      if (reading && reading.letter === letter) { rText.value = ""; reading = null; closeOverlay(); }
      if (letters.indexOf(letter) < 0 || letter.leaving) return;   // 等待期間信已經不在地上

      // 信上蓋署名，等鳥來叼走
      letter.leaving = true;
      letter.el.classList.remove("dying");
      letter.el.classList.add("leaving");
      var mark = document.createElement("span");
      mark.className = "sign-mark";
      mark.textContent = (mode === "like" ? "♥ " : "回信 ") + name;
      letter.el.appendChild(mark);

      // 等待期間原本的鳥可能被叫走了，重新找一隻；真的沒有就從外面叫一隻
      var courier = findCourier(letter.x, letter.y) || createBird("sparrow", edgePoint());
      if (courier.seed) { courier.seed.taken = false; courier.seed = null; }
      courier.fetch = letter;
      courier.target = { x: letter.x, y: letter.y };
      courier.state = "flyPickup";

      sfx("like");
      toast((mode === "like" ? "已按讚" : "回信寫好了") + "，" + BIRD_NAME[courier.type] + "來把信叼給寄信人");
    }, function (e) {
      responding = false;
      fail(e);
    });
  }

  btnLike.addEventListener("click", function () { startRespond("like"); });
  btnReply.addEventListener("click", function () { startRespond("reply"); });
  document.getElementById("btn-respond-ok").addEventListener("click", confirmRespond);
  document.getElementById("btn-respond-cancel").addEventListener("click", hideRespond);

  function hidePanels() {
    reader.hidden = true;
    storePanel.hidden = true;
    compose.hidden = true;
    mailMenu.hidden = true;
    sentPanel.hidden = true;
  }

  function closeOverlay() {
    // 從存信箱或寄件匣打開的信，關閉後回到原本的面板
    if (!reader.hidden && reading && !reading.letter) {
      if (reading.from === "sent") showSent(); else showStore();
      return;
    }
    if (!overlay.hidden) sfx("close");
    overlay.hidden = true;
    hidePanels();
    reading = null;
    hideRespond();
  }

  // ---------- 存信箱 ----------
  function updateStoreCount(n) {
    if (n == null) { API.getSavedCount().then(updateStoreCount, quiet); return; }
    var text = n + " / " + STORE_MAX;
    document.getElementById("store-count").textContent = text;
    document.getElementById("store-panel-count").textContent = text;
  }

  var saving = false;          // 等 API 回應中，避免連按
  function saveReading() {
    var letter = reading && reading.letter;
    if (!letter || saving) return;
    saving = true;
    API.save(letter.data).then(function (n) {
      saving = false;
      updateStoreCount(n);
      if (reading && reading.letter === letter) { reading = null; closeOverlay(); }
      sfx("save");
      toast("已收進存信箱，會永久保留");
      // 信從地上飛進存信箱，收信區空出一個位置
      var idx = letters.indexOf(letter);
      if (idx < 0) return;
      letters.splice(idx, 1);
      letter.el.classList.add("stored");
      letter.el.style.left = STORE_POS.x + "px";
      letter.el.style.top = STORE_POS.y + "px";
      setTimeout(function () { letter.el.remove(); }, 600);
    }, function (e) { saving = false; fail(e); });
  }

  function discardReading() {
    if (!reading || reading.letter) return;
    var id = reading.data.id;
    API.unsave(id).then(function (n) {
      updateStoreCount(n);
      reading = null;
      showStore();
      toast("已從存信箱丟掉");
    }, fail);
  }

  function showStore() {
    Promise.all([API.getSaved(), API.getEggs()]).then(function (r) {
      var saved = r[0];
      renderEggShelf(r[1]);
      updateStoreCount(saved.length);
      var grid = document.getElementById("store-grid");
      grid.innerHTML = "";
      if (!saved.length) {
        grid.innerHTML = '<div class="empty">存信箱是空的。拆開喜歡的信，就能收進來。</div>';
      }
      saved.slice().reverse().forEach(function (data) {   // 最新收藏的排最前面
        var el = makeLetterEl(data);
        el.classList.add("opened");
        el.addEventListener("click", function () { showReader(data, null, "store"); });
        grid.appendChild(el);
      });
      reading = null;
      hidePanels();
      storePanel.hidden = false;
      overlay.hidden = false;
    }, fail);
  }

  // 點遮罩空白處關閉（寫信時不關，避免誤觸；草稿會保留到寄出為止）
  overlay.addEventListener("click", function (e) { if (e.target === overlay && compose.hidden) closeOverlay(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !overlay.hidden) closeOverlay(); });
  document.getElementById("btn-close").addEventListener("click", closeOverlay);
  document.getElementById("btn-store-close").addEventListener("click", closeOverlay);
  btnSave.addEventListener("click", saveReading);
  btnDiscard.addEventListener("click", discardReading);
  updateStoreCount();

  // ---------- 環頸斑鳩的蛋 ----------
  var eggLayer = document.getElementById("egg-layer");

  function addEgg(x, y) {
    var total = EGG_KINDS.reduce(function (s, k) { return s + k.w; }, 0);
    var r = Math.random() * total, kind = EGG_KINDS[0];
    for (var i = 0; i < EGG_KINDS.length; i++) {
      if (r < EGG_KINDS[i].w) { kind = EGG_KINDS[i]; break; }
      r -= EGG_KINDS[i].w;
    }
    var el = document.createElement("div");
    el.className = "egg " + kind.k;
    el.title = "撿起來";
    el.style.left = x + "px";
    el.style.top = y + "px";
    var gone = false;
    function vanish() {
      if (gone) return;
      gone = true;
      el.style.opacity = 0;
      el.style.pointerEvents = "none";
      setTimeout(function () { el.remove(); }, 600);
    }
    el.addEventListener("click", function () {
      if (gone) return;
      vanish();
      API.addEgg(kind.k).then(function () {
        sfx("egg");
        toast("撿到一顆" + kind.name + "！已放進存信箱的收藏");
      }, fail);
    });
    setTimeout(vanish, EGG_STAY * 1000);
    eggLayer.appendChild(el);
  }

  // 存信箱上方的蛋收藏架
  function renderEggShelf(eggs) {
    var shelf = document.getElementById("egg-shelf");
    shelf.innerHTML = "<span>斑鳩蛋收藏：</span>";
    EGG_KINDS.forEach(function (kind) {
      var n = eggs[kind.k] || 0;
      var slot = document.createElement("div");
      slot.className = "egg-slot" + (n ? "" : " none");
      var egg = document.createElement("div");
      egg.className = "egg " + kind.k;
      var label = document.createElement("span");
      label.textContent = n ? kind.name + " × " + n : "？？？";
      slot.appendChild(egg);
      slot.appendChild(label);
      shelf.appendChild(slot);
    });
  }

  // 斑鳩飛來休息區，過一會兒下一顆蛋，再待一下就飛走
  function spawnDove() {
    var b = createBird("dove", edgePoint());
    b.target = ringPoint();
    b.state = "flyRest";
    b.layIn = rand(3, 7);
    b.heading = Math.atan2(b.target.y - b.y, b.target.x - b.x) * 180 / Math.PI;
  }

  // ---------- 郵箱：選單、我寄出的信、回應通知 ----------
  var mailMenu = document.getElementById("mail-menu");
  var sentPanel = document.getElementById("sent-panel");
  var mailboxBtn = document.getElementById("tool-mailbox");
  var mailBadge = document.getElementById("mail-badge");

  // 郵箱上的數字、舉起的旗子（n 沒給就向 API 查）
  function updateMailBadge(n) {
    if (n == null) { API.getUnreadCount().then(updateMailBadge, quiet); return; }
    mailBadge.hidden = !n;
    mailBadge.textContent = n;
    mailboxBtn.classList.toggle("has-mail", n > 0);
    document.getElementById("menu-unread").textContent = n ? n + " 則新回應" : "";
  }

  function showMailMenu() {
    hidePanels();
    updateMailBadge();
    mailMenu.hidden = false;
    overlay.hidden = false;
  }

  function showSent() {
    API.getSent().then(renderSent, fail);
  }

  function renderSent(mine) {
    var list = document.getElementById("sent-list");
    list.innerHTML = "";
    document.getElementById("sent-count").textContent = "共 " + mine.length + " 封";
    if (!mine.length) {
      list.innerHTML = '<div class="empty">你還沒有寄過信。回到郵箱寫一封吧。</div>';
    }
    mine.slice().reverse().forEach(function (data) {       // 最新寄出的排最前面
      noteLife(data);
      var left = remain(data.id);
      var row = document.createElement("div");
      row.className = "sent-row" + (left <= 0 && !data.saved ? " dead" : "");
      var icon = document.createElement("div");
      icon.className = "sent-icon";
      icon.style.backgroundImage = "url(assets/letter_" + PAPER[data.bird] + (left <= 0 ? "_a3" : "") + ".png)";
      var main = document.createElement("div");
      main.className = "sent-main";
      var title = document.createElement("div");
      title.className = "sent-title";
      title.textContent = data.title;
      var meta = document.createElement("div");
      meta.className = "sent-meta";
      meta.textContent = "由" + BIRD_NAME[data.bird] + "寄出　・　" +
        (data.saved ? "已收進存信箱，永久保留" : left > 0 ? "剩餘壽命 " + timeText(left) : "已經被風吹走了");
      main.appendChild(title); main.appendChild(meta);
      var stats = document.createElement("div");
      stats.className = "sent-stats";
      stats.innerHTML = '<span class="heart">♥</span> ' + data.likeCount + "　回信 " + data.replyCount;
      row.appendChild(icon); row.appendChild(main); row.appendChild(stats);
      if (data.unread) {
        var badge = document.createElement("span");
        badge.className = "sent-new";
        badge.textContent = "新 " + data.unread;
        row.appendChild(badge);
      }
      row.addEventListener("click", function () { showReader(data, null, "sent"); });
      list.appendChild(row);
    });

    // 看過就算已讀：數字歸零、旗子放下、鳥台上的鳥飛走
    API.markSentRead().then(function () { updateMailBadge(0); }, quiet);
    birds.forEach(function (b) {
      if (b.state === "perch" || b.state === "flyPerch") { b.perchSlot = null; b.state = "leave"; b.target = edgePoint(); }
    });

    reading = null;
    hidePanels();
    sentPanel.hidden = false;
    overlay.hidden = false;
  }

  // 我寄出的信收到別人的讚或回信（由 API 通知；目前是 api.js 裡的模擬）
  API.onFeedback(function (ev) {
    life[ev.letter.id] = ev.expiresAt;
    updateMailBadge();
    perchBird(ev.letter.bird);
    sfx("notify");
    toast("「" + ev.letter.title + "」收到" + ev.author + "的" + (ev.kind === "like" ? "讚" : "回信"));
  });

  // 一隻鳥飛到郵箱旁的鳥台站著，表示有新回應（鳥台只有兩個位置，更多的看郵箱上的數字）
  function perchBird(type) {
    var used = {};
    birds.forEach(function (b) { if (b.perchSlot != null) used[b.perchSlot] = 1; });
    var slot = !used[0] ? 0 : !used[1] ? 1 : -1;
    if (slot < 0) return;
    var b = createBird(type, edgePoint());
    b.perchSlot = slot;
    b.target = PERCH[slot];
    b.state = "flyPerch";
    b.heading = Math.atan2(b.target.y - b.y, b.target.x - b.x) * 180 / Math.PI;
  }

  document.getElementById("btn-menu-write").addEventListener("click", showCompose);
  document.getElementById("btn-menu-sent").addEventListener("click", showSent);
  document.getElementById("btn-menu-close").addEventListener("click", closeOverlay);
  document.getElementById("btn-sent-close").addEventListener("click", closeOverlay);
  updateMailBadge();

  // ---------- 落葉 ----------
  // 每片葉子有平面位置 (x, y) 和離地高度 z。在空中時一邊翻轉一邊飄，落地後靜止，
  // 之後被風再吹起來。隨機事件：零星飄落、陣風、小旋風、一陣落葉雨。
  var LEAF_MAX = 26;            // 畫面上最多幾片
  var LEAF_EVENT_GAP = [5, 10]; // 每隔幾秒發生一次落葉事件
  var LEAF_GROUND_MAX = 12;     // 地上最多躺幾片，超過的會先被吹起來，免得蓋住信
  var leafLayer = document.getElementById("leaf-layer");
  var leaves = [];
  var leafTimer = 2;

  function addLeaf(x, y, z, vx, vy, vz) {
    if (leaves.length >= LEAF_MAX) return null;
    var el = document.createElement("div");
    el.className = "leaf";
    el.style.backgroundImage = "url(assets/leaf_" + Math.floor(Math.random() * 3) + ".png)";
    leafLayer.appendChild(el);
    var lf = {
      x: x, y: y, z: z, vx: vx, vy: vy, vz: vz,
      state: "air", frame: Math.random() * 8, spin: rand(7, 12) * (Math.random() < 0.5 ? -1 : 1),
      sway: rand(0, 6.28), rest: 0, lands: 0, el: el, key: ""
    };
    leaves.push(lf);
    return lf;
  }
  function removeLeaf(lf) {
    lf.el.remove();
    leaves.splice(leaves.indexOf(lf), 1);
  }
  // 把地上的葉子吹起來
  function liftLeaf(lf, vx, vz) {
    lf.state = "air";
    lf.vx = vx; lf.vy = rand(-25, 25); lf.vz = vz;
    lf.spin = rand(8, 14) * (Math.random() < 0.5 ? -1 : 1);
  }

  // 事件一：零星幾片從左邊飄進來
  function leafDrift() {
    var n = 1 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) addLeaf(rand(-120, -30), rand(120, 950), rand(60, 200), rand(70, 130), rand(-15, 25), rand(-10, 30));
  }
  // 事件二：陣風，一大群葉子橫掃畫面，地上的葉子也被捲起來
  function leafGust() {
    var n = 9 + Math.floor(Math.random() * 7);
    for (var i = 0; i < n; i++) addLeaf(rand(-500, -30), rand(60, 1000), rand(40, 240), rand(230, 380), rand(-30, 40), rand(0, 60));
    leaves.forEach(function (lf) { if (lf.state === "ground") liftLeaf(lf, rand(220, 360), rand(90, 170)); });
    sfx("gust");
  }
  // 事件三：小旋風，葉子繞著一個點旋轉上升，然後散開落下
  function leafWhirl() {
    var cx = rand(350, 1570), cy = rand(300, 800);
    var joined = 0;
    leaves.forEach(function (lf) {              // 附近地上的葉子先被捲進去
      if (lf.state === "ground" && dist(lf.x, lf.y, cx, cy) < 320) { joinWhirl(lf, cx, cy); joined++; }
    });
    for (var i = joined; i < 7; i++) {
      var lf = addLeaf(cx + rand(-60, 60), cy + rand(-40, 40), rand(0, 20), 0, 0, 0);
      if (lf) joinWhirl(lf, cx, cy);
    }
    sfx("whirl");
  }
  function joinWhirl(lf, cx, cy) {
    lf.state = "whirl";
    lf.cx = cx; lf.cy = cy;
    lf.ang = Math.atan2(lf.y - cy, lf.x - cx);
    lf.rad = Math.max(20, Math.min(90, dist(lf.x, lf.y, cx, cy)));
    lf.t = rand(2.2, 3.2);
    lf.spin = rand(14, 20);
  }
  // 事件四：落葉雨，從高處慢慢飄下來，幾乎沒有風
  function leafShower() {
    var n = 5 + Math.floor(Math.random() * 5);
    var x0 = rand(200, 1400);
    for (var i = 0; i < n; i++) addLeaf(x0 + rand(-260, 260), rand(200, 900), rand(260, 520), rand(8, 30), rand(-8, 8), 0);
  }

  function leafEvent() {
    var r = Math.random();
    if (r < 0.34) leafDrift();
    else if (r < 0.58) leafShower();
    else if (r < 0.8) leafWhirl();
    else leafGust();
  }

  function updateLeaves(dt) {
    leafTimer -= dt;
    if (leafTimer <= 0) { leafTimer = rand(LEAF_EVENT_GAP[0], LEAF_EVENT_GAP[1]); leafEvent(); }

    var grounded = leaves.filter(function (l) { return l.state === "ground"; });
    for (var g = 0; g < grounded.length - LEAF_GROUND_MAX; g++) grounded[g].rest = 0;   // 最早落地的先走

    for (var i = leaves.length - 1; i >= 0; i--) {
      var lf = leaves[i];
      if (lf.state === "air") {
        lf.sway += dt * 3;
        lf.x += lf.vx * dt;
        lf.y += (lf.vy + Math.sin(lf.sway) * 22) * dt;      // 左右擺盪
        lf.z += lf.vz * dt;
        lf.vz -= 70 * dt;                                    // 下墜
        if (lf.vz < -46) lf.vz = -46;                        // 葉子輕，掉落有極限速度
        lf.vx *= 1 - 0.25 * dt;                              // 風漸漸變小
        lf.frame += lf.spin * dt;
        if (lf.z <= 0) {                                     // 落地：攤平、停住
          lf.z = 0;
          lf.state = "ground";
          lf.frame = Math.random() < 0.5 ? 0 : 4;
          lf.rest = rand(4, 14);
          lf.lands++;
        }
      } else if (lf.state === "ground") {
        lf.rest -= dt;
        if (lf.rest <= 0) {
          // 躺太多次的葉子直接被吹出畫面，其餘的被一小陣風再吹起來
          if (lf.lands >= 3) liftLeaf(lf, rand(260, 380), rand(120, 180));
          else liftLeaf(lf, rand(60, 150), rand(70, 130));
        }
      } else if (lf.state === "whirl") {
        lf.t -= dt;
        lf.ang += (5.5 - lf.rad / 40) * dt;
        lf.rad += 16 * dt;
        lf.z += 55 * dt;
        lf.x = lf.cx + Math.cos(lf.ang) * lf.rad;
        lf.y = lf.cy + Math.sin(lf.ang) * lf.rad * 0.55;     // 俯視角，圓看起來是扁的
        lf.frame += lf.spin * dt;
        if (lf.t <= 0) {                                     // 旋風散掉，葉子沿切線甩出去
          lf.state = "air";
          lf.vx = -Math.sin(lf.ang) * 140 + rand(20, 70);
          lf.vy = Math.cos(lf.ang) * 70;
          lf.vz = rand(-10, 40);
        }
      }
      if (lf.x > STAGE_W + 80 || lf.x < -600 || lf.y < -200 || lf.y > STAGE_H + 200) { removeLeaf(lf); continue; }

      var f = ((Math.floor(lf.frame) % 8) + 8) % 8;
      var sy = 3 + Math.round(lf.z / 3) * 3;                 // 影子留在地面：離地越高，影子離葉子越遠
      var key = f + "," + sy;
      if (key !== lf.key) {
        lf.key = key;
        lf.el.style.backgroundPosition = (-f * 33) + "px 0";
        lf.el.style.filter = lf.z > 300 ? "none" : "drop-shadow(3px " + sy + "px 0 rgba(96,66,24," + (0.24 - Math.min(0.16, lf.z / 1500)).toFixed(2) + "))";
      }
      lf.el.style.transform = "translate(" + Math.round(lf.x) + "px," + Math.round(lf.y - lf.z) + "px)";
      lf.el.style.zIndex = lf.state === "ground" ? 4 : 56;
    }
  }

  // ---------- 寫信 ----------
  var composePick = document.getElementById("compose-pick");
  var composeWrite = document.getElementById("compose-write");
  var composePaper = document.getElementById("compose-paper");
  var cTitle = document.getElementById("c-title");
  var cContent = document.getElementById("c-content");
  var cAuthor = document.getElementById("c-author");
  var cFile = document.getElementById("c-file");
  var cFileInfo = document.getElementById("c-file-info");
  var cFileClear = document.getElementById("c-file-clear");
  var draftBird = null;        // 目前選的鳥
  var draftAttach = null;      // { image } 或 { file: { name, size } }

  function sizeText(bytes) {
    return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  function clearAttach() {
    draftAttach = null;
    cFile.value = "";
    cFileInfo.textContent = "";
    cFileClear.hidden = true;
  }

  function showCompose() {
    hidePanels();
    compose.hidden = false;
    overlay.hidden = false;
    // 有還沒寄出的草稿就直接回到寫信畫面
    var hasDraft = draftBird && (cTitle.value || cContent.value);
    composePick.hidden = !!hasDraft;
    composeWrite.hidden = !hasDraft;
  }

  function pickBird(type) {
    if (type !== draftBird) clearAttach();   // 換鳥後附件規則不同，重新選
    draftBird = type;
    composePaper.className = "paper " + PAPER[type];
    document.getElementById("c-attach-row").hidden = type === "sparrow";
    document.getElementById("c-file-label").textContent = type === "pigeon" ? "加入圖片" : "加入檔案";
    cFile.accept = type === "pigeon" ? "image/*" : "";
    cAuthor.value = cAuthor.value || prefs.get("name", "");
    composePick.hidden = true;
    composeWrite.hidden = false;
    cTitle.focus();
  }

  cFile.addEventListener("change", function () {
    var f = cFile.files[0];
    if (!f) return;
    var limit = FILE_LIMIT[draftBird];
    if (f.size > limit * 1048576) {
      clearAttach();
      toast(BIRD_NAME[draftBird] + "最多只能載 " + limit + "MB，這個檔案太重了");
      return;
    }
    if (draftBird === "pigeon" && f.type.indexOf("image/") !== 0) {
      clearAttach();
      toast("鴿子只能送圖片，其他檔案請找貓頭鷹");
      return;
    }
    cFileInfo.textContent = f.name + "（" + sizeText(f.size) + "）";
    cFileClear.hidden = false;
    if (draftBird === "pigeon") {
      draftAttach = null;
      var fr = new FileReader();
      fr.onload = function () { draftAttach = { image: fr.result }; };
      fr.readAsDataURL(f);
    } else {
      // 前端測試階段只記錄檔名與大小，檔案本身不會上傳
      draftAttach = { file: { name: f.name, size: sizeText(f.size) } };
    }
  });
  cFileClear.addEventListener("click", clearAttach);

  var sending = false;         // 等 API 回應中，避免連按
  function sendLetter() {
    if (sending) return;
    var title = cTitle.value.trim(), content = cContent.value.trim();
    if (!title) { toast("還沒寫標題"); cTitle.focus(); return; }
    if (!content) { toast("信裡還沒有內容"); cContent.focus(); return; }
    if (cFile.files[0] && !draftAttach) { toast("圖片還在裝進信封，請再按一次寄出"); return; }

    prefs.set("name", cAuthor.value.trim());
    var draft = { bird: draftBird, author: cAuthor.value.trim() || "匿名", title: title, content: content };
    if (draftAttach && draftAttach.image) draft.image = draftAttach.image;
    if (draftAttach && draftAttach.file) draft.file = draftAttach.file;
    sending = true;
    API.sendLetter(draft).then(function (data) {
      sending = false;
      noteLife(data);
      dispatchSender(data);
      cTitle.value = "";
      cContent.value = "";
      clearAttach();
      draftBird = null;
      if (!compose.hidden) closeOverlay();
      sfx("send");
      toast(BIRD_NAME[data.bird] + "來取信了");
    }, function (e) { sending = false; fail(e); });   // 失敗時草稿留著，可以再按一次
  }

  // 找一隻同種、正在休息的鳥來郵箱取信；沒有就從外面叫一隻
  function dispatchSender(data) {
    var b = birds.filter(function (x) {
      return x.type === data.bird && !x.cargo && !x.outgoing &&
             (x.state === "idle" || x.state === "peck" || (x.state === "walk" && !x.dropAt));
    })[0];
    if (b) {
      if (b.seed) { b.seed.taken = false; b.seed = null; }
    } else {
      b = createBird(data.bird, edgePoint());
    }
    b.outgoing = data;
    b.target = { x: MAILBOX_POS.x + rand(-30, 30), y: MAILBOX_POS.y };
    b.state = "flyPickup";
  }

  document.getElementById("btn-send").addEventListener("click", sendLetter);
  document.getElementById("btn-repick").addEventListener("click", function () {
    composeWrite.hidden = true;
    composePick.hidden = false;
  });
  document.getElementById("btn-compose-cancel").addEventListener("click", closeOverlay);
  document.getElementById("btn-compose-close").addEventListener("click", closeOverlay);

  // ---------- 飼料 ----------
  function scatterFeed() {
    if (feedCooldown > 0) { toast("飼料還沒補好，再等 " + Math.ceil(feedCooldown) + " 秒"); return; }
    for (var i = 0; i < 16; i++) {
      var p = ringPoint();
      var el = document.createElement("div");
      el.className = "seed";
      el.style.left = p.x + "px";
      el.style.top = p.y + "px";
      seedLayer.appendChild(el);
      seeds.push({ x: p.x, y: p.y, el: el, life: 25 });
    }
    boostLeft = FEED_BOOST;
    feedCooldown = FEED_COOLDOWN;
    nextSpawn = Math.min(nextSpawn, 0.8);
    feedBtn.classList.add("cooling");
    sfx("feed");
    toast("撒了一把飼料，送信鳥會來得更快");
  }

  function removeSeed(s) {
    var i = seeds.indexOf(s);
    if (i >= 0) seeds.splice(i, 1);
    s.el.style.opacity = 0;
    setTimeout(function () { s.el.remove(); }, 600);
  }

  // ---------- 送信鳥 ----------
  function createBird(type, start) {
    var el = document.createElement("div");
    el.className = "bird " + type;
    el.innerHTML = '<div class="bird-spr"></div><div class="bird-hit"></div>';
    birdLayer.appendChild(el);
    var b = {
      id: ++birdSeq, type: type,
      x: start.x, y: start.y, heading: 0, alt: 1,
      cargo: null, outgoing: null, dropAt: null, target: null, timer: 0, seed: null,
      el: el, spr: el.firstChild, shadowKey: ""
    };
    birds.push(b);
    // 點一下停在地上的鳥：跳一下、叫一聲
    el.lastChild.addEventListener("click", function () {
      el.classList.remove("poked");
      void el.offsetWidth;                 // 讓動畫可以重新播放
      el.classList.add("poked");
      sfx("chirp");
    });
    return b;
  }

  var fetchingLetter = false;  // 正在向 API 要下一封信
  function spawnBird() {
    // 站在鳥台上的通知鳥不算在休息區的數量裡
    var active = birds.filter(function (b) { return b.state !== "leave" && b.perchSlot == null; });

    // 彩蛋：偶爾來的不是送信鳥，而是環頸斑鳩（同時只會有一隻）
    var hasDove = birds.some(function (b) { return b.type === "dove"; });
    if (!hasDove && active.length < MAX_BIRDS && Math.random() < EGG_CHANCE) { spawnDove(); return; }

    if (fetchingLetter || !roomForBird(active)) return;
    fetchingLetter = true;
    nextLetter().then(function (data) {
      fetchingLetter = false;
      if (data) deliverLetter(data);   // null：沒有信可送（都在畫面上或都被收藏了）
    }, function () { fetchingLetter = false; });   // 取信失敗就等下一隻鳥
  }

  // 現在能不能再派一隻送信鳥：先檢查再取信，避免信拿到了卻送不出去
  function roomForBird(active) {
    var waiting = active.filter(function (b) { return b.cargo && b.state !== "flyDeliver" && !b.dropAt; });
    if (letters.length + reserved >= MAX_LETTERS && waiting.length >= 3) return false;   // 收信區滿又有鳥在排隊
    if (active.length < MAX_BIRDS) return true;
    return active.some(function (b) {     // 太擠：要有可以請走的鳥
      return b.type !== "dove" && !b.cargo && (b.state === "idle" || b.state === "peck");
    });
  }

  // 派一隻鳥叼著信飛來
  function deliverLetter(data) {
    var active = birds.filter(function (b) { return b.state !== "leave" && b.perchSlot == null; });
    var waiting = active.filter(function (b) { return b.cargo && b.state !== "flyDeliver" && !b.dropAt; });

    // 休息區太擠：請最早來、已送完信的鳥飛走
    if (active.length >= MAX_BIRDS) {
      var old = active.filter(function (b) {
        return b.type !== "dove" && !b.cargo && (b.state === "idle" || b.state === "peck");
      })[0];
      if (!old) return;
      old.state = "leave";
      old.target = edgePoint();
    }
    // 收信區滿了又已有鳥在排隊，就先不派新的
    var full = letters.length + reserved >= MAX_LETTERS;
    if (full && waiting.length >= 3) return;

    var b = createBird(data.bird, edgePoint());
    b.cargo = data;

    if (!full) {
      reserved++;
      b.dropAt = dropPoint();
      b.target = b.dropAt;
      b.state = "flyDeliver";
    } else {
      b.target = ringPoint();       // 叼著信到休息區等空位
      b.state = "flyRest";
    }
    b.heading = Math.atan2(b.target.y - b.y, b.target.x - b.x) * 180 / Math.PI;
  }

  // 朝目標前進，抵達回傳 true
  function step(b, speed, dt) {
    var dx = b.target.x - b.x, dy = b.target.y - b.y;
    var d = Math.hypot(dx, dy);
    if (d <= speed * dt) { b.x = b.target.x; b.y = b.target.y; return true; }
    b.x += dx / d * speed * dt;
    b.y += dy / d * speed * dt;
    var want = Math.atan2(dy, dx) * 180 / Math.PI;
    var diff = ((want - b.heading + 540) % 360) - 180;
    b.heading += diff * Math.min(1, dt * 10);
    return false;
  }

  // 飛向目標，接近時降低高度
  function fly(b, dt) {
    var d = dist(b.x, b.y, b.target.x, b.target.y);
    var wantAlt = Math.min(1, d / 240);
    b.alt += (wantAlt - b.alt) * Math.min(1, dt * 8);
    return step(b, FLY_SPEED * (0.4 + 0.6 * wantAlt), dt);
  }

  function goIdle(b) {
    b.state = "idle";
    b.timer = rand(1, 3);
  }

  function decide(b) {
    // 有飼料就優先去吃
    if (seeds.length && Math.random() < 0.7) {
      var best = null, bd = Infinity;
      seeds.forEach(function (s) {
        var d = dist(b.x, b.y, s.x, s.y);
        if (!s.taken && d < bd) { bd = d; best = s; }
      });
      if (best && bd < 500) {
        best.taken = true;
        b.seed = best;
        b.target = { x: best.x, y: best.y };
        b.state = "walk";
        return;
      }
    }
    var r = Math.random();
    if (r < 0.45) {
      b.target = ringPointNear(b.x, b.y, 300);
      b.state = "walk";
    } else if (r < 0.75) {
      b.state = "peck";
      b.timer = rand(0.9, 1.8);
    } else {
      goIdle(b);
    }
  }

  function updateBird(b, dt) {
    switch (b.state) {
      case "flyDeliver":
        if (fly(b, dt)) { b.alt = 0; b.state = "drop"; b.timer = 0.7; }
        break;

      case "flyRest":
        if (fly(b, dt)) { b.alt = 0; goIdle(b); }
        break;

      // 通知：飛到郵箱旁的鳥台，面向下方站著，直到使用者去看「我寄出的信」
      case "flyPerch":
        if (fly(b, dt)) { b.alt = 0; b.heading = 90; b.state = "perch"; }
        break;
      case "perch":
        break;

      // 寄信：飛到郵箱前 → 叼起信 → 飛出畫面
      case "flyPickup":
        if (fly(b, dt)) { b.alt = 0; b.state = "pickup"; b.timer = 0.8; }
        break;

      case "pickup":
        b.timer -= dt;
        if (b.timer <= 0) {
          if (b.fetch) {           // 按讚／回信：把地上那封信叼走，收信區空出位置
            var idx = letters.indexOf(b.fetch);
            if (idx >= 0) letters.splice(idx, 1);
            b.fetch.el.remove();
            b.fetch = null;
          }
          b.carryOut = true;
          b.state = "leave";
          b.target = edgePoint();
        }
        break;

      case "drop":
        b.timer -= dt;
        if (b.timer <= 0) {
          addLetter(b.cargo, b.x, b.y);
          reserved--;
          b.cargo = null;
          b.dropAt = null;
          b.target = ringPointNear(b.x, b.y);
          b.state = "walk";
        }
        break;

      case "walk":
        if (step(b, WALK_SPEED, dt)) {
          if (b.dropAt) { b.state = "drop"; b.timer = 0.7; }
          else if (b.seed) { b.state = "peck"; b.timer = rand(1, 1.6); }
          else goIdle(b);
        }
        break;

      case "peck":
        b.timer -= dt;
        if (b.timer <= 0) {
          if (b.seed) { removeSeed(b.seed); b.seed = null; }
          goIdle(b);
        }
        break;

      case "idle":
        // 叼著信在等：收信區一有空位就走過去放
        if (b.cargo && letters.length + reserved < MAX_LETTERS) {
          reserved++;
          b.dropAt = dropPoint();
          b.target = b.dropAt;
          b.state = "walk";
          break;
        }
        if (b.type === "dove") {
          if (b.layIn != null) {
            b.layIn -= dt;
            if (b.layIn <= 0) { b.layIn = null; b.state = "lay"; b.timer = 1.8; break; }
          } else {
            b.stay -= dt;
            if (b.stay <= 0) { b.state = "leave"; b.target = edgePoint(); break; }
          }
        }
        b.timer -= dt;
        if (b.timer <= 0) decide(b);
        break;

      // 斑鳩下蛋：原地抖一抖，留下一顆蛋後走開
      case "lay":
        b.timer -= dt;
        if (b.timer <= 0) {
          addEgg(b.x, b.y);
          b.stay = 14;
          b.target = ringPointNear(b.x, b.y, 300);
          b.state = "walk";
        }
        break;

      case "leave":
        b.alt += (1 - b.alt) * Math.min(1, dt * 4);
        if (step(b, FLY_SPEED, dt)) {
          b.el.remove();
          birds.splice(birds.indexOf(b), 1);
          return;
        }
        break;
    }
    render(b);
  }

  // 依狀態挑圖集裡的一格：橫向是 8 個方向，直向是姿勢
  function render(b) {
    var flying = b.alt > 0.06, t = performance.now();
    var dir = ((Math.round(b.heading / 45) % 8) + 8) % 8;
    var carry = !!b.cargo || !!b.carryOut;
    var row;
    if (flying) row = (carry ? 5 : 2) + Math.floor(t / 110) % 2;          // 拍翅膀
    else if (b.state === "peck" && !carry) row = Math.floor(t / 170) % 2;  // 啄食：站立與低頭交替
    else row = carry ? 4 : 0;

    b.el.style.transform = "translate(" + Math.round(b.x) + "px," + Math.round(b.y) + "px)";
    b.el.style.zIndex = b.perchSlot != null ? 70 : flying ? 50 : 10;
    b.el.classList.toggle("flying", flying);
    b.spr.style.backgroundPosition = (-dir * SPRITE) + "px " + (-row * SPRITE) + "px";

    // 飛得越高，影子離身體越遠、越淡 → 立體感（位移取 3 的倍數，對齊像素格）
    var sx = 3 + Math.round(b.alt * 8) * 3, sy = 6 + Math.round(b.alt * 12) * 3;
    var key = sx + "," + sy;
    if (key !== b.shadowKey) {
      b.shadowKey = key;
      b.spr.style.filter = "drop-shadow(" + sx + "px " + sy + "px 0 rgba(96,66,24," + (0.3 - b.alt * 0.12).toFixed(2) + "))";
    }
    b.el.classList.toggle("walking", b.state === "walk");
    b.el.classList.toggle("laying", b.state === "lay");
  }

  // ---------- 主迴圈 ----------
  var last = performance.now();
  var ageTick = 0;
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    nextSpawn -= dt;
    if (nextSpawn <= 0) {
      spawnBird();
      var gap = boostLeft > 0 ? FEED_GAP : ARRIVE_GAP;
      nextSpawn = rand(gap[0], gap[1]);
    }
    if (boostLeft > 0) boostLeft -= dt;
    if (feedCooldown > 0) {
      feedCooldown -= dt;
      if (feedCooldown <= 0) feedBtn.classList.remove("cooling");
    }

    for (var i = seeds.length - 1; i >= 0; i--) {
      seeds[i].life -= dt;
      if (seeds[i].life <= 0 && !seeds[i].taken) removeSeed(seeds[i]);
    }
    for (var j = birds.length - 1; j >= 0; j--) updateBird(birds[j], dt);

    ageTick -= dt;
    if (ageTick <= 0) { ageTick = 0.25; ageLetters(); }

    updateLeaves(dt);

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------- 工具按鈕 ----------
  document.getElementById("tool-broom").addEventListener("click", sweepAll);
  feedBtn.addEventListener("click", scatterFeed);
  mailboxBtn.addEventListener("click", showMailMenu);

  var muteBtn = document.getElementById("btn-mute");
  function showMute() { muteBtn.textContent = "音效：" + (muted ? "關" : "開"); }
  muteBtn.addEventListener("click", function () {
    muted = !muted;
    prefs.set("mute", muted);
    showMute();
    if (!muted) { wakeAudio(); sfx("open"); }
  });
  showMute();
  Array.prototype.forEach.call(document.querySelectorAll(".bird-card"), function (card) {
    card.addEventListener("click", function () { pickBird(card.dataset.bird); });
  });
  document.getElementById("tool-store").addEventListener("click", showStore);
})();
