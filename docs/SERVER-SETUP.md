# サーバー設定・起動・使用方法

Cursor CLI API Proxy をサーバー（例: LNVPS）に導入し、起動して利用するまでの手順をまとめる。

---

## 1. サーバーの設定方法

### 1.1 前提条件

| 項目 | 内容 |
|------|------|
| OS | Linux（Ubuntu / Debian 等。本手順は Ubuntu を想定） |
| Node.js | 20 以上（LTS 推奨） |
| Cursor | Pro または Business 契約 |
| ネットワーク | クライアント（Cursor IDE 等）から当該サーバーのポートへ到達可能であること |

### 1.2 Node.js のインストール

```bash
# Ubuntu の場合（既存の場合はスキップ可）
sudo apt update
sudo apt install -y nodejs npm
node -v   # v20.x 以上を確認
npm -v
```

### 1.3 Cursor Agent CLI のインストール

```bash
curl https://cursor.com/install -fsS | bash
```

インストール後、シェルを読み直すか `source ~/.bashrc` を実行し、`agent` コマンドが使えることを確認する。

```bash
agent --version
```

### 1.4 認証の設定（どちらか一方）

**方法 A: ブラウザログイン（推奨・セッション利用）**

プロキシを動かすサーバー上で、一度だけ実行する。

```bash
agent login
```

ブラウザが開く場合は、そのマシンでブラウザが使える環境が必要。  
ヘッドレスサーバーの場合は、別マシンで `agent login` したうえで、そのマシンの Cursor 認証情報が保存されている設定ファイルをサーバーにコピーする運用も可能（Cursor CLI のドキュメントで保存場所を確認すること）。

認証状態の確認:

```bash
agent status
```

**方法 B: API キー**

Cursor ダッシュボードで API キーを発行し、環境変数で渡す。

- 発行: Cursor ダッシュボード > Integrations > User API Keys
- 起動時に `CURSOR_API_KEY` を設定（後述の「起動方法」を参照）

### 1.5 プロキシのビルド

リポジトリを clone したディレクトリで:

```bash
cd /path/to/cursor-cli-api-proxy
npm install
npm run build
```

`dist/` 以下に JavaScript が出力されていれば成功。

### 1.6 ポートとファイアウォール

- デフォルトでプロキシは **3457** 番ポートで待ち受ける。
- クライアントが別マシンの場合、そのポートを開放する。

例（ufw）:

```bash
sudo ufw allow 3457/tcp
sudo ufw status
```

---

## 2. 起動方法

### 2.1 手動起動（フォアグラウンド）

```bash
cd /path/to/cursor-cli-api-proxy
npm start
```

または:

```bash
node dist/server/standalone.js
```

- デフォルトで `0.0.0.0:3457` でリッスンする（他ホストからアクセス可能）。
- ポートを変える場合: 第 1 引数で指定する。

```bash
node dist/server/standalone.js 8080
```

- CLI の存在チェックや認証チェックをスキップしたい場合（例: ヘルスチェックだけ先に試す）:

```bash
node dist/server/standalone.js 3457 --skip-cli-check
```

この場合は起動時には `agent` や認証を検証せず、チャット利用時に失敗する可能性がある。

### 2.2 バックグラウンド起動（nohup）

```bash
cd /path/to/cursor-cli-api-proxy
nohup node dist/server/standalone.js 3457 > proxy.log 2>&1 &
echo $!   # PID を控える。終了時は kill <PID>
```

### 2.3 systemd で常時起動

サービスファイルの例:

```ini
# /etc/systemd/system/cursor-cli-proxy.service
[Unit]
Description=Cursor CLI API Proxy
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/cursor-cli-api-proxy
ExecStart=/usr/bin/node dist/server/standalone.js 3457
Restart=on-failure
RestartSec=5
# セッション認証を使う場合はそのまま。API キーを使う場合:
# Environment=CURSOR_API_KEY=your_key_here

[Install]
WantedBy=multi-user.target
```

有効化と起動:

```bash
sudo systemctl daemon-reload
sudo systemctl enable cursor-cli-proxy
sudo systemctl start cursor-cli-proxy
sudo systemctl status cursor-cli-proxy
```

ログ確認:

```bash
journalctl -u cursor-cli-proxy -f
```

---

## 3. 使用方法

