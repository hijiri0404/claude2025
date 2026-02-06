# AWS Config ハンズオンガイド

> **対象**: AWS DevOps Professional (DOP-C02) 試験対策
> **前提知識**: AWS基礎、IAM、セキュリティ基本概念
> **所要時間**: 約2時間

---

## 目次

1. [AWS Config概要](#1-aws-config概要)
2. [Config Rules（設定ルール）](#2-config-rules設定ルール)
3. [コンフォーマンスパック](#3-コンフォーマンスパック)
4. [マルチアカウント・マルチリージョン集約](#4-マルチアカウントマルチリージョン集約)
5. [自動修復（Remediation）](#5-自動修復remediation)
6. [Config + EventBridge連携](#6-config--eventbridge連携)
7. [ハンズオン演習](#7-ハンズオン演習)
8. [DOP試験対策チェックリスト](#8-dop試験対策チェックリスト)

---

## 1. AWS Config概要

### 1.1 AWS Configとは

```
┌─────────────────────────────────────────────────────────────────────┐
│                          AWS Config                                  │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │              リソース設定の記録・評価・監査                       ││
│  │                                                                  ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         ││
│  │  │   Recording  │  │    Rules     │  │ Remediation  │         ││
│  │  │   設定記録   │  │   評価ルール  │  │   自動修復   │         ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘         ││
│  │                                                                  ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         ││
│  │  │  Conformance │  │  Aggregator  │  │   Timeline   │         ││
│  │  │    Packs     │  │    集約      │  │   履歴表示   │         ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘         ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  対象: EC2, S3, IAM, VPC, RDS, Lambda, etc. (300+リソースタイプ)     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 主要コンポーネント

| コンポーネント | 説明 | DOP重要度 |
|--------------|------|----------|
| **Configuration Recorder** | リソース設定変更の記録 | ★★★★★ |
| **Config Rules** | コンプライアンス評価ルール | ★★★★★ |
| **Conformance Packs** | ルールのパッケージ化 | ★★★★☆ |
| **Aggregator** | マルチアカウント集約 | ★★★★☆ |
| **Remediation** | 非準拠リソースの自動修復 | ★★★★★ |
| **Configuration Timeline** | 設定変更履歴の可視化 | ★★★☆☆ |

### 1.3 AWS Configの動作フロー

```
【AWS Config 動作フロー】

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  AWS        │     │  Config     │     │    S3       │
│  Resources  │────▶│  Recorder   │────▶│   Bucket    │
│  (EC2, S3..)│     │             │     │  (履歴保存) │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Config    │
                    │   Rules     │
                    │  (評価)     │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │COMPLIANT │ │ NON_     │ │NOT_      │
        │ (準拠)   │ │COMPLIANT │ │APPLICABLE│
        └──────────┘ │ (非準拠) │ └──────────┘
                     └────┬─────┘
                          │
                          ▼
                   ┌─────────────┐
                   │ Remediation │
                   │  (自動修復) │
                   └─────────────┘
```

### 1.4 料金体系

```
【AWS Config 料金構造】

┌─────────────────────────────────────────────────────────────┐
│ Configuration Items (設定項目)                               │
│ └─ $0.003 / 設定項目                                        │
├─────────────────────────────────────────────────────────────┤
│ Config Rules                                                 │
│ ├─ AWS管理ルール: $0.001 / 評価                             │
│ └─ カスタムルール: $0.001 / 評価                            │
├─────────────────────────────────────────────────────────────┤
│ Conformance Pack                                             │
│ └─ $0.001 / 評価 (ルールごと)                               │
├─────────────────────────────────────────────────────────────┤
│ Aggregator                                                   │
│ └─ 追加料金なし（各アカウントの設定項目料金のみ）           │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Config Rules（設定ルール）

### 2.1 ルールの種類

```
【Config Rules の分類】

┌─────────────────────────────────────────────────────────────┐
│                     Config Rules                             │
├─────────────────────────┬───────────────────────────────────┤
│   AWS マネージドルール   │      カスタムルール               │
│                         │                                    │
│  ┌────────────────────┐ │  ┌────────────────────────────┐  │
│  │ 300+ 事前定義ルール │ │  │      Lambda 関数           │  │
│  │                    │ │  │  ┌────────────────────┐   │  │
│  │ • s3-bucket-       │ │  │  │ 独自のコンプライ   │   │  │
│  │   public-read-     │ │  │  │ アンスロジック実装 │   │  │
│  │   prohibited       │ │  │  └────────────────────┘   │  │
│  │ • ec2-instance-    │ │  │                            │  │
│  │   managed-by-ssm   │ │  │      Guard ルール          │  │
│  │ • iam-password-    │ │  │  ┌────────────────────┐   │  │
│  │   policy           │ │  │  │ DSL形式で記述     │   │  │
│  │ • encrypted-       │ │  │  │ Lambda不要        │   │  │
│  │   volumes          │ │  │  └────────────────────┘   │  │
│  └────────────────────┘ │  └────────────────────────────┘  │
└─────────────────────────┴───────────────────────────────────┘
```

### 2.2 トリガータイプ

| トリガータイプ | 説明 | ユースケース |
|---------------|------|-------------|
| **Configuration changes** | リソース変更時に評価 | S3バケット暗号化チェック |
| **Periodic** | 定期的に評価（1h, 3h, 6h, 12h, 24h） | IAMユーザー棚卸し |

### 2.3 主要なマネージドルール

```bash
# セキュリティ関連
s3-bucket-public-read-prohibited      # S3パブリックアクセス禁止
s3-bucket-ssl-requests-only           # S3 SSL必須
encrypted-volumes                     # EBS暗号化必須
rds-storage-encrypted                 # RDS暗号化必須
iam-password-policy                   # IAMパスワードポリシー
iam-user-mfa-enabled                  # IAM MFA有効化
root-account-mfa-enabled              # ルートアカウントMFA

# 運用関連
ec2-instance-managed-by-ssm           # SSM管理下のEC2
cloudtrail-enabled                    # CloudTrail有効化
multi-region-cloudtrail-enabled       # マルチリージョンCloudTrail
vpc-flow-logs-enabled                 # VPCフローログ有効化

# タグ関連
required-tags                         # 必須タグの存在確認
```

### 2.4 ルールの作成（CLI）

```bash
# AWS管理ルールの有効化
aws configservice put-config-rule \
  --config-rule '{
    "ConfigRuleName": "s3-bucket-public-read-prohibited",
    "Source": {
      "Owner": "AWS",
      "SourceIdentifier": "S3_BUCKET_PUBLIC_READ_PROHIBITED"
    },
    "Scope": {
      "ComplianceResourceTypes": ["AWS::S3::Bucket"]
    }
  }'

# 必須タグルールの設定
aws configservice put-config-rule \
  --config-rule '{
    "ConfigRuleName": "required-tags-check",
    "Source": {
      "Owner": "AWS",
      "SourceIdentifier": "REQUIRED_TAGS"
    },
    "InputParameters": "{\"tag1Key\":\"Environment\",\"tag2Key\":\"Owner\"}",
    "Scope": {
      "ComplianceResourceTypes": ["AWS::EC2::Instance", "AWS::S3::Bucket"]
    }
  }'
```

### 2.5 カスタムルール（Lambda）

```python
# Lambda関数によるカスタムルール例
# EC2インスタンスに特定のタグが存在するかチェック

import json
import boto3

def lambda_handler(event, context):
    config = boto3.client('config')

    # 設定項目の取得
    configuration_item = json.loads(event['invokingEvent'])['configurationItem']

    # 評価ロジック
    compliance_type = 'NON_COMPLIANT'

    if configuration_item['resourceType'] == 'AWS::EC2::Instance':
        tags = configuration_item.get('tags', {})

        # 必須タグの確認
        if 'CostCenter' in tags and 'Project' in tags:
            compliance_type = 'COMPLIANT'

    # 評価結果を返却
    config.put_evaluations(
        Evaluations=[
            {
                'ComplianceResourceType': configuration_item['resourceType'],
                'ComplianceResourceId': configuration_item['resourceId'],
                'ComplianceType': compliance_type,
                'OrderingTimestamp': configuration_item['configurationItemCaptureTime']
            }
        ],
        ResultToken=event['resultToken']
    )
```

### 2.6 カスタムルール（Guard DSL）

```ruby
# Guard DSLによるカスタムルール
# s3_bucket_encryption_check.guard

rule s3_bucket_encryption_enabled {
    configuration.serverSideEncryptionConfiguration exists
    configuration.serverSideEncryptionConfiguration.rules[*].applyServerSideEncryptionByDefault exists
}

rule s3_bucket_versioning_enabled {
    configuration.versioningConfiguration.status == "Enabled"
}
```

---

## 3. コンフォーマンスパック

### 3.1 コンフォーマンスパックとは

```
【Conformance Pack アーキテクチャ】

┌─────────────────────────────────────────────────────────────┐
│                    Conformance Pack                          │
│                 "Security-Best-Practices"                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  Config Rules                         │  │
│  │                                                       │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │  │
│  │  │ S3暗号化    │ │ EBS暗号化   │ │ RDS暗号化   │    │  │
│  │  │ チェック    │ │ チェック    │ │ チェック    │    │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘    │  │
│  │                                                       │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │  │
│  │  │ MFA必須     │ │ CloudTrail  │ │ VPCフロー   │    │  │
│  │  │ チェック    │ │ 有効化      │ │ ログ有効    │    │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Remediation Actions (任意)               │  │
│  │                                                       │  │
│  │  • S3暗号化の自動有効化                              │  │
│  │  • パブリックアクセスの自動ブロック                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 サンプルテンプレート

```yaml
# conformance-pack-template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: Security Best Practices Conformance Pack

Resources:
  S3BucketPublicReadProhibited:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: s3-bucket-public-read-prohibited
      Source:
        Owner: AWS
        SourceIdentifier: S3_BUCKET_PUBLIC_READ_PROHIBITED
      Scope:
        ComplianceResourceTypes:
          - AWS::S3::Bucket

  EncryptedVolumes:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: encrypted-volumes
      Source:
        Owner: AWS
        SourceIdentifier: ENCRYPTED_VOLUMES
      Scope:
        ComplianceResourceTypes:
          - AWS::EC2::Volume

  RdsStorageEncrypted:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: rds-storage-encrypted
      Source:
        Owner: AWS
        SourceIdentifier: RDS_STORAGE_ENCRYPTED

  IamUserMfaEnabled:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: iam-user-mfa-enabled
      Source:
        Owner: AWS
        SourceIdentifier: IAM_USER_MFA_ENABLED
      MaximumExecutionFrequency: TwentyFour_Hours
```

### 3.3 コンフォーマンスパックのデプロイ

```bash
# コンフォーマンスパックのデプロイ
aws configservice put-conformance-pack \
  --conformance-pack-name "security-best-practices" \
  --template-body file://conformance-pack-template.yaml

# ステータス確認
aws configservice describe-conformance-pack-status \
  --conformance-pack-names "security-best-practices"

# 準拠状況の確認
aws configservice get-conformance-pack-compliance-summary \
  --conformance-pack-names "security-best-practices"
```

### 3.4 AWS提供のサンプルパック

| パック名 | 説明 |
|---------|------|
| **Operational Best Practices for NIST CSF** | NIST サイバーセキュリティフレームワーク |
| **Operational Best Practices for PCI-DSS** | PCI DSS準拠 |
| **Operational Best Practices for HIPAA** | HIPAA準拠 |
| **Operational Best Practices for CIS** | CIS Benchmarks |
| **Operational Best Practices for AWS Well-Architected** | Well-Architected |

---

## 4. マルチアカウント・マルチリージョン集約

### 4.1 Aggregator（アグリゲーター）

```
【Config Aggregator アーキテクチャ】

┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   Account A     │ │   Account B     │ │   Account C     │
│   (Dev)         │ │   (Staging)     │ │   (Prod)        │
│  ┌───────────┐  │ │  ┌───────────┐  │ │  ┌───────────┐  │
│  │  Config   │  │ │  │  Config   │  │ │  │  Config   │  │
│  │  Recorder │  │ │  │  Recorder │  │ │  │  Recorder │  │
│  └─────┬─────┘  │ │  └─────┬─────┘  │ │  └─────┬─────┘  │
│        │        │ │        │        │ │        │        │
│ us-east│ap-north│ │ us-east│eu-west │ │ us-east│ap-north│
└────────┼────────┘ └────────┼────────┘ └────────┼────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │    Management Account    │
              │                          │
              │  ┌────────────────────┐  │
              │  │    Aggregator      │  │
              │  │  ┌──────────────┐  │  │
              │  │  │ 統合ビュー   │  │  │
              │  │  │ (全アカウント│  │  │
              │  │  │  全リージョン)│  │  │
              │  │  └──────────────┘  │  │
              │  └────────────────────┘  │
              └──────────────────────────┘
```

### 4.2 Aggregatorの設定

```bash
# 組織全体を集約するアグリゲーター作成
aws configservice put-configuration-aggregator \
  --configuration-aggregator-name "org-aggregator" \
  --organization-aggregation-source '{
    "RoleArn": "arn:aws:iam::123456789012:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig",
    "AllAwsRegions": true
  }'

# 特定アカウント・リージョンを集約
aws configservice put-configuration-aggregator \
  --configuration-aggregator-name "multi-account-aggregator" \
  --account-aggregation-sources '[
    {
      "AccountIds": ["111111111111", "222222222222"],
      "AllAwsRegions": false,
      "AwsRegions": ["us-east-1", "ap-northeast-1"]
    }
  ]'
```

### 4.3 集約データのクエリ

```bash
# 集約された非準拠リソースの取得
aws configservice get-aggregate-compliance-details-by-config-rule \
  --configuration-aggregator-name "org-aggregator" \
  --config-rule-name "s3-bucket-public-read-prohibited" \
  --compliance-type "NON_COMPLIANT"

# アカウント別コンプライアンスサマリー
aws configservice describe-aggregate-compliance-by-config-rules \
  --configuration-aggregator-name "org-aggregator" \
  --filters "ComplianceType=NON_COMPLIANT"
```

---

## 5. 自動修復（Remediation）

### 5.1 修復アクション

```
【Remediation Action フロー】

Config Rule 評価
      │
      ▼
┌──────────────┐
│ NON_COMPLIANT│
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│              Remediation Action                           │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │         SSM Automation Document                   │   │
│  │                                                   │   │
│  │  ┌─────────────────────────────────────────────┐ │   │
│  │  │ AWS-EnableS3BucketEncryption               │ │   │
│  │  │ AWS-DisablePublicAccessForSecurityGroup    │ │   │
│  │  │ AWSConfigRemediation-*                     │ │   │
│  │  │ カスタムAutomationドキュメント             │ │   │
│  │  └─────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  実行モード:                                             │
│  • 手動 (Manual)                                        │
│  • 自動 (Automatic)                                     │
└──────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐
│  COMPLIANT   │
└──────────────┘
```

### 5.2 修復アクションの設定

```bash
# S3バケット暗号化の自動修復設定
aws configservice put-remediation-configurations \
  --remediation-configurations '[
    {
      "ConfigRuleName": "s3-bucket-server-side-encryption-enabled",
      "TargetType": "SSM_DOCUMENT",
      "TargetId": "AWS-EnableS3BucketEncryption",
      "TargetVersion": "1",
      "Parameters": {
        "BucketName": {
          "ResourceValue": {
            "Value": "RESOURCE_ID"
          }
        },
        "SSEAlgorithm": {
          "StaticValue": {
            "Values": ["AES256"]
          }
        }
      },
      "Automatic": true,
      "MaximumAutomaticAttempts": 5,
      "RetryAttemptSeconds": 60
    }
  ]'
```

### 5.3 主要な修復用SSMドキュメント

| ドキュメント名 | 説明 |
|--------------|------|
| `AWS-EnableS3BucketEncryption` | S3バケット暗号化有効化 |
| `AWS-DisableS3BucketPublicReadWrite` | S3パブリックアクセス無効化 |
| `AWS-EnableEbsEncryptionByDefault` | EBS暗号化デフォルト有効化 |
| `AWS-EnableCloudTrailLogFileValidation` | CloudTrailログ検証有効化 |
| `AWSConfigRemediation-EnableEnhancedMonitoringOnRDSInstance` | RDS拡張モニタリング有効化 |

### 5.4 カスタム修復ドキュメント

```yaml
# custom-remediation-document.yaml
schemaVersion: '0.3'
description: 'タグが欠落しているEC2インスタンスにデフォルトタグを追加'
assumeRole: '{{ AutomationAssumeRole }}'
parameters:
  InstanceId:
    type: String
    description: 'EC2インスタンスID'
  AutomationAssumeRole:
    type: String
    description: 'Automation用IAMロール'
mainSteps:
  - name: addDefaultTags
    action: 'aws:createTags'
    inputs:
      ResourceType: EC2
      ResourceIds:
        - '{{ InstanceId }}'
      Tags:
        - Key: ManagedBy
          Value: AWSConfig
        - Key: ComplianceStatus
          Value: Remediated
```

---

## 6. Config + EventBridge連携

### 6.1 Config変更通知

```
【Config + EventBridge 連携パターン】

AWS Config                    EventBridge               ターゲット
┌───────────────┐         ┌──────────────┐         ┌─────────────┐
│ Config Rule   │         │              │         │   Lambda    │
│ 評価結果変更   │────────▶│    Rule      │────────▶│  通知処理   │
│ (COMPLIANT→   │         │              │         └─────────────┘
│  NON_COMPLIANT)│         │              │         ┌─────────────┐
└───────────────┘         │              │────────▶│    SNS      │
                          │              │         │  アラート   │
┌───────────────┐         │              │         └─────────────┘
│ Configuration │         │              │         ┌─────────────┐
│ Item変更      │────────▶│              │────────▶│Step Functions│
│               │         │              │         │ 承認ワークフロー│
└───────────────┘         └──────────────┘         └─────────────┘
```

### 6.2 EventBridgeルールの設定

```bash
# Config Rule評価結果変更イベント
aws events put-rule \
  --name "ConfigComplianceChangeRule" \
  --event-pattern '{
    "source": ["aws.config"],
    "detail-type": ["Config Rules Compliance Change"],
    "detail": {
      "messageType": ["ComplianceChangeNotification"],
      "newEvaluationResult": {
        "complianceType": ["NON_COMPLIANT"]
      }
    }
  }'

# SNS通知ターゲットの追加
aws events put-targets \
  --rule "ConfigComplianceChangeRule" \
  --targets '[{
    "Id": "1",
    "Arn": "arn:aws:sns:ap-northeast-1:123456789012:config-alerts"
  }]'
```

### 6.3 イベントパターン例

```json
// 特定のConfig Ruleの非準拠を検出
{
  "source": ["aws.config"],
  "detail-type": ["Config Rules Compliance Change"],
  "detail": {
    "configRuleName": ["s3-bucket-public-read-prohibited"],
    "newEvaluationResult": {
      "complianceType": ["NON_COMPLIANT"]
    }
  }
}

// リソース設定変更の検出
{
  "source": ["aws.config"],
  "detail-type": ["Config Configuration Item Change"],
  "detail": {
    "messageType": ["ConfigurationItemChangeNotification"],
    "configurationItem": {
      "resourceType": ["AWS::S3::Bucket"]
    }
  }
}
```

---

## 7. ハンズオン演習

### 7.1 演習1: Config有効化とルール設定

```bash
# 1. S3バケット作成（設定履歴保存用）
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET_NAME="config-bucket-${ACCOUNT_ID}-ap-northeast-1"

aws s3 mb s3://${BUCKET_NAME}

# 2. Configレコーダー用IAMロール確認
aws iam get-role --role-name AWSServiceRoleForConfig 2>/dev/null || \
  aws iam create-service-linked-role --aws-service-name config.amazonaws.com

# 3. 配信チャネルの設定
aws configservice put-delivery-channel \
  --delivery-channel '{
    "name": "default",
    "s3BucketName": "'${BUCKET_NAME}'"
  }'

# 4. Configレコーダーの設定と開始
aws configservice put-configuration-recorder \
  --configuration-recorder '{
    "name": "default",
    "roleARN": "arn:aws:iam::'${ACCOUNT_ID}':role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig",
    "recordingGroup": {
      "allSupported": true,
      "includeGlobalResourceTypes": true
    }
  }'

