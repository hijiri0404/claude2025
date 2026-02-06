# AWS 補足サービス ハンズオンガイド
## AppConfig / Service Catalog / Macie / AWS Health / Compute Optimizer / DynamoDB運用 / VPC Advanced

> **対象**: AWS DevOps Professional (DOP-C02) 試験対策
> **前提知識**: AWS基礎、IAM、VPC、主要サービス経験
> **所要時間**: 約3時間

---

## 目次

1. [AWS AppConfig](#1-aws-appconfig)
2. [AWS Service Catalog](#2-aws-service-catalog)
3. [Amazon Macie](#3-amazon-macie)
4. [AWS Health Dashboard](#4-aws-health-dashboard)
5. [AWS Compute Optimizer](#5-aws-compute-optimizer)
6. [DynamoDB運用機能](#6-dynamodb運用機能)
7. [VPC Advanced](#7-vpc-advanced)
8. [ハンズオン演習](#8-ハンズオン演習)
9. [DOP試験対策チェックリスト](#9-dop試験対策チェックリスト)

---

## 1. AWS AppConfig

### 1.1 概要

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AWS AppConfig                                    │
│          (AWS Systems Manager の機能)                                │
│                                                                     │
│  アプリケーション設定の安全なデプロイ管理                            │
│                                                                     │
│  ┌───────────────┐   ┌───────────────┐   ┌───────────────────┐     │
│  │ アプリケーション│   │ 環境          │   │ 設定プロファイル   │     │
│  │               │   │ (Dev/Stg/Prod)│   │                   │     │
│  │ 論理的な      │   │               │   │ ・フィーチャーフラグ│     │
│  │ アプリ単位    │──▶│ デプロイ先    │──▶│ ・運用パラメータ   │     │
│  │               │   │ の環境        │   │ ・フリーフォーム   │     │
│  └───────────────┘   └───────────────┘   └───────────────────┘     │
│                                                                     │
│  デプロイ戦略:                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ・AllAtOnce    : 即時全展開                                  │   │
│  │ ・Linear       : 段階的（例: 20%ずつ6分間隔）               │   │
│  │ ・Exponential  : 指数関数的に展開（1%→2%→4%→...）          │   │
│  │ ・カスタム     : 任意のステップ定義                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  バリデーター:                                                      │
│  ・JSONスキーマバリデーター                                         │
│  ・Lambda関数バリデーター（カスタムロジック）                       │
│                                                                     │
│  自動ロールバック:                                                  │
│  ・CloudWatchアラームと連携                                         │
│  ・異常検出時に自動で前バージョンに戻す                             │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 DOP試験での重要ポイント

| トピック | 重要度 | 出題パターン |
|---------|--------|-------------|
| **フィーチャーフラグ** | ★★★★★ | デプロイなしの機能切替 |
| **段階的デプロイ** | ★★★★★ | Linear/Exponential戦略 |
| **自動ロールバック** | ★★★★☆ | CloudWatchアラーム連携 |
| **バリデーター** | ★★★★☆ | 設定値の事前検証 |
| **Parameter Store/Secrets Managerとの違い** | ★★★★☆ | 適切なサービス選択 |

### 1.3 フィーチャーフラグ

```
【フィーチャーフラグのワークフロー】

1. AppConfigでフラグ定義
   {
     "new_checkout_flow": {
       "enabled": false
     },
     "dark_mode": {
       "enabled": true,
       "rollout_percentage": 25
     }
   }

2. アプリケーションがAppConfig APIでフラグ取得
   → ポーリング間隔（最短15秒）でキャッシュ更新

3. フラグ変更時は段階的デプロイ
   → アラーム監視 → 問題あれば自動ロールバック

vs Lambda環境変数: 環境変数変更にはデプロイが必要
vs Parameter Store: リアルタイム反映だがデプロイ戦略なし
```

---

## 2. AWS Service Catalog

### 2.1 概要

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AWS Service Catalog                               │
│          承認済みIT製品のセルフサービスポータル                       │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 管理者（カタログ管理）                                        │   │
│  │                                                              │   │
│  │ ポートフォリオ (Portfolio)                                    │   │
│  │ ┌──────────────────────────────────────────────────────────┐ │   │
│  │ │ 製品A          製品B          製品C                      │ │   │
│  │ │ (CloudFormation (CloudFormation (Terraform)              │ │   │
│  │ │  テンプレート)  テンプレート)                             │ │   │
│  │ │                                                          │ │   │
│  │ │ 制約:                                                    │ │   │
│  │ │ ・起動制約（実行ロール指定）                              │ │   │
│  │ │ ・テンプレート制約（パラメータ制限）                      │ │   │
│  │ │ ・通知制約（SNS通知）                                    │ │   │
│  │ │ ・タグ更新制約                                           │ │   │
│  │ └──────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                     共有（IAMプリンシパル/                           │
│                      Organizations/                                 │
│                      アカウント）                                    │
│                              │                                      │
│  ┌──────────────────────────▼───────────────────────────────────┐   │
│  │ エンドユーザー                                                │   │
│  │                                                              │   │
│  │ セルフサービスポータルから製品を起動                          │   │
│  │ → CloudFormationスタックが作成される                         │   │
│  │ → 制約の範囲内でのみ操作可能                                │   │
│  │ → 直接のAWSコンソールアクセス不要                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 DOP試験での重要ポイント

| トピック | 重要度 | 出題パターン |
|---------|--------|-------------|
| **ポートフォリオ共有** | ★★★★☆ | Organizations全体への配布 |
| **起動制約** | ★★★★★ | エンドユーザーの権限を制限しつつ製品起動を許可 |
| **テンプレート制約** | ★★★★☆ | パラメータ値の制限 |
| **バージョニング** | ★★★☆☆ | 製品のバージョン管理 |
| **TagOption** | ★★★☆☆ | 必須タグの強制 |

### 2.3 起動制約の重要性

```
【起動制約パターン】

起動制約なし:
  エンドユーザーのIAM権限でスタック作成
  → ユーザーにCloudFormation + 全リソース権限が必要
  → 権限管理が複雑

起動制約あり:
  指定されたIAMロール（起動ロール）でスタック作成
  → ユーザーには Service Catalog の使用権限のみ必要
  → 起動ロールが必要なAWS権限を持つ
  → 最小権限の原則に準拠
```

---

## 3. Amazon Macie

### 3.1 概要

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Amazon Macie                                   │
│           S3の機密データ検出・保護サービス                            │
│                                                                     │
│  S3バケット                                                         │
│  ┌──────────────┐     ┌──────────────────┐     ┌──────────────┐   │
│  │ オブジェクト  │────▶│ Macie分析エンジン │────▶│ Finding       │   │
│  │              │     │                  │     │              │   │
│  │ ドキュメント │     │ ・機械学習       │     │ ・PII検出    │   │
│  │ データベース │     │ ・パターンマッチ  │     │ ・クレジット │   │
│  │ ログファイル │     │ ・カスタム識別子  │     │   カード番号  │   │
│  │              │     │                  │     │ ・APIキー    │   │
│  └──────────────┘     └──────────────────┘     └──────┬───────┘   │
│                                                        │            │
│                                         EventBridge / Security Hub  │
│                                                        │            │
│                                                   自動対応          │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 DOP試験での位置づけ

- **コンプライアンスドメイン**で出題（GDPR、HIPAA対応）
- S3内の機密データ（PII、PHI）の自動検出
- Organizations全体での一括有効化
- EventBridge連携で検出時の自動対応

---

## 4. AWS Health Dashboard

### 4.1 概要

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AWS Health Dashboard                              │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Service Health Dashboard (パブリック)                         │   │
│  │ ・全AWSサービスのステータス                                  │   │
│  │ ・リージョン別の障害情報                                    │   │
│  │ ・過去のイベント履歴                                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Personal Health Dashboard (アカウント固有)                    │   │
│  │ ・自分のリソースに影響するイベント                           │   │
│  │ ・スケジュールメンテナンス通知                              │   │
│  │ ・リソース固有の推奨アクション                              │   │
│  │                                                              │   │
│  │ EventBridge連携:                                             │   │
│  │ ┌──────────────────────────────────────────────────────────┐ │   │
│  │ │ source: aws.health                                       │ │   │
│  │ │ detail-type: AWS Health Event                            │ │   │
│  │ │                                                          │ │   │
│  │ │ → Lambda/SNS で自動対応                                  │ │   │
│  │ │ → EC2メンテナンス通知の自動処理                          │ │   │
│  │ │ → Slackチャンネルへの自動通知                            │ │   │
│  │ └──────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Organizations Health:                                              │
│  ・組織全体のヘルスイベントを集約（委任管理者アカウント）          │
│  ・aws health describe-events-for-organization                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 DOP試験での出題パターン

- EC2メンテナンスイベントの自動対応
- Health API + EventBridge + Lambda パターン
- Organizations Health で全アカウントのイベント集約

---

## 5. AWS Compute Optimizer

### 5.1 概要

```
┌─────────────────────────────────────────────────────────────────────┐
│                   AWS Compute Optimizer                              │
│          リソースの適正サイジング推奨サービス                        │
│                                                                     │
│  分析対象:                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │ EC2      │ │ EBS      │ │ Lambda   │ │ ECS on   │             │
│  │インスタンス│ │ボリューム│ │ 関数     │ │ Fargate  │             │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘             │
│  ┌──────────┐ ┌──────────┐                                       │
│  │ Auto     │ │ RDS      │                                       │
│  │ Scaling  │ │インスタンス│                                      │
│  │ Group    │ │          │                                       │
│  └──────────┘ └──────────┘                                       │
│                                                                     │
│  推奨内容:                                                          │
│  ・Over-provisioned → ダウンサイズ（コスト削減）                   │
│  ・Under-provisioned → アップサイズ（パフォーマンス改善）          │
│  ・Gravitonインスタンスへの移行推奨                                │
│                                                                     │
│  Organizations統合:                                                 │
│  ・組織全体で一括有効化                                            │
│  ・全アカウントの推奨を集約                                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. DynamoDB運用機能

### 6.1 DOP試験で問われる運用機能

```
┌─────────────────────────────────────────────────────────────────────┐
│              DynamoDB 運用関連機能                                    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ DynamoDB Streams                                              │   │
│  │ ・テーブル変更のリアルタイムキャプチャ                        │   │
│  │ ・Lambda関数をトリガー                                       │   │
│  │ ・24時間のデータ保持                                         │   │
│  │ ・用途: リアルタイム集計、通知、レプリケーション             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Global Tables                                                 │   │
│  │ ・マルチリージョン、マルチアクティブレプリケーション          │   │
│  │ ・各リージョンで読み書き可能                                 │   │
│  │ ・通常1秒以下のレプリケーションラグ                          │   │
│  │ ・DynamoDB Streamsを内部使用                                 │   │
│  │ ・用途: グローバルアプリ、DR                                │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ バックアップ                                                  │   │
│  │ ・オンデマンドバックアップ: 手動作成、無期限保持             │   │
│  │ ・PITR: 継続的バックアップ、35日以内の任意時点に復元         │   │
│  │ ・AWS Backup統合: 集中管理                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Auto Scaling                                                  │   │
│  │ ・読み書きキャパシティの自動調整                              │   │
│  │ ・ターゲット使用率の設定（例: 70%）                          │   │
│  │ ・最小/最大キャパシティの制約                                │   │
│  │ ・On-Demand モード: 完全自動（プロビジョニング不要）         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ DAX (DynamoDB Accelerator)                                    │   │
│  │ ・インメモリキャッシュ（マイクロ秒レイテンシ）              │   │
│  │ ・APIレベルの互換性                                          │   │
│  │ ・VPC内に配置                                                │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. VPC Advanced

### 7.1 DOP試験で問われるVPC機能

```
┌─────────────────────────────────────────────────────────────────────┐
│                VPC Advanced 機能                                     │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ VPCエンドポイント                                             │   │
│  │                                                              │   │
│  │ Gateway Endpoint:                                            │   │
│  │ ・S3, DynamoDB のみ                                         │   │
│  │ ・無料                                                       │   │
│  │ ・ルートテーブルにエントリ追加                               │   │
│  │                                                              │   │
│  │ Interface Endpoint (PrivateLink):                            │   │
│  │ ・ほぼ全AWSサービス対応                                     │   │
│  │ ・ENIを作成（プライベートIPアドレス）                        │   │
│  │ ・有料（時間 + データ転送）                                  │   │
│  │ ・セキュリティグループで制御                                 │   │
│  │ ・プライベートDNS有効化で透過的アクセス                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Transit Gateway                                               │   │
│  │                                                              │   │
│  │ ・ハブ&スポーク型のネットワーク接続                          │   │
│  │ ・VPC間、VPN、Direct Connect を一元管理                      │   │
│  │ ・ルーティングテーブルで経路制御                             │   │
│  │ ・RAM (Resource Access Manager) でクロスアカウント共有       │   │
│  │ ・Transit Gateway Peering でクロスリージョン接続             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ VPC Flow Logs                                                 │   │
│  │                                                              │   │
│  │ ・VPC/サブネット/ENIレベルで取得可能                         │   │
│  │ ・宛先: CloudWatch Logs, S3, Kinesis Data Firehose           │   │
│  │ ・ネットワークトラブルシューティング、セキュリティ分析       │   │
│  │ ・GuardDutyのデータソース                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ PrivateLink                                                   │   │
│  │                                                              │   │
│  │ ・VPC間のプライベート接続（VPCピアリング不要）              │   │
│  │ ・サービスプロバイダーがNLBでサービス公開                    │   │
│  │ ・コンシューマーがInterface Endpointで接続                   │   │
│  │ ・IPアドレスの重複問題を回避                                │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 VPCエンドポイントポリシー

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSpecificBucket",
      "Effect": "Allow",
      "Principal": "*",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::my-secure-bucket/*"
    }
  ]
}
```

---

## 8. ハンズオン演習

### 演習1: AppConfig設定

```bash
# 1. アプリケーション作成
APP_ID=$(aws appconfig create-application \
  --name "dop-test-app" \
  --query 'Id' --output text)

# 2. 環境作成
ENV_ID=$(aws appconfig create-environment \
  --application-id ${APP_ID} \
  --name "production" \
  --query 'Id' --output text)

# 3. 設定プロファイル（フリーフォーム）作成
PROFILE_ID=$(aws appconfig create-configuration-profile \
  --application-id ${APP_ID} \
  --name "feature-flags" \
  --location-uri "hosted" \
  --type "AWS.AppConfig.FeatureFlags" \
  --query 'Id' --output text)

# 4. デプロイ戦略作成
STRATEGY_ID=$(aws appconfig create-deployment-strategy \
  --name "linear-50-percent" \
  --deployment-duration-in-minutes 10 \
  --growth-factor 50 \
  --growth-type LINEAR \
  --replicate-to NONE \
  --query 'Id' --output text)

# 5. 設定バージョン作成（ホスト型設定）
VERSION=$(aws appconfig create-hosted-configuration-version \
  --application-id ${APP_ID} \
  --configuration-profile-id ${PROFILE_ID} \
  --content-type "application/json" \
  --content '{"flags":{"dark_mode":{"name":"Dark Mode"},"new_checkout":{"name":"New Checkout"}},"values":{"dark_mode":{"enabled":true},"new_checkout":{"enabled":false}}}' \
  --query 'VersionNumber' --output text)

# 6. デプロイ開始
aws appconfig start-deployment \
  --application-id ${APP_ID} \
  --environment-id ${ENV_ID} \
  --deployment-strategy-id ${STRATEGY_ID} \
  --configuration-profile-id ${PROFILE_ID} \
  --configuration-version ${VERSION}

# 7. デプロイ状態確認
aws appconfig list-deployments \
  --application-id ${APP_ID} \
  --environment-id ${ENV_ID}
```

### 演習2: DynamoDB Streams確認

```bash
# テーブル一覧
aws dynamodb list-tables

# テーブルのStream設定確認
aws dynamodb describe-table \
  --table-name "<テーブル名>" \
  --query 'Table.{Name:TableName,StreamArn:LatestStreamArn,StreamSpec:StreamSpecification}'

# Global Tables確認
aws dynamodb describe-global-table \
  --global-table-name "<テーブル名>" 2>&1 || echo "Global Table未設定"

# PITRの確認
aws dynamodb describe-continuous-backups \
  --table-name "<テーブル名>" \
  --query 'ContinuousBackupsDescription.{PITR:PointInTimeRecoveryDescription.PointInTimeRecoveryStatus}'
```

### 演習3: VPCエンドポイント確認

```bash
# 既存のVPCエンドポイント一覧
aws ec2 describe-vpc-endpoints \
  --query 'VpcEndpoints[].{Id:VpcEndpointId,Service:ServiceName,Type:VpcEndpointType,State:State}' \
  --output table

# 利用可能なサービス一覧（ap-northeast-1）
aws ec2 describe-vpc-endpoint-services \
  --query 'ServiceNames[?contains(@, `s3`) || contains(@, `dynamodb`) || contains(@, `kms`)]'

# VPC Flow Logs確認
aws ec2 describe-flow-logs \
  --query 'FlowLogs[].{Id:FlowLogId,Resource:ResourceId,Status:FlowLogStatus,Destination:LogDestinationType}'
```

### 演習4: AWS Health API

```bash
# アカウントのヘルスイベント確認
aws health describe-events \
  --region us-east-1 \
  --filter '{
    "eventStatusCodes": ["open", "upcoming"],
    "eventTypeCategories": ["scheduledChange", "issue"]
  }' \
  --query 'events[].{Service:service,Type:eventTypeCode,Status:statusCode,Region:region}' 2>&1

# Organizationsヘルスイベント
aws health describe-events-for-organization \
  --region us-east-1 \
  --filter '{"eventStatusCodes": ["open"]}' 2>&1
```

### 演習5: Compute Optimizer確認

```bash
# Compute Optimizerの登録状態確認
aws compute-optimizer get-enrollment-status 2>&1

# EC2推奨の取得
aws compute-optimizer get-ec2-instance-recommendations \
  --query 'instanceRecommendations[].{Instance:instanceArn,Finding:finding,Recommendations:recommendationOptions[0].instanceType}' 2>&1

# Lambda推奨の取得
aws compute-optimizer get-lambda-function-recommendations \
  --query 'lambdaFunctionRecommendations[].{Function:functionArn,Finding:finding}' 2>&1
```

### クリーンアップ

```bash
# AppConfigリソース削除
aws appconfig delete-application --application-id ${APP_ID}
```

---

## 9. DOP試験対策チェックリスト

### Q1: AppConfig
**Q: AppConfigとParameter Storeの違いは？設定変更をリリースする場合にどちらを選ぶべきか？**

<details><summary>模範解答</summary>

AppConfig: 設定のデプロイメント管理に特化。段階的デプロイ（Linear/Exponential）、バリデーター（JSON/Lambda）、CloudWatchアラーム連携の自動ロールバック機能を提供。フィーチャーフラグに最適。Parameter Store: 単純なキーバリューストア。即時反映、バージョニングあり、KMS暗号化対応だがデプロイ戦略やロールバックなし。選択基準: 本番環境で段階的にリリースしたい場合→AppConfig。単純な設定値の参照→Parameter Store。

</details>

### Q2: Service Catalog起動制約
**Q: Service Catalogの起動制約（Launch Constraint）の目的は？**

<details><summary>模範解答</summary>

起動制約は製品起動時に使用するIAMロールを指定する。これによりエンドユーザーには最小限のService Catalog権限のみ付与すればよく、CloudFormationやAWSリソースの直接権限は不要になる。起動ロールが必要なAWS権限を代行する。利点: 最小権限の原則、エンドユーザーの権限管理簡素化、セキュリティ向上。

</details>

### Q3: DynamoDB Global Tables
**Q: DynamoDB Global Tablesの特徴とDR観点での利点は？**

<details><summary>模範解答</summary>

Global Tablesはマルチリージョン、マルチアクティブのレプリケーション。各リージョンで読み書き可能。内部的にDynamoDB Streamsを使用。レプリケーションラグは通常1秒以下。DR利点: ①アクティブ-アクティブ構成でRTO≈0 ②リージョン障害時はDNSルーティングの変更のみ ③RPO約1秒。Aurora Global DatabaseのRPO 1秒と同等だが、DynamoDBはマルチアクティブのため切り替え不要。

</details>

### Q4: VPCエンドポイント
**Q: Gateway EndpointとInterface Endpoint（PrivateLink）の違いは？**

<details><summary>模範解答</summary>

Gateway Endpoint: S3とDynamoDBのみ対応、無料、ルートテーブルにエントリ追加、VPC外からはアクセス不可。Interface Endpoint: ほぼ全AWSサービス対応、有料（時間+データ転送）、ENI作成（プライベートIP）、セキュリティグループで制御、プライベートDNSで透過的アクセス、Direct Connect/VPN経由でオンプレミスからアクセス可能。S3はどちらも対応だが、Interface Endpointはオンプレミスからのプライベートアクセスに有用。

</details>

### Q5: AWS Healthイベント対応
**Q: EC2のスケジュールメンテナンスを自動処理するアーキテクチャは？**

<details><summary>模範解答</summary>

AWS Health → EventBridge → Lambda。EventBridgeルールでsource: aws.health、detail-type: AWS Health Eventをキャプチャ。Lambda関数でスケジュールメンテナンス対象のEC2インスタンスを特定し、自動で①インスタンスの停止→起動（ホスト移行）②Auto Scaling Groupの場合はインスタンスリフレッシュ起動 ③SNS通知で管理者に報告。Organizations Healthで全アカウントのイベントを集約アカウントに集約し一元管理も可能。

</details>

### Q6: Macie
**Q: S3バケット内の機密データを自動検出してコンプライアンス違反時に対応する仕組みは？**

<details><summary>模範解答</summary>

Amazon Macieを有効化してS3バケットをスキャン対象に設定。機密データ（PII、PHI、クレジットカード番号等）を自動検出。FindingはEventBridgeに送信→Lambda関数で①S3バケットポリシーを更新してパブリックアクセスをブロック ②オブジェクトを隔離バケットに移動 ③SNSで管理者に通知 ④Security Hubに統合してコンプライアンスダッシュボードに反映。Organizations全体での一括有効化が推奨。

</details>

### Q7: Transit Gateway
**Q: 多数のVPC間接続にVPCピアリングではなくTransit Gatewayを選ぶべき理由は？**

<details><summary>模範解答</summary>

VPCピアリングはn*(n-1)/2の接続が必要でフルメッシュが複雑（10 VPCで45接続）。Transit Gatewayはハブ&スポーク型でn接続のみ。追加利点: ①集中ルーティング管理 ②VPN/Direct Connectとの統合 ③クロスアカウント共有（RAM）④Transit Gateway Peeringでクロスリージョン ⑤ルートテーブルでセグメンテーション。コスト: TGWはアタッチメント料金+データ転送料金あり。少数VPCならピアリングの方がコスト効率的。

</details>

### Q8: Compute Optimizer
**Q: Compute Optimizerの推奨を自動適用する仕組みは？**

<details><summary>模範解答</summary>

Compute Optimizer自体には自動適用機能はない。推奨を自動適用するには: Compute Optimizer API（GetEC2InstanceRecommendations等）→ Lambda関数で定期的に推奨を取得 → Auto Scaling Group起動テンプレートの更新 or EC2インスタンスのリサイズ。ただし本番環境では①承認ワークフロー（Step Functions）②メンテナンスウィンドウでの実行（SSM Maintenance Window）③変更前のスナップショット取得を組み込むべき。Organizations全体で一括有効化し委任管理者で集約管理が推奨。

</details>
