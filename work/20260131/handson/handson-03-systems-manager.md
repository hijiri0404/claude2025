# ハンズオン 03: AWS Systems Manager 基礎

## 概要

このハンズオンでは、AWS Systems Manager を使用して EC2 インスタンスを管理します。Run Command、Parameter Store、Session Manager の使い方を学びます。

**所要時間**: 約30分
**コスト**: 約$0.50以下

## 学習目標

- Systems Manager Agent の設定確認
- Run Command でリモートコマンド実行
- Parameter Store でパラメータ管理
- Session Manager でセキュアな接続

---

## 前提条件

- AWS アカウント
- 管理者権限を持つ IAM ユーザー

---

## Step 1: EC2 インスタンスの準備

### 1.1 IAM ロールの作成

1. IAM コンソールを開く
2. **ロール** → **ロールを作成** をクリック

| 項目 | 値 |
|------|-----|
| 信頼されたエンティティタイプ | AWS のサービス |
| ユースケース | EC2 |

3. **次へ** をクリック
4. 以下のポリシーを追加:
   - `AmazonSSMManagedInstanceCore`

5. ロール名: `SSM-EC2-Role`
6. **ロールを作成** をクリック

### 1.2 EC2 インスタンスを起動

1. EC2 コンソールで **インスタンスを起動** をクリック

| 項目 | 値 |
|------|-----|
| 名前 | `ssm-handson-instance` |
| AMI | Amazon Linux 2023 AMI |
| インスタンスタイプ | t2.micro |
| キーペア | なし（Session Manager を使用） |
| ネットワーク設定 | デフォルト VPC、パブリックサブネット |
| パブリック IP | 有効化 |
| セキュリティグループ | 新規作成、インバウンドルールなし |
| IAM インスタンスプロファイル | `SSM-EC2-Role` |

2. **インスタンスを起動** をクリック

### 1.3 マネージドインスタンスの確認

1. **Systems Manager** コンソールを開く
2. 左メニューから **フリートマネージャー** をクリック
3. 数分待つと `ssm-handson-instance` が表示される

> **Note**: 表示されない場合は、IAM ロールの設定を確認してください

---

## Step 2: Session Manager でインスタンスに接続

### 2.1 Session Manager を開く

1. Systems Manager コンソールで **セッションマネージャー** をクリック
2. **セッションを開始する** をクリック

### 2.2 インスタンスに接続

1. `ssm-handson-instance` を選択
2. **セッションを開始する** をクリック
3. ターミナルが開く

### 2.3 コマンドを実行

```bash
# ホスト名確認
hostname

# OS 情報確認
cat /etc/os-release

# SSM Agent バージョン確認
sudo systemctl status amazon-ssm-agent
```

4. **終了** をクリックしてセッション終了

### 2.4 Session Manager の利点

| 従来の SSH | Session Manager |
|------------|-----------------|
| ポート 22 を開放 | ポート開放不要 |
| キーペア管理が必要 | キーペア不要 |
| ログは別途設定 | CloudWatch Logs に自動記録可能 |
| 踏み台サーバが必要な場合も | 直接接続可能 |

---

## Step 3: Run Command でリモートコマンド実行

### 3.1 Run Command を開く

1. Systems Manager コンソールで **Run Command** をクリック
2. **Run command** をクリック

### 3.2 コマンドを実行

| セクション | 項目 | 値 |
|-----------|------|-----|
| コマンドドキュメント | 検索 | `AWS-RunShellScript` を選択 |
| コマンドのパラメータ | Commands | `uptime && df -h && free -m` |
| ターゲット | ターゲットの選択 | インスタンスを手動で選択する |
| ターゲット | インスタンス | `ssm-handson-instance` を選択 |

3. **実行** をクリック

### 3.3 結果の確認

1. コマンド ID をクリック
2. インスタンス ID をクリック
3. **出力** タブで結果を確認

### 3.4 よく使うドキュメント

| ドキュメント | 用途 |
|-------------|------|
| AWS-RunShellScript | シェルコマンド実行（Linux） |
| AWS-RunPowerShellScript | PowerShell 実行（Windows） |
| AWS-UpdateSSMAgent | SSM Agent 更新 |
| AWS-RunPatchBaseline | パッチ適用 |
| AWS-ConfigureAWSPackage | パッケージインストール |

---

## Step 4: Parameter Store でパラメータ管理

### 4.1 パラメータを作成

1. Systems Manager コンソールで **パラメータストア** をクリック
2. **パラメータの作成** をクリック

**パラメータ 1: 通常の文字列**

| 項目 | 値 |
|------|-----|
| 名前 | `/dop-handson/app/environment` |
| 説明 | アプリケーション環境 |
| 利用枠 | 標準 |
| タイプ | 文字列 |
| 値 | `production` |

3. **パラメータの作成** をクリック

**パラメータ 2: 暗号化された文字列**

1. **パラメータの作成** をクリック

| 項目 | 値 |
|------|-----|
| 名前 | `/dop-handson/app/database-password` |
| 説明 | データベースパスワード |
| 利用枠 | 標準 |
| タイプ | 安全な文字列 |
| KMS キーソース | 現在のアカウント |
| KMS キー ID | alias/aws/ssm（デフォルト） |
| 値 | `MySecretPassword123!` |

2. **パラメータの作成** をクリック

### 4.2 パラメータの階層構造

```
/dop-handson/
├── app/
│   ├── environment        (String)
│   └── database-password  (SecureString)
├── database/
│   ├── host
│   └── port
└── api/
    └── endpoint
```

### 4.3 Run Command でパラメータを使用

