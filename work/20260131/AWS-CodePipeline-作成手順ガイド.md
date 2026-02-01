# AWS CodePipeline CI/CD パイプライン作成手順ガイド

## 概要

このドキュメントでは、AWS CodePipelineを使用したCI/CDパイプラインの作成方法を3つのアプローチで解説します。

- **①マネジメントコンソール（GUI）**: 学習・検証向け
- **②AWS CLI**: 自動化スクリプト向け
- **③AWS CDK**: 本番環境向け（推奨）

## アーキテクチャ概要

```
CodeCommit → CodePipeline → CodeBuild → CloudFormation/CDK Deploy
    │              │              │              │
   Push          Trigger        Build         Deploy
  トリガー       パイプライン     検証・合成      スタック作成
```

### パターン別の構成

| パターン | リポジトリ | パイプライン | 用途 |
|---------|-----------|-------------|------|
| CloudFormation | `cfn-repo` | `cfn-pipeline` | CloudFormationテンプレートのデプロイ |
| CDK | `cdk-repo` | `cdk-pipeline` | CDKプロジェクトのデプロイ |
| Terraform | `terraform-repo` | `terraform-pipeline` | Terraformのデプロイ |

## 前提条件

- AWS CLI設定済み（認証情報・リージョン）
- Git インストール済み
- 使用するIaCツール（CDK CLI / SAM CLI / Terraform）インストール済み

---

## 設定ファイル方式（スタック名の可変管理）

### 概要

スタック名をハードコードせず、設定ファイルで管理することで以下のメリットがあります：

- **タイプミス防止**: PRレビューで設定ファイルをチェック可能
- **許可リスト**: 事前定義されたスタック名のみ許可
- **環境分離**: dev/staging/prod を設定ファイルで切り替え
- **履歴管理**: Git で変更履歴を追跡

### 構成ファイル

```
my-repo/
├── deploy-config.json   ← スタック名・環境設定
├── buildspec.yml        ← 設定を読み込んでデプロイ
├── template.yaml        ← CloudFormationテンプレート（CFn用）
└── lib/                 ← CDKスタック（CDK用）
```

### deploy-config.json

```json
{
  "stackName": "my-app-dev-stack",
  "environment": "dev",
  "allowedStackNames": [
    "my-app-dev-stack",
    "my-app-staging-stack",
    "my-app-prod-stack"
  ]
}
```

| フィールド | 説明 |
|-----------|------|
| `stackName` | デプロイするスタック名 |
| `environment` | 環境識別子（タグ付けに使用） |
| `allowedStackNames` | 許可されたスタック名のリスト（タイプミス防止） |

### buildspec.yml（CloudFormation用・設定ファイル対応版）

```yaml
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - yum install -y jq || apt-get install -y jq || true

  pre_build:
    commands:
      - echo "=== Reading deploy-config.json ==="
      - |
        if [ ! -f "deploy-config.json" ]; then
          echo "❌ ERROR: deploy-config.json not found"
          exit 1
        fi
      - export STACK_NAME=$(jq -r '.stackName' deploy-config.json)
      - export ENVIRONMENT=$(jq -r '.environment' deploy-config.json)
      - echo "Stack Name: $STACK_NAME"
      - echo "Environment: $ENVIRONMENT"

      # バリデーション: スタック名の形式チェック
      - |
        if [[ ! "$STACK_NAME" =~ ^[a-zA-Z][a-zA-Z0-9-]*$ ]]; then
          echo "❌ ERROR: Invalid stack name format: $STACK_NAME"
          exit 1
        fi
        echo "✅ Stack name format validation passed"

      # バリデーション: 許可リストとの照合
      - |
        ALLOWED=$(jq -r '.allowedStackNames[]' deploy-config.json 2>/dev/null)
        if [ -n "$ALLOWED" ]; then
          if ! echo "$ALLOWED" | grep -qx "$STACK_NAME"; then
            echo "❌ ERROR: Stack name '$STACK_NAME' is not in allowed list"
            exit 1
          fi
          echo "✅ Stack name allowlist validation passed"
        fi

  build:
    commands:
      - echo "=== Deploying CloudFormation stack: $STACK_NAME ==="
      - |
        aws cloudformation deploy \
          --template-file template.yaml \
          --stack-name $STACK_NAME \
          --no-fail-on-empty-changeset \
          --tags Environment=$ENVIRONMENT CreatedBy=CodePipeline

  post_build:
    commands:
      - aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs' --output table
```