aws configservice start-configuration-recorder --configuration-recorder-name default

# 5. ステータス確認
aws configservice describe-configuration-recorder-status
```

**実行結果**:
```json
{
    "ConfigurationRecordersStatus": [
        {
            "name": "default",
            "lastStartTime": "2026-02-03T15:00:00.000000+00:00",
            "recording": true,
            "lastStatus": "SUCCESS"
        }
    ]
}
```
✅ **検証済み** (2026-02-03)

### 7.2 演習2: マネージドルールの有効化

```bash
# S3パブリックアクセス禁止ルール
aws configservice put-config-rule \
  --config-rule '{
    "ConfigRuleName": "handson-s3-public-read-prohibited",
    "Description": "S3バケットのパブリック読み取りを禁止",
    "Source": {
      "Owner": "AWS",
      "SourceIdentifier": "S3_BUCKET_PUBLIC_READ_PROHIBITED"
    },
    "Scope": {
      "ComplianceResourceTypes": ["AWS::S3::Bucket"]
    }
  }'

# ルール確認
aws configservice describe-config-rules \
  --config-rule-names "handson-s3-public-read-prohibited"

# コンプライアンス確認
aws configservice describe-compliance-by-config-rule \
  --config-rule-names "handson-s3-public-read-prohibited"
