# 簡繁轉換器＋兩岸用語詞彙庫

純 HTML＋JavaScript 的簡繁轉換工具，不需要後端或資料庫。

- 字形轉換使用 [OpenCC](https://github.com/nk2028/opencc-js)，全部在瀏覽器內完成。
- 兩岸用語詞彙庫放在 `data/` 資料夾的 JSON 檔，任何人都可以提交 Pull Request 擴充。
- 轉換時會標出三種用語：
  - **一般用語**：例如 充電寶 → 行動電源，「簡→繁＋台灣詞彙」模式會直接替換。
  - **評價意涵**：例如 顏值、情緒價值、下沉市場，只標示並附上意涵說明，不替換。
  - **同字異義**：例如 窩心、愛人、研究所，只標示提醒。

## 專案結構

```
index.html                 頁面
style.css                  樣式
app.js                     轉換與詞彙比對邏輯
config.js                  你的 GitHub repo 名稱（用來產生編輯連結）
data/index.json            要載入的詞彙檔清單
data/<分類>.json           每個分類一個檔案
scripts/validate.mjs       檢查詞彙檔格式
.github/workflows/         PR 自動檢查
```

## 上線（GitHub Pages）

1. 建立 repo，把整個資料夾推上去。
2. 編輯 `config.js`，把 `repo` 改成 `你的帳號/repo名稱`。
3. 到 repo 的 **Settings → Pages**，Source 選 **Deploy from a branch**，分支選 `main`、資料夾選 `/ (root)`。
4. 約一分鐘後網址會出現在同一頁，通常是 `https://你的帳號.github.io/repo名稱/`。

之後每次合併 PR，網站就會自動更新。

## 本機預覽

頁面用 `fetch` 讀 JSON，直接雙擊 `index.html` 會讀不到詞彙庫，請開一個本機伺服器：

```bash
python3 -m http.server 8000
# 然後打開 http://localhost:8000
```

## 貢獻詞彙

請看 [CONTRIBUTING.md](CONTRIBUTING.md)。網站的「詞彙庫」分頁也有表單，可以產生要貼上的 JSON，並直接打開 GitHub 的編輯頁。

## 詞彙庫來源（v1.0.0）

第一版詞彙整理自〈兩岸用語差異總整理〉，起點是 Threads 上 @sharon_is_thinking 分享志祺七七訪問陽交大萬宗綸副教授的串文與留言，再補上網路資料與常見的兩岸用語對照。

### 收錄時的立場

- **不少詞原本是自嘲或諷刺**：屌絲、打工人、社畜、韭菜多半是在抱怨處境；普信男是女性諷刺男性過度自信。標為「評價意涵」是說明它帶有分級或物化的框架，不等於使用者在宣揚階級。
- **台灣自己也有類似的詞**：CP值、魯蛇／溫拿、人生勝利組、天龍人、草莓族、恐龍妹、工具人。評分與分類的語言不只來自單一方向。
- **字面推論只是個人解讀**：「小夥伴暗示對方較小」「默認暗示沒發言權」「學霸隱含反知識份子」等說法來自留言，不是語言學定論，備註裡都有註明。
- **使用者未必在乎來源**：東海大學一份學生調查發現，多數受訪者認為用詞與政治無關、屬個人自由；因身分認同刻意不用中國用語的約一成。
- **影片的核心觀點**：重點不在詞從哪裡來，而是某種評價方式一旦變得「好說、常說」，人們就更習慣用那套標準看人。

### 參考資料

- [聯合新聞網：閨蜜、顏值都是中國用語](https://udn.com/news/story/120912/7955289)
- [Sixth Tone：Young Chinese Buy to Feel Better](https://www.sixthtone.com/news/1017590)
- [Sixth Tone：Young Chinese Bemoan Rat Race](https://www.sixthtone.com/news/1006336/)
- [Language Log：Chinese terms of address for single ladies](https://languagelog.ldc.upenn.edu/nll/?p=4116)
- [Yoyo Chinese：Dating Scene in China](https://www.yoyochinese.com/blog/learn-chinese-love-dating-in-china-single-dog-leftover-woman-marriage)
- [港大詞彙表：高富帥](https://www.interpreting.hku.hk/glossary/?p=49990)
- [Eye Shenzhen：下沉市场](https://www.eyeshenzhen.com/content/2019-09/30/content_22511676.htm)
- [Eye Shenzhen：割韭菜](https://www.eyeshenzhen.com/content/2018-09/05/content_21075239.htm)
- [新頭殼：中國特殊用語](https://newtalk.tw/news/view/2024-12-11/948495)
- [東海大學：中國用語使用調查](https://nihongo.thu.edu.tw/research/wp-content/uploads/郭O瑩-說明文.pdf)
- [關鍵評論網：支語警察](https://www.thenewslens.com/article/242817)
- [國立國語院：兩岸常用詞典介紹](https://www.korean.go.kr/nkview/nklife/2018_3/28_0310.pdf)
- [ToneOZ：普通話與國語語音差異](https://toneoz.com/blog/?p=309)
