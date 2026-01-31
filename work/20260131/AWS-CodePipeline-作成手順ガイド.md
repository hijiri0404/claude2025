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

## 前提条件

- AWS CLI設定済み（認証情報・リージョン）
- Git インストール済み
- 使用するIaCツール（CDK CLI / SAM CLI / Terraform）インストール済み

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
   | 項目 | 値 |
   |------|-----|
   | パイプライン名 | `my-infra-pipeline` |
   | パイプラインタイプ | `V2` |
   | サービスロール | `新しいサービスロール` |

3. **ソースステージ**
   | 項目 | 値 |
   |------|-----|
   | ソースプロバイダ | `AWS CodeCommit` |
   | リポジトリ名 | `my-infra-repo` |
   | ブランチ名 | `main` |
   | 検出オプション | `Amazon CloudWatch Events` |

4. **ビルドステージ**
   | 項目 | 値 |
   |------|-----|
   | ビルドプロバイダ | `AWS CodeBuild` |
   | リージョン | 現在のリージョン |
   | プロジェクト名 | `my-infra-build` |

5. **デプロイステージ**（CloudFormation直接デプロイの場合）
   | 項目 | 値 |
   |------|-----|
   | デプロイプロバイダ | `AWS CloudFormation` |
   | アクションモード | `スタックを作成または更新する` |
   | スタック名 | `my-app-stack` |
   | テンプレート | `BuildArtifact::template.yaml` |
   | ロール名 | CloudFormation用IAMロール |

6. 「確認して作成」

### Step 4: IAMロール権限追加

CodeBuildサービスロールに以下を追加:

```json
{
  "Effect": "Allow",
  "Action": [
    "cloudformation:*",
    "iam:PassRole",
    "s3:*"
  ],
  "Resource": "*"
}
```

---

## ② AWS CLIでの作成

### Step 1: CodeCommitリポジトリ作成

```bash
# リポジトリ作成
aws codecommit create-repository \
  --repository-name my-infra-repo \
  --repository-description "Infrastructure repository"

# クローンURL取得
aws codecommit get-repository \
  --repository-name my-infra-repo \
  --query 'repositoryMetadata.cloneUrlHttp' \
  --output text
```

### Step 2: S3アーティファクトバケット作成

```bash
# 変数設定
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)
BUCKET_NAME="codepipeline-artifacts-${ACCOUNT_ID}-${REGION}"

# バケット作成
aws s3 mb s3://${BUCKET_NAME}

# 暗号化有効化
aws s3api put-bucket-encryption \
  --bucket ${BUCKET_NAME} \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'
```

### Step 3: IAMロール作成

#### CodeBuild用ロール

```bash
# 信頼ポリシー作成
cat > codebuild-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"Service": "codebuild.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# ロール作成
aws iam create-role \
  --role-name CodeBuildServiceRole \
  --assume-role-policy-document file://codebuild-trust-policy.json
```

#### CodeBuild用ポリシー

```bash
cat > codebuild-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::${BUCKET_NAME}/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "codecommit:GitPull"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "iam:PassRole"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name CodeBuildServiceRole \
  --policy-name CodeBuildPolicy \
  --policy-document file://codebuild-policy.json
```

#### CodePipeline用ロール

```bash
# 信頼ポリシー作成
cat > codepipeline-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"Service": "codepipeline.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# ロール作成
aws iam create-role \
  --role-name CodePipelineServiceRole \
  --assume-role-policy-document file://codepipeline-trust-policy.json
```

#### CodePipeline用ポリシー

```bash
cat > codepipeline-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::${BUCKET_NAME}/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "codecommit:GetBranch",
        "codecommit:GetCommit",
        "codecommit:UploadArchive",
        "codecommit:GetUploadArchiveStatus",
        "codecommit:CancelUploadArchive"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["codebuild:BatchGetBuilds", "codebuild:StartBuild"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["cloudformation:*"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["iam:PassRole"],
      "Resource": "*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name CodePipelineServiceRole \
  --policy-name CodePipelinePolicy \
  --policy-document file://codepipeline-policy.json
```