```

**実行結果**:
```json
{
    "ComplianceByConfigRules": [
        {
            "ConfigRuleName": "handson-s3-public-read-prohibited",
            "Compliance": {
                "ComplianceType": "COMPLIANT"
            }
        }
    ]
}
```
✅ **検証済み** (2026-02-03)

### 7.3 演習3: 非準拠リソースの検出

```bash
# テスト用S3バケット作成（パブリックアクセス可能）
TEST_BUCKET="config-test-${ACCOUNT_ID}-public"
aws s3 mb s3://${TEST_BUCKET}

# パブリックアクセスブロック設定を解除（テスト用）
aws s3api put-public-access-block \
  --bucket ${TEST_BUCKET} \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# ルール再評価
aws configservice start-config-rules-evaluation \
  --config-rule-names "handson-s3-public-read-prohibited"

# 非準拠リソース確認
aws configservice get-compliance-details-by-config-rule \
  --config-rule-name "handson-s3-public-read-prohibited" \
  --compliance-types "NON_COMPLIANT"
```

### 7.4 演習4: 自動修復の設定

```bash
# 修復アクションの設定
aws configservice put-remediation-configurations \
  --remediation-configurations '[
    {
      "ConfigRuleName": "handson-s3-public-read-prohibited",
      "TargetType": "SSM_DOCUMENT",
      "TargetId": "AWS-DisableS3BucketPublicReadWrite",
      "Parameters": {
        "S3BucketName": {
          "ResourceValue": {
            "Value": "RESOURCE_ID"
          }
        }
      },
      "Automatic": false,
      "MaximumAutomaticAttempts": 3,
      "RetryAttemptSeconds": 60
    }
  ]'

