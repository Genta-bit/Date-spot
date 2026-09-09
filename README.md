# ふたりのデートルーレット 🎯

行きたいデート先をふたりで書き溜めて、迷ったら**ルーレット**で行き先を決めるアプリ。
**日常 / 近場 / 遠出** の3カテゴリーに分けて管理できます。

- 各カテゴリーに行きたい場所をどんどん追加（追加した人の名前も表示）
- 「まわす」でそのカテゴリーからランダムに1つ決定（紙吹雪つき）
- 「全カテゴリーからまわす」で横断抽選も可能
- ✓（行った！）／✕（削除）。行った場所はルーレット対象外に
- 「前回のルーレット」をふたりで共有
- ダーク/ライト対応・スマホ最適化

---

## セットアップ（別々のスマホで同期する）

### 1. GitHub Pages を有効にする

1. この GitHub リポジトリの **Settings → Pages** を開く
2. **Source** を「Deploy from a branch」にする
3. Branch を **`main`** ／ フォルダを **`/ (root)`** にして **Save**
4. 数分後、`https://<ユーザー名>.github.io/Date-spot/` で公開されます

この時点でアプリは動きますが、データは**各端末に別々に保存**されます。
ふたりで同じリストを見るには次の Firebase 設定が必要です。

### 2. Firebase（無料）で同期を有効にする

1. https://console.firebase.google.com/ を Google アカウントで開く
2. **プロジェクトを作成**（名前は何でも可。Google アナリティクスはオフでOK）
3. 左メニュー **構築 → Realtime Database → データベースを作成**
   - ロケーションはどこでも可
   - セキュリティルールは **「テストモードで開始」** を選択（あとで下記に差し替え）
4. プロジェクト設定（歯車アイコン）→ **全般** タブ下部 → **アプリを追加 → ウェブ（`</>`）**
   - アプリ名を入力して登録
   - 表示される `firebaseConfig` の中身をコピー
5. このリポジトリの **`config.js`** を開き、コピーした値を貼り付ける：

   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "xxxx.firebaseapp.com",
     databaseURL: "https://xxxx-default-rtdb.firebaseio.com",
     projectId: "xxxx",
     storageBucket: "xxxx.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123...:web:abc..."
   };
   ```

   > `databaseURL` が `firebaseConfig` に無い場合は、Realtime Database の
   > 画面上部に表示される URL（`https://～.firebaseio.com`）を使ってください。

6. `config.js` を commit & push すると、GitHub Pages に反映され「**ふたりで同期中**」になります

### 3. データベースのルール（推奨）

テストモードは約30日で書き込めなくなります。Realtime Database の **ルール** タブを開き、
以下に差し替えて **公開**：

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

これは「URL を知っていれば誰でも読み書きできる」設定です（保存されるのはデート先の
リストだけなので実用上は問題になりにくいですが、気になる場合は Firebase Authentication
などでの保護を検討してください）。

---

## ローカルで動かす

ただ開くだけ：`index.html` をブラウザで開く（ES Modules を使うため、
`file://` ではなく簡易サーバー推奨）。

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | 画面のマークアップ |
| `styles.css` | スタイル（テーマ変数・レイアウト） |
| `config.js` | Firebase の設定（**ここだけ編集**） |
| `app.js` | アプリ本体（状態管理・ルーレット・同期） |
