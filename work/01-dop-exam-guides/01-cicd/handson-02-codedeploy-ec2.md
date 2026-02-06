# ハンズオン 02: CodeDeploy による EC2 デプロイ

## 概要

このハンズオンでは、AWS CodeDeploy を使用して EC2 インスタンスにアプリケーションをデプロイします。In-Place デプロイと Blue/Green デプロイの違いを理解します。

**所要時間**: 約45分
**コスト**: 約$1.00（EC2 t2.micro 使用、すぐ削除すれば最小限）

## 学習目標

- CodeDeploy エージェントのインストールと設定
- appspec.yml の構造を理解する
- In-Place デプロイの実行
- デプロイライフサイクルイベントの理解

---

## 前提条件

- AWS アカウント
- 管理者権限を持つ IAM ユーザー
- ハンズオン 01 の完了（推奨）

---

## Step 1: IAM ロールの作成

### 1.1 EC2 用 IAM ロールの作成

1. IAM コンソールを開く
2. 左メニューから **ロール** をクリック
3. **ロールを作成** をクリック

| 項目 | 値 |
|------|-----|
| 信頼されたエンティティタイプ | AWS のサービス |
| ユースケース | EC2 |

4. **次へ** をクリック
5. 以下のポリシーを検索して追加:
   - `AmazonEC2RoleforAWSCodeDeploy`
   - `AmazonSSMManagedInstanceCore`

6. **次へ** をクリック
7. ロール名: `EC2-CodeDeploy-Role`
8. **ロールを作成** をクリック

### 1.2 CodeDeploy 用 IAM ロールの作成

1. **ロールを作成** をクリック

| 項目 | 値 |
|------|-----|
| 信頼されたエンティティタイプ | AWS のサービス |
| ユースケース | CodeDeploy |

2. **次へ** をクリック
3. `AWSCodeDeployRole` が自動選択されていることを確認
4. **次へ** をクリック
5. ロール名: `CodeDeploy-Service-Role`
6. **ロールを作成** をクリック

---

## Step 2: EC2 インスタンスの起動

### 2.1 EC2 コンソールを開く

1. 検索バーに「EC2」と入力
2. **EC2** をクリック
3. **インスタンスを起動** をクリック

### 2.2 インスタンス設定

| セクション | 項目 | 値 |
|-----------|------|-----|
| 名前 | Name | `dop-handson-web` |
| AMI | Amazon マシンイメージ | Amazon Linux 2023 AMI |
| インスタンスタイプ | タイプ | t2.micro |
| キーペア | キーペア | 新しいキーペアを作成（または既存を使用） |

### 2.3 ネットワーク設定

**編集** をクリックして以下を設定:

| 項目 | 値 |
|------|-----|
| VPC | デフォルト VPC |
| サブネット | パブリックサブネット |
| パブリック IP の自動割り当て | 有効化 |
| セキュリティグループ | 新規作成 |
| セキュリティグループ名 | `dop-handson-sg` |

**インバウンドルール**:

| タイプ | ポート | ソース |
|--------|--------|--------|
| HTTP | 80 | 0.0.0.0/0 |
| SSH | 22 | マイ IP |

### 2.4 高度な詳細

**IAM インスタンスプロファイル**: `EC2-CodeDeploy-Role`

**ユーザーデータ** に以下を入力:

```bash
#!/bin/bash
yum update -y
yum install -y ruby wget httpd

# CodeDeploy エージェントのインストール
cd /home/ec2-user
wget https://aws-codedeploy-ap-northeast-1.s3.ap-northeast-1.amazonaws.com/latest/install
chmod +x ./install
./install auto

# Apache の起動
systemctl start httpd
systemctl enable httpd

# 初期ページ作成
echo "<h1>Initial Page - Before CodeDeploy</h1>" > /var/www/html/index.html
```

### 2.5 タグの追加

**タグを追加** をクリック:

| キー | 値 |
|------|-----|
| Environment | `dop-handson` |

### 2.6 インスタンス起動

**インスタンスを起動** をクリック

### 2.7 起動確認

1. インスタンス一覧で `dop-handson-web` を選択
2. **ステータス** が「実行中」になるまで待つ（約2分）
3. **パブリック IPv4 アドレス** をコピー
4. ブラウザで `http://{パブリックIP}` にアクセス
5. 「Initial Page - Before CodeDeploy」が表示されれば成功

---

## Step 3: S3 にデプロイパッケージをアップロード

