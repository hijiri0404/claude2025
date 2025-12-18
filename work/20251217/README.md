# CloudFront + S3 メンテナンスモード（Sorryページ）システム

## 📋 概要

このプロジェクトは、**Amazon CloudFront** と **Amazon S3** を使用した静的Webサイトに、柔軟なメンテナンスモード（Sorryページ表示）機能を実装したAWS CDKスタックです。

### 主要機能

✅ **時間ベースのメンテナンス表示**
- 指定した時間帯（例: 2025/12/25 00:00-06:00 JST）にSorryページを自動表示
- 時間外は通常サイトを表示

✅ **IPアドレスベースのバイパス**
- 管理者やテストユーザーのIPアドレスを登録
- メンテナンス中でも登録IPは通常サイトにアクセス可能
- AWS WAF IPセットで最大10,000件のIP管理

✅ **動的オリジン切り替え**
- Lambda@Edgeを使用してリクエストごとに最適なオリジンを選択
- メンテナンス状態・時間・IPアドレスに基づく高度なルーティング

✅ **セキュアな構成**
- S3バケットは完全プライベート（パブリックアクセス不可）
- CloudFront Origin Access Control (OAC) でS3へのアクセスを制御
- AWS WAF による追加のセキュリティ保護

## 🏗️ アーキテクチャ

```
┌─────────┐
│ Users   │
└────┬────┘
     │
     ▼
┌─────────────────┐
│  CloudFront     │◄────── AWS WAF (IP Set Match)
│  Distribution   │         ├─ 許可IPリスト管理
└────┬────────────┘         └─ X-Maintenance-Bypass ヘッダー挿入
     │
     ▼
┌─────────────────────────┐
│  Lambda@Edge            │
│  (Origin Request)       │
│  ┌───────────────────┐  │
│  │ メンテナンス判定   │  │
│  │ ・モード確認       │  │
│  │ ・IP判定           │  │
│  │ ・時間チェック     │  │
│  └───────────────────┘  │
└───┬──────────────┬──────┘
    │              │
    ▼              ▼
┌─────────┐  ┌──────────────┐
│ S3      │  │ S3           │
│ Main    │  │ Sorry Page   │
│ Site    │  │              │
└─────────┘  └──────────────┘
```

### 処理フロー

1. **リクエスト受信**: ユーザーがCloudFrontにアクセス
2. **WAF判定**: AWS WAFがIPアドレスをチェック
   - 許可IP → `X-Maintenance-Bypass: true` ヘッダー追加
   - その他 → ヘッダー追加なし
3. **Lambda@Edge判定**:
   - メンテナンスモード無効 → メインサイトへ
   - バイパスヘッダー存在 → メインサイトへ
   - 現在時刻がメンテナンス時間内 → Sorryページへ
   - メンテナンス時間外 → メインサイトへ
4. **レスポンス返却**: 適切なS3バケットからコンテンツを配信

## 📦 構成リソース

| リソース | 用途 | 命名規則 |
|---------|------|---------|
| **S3 Bucket (Main)** | 通常サイトのコンテンツ | `cloudfront-sorry-main-{account-id}` |
| **S3 Bucket (Sorry)** | Sorryページのコンテンツ | `cloudfront-sorry-page-{account-id}` |
| **S3 Bucket (Logs)** | CloudFrontアクセスログ | `cloudfront-sorry-logs-{account-id}` |
| **CloudFront Distribution** | CDN配信 | 自動生成 |
| **AWS WAF WebACL** | IPベースのアクセス制御 | `cloudfront-sorry-webacl` |
| **WAF IP Set** | 許可IPリスト | `cloudfront-sorry-allowed-ips` |
| **Lambda@Edge Function** | 動的オリジンルーティング | `MaintenanceRouterFunction` |
| **IAM Role** | Lambda@Edge実行ロール | `EdgeLambdaRole` |
| **SSM Parameters** | メンテナンス設定 | `/cloudfront-sorry/*` |

## 🚀 デプロイ手順

### 前提条件

#### 必須ツール
- **Node.js**: 18.x 以上
- **AWS CLI**: 2.x 以上
- **AWS CDK**: 2.x 以上
- **Git**: 任意のバージョン