# 修復実行（手動）
aws configservice start-remediation-execution \
  --config-rule-name "handson-s3-public-read-prohibited" \
  --resource-keys '[
    {
      "resourceType": "AWS::S3::Bucket",
      "resourceId": "'${TEST_BUCKET}'"
    }
  ]'

# 修復ステータス確認
aws configservice describe-remediation-execution-status \
  --config-rule-name "handson-s3-public-read-prohibited"
```

### 7.5 クリーンアップ

```bash
# テスト用バケット削除
aws s3 rb s3://${TEST_BUCKET} --force

# Configルール削除
aws configservice delete-config-rule \
  --config-rule-name "handson-s3-public-read-prohibited"

# 修復設定削除
aws configservice delete-remediation-configuration \
  --config-rule-name "handson-s3-public-read-prohibited"

# Configレコーダー停止（必要に応じて）
# aws configservice stop-configuration-recorder --configuration-recorder-name default
```

---

## 8. DOP試験対策チェックリスト

### 基本理解

- [ ] AWS Configの主要コンポーネントを説明できる
- [ ] マネージドルールとカスタムルールの違いを理解している
- [ ] トリガータイプ（変更時/定期）の使い分けを知っている

<details>
<summary>📝 模範解答を見る</summary>

**AWS Configの主要コンポーネント**:
1. **Configuration Recorder**: リソース設定変更を記録
2. **Config Rules**: コンプライアンス評価ルール
3. **Delivery Channel**: 設定履歴をS3に配信
4. **Aggregator**: マルチアカウント・リージョン集約
5. **Remediation**: 非準拠リソースの自動修復

**マネージドルール vs カスタムルール**:
- **マネージドルール**: AWS提供の300+の事前定義ルール、設定のみで利用可能
- **カスタムルール**: Lambda関数またはGuard DSLで独自ロジック実装

**トリガータイプの使い分け**:
| トリガー | ユースケース | 例 |
|---------|-------------|-----|
| Configuration changes | 即時検出が必要 | S3暗号化、SGルール |
| Periodic | 定期チェックで十分 | IAMユーザー棚卸し |
</details>

### コンプライアンス管理

- [ ] コンフォーマンスパックの用途と作成方法を理解している
- [ ] マルチアカウント集約（Aggregator）を設定できる
- [ ] Organizations連携のメリットを説明できる

<details>
<summary>📝 模範解答を見る</summary>

**コンフォーマンスパック**:
- 複数のConfig Rulesをパッケージ化
- CloudFormationテンプレート形式で定義
- 用途: コンプライアンス標準（PCI-DSS, HIPAA等）の一括適用

**Aggregator設定**:
```bash
aws configservice put-configuration-aggregator \
  --configuration-aggregator-name "org-aggregator" \
  --organization-aggregation-source '{
    "RoleArn": "arn:aws:iam::ACCOUNT:role/...",
    "AllAwsRegions": true
  }'