### 3.1 ローカルでデプロイパッケージを作成

以下のファイル構造を作成:

```
dop-handson-app/
├── appspec.yml
├── index.html
└── scripts/
    ├── before_install.sh
    ├── after_install.sh
    └── application_start.sh
```

### 3.2 各ファイルの内容

**appspec.yml**:
```yaml
version: 0.0
os: linux
files:
  - source: /index.html
    destination: /var/www/html/
hooks:
  BeforeInstall:
    - location: scripts/before_install.sh
      timeout: 300
      runas: root
  AfterInstall:
    - location: scripts/after_install.sh
      timeout: 300
      runas: root
  ApplicationStart:
    - location: scripts/application_start.sh
      timeout: 300
      runas: root
```

**index.html**:
```html
<!DOCTYPE html>
<html>
<head>
    <title>CodeDeploy Demo</title>
</head>
<body>
    <h1>Deployed by CodeDeploy!</h1>
    <p>Version: 1.0.0</p>
    <p>Deployed at: __DEPLOY_TIME__</p>
</body>
</html>
```

**scripts/before_install.sh**:
```bash
#!/bin/bash
echo "BeforeInstall: Stopping httpd..."
systemctl stop httpd || true
```

**scripts/after_install.sh**:
```bash
#!/bin/bash
echo "AfterInstall: Setting permissions..."
chmod 644 /var/www/html/index.html
# デプロイ時刻を埋め込み
sed -i "s/__DEPLOY_TIME__/$(date)/" /var/www/html/index.html
```

**scripts/application_start.sh**:
```bash
#!/bin/bash
echo "ApplicationStart: Starting httpd..."
systemctl start httpd
```

### 3.3 S3 コンソールでバケット作成

1. S3 コンソールを開く
2. **バケットを作成** をクリック

| 項目 | 値 |
|------|-----|
| バケット名 | `dop-handson-codedeploy-{アカウントID}` |
| リージョン | ap-northeast-1 |

3. **バケットを作成** をクリック

### 3.4 ファイルをアップロード

1. 作成したバケットを開く
2. **アップロード** をクリック
3. 上記のファイル構造を ZIP 圧縮して `app-v1.zip` としてアップロード

**または、AWS CloudShell を使用**:

```bash
# CloudShell で実行
mkdir -p dop-handson-app/scripts
cd dop-handson-app

# appspec.yml 作成
cat > appspec.yml << 'EOF'
version: 0.0
os: linux
files:
  - source: /index.html
    destination: /var/www/html/
hooks:
  BeforeInstall:
    - location: scripts/before_install.sh
      timeout: 300
      runas: root
  AfterInstall:
    - location: scripts/after_install.sh
      timeout: 300
      runas: root
  ApplicationStart:
    - location: scripts/application_start.sh
      timeout: 300
      runas: root
EOF

# index.html 作成
cat > index.html << 'EOF'
<!DOCTYPE html>
<html>
<head><title>CodeDeploy Demo</title></head>
<body>
<h1>Deployed by CodeDeploy!</h1>
<p>Version: 1.0.0</p>
<p>Deployed at: __DEPLOY_TIME__</p>
</body>
</html>
EOF

# スクリプト作成
cat > scripts/before_install.sh << 'EOF'
#!/bin/bash
systemctl stop httpd || true
EOF

cat > scripts/after_install.sh << 'EOF'
#!/bin/bash
chmod 644 /var/www/html/index.html
sed -i "s/__DEPLOY_TIME__/$(date)/" /var/www/html/index.html
EOF

cat > scripts/application_start.sh << 'EOF'
#!/bin/bash
systemctl start httpd
EOF

# ZIP 作成とアップロード
cd ..
zip -r app-v1.zip dop-handson-app/
aws s3 cp app-v1.zip s3://dop-handson-codedeploy-{アカウントID}/
```

---

## Step 4: CodeDeploy アプリケーションの作成

### 4.1 CodeDeploy コンソールを開く

1. 検索バーに「CodeDeploy」と入力
2. **CodeDeploy** をクリック

### 4.2 アプリケーションを作成

1. 左メニューから **アプリケーション** をクリック
2. **アプリケーションの作成** をクリック

| 項目 | 値 |
|------|-----|
| アプリケーション名 | `dop-handson-app` |
| コンピューティングプラットフォーム | EC2/オンプレミス |

3. **アプリケーションの作成** をクリック

### 4.3 デプロイグループを作成

1. **デプロイグループの作成** をクリック

