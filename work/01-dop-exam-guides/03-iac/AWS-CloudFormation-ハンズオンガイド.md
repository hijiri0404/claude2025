# AWS CloudFormation ハンズオンガイド

> **対象**: AWS DevOps Professional (DOP-C02) 試験対策
> **前提知識**: AWS基礎、YAML/JSON、IaC基本概念
> **所要時間**: 約4時間

---

## 目次

1. [CloudFormation概要](#1-cloudformation概要)
2. [テンプレート構造](#2-テンプレート構造)
3. [スタック操作](#3-スタック操作)
4. [Change Set（変更セット）](#4-change-set変更セット)
5. [StackSets（スタックセット）](#5-stacksetsスタックセット)
6. [ネストスタック vs クロススタック参照](#6-ネストスタック-vs-クロススタック参照)
7. [ドリフト検出](#7-ドリフト検出)
8. [ヘルパースクリプト](#8-ヘルパースクリプト)
9. [高度な機能](#9-高度な機能)
10. [ハンズオン演習](#10-ハンズオン演習)
11. [DOP試験対策チェックリスト](#11-dop試験対策チェックリスト)

---

## 1. CloudFormation概要

### 1.1 CloudFormationとは

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AWS CloudFormation                                │
│                    Infrastructure as Code (IaC)                       │
│                                                                      │
│  ┌────────────────────┐     ┌────────────────┐     ┌──────────────┐│
│  │   Template         │     │     Stack      │     │  Resources   ││
│  │   (YAML/JSON)      │────▶│   (管理単位)    │────▶│  (実リソース) ││
│  │                    │     │                │     │              ││
│  │  ・リソース定義    │     │ ・作成/更新/削除│     │ ・EC2        ││
│  │  ・パラメータ      │     │ ・ロールバック  │     │ ・S3         ││
│  │  ・出力値          │     │ ・イベント追跡  │     │ ・VPC        ││
│  └────────────────────┘     └────────────────┘     └──────────────┘│
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                      高度な機能                                │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │ │
│  │  │ Change   │ │StackSets │ │  Drift   │ │  Nested  │        │ │
│  │  │  Sets    │ │          │ │Detection │ │  Stacks  │        │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 DOP試験での出題ポイント

| トピック | 重要度 | 主な出題内容 |
|---------|--------|-------------|
| **Change Set** | ★★★★★ | 本番環境での安全な更新 |
| **StackSets** | ★★★★★ | マルチアカウント・リージョン展開 |
| **ドリフト検出** | ★★★★★ | 設定変更の検出と対応 |
| **ネストスタック** | ★★★★☆ | テンプレートのモジュール化 |
| **ロールバック** | ★★★★☆ | 失敗時の動作理解 |
| **ヘルパースクリプト** | ★★★☆☆ | cfn-init, cfn-signal |
| **カスタムリソース** | ★★★☆☆ | Lambda連携 |
| **マクロ/トランスフォーム** | ★★☆☆☆ | SAM変換等 |

---

## 2. テンプレート構造

### 2.1 テンプレートの全体構成

```yaml
AWSTemplateFormatVersion: '2010-09-09'  # 必須（固定値）
Description: "テンプレートの説明"

# ── メタデータ（任意） ──
Metadata:
  AWS::CloudFormation::Interface:
    ParameterGroups:
      - Label: { default: "ネットワーク設定" }
        Parameters: [VpcCIDR, SubnetCIDR]

# ── パラメータ（任意） ──
Parameters:
  Environment:
    Type: String
    Default: dev
    AllowedValues: [dev, staging, prod]
    Description: "デプロイ環境"

  InstanceType:
    Type: String
    Default: t3.micro
    AllowedValues: [t3.micro, t3.small, t3.medium]

# ── マッピング（任意） ──
Mappings:
  RegionAMI:
    ap-northeast-1:
      HVM64: ami-0abcdef1234567890
    us-east-1:
      HVM64: ami-0fedcba0987654321

# ── 条件（任意） ──
Conditions:
  IsProd: !Equals [!Ref Environment, prod]
  CreateReadReplica: !And
    - !Condition IsProd
    - !Equals [!Ref AWS::Region, ap-northeast-1]

# ── リソース（必須・唯一の必須セクション） ──
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "${Environment}-${AWS::AccountId}-data"
    DeletionPolicy: Retain  # スタック削除時にリソースを保持

# ── 出力（任意） ──
Outputs:
  BucketArn:
    Description: "S3バケットARN"
    Value: !GetAtt MyBucket.Arn
    Export:
      Name: !Sub "${AWS::StackName}-BucketArn"
```

### 2.2 組込み関数（Intrinsic Functions）

| 関数 | 用途 | 例 |
|------|------|-----|
| `!Ref` | パラメータ/リソースの参照 | `!Ref MyBucket` |
| `!Sub` | 文字列置換 | `!Sub "${AWS::StackName}-bucket"` |
| `!GetAtt` | リソース属性取得 | `!GetAtt MyBucket.Arn` |
| `!Join` | 文字列結合 | `!Join ["-", [!Ref Env, "app"]]` |
| `!Select` | リスト要素選択 | `!Select [0, !GetAZs ""]` |
| `!Split` | 文字列分割 | `!Split [",", "a,b,c"]` |
| `!If` | 条件分岐 | `!If [IsProd, m5.large, t3.micro]` |
| `!FindInMap` | マッピング検索 | `!FindInMap [RegionAMI, !Ref "AWS::Region", HVM64]` |
| `!ImportValue` | クロススタック参照 | `!ImportValue "VPC-Id"` |
| `!GetAZs` | AZ一覧取得 | `!GetAZs ""` |
| `!Cidr` | CIDRブロック生成 | `!Cidr [!Ref VpcCidr, 6, 8]` |

### 2.3 擬似パラメータ

| パラメータ | 値の例 |
|----------|--------|
| `AWS::AccountId` | 123456789012 |
| `AWS::Region` | ap-northeast-1 |
| `AWS::StackName` | my-stack |
| `AWS::StackId` | arn:aws:cloudformation:... |
| `AWS::NoValue` | 条件付きプロパティ除外 |
| `AWS::URLSuffix` | amazonaws.com |

### 2.4 DeletionPolicy / UpdateReplacePolicy

| ポリシー | 説明 | ユースケース |
|---------|------|-------------|
| **Delete** | リソース削除（デフォルト） | テスト環境 |
| **Retain** | リソース保持 | 本番DB、S3データ |
| **Snapshot** | スナップショット作成後に削除 | RDS、EBS |

```yaml
Resources:
  ProductionDB:
    Type: AWS::RDS::DBInstance
    DeletionPolicy: Snapshot        # スタック削除時にスナップショット
    UpdateReplacePolicy: Snapshot   # 置換更新時にスナップショット
    Properties:
      Engine: mysql
      DBInstanceClass: db.t3.medium
```

---

## 3. スタック操作

### 3.1 スタックライフサイクル

```
【スタックライフサイクル】

  Create                  Update                  Delete
    │                      │                        │
    ▼                      ▼                        ▼
┌──────────┐        ┌──────────┐            ┌──────────┐
│CREATE_IN_│        │UPDATE_IN_│            │DELETE_IN_│
│PROGRESS  │        │PROGRESS  │            │PROGRESS  │
└────┬─────┘        └────┬─────┘            └────┬─────┘
     │                   │                       │
   ┌─┴─┐              ┌─┴─┐                   ┌─┴─┐
   │   │              │   │                   │   │
   ▼   ▼              ▼   ▼                   ▼   ▼
┌─────┐┌──────┐  ┌─────┐┌──────────┐   ┌─────┐┌──────┐
│COMP-││ROLL- │  │COMP-││UPDATE_   │   │COMP-││DELETE│
│LETE ││BACK_ │  │LETE ││ROLLBACK_ │   │LETE ││FAILED│
│     ││COMP- │  │     ││COMPLETE  │   │     ││      │
└─────┘│LETE  │  └─────┘└──────────┘   └─────┘└──────┘
       └──────┘
```

### 3.2 スタック作成

```bash
# テンプレートからスタック作成
aws cloudformation create-stack \
  --stack-name my-app-stack \
  --template-body file://template.yaml \
  --parameters \
    ParameterKey=Environment,ParameterValue=prod \
    ParameterKey=InstanceType,ParameterValue=t3.small \
  --capabilities CAPABILITY_NAMED_IAM \
  --tags Key=Project,Value=MyApp \
  --on-failure ROLLBACK

# 作成完了まで待機
aws cloudformation wait stack-create-complete \
  --stack-name my-app-stack

# スタック状態確認
aws cloudformation describe-stacks --stack-name my-app-stack
```

### 3.3 スタック更新

```bash
# 直接更新（本番では非推奨 → Change Setを使う）
aws cloudformation update-stack \
  --stack-name my-app-stack \
  --template-body file://template-v2.yaml \
  --parameters \
    ParameterKey=Environment,ParameterValue=prod \
    ParameterKey=InstanceType,ParameterValue=t3.medium \
  --capabilities CAPABILITY_NAMED_IAM
```

### 3.4 リソース更新の種類

```
【更新タイプとリスク】

┌─────────────────────────────────────────────────────────────┐
│  Update with No Interruption（中断なし）                    │
│  例: タグ変更、Lambda関数コード更新                         │
│  リスク: ★☆☆☆☆                                            │
├─────────────────────────────────────────────────────────────┤
│  Update with Some Interruption（一部中断）                  │
│  例: EC2インスタンスタイプ変更                              │
│  リスク: ★★★☆☆                                            │
├─────────────────────────────────────────────────────────────┤
│  Replacement（置換 = 旧リソース削除 + 新リソース作成）      │
│  例: RDS DBInstanceIdentifier変更、EC2 AMI変更             │
│  リスク: ★★★★★                                            │
└─────────────────────────────────────────────────────────────┘
```

### 3.5 ロールバック設定

```bash
# ロールバック設定付きスタック作成
aws cloudformation create-stack \
  --stack-name my-app-stack \
  --template-body file://template.yaml \
  --on-failure ROLLBACK \
  --rollback-configuration '{
    "RollbackTriggers": [
      {
        "Arn": "arn:aws:cloudwatch:ap-northeast-1:123456789012:alarm:HighErrorRate",
        "Type": "AWS::CloudWatch::Alarm"
      }
    ],
    "MonitoringTimeInMinutes": 10
  }'
```

---

## 4. Change Set（変更セット）

### 4.1 Change Setのワークフロー

```
【Change Set ワークフロー】

Step 1: 変更セット作成
┌────────────────┐     ┌────────────────┐
│  現在のスタック │     │  新テンプレート │
│  (template v1)  │     │  (template v2)  │
└───────┬────────┘     └───────┬────────┘
        │                      │
        └──────────┬───────────┘
                   ▼
         ┌─────────────────┐
         │   Change Set    │
         │  (差分計算)     │
         └────────┬────────┘
                  │
Step 2: 変更内容レビュー
                  ▼
         ┌─────────────────────────────┐
         │ 変更一覧                    │
         │ ├─ Add: NewSecurityGroup    │
         │ ├─ Modify: WebServer (置換) │
         │ └─ Remove: OldBucket       │
         └────────┬────────────────────┘
                  │
Step 3: 実行 or 削除
            ┌─────┴─────┐
            ▼           ▼
    ┌──────────┐  ┌──────────┐
    │  Execute │  │  Delete  │
    │ (適用)   │  │ (破棄)   │
    └──────────┘  └──────────┘
```

### 4.2 Change Set操作

```bash
# 1. 変更セット作成
aws cloudformation create-change-set \
  --stack-name my-app-stack \
  --change-set-name update-instance-type \
  --template-body file://template-v2.yaml \
  --parameters ParameterKey=InstanceType,ParameterValue=t3.medium \
  --capabilities CAPABILITY_NAMED_IAM \
  --description "インスタンスタイプをt3.microからt3.mediumに変更"

# 2. 変更内容確認
aws cloudformation describe-change-set \
  --stack-name my-app-stack \
  --change-set-name update-instance-type

# 3. 変更セット実行（承認後）
aws cloudformation execute-change-set \
  --stack-name my-app-stack \
  --change-set-name update-instance-type

# 4. 不要な変更セット削除
aws cloudformation delete-change-set \
  --stack-name my-app-stack \
  --change-set-name update-instance-type
```

### 4.3 Change Setの出力例

```json
{
  "Changes": [
    {
      "Type": "Resource",
      "ResourceChange": {
        "Action": "Modify",
        "LogicalResourceId": "WebServer",
        "PhysicalResourceId": "i-1234567890abcdef0",
        "ResourceType": "AWS::EC2::Instance",
        "Replacement": "True",
        "Details": [
          {
            "Target": {
              "Attribute": "Properties",
              "Name": "InstanceType"
            },
            "ChangeSource": "DirectModification"
          }
        ]
      }
    }
  ]
}
```

---

## 5. StackSets（スタックセット）

### 5.1 StackSetsアーキテクチャ

```
【StackSets 構成】

┌─────────────────────────────────────────────────────────────┐
│                  Administrator Account                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    StackSet                           │  │
│  │                "security-baseline"                    │  │
│  │                                                       │  │
│  │  Template: セキュリティベースライン設定               │  │
│  │  Permission: SERVICE_MANAGED (Organizations連携)      │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ デプロイ
              ┌────────────┼────────────┐
              ▼            ▼            ▼
┌──────────────────┐┌──────────────────┐┌──────────────────┐
│  Target Acct A   ││  Target Acct B   ││  Target Acct C   │
│  Stack Instance  ││  Stack Instance  ││  Stack Instance  │
│                  ││                  ││                  │
│  ap-northeast-1  ││  ap-northeast-1  ││  ap-northeast-1  │
│  us-east-1       ││  us-east-1       ││  us-east-1       │
└──────────────────┘└──────────────────┘└──────────────────┘
```

### 5.2 権限モデル

| 権限モデル | 説明 | ユースケース |
|----------|------|-------------|
| **Self-managed** | IAMロールを手動設定 | Organizations未使用の場合 |
| **Service-managed** | Organizations連携で自動 | Organizations使用時（推奨） |

### 5.3 StackSet操作

```bash
# StackSet作成（Organizations連携）
aws cloudformation create-stack-set \
  --stack-set-name security-baseline \
  --template-body file://security-baseline.yaml \
  --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false \
  --capabilities CAPABILITY_NAMED_IAM

# スタックインスタンスの作成（特定OU・リージョンへ展開）
aws cloudformation create-stack-instances \
  --stack-set-name security-baseline \
  --deployment-targets OrganizationalUnitIds=ou-xxxx-xxxxxxxx \
  --regions ap-northeast-1 us-east-1 \
  --operation-preferences \
    FailureTolerancePercentage=10,MaxConcurrentPercentage=25

# StackSet更新
aws cloudformation update-stack-set \
  --stack-set-name security-baseline \
  --template-body file://security-baseline-v2.yaml

# ステータス確認
aws cloudformation describe-stack-set \
  --stack-set-name security-baseline

aws cloudformation list-stack-instances \
  --stack-set-name security-baseline
```

### 5.4 デプロイオプション

| パラメータ | 説明 | 推奨値 |
|----------|------|--------|
| **MaxConcurrentPercentage** | 同時デプロイの割合 | 25% |
| **FailureTolerancePercentage** | 許容失敗割合 | 10% |
| **MaxConcurrentCount** | 同時デプロイ数 | 具体的な数値指定 |
| **RegionOrder** | リージョン展開順序 | テスト→本番の順 |

---

## 6. ネストスタック vs クロススタック参照

### 6.1 比較

```
【ネストスタック vs クロススタック参照】

ネストスタック                         クロススタック参照
┌──────────────────────┐              ┌──────────────────────┐
│ Parent Stack          │              │  Stack A (VPC)       │
│  ┌────────────────┐  │              │  Outputs:            │
│  │ VPC Stack      │  │              │    VpcId:            │
│  │ (Child)        │  │              │      Export:          │
│  └────────────────┘  │              │        Name: VPC-Id  │
│  ┌────────────────┐  │              └──────────────────────┘
│  │ App Stack      │  │                       │
│  │ (Child)        │  │                       │ !ImportValue
│  └────────────────┘  │                       ▼
│  ┌────────────────┐  │              ┌──────────────────────┐
│  │ DB Stack       │  │              │  Stack B (App)       │
│  │ (Child)        │  │              │  VpcId:              │
│  └────────────────┘  │              │    !ImportValue VPC-Id│
└──────────────────────┘              └──────────────────────┘

ライフサイクル: 一緒に管理            ライフサイクル: 独立
再利用性: テンプレート共有            共有: Export/Import
```

| 項目 | ネストスタック | クロススタック参照 |
|------|-------------|------------------|
| **ライフサイクル** | 親と一緒 | 独立 |
| **再利用性** | テンプレートを共有 | 値を共有 |
| **更新** | 親スタックで一括 | 各スタック個別 |
| **チーム間共有** | 同一テンプレート | Export/Import |
| **ユースケース** | コンポーネント分割 | レイヤー間の値共有 |

### 6.2 ネストスタック

```yaml
# 親テンプレート
Resources:
  VPCStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: https://s3.amazonaws.com/my-templates/vpc.yaml
      Parameters:
        VpcCIDR: "10.0.0.0/16"

  AppStack:
    Type: AWS::CloudFormation::Stack
    DependsOn: VPCStack
    Properties:
      TemplateURL: https://s3.amazonaws.com/my-templates/app.yaml
      Parameters:
        VpcId: !GetAtt VPCStack.Outputs.VpcId
        SubnetId: !GetAtt VPCStack.Outputs.SubnetId
```

### 6.3 クロススタック参照

```yaml
# スタックA（エクスポート側）
Outputs:
  VpcId:
    Value: !Ref MyVPC
    Export:
      Name: !Sub "${AWS::StackName}-VpcId"

# スタックB（インポート側）
Resources:
  MyInstance:
    Type: AWS::EC2::Instance
    Properties:
      SubnetId: !ImportValue "StackA-SubnetId"
```

---

## 7. ドリフト検出

### 7.1 ドリフト検出の仕組み

```
【ドリフト検出フロー】

CloudFormation          AWS Resources
┌─────────────┐       ┌─────────────┐
│ Expected    │       │  Actual     │
│ Config      │       │  Config     │
│             │  比較  │             │
│ SG: 443のみ │◄─────▶│ SG: 443,22  │  ← 手動で22番を追加
│             │       │             │
└─────────────┘       └─────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Drift Status: DRIFTED               │
│                                      │
│ Resource: SecurityGroup              │
│ Drift: MODIFIED                      │
│ Property: IngressRules               │
│ Expected: [443]                      │
│ Actual: [443, 22]                    │
│ Difference: ADD port 22             │
└─────────────────────────────────────┘
```

### 7.2 ドリフトステータス

| ステータス | 説明 |
|----------|------|
| **IN_SYNC** | テンプレートと一致 |
| **DRIFTED** | 差分あり（手動変更検出） |
| **NOT_CHECKED** | 未チェック |
| **DELETED** | リソースが削除済み |

### 7.3 ドリフト検出の実行

```bash
# ドリフト検出の開始
aws cloudformation detect-stack-drift \
  --stack-name my-app-stack

# ドリフト検出ステータスの確認
aws cloudformation describe-stack-drift-detection-status \
  --stack-drift-detection-id DETECTION_ID

# ドリフトしたリソースの詳細確認
aws cloudformation describe-stack-resource-drifts \
  --stack-name my-app-stack \
  --stack-resource-drift-status-filters MODIFIED DELETED
```

### 7.4 ドリフトへの対応パターン

```
【ドリフト対応フロー】

ドリフト検出
    │
    ├─ パターン1: テンプレートを実態に合わせる
    │  → テンプレート修正 → スタック更新
    │
    ├─ パターン2: リソースをテンプレートに戻す
    │  → スタック更新（テンプレートそのまま）
    │
    ├─ パターン3: Import（リソースをスタックに取り込む）
    │  → resource-to-import で既存リソースを管理下に
    │
    └─ パターン4: 無視（ドキュメント化して管理）
       → 運用で許容する変更の場合
```

---

## 8. ヘルパースクリプト

### 8.1 ヘルパースクリプトの種類

```
【CloudFormation ヘルパースクリプト】

EC2インスタンス起動時に使用

┌──────────────────────────────────────────────────────────┐
│                                                          │
│  cfn-init     ─── メタデータに基づくリソース設定         │
│                   (パッケージ、ファイル、サービス)        │
│                                                          │
│  cfn-signal   ─── スタックにシグナル送信                 │
│                   (CreationPolicy/WaitCondition)          │
│                                                          │
│  cfn-get-metadata ── メタデータの取得                    │
│                                                          │
│  cfn-hup      ─── メタデータ変更の検出・自動更新         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 8.2 cfn-init + cfn-signal

```yaml
Resources:
  WebServer:
    Type: AWS::EC2::Instance
    Metadata:
      AWS::CloudFormation::Init:
        configSets:
          default:
            - install
            - configure
            - start
        install:
          packages:
            yum:
              httpd: []
              php: []
          files:
            /var/www/html/index.html:
              content: |
                <h1>Hello from CloudFormation</h1>
              mode: '000644'
              owner: apache
              group: apache
        configure:
          commands:
            01_set_timezone:
              command: "timedatectl set-timezone Asia/Tokyo"
        start:
          services:
            sysvinit:
              httpd:
                enabled: true
                ensureRunning: true
    CreationPolicy:
      ResourceSignal:
        Count: 1
        Timeout: PT10M  # 10分以内にシグナル受信
    Properties:
      InstanceType: t3.micro
      ImageId: !Ref AMI
      UserData:
        Fn::Base64: !Sub |
          #!/bin/bash -xe
          yum update -y aws-cfn-bootstrap

          # cfn-init実行
          /opt/aws/bin/cfn-init -v \
            --stack ${AWS::StackName} \
            --resource WebServer \
            --region ${AWS::Region}

          # cfn-signal送信（成功/失敗をスタックに通知）
          /opt/aws/bin/cfn-signal -e $? \
            --stack ${AWS::StackName} \
            --resource WebServer \
            --region ${AWS::Region}
```

### 8.3 WaitCondition

```yaml
Resources:
  WaitHandle:
    Type: AWS::CloudFormation::WaitConditionHandle

  WaitCondition:
    Type: AWS::CloudFormation::WaitCondition
    DependsOn: WebServer
    Properties:
      Handle: !Ref WaitHandle
      Timeout: 600      # 10分待機
      Count: 1          # 1つのシグナルを待つ

  WebServer:
    Type: AWS::EC2::Instance
    Properties:
      UserData:
        Fn::Base64: !Sub |
          #!/bin/bash
          # セットアップ処理...

          # WaitConditionにシグナル送信
          /opt/aws/bin/cfn-signal -e 0 \
            --data "Setup complete" \
            '${WaitHandle}'
```

---

## 9. 高度な機能

### 9.1 カスタムリソース

```
【カスタムリソースの仕組み】

CloudFormation                  Lambda Function
┌──────────────┐               ┌──────────────┐
│ Custom       │  ──Request──▶ │  処理実行    │
│ Resource     │               │              │
│              │  ◀─Response── │  結果返却    │
└──────────────┘               └──────────────┘
                                      │
                                      ▼
                               ┌──────────────┐
                               │ 外部サービス  │
                               │ (DNS設定等)   │
                               └──────────────┘
```

```yaml
Resources:
  CustomResource:
    Type: Custom::MyCustomResource
    Properties:
      ServiceToken: !GetAtt CustomFunction.Arn
      Param1: "value1"

  CustomFunction:
    Type: AWS::Lambda::Function
    Properties:
      Runtime: python3.12
      Handler: index.handler
      Code:
        ZipFile: |
          import cfnresponse
          import boto3

          def handler(event, context):
              try:
                  if event['RequestType'] == 'Create':
                      # 作成時の処理
                      result = "Created"
                  elif event['RequestType'] == 'Update':
                      result = "Updated"
                  elif event['RequestType'] == 'Delete':
                      result = "Deleted"

                  cfnresponse.send(event, context,
                    cfnresponse.SUCCESS,
                    {"Result": result})
              except Exception as e:
                  cfnresponse.send(event, context,
                    cfnresponse.FAILED,
                    {"Error": str(e)})
```

### 9.2 リソースインポート

```bash
# 既存リソースをスタックにインポート
aws cloudformation create-change-set \
  --stack-name my-stack \
  --change-set-name import-existing-bucket \
  --change-set-type IMPORT \
  --template-body file://template-with-import.yaml \
  --resources-to-import '[
    {
      "ResourceType": "AWS::S3::Bucket",
      "LogicalResourceId": "ExistingBucket",
      "ResourceIdentifier": {
        "BucketName": "my-existing-bucket-12345"
      }
    }
  ]'

# インポート実行
aws cloudformation execute-change-set \
  --stack-name my-stack \
  --change-set-name import-existing-bucket
```

### 9.3 スタックポリシー

```json
// スタックポリシー: 本番DBの意図しない更新を防止
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "Update:*",
      "Principal": "*",
      "Resource": "*"
    },
    {
      "Effect": "Deny",
      "Action": "Update:Replace",
      "Principal": "*",
      "Resource": "LogicalResourceId/ProductionDB"
    }
  ]
}
```

```bash
# スタックポリシーの設定
aws cloudformation set-stack-policy \
  --stack-name my-app-stack \
  --stack-policy-body file://stack-policy.json
```

### 9.4 トランスフォーム（SAM）

```yaml
# SAMテンプレート（CloudFormationのマクロ）
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31  # SAMトランスフォーム

Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: index.handler
      Runtime: python3.12
      CodeUri: ./src
      Events:
        Api:
          Type: Api
          Properties:
            Path: /hello
            Method: get
```

### 9.5 動的参照（Secrets Manager / Parameter Store）

```yaml
# Secrets Manager からの動的参照
Resources:
  MyRDSInstance:
    Type: AWS::RDS::DBInstance
    Properties:
      Engine: mysql
      DBInstanceClass: db.t3.micro
      MasterUsername: '{{resolve:secretsmanager:MyDBSecret:SecretString:username}}'
      MasterUserPassword: '{{resolve:secretsmanager:MyDBSecret:SecretString:password}}'

# Parameter Store からの動的参照
Resources:
  MyInstance:
    Type: AWS::EC2::Instance
    Properties:
      ImageId: '{{resolve:ssm:/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2}}'
      InstanceType: '{{resolve:ssm:/myapp/config/instance-type}}'
      # SecureString の場合
      # SomeSecret: '{{resolve:ssm-secure:/myapp/secrets/api-key}}'
```

**動的参照の構文:**
```
{{resolve:service:reference-key}}

# Secrets Manager
{{resolve:secretsmanager:secret-id:SecretString:json-key:version-stage:version-id}}

# Parameter Store
{{resolve:ssm:parameter-name:version}}
{{resolve:ssm-secure:parameter-name:version}}  # SecureString
```

**DOP重要ポイント:**
- スタック作成/更新時に値が解決される
- テンプレートにシークレットを直接記載しなくて済む
- バージョン指定で特定バージョンを参照可能

---

## 10. デプロイ戦略

### 10.1 CloudFormationでのBlue/Greenデプロイ

```
【Blue/Green デプロイパターン】

Step 1: Blue環境が本番稼働中
┌─────────────────┐     ┌─────────────────┐
│ Route 53 / ALB  │────▶│  Blue Stack     │
│                 │     │  (現行Version)  │
└─────────────────┘     └─────────────────┘

Step 2: Green環境を別スタックで作成
┌─────────────────┐     ┌─────────────────┐
│ Route 53 / ALB  │────▶│  Blue Stack     │
│                 │     └─────────────────┘
│  （まだBlueに   │     ┌─────────────────┐
│   向いている）  │     │  Green Stack    │
└─────────────────┘     │  (新Version)    │
                        └─────────────────┘

Step 3: トラフィックをGreenに切替
┌─────────────────┐     ┌─────────────────┐
│ Route 53 / ALB  │     │  Blue Stack     │
│                 │     └─────────────────┘
│  （Greenに     │     ┌─────────────────┐
│   切替完了）    │────▶│  Green Stack    │
└─────────────────┘     └─────────────────┘

Step 4: Blue環境を削除（またはロールバック用に保持）
```

### 10.2 Auto Scaling ローリング更新

```yaml
Resources:
  AutoScalingGroup:
    Type: AWS::AutoScaling::AutoScalingGroup
    UpdatePolicy:
      AutoScalingRollingUpdate:
        MinInstancesInService: 2        # 更新中も最低2台稼働
        MaxBatchSize: 1                  # 1台ずつ更新
        PauseTime: PT5M                  # 各バッチ後5分待機
        WaitOnResourceSignals: true      # cfn-signalを待つ
        SuspendProcesses:
          - HealthCheck
          - ReplaceUnhealthy
          - AZRebalance
          - AlarmNotification
          - ScheduledActions
    Properties:
      LaunchTemplate:
        LaunchTemplateId: !Ref LaunchTemplate
        Version: !GetAtt LaunchTemplate.LatestVersionNumber
      MinSize: 2
      MaxSize: 4
      DesiredCapacity: 2

  LaunchTemplate:
    Type: AWS::EC2::LaunchTemplate
    Properties:
      LaunchTemplateData:
        ImageId: !Ref AMI
        InstanceType: t3.small
        UserData:
          Fn::Base64: !Sub |
            #!/bin/bash
            yum update -y
            # アプリケーションセットアップ...

            # セットアップ完了をシグナル
            /opt/aws/bin/cfn-signal -e $? \
              --stack ${AWS::StackName} \
              --resource AutoScalingGroup \
              --region ${AWS::Region}
```

### 10.3 UpdatePolicy オプション

| オプション | 対象リソース | 説明 |
|-----------|------------|------|
| **AutoScalingRollingUpdate** | ASG | インスタンスを段階的に置換 |
| **AutoScalingReplacingUpdate** | ASG | 新ASGを作成して切替 |
| **AutoScalingScheduledAction** | ASG | スケジュールアクションの保持 |
| **EnableVersionUpgrade** | OpenSearch/ES | バージョンアップを許可 |

---

## 11. トラブルシューティング

### 11.1 よくあるエラーと対処法

```
【CREATE_FAILED 時の対処】

1. スタックイベントで失敗原因を特定
   aws cloudformation describe-stack-events \
     --stack-name my-stack \
     --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]'

2. よくある原因と対処
   ┌─────────────────────────────────────────────────────────────┐
   │ エラー                    │ 原因          │ 対処           │
   ├─────────────────────────────────────────────────────────────┤
   │ Resource already exists  │ 同名リソース存在│ 名前変更 or    │
   │                          │               │ 既存削除       │
   ├─────────────────────────────────────────────────────────────┤
   │ Limit exceeded           │ クォータ超過   │ 上限緩和申請   │
   ├─────────────────────────────────────────────────────────────┤
   │ Access Denied            │ IAM権限不足   │ capabilities   │
   │                          │               │ 追加 or 権限付与│
   ├─────────────────────────────────────────────────────────────┤
   │ Invalid parameter        │ パラメータ誤り │ 値の検証       │
   ├─────────────────────────────────────────────────────────────┤
   │ Timeout (CreationPolicy) │ シグナル未受信 │ UserData確認   │
   │                          │               │ タイムアウト延長│
   └─────────────────────────────────────────────────────────────┘
```

### 11.2 ROLLBACK_FAILED からの復旧

```bash
# ROLLBACK_FAILED状態のスタックを削除可能にする

# 1. 失敗しているリソースを特定
aws cloudformation describe-stack-resources \
  --stack-name my-stack \
  --query 'StackResources[?ResourceStatus==`DELETE_FAILED`].LogicalResourceId'

# 2. 問題リソースをスキップしてスタック削除
aws cloudformation delete-stack \
  --stack-name my-stack \
  --retain-resources LogicalResourceId1 LogicalResourceId2

# 3. 手動でリソースを削除（必要に応じて）
```

### 11.3 UPDATE_ROLLBACK_FAILED からの復旧

```bash
# 1. continue-update-rollback でロールバックを再試行
aws cloudformation continue-update-rollback \
  --stack-name my-stack

# 2. 特定リソースをスキップしてロールバック
aws cloudformation continue-update-rollback \
  --stack-name my-stack \
  --resources-to-skip LogicalResourceId1
```

### 11.4 スタック削除が進まない場合

```
削除が進まない原因:
1. S3バケットが空でない → オブジェクト削除 or DeletionPolicy: Retain
2. Exportされた値が参照中 → 参照しているスタックを先に更新
3. ENIがLambda VPCで使用中 → Lambda削除後しばらく待つ
4. リソースに依存関係がある → 手動で依存リソースを削除
5. IAMロールが削除できない → 関連サービスリンクロールを確認
```

---

## 12. ハンズオン演習

### 12.1 演習1: スタック作成と更新

```bash
# テンプレート作成
cat > /tmp/cfn-handson.yaml << 'EOF'
AWSTemplateFormatVersion: '2010-09-09'
Description: CloudFormation Hands-on

Parameters:
  Environment:
    Type: String
    Default: dev
    AllowedValues: [dev, prod]

Resources:
  HandsonBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "cfn-handson-${AWS::AccountId}-${Environment}"
      Tags:
        - Key: Environment
          Value: !Ref Environment
        - Key: ManagedBy
          Value: CloudFormation

Outputs:
  BucketName:
    Value: !Ref HandsonBucket
    Export:
      Name: !Sub "${AWS::StackName}-BucketName"
  BucketArn:
    Value: !GetAtt HandsonBucket.Arn
EOF

# スタック作成
aws cloudformation create-stack \
  --stack-name cfn-handson \
  --template-body file:///tmp/cfn-handson.yaml \
  --parameters ParameterKey=Environment,ParameterValue=dev

# 完了待ち
aws cloudformation wait stack-create-complete --stack-name cfn-handson

# 出力確認
aws cloudformation describe-stacks \
  --stack-name cfn-handson \
  --query "Stacks[0].Outputs"
```

### 10.2 演習2: Change Set

```bash
# テンプレートv2（タグ追加）
cat > /tmp/cfn-handson-v2.yaml << 'EOF'
AWSTemplateFormatVersion: '2010-09-09'
Description: CloudFormation Hands-on v2

Parameters:
  Environment:
    Type: String
    Default: dev
    AllowedValues: [dev, prod]

Resources:
  HandsonBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "cfn-handson-${AWS::AccountId}-${Environment}"
      VersioningConfiguration:
        Status: Enabled
      Tags:
        - Key: Environment
          Value: !Ref Environment
        - Key: ManagedBy
          Value: CloudFormation
        - Key: Version
          Value: v2

Outputs:
  BucketName:
    Value: !Ref HandsonBucket
    Export:
      Name: !Sub "${AWS::StackName}-BucketName"
  BucketArn:
    Value: !GetAtt HandsonBucket.Arn
EOF

# Change Set作成
aws cloudformation create-change-set \
  --stack-name cfn-handson \
  --change-set-name add-versioning \
  --template-body file:///tmp/cfn-handson-v2.yaml \
  --parameters ParameterKey=Environment,ParameterValue=dev

# 変更内容確認
aws cloudformation describe-change-set \
  --stack-name cfn-handson \
  --change-set-name add-versioning \
  --query "Changes[].ResourceChange.{Action:Action,Resource:LogicalResourceId,Replacement:Replacement}"

# 変更セット実行
aws cloudformation execute-change-set \
  --stack-name cfn-handson \
  --change-set-name add-versioning
```

### 10.3 演習3: ドリフト検出

```bash
# 手動でタグを変更（ドリフトを発生させる）
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name cfn-handson \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" \
  --output text)

aws s3api put-bucket-tagging \
  --bucket ${BUCKET_NAME} \
  --tagging '{"TagSet": [
    {"Key": "Environment", "Value": "dev"},
    {"Key": "ManagedBy", "Value": "Manual"},
    {"Key": "Version", "Value": "v2"}
  ]}'

# ドリフト検出実行
DETECTION_ID=$(aws cloudformation detect-stack-drift \
  --stack-name cfn-handson \
  --query "StackDriftDetectionId" \
  --output text)

# ドリフト検出完了待ち
sleep 10

# ドリフトステータス確認
aws cloudformation describe-stack-drift-detection-status \
  --stack-drift-detection-id ${DETECTION_ID}

# ドリフト詳細確認
aws cloudformation describe-stack-resource-drifts \
  --stack-name cfn-handson
```

### 12.4 演習4: CreationPolicy と cfn-signal

```bash
# EC2インスタンスの準備完了を待つテンプレート
cat > /tmp/cfn-signal.yaml << 'EOF'
AWSTemplateFormatVersion: '2010-09-09'
Description: CreationPolicy and cfn-signal demo

Parameters:
  LatestAmiId:
    Type: AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>
    Default: /aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2

Resources:
  WebServerSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Allow HTTP
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 80
          ToPort: 80
          CidrIp: 0.0.0.0/0

  WebServer:
    Type: AWS::EC2::Instance
    CreationPolicy:
      ResourceSignal:
        Count: 1
        Timeout: PT15M  # 15分以内にシグナル受信
    Metadata:
      AWS::CloudFormation::Init:
        config:
          packages:
            yum:
              httpd: []
          files:
            /var/www/html/index.html:
              content: |
                <h1>Hello from CloudFormation!</h1>
                <p>cfn-init completed successfully.</p>
              mode: '000644'
          services:
            sysvinit:
              httpd:
                enabled: true
                ensureRunning: true
    Properties:
      ImageId: !Ref LatestAmiId
      InstanceType: t3.micro
      SecurityGroupIds:
        - !Ref WebServerSecurityGroup
      UserData:
        Fn::Base64: !Sub |
          #!/bin/bash -xe
          yum update -y aws-cfn-bootstrap

          # cfn-init を実行
          /opt/aws/bin/cfn-init -v \
            --stack ${AWS::StackName} \
            --resource WebServer \
            --region ${AWS::Region}

          # 結果をシグナル送信（$? は直前のコマンドの終了コード）
          /opt/aws/bin/cfn-signal -e $? \
            --stack ${AWS::StackName} \
            --resource WebServer \
            --region ${AWS::Region}

Outputs:
  PublicIP:
    Value: !GetAtt WebServer.PublicIp
EOF

# スタック作成
aws cloudformation create-stack \
  --stack-name cfn-signal-demo \
  --template-body file:///tmp/cfn-signal.yaml \
  --capabilities CAPABILITY_IAM

# 作成状況の監視（シグナル待ち）
aws cloudformation describe-stack-events \
  --stack-name cfn-signal-demo \
  --query 'StackEvents[?LogicalResourceId==`WebServer`].{Time:Timestamp,Status:ResourceStatus,Reason:ResourceStatusReason}' \
  --output table
```

### 12.5 演習5: カスタムリソース（Lambda）

```bash
# カスタムリソースでS3バケットを空にするテンプレート
cat > /tmp/cfn-custom.yaml << 'EOF'
AWSTemplateFormatVersion: '2010-09-09'
Description: Custom Resource demo - Empty S3 bucket on delete

Resources:
  # Lambda実行ロール
  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
      Policies:
        - PolicyName: S3DeletePolicy
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - s3:DeleteObject
                  - s3:DeleteObjectVersion
                  - s3:ListBucket
                  - s3:ListBucketVersions
                Resource: '*'

  # S3バケットを空にするLambda関数
  EmptyBucketFunction:
    Type: AWS::Lambda::Function
    Properties:
      Runtime: python3.12
      Handler: index.handler
      Role: !GetAtt LambdaExecutionRole.Arn
      Timeout: 300
      Code:
        ZipFile: |
          import boto3
          import cfnresponse

          def handler(event, context):
              try:
                  bucket = event['ResourceProperties']['BucketName']

                  if event['RequestType'] == 'Delete':
                      s3 = boto3.resource('s3')
                      bucket_obj = s3.Bucket(bucket)
                      # バージョニング有効の場合も考慮
                      bucket_obj.object_versions.delete()
                      print(f"Emptied bucket: {bucket}")

                  cfnresponse.send(event, context, cfnresponse.SUCCESS, {})
              except Exception as e:
                  print(f"Error: {e}")
                  cfnresponse.send(event, context, cfnresponse.FAILED, {"Error": str(e)})

  # テスト用S3バケット
  TestBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "cfn-custom-demo-${AWS::AccountId}"

  # カスタムリソース（スタック削除時にバケットを空にする）
  EmptyBucketOnDelete:
    Type: Custom::EmptyBucket
    Properties:
      ServiceToken: !GetAtt EmptyBucketFunction.Arn
      BucketName: !Ref TestBucket

Outputs:
  BucketName:
    Value: !Ref TestBucket
EOF

# スタック作成
aws cloudformation create-stack \
  --stack-name cfn-custom-demo \
  --template-body file:///tmp/cfn-custom.yaml \
  --capabilities CAPABILITY_IAM

# テストファイルをアップロード
aws cloudformation wait stack-create-complete --stack-name cfn-custom-demo
BUCKET=$(aws cloudformation describe-stacks --stack-name cfn-custom-demo \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' --output text)
echo "test" | aws s3 cp - s3://${BUCKET}/test.txt

# スタック削除（カスタムリソースがバケットを空にしてから削除）
aws cloudformation delete-stack --stack-name cfn-custom-demo
```

### 12.6 演習6: リソースインポート

```bash
# 1. 既存のS3バケットを作成（CloudFormation外）
IMPORT_BUCKET="cfn-import-demo-$(aws sts get-caller-identity --query Account --output text)"
aws s3 mb s3://${IMPORT_BUCKET}

# 2. インポート用テンプレート作成
cat > /tmp/cfn-import.yaml << EOF
AWSTemplateFormatVersion: '2010-09-09'
Description: Import existing resources demo

Resources:
  ImportedBucket:
    Type: AWS::S3::Bucket
    DeletionPolicy: Retain  # インポート時はRetain推奨
    Properties:
      BucketName: ${IMPORT_BUCKET}

Outputs:
  BucketArn:
    Value: !GetAtt ImportedBucket.Arn
EOF

# 3. インポート用Change Set作成
aws cloudformation create-change-set \
  --stack-name cfn-import-demo \
  --change-set-name import-bucket \
  --change-set-type IMPORT \
  --template-body file:///tmp/cfn-import.yaml \
  --resources-to-import "[{
    \"ResourceType\": \"AWS::S3::Bucket\",
    \"LogicalResourceId\": \"ImportedBucket\",
    \"ResourceIdentifier\": {
      \"BucketName\": \"${IMPORT_BUCKET}\"
    }
  }]"

# 4. Change Set確認
aws cloudformation describe-change-set \
  --stack-name cfn-import-demo \
  --change-set-name import-bucket

# 5. インポート実行
aws cloudformation execute-change-set \
  --stack-name cfn-import-demo \
  --change-set-name import-bucket

# 6. インポート後の確認
aws cloudformation describe-stack-resources \
  --stack-name cfn-import-demo

# クリーンアップ（DeletionPolicy: Retainなのでバケットは残る）
aws cloudformation delete-stack --stack-name cfn-import-demo
aws s3 rb s3://${IMPORT_BUCKET}
```

### 12.7 演習7: StackSets（Organizations使用時）

```bash
# 注意: Organizations環境が必要

# 1. StackSet作成
aws cloudformation create-stack-set \
  --stack-set-name security-baseline-demo \
  --template-body file:///tmp/security-baseline.yaml \
  --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false \
  --capabilities CAPABILITY_NAMED_IAM

# 2. スタックインスタンスを特定OUに展開
aws cloudformation create-stack-instances \
  --stack-set-name security-baseline-demo \
  --deployment-targets OrganizationalUnitIds=ou-xxxx-xxxxxxxx \
  --regions ap-northeast-1 us-east-1 \
  --operation-preferences \
    FailureTolerancePercentage=10,MaxConcurrentPercentage=25

# 3. 展開状況確認
aws cloudformation list-stack-instances \
  --stack-set-name security-baseline-demo \
  --query 'Summaries[].{Account:Account,Region:Region,Status:Status}'

# 4. StackSet更新
aws cloudformation update-stack-set \
  --stack-set-name security-baseline-demo \
  --template-body file:///tmp/security-baseline-v2.yaml

# 5. クリーンアップ
aws cloudformation delete-stack-instances \
  --stack-set-name security-baseline-demo \
  --deployment-targets OrganizationalUnitIds=ou-xxxx-xxxxxxxx \
  --regions ap-northeast-1 us-east-1 \
  --no-retain-stacks

aws cloudformation delete-stack-set \
  --stack-set-name security-baseline-demo
```

### 12.8 クリーンアップ

```bash
# 演習1-3のスタック削除
aws cloudformation delete-stack --stack-name cfn-handson
aws cloudformation wait stack-delete-complete --stack-name cfn-handson

# 演習4のスタック削除
aws cloudformation delete-stack --stack-name cfn-signal-demo

# 演習5のスタック削除
aws cloudformation delete-stack --stack-name cfn-custom-demo
```

---

## 13. DOP試験対策チェックリスト

### テンプレート基礎

- [ ] テンプレートの全セクションとその役割を説明できる
- [ ] 主要な組込み関数（!Ref, !Sub, !GetAtt, !If等）を使い分けできる
- [ ] DeletionPolicy/UpdateReplacePolicyの違いを理解している

<details>
<summary>📝 模範解答を見る</summary>

**テンプレートセクション**:
| セクション | 必須 | 役割 |
|-----------|------|------|
| AWSTemplateFormatVersion | はい | バージョン指定（固定値） |
| Description | いいえ | テンプレートの説明 |
| Metadata | いいえ | コンソールUI制御等 |
| Parameters | いいえ | 外部入力値 |
| Mappings | いいえ | 静的なキー/値マッピング |
| Conditions | いいえ | 条件分岐 |
| Resources | はい | AWSリソース定義 |
| Outputs | いいえ | 出力値・クロススタック共有 |

**DeletionPolicy**:
- Delete: スタック削除時にリソースも削除（デフォルト）
- Retain: リソースを保持（本番DB向け）
- Snapshot: スナップショット取得後に削除（RDS, EBS）

**UpdateReplacePolicy**: 置換更新時の旧リソースに適用
</details>

### スタック操作

- [ ] スタックの状態遷移を理解している
- [ ] ロールバック設定（CloudWatchアラーム連動）を構成できる
- [ ] リソース更新の3種類（No Interruption, Some Interruption, Replacement）を判断できる

<details>
<summary>📝 模範解答を見る</summary>

**スタック状態遷移**:
- CREATE_IN_PROGRESS → CREATE_COMPLETE / ROLLBACK_COMPLETE
- UPDATE_IN_PROGRESS → UPDATE_COMPLETE / UPDATE_ROLLBACK_COMPLETE
- DELETE_IN_PROGRESS → DELETE_COMPLETE / DELETE_FAILED

**ロールバック設定**:
```bash
--rollback-configuration '{
  "RollbackTriggers": [
    {"Arn": "alarm-arn", "Type": "AWS::CloudWatch::Alarm"}
  ],
  "MonitoringTimeInMinutes": 10
}'
```
更新後、指定時間内にアラームが発火するとロールバック

**更新種類の判断**:
- ドキュメントのUpdate requiresを確認
- Replacement = 物理リソースIDが変わる = データ損失のリスク
- Change Setで事前に確認するのがベストプラクティス
</details>

### Change Set

- [ ] Change Setの作成から実行までの手順を実行できる
- [ ] Change Setで確認すべきポイントを理解している
- [ ] 本番環境での安全な更新フローを設計できる

<details>
<summary>📝 模範解答を見る</summary>

**Change Setフロー**:
1. `create-change-set`: 差分計算
2. `describe-change-set`: 変更内容レビュー
3. `execute-change-set`: 適用 or `delete-change-set`: 破棄

**確認すべきポイント**:
- Replacement: True のリソースがないか（データ損失リスク）
- 意図しないリソースの削除がないか
- IAMリソースの変更がないか

**本番環境更新フロー**:
1. Change Set作成
2. レビュー・承認（手動）
3. Change Set実行
4. CloudWatchアラーム監視（ロールバックトリガー）
5. 正常性確認
</details>

### StackSets

- [ ] Service-managedとSelf-managedの違いを理解している
- [ ] マルチアカウント・マルチリージョンへの展開を設定できる
- [ ] デプロイオプション（並列度、失敗許容度）を適切に設定できる

<details>
<summary>📝 模範解答を見る</summary>

**権限モデルの違い**:
| 項目 | Self-managed | Service-managed |
|-----|-------------|-----------------|
| IAMロール | 手動作成 | 自動作成 |
| 対象指定 | アカウントID指定 | OU指定 |
| 自動展開 | 不可 | 新規アカウントに自動展開 |
| 推奨 | Org未使用時 | Org使用時 |

**デプロイオプション設計**:
- MaxConcurrentPercentage: 25%（4アカウント以上の場合）
- FailureTolerancePercentage: 0%（重要な設定は失敗許容なし）
- RegionOrder: テストリージョン → 本番リージョン
</details>

### ドリフト検出

- [ ] ドリフト検出の実行方法と結果の読み方を知っている
- [ ] ドリフトへの対応パターン（4種類）を使い分けできる
- [ ] ドリフト防止の運用戦略を立案できる

<details>
<summary>📝 模範解答を見る</summary>

**ドリフト検出手順**:
1. `detect-stack-drift`: 検出開始
2. `describe-stack-drift-detection-status`: ステータス確認
3. `describe-stack-resource-drifts`: 詳細確認

**対応パターン**:
1. テンプレートを実態に合わせる（変更を承認）
2. スタック更新でリソースを戻す（変更を取り消し）
3. リソースインポート（管理外→管理下に）
4. 無視・ドキュメント化

**ドリフト防止戦略**:
- SCPで手動変更を制限
- Config Ruleで手動変更を検出・通知
- 定期的なドリフトチェック（EventBridge + Lambda）
- IaCを唯一の変更手段にする運用ルール
</details>

### ネストスタック・クロススタック

- [ ] ネストスタックとクロススタック参照の使い分けができる
- [ ] Export/ImportValueの制約を理解している

<details>
<summary>📝 模範解答を見る</summary>

**使い分け**:
| 項目 | ネストスタック | クロススタック |
|-----|-------------|-------------|
| 用途 | コンポーネント分割 | レイヤー間の値共有 |
| ライフサイクル | 親と一緒 | 独立 |
| チーム | 同一チーム | 複数チーム |

**Export/ImportValueの制約**:
- Export名はリージョン内で一意
- Exportされた値を参照するスタックがあると、Exportを含むスタックの削除/更新不可
- クロスリージョンのImportは不可
- 循環参照は不可
</details>

### ヘルパースクリプト・カスタムリソース

- [ ] CreationPolicyとcfn-signalの使い方を理解している
- [ ] WaitConditionの用途を説明できる
- [ ] カスタムリソースの実装パターンを知っている

<details>
<summary>📝 模範解答を見る</summary>

**CreationPolicy + cfn-signal**:
- EC2インスタンスの準備完了を待つ
- Timeout時間内にcfn-signalが送信されないとCREATE_FAILED
- Count: 複数シグナルを待つ場合（ASGで複数インスタンス）
- UserData内で`cfn-signal -e $?`を実行

**WaitCondition**:
- 複数リソース間の同期
- 外部プロセスからのシグナル待機
- CreationPolicyより柔軟（データの受け渡しも可能）

**カスタムリソース**:
- CloudFormation非対応リソースの管理
- スタック削除前のクリーンアップ処理
- 外部APIとの連携
- Lambda関数が`cfnresponse.send()`で結果を返す
</details>

### 動的参照・リソースインポート

- [ ] Secrets Manager/Parameter Storeの動的参照構文を書ける
- [ ] リソースインポートの手順と制約を理解している

<details>
<summary>📝 模範解答を見る</summary>

**動的参照構文**:
```yaml
# Secrets Manager
'{{resolve:secretsmanager:secret-id:SecretString:json-key}}'

# Parameter Store
'{{resolve:ssm:/path/to/param}}'
'{{resolve:ssm-secure:/path/to/secure-param}}'
```

**リソースインポート**:
1. テンプレートに既存リソースの定義を追加（DeletionPolicy: Retain推奨）
2. `create-change-set --change-set-type IMPORT --resources-to-import`
3. Change Set実行
4. リソースがスタック管理下に入る

制約:
- 一度に1リソースタイプのみインポート可能
- 全プロパティを正確に指定する必要あり
- インポート後にプロパティ変更はできない（別途更新が必要）
</details>

### トラブルシューティング

- [ ] ROLLBACK_FAILED/UPDATE_ROLLBACK_FAILEDからの復旧方法を知っている
- [ ] スタック削除が進まない場合の対処法を説明できる

<details>
<summary>📝 模範解答を見る</summary>

**ROLLBACK_FAILED からの復旧**:
```bash
# 問題リソースをスキップして削除
aws cloudformation delete-stack \
  --stack-name my-stack \
  --retain-resources FailedResource1 FailedResource2
```

**UPDATE_ROLLBACK_FAILED からの復旧**:
```bash
# ロールバックを続行
aws cloudformation continue-update-rollback --stack-name my-stack

# 特定リソースをスキップ
aws cloudformation continue-update-rollback \
  --stack-name my-stack \
  --resources-to-skip FailedResource
```

**削除が進まない原因**:
- S3バケットが空でない → カスタムリソースで削除 or 手動削除
- Export値が参照中 → 参照スタックを先に更新
- Lambda VPC ENIが残存 → 時間経過で自動削除（最大40分）
</details>

---

## 付録A: よく使うCLIコマンド

```bash
# スタック操作
aws cloudformation create-stack --stack-name NAME --template-body file://template.yaml
aws cloudformation update-stack --stack-name NAME --template-body file://template.yaml
aws cloudformation delete-stack --stack-name NAME
aws cloudformation describe-stacks --stack-name NAME
aws cloudformation describe-stack-events --stack-name NAME

# Change Set
aws cloudformation create-change-set --stack-name NAME --change-set-name CS_NAME ...
aws cloudformation describe-change-set --stack-name NAME --change-set-name CS_NAME
aws cloudformation execute-change-set --stack-name NAME --change-set-name CS_NAME

# StackSets
aws cloudformation create-stack-set --stack-set-name NAME ...
aws cloudformation create-stack-instances --stack-set-name NAME ...
aws cloudformation list-stack-instances --stack-set-name NAME

# ドリフト検出
aws cloudformation detect-stack-drift --stack-name NAME
aws cloudformation describe-stack-resource-drifts --stack-name NAME

# テンプレート検証
aws cloudformation validate-template --template-body file://template.yaml
```

---

**作成日**: 2026-02-04
**最終更新**: 2026-02-04
**検証環境**: AWS ap-northeast-1 リージョン