### Step 4: CodeBuildプロジェクト作成

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)

cat > codebuild-project.json << EOF
{
  "name": "my-infra-build",
  "source": {
    "type": "CODECOMMIT",
    "location": "https://git-codecommit.${REGION}.amazonaws.com/v1/repos/my-infra-repo"
  },
  "artifacts": {
    "type": "S3",
    "location": "${BUCKET_NAME}",
    "packaging": "ZIP"
  },
  "environment": {
    "type": "LINUX_CONTAINER",
    "image": "aws/codebuild/amazonlinux2-x86_64-standard:5.0",
    "computeType": "BUILD_GENERAL1_SMALL"
  },
  "serviceRole": "arn:aws:iam::${ACCOUNT_ID}:role/CodeBuildServiceRole"
}
EOF

aws codebuild create-project --cli-input-json file://codebuild-project.json
```

### Step 5: CodePipeline作成

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)

cat > pipeline.json << EOF
{
  "pipeline": {
    "name": "my-infra-pipeline",
    "roleArn": "arn:aws:iam::${ACCOUNT_ID}:role/CodePipelineServiceRole",
    "artifactStore": {
      "type": "S3",
      "location": "${BUCKET_NAME}"
    },
    "stages": [
      {
        "name": "Source",
        "actions": [
          {
            "name": "SourceAction",
            "actionTypeId": {
              "category": "Source",
              "owner": "AWS",
              "provider": "CodeCommit",
              "version": "1"
            },
            "configuration": {
              "RepositoryName": "my-infra-repo",
              "BranchName": "main",
              "PollForSourceChanges": "false"
            },
            "outputArtifacts": [{"name": "SourceOutput"}]
          }
        ]
      },
      {
        "name": "Build",
        "actions": [
          {
            "name": "BuildAction",
            "actionTypeId": {
              "category": "Build",
              "owner": "AWS",
              "provider": "CodeBuild",
              "version": "1"
            },
            "configuration": {
              "ProjectName": "my-infra-build"
            },
            "inputArtifacts": [{"name": "SourceOutput"}],
            "outputArtifacts": [{"name": "BuildOutput"}]
          }
        ]
      },
      {
        "name": "Deploy",
        "actions": [
          {
            "name": "DeployAction",
            "actionTypeId": {
              "category": "Deploy",
              "owner": "AWS",
              "provider": "CloudFormation",
              "version": "1"
            },
            "configuration": {
              "ActionMode": "CREATE_UPDATE",
              "StackName": "my-app-stack",
              "TemplatePath": "BuildOutput::template.yaml",
              "Capabilities": "CAPABILITY_IAM,CAPABILITY_NAMED_IAM",
              "RoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/CloudFormationServiceRole"
            },
            "inputArtifacts": [{"name": "BuildOutput"}]
          }
        ]
      }
    ]
  }
}
EOF

aws codepipeline create-pipeline --cli-input-json file://pipeline.json
```

### Step 6: EventBridgeルール作成（自動トリガー）

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)

# CodeCommit変更検知ルール
cat > event-rule.json << EOF
{
  "source": ["aws.codecommit"],
  "detail-type": ["CodeCommit Repository State Change"],
  "resources": ["arn:aws:codecommit:${REGION}:${ACCOUNT_ID}:my-infra-repo"],
  "detail": {
    "event": ["referenceCreated", "referenceUpdated"],
    "referenceType": ["branch"],
    "referenceName": ["main"]
  }
}
EOF

aws events put-rule \
  --name "codecommit-my-infra-repo-main" \
  --event-pattern file://event-rule.json

# ターゲット設定（CodePipeline起動）
aws events put-targets \
  --rule "codecommit-my-infra-repo-main" \
  --targets "Id"="1","Arn"="arn:aws:codepipeline:${REGION}:${ACCOUNT_ID}:my-infra-pipeline","RoleArn"="arn:aws:iam::${ACCOUNT_ID}:role/EventBridgeCodePipelineRole"