| セクション | 項目 | 値 |
|-----------|------|-----|
| 基本 | デプロイグループ名 | `dop-handson-dg` |
| 基本 | サービスロール | `CodeDeploy-Service-Role` |
| デプロイタイプ | デプロイタイプ | インプレース |
| 環境設定 | Amazon EC2 インスタンス | ✅ チェック |
| 環境設定 | キー | `Environment` |
| 環境設定 | 値 | `dop-handson` |
| デプロイ設定 | デプロイ設定 | CodeDeployDefault.AllAtOnce |
| Load balancer | ロードバランシングを有効にする | ❌ チェックしない |

2. **デプロイグループの作成** をクリック

---

## Step 5: デプロイの実行

### 5.1 デプロイを作成

1. `dop-handson-app` アプリケーションを開く
2. **デプロイの作成** をクリック

| 項目 | 値 |
|------|-----|
| デプロイグループ | `dop-handson-dg` |
| リビジョンタイプ | アプリケーションは Amazon S3 に格納されています |
| リビジョンの場所 | `s3://dop-handson-codedeploy-{アカウントID}/app-v1.zip` |
| リビジョンファイルの種類 | .zip |

2. **デプロイの作成** をクリック

### 5.2 デプロイの進行確認

1. デプロイ ID をクリック
2. **デプロイライフサイクルイベント** を確認:
   - BeforeInstall
   - Install
   - AfterInstall
   - ApplicationStart
   - ValidateService

3. すべて「成功」になるまで待つ

### 5.3 デプロイ結果の確認

1. EC2 インスタンスのパブリック IP にアクセス
2. 「Deployed by CodeDeploy!」が表示されれば成功

---

## Step 6: ライフサイクルイベントの理解

### 6.1 デプロイライフサイクル

```
┌─────────────────────────────────────────────────────────────┐
│                    In-Place デプロイ                        │
│                                                             │
│  ApplicationStop                                            │
│       ↓                                                     │
│  DownloadBundle (S3からダウンロード)                        │
│       ↓                                                     │
│  BeforeInstall ← スクリプト実行可能                         │
│       ↓                                                     │
│  Install (ファイルコピー)                                   │
│       ↓                                                     │
│  AfterInstall ← スクリプト実行可能                          │
│       ↓                                                     │
│  ApplicationStart ← スクリプト実行可能                      │
│       ↓                                                     │
│  ValidateService ← スクリプト実行可能                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 各フックの用途

| フック | 用途 |
|--------|------|
| BeforeInstall | 古いファイルの削除、サービス停止 |
| AfterInstall | パーミッション設定、設定ファイル更新 |
| ApplicationStart | アプリケーション起動 |
| ValidateService | ヘルスチェック、動作確認 |

---

## Step 7: リソースのクリーンアップ

### 7.1 CodeDeploy リソースの削除

1. CodeDeploy コンソールで `dop-handson-app` を選択
2. **削除** をクリック

### 7.2 EC2 インスタンスの削除

1. EC2 コンソールで `dop-handson-web` を選択
2. **インスタンスの状態** → **インスタンスを終了** をクリック

### 7.3 S3 バケットの削除

1. S3 コンソールで `dop-handson-codedeploy-*` を空にして削除

### 7.4 セキュリティグループの削除

1. EC2 コンソール → セキュリティグループ
2. `dop-handson-sg` を削除

### 7.5 IAM ロールの削除

1. IAM コンソール → ロール
2. `EC2-CodeDeploy-Role` と `CodeDeploy-Service-Role` を削除

---

## 学習のポイント

### appspec.yml の重要性

- CodeDeploy の動作を定義する最重要ファイル
- ファイルのコピー先とフックスクリプトを指定
- YAML 形式で記述（インデントに注意）

### デプロイ設定の種類

| 設定 | 説明 |
|------|------|
| AllAtOnce | 全インスタンスに同時デプロイ |
| HalfAtATime | 50% ずつデプロイ |
| OneAtATime | 1 台ずつデプロイ |
| カスタム | 任意の割合を指定 |

### DOP試験での出題ポイント

- appspec.yml のフック順序
- In-Place vs Blue/Green の違い
- デプロイ失敗時のロールバック設定
- Auto Scaling グループとの連携

---

## 次のステップ

- [ハンズオン 03: CodePipeline 手動承認](./handson-03-manual-approval.md)
- [ハンズオン 04: Blue/Green デプロイ](./handson-04-bluegreen-deploy.md)
