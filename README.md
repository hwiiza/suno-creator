# Suno Creator

[Suno](https://suno.com) の作成画面にパネルを表示し、**JSON から曲をまとめて生成**できる Tampermonkey ユーザースクリプトです。曲データ（タイトル・スタイル・歌詞・ボーカル等）を JSON で用意し、リストから確認・編集しながら 1曲ずつ／連続で生成できます。

## インストール

1. ブラウザに [Tampermonkey](https://www.tampermonkey.net/) を入れる
2. **[suno.user.js をインストール](https://raw.githubusercontent.com/hwiiza/suno-userscript/main/suno.user.js)** を開く → インストール画面で許可
3. [suno.com/create](https://suno.com/create) を開く → 画面右端のタブ **「♪ Suno Creator」** をクリックでパネルが開きます

## 使い方

1. **JSON を読み込む** — 「ファイル読込」ボタン、または JSON ファイルをパネルに**ドラッグ&ドロップ**
2. **曲リスト**から曲を選ぶと、右に**詳細**（タイトル/スタイル/歌詞/ボーカル/Weirdness/Style Influence など）が表示され、その場で編集できます
3. **「この曲を生成」**（1曲）または **「連続生成（全部）」**（リスト全体）で投入

連続生成は既定で **60秒間隔**で投入します（⚙設定で変更可）。Suno の同時生成枠（最大10曲）を超える分は、枠が空くまで待機して順次投入します。

## JSON 形式

```json
{
  "title": "Morning Light",
  "style": "uplifting trance, euphoric female vocal, 138bpm",
  "lyrics": "[Verse]\n...\n[Chorus]\n...",
  "instrumental": false,
  "vocal": "female",
  "weirdness": 30,
  "styleInfluence": 70,
  "exclude": "rock, metal"
}
```

複数曲は上記オブジェクトの**配列**で渡します。

| キー | 説明 |
|---|---|
| `title` | 曲名（任意・空なら自動命名） |
| `style` | スタイル/ジャンル（カンマ区切り） |
| `lyrics` | 歌詞（`\n` 改行・`[Verse]` 等のタグ可。`instrumental` 時は不要） |
| `instrumental` | 歌なしなら `true` |
| `vocal` | `male` / `female` / `auto` |
| `weirdness` | 0–100 |
| `styleInfluence` | 0–100 |
| `exclude` | 除外スタイル（任意） |

`style` / `lyrics` / `instrumental` のいずれかは必須です。

## メモ

- ログイン済みのブラウザでそのまま動作します（追加の認証設定は不要）。
- Suno の UI 変更により動作しなくなることがあります。

## ライセンス

MIT