#### AWS権限
以下のサービスへのアクセス権限が必要：
- Amazon S3
- Amazon CloudFront
- AWS WAF
- AWS Lambda
- AWS IAM
- AWS Systems Manager (Parameter Store)
- AWS CloudFormation

#### AWS認証情報の設定

```bash
# AWS CLIの設定（初回のみ）
aws configure

# または、プロファイルを使用
export AWS_PROFILE=your-profile-name
export AWS_REGION=ap-northeast-1
```

### 1. プロジェクトのセットアップ

```bash
# リポジトリのクローン（または既存ディレクトリに移動）
cd cloudfront-sorry-cdk

# 依存関係のインストール
npm install
```

### 2. 設定ファイルの準備

#### 方法A: CDKコンテキスト変数を使用（推奨）

`cdk.json` または `cdk.context.json` を作成：

```json
{
  "allowedIps": [
    "203.0.113.0/24",
    "198.51.100.10/32"
  ],
  "maintenanceMode": false,
  "startTime": "2025-12-25T00:00:00+09:00",
  "endTime": "2025-12-25T06:00:00+09:00"
}
```

#### 方法B: デプロイ時にコマンドラインで指定

```bash
cdk deploy \
  -c allowedIps='["203.0.113.0/24","198.51.100.10/32"]' \
  -c maintenanceMode=false \
  -c startTime="2025-12-25T00:00:00+09:00" \
  -c endTime="2025-12-25T06:00:00+09:00"
```

### 3. CDKスタックの合成（Synth）

```bash
# CloudFormationテンプレートの生成とバリデーション
npm run build
cdk synth

# 生成されたテンプレートを確認
cat cdk.out/CloudfrontSorryCdkStack.template.json
```

### 4. CDK Bootstrap（初回のみ）

```bash
# CDKが必要とするAWSリソースをセットアップ
cdk bootstrap aws://{account-id}/{region}

# 例
cdk bootstrap aws://123456789012/ap-northeast-1
```

### 5. デプロイ実行

```bash
# スタック差分の確認
cdk diff

# デプロイ実行
cdk deploy

# 確認プロンプトをスキップする場合
cdk deploy --require-approval never
```

**⏱️ デプロイ所要時間**: 約15-20分
- CloudFront Distributionの作成に時間がかかります
- Lambda@Edgeのレプリケーションにも時間が必要です

### 6. デプロイ後の確認

```bash
# スタック出力の確認
aws cloudformation describe-stacks \
  --stack-name CloudfrontSorryCdkStack \
  --query 'Stacks[0].Outputs' \
  --output table
```

出力例：
```
---------------------------------------------------------
|                   DescribeStacks                      |
+------------------------+------------------------------+
|  DistributionDomainName | d111111abcdef8.cloudfront.net |
|  MainSiteBucketName     | cloudfront-sorry-main-123456789012 |
|  SorryPageBucketName    | cloudfront-sorry-page-123456789012 |
|  DistributionId         | E1A2B3C4D5E6F7             |
|  WebACLArn              | arn:aws:wafv2:...          |
+------------------------+------------------------------+
```

## 📤 コンテンツのアップロード

### メインサイトのコンテンツ

```bash
# 環境変数の設定
export MAIN_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name CloudfrontSorryCdkStack \
  --query 'Stacks[0].Outputs[?OutputKey==`MainSiteBucketName`].OutputValue' \
  --output text)

# ファイルをアップロード
aws s3 cp ./your-website/ s3://${MAIN_BUCKET}/ --recursive \
  --cache-control "max-age=3600" \
  --content-type "text/html; charset=utf-8"
```

### Sorryページのコンテンツ

```bash
# 環境変数の設定
export SORRY_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name CloudfrontSorryCdkStack \
  --query 'Stacks[0].Outputs[?OutputKey==`SorryPageBucketName`].OutputValue' \
  --output text)

# Sorryページをアップロード
aws s3 cp ./static-sorry-page/index.html s3://${SORRY_BUCKET}/index.html \
  --content-type "text/html; charset=utf-8" \
  --cache-control "max-age=300"
```