### buildspec.yml（CDK用・設定ファイル対応版）

```yaml
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - npm install

  pre_build:
    commands:
      - |
        if [ ! -f "deploy-config.json" ]; then
          echo "❌ ERROR: deploy-config.json not found"
          exit 1
        fi
      - export STACK_NAME=$(cat deploy-config.json | node -pe "JSON.parse(require('fs').readFileSync('/dev/stdin').toString()).stackName")
      - export ENVIRONMENT=$(cat deploy-config.json | node -pe "JSON.parse(require('fs').readFileSync('/dev/stdin').toString()).environment")

      # バリデーション
      - |
        if [[ ! "$STACK_NAME" =~ ^[a-zA-Z][a-zA-Z0-9-]*$ ]]; then
          echo "❌ ERROR: Invalid stack name format"
          exit 1
        fi

  build:
    commands:
      - npx cdk bootstrap --require-approval never 2>/dev/null || true
      - npx cdk deploy $STACK_NAME --require-approval never -c stackName=$STACK_NAME -c environment=$ENVIRONMENT

  post_build:
    commands:
      - aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs' --output table
```

---

## ① マネジメントコンソール（GUI）での作成

### Step 1: CodeCommitリポジトリ作成

1. **CodeCommitコンソール**にアクセス
2. 「リポジトリを作成」をクリック
3. 設定項目:
   - リポジトリ名: `my-infra-repo`
   - 説明: 任意
4. 「作成」をクリック

### Step 2: CodeBuildプロジェクト作成

1. **CodeBuildコンソール** → 「ビルドプロジェクトを作成」

2. **プロジェクトの設定**
   | 項目 | 値 |
   |------|-----|
   | プロジェクト名 | `my-infra-build` |

3. **ソース**
   | 項目 | 値 |
   |------|-----|
   | ソースプロバイダ | `AWS CodeCommit` |
   | リポジトリ | `my-infra-repo` |
   | ブランチ | `main` |

4. **環境**
   | 項目 | 値 |
   |------|-----|
   | 環境イメージ | `マネージド型イメージ` |
   | オペレーティングシステム | `Amazon Linux` |
   | ランタイム | `Standard` |
   | イメージ | `aws/codebuild/amazonlinux2-x86_64-standard:5.0` |
   | 特権付与 | ✅（Docker使用時） |
   | サービスロール | `新しいサービスロール` |

5. **Buildspec**
   - `buildspec ファイルを使用する` を選択
   - buildspec名: `buildspec.yml`（デフォルト）

6. 「ビルドプロジェクトを作成」をクリック

### Step 3: CodePipelineパイプライン作成

1. **CodePipelineコンソール** → 「パイプラインを作成する」

2. **パイプラインの設定**
   | 項目 | 値 | 備考 |
   |------|-----|------|
   | パイプライン名 | `my-infra-pipeline` | |
   | 実行モード | `キュー` | デフォルト。他に「超過」「並列」あり |
   | サービスロール | `新しいサービスロール` | |

   > **注**: パイプラインタイプ（V1/V2）は自動的にV2が選択されます

3. **ソースステージ**
   | 項目 | 値 |
   |------|-----|
   | ソースプロバイダ | `AWS CodeCommit` |
   | リポジトリ名 | `my-infra-repo` |
   | ブランチ名 | `main` |
   | ソースの変更を自動的に検出するEventBridgeルールを作成 | ✅ 有効 |

4. **ビルドステージ**
   | 項目 | 値 |
   |------|-----|
   | ビルドプロバイダ | `AWS CodeBuild` |
   | リージョン | 現在のリージョン |
   | プロジェクト名 | `my-infra-build` |

5. **デプロイステージ**

   **推奨: スキップする（CodeBuild内でデプロイ）**
   - 「デプロイステージをスキップ」を選択
   - buildspec.yml内で`aws cloudformation deploy`または`cdk deploy`を実行

   > **注意**: CloudFormationアクションを使用する場合、セッションポリシーの制限でエラーになることがあります。CodeBuild内でデプロイする方が安定します。

