# Suno Creator (userscript)

Sunoの作成画面に小さなパネルを出し、**JSONを貼る/ファイル選択して曲を生成・連続生成**するTampermonkeyユーザースクリプト。

## インストール

1. ブラウザに [Tampermonkey](https://www.tampermonkey.net/) を入れる
2. 下のリンクを開く → Tampermonkeyのインストール画面が出る → インストール
   **[suno.user.js をインストール](https://raw.githubusercontent.com/hwiiza/suno-userscript/main/suno.user.js)**
3. `https://suno.com/create` を開くと右下にパネルが出ます

## 使い方

- **ファイル読込** で `.json` を選ぶ（または直接貼り付け）
- **生成 / 連続生成** を押す（配列なら順に投入・最大5曲）

### JSON形式

```json
{
  "title": "Morning Light",
  "style": "uplifting trance, euphoric female vocal, 138bpm",
  "lyrics": "[Verse]\n...\n[Chorus]\n...",
  "instrumental": false,
  "vocal": "female"
}
```

複数曲は上記オブジェクトの**配列**。`style` / `lyrics` / `instrumental` のいずれか必須。`vocal` は `male` / `female` / `auto`。

## 対応状況

| 項目 | 状態 |
|---|---|
| Title / Style / Lyrics / Instrumental | ✅ |
| Vocal Gender | ✅ |
| 連続生成（最大5曲） | ✅ |
| Weirdness / Style Influence | ⚠ 未対応（既定値のまま） |
| ダウンロード | 未実装 |

## メモ

- ログイン済みのブラウザでそのまま動作します（追加の認証設定は不要）。
- SunoのUI変更で動かなくなることがあります。

## ライセンス

MIT