1. **Run Command** をクリック
2. **Run command** をクリック

| 項目 | 値 |
|------|-----|
| コマンドドキュメント | `AWS-RunShellScript` |
| Commands | 以下のスクリプト |

```bash
#!/bin/bash
# Parameter Store から値を取得
ENVIRONMENT=$(aws ssm get-parameter --name "/dop-handson/app/environment" --query "Parameter.Value" --output text --region ap-northeast-1)

echo "Environment: $ENVIRONMENT"

# SecureString の場合は --with-decryption が必要
DB_PASSWORD=$(aws ssm get-parameter --name "/dop-handson/app/database-password" --with-decryption --query "Parameter.Value" --output text --region ap-northeast-1)

echo "Database Password: ${DB_PASSWORD:0:3}***"
```

3. ターゲットに `ssm-handson-instance` を選択
4. **実行** をクリック

> **Note**: IAM ロールに `ssm:GetParameter` 権限が必要です

### 4.4 IAM ロールに権限追加

1. IAM コンソールで `SSM-EC2-Role` を開く
2. **許可を追加** → **インラインポリシーを作成** をクリック
3. JSON タブで以下を入力:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ssm:GetParameter",
                "ssm:GetParameters",
                "ssm:GetParametersByPath"
            ],
            "Resource": "arn:aws:ssm:ap-northeast-1:*:parameter/dop-handson/*"
        },
        {
            "Effect": "Allow",
            "Action": "kms:Decrypt",
            "Resource": "*"
        }
    ]
}
```

4. ポリシー名: `SSM-Parameter-Access`
5. **ポリシーの作成** をクリック

---

## Step 5: Automation でワークフロー実行

### 5.1 Automation を開く

1. Systems Manager コンソールで **オートメーション** をクリック
2. **オートメーションの実行** をクリック

### 5.2 ドキュメントを選択

1. **AWS が所有** タブをクリック
2. `AWS-StopEC2Instance` を検索して選択
3. **次へ** をクリック

### 5.3 パラメータを設定

| 項目 | 値 |
|------|-----|
| InstanceId | `ssm-handson-instance` のインスタンス ID |
| AutomationAssumeRole | 空のまま |

4. **実行** をクリック

### 5.4 実行結果の確認

1. 実行 ID をクリック
2. 各ステップの状態を確認
3. EC2 コンソールでインスタンスが停止していることを確認

### 5.5 インスタンスを再起動

1. **オートメーションの実行** をクリック
2. `AWS-StartEC2Instance` を選択
3. インスタンス ID を入力して実行

---

## Step 6: State Manager で構成管理

### 6.1 State Manager を開く

1. Systems Manager コンソールで **ステートマネージャー** をクリック
2. **関連付けの作成** をクリック

### 6.2 関連付けを作成

| セクション | 項目 | 値 |
|-----------|------|-----|
| 名前 | 名前 | `dop-handson-gather-inventory` |
| ドキュメント | ドキュメント | `AWS-GatherSoftwareInventory` |
| ターゲット | ターゲットの選択 | インスタンスを手動で選択する |
| ターゲット | インスタンス | `ssm-handson-instance` |
| スケジュール | スケジュールを指定 | CRON/Rate 式 |
| スケジュール | CRON 式 | `rate(1 day)` |

3. **関連付けの作成** をクリック

### 6.3 インベントリの確認

1. **インベントリ** をクリック
2. インスタンスを選択
3. インストールされているソフトウェアやサービスの一覧を確認

---

## Step 7: リソースのクリーンアップ

### 7.1 関連付けの削除

1. State Manager で `dop-handson-gather-inventory` を選択
2. **削除** をクリック

### 7.2 パラメータの削除

1. Parameter Store で `/dop-handson/` で始まるパラメータを選択
2. **削除** をクリック

### 7.3 EC2 インスタンスの削除

1. EC2 コンソールで `ssm-handson-instance` を選択
2. **インスタンスの状態** → **インスタンスを終了** をクリック

### 7.4 IAM ロールの削除

1. IAM コンソールで `SSM-EC2-Role` を削除

---

## 学習のポイント

### Systems Manager の主要機能

```
┌─────────────────────────────────────────────────────────────┐
│                   AWS Systems Manager                       │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Session     │  │ Run         │  │ Parameter   │         │
│  │ Manager     │  │ Command     │  │ Store       │         │
│  │             │  │             │  │             │         │
│  │ セキュアな  │  │ リモート    │  │ パラメータ  │         │
│  │ 接続        │  │ コマンド    │  │ 管理        │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Automation  │  │ State       │  │ Patch       │         │
│  │             │  │ Manager     │  │ Manager     │         │
│  │             │  │             │  │             │         │
│  │ ワークフロー│  │ 構成管理    │  │ パッチ管理  │         │
│  │ 自動化      │  │             │  │             │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Parameter Store vs Secrets Manager

| 項目 | Parameter Store | Secrets Manager |
|------|-----------------|-----------------|
| コスト | 無料（標準） | 有料 |
| 自動ローテーション | なし | あり |
| クロスアカウント | 手動 | サポート |
| 用途 | 設定値、シンプルな秘密 | DB認証情報、API キー |

### DOP試験での出題ポイント

- Run Command vs Automation の使い分け
- Parameter Store の階層構造とパス設計
- Session Manager のログ設定
- Patch Manager のパッチベースラインとメンテナンスウィンドウ

---

## 次のステップ

- [ハンズオン 04: CloudFormation 基礎](./handson-04-cloudformation.md)
- [ハンズオン 05: AWS Config ルール](./handson-05-aws-config.md)