```

---

## ③ AWS CDKでの作成

### Step 1: プロジェクト初期化

```bash
mkdir pipeline-cdk && cd pipeline-cdk
cdk init app --language typescript
npm install
```

### Step 2: パイプラインスタック作成（基本版）

```typescript
// lib/pipeline-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ===========================================
    // 1. CodeCommitリポジトリ
    // ===========================================
    const repository = new codecommit.Repository(this, 'InfraRepo', {
      repositoryName: 'my-infra-repo',
      description: 'Infrastructure as Code repository',
    });

    // ===========================================
    // 2. CodeBuildプロジェクト
    // ===========================================
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: 'my-infra-build',
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '20',
            },
            commands: [
              'npm install -g aws-cdk',
              'npm ci',
            ],
          },
          pre_build: {
            commands: [
              'cdk synth',
            ],
          },
          build: {
            commands: [
              'cdk deploy --require-approval never --all',
            ],
          },
        },
      }),
    });

    // CodeBuildに必要な権限を付与
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

    // ===========================================
    // 3. CodePipelineパイプライン
    // ===========================================
    const sourceOutput = new codepipeline.Artifact('SourceOutput');
    const buildOutput = new codepipeline.Artifact('BuildOutput');

    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'my-infra-pipeline',
      pipelineType: codepipeline.PipelineType.V2,
      stages: [
        // ソースステージ
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
        // ビルドステージ
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'CDK_Build',
              project: buildProject,
              input: sourceOutput,
              outputs: [buildOutput],
            }),
          ],
        },
      ],
    });

    // ===========================================
    // 出力
    // ===========================================
    new cdk.CfnOutput(this, 'RepositoryCloneUrl', {
      value: repository.repositoryCloneUrlHttp,
      description: 'CodeCommit repository clone URL',
    });

    new cdk.CfnOutput(this, 'PipelineArn', {
      value: pipeline.pipelineArn,
      description: 'CodePipeline ARN',
    });
  }
}
```

### Step 3: CDK Pipelines（自己更新型）を使う場合（推奨）

```typescript
// lib/pipeline-stack.ts（CDK Pipelines版）
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';

// ===========================================
// デプロイ対象のアプリケーションスタック
// ===========================================
class MyApplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // ここにデプロイしたいリソースを定義
    // 例: S3バケット、Lambda、API Gatewayなど
  }
}

// ===========================================
// アプリケーションステージ
// ===========================================
class MyApplicationStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);
    new MyApplicationStack(this, 'AppStack');
  }
}

// ===========================================
// パイプラインスタック
// ===========================================
export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // CodeCommitリポジトリ（既存参照 or 新規作成）
    // 既存リポジトリを参照する場合:
    const repository = codecommit.Repository.fromRepositoryName(
      this, 'Repo', 'my-infra-repo'
    );

    // 新規作成の場合:
    // const repository = new codecommit.Repository(this, 'Repo', {
    //   repositoryName: 'my-infra-repo',
    // });

    // ===========================================
    // CDK Pipelines - 自己更新型パイプライン
    // ===========================================
    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: 'MyAppPipeline',

      // Synthステップ（ビルド・合成）
      synth: new ShellStep('Synth', {
        input: CodePipelineSource.codeCommit(repository, 'main'),
        commands: [
          'npm ci',
          'npm run build',
          'npx cdk synth',
        ],
      }),

      // Docker使用時
      dockerEnabledForSynth: true,
    });

    // ===========================================
    // 開発環境ステージ
    // ===========================================
    pipeline.addStage(new MyApplicationStage(this, 'Dev', {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: 'ap-northeast-1'
      },
    }));

    // ===========================================
    // 本番環境ステージ（手動承認付き）
    // ===========================================
    pipeline.addStage(new MyApplicationStage(this, 'Prod', {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: 'ap-northeast-1'
      },
    }), {
      pre: [
        new cdk.pipelines.ManualApprovalStep('PromoteToProd', {
          comment: '本番環境へのデプロイを承認してください',
        }),
      ],
    });
  }
}
```

### Step 4: エントリポイント設定

```typescript
// bin/pipeline-cdk.ts
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