### 3.1 動作確認（curl）

サーバー上、またはクライアントから「サーバーの IP:3457」に向けて実行する。

```bash
# ヘルスチェック
curl http://localhost:3457/health

# モデル一覧
curl http://localhost:3457/v1/models

# チャット（非ストリーミング）
curl -X POST http://localhost:3457/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cursor-default",
    "messages": [{"role": "user", "content": "Hello, reply in one word."}]
  }'

# チャット（ストリーミング）
curl -N -X POST http://localhost:3457/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cursor-default",
    "messages": [{"role": "user", "content": "Count from 1 to 3."}],
    "stream": true
  }'
```

リモートから叩く場合は `localhost` をサーバーの IP または FQDN に置き換える。

### 3.2 Cursor IDE でカスタムモデルとして使う

1. Cursor の設定を開く（Settings > Models または該当するモデル設定画面）。
2. カスタムモデルを追加し、次を設定する。

| 項目 | 値 |
|------|-----|
| 名前（表示用） | 任意（例: Cursor Proxy） |
| baseUrl | `http://<サーバーIPまたはFQDN>:3457/v1` |
| apiKey | 任意の文字列（プロキシは未使用。空や "not-needed" で可） |
| モデル ID | `cursor-default` または `cursor-opus` / `cursor-sonnet` / `cursor-haiku` |

設定例（JSON）:

```json
{
  "models": {
    "cursor-proxy": {
      "name": "Cursor (Proxy)",
      "apiKey": "not-needed",
      "baseUrl": "http://192.168.1.100:3457/v1",
      "contextLength": 200000,
      "temperature": 0.7
    }
  }
}
```

モデル選択で上記を選べば、そのプロキシ経由で Cursor のサブスクが利用される。

### 3.3 他クライアント（OpenAI 互換）

OpenAI 形式の API を話すクライアント（Continue.dev、自前スクリプトなど）では、次のようにプロキシを指定する。

- **Base URL**: `http://<サーバー>:3457/v1`
- **API Key**: 任意（プロキシ側では参照しない）
- **model**: `cursor-default` / `cursor-opus` / `cursor-sonnet` / `cursor-haiku`

例（Python）:

```python
from openai import OpenAI
client = OpenAI(
    base_url="http://your-server:3457/v1",
    api_key="not-needed"
)
r = client.chat.completions.create(
    model="cursor-default",
    messages=[{"role": "user", "content": "Hello"}]
)
print(r.choices[0].message.content)
```

### 3.4 利用可能なモデル ID

| model | 説明 |
|-------|------|
| cursor-default | デフォルトモデル |
| cursor-opus | Opus 系 |
| cursor-sonnet | Sonnet 系 |
| cursor-haiku | Haiku 系 |

実際のマッピングは Cursor Agent CLI の `--model` に依存する。

---

## 4. トラブルシューティング

| 現象 | 確認・対処 |
|------|-------------|
| 起動時に "Cursor Agent CLI not found" | `agent --version` が通るか確認。PATH に含まれているか、インストール手順をやり直す。 |
| 起動時に "Not authenticated" | `agent status` でログイン状態を確認。未ログインなら `agent login` または `CURSOR_API_KEY` を設定。 |
| 接続できない | ファイアウォールで 3457 を開放しているか、クライアントから `curl http://<サーバー>:3457/health` が通るか確認。 |
| チャットが返ってこない / タイムアウト | `agent` が重い処理で止まっていないか確認。ログや `agent status` でエラーが出ていないか見る。 |
| ストリーミングがすぐ終わる | クライアント側でバッファリングを切る（curl なら `-N`）。 |

デバッグ時は環境変数 `DEBUG=1` を付けて起動すると、リクエストログが標準エラーに出す。

```bash
DEBUG=1 node dist/server/standalone.js 3457
```

---

## 5. まとめ

1. **設定**: Node.js と Cursor Agent CLI を入れ、認証（`agent login` または `CURSOR_API_KEY`）とビルドを行う。
2. **起動**: `npm start` または `node dist/server/standalone.js [port]`。本番では systemd 等で常時起動するとよい。
3. **利用**: `/health` と `/v1/models` で確認し、Cursor IDE や他クライアントでは baseUrl に `http://<サーバー>:3457/v1`、model に `cursor-default` 等を指定する。