## ⚙️ 運用ガイド

### メンテナンスモードの有効化

#### 方法1: SSM Parameter Storeを更新（推奨）

```bash
# メンテナンスモードを有効化
aws ssm put-parameter \
  --name "/cloudfront-sorry/maintenance-mode-enabled" \
  --value "true" \
  --overwrite

# メンテナンス時間を更新
aws ssm put-parameter \
  --name "/cloudfront-sorry/maintenance-start-time" \
  --value "2025-12-25T00:00:00+09:00" \
  --overwrite

aws ssm put-parameter \
  --name "/cloudfront-sorry/maintenance-end-time" \
  --value "2025-12-25T06:00:00+09:00" \
  --overwrite
```

**⚠️ 注意**: Lambda@Edgeの環境変数は変更されないため、現在の実装では再デプロイが必要です。

#### 方法2: CDKスタックを再デプロイ

```bash
# cdk.context.json を更新してから
cdk deploy -c maintenanceMode=true \
  -c startTime="2025-12-25T00:00:00+09:00" \
  -c endTime="2025-12-25T06:00:00+09:00"
```

**⏱️ 所要時間**: Lambda@Edgeの更新には5-15分かかります

### 許可IPアドレスの追加・削除

```bash
# WAF IP Setの現在の設定を確認
export IPSET_ID=$(aws cloudformation describe-stacks \
  --stack-name CloudfrontSorryCdkStack \
  --query 'Stacks[0].Outputs[?OutputKey==`IPSetArn`].OutputValue' \
  --output text | awk -F'/' '{print $NF}')

aws wafv2 get-ip-set \
  --scope CLOUDFRONT \
  --id ${IPSET_ID} \
  --name cloudfront-sorry-allowed-ips \
  --region us-east-1

# IPアドレスを追加
aws wafv2 update-ip-set \
  --scope CLOUDFRONT \
  --id ${IPSET_ID} \
  --name cloudfront-sorry-allowed-ips \
  --addresses "203.0.113.0/24" "198.51.100.10/32" "192.0.2.0/24" \
  --lock-token $(aws wafv2 get-ip-set --scope CLOUDFRONT --id ${IPSET_ID} --name cloudfront-sorry-allowed-ips --region us-east-1 --query 'LockToken' --output text) \
  --region us-east-1
```

**💡 ヒント**: IP更新は即座に反映されます（CloudFrontのキャッシュ無効化不要）

### CloudFrontキャッシュの無効化

```bash
# Distribution IDを取得
export DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name CloudfrontSorryCdkStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
  --output text)

# キャッシュ無効化を実行
aws cloudfront create-invalidation \
  --distribution-id ${DISTRIBUTION_ID} \
  --paths "/*"
```

**⏱️ 所要時間**: 通常1-5分で完了

### ログの確認

#### CloudFrontアクセスログ

```bash
# ログバケット名を取得
export LOG_BUCKET="cloudfront-sorry-logs-${AWS_ACCOUNT_ID}"

# 最新のログファイルをダウンロード
aws s3 sync s3://${LOG_BUCKET}/ ./logs/ --exclude "*" --include "*.gz"

# ログを解凍して確認
gunzip -c ./logs/*.gz | head -n 20
```

#### Lambda@Edgeログ（CloudWatch Logs）

```bash
# Lambda関数名を取得
export FUNCTION_NAME=$(aws lambda list-functions \
  --query 'Functions[?contains(FunctionName, `MaintenanceRouter`)].FunctionName' \
  --output text)

# CloudWatch Logs グループ名
export LOG_GROUP="/aws/lambda/us-east-1.${FUNCTION_NAME}"

# 最新のログストリームを表示
aws logs tail ${LOG_GROUP} --follow --format short
```

## 🧪 テスト方法

### 1. 通常モードのテスト

```bash
# メンテナンスモードが無効の状態でアクセス
curl -I https://{cloudfront-domain}/

# 期待される結果
# HTTP/2 200
# x-cache: Hit from cloudfront または Miss from cloudfront
# x-amz-cf-pop: NRT57-P1
```

