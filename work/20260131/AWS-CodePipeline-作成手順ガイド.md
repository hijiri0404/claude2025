# AWS CodePipeline CI/CD パイプライン作成手順ガイド

## 目次

1. [クイックスタート](#クイックスタート)
2. [アーキテクチャ概要](#アーキテクチャ概要)
3. [前提条件](#前提条件)
4. [作成方法1: マネジメントコンソール（GUI）](#作成方法1-マネジメントコンソールgui)
5. [作成方法2: AWS CLI](#作成方法2-aws-cli)
6. [作成方法3: AWS CDK（推奨）](#作成方法3-aws-cdk推奨)
7. [推奨構成: マルチシステム・マルチ環境](#推奨構成-マルチシステムマルチ環境)
8. [Deployステージと手動承認](#deployステージと手動承認)
9. [トラブルシューティング](#トラブルシューティング)
10. [ベストプラクティス](#ベストプラクティス)

---

## クイックスタート

最速で動作するパイプラインを構築する手順です。

### 1. リポジトリ準備

```bash
# 作業ディレクトリ作成
mkdir my-infra && cd my-infra

# 必要ファイル作成
cat > template.yaml << 'EOF'
AWSTemplateFormatVersion: '2010-09-09'
Description: Sample S3 bucket
Resources:
  SampleBucket:
    Type: AWS::S3::Bucket
Outputs:
  BucketName:
    Value: !Ref SampleBucket
EOF

cat > buildspec.yml << 'EOF'
version: 0.2
phases:
  install:
    runtime-versions:
      nodejs: 20
  build:
    commands:
      - aws cloudformation deploy --template-file template.yaml --stack-name my-sample-stack --no-fail-on-empty-changeset
EOF

# Git初期化
git init && git add . && git commit -m "Initial commit"
```

### 2. CodeCommitにプッシュ

```bash
# リポジトリ作成
aws codecommit create-repository --repository-name my-infra

# プッシュ
git remote add origin https://git-codecommit.ap-northeast-1.amazonaws.com/v1/repos/my-infra
git push -u origin main
```

### 3. パイプライン作成（マネジメントコンソール）

1. CodePipelineコンソール → 「パイプラインを作成」
2. ソース: CodeCommit → `my-infra` → `main`
3. ビルド: CodeBuild → 新規プロジェクト作成（デフォルト設定）
4. デプロイ: **スキップ**（buildspec.yml内でデプロイ）
5. 作成後、CodeBuildロールに`AWSCloudFormationFullAccess`を追加

---

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────┐
│                        CodePipeline                              │
├────────────┬────────────┬────────────┬────────────┬────────────┤
│   Source   │   Build    │  Approval  │   Deploy   │  (Option)  │
│            │            │  (Option)  │  (Option)  │            │
│ CodeCommit → CodeBuild  → 手動承認    → CloudForm  │            │
│ GitHub     │            │            │   ation    │            │
└────────────┴────────────┴────────────┴────────────┴────────────┘
        │            │
        │            └── buildspec.yml で aws cloudformation deploy
        │                または cdk deploy を実行（推奨）
        │
        └── ソースコード変更を検知（EventBridge）
```

### デプロイ方式の選択

| 方式 | 説明 | 推奨用途 |
|------|------|---------|
| **Buildでデプロイ（推奨）** | buildspec.yml内で`aws cloudformation deploy`実行 | 開発・検証・本番すべて |
| **Deployステージ** | CloudFormationアクション使用 | 変更セットプレビューが必要な場合 |

> **注意**: Deployステージ使用時はセッションポリシーの制限でエラーになる場合があります。詳細は[トラブルシューティング](#deployステージのセッションポリシーエラー)参照。

---

## 前提条件

- AWS CLI設定済み（認証情報・リージョン）
- Git インストール済み
- （CDK使用時）Node.js 18以上、CDK CLI

```bash
# 確認コマンド
aws sts get-caller-identity
git --version
node --version  # CDK使用時
```

---

## 作成方法1: マネジメントコンソール（GUI）

学習・検証向けの方法です。

### Step 1: CodeCommitリポジトリ作成

1. [CodeCommitコンソール](https://console.aws.amazon.com/codecommit/)にアクセス
2. 「リポジトリを作成」→ リポジトリ名を入力 → 「作成」

### Step 2: CodeBuildプロジェクト作成

1. [CodeBuildコンソール](https://console.aws.amazon.com/codebuild/) → 「ビルドプロジェクトを作成」

2. 設定項目:

| セクション | 項目 | 値 |
|-----------|------|-----|
| プロジェクト設定 | プロジェクト名 | `my-infra-build` |
| ソース | プロバイダ | `AWS CodeCommit` |
| | リポジトリ | `my-infra` |
| 環境 | イメージ | `aws/codebuild/amazonlinux2-x86_64-standard:5.0` |
| | サービスロール | 新しいサービスロール |
| Buildspec | 設定 | `buildspec ファイルを使用する` |

3. 「ビルドプロジェクトを作成」

### Step 3: CodePipelineパイプライン作成

1. [CodePipelineコンソール](https://console.aws.amazon.com/codepipeline/) → 「パイプラインを作成」

2. 設定項目:

| ステージ | 項目 | 値 |
|---------|------|-----|
| パイプライン設定 | 名前 | `my-infra-pipeline` |
| | パイプラインタイプ | V2（自動選択） |
| ソース | プロバイダ | `AWS CodeCommit` |
| | リポジトリ | `my-infra` |
| | ブランチ | `main` |
| ビルド | プロバイダ | `AWS CodeBuild` |
| | プロジェクト | `my-infra-build` |
| デプロイ | | **スキップ** |

### Step 4: IAMロール権限追加

CodeBuildサービスロールに以下のポリシーを追加:

1. IAMコンソール → ロール → `codebuild-my-infra-build-service-role`
2. 「ポリシーをアタッチ」→ `AWSCloudFormationFullAccess` を追加
3. 必要に応じて `AmazonS3FullAccess`, `IAMFullAccess` も追加

---

## 作成方法2: AWS CLI

自動化スクリプト向けの方法です。

### 一括実行スクリプト

```bash
#!/bin/bash
set -e

# === 変数設定 ===
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)
REPO_NAME="my-infra-repo"
BUILD_PROJECT="my-infra-build"
PIPELINE_NAME="my-infra-pipeline"
ARTIFACT_BUCKET="codepipeline-${REGION}-${ACCOUNT_ID}"

echo "Account: $ACCOUNT_ID, Region: $REGION"

# === 1. CodeCommitリポジトリ作成 ===
aws codecommit create-repository --repository-name $REPO_NAME 2>/dev/null || echo "Repository already exists"

# === 2. IAMロール作成 ===
# CodeBuild用
aws iam create-role \
  --role-name codebuild-${BUILD_PROJECT}-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"codebuild.amazonaws.com"},"Action":"sts:AssumeRole"}]}' 2>/dev/null || true

aws iam attach-role-policy --role-name codebuild-${BUILD_PROJECT}-role --policy-arn arn:aws:iam::aws:policy/AWSCloudFormationFullAccess 2>/dev/null || true
aws iam attach-role-policy --role-name codebuild-${BUILD_PROJECT}-role --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess 2>/dev/null || true
aws iam attach-role-policy --role-name codebuild-${BUILD_PROJECT}-role --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess 2>/dev/null || true
aws iam attach-role-policy --role-name codebuild-${BUILD_PROJECT}-role --policy-arn arn:aws:iam::aws:policy/IAMFullAccess 2>/dev/null || true

# CodePipeline用
aws iam create-role \
  --role-name codepipeline-${PIPELINE_NAME}-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"codepipeline.amazonaws.com"},"Action":"sts:AssumeRole"}]}' 2>/dev/null || true

aws iam attach-role-policy --role-name codepipeline-${PIPELINE_NAME}-role --policy-arn arn:aws:iam::aws:policy/AWSCodeCommitFullAccess 2>/dev/null || true
aws iam attach-role-policy --role-name codepipeline-${PIPELINE_NAME}-role --policy-arn arn:aws:iam::aws:policy/AWSCodeBuildDeveloperAccess 2>/dev/null || true
aws iam attach-role-policy --role-name codepipeline-${PIPELINE_NAME}-role --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess 2>/dev/null || true

echo "Waiting for IAM role propagation..."
sleep 10

# === 3. CodeBuildプロジェクト作成 ===
aws codebuild create-project \
  --name $BUILD_PROJECT \
  --source "type=CODECOMMIT,location=https://git-codecommit.${REGION}.amazonaws.com/v1/repos/${REPO_NAME}" \
  --environment "type=LINUX_CONTAINER,computeType=BUILD_GENERAL1_SMALL,image=aws/codebuild/amazonlinux2-x86_64-standard:5.0" \
  --service-role "arn:aws:iam::${ACCOUNT_ID}:role/codebuild-${BUILD_PROJECT}-role" \
  --artifacts "type=NO_ARTIFACTS" 2>/dev/null || echo "Build project already exists"

# === 4. S3バケット作成（アーティファクト用） ===
aws s3api create-bucket \
  --bucket $ARTIFACT_BUCKET \
  --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION 2>/dev/null || true

# === 5. CodePipeline作成 ===
cat > /tmp/pipeline.json << EOF
{
  "name": "${PIPELINE_NAME}",
  "roleArn": "arn:aws:iam::${ACCOUNT_ID}:role/codepipeline-${PIPELINE_NAME}-role",
  "artifactStore": {"type": "S3", "location": "${ARTIFACT_BUCKET}"},
  "stages": [
    {
      "name": "Source",
      "actions": [{
        "name": "Source",
        "actionTypeId": {"category": "Source", "owner": "AWS", "provider": "CodeCommit", "version": "1"},
        "configuration": {"RepositoryName": "${REPO_NAME}", "BranchName": "main", "PollForSourceChanges": "false"},
        "outputArtifacts": [{"name": "SourceOutput"}]
      }]
    },
    {
      "name": "Build",
      "actions": [{
        "name": "Build",
        "actionTypeId": {"category": "Build", "owner": "AWS", "provider": "CodeBuild", "version": "1"},
        "configuration": {"ProjectName": "${BUILD_PROJECT}"},
        "inputArtifacts": [{"name": "SourceOutput"}]
      }]
    }
  ],
  "pipelineType": "V2"
}
EOF

aws codepipeline create-pipeline --cli-input-json file:///tmp/pipeline.json 2>/dev/null || echo "Pipeline already exists"

echo ""
echo "=== Pipeline created successfully ==="
echo "Repository: https://git-codecommit.${REGION}.amazonaws.com/v1/repos/${REPO_NAME}"
echo "Pipeline: https://${REGION}.console.aws.amazon.com/codesuite/codepipeline/pipelines/${PIPELINE_NAME}/view"
```

---

## 作成方法3: AWS CDK（推奨）

本番環境向けの方法です。パイプライン自体をコード管理できます。

### Step 1: プロジェクト初期化

```bash
mkdir pipeline-cdk && cd pipeline-cdk
cdk init app --language typescript
npm install
```

### Step 2: パイプラインスタック

```typescript
// lib/pipeline-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';

interface PipelineStackProps extends cdk.StackProps {
  repositoryName: string;
  pipelineName: string;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    // CodeCommitリポジトリ
    const repository = new codecommit.Repository(this, 'Repository', {
      repositoryName: props.repositoryName,
    });

    // CodeBuildプロジェクト
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
      },
    });

    // 権限付与
    buildProject.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudformation:*', 'iam:*', 's3:*', 'sts:AssumeRole'],
      resources: ['*'],
    }));

    // パイプライン
    const sourceOutput = new codepipeline.Artifact();

    new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: props.pipelineName,
      pipelineType: codepipeline.PipelineType.V2,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.CodeCommitSourceAction({
              actionName: 'Source',
              repository,
              branch: 'main',
              output: sourceOutput,
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Build',
              project: buildProject,
              input: sourceOutput,
            }),
          ],
        },
      ],
    });

    new cdk.CfnOutput(this, 'RepositoryUrl', {
      value: repository.repositoryCloneUrlHttp,
    });
  }
}
```

### Step 3: エントリポイント

```typescript
// bin/pipeline-cdk.ts
#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