6. 「確認して作成」

### Step 4: IAMロール権限追加

CodeBuildサービスロールに以下を追加（IAMコンソール → ロール → 該当ロール → ポリシーを追加）:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "s3:*",
        "iam:*"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## ② AWS CLIでの作成

### Step 1: 変数設定

```bash
# 共通変数
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REGION=$(aws configure get region)
export REPO_NAME="my-infra-repo"
export BUILD_PROJECT="my-infra-build"
export PIPELINE_NAME="my-infra-pipeline"
export ARTIFACT_BUCKET="codepipeline-${REGION}-${ACCOUNT_ID}"
```

### Step 2: CodeCommitリポジトリ作成

```bash
aws codecommit create-repository \
  --repository-name $REPO_NAME \
  --repository-description "Infrastructure repository"
```

### Step 3: IAMロール作成

#### CodeBuild用ロール

```bash
# 信頼ポリシー
aws iam create-role \
  --role-name codebuild-${BUILD_PROJECT}-service-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "codebuild.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# 権限ポリシー
aws iam put-role-policy \
  --role-name codebuild-${BUILD_PROJECT}-service-role \
  --policy-name CodeBuildPolicy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["logs:*"],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": ["s3:*"],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": ["codecommit:GitPull"],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": ["cloudformation:*", "iam:*"],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": ["sts:AssumeRole"],
        "Resource": "arn:aws:iam::*:role/cdk-*"
      }
    ]
  }'
```

#### CodePipeline用ロール

```bash
aws iam create-role \
  --role-name AWSCodePipelineServiceRole-${PIPELINE_NAME} \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "codepipeline.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

aws iam put-role-policy \
  --role-name AWSCodePipelineServiceRole-${PIPELINE_NAME} \
  --policy-name CodePipelinePolicy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["codecommit:*"],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": ["codebuild:*"],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": ["s3:*"],
        "Resource": "*"
      }
    ]
  }'
```

### Step 4: CodeBuildプロジェクト作成

```bash
aws codebuild create-project \
  --name $BUILD_PROJECT \
  --source type=CODECOMMIT,location=https://git-codecommit.${REGION}.amazonaws.com/v1/repos/${REPO_NAME} \
  --environment type=LINUX_CONTAINER,computeType=BUILD_GENERAL1_SMALL,image=aws/codebuild/amazonlinux2-x86_64-standard:5.0 \
  --service-role arn:aws:iam::${ACCOUNT_ID}:role/codebuild-${BUILD_PROJECT}-service-role \
  --artifacts type=NO_ARTIFACTS
```

### Step 5: CodePipeline作成

```bash
aws codepipeline create-pipeline --pipeline '{
  "name": "'$PIPELINE_NAME'",
  "roleArn": "arn:aws:iam::'$ACCOUNT_ID':role/AWSCodePipelineServiceRole-'$PIPELINE_NAME'",
  "artifactStore": {
    "type": "S3",
    "location": "'$ARTIFACT_BUCKET'"
  },
  "stages": [
    {
      "name": "Source",
      "actions": [{
        "name": "SourceAction",
        "actionTypeId": {
          "category": "Source",
          "owner": "AWS",
          "provider": "CodeCommit",
          "version": "1"
        },
        "configuration": {
          "RepositoryName": "'$REPO_NAME'",
          "BranchName": "main",
          "PollForSourceChanges": "false"
        },
        "outputArtifacts": [{"name": "SourceOutput"}]
      }]
    },
    {
      "name": "Build",
      "actions": [{
        "name": "BuildAction",
        "actionTypeId": {
          "category": "Build",
          "owner": "AWS",
          "provider": "CodeBuild",
          "version": "1"
        },
        "configuration": {
          "ProjectName": "'$BUILD_PROJECT'"
        },
        "inputArtifacts": [{"name": "SourceOutput"}]
      }]
    }
  ]
}'
```

### Step 6: リポジトリにファイルをプッシュ