```

**Organizations連携のメリット**:
1. 全アカウントへの自動ルール適用
2. 新規アカウント作成時の自動設定
3. 委任管理者による一元管理
4. サービスコントロールポリシー（SCP）との組み合わせ
</details>

### 自動修復

- [ ] 修復アクションの設定方法を知っている
- [ ] SSM Automationドキュメントとの連携を理解している
- [ ] 自動修復 vs 手動修復の使い分けを判断できる

<details>
<summary>📝 模範解答を見る</summary>

**修復アクションの設定**:
1. Config Ruleに修復アクションを関連付け
2. SSM Automationドキュメントを指定
3. 自動/手動モードを選択
4. リトライ回数と間隔を設定

**SSM Automation連携**:
- AWS提供の修復ドキュメント（AWS-*, AWSConfigRemediation-*）
- カスタムドキュメントも作成可能
- パラメータにRESOURCE_IDを動的に渡す

**自動修復 vs 手動修復**:
| モード | ユースケース |
|--------|-------------|
| 自動 | 低リスク操作（タグ追加、暗号化有効化） |
| 手動 | 高リスク操作（SG変更、リソース削除）、承認フローが必要 |

**ベストプラクティス**: 本番環境では手動承認フロー推奨
</details>

### イベント連携

- [ ] EventBridgeとの連携パターンを設計できる
- [ ] コンプライアンス変更通知の設定ができる
- [ ] セキュリティインシデント対応フローを実装できる

<details>
<summary>📝 模範解答を見る</summary>

**EventBridge連携パターン**:
```json
{
  "source": ["aws.config"],
  "detail-type": ["Config Rules Compliance Change"],
  "detail": {
    "newEvaluationResult": {
      "complianceType": ["NON_COMPLIANT"]
    }
  }
}
```

**通知フロー例**:
```
Config Rule評価
  ↓ NON_COMPLIANT