new PipelineStack(app, 'PipelineStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
  },
});
```

### Step 5: デプロイ

```bash
# CDK Bootstrap（初回のみ）
cdk bootstrap

# パイプラインデプロイ（初回のみ手動実行）
cdk deploy PipelineStack

# 以降はCodeCommitへのpushで自動実行
git add .
git commit -m "Initial pipeline setup"
git push origin main
```

---

## buildspec.yml サンプル

### CDK用

```yaml
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - npm install -g aws-cdk
      - npm ci

  pre_build:
    commands:
      - cdk synth

  build:
    commands:
      - cdk deploy --require-approval never --all

cache:
  paths:
    - node_modules/**/*
```

### CloudFormation用

```yaml
version: 0.2

phases:
  install:
    commands:
      - pip install cfn-lint

  pre_build:
    commands:
      - cfn-lint templates/*.yaml

  build:
    commands:
      - echo "CloudFormation template validated"

artifacts:
  files:
    - templates/**/*
    - parameters/**/*
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

## 比較まとめ

| 観点 | ①GUI | ②CLI | ③CDK |
|------|------|------|------|
| **学習コスト** | 低い | 中 | 高い |
| **再現性** | × 手動操作 | △ スクリプト化可能 | ◎ コード管理 |
| **バージョン管理** | × | △ | ◎ |
| **自動化** | × | ○ | ◎ |
| **複雑な構成** | △ | ○ | ◎ |
| **チーム開発** | × | ○ | ◎ |
| **自己更新** | × | × | ◎（CDK Pipelines） |
| **推奨用途** | 学習・検証 | 自動化スクリプト | 本番環境 |

---

## 留意事項

### IAM権限

CodeBuildサービスロールに必要な主要権限:

| 権限 | 用途 |
|------|------|
| `cloudformation:*` | スタック操作 |
| `s3:*` | アーティファクト管理 |
| `iam:PassRole` | CloudFormation用ロール付与 |
| `codecommit:GitPull` | ソースコード取得 |
| `logs:*` | ログ出力 |
| `ssm:GetParameter` | CDK Bootstrap情報（CDK使用時） |
| `sts:AssumeRole` | クロスアカウント（CDK使用時） |

### セキュリティベストプラクティス

| 項目 | 推奨設定 |
|------|---------|
| ブランチ保護 | mainブランチへの直接pushを禁止 |
| 承認ゲート | 本番デプロイ前に手動承認ステージ追加 |
| 静的解析 | cfn-lint, cdk-nag, Checkovを組み込み |
| シークレット | Secrets Manager / Parameter Store使用 |
| 暗号化 | S3アーティファクトバケットのSSE-KMS |

### トラブルシューティング

| 問題 | 原因 | 対処 |
|------|------|------|
| `AccessDenied` | IAM権限不足 | CodeBuildロールに必要な権限追加 |
| `CAPABILITY_IAM required` | IAMリソース作成 | Capabilities設定に追加 |
| `Stack is in ROLLBACK_COMPLETE` | 前回失敗 | 手動でスタック削除後再実行 |
| `Bootstrap required` | CDK環境未準備 | `cdk bootstrap`実行 |

---

## 参考リンク

- [AWS CodePipeline ユーザーガイド](https://docs.aws.amazon.com/codepipeline/latest/userguide/)
- [AWS CodeBuild ユーザーガイド](https://docs.aws.amazon.com/codebuild/latest/userguide/)
- [CDK Pipelines モジュール](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.pipelines-readme.html)
- [AWS DevOps Pipeline Accelerator](https://github.com/aws-samples/aws-devops-pipeline-accelerator)