```bash
# 設定ファイル作成
cat > deploy-config.json << 'EOF'
{
  "stackName": "my-app-stack",
  "environment": "dev",
  "allowedStackNames": ["my-app-stack", "my-app-dev-stack", "my-app-prod-stack"]
}
EOF

# CloudFormationテンプレート作成
cat > template.yaml << 'EOF'
AWSTemplateFormatVersion: '2010-09-09'
Description: Sample S3 bucket
Resources:
  SampleBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub 'sample-bucket-${AWS::AccountId}'
Outputs:
  BucketName:
    Value: !Ref SampleBucket
EOF

# buildspec.yml作成（上記の設定ファイル対応版を使用）

# AWS CLIでCodeCommitにプッシュ
BUILDSPEC=$(cat buildspec.yml | base64 -w0)
DEPLOY_CONFIG=$(cat deploy-config.json | base64 -w0)
TEMPLATE=$(cat template.yaml | base64 -w0)

aws codecommit create-commit \
  --repository-name $REPO_NAME \
  --branch-name main \
  --commit-message "Initial commit" \
  --put-files \
    "filePath=buildspec.yml,fileContent=$BUILDSPEC" \
    "filePath=deploy-config.json,fileContent=$DEPLOY_CONFIG" \
    "filePath=template.yaml,fileContent=$TEMPLATE"
```

---

## ③ AWS CDKでの作成

### Step 1: プロジェクト初期化

```bash
mkdir pipeline-cdk && cd pipeline-cdk
cdk init app --language typescript
npm install
```

### Step 2: パイプラインスタック作成

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
  buildProjectName: string;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    // CodeCommitリポジトリ
    const repository = new codecommit.Repository(this, 'Repository', {
      repositoryName: props.repositoryName,
      description: 'Infrastructure as Code repository',
    });

    // CodeBuildプロジェクト
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: props.buildProjectName,
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
        computeType: codebuild.ComputeType.SMALL,
      },
      // buildspec.ymlはリポジトリから読み込み
    });

    // CodeBuildに必要な権限
    buildProject.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudformation:*',
        'iam:*',
        's3:*',
        'ssm:GetParameter',
        'sts:AssumeRole',
      ],
      resources: ['*'],
    }));

    // パイプライン
    const sourceOutput = new codepipeline.Artifact('SourceOutput');

    new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: props.pipelineName,
      pipelineType: codepipeline.PipelineType.V2,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.CodeCommitSourceAction({
              actionName: 'CodeCommit_Source',
              repository: repository,
              branch: 'main',
              output: sourceOutput,
              trigger: codepipeline_actions.CodeCommitTrigger.EVENTS,
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Build_Deploy',
              project: buildProject,
              input: sourceOutput,
            }),
          ],
        },
      ],
    });

    // 出力
    new cdk.CfnOutput(this, 'RepositoryCloneUrl', {
      value: repository.repositoryCloneUrlHttp,
    });
  }
}
```

### Step 3: エントリポイント

```typescript
// bin/pipeline-cdk.ts
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