EventBridge
  ↓
SNS → Slack/PagerDuty
  ↓
Lambda → JIRA チケット作成
```

**セキュリティインシデント対応**:
1. Config検出: パブリックS3バケット
2. EventBridge: 即座にイベント発火
3. Step Functions: 承認ワークフロー開始
4. 承認後: SSM Automationで自動修復
5. SNS: 完了通知
</details>

### 実践シナリオ

- [ ] マルチアカウント環境でのコンプライアンス管理を設計できる
- [ ] 継続的コンプライアンス監視アーキテクチャを構築できる
- [ ] コスト最適化を考慮したConfig運用ができる

<details>
<summary>📝 模範解答を見る</summary>

**マルチアカウントコンプライアンス管理**:
```
┌─────────────────────────────────────────┐
│        Management Account               │
│  ┌───────────────────────────────────┐ │
│  │ Config Aggregator                 │ │
│  │ + Security Hub統合                │ │
│  │ + 統合ダッシュボード              │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
         │
    Organizations
         │
├────────┼────────┤
▼        ▼        ▼
Dev   Staging   Prod
(各アカウントでConfig有効化)
```

**継続的コンプライアンスアーキテクチャ**:
1. **検出**: Config Rules（変更時 + 定期）
2. **通知**: EventBridge → SNS
3. **修復**: SSM Automation（自動/手動）
4. **レポート**: Security Hub統合
5. **監査**: S3への設定履歴保存

**コスト最適化のポイント**:
- 記録対象リソースタイプの絞り込み
- 定期評価の頻度最適化（24h推奨）
- 不要なルールの削除
- S3 Intelligent-Tieringでの履歴保存
</details>

---

## 付録A: よく使うCLIコマンド

```bash
# Config状態確認
aws configservice describe-configuration-recorder-status
aws configservice describe-delivery-channel-status

