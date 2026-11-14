// 假資料：模擬「其他人寄出的信」。之後接資料庫時，換成從後端取得即可。
// bird: sparrow 麻雀(純文字) / pigeon 鴿子(文字+圖片) / owl 貓頭鷹(大型檔案)
window.MOCK_LETTERS = [
  { id: 1,  bird: "sparrow", author: "阿哲",   title: "今天的晚霞好美",       content: "下班路上抬頭看到整片粉橘色的天空，站在路邊看了五分鐘。" },
  { id: 2,  bird: "sparrow", author: "小米",   title: "有人也睡不著嗎",       content: "凌晨兩點，腦袋還在轉。來聊聊天吧。" },
  { id: 3,  bird: "pigeon",  author: "Yuki",   title: "我家貓咪的睡姿",       content: "牠到底是怎麼把自己折成這樣的？（附圖）" },
  { id: 4,  bird: "sparrow", author: "老王",   title: "推薦一家巷口麵店",     content: "乾麵加滷蛋，五十塊，吃了十年還是一樣好吃。" },
  { id: 5,  bird: "owl",     author: "Momo",   title: "環島照片全集",         content: "十四天的照片與影片打包好了，歡迎自取。" },
  { id: 6,  bird: "pigeon",  author: "阿芳",   title: "陽台的番茄結果了",     content: "種了三個月，終於紅了第一顆！" },
  { id: 7,  bird: "sparrow", author: "匿名",   title: "給一年後的自己",       content: "希望那時候的你，已經不再害怕開口了。" },
  { id: 8,  bird: "sparrow", author: "Ken",    title: "第一次寫程式就上手？", content: "騙你的，我卡在分號卡了一個晚上。" },
  { id: 9,  bird: "pigeon",  author: "小安",   title: "手繪明信片交換",       content: "畫了一張海邊的明信片，想跟人交換。" },
  { id: 10, bird: "owl",     author: "大雄",   title: "自製桌遊規則書",       content: "跟朋友做了一年的桌遊，完整規則書與卡牌檔案都在這。" },
  { id: 11, bird: "sparrow", author: "Lily",   title: "下雨天的味道",         content: "有人知道那個味道叫什麼嗎？聞到就覺得安心。" },
  { id: 12, bird: "pigeon",  author: "阿凱",   title: "今天的便當",           content: "自己做的滷肉飯，賣相普通但很下飯。" },
  { id: 13, bird: "sparrow", author: "匿名",   title: "謝謝那位讓座的人",     content: "你不知道那天我有多累，謝謝你。" },
  { id: 14, bird: "sparrow", author: "小綠",   title: "一個冷笑話",           content: "為什麼鳥不用手機？因為牠們有推特。" },
  { id: 15, bird: "owl",     author: "Nana",   title: "鋼琴演奏錄音",         content: "練了半年的曲子，錄了完整版，請多指教。" },
  { id: 16, bird: "pigeon",  author: "阿土",   title: "山上的雲海",           content: "凌晨三點出發，值得了。" },
  { id: 17, bird: "sparrow", author: "Bob",    title: "求推薦好看的小說",     content: "最近書荒，什麼類型都可以。" },
  { id: 18, bird: "sparrow", author: "小雨",   title: "搬到新城市的第一天",   content: "什麼都不熟，但樓下的早餐店阿姨對我笑了。" },
  { id: 19, bird: "pigeon",  author: "Miko",   title: "我畫的斑鳩",           content: "窗台上那隻斑鳩每天都來，畫給牠的。" },
  { id: 20, bird: "sparrow", author: "阿國",   title: "今天也辛苦了",         content: "不管你是誰，今天也辛苦了。" }
];