### 2. メンテナンスモードのテスト

```bash
# メンテナンス時間内にアクセス
curl -I https://{cloudfront-domain}/

# 期待される結果: Sorryページが表示される
# HTTP/2 200
# content-type: text/html; charset=utf-8
```

### 3. IPバイパスのテスト

```bash
# 許可されたIPアドレスからアクセス（テスト環境でIPを偽装）
curl -I https://{cloudfront-domain}/ \
  -H "X-Forwarded-For: 203.0.113.10"

# 期待される結果: メンテナンス中でもメインサイトにアクセス可能
# X-Maintenance-Bypass: true ヘッダーが含まれる
```

### 4. ローカルテスト（Lambda関数単体）

```javascript
// test-event.json を作成
{
  "Records": [
    {
      "cf": {
        "request": {
          "uri": "/index.html",
          "headers": {}
        }
      }
    }
  ]
}

// Lambda関数を実行
node -e "const handler = require('./lambda/maintenance-router'); console.log(JSON.stringify(handler.handler(require('./test-event.json')), null, 2));"
```

## 💰 料金概算

### 想定条件
- **月間リクエスト数**: 100万リクエスト
- **データ転送量**: 100GB/月
- **リージョン**: ap-northeast-1 (東京)
- **CloudFront価格クラス**: Class 200 (日本、アジア、欧米)

### コスト内訳

| サービス | 項目 | 月額料金 (USD) |
|---------|------|---------------|
| **CloudFront** | | |
| - リクエスト (100万) | $0.0075/10,000 | $0.75 |
| - データ転送 (100GB) | $0.114/GB (最初10TB) | $11.40 |
| **Lambda@Edge** | | |
| - リクエスト (100万) | $0.60/100万 | $0.60 |
| - 実行時間 (128MB, 50ms) | $0.00005001/GB秒 | $0.31 |
| **AWS WAF** | | |
| - WebACL | $5.00/月 | $5.00 |
| - ルール | $1.00/ルール | $1.00 |
| - リクエスト (100万) | $0.60/100万 | $0.60 |
| **S3** | | |
| - ストレージ (5GB) | $0.025/GB | $0.13 |
| - GET リクエスト | $0.0004/1,000 | $0.40 |
| **SSM Parameter Store** | Standard (無料) | $0.00 |
| **合計** | | **$20.19/月** |

### コスト最適化のポイント

1. **CloudFront価格クラス**: Class 100 (日本のみ) に変更で約30%削減
2. **Lambda@Edgeメモリ**: 必要最小限に調整（現在128MB）
3. **S3ライフサイクル**: 古いログを自動削除（現在90日保持）
4. **WAFルール**: 必要最小限のルールのみ使用

## 🔧 トラブルシューティング

### Sorryページが表示されない

#### 症状
メンテナンス時間内にアクセスしても通常サイトが表示される

#### 確認事項
1. **Lambda@Edge環境変数の確認**
```bash
aws lambda get-function-configuration \
  --function-name {function-name} \
  --query 'Environment.Variables'
```

2. **CloudWatch Logsの確認**
```bash
aws logs tail /aws/lambda/us-east-1.MaintenanceRouterFunction --follow
```

3. **時間設定の確認**
```bash
aws ssm get-parameters \
  --names "/cloudfront-sorry/maintenance-start-time" "/cloudfront-sorry/maintenance-end-time"
```

#### 解決策
- Lambda@Edgeの環境変数を更新して再デプロイ
- タイムゾーン（JST）の設定を確認

### IPバイパスが動作しない

#### 症状
許可IPからアクセスしてもSorryページが表示される

#### 確認事項
1. **WAF IP Setの確認**
```bash
aws wafv2 get-ip-set --scope CLOUDFRONT --id {ipset-id} --name cloudfront-sorry-allowed-ips --region us-east-1
```

2. **WAFルールの確認**
```bash
aws wafv2 get-web-acl --scope CLOUDFRONT --id {webacl-id} --name cloudfront-sorry-webacl --region us-east-1
```

#### 解決策
- IPアドレスがCIDR形式で正しく登録されているか確認
- WAFルールの優先度を確認（Priority: 1であることを確認）