# ルール管理
aws configservice describe-config-rules
aws configservice put-config-rule --config-rule '{...}'
aws configservice delete-config-rule --config-rule-name "rule-name"
aws configservice start-config-rules-evaluation --config-rule-names "rule-name"

# コンプライアンス確認
aws configservice describe-compliance-by-config-rule
aws configservice get-compliance-details-by-config-rule --config-rule-name "rule-name"
aws configservice describe-compliance-by-resource --resource-type "AWS::S3::Bucket"

# 修復
aws configservice put-remediation-configurations --remediation-configurations '[...]'
aws configservice start-remediation-execution --config-rule-name "rule-name" --resource-keys '[...]'
aws configservice describe-remediation-execution-status --config-rule-name "rule-name"

# 集約
aws configservice put-configuration-aggregator --configuration-aggregator-name "name" ...
aws configservice get-aggregate-compliance-details-by-config-rule ...
```

---

## 付録B: 参考リンク

- [AWS Config ユーザーガイド](https://docs.aws.amazon.com/config/latest/developerguide/)
- [AWS Config マネージドルール一覧](https://docs.aws.amazon.com/config/latest/developerguide/managed-rules-by-aws-config.html)
- [AWS Config コンフォーマンスパック](https://docs.aws.amazon.com/config/latest/developerguide/conformance-packs.html)
- [修復アクション SSMドキュメント](https://docs.aws.amazon.com/systems-manager-automation-runbooks/latest/userguide/)

---

**作成日**: 2026-02-03
**最終更新**: 2026-02-03
**検証環境**: AWS ap-northeast-1 リージョン