// CloudFormation用パイプライン
new PipelineStack(app, 'CfnPipelineStack', {
  repositoryName: 'cfn-repo',
  pipelineName: 'cfn-pipeline',
  buildProjectName: 'cfn-build',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

// CDK用パイプライン
new PipelineStack(app, 'CdkPipelineStack', {
  repositoryName: 'cdk-repo',
  pipelineName: 'cdk-pipeline',
  buildProjectName: 'cdk-build',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
```

### Step 4: デプロイ

```bash
# CDK Bootstrap（初回のみ）
cdk bootstrap

# パイプラインデプロイ
cdk deploy --all
```

---

## buildspec.yml サンプル集

### CloudFormation用（設定ファイル対応）

```yaml
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - yum install -y jq

  pre_build:
    commands:
      - export STACK_NAME=$(jq -r '.stackName' deploy-config.json)
      - |
        if [[ ! "$STACK_NAME" =~ ^[a-zA-Z][a-zA-Z0-9-]*$ ]]; then
          echo "❌ Invalid stack name"; exit 1
        fi

  build:
    commands:
      - aws cloudformation deploy --template-file template.yaml --stack-name $STACK_NAME --no-fail-on-empty-changeset
```

### CDK用（設定ファイル対応）

```yaml
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - npm install

  pre_build:
    commands:
      - export STACK_NAME=$(node -pe "require('./deploy-config.json').stackName")

  build:
    commands:
      - npx cdk bootstrap 2>/dev/null || true
      - npx cdk deploy $STACK_NAME --require-approval never

cache:
  paths:
    - node_modules/**/*
```

### Terraform用

```yaml
version: 0.2

phases:
  install:
    commands:
      - yum install -y yum-utils
      - yum-config-manager --add-repo https://rpm.releases.hashicorp.com/AmazonLinux/hashicorp.repo
      - yum -y install terraform

  pre_build:
    commands:
      - terraform init
      - terraform validate
      - terraform plan -out=tfplan

  build:
    commands:
      - terraform apply -auto-approve tfplan
```

---

## Deployステージを使用したデプロイ（手動承認対応）

Deployステージを使用すると、変更セットのプレビューや手動承認フローが簡単に実装できます。

### パイプライン構成例

```
Source → Build（検証・合成） → 手動承認 → Deploy（CloudFormation）
```

### CloudFormation用パイプライン（Deployステージ使用）

#### ① IAMロールの作成

```bash
# CloudFormation実行用ロール
aws iam create-role \
  --role-name CloudFormationExecutionRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "cloudformation.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# 必要な権限を付与（本番では最小権限に絞る）
aws iam attach-role-policy \
  --role-name CloudFormationExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess
```

#### ② buildspec.yml（Buildステージ用・検証のみ）

```yaml
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - pip install cfn-lint

  pre_build:
    commands:
      - echo "Validating CloudFormation template"
      - cfn-lint template.yaml
      - aws cloudformation validate-template --template-body file://template.yaml

  build:
    commands:
      - echo "Template validation passed"

artifacts:
  files:
    - template.yaml
    - deploy-config.json
```

#### ③ パイプライン定義（CLI）

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws codepipeline create-pipeline --pipeline '{
  "name": "cfn-deploy-pipeline",
  "roleArn": "arn:aws:iam::'$ACCOUNT_ID':role/CodePipelineServiceRole",
  "artifactStore": {
    "type": "S3",
    "location": "your-artifact-bucket"
  },
  "stages": [
    {
      "name": "Source",
      "actions": [{
        "name": "Source",
        "actionTypeId": {"category": "Source", "owner": "AWS", "provider": "CodeCommit", "version": "1"},
        "configuration": {"RepositoryName": "my-repo", "BranchName": "main"},
        "outputArtifacts": [{"name": "SourceOutput"}]
      }]
    },
    {
      "name": "Build",
      "actions": [{
        "name": "Validate",
        "actionTypeId": {"category": "Build", "owner": "AWS", "provider": "CodeBuild", "version": "1"},
        "configuration": {"ProjectName": "cfn-validate"},
        "inputArtifacts": [{"name": "SourceOutput"}],
        "outputArtifacts": [{"name": "BuildOutput"}]
      }]
    },
    {
      "name": "Approval",
      "actions": [{
        "name": "ManualApproval",
        "actionTypeId": {"category": "Approval", "owner": "AWS", "provider": "Manual", "version": "1"},
        "configuration": {
          "CustomData": "Please review the CloudFormation changes before deploying to production"
        }
      }]
    },
    {
      "name": "Deploy",
      "actions": [{
        "name": "DeployStack",
        "actionTypeId": {"category": "Deploy", "owner": "AWS", "provider": "CloudFormation", "version": "1"},
        "configuration": {
          "ActionMode": "CREATE_UPDATE",
          "StackName": "my-production-stack",
          "TemplatePath": "BuildOutput::template.yaml",
          "Capabilities": "CAPABILITY_IAM,CAPABILITY_NAMED_IAM,CAPABILITY_AUTO_EXPAND",
          "RoleArn": "arn:aws:iam::'$ACCOUNT_ID':role/CloudFormationExecutionRole"
        },
        "inputArtifacts": [{"name": "BuildOutput"}]
      }]
    }
  ]
}'
```

### CDK用パイプライン（Deployステージ使用）

CDKの場合は、Buildステージで`cdk synth`を実行してCloudFormationテンプレートを生成し、Deployステージでデプロイします。

#### ① buildspec.yml（cdk synth用）

```yaml
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - npm install

  build:
    commands:
      - npx cdk synth

artifacts:
  base-directory: cdk.out
  files:
    - "*.template.json"
```

#### ② パイプラインのDeployステージ設定

```json
{
  "name": "Deploy",
  "actions": [{
    "name": "DeployCDKStack",
    "actionTypeId": {
      "category": "Deploy",
      "owner": "AWS",
      "provider": "CloudFormation",
      "version": "1"
    },
    "configuration": {
      "ActionMode": "CREATE_UPDATE",
      "StackName": "MyCdkStack",
      "TemplatePath": "BuildOutput::MyCdkStack.template.json",
      "Capabilities": "CAPABILITY_IAM,CAPABILITY_NAMED_IAM,CAPABILITY_AUTO_EXPAND",
      "RoleArn": "arn:aws:iam::ACCOUNT_ID:role/CloudFormationExecutionRole"
    },
    "inputArtifacts": [{"name": "BuildOutput"}]
  }]
}
```

### CDK Pipelines（推奨）

CDKを使用する場合は、CDK Pipelinesを使うと手動承認を含むパイプラインが簡単に構築できます。

```typescript
import { CodePipeline, CodePipelineSource, ShellStep, ManualApprovalStep } from 'aws-cdk-lib/pipelines';

const pipeline = new CodePipeline(this, 'Pipeline', {
  pipelineName: 'MyCdkPipeline',
  synth: new ShellStep('Synth', {
    input: CodePipelineSource.codeCommit(repository, 'main'),
    commands: ['npm ci', 'npm run build', 'npx cdk synth'],
  }),
});

// 開発環境（自動デプロイ）
pipeline.addStage(new MyAppStage(this, 'Dev'));

// 本番環境（手動承認付き）
pipeline.addStage(new MyAppStage(this, 'Prod'), {
  pre: [
    new ManualApprovalStep('PromoteToProd', {
      comment: '本番環境へのデプロイを承認してください',
    }),
  ],
});
```

### BuildステージとDeployステージの使い分け

| 観点 | Buildでデプロイ | Deployステージ使用 |
|------|----------------|-------------------|
| **シンプルさ** | ◎ | △ |
| **手動承認** | △ 別途Approvalステージ追加 | ◎ ネイティブ対応 |
| **変更セットプレビュー** | × | ◎ CHANGE_SET_REPLACEモード |
| **ロールバック** | △ 手動 | ◎ 自動 |
| **推奨ケース** | 開発・検証環境 | 本番環境 |

---

## バージョン管理のベストプラクティス

### リポジトリ構成

パイプライン関連ファイルは**インフラコードと同じリポジトリ**で管理することを推奨します。

```
my-infra-repo/
├── .gitignore
├── README.md
├── buildspec.yml              # CodeBuild設定
├── deploy-config.json         # デプロイ設定（スタック名、環境）
├── template.yaml              # CloudFormationテンプレート（CFn使用時）
├── cdk.json                   # CDK設定（CDK使用時）
├── package.json               # 依存関係（CDK使用時）
├── tsconfig.json              # TypeScript設定（CDK使用時）
├── bin/
│   └── app.ts                 # CDKエントリポイント
├── lib/
│   └── my-stack.ts            # CDKスタック定義
└── test/
    └── my-stack.test.ts       # テスト
```

### .gitignore

```gitignore
# CDK
cdk.out/
node_modules/
*.js
*.d.ts

# Terraform
.terraform/
*.tfstate
*.tfstate.backup

# 機密情報
.env
*.pem
credentials.json
```

### deploy-config.json の環境別管理

#### 方法1: 環境別ファイル

```
my-infra-repo/
├── deploy-config.dev.json
├── deploy-config.staging.json
├── deploy-config.prod.json
└── buildspec.yml
```

```yaml
# buildspec.yml - 環境変数で切り替え
pre_build:
  commands:
    - cp deploy-config.${ENVIRONMENT}.json deploy-config.json
```

#### 方法2: ブランチ別管理

```
main branch      → 本番環境用 deploy-config.json
develop branch   → 開発環境用 deploy-config.json
```

#### 方法3: 単一ファイルで複数環境管理

```json
{
  "environments": {
    "dev": {
      "stackName": "my-app-dev",
      "environment": "dev"
    },
    "prod": {
      "stackName": "my-app-prod",
      "environment": "prod"
    }
  }
}
```

### パイプライン定義のバージョン管理

パイプライン自体もコードで管理することを推奨します。

#### 方法1: AWS CDKでパイプラインを定義（推奨）

```
pipeline-repo/
├── bin/pipeline.ts
├── lib/pipeline-stack.ts      # パイプライン定義
└── lib/app-stack.ts           # アプリケーションスタック
```

メリット:
- パイプラインの変更もPRレビュー可能
- 環境間の差分を最小化
- CDK Pipelinesなら自己更新機能あり

#### 方法2: CloudFormationテンプレートで管理

```yaml
# pipeline.yaml
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  Pipeline:
    Type: AWS::CodePipeline::Pipeline
    Properties:
      Name: my-pipeline
      # ... パイプライン定義
```

#### 方法3: AWS CLIスクリプトで管理

```bash
# scripts/create-pipeline.sh
#!/bin/bash
aws codepipeline create-pipeline --cli-input-json file://pipeline-definition.json
```

### ブランチ戦略

```
main
  ├── develop (開発環境へ自動デプロイ)
  │     └── feature/* (機能開発)
  └── release/* (staging/本番へデプロイ、手動承認)
```

| ブランチ | デプロイ先 | 承認 |
|---------|-----------|------|
| feature/* | - | - |
| develop | dev環境 | 自動 |
| release/* | staging → prod | 手動承認 |
| main | - | マージのみ |

### 機密情報の管理

**絶対にリポジトリにコミットしないもの**:
- AWS認証情報
- データベースパスワード
- APIキー
- 秘密鍵

**代替手段**:

| 方法 | 用途 |
|------|------|
| AWS Secrets Manager | DB接続文字列、APIキー |
| SSM Parameter Store | 設定値、非機密パラメータ |
| 環境変数（CodeBuild） | ビルド時の設定 |

```yaml
# buildspec.yml - Secrets Managerから取得
pre_build:
  commands:
    - export DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id my-db-password --query SecretString --output text)
```

---

## 比較まとめ

| 観点 | ①GUI | ②CLI | ③CDK |
|------|------|------|------|
| **学習コスト** | 低い | 中 | 高い |
| **再現性** | × 手動操作 | △ スクリプト化可能 | ◎ コード管理 |
| **バージョン管理** | × | △ | ◎ |
| **自動化** | × | ○ | ◎ |
| **複雑な構成** | △ | ○ | ◎ |
| **チーム開発** | × | ○ | ◎ |
| **推奨用途** | 学習・検証 | 自動化スクリプト | 本番環境 |

---

## トラブルシューティング

### よくあるエラーと対処

| エラー | 原因 | 対処 |
|--------|------|------|
| `AccessDenied` | IAM権限不足 | CodeBuildロールに必要な権限追加 |
| `session policy allows` | CloudFormationアクションの制限 | Deployステージを削除し、CodeBuild内でデプロイ |
| `Bootstrap required` | CDK環境未準備 | `cdk bootstrap`実行 |
| `Stack is in ROLLBACK_COMPLETE` | 前回失敗 | 手動でスタック削除後再実行 |
| `deploy-config.json not found` | 設定ファイルなし | リポジトリにdeploy-config.json追加 |

### Deployステージのセッションポリシーエラー

CodePipelineのDeployステージでCloudFormationアクションを使用した際に以下のエラーが発生する場合：

```
User: arn:aws:sts::ACCOUNT_ID:assumed-role/AWSCodePipelineServiceRole-.../...
is not authorized to perform: s3:ListBucket on resource: "arn:aws:s3:::codepipeline-REGION-..."
because no session policy allows the s3:ListBucket action
```

**原因**:
1. CodePipelineのCloudFormationアクションは、内部的にロールをAssumeRoleする際に**セッションポリシー**を付与する
2. このセッションポリシーには、アーティファクトS3バケットへのアクセス権限が含まれていない場合がある
3. **IAMロール自体に権限があっても、セッションポリシーで制限されるため拒否される**
4. これはCodePipelineの内部動作に起因するため、ユーザー側での直接的な制御が難しい

**対策1（推奨）**: Deployステージを削除し、CodeBuild内で直接デプロイを実行する

```yaml
# buildspec.yml
build:
  commands:
    - aws cloudformation deploy --template-file template.yaml --stack-name my-stack --no-fail-on-empty-changeset
```

この方法のメリット：
- セッションポリシーの問題を回避できる
- CodeBuildロールの権限のみで動作するためシンプル
- 実務でも広く採用されているパターン

**対策2**: CloudFormation用の専用デプロイロールを作成して明示的に指定

```bash
# CloudFormation用デプロイロールを作成
aws iam create-role \
  --role-name CloudFormationDeployRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "cloudformation.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# 必要な権限を付与
aws iam attach-role-policy \
  --role-name CloudFormationDeployRole \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess
```

パイプラインのDeployアクションで`RoleArn`を指定：

```json
{
  "configuration": {
    "ActionMode": "CREATE_UPDATE",
    "StackName": "my-stack",
    "TemplatePath": "BuildOutput::template.yaml",
    "RoleArn": "arn:aws:iam::ACCOUNT_ID:role/CloudFormationDeployRole",
    "Capabilities": "CAPABILITY_IAM,CAPABILITY_NAMED_IAM"
  }
}
```

**補足**: CloudFormationアクションを使用する方法は正式にサポートされており、変更セットのプレビューや手動承認などの高度な機能が利用できます。ただし、権限設定が複雑になるため、シンプルに動作させたい場合は対策1を推奨します。

### buildspec.yml YAML構文エラー（YAML_FILE_ERROR）

CodeBuildで以下のようなエラーが出る場合：

```
YAML_FILE_ERROR: Expected Commands[0] to be of string type: found subkeys instead
```

**原因**: buildspec.ymlのYAML構文エラー。特に以下のパターンで発生しやすい：

1. **コメントの位置が不適切**
   ```yaml
   # ❌ NG: リスト項目の間にコメント
   commands:
     - echo "step1"
     # コメント
     - echo "step2"
   ```

2. **マルチラインコマンドの書き方が不正**
   ```yaml
   # ❌ NG: 空行やインデントの問題
   commands:
     - |
       if [ -f "file" ]; then
         echo "found"
       fi

     # コメント
     - |
       next command
   ```

**解決策**: buildspec.ymlをシンプルに記述する

```yaml
# ✅ OK: シンプルな形式
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - echo "Installing jq"
      - yum install -y jq || true

  pre_build:
    commands:
      - echo "Reading config"
      - export STACK_NAME=$(jq -r '.stackName' deploy-config.json)

  build:
    commands:
      - echo "Deploying stack"
      - aws cloudformation deploy --template-file template.yaml --stack-name $STACK_NAME --no-fail-on-empty-changeset
```

**ポイント**:
- コメントはマルチラインブロック（`|`）の**中に**記述する
- リスト項目（`-`）の間に空行を入れない
- できるだけワンライナーで記述する
- 複雑なロジックはシェルスクリプトファイルに分離する

---

## セキュリティベストプラクティス

| 項目 | 推奨設定 |
|------|---------|
| ブランチ保護 | mainブランチへの直接pushを禁止 |
| 承認ゲート | 本番デプロイ前に手動承認ステージ追加 |
| 静的解析 | cfn-lint, cdk-nag, Checkovを組み込み |
| シークレット | Secrets Manager / Parameter Store使用 |
| 暗号化 | S3アーティファクトバケットのSSE-KMS |
| 最小権限 | 必要最小限のIAM権限のみ付与 |

---

## 参考リンク

- [AWS CodePipeline ユーザーガイド](https://docs.aws.amazon.com/codepipeline/latest/userguide/)
- [AWS CodeBuild ユーザーガイド](https://docs.aws.amazon.com/codebuild/latest/userguide/)
- [CDK Pipelines モジュール](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.pipelines-readme.html)
- [AWS DevOps Pipeline Accelerator](https://github.com/aws-samples/aws-devops-pipeline-accelerator)