### Lambda@Edgeのデプロイエラー

#### 症状
`InvalidParameterValueException: The role defined for the function cannot be assumed by Lambda`

#### 原因
Lambda@EdgeのIAMロールに必要なTrust Policyが設定されていない

#### 解決策
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": [
          "lambda.amazonaws.com",
          "edgelambda.amazonaws.com"
        ]
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

### CloudFrontのキャッシュ問題

#### 症状
コンテンツを更新してもS3にアップロードしても古いコンテンツが表示される

#### 解決策
```bash
# キャッシュ無効化
aws cloudfront create-invalidation \
  --distribution-id ${DISTRIBUTION_ID} \
  --paths "/*"

# または特定のパスのみ
aws cloudfront create-invalidation \
  --distribution-id ${DISTRIBUTION_ID} \
  --paths "/index.html" "/style.css"
```

## 🗑️ クリーンアップ

### スタックの削除

```bash
# S3バケットのコンテンツを削除（バケット削除前に必要）
export MAIN_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name CloudfrontSorryCdkStack \
  --query 'Stacks[0].Outputs[?OutputKey==`MainSiteBucketName`].OutputValue' \
  --output text)

export SORRY_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name CloudfrontSorryCdkStack \
  --query 'Stacks[0].Outputs[?OutputKey==`SorryPageBucketName`].OutputValue' \
  --output text)

export LOG_BUCKET="cloudfront-sorry-logs-${AWS_ACCOUNT_ID}"

# バケットのコンテンツを削除
aws s3 rm s3://${MAIN_BUCKET}/ --recursive
aws s3 rm s3://${SORRY_BUCKET}/ --recursive
aws s3 rm s3://${LOG_BUCKET}/ --recursive

# CDKスタックを削除
cdk destroy

# 確認プロンプトをスキップする場合
cdk destroy --force
```

**⚠️ 注意事項**:
- Lambda@EdgeはCloudFrontから削除後もレプリカが残るため、完全削除に最大数時間かかります
- S3バケットは `RETAIN` ポリシーのため、手動で削除が必要です

## 📚 関連ドキュメント

### 内部ドキュメント
- [アーキテクチャ設計書](./architecture-design.md)
- [Sorryページカスタマイズガイド](./static-sorry-page/README.md)
- [Lambda@Edge関数仕様](./lambda/README.md)

### AWS公式ドキュメント
- [Amazon CloudFront Developer Guide](https://docs.aws.amazon.com/cloudfront/)
- [Lambda@Edge Developer Guide](https://docs.aws.amazon.com/lambda/latest/dg/lambda-edge.html)
- [AWS WAF Developer Guide](https://docs.aws.amazon.com/waf/)
- [AWS CDK Developer Guide](https://docs.aws.amazon.com/cdk/)

## 🤝 サポート

### よくある質問 (FAQ)

**Q: メンテナンスモードの設定変更は即座に反映されますか？**
A: Lambda@Edgeの環境変数変更には再デプロイが必要です（5-15分）。即座に変更したい場合はSSM Parameter Storeからの動的読み込みを実装する必要があります。

**Q: CloudFrontのキャッシュ無効化は必要ですか？**
A: Lambda@EdgeはOrigin Requestで実行されるため、キャッシュされたコンテンツは影響を受けません。S3コンテンツを更新した場合のみキャッシュ無効化が必要です。

**Q: 複数のメンテナンス時間帯を設定できますか？**
A: 現在の実装では1つの時間帯のみサポートしています。複数時間帯が必要な場合はLambda関数のロジックを拡張してください。

**Q: カスタムドメイン（独自ドメイン）に対応していますか？**
A: はい。CloudFront Distributionに証明書とCNAMEを追加することで対応可能です。

### トラブル時の連絡先

- **技術サポート**: support@example.com
- **緊急連絡先**: emergency@example.com
- **GitHub Issues**: [プロジェクトのIssuesページ]

## 📄 ライセンス

MIT License

## Useful CDK commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

---

**プロジェクトバージョン**: 1.0.0
**最終更新日**: 2025-12-17
**メンテナ**: DevOps Team
