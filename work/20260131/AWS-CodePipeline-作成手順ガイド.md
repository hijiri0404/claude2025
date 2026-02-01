# AWS CodePipeline CI/CD パイプライン作成手順ガイド

## 目次

1. [はじめに（初学者向け）](#はじめに初学者向け)
2. [クイックスタート](#クイックスタート)
3. [アーキテクチャ概要](#アーキテクチャ概要)
4. [前提条件](#前提条件)
5. [作成方法1: マネジメントコンソール（GUI）](#作成方法1-マネジメントコンソールgui)
6. [作成方法2: AWS CLI](#作成方法2-aws-cli)
7. [作成方法3: AWS CDK（推奨）](#作成方法3-aws-cdk推奨)
8. [推奨構成: マルチシステム・マルチ環境](#推奨構成-マルチシステムマルチ環境)
9. [Deployステージと手動承認](#deployステージと手動承認)
10. [トラブルシューティング](#トラブルシューティング)
11. [ベストプラクティス](#ベストプラクティス)
12. [用語集](#用語集)

---

## はじめに（初学者向け）

> このセクションでは、CI/CDやCodePipelineの基本概念を解説します。
> 経験者は[クイックスタート](#クイックスタート)に進んでください。

### CI/CDとは？

**CI/CD**は、ソフトウェア開発の自動化手法です。

| 用語 | 正式名称 | 意味 |
|------|---------|------|
| **CI** | Continuous Integration（継続的インテグレーション） | コードの変更を頻繁にマージし、自動でテスト・ビルドする |
| **CD** | Continuous Delivery/Deployment（継続的デリバリー/デプロイ） | テスト済みのコードを自動で本番環境にデプロイする |

**手動デプロイの問題点**:
```
開発者がコード変更 → 手動でサーバーにアップロード → 手動で設定変更 → 動作確認
                    ↑                           ↑
                 ミスしやすい               時間がかかる
```

**CI/CDによる解決**:
```
開発者がコード変更 → 自動でテスト → 自動でビルド → 自動でデプロイ
                    ↑              ↑              ↑
                 常に品質担保    一貫性あり    ミスなし・高速
```

### なぜCodePipelineを使うのか？

| 従来の方法 | CodePipeline |
|-----------|--------------|
| 手動でサーバーにSSH接続してデプロイ | コードをpushするだけで自動デプロイ |
| デプロイ手順書を見ながら作業 | 手順がコード化されて再現可能 |
| 本番環境で直接作業してミス | 開発→検証→本番の段階的デプロイ |
| 誰がいつ何をデプロイしたか不明 | すべての履歴が自動記録 |

### AWS Developer Toolsの全体像

CodePipelineは、AWS Developer Toolsファミリーの一部です。

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AWS Developer Tools                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │  CodeCommit  │    │  CodeBuild   │    │  CodeDeploy  │          │
│  │              │    │              │    │              │          │
│  │ ソースコード   │ →  │ ビルド・テスト │ →  │ デプロイ実行  │          │
│  │ を保存       │    │ を実行       │    │              │          │
│  │ (Git)        │    │              │    │              │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│         │                   │                   │                   │
│         └───────────────────┴───────────────────┘                   │
│                             │                                        │
│                    ┌────────┴────────┐                              │
│                    │  CodePipeline   │                              │
│                    │                 │                              │
│                    │ 上記を連携させる │                              │
│                    │ オーケストレーター│                              │
│                    └─────────────────┘                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 各サービスの役割

| サービス | 役割 | 例え |
|---------|------|------|
| **CodeCommit** | ソースコードを保存・管理 | GitHub/GitLabのようなもの |
| **CodeBuild** | ビルド・テストを実行 | Jenkins/CircleCIのようなもの |
| **CodeDeploy** | アプリをサーバーにデプロイ | Ansible/Capistranoのようなもの |
| **CodePipeline** | 上記を連携させる | 工場の生産ライン管理者 |

### このガイドで作るもの

```
┌─────────────────────────────────────────────────────────────────┐
│                        今回作るパイプライン                        │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. CodeCommit          2. CodePipeline        3. CodeBuild    │
│  ┌─────────────┐        ┌─────────────┐       ┌─────────────┐  │
│  │ template.yaml│   →   │  変更を検知   │  →   │ aws cfn     │  │
│  │ buildspec.yml│       │  ビルド開始   │       │ deploy実行  │  │
│  └─────────────┘        └─────────────┘       └─────────────┘  │
│        ↑                                              ↓         │
│    git push                                    CloudFormation   │
│                                                でAWSリソース作成 │
└─────────────────────────────────────────────────────────────────┘
```

**作成されるリソース例**:
- S3バケット（ファイル保存用）
- Lambda関数（サーバーレス処理）
- API Gateway（APIエンドポイント）
- DynamoDB（データベース）

### 重要ファイルの役割

| ファイル | 役割 | 必須？ |
|---------|------|-------|
| `template.yaml` | 作成したいAWSリソースを定義（CloudFormation） | ○ |
| `buildspec.yml` | CodeBuildで何を実行するか定義 | ○ |
| `deploy-config.json` | スタック名や環境設定（本ガイドの推奨） | △ |

#### buildspec.ymlとは？

CodeBuildに「何をするか」を指示するファイルです。

```yaml
version: 0.2                    # buildspec形式のバージョン

phases:                         # 実行フェーズの定義
  install:                      # 1. インストールフェーズ
    commands:
      - npm install             #    必要なツールをインストール

  build:                        # 2. ビルドフェーズ
    commands:
      - npm run build           #    ビルドコマンドを実行
      - aws cloudformation deploy ...  # CloudFormationでデプロイ

  post_build:                   # 3. ビルド後フェーズ
    commands:
      - echo "完了しました"      #    後処理
```

#### template.yaml（CloudFormation）とは？

作成したいAWSリソースを宣言的に定義するファイルです。

```yaml
AWSTemplateFormatVersion: '2010-09-09'  # CloudFormation形式
Description: S3バケットを作成           # 説明

Resources:                              # 作成するリソース
  MyBucket:                             # リソースの論理名
    Type: AWS::S3::Bucket               # リソースタイプ（S3バケット）
    Properties:                         # リソースの設定
      BucketName: my-sample-bucket

Outputs:                                # 作成後の出力
  BucketName:
    Value: !Ref MyBucket                # 作成されたバケット名
```

### 学習の進め方

| ステップ | 内容 | 推奨方法 |
|---------|------|---------|
| 1 | まず動かしてみる | [クイックスタート](#クイックスタート)をGUIで実行 |
| 2 | 仕組みを理解する | [アーキテクチャ概要](#アーキテクチャ概要)を読む |
| 3 | 手動で作成してみる | [GUI手順](#作成方法1-マネジメントコンソールgui)を実行 |
| 4 | 自動化を学ぶ | [CLI](#作成方法2-aws-cli)と[CDK](#作成方法3-aws-cdk推奨)を試す |
| 5 | 実践的な構成を学ぶ | [推奨構成](#推奨構成-マルチシステムマルチ環境)を参照 |

---

## クイックスタート

最速で動作するパイプラインを構築する手順です。

> **初学者向け**: この手順を最初から最後まで実行すると、コードをpushするだけでS3バケットが自動作成されるパイプラインが完成します。所要時間は約15〜20分です。

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

> **初学者向け: なぜ権限追加が必要？**
>
> CodeBuildは「ビルドを実行する」権限は持っていますが、「CloudFormationでリソースを作成する」権限は持っていません。権限を追加しないと`AccessDenied`エラーになります。
>
> **サービスロールとは？**: AWSサービスが別のサービスを操作するための権限設定です。人間のユーザーではなく、CodeBuildというサービスに付与する権限です。

---

## 作成方法2: AWS CLI

自動化スクリプト向けの方法です。

> **初学者向け**: GUIで一度作成した後にCLIを試すと理解しやすいです。CLIは「GUIでやった操作をコマンドで再現できる」という点がメリットです。スクリプト化すれば、同じ環境を何度でも再現できます。

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

> **初学者向け: CDKとは？**
>
> CDK（Cloud Development Kit）は、TypeScriptやPythonなどのプログラミング言語でAWSリソースを定義できるツールです。
>
> **CloudFormation（YAML）との違い**:
> - YAML: 設定ファイル形式。ループや条件分岐が複雑
> - CDK: プログラミング言語。for文やif文が使える
>
> **いつCDKを使う？**
> - 本番環境での運用（コードレビュー、バージョン管理）
> - 複雑なインフラ構成
> - チーム開発

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

> **初学者向け: なぜ複数環境が必要？**
>
> ```
> ❌ 悪い例: 本番環境で直接開発
>    → バグがあるとユーザーに影響
>    → 元に戻すのが大変
>
> ✅ 良い例: dev → stg → prod と段階的にデプロイ
>    → devで自由に試行錯誤
>    → stgで本番同等の確認
>    → prodは安定したコードのみ
> ```
>
> **この構成のポイント**:
> - 同じコードで環境だけ切り替え（設定ファイルで制御）
> - 環境ごとに異なるリソースサイズ（devは小さく、prodは大きく）
> - 環境ごとに異なるCIDR範囲（ネットワークが重複しない）

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

> **初学者向け: なぜ手動承認が必要？**
>
> 自動化は便利ですが、本番環境への変更は「人間の目で確認してから」が安全です。
>
> ```
> 例: 手動承認なしの場合
>     開発者が誤ったコードをpush → 自動でprodにデプロイ → 障害発生！
>
> 例: 手動承認ありの場合
>     開発者が誤ったコードをpush → 承認待ち →
>     レビューで問題発見 → 承認せずに修正 → 障害回避！
> ```

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

> **初学者向け: エラーが出ても慌てない**
>
> CI/CDの構築では、最初は必ずエラーが出ます。重要なのは「エラーメッセージを読む」ことです。
>
> **デバッグの手順**:
> 1. CodePipelineで失敗したステージを確認
> 2. CodeBuildのログを確認（具体的なエラーメッセージ）
> 3. エラーメッセージをGoogle検索または以下の対処法を参照
> 4. 修正してgit pushすれば再実行される

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

---

## 用語集

初学者向けに、このガイドで使用する用語をまとめました。

### パイプライン関連

| 用語 | 説明 |
|------|------|
| **パイプライン** | ソースコードの取得からデプロイまでの一連の自動化フロー |
| **ステージ** | パイプライン内の処理単位（Source、Build、Deploy等） |
| **アクション** | ステージ内で実行される個別の処理 |
| **アーティファクト** | ステージ間で受け渡されるファイル群（ソースコード、ビルド成果物等） |
| **トリガー** | パイプラインを開始させるイベント（git push、手動実行等） |

### AWS サービス

| 用語 | 説明 |
|------|------|
| **CodeCommit** | AWSが提供するGitリポジトリサービス（GitHubの代替） |
| **CodeBuild** | ソースコードのビルドとテストを行うサービス |
| **CodeDeploy** | EC2やLambdaへのアプリケーションデプロイを自動化するサービス |
| **CodePipeline** | 上記サービスを連携させるCI/CDオーケストレーションサービス |
| **CloudFormation** | AWSリソースをコード（YAML/JSON）で定義・作成するIaCサービス |
| **IAM** | AWSの認証・認可を管理するサービス（Identity and Access Management） |
| **S3** | オブジェクトストレージサービス（Simple Storage Service） |

### ファイル・設定

| 用語 | 説明 |
|------|------|
| **buildspec.yml** | CodeBuildの実行内容を定義するファイル |
| **template.yaml** | CloudFormationテンプレート（作成するAWSリソースの定義） |
| **スタック** | CloudFormationで作成されたリソースの集合 |
| **スタック名** | CloudFormationスタックを識別する名前 |

### 開発手法

| 用語 | 説明 |
|------|------|
| **IaC** | Infrastructure as Code（インフラをコードで管理する手法） |
| **CDK** | Cloud Development Kit（プログラミング言語でAWSリソースを定義） |
| **Terraform** | HashiCorp社のIaCツール（マルチクラウド対応） |

### 環境

| 用語 | 説明 |
|------|------|
| **dev環境** | 開発環境。開発者が自由に試せる環境 |
| **stg環境** | ステージング環境。本番リリース前の最終確認環境 |
| **prod環境** | 本番環境。実際のユーザーが使用する環境 |

### Git関連

| 用語 | 説明 |
|------|------|
| **リポジトリ** | ソースコードとその変更履歴を保存する場所 |
| **ブランチ** | 開発の分岐。mainブランチが本流 |
| **プッシュ（push）** | ローカルの変更をリモートリポジトリに送信 |
| **プル（pull）** | リモートリポジトリの変更をローカルに取得 |
| **コミット** | 変更をリポジトリに記録すること |

### よくある略語

| 略語 | 正式名称 | 意味 |
|------|---------|------|
| **CI** | Continuous Integration | 継続的インテグレーション |
| **CD** | Continuous Delivery/Deployment | 継続的デリバリー/デプロイ |
| **ARN** | Amazon Resource Name | AWSリソースの一意識別子 |
| **VPC** | Virtual Private Cloud | 仮想プライベートネットワーク |
| **SG** | Security Group | ファイアウォールルール |
| **CFn** | CloudFormation | AWSのIaCサービス |

---

## 参考リンク

- [AWS CodePipeline ユーザーガイド](https://docs.aws.amazon.com/codepipeline/latest/userguide/)
- [AWS CodeBuild ユーザーガイド](https://docs.aws.amazon.com/codebuild/latest/userguide/)
- [CDK Pipelines](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.pipelines-readme.html)
- [recommended-structure サンプル](./recommended-structure/)

---

## 初学者向けFAQ

### Q: パイプラインを作る前に何を準備すればいい？

**A**: 以下の3つを準備してください：

1. **AWSアカウント**と管理者権限のIAMユーザー
2. **AWS CLI**のインストールと認証設定
3. **Git**のインストール

```bash
# 確認コマンド
aws sts get-caller-identity  # AWSアカウントが確認できればOK
git --version               # バージョンが表示されればOK
```

### Q: CodeCommitとGitHub、どちらを使うべき？

**A**: どちらでも構いません。

| 観点 | CodeCommit | GitHub |
|------|-----------|--------|
| AWS連携 | ネイティブ統合 | Actions連携も可 |
| 費用 | 無料枠あり | 無料枠あり |
| 認証 | IAM | PAT/SSH |
| 推奨 | AWS中心の組織 | 既にGitHubを使用中の組織 |

### Q: buildspec.ymlはどこに置く？

**A**: リポジトリのルートディレクトリに置きます。

```
my-repo/
├── buildspec.yml     ← ここ
├── template.yaml
└── src/
```

### Q: エラーが出たらどこを見る？

**A**: 以下の順序で確認してください：

1. **CodePipelineコンソール** → 失敗したステージをクリック → 詳細を表示
2. **CodeBuildコンソール** → ビルド履歴 → ログを確認
3. **CloudFormationコンソール** → スタックのイベントタブ → エラーメッセージ確認

### Q: 料金はいくらかかる？

**A**: 主な料金体系：

| サービス | 無料枠 | 超過料金 |
|---------|-------|---------|
| CodePipeline | 1パイプライン/月 | $1/アクティブパイプライン/月 |
| CodeBuild | 100分/月 | $0.005/分（small） |
| CodeCommit | 5ユーザー、50GB | 従量課金 |

> **ヒント**: 学習目的なら、使い終わったらリソースを削除して料金を抑えましょう。

### Q: 本番環境でやってはいけないことは？

**A**: 以下は避けてください：

- mainブランチへの直接push（ブランチ保護を設定）
- 手動承認なしの本番デプロイ
- 機密情報（パスワード等）のソースコードへのコミット
- `*FullAccess`ポリシーの使用（最小権限の原則に違反）

---

*このガイドは初学者から実務者まで、段階的に学習できる構成になっています。まずは[クイックスタート](#クイックスタート)から始めてみてください。*