new PipelineStack(app, 'MyPipelineStack', {
  repositoryName: 'my-infra',
  pipelineName: 'my-infra-pipeline',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
```

### Step 4: デプロイ

```bash
cdk bootstrap  # 初回のみ
cdk deploy
```

---

## 推奨構成: マルチシステム・マルチ環境

複数システム（system-a, system-b）を複数環境（dev, stg, prod）で管理する構成です。

### ディレクトリ構成

```
recommended-structure/
├── system-a-infra/           # System A用リポジトリ
│   ├── README.md
│   ├── buildspec.yml         # 環境変数でenv切り替え
│   ├── environments/         # 環境別設定
│   │   ├── dev.json
│   │   ├── stg.json
│   │   └── prod.json
│   ├── stacks/               # CloudFormationテンプレート
│   │   ├── 01-network.yaml   # VPC, Subnet
│   │   ├── 02-security.yaml  # IAM, SG
│   │   ├── 03-storage.yaml   # S3, DynamoDB
│   │   ├── 04-compute.yaml   # Lambda, API GW
│   │   └── 05-monitoring.yaml# CloudWatch
│   └── scripts/
│       └── create-pipeline.sh
│
└── system-b-infra/           # System B用リポジトリ
    └── (同様の構成)
```

### 環境設定ファイル

```json
// environments/dev.json
{
  "environment": "dev",
  "systemName": "system-a",
  "stackPrefix": "system-a-dev",
  "parameters": {
    "Environment": "dev",
    "SystemName": "system-a",
    "AlarmEmail": ""
  },
  "stackOrder": [
    "01-network",
    "02-security",
    "03-storage",
    "04-compute",
    "05-monitoring"
  ]
}
```

### buildspec.yml（マルチスタック対応）

```yaml
version: 0.2

env:
  variables:
    ENVIRONMENT: "dev"  # パイプラインの環境変数で上書き

phases:
  install:
    runtime-versions:
      python: 3.12
    commands:
      - yum install -y jq || true

  pre_build:
    commands:
      - export CONFIG_FILE="environments/${ENVIRONMENT}.json"
      - export STACK_PREFIX=$(jq -r '.stackPrefix' $CONFIG_FILE)
      - export SYSTEM_NAME=$(jq -r '.systemName' $CONFIG_FILE)
      - echo "Deploying $STACK_PREFIX"

  build:
    commands:
      - echo "=== 1/5 Network ==="
      - aws cloudformation deploy --template-file stacks/01-network.yaml --stack-name ${STACK_PREFIX}-network --parameter-overrides Environment=${ENVIRONMENT} SystemName=${SYSTEM_NAME} --no-fail-on-empty-changeset
      - echo "=== 2/5 Security ==="
      - aws cloudformation deploy --template-file stacks/02-security.yaml --stack-name ${STACK_PREFIX}-security --parameter-overrides Environment=${ENVIRONMENT} SystemName=${SYSTEM_NAME} --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset
      - echo "=== 3/5 Storage ==="
      - aws cloudformation deploy --template-file stacks/03-storage.yaml --stack-name ${STACK_PREFIX}-storage --parameter-overrides Environment=${ENVIRONMENT} SystemName=${SYSTEM_NAME} --no-fail-on-empty-changeset
      - echo "=== 4/5 Compute ==="
      - aws cloudformation deploy --template-file stacks/04-compute.yaml --stack-name ${STACK_PREFIX}-compute --parameter-overrides Environment=${ENVIRONMENT} SystemName=${SYSTEM_NAME} --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset
      - echo "=== 5/5 Monitoring ==="
      - ALARM_EMAIL=$(jq -r '.parameters.AlarmEmail // ""' $CONFIG_FILE)
      - aws cloudformation deploy --template-file stacks/05-monitoring.yaml --stack-name ${STACK_PREFIX}-monitoring --parameter-overrides Environment=${ENVIRONMENT} SystemName=${SYSTEM_NAME} AlarmEmail="${ALARM_EMAIL}" --no-fail-on-empty-changeset

  post_build:
    commands:
      - echo "All stacks deployed for ${ENVIRONMENT}"
```

### パイプライン作成スクリプト

```bash
#!/bin/bash
# scripts/create-pipeline.sh
# 使用方法: ./scripts/create-pipeline.sh dev

ENVIRONMENT=$1
if [ -z "$ENVIRONMENT" ]; then
    echo "Usage: $0 <dev|stg|prod>"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/../environments/${ENVIRONMENT}.json"

SYSTEM_NAME=$(jq -r '.systemName' "$CONFIG_FILE")
STACK_PREFIX=$(jq -r '.stackPrefix' "$CONFIG_FILE")
REGION=${AWS_REGION:-ap-northeast-1}
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

REPO_NAME="${SYSTEM_NAME}-infra"
PIPELINE_NAME="${STACK_PREFIX}-pipeline"
BUILD_PROJECT="${STACK_PREFIX}-build"

echo "Creating pipeline: $PIPELINE_NAME"

# CodeBuild作成（環境変数でENVIRONMENTを設定）
aws codebuild create-project \
  --name "$BUILD_PROJECT" \
  --source "type=CODECOMMIT,location=https://git-codecommit.${REGION}.amazonaws.com/v1/repos/${REPO_NAME}" \
  --environment "type=LINUX_CONTAINER,computeType=BUILD_GENERAL1_SMALL,image=aws/codebuild/amazonlinux2-x86_64-standard:5.0,environmentVariables=[{name=ENVIRONMENT,value=${ENVIRONMENT}}]" \
  --service-role "arn:aws:iam::${ACCOUNT_ID}:role/${STACK_PREFIX}-codebuild-role" \
  --artifacts "type=NO_ARTIFACTS"

# パイプライン作成（略、CLIセクション参照）
```

### スタック例: 01-network.yaml

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: Network Stack - VPC, Subnets

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, stg, prod]
  SystemName:
    Type: String
    Default: system-a

Resources:
  VPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: !If [IsProd, 10.0.0.0/16, !If [IsStg, 10.1.0.0/16, 10.2.0.0/16]]
      EnableDnsHostnames: true
      EnableDnsSupport: true
      Tags:
        - Key: Name
          Value: !Sub '${SystemName}-${Environment}-vpc'

  PublicSubnet1:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: !If [IsProd, 10.0.1.0/24, !If [IsStg, 10.1.1.0/24, 10.2.1.0/24]]
      AvailabilityZone: !Select [0, !GetAZs '']
      MapPublicIpOnLaunch: true
      Tags:
        - Key: Name
          Value: !Sub '${SystemName}-${Environment}-public-1'

Conditions:
  IsProd: !Equals [!Ref Environment, prod]
  IsStg: !Equals [!Ref Environment, stg]

Outputs:
  VpcId:
    Value: !Ref VPC
    Export:
      Name: !Sub '${SystemName}-${Environment}-VpcId'
```

### 環境別デプロイフロー

```
system-a-infra リポジトリ
    │
    ├── system-a-dev-pipeline   ← ENVIRONMENT=dev で実行
    │       └── dev環境にデプロイ
    │
    ├── system-a-stg-pipeline   ← ENVIRONMENT=stg + 手動承認
    │       └── stg環境にデプロイ
    │
    └── system-a-prod-pipeline  ← ENVIRONMENT=prod + 手動承認
            └── prod環境にデプロイ
```

---

## Deployステージと手動承認

### 手動承認付きパイプライン構成

```
Source → Build(検証) → Approval(手動承認) → Build(デプロイ)
```

または

```
Source → Build(検証/合成) → Approval → Deploy(CloudFormation)
```

### CLIでの手動承認ステージ追加

```json
{
  "name": "Approval",
  "actions": [{
    "name": "ManualApproval",
    "actionTypeId": {
      "category": "Approval",
      "owner": "AWS",
      "provider": "Manual",
      "version": "1"
    },
    "configuration": {
      "CustomData": "本番環境へのデプロイを承認してください"
    }
  }]
}
```

### CDK Pipelinesでの手動承認

```typescript
import { CodePipeline, CodePipelineSource, ShellStep, ManualApprovalStep } from 'aws-cdk-lib/pipelines';

const pipeline = new CodePipeline(this, 'Pipeline', {
  synth: new ShellStep('Synth', {
    input: CodePipelineSource.codeCommit(repository, 'main'),
    commands: ['npm ci', 'npx cdk synth'],
  }),
});

// Dev環境（自動）
pipeline.addStage(new MyAppStage(this, 'Dev'));

// Prod環境（手動承認付き）
pipeline.addStage(new MyAppStage(this, 'Prod'), {
  pre: [new ManualApprovalStep('ApproveProd')],
});
```

---

## トラブルシューティング

### Deployステージのセッションポリシーエラー

**エラー例**:
```
is not authorized to perform: s3:ListBucket ... because no session policy allows
```

**原因**: CodePipelineのCloudFormationアクションは内部でセッションポリシーを適用するため、IAMロールに権限があっても拒否される

**解決策**:
1. **推奨**: Deployステージを使わず、Buildステージで`aws cloudformation deploy`を実行
2. CloudFormation用の専用ロールを作成して`RoleArn`で指定

### buildspec.yml YAMLエラー

**エラー例**:
```
YAML_FILE_ERROR: Expected Commands[0] to be of string type
```

**原因**: YAML構文エラー（コメント位置、インデント等）

**解決策**:
```yaml
# NG: リスト間にコメント
commands:
  - echo "step1"
  # comment
  - echo "step2"

# OK: シンプルに記述
commands:
  - echo "step1"
  - echo "step2"
```

### その他のエラー

| エラー | 原因 | 対処 |
|--------|------|------|
| `AccessDenied` | IAM権限不足 | CodeBuildロールに権限追加 |
| `Bootstrap required` | CDK環境未準備 | `cdk bootstrap`実行 |
| `ROLLBACK_COMPLETE` | 前回失敗 | スタック削除後に再実行 |

---

## ベストプラクティス

### セキュリティ

| 項目 | 推奨 |
|------|------|
| ブランチ保護 | mainへの直接push禁止 |
| 手動承認 | 本番デプロイ前に必須 |
| 静的解析 | cfn-lint, cdk-nag組み込み |
| シークレット | Secrets Manager使用 |
| 最小権限 | 必要最小限のIAM権限 |

### バージョン管理

```
my-infra-repo/
├── .gitignore
├── README.md
├── buildspec.yml
├── environments/
│   ├── dev.json
│   ├── stg.json
│   └── prod.json
├── stacks/           # CloudFormation
└── lib/              # CDK
```

**絶対にコミットしないもの**:
- `.env`, `*.pem`, `credentials.json`
- `cdk.out/`, `node_modules/`, `.terraform/`

### 比較まとめ

| 観点 | GUI | CLI | CDK |
|------|-----|-----|-----|
| 学習コスト | 低 | 中 | 高 |
| 再現性 | × | △ | ◎ |
| バージョン管理 | × | △ | ◎ |
| 本番利用 | × | ○ | ◎ |

---

## 参考リンク

- [AWS CodePipeline ユーザーガイド](https://docs.aws.amazon.com/codepipeline/latest/userguide/)
- [AWS CodeBuild ユーザーガイド](https://docs.aws.amazon.com/codebuild/latest/userguide/)
- [CDK Pipelines](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.pipelines-readme.html)
- [recommended-structure サンプル](./recommended-structure/)
