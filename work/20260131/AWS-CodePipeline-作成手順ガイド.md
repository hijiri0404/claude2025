# AWS CodePipeline CI/CD パイプライン作成手順ガイド

> **検証環境**: AWS ap-northeast-1 (東京リージョン) / 2026-02-02 検証済み

## 目次

1. [はじめに（初学者向け）](#はじめに初学者向け)
2. [クイックスタート](#クイックスタート)
3. [アーキテクチャ概要](#アーキテクチャ概要)
4. [前提条件](#前提条件)
5. [作成方法1: マネジメントコンソール（GUI）](#作成方法1-マネジメントコンソールgui)
6. [作成方法2: AWS CLI](#作成方法2-aws-cli) **[検証済]**
7. [作成方法3: AWS CDK（推奨）](#作成方法3-aws-cdk推奨) **[検証済]**
8. [推奨構成: マルチシステム・マルチ環境](#推奨構成-マルチシステムマルチ環境)
9. [Deployステージと手動承認](#deployステージと手動承認)
10. [運用監視とセキュリティ](#運用監視とセキュリティ)
11. [実践運用ガイド](#実践運用ガイド)
    - [ロールバック戦略](#ロールバック戦略)
    - [通知連携（Slack/Teams）](#通知連携slackteams)
    - [テスト戦略](#テスト戦略)
    - [DevOps KPI](#devops-kpi)
    - [コスト最適化](#コスト最適化)
    - [マルチアカウントデプロイ](#マルチアカウントデプロイ)
    - [障害対応手順](#障害対応手順)
    - [アーティファクト管理](#アーティファクト管理)
12. [クリーンアップ](#クリーンアップ)
13. [トラブルシューティング](#トラブルシューティング)
14. [ベストプラクティス](#ベストプラクティス)
15. [用語集](#用語集)

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

> **初学者向け: このステップで何をする？**
> ローカルPCに作業フォルダを作り、パイプラインに必要な2つのファイルを作成します。

```bash
# 作業ディレクトリ作成
mkdir my-infra && cd my-infra
# ↑ 「my-infra」というフォルダを作って、その中に移動
```

#### template.yaml（CloudFormationテンプレート）の作成

```bash
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
```

> **初学者向け: このファイルは何？**
> 「S3バケットを1個作ってください」というAWSへの指示書です。
> - `Resources`: 作りたいもの（S3バケット）
> - `Outputs`: 作成後に表示したい情報（バケット名）

#### buildspec.yml（ビルド手順書）の作成

```bash
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
```

> **初学者向け: このファイルは何？**
> CodeBuildに「何をするか」を教える手順書です。
> - `phases`: 実行するフェーズ（段階）
> - `build.commands`: 実際に実行するコマンド
> - `aws cloudformation deploy`: テンプレートを使ってリソースを作成

#### Gitリポジトリの初期化

```bash
git init && git add . && git commit -m "Initial commit"
# ↑ 3つのコマンドを連続実行:
#   git init: このフォルダをGitリポジトリにする
#   git add .: 全ファイルをステージング（コミット対象に追加）
#   git commit: 変更を記録
```

### 2. CodeCommitにプッシュ

> **初学者向け: このステップで何をする？**
> ローカルPCで作ったファイルを、AWSのCodeCommit（クラウド上のGitリポジトリ）にアップロードします。

```bash
# CodeCommitにリポジトリを作成
aws codecommit create-repository --repository-name my-infra
# ↑ AWS上に「my-infra」という名前のGitリポジトリを新規作成
```

```bash
# ローカルリポジトリとCodeCommitを紐付け
git remote add origin https://git-codecommit.ap-northeast-1.amazonaws.com/v1/repos/my-infra
# ↑ 「origin」という名前でCodeCommitのURLを登録

# コードをアップロード
git push -u origin main
# ↑ mainブランチをCodeCommitにプッシュ（アップロード）
```

> **初学者向け: 認証エラーが出たら？**
> AWS CLIの認証設定が必要です。以下を確認してください:
> ```bash
> aws configure  # アクセスキー等を設定
> git config --global credential.helper '!aws codecommit credential-helper $@'
> git config --global credential.UseHttpPath true
> ```

### 3. パイプライン作成（マネジメントコンソール）

> **初学者向け: このステップで何をする？**
> AWSコンソール（Webブラウザ）でパイプラインを作成します。

1. **CodePipelineコンソール**を開く
   - URL: https://console.aws.amazon.com/codepipeline/
   - 「パイプラインを作成」ボタンをクリック

2. **ソースステージの設定**
   - プロバイダ: `AWS CodeCommit`を選択
   - リポジトリ名: `my-infra`を選択
   - ブランチ名: `main`を選択

3. **ビルドステージの設定**
   - プロバイダ: `AWS CodeBuild`を選択
   - 「プロジェクトを作成」をクリック
   - プロジェクト名を入力（例: `my-infra-build`）
   - その他はデフォルト設定でOK

4. **デプロイステージ**: **スキップ**を選択
   > なぜスキップ？ → buildspec.yml内でデプロイするため

5. **パイプライン作成後**: CodeBuildロールに権限を追加
   - IAMコンソールで`codebuild-xxx-service-role`を検索
   - `AWSCloudFormationFullAccess`ポリシーをアタッチ

---

## アーキテクチャ概要

> **初学者向け: パイプラインの流れ**
>
> パイプラインは「工場の生産ライン」のようなものです。
> 材料（ソースコード）が投入されると、各工程（ステージ）を順番に通過して、
> 最終的に製品（デプロイされたシステム）ができあがります。

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

> **初学者向け: 各ステージの説明**
>
> | ステージ | 役割 | 例え |
> |---------|------|------|
> | **Source** | コードを取得 | 倉庫から材料を取り出す |
> | **Build** | テスト・ビルド・デプロイ | 材料を加工して製品を作る |
> | **Approval** | 人間が確認・承認 | 品質管理者がチェック |
> | **Deploy** | 本番環境に反映 | 製品を店頭に並べる |
>
> **ポイント**: このガイドではBuildステージ内でデプロイまで行います。
> （シンプルで初学者にも分かりやすいため）

### デプロイ方式の選択

| 方式 | 説明 | 推奨用途 |
|------|------|---------|
| **Buildでデプロイ（推奨）** | buildspec.yml内で`aws cloudformation deploy`実行 | 開発・検証・本番すべて |
| **Deployステージ** | CloudFormationアクション使用 | 変更セットプレビューが必要な場合 |

> **注意**: Deployステージ使用時はセッションポリシーの制限でエラーになる場合があります。詳細は[トラブルシューティング](#deployステージのセッションポリシーエラー)参照。

---

## 前提条件

> **初学者向け: 始める前に必要なもの**

### 必須要件

| 要件 | 説明 | 確認方法 |
|------|------|---------|
| **AWSアカウント** | AWSを利用するためのアカウント | [AWS公式サイト](https://aws.amazon.com/)で作成 |
| **IAMユーザー** | 管理者権限を持つユーザー | ルートアカウントではなくIAMユーザーを使用 |
| **AWS CLI** | コマンドラインからAWSを操作するツール | `aws --version` |
| **Git** | バージョン管理ツール | `git --version` |

### AWS CLIのセットアップ（未設定の場合）

```bash
# 1. AWS CLIをインストール（macOS）
brew install awscli

# 2. 認証情報を設定
aws configure
# → Access Key ID: （IAMユーザーのアクセスキー）
# → Secret Access Key: （IAMユーザーのシークレットキー）
# → Default region: ap-northeast-1（東京リージョン）
# → Default output format: json
```

### 確認コマンド

```bash
# AWS CLIの確認（自分のアカウント情報が表示されればOK）
aws sts get-caller-identity
# 出力例: {"UserId": "xxx", "Account": "123456789012", "Arn": "arn:aws:iam::..."}

# Gitの確認
git --version
# 出力例: git version 2.39.0

# Node.jsの確認（CDK使用時のみ）
node --version
# 出力例: v20.10.0
```

> **初学者向け: アクセスキーの取得方法**
> 1. AWSコンソールにログイン
> 2. 右上のユーザー名 → 「セキュリティ認証情報」
> 3. 「アクセスキーを作成」
> 4. 表示されたキーを安全に保管（二度と表示されません）

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

> **検証済み**: 2026-02-02 ap-northeast-1 で動作確認済み

自動化スクリプト向けの方法です。

> **初学者向け**: GUIで一度作成した後にCLIを試すと理解しやすいです。CLIは「GUIでやった操作をコマンドで再現できる」という点がメリットです。スクリプト化すれば、同じ環境を何度でも再現できます。

### 一括実行スクリプト

> **初学者向け: スクリプトの読み方**
> 以下のスクリプトは長いですが、やっていることはGUIと同じです。
> 各セクションに説明を入れているので、順番に読んでみてください。

```bash
#!/bin/bash
# ↑ このファイルをBashシェルで実行することを宣言

set -e
# ↑ エラーが発生したら即座にスクリプトを停止
#   これがないと、エラーを無視して続行してしまう

# === 変数設定 ===
# ↓ 自分のAWSアカウントIDを取得して変数に保存
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# ↓ AWS CLIに設定されているリージョンを取得
REGION=$(aws configure get region)

# ↓ 作成するリソースの名前を定義（好きな名前に変更可能）
REPO_NAME="my-infra-repo"          # CodeCommitリポジトリ名
BUILD_PROJECT="my-infra-build"      # CodeBuildプロジェクト名
PIPELINE_NAME="my-infra-pipeline"   # パイプライン名
ARTIFACT_BUCKET="codepipeline-${REGION}-${ACCOUNT_ID}"  # S3バケット名

# 設定値を表示（デバッグ用）
echo "Account: $ACCOUNT_ID, Region: $REGION"

# === 1. CodeCommitリポジトリ作成 ===
# ↓ AWS上にGitリポジトリを作成
#   「2>/dev/null || echo ...」はエラーを無視して続行するおまじない
aws codecommit create-repository --repository-name $REPO_NAME 2>/dev/null || echo "Repository already exists"

# === 1.5. リポジトリに初期コミット（重要！） ===
# ↓ 空のリポジトリではパイプラインが動作しないため、mainブランチを作成
#   この手順をスキップすると「no branch named main」エラーが発生
REPO_URL=$(aws codecommit get-repository --repository-name $REPO_NAME --query 'repositoryMetadata.cloneUrlHttp' --output text)
TEMP_DIR=$(mktemp -d)
cd $TEMP_DIR

# buildspec.ymlを作成（パイプラインに必須）
cat > buildspec.yml << 'BUILDSPEC'
version: 0.2
phases:
  build:
    commands:
      - echo "Build started"
      - aws cloudformation deploy --template-file template.yaml --stack-name my-infra-stack --no-fail-on-empty-changeset || echo "Skipped"
BUILDSPEC

# サンプルテンプレート作成
cat > template.yaml << 'TEMPLATE'
AWSTemplateFormatVersion: '2010-09-09'
Description: Sample Stack
Resources:
  DummyWaitHandle:
    Type: AWS::CloudFormation::WaitConditionHandle
TEMPLATE

# Gitリポジトリを初期化してプッシュ
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin $REPO_URL
git push -u origin main
cd - > /dev/null

# === 2. IAMロール作成 ===
# ↓ CodeBuild用のIAMロールを作成
#   IAMロール = サービスに付与する権限の入れ物
#   assume-role-policy = 「誰がこのロールを使えるか」の設定
#   ここでは「codebuild.amazonaws.com」= CodeBuildサービスが使える

aws iam create-role \
  --role-name codebuild-${BUILD_PROJECT}-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"codebuild.amazonaws.com"},"Action":"sts:AssumeRole"}]}' 2>/dev/null || true

# ↓ 作成したロールに権限（ポリシー）を追加
#   AWSCloudFormationFullAccess: CloudFormationでリソースを作成する権限
#   AmazonS3FullAccess: S3バケットを操作する権限
#   CloudWatchLogsFullAccess: ログを出力する権限
#   IAMFullAccess: IAMリソースを作成する権限（Lambda用ロール等）
aws iam attach-role-policy --role-name codebuild-${BUILD_PROJECT}-role --policy-arn arn:aws:iam::aws:policy/AWSCloudFormationFullAccess 2>/dev/null || true
aws iam attach-role-policy --role-name codebuild-${BUILD_PROJECT}-role --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess 2>/dev/null || true
aws iam attach-role-policy --role-name codebuild-${BUILD_PROJECT}-role --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess 2>/dev/null || true
aws iam attach-role-policy --role-name codebuild-${BUILD_PROJECT}-role --policy-arn arn:aws:iam::aws:policy/IAMFullAccess 2>/dev/null || true

# ↓ CodePipeline用のIAMロールも同様に作成
aws iam create-role \
  --role-name codepipeline-${PIPELINE_NAME}-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"codepipeline.amazonaws.com"},"Action":"sts:AssumeRole"}]}' 2>/dev/null || true

# ↓ パイプラインが他のサービスを操作するための権限
aws iam attach-role-policy --role-name codepipeline-${PIPELINE_NAME}-role --policy-arn arn:aws:iam::aws:policy/AWSCodeCommitFullAccess 2>/dev/null || true
aws iam attach-role-policy --role-name codepipeline-${PIPELINE_NAME}-role --policy-arn arn:aws:iam::aws:policy/AWSCodeBuildDeveloperAccess 2>/dev/null || true
aws iam attach-role-policy --role-name codepipeline-${PIPELINE_NAME}-role --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess 2>/dev/null || true

# ↓ IAMロールがAWS全体に反映されるまで少し待つ
#   作成直後はまだ使えないことがあるため
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
# ↓ パイプラインの設定をJSONファイルとして作成
#   JSONは設定を記述するためのデータ形式
#   重要: "pipeline"キーでラップする必要がある
cat > /tmp/pipeline.json << EOF
{
  "pipeline": {
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
}
EOF

# ↓ JSONファイルを使ってパイプラインを作成
aws codepipeline create-pipeline --cli-input-json file:///tmp/pipeline.json 2>/dev/null || echo "Pipeline already exists"

echo ""
echo "=== Pipeline created successfully ==="
echo "Repository: https://git-codecommit.${REGION}.amazonaws.com/v1/repos/${REPO_NAME}"
echo "Pipeline: https://${REGION}.console.aws.amazon.com/codesuite/codepipeline/pipelines/${PIPELINE_NAME}/view"
```

> **初学者向け: パイプラインJSONの構造**
>
> **重要**: `--cli-input-json`を使う場合、必ず`"pipeline"`キーでラップする必要があります。
>
> ```
> {
>   "pipeline": {           ← このキーが必須！
>     "name": "パイプライン名",
>     "roleArn": "パイプラインが使うIAMロール",
>     "artifactStore": "一時ファイル保存先（S3）",
>     "stages": [
>       { "name": "Source",  ... },  ← 1つ目のステージ
>       { "name": "Build",   ... }   ← 2つ目のステージ
>     ]
>   }
> }
> ```
>
> **重要な用語**:
> - `stages`: パイプラインの処理段階（Source→Build→Deployの流れ）
> - `actions`: 各ステージで実行する具体的な処理
> - `inputArtifacts`: 前のステージから受け取るファイル
> - `outputArtifacts`: 次のステージに渡すファイル

---

## 作成方法3: AWS CDK（推奨）

> **検証済み**: 2026-02-02 ap-northeast-1 / CDK v2.1100.0 で動作確認済み

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
# CDKプロジェクト用のディレクトリを作成
mkdir pipeline-cdk && cd pipeline-cdk

# CDKプロジェクトを初期化（TypeScript版）
cdk init app --language typescript
# ↑ このコマンドで以下のファイルが自動生成される:
#   - bin/          : エントリポイント（アプリの起動点）
#   - lib/          : スタック定義（リソースの設計図）
#   - package.json  : 依存パッケージの定義
#   - cdk.json      : CDKの設定ファイル

# 依存パッケージをインストール
npm install
```

> **初学者向け: CDKプロジェクトの構造**
> ```
> pipeline-cdk/
> ├── bin/
> │   └── pipeline-cdk.ts    ← アプリのエントリポイント
> ├── lib/
> │   └── pipeline-cdk-stack.ts  ← リソース定義（ここを編集）
> ├── package.json           ← 依存パッケージ一覧
> ├── tsconfig.json          ← TypeScript設定
> └── cdk.json               ← CDK設定
> ```

### Step 2: パイプラインスタック

> **初学者向け: CDKコードの読み方**
> CDKでは、AWSリソースを「クラス」として表現します。
> `new codecommit.Repository(...)` は「新しいCodeCommitリポジトリを作る」という意味です。

```typescript
// lib/pipeline-stack.ts
// ↓ 必要なライブラリをインポート（読み込み）
import * as cdk from 'aws-cdk-lib';                    // CDKの基本機能
import { Construct } from 'constructs';                // リソースの親子関係を管理
import * as codecommit from 'aws-cdk-lib/aws-codecommit';      // CodeCommit操作
import * as codebuild from 'aws-cdk-lib/aws-codebuild';        // CodeBuild操作
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';  // パイプライン操作
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions'; // アクション
import * as iam from 'aws-cdk-lib/aws-iam';                    // IAM権限操作

// ↓ このスタックに渡すパラメータの型定義
//   TypeScriptでは「どんなデータを受け取るか」を明示する
interface PipelineStackProps extends cdk.StackProps {
  repositoryName: string;   // リポジトリ名（文字列）
  pipelineName: string;     // パイプライン名（文字列）
}

// ↓ スタック = AWSリソースのまとまり
//   この1つのクラスで、リポジトリ・ビルド・パイプラインを全部作る
export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);  // 親クラスの初期化

    // ========================================
    // 1. CodeCommitリポジトリを作成
    // ========================================
    const repository = new codecommit.Repository(this, 'Repository', {
      repositoryName: props.repositoryName,  // 引数で渡された名前を使用
    });

    // ========================================
    // 2. CodeBuildプロジェクトを作成
    // ========================================
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      environment: {
        // ビルドに使用するDockerイメージ（Amazon Linux 2）
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
      },
    });

    // ========================================
    // 3. CodeBuildに権限を付与
    // ========================================
    // ↓ CLIで「attach-role-policy」したのと同じことをコードで実現
    buildProject.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudformation:*', 'iam:*', 's3:*', 'sts:AssumeRole'],
      resources: ['*'],  // 全リソースに対して許可（本番では絞るべき）
    }));

    // ========================================
    // 4. パイプラインを作成
    // ========================================
    // ↓ ステージ間でデータを受け渡すための「入れ物」
    const sourceOutput = new codepipeline.Artifact();

    new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: props.pipelineName,
      pipelineType: codepipeline.PipelineType.V2,  // 最新のV2タイプ
      stages: [
        // --- Sourceステージ: コードを取得 ---
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.CodeCommitSourceAction({
              actionName: 'Source',
              repository,        // 上で作ったリポジトリを指定
              branch: 'main',    // mainブランチを監視
              output: sourceOutput,  // 取得したコードをこの変数に格納
            }),
          ],
        },
        // --- Buildステージ: ビルド・デプロイ実行 ---
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Build',
              project: buildProject,  // 上で作ったビルドプロジェクト
              input: sourceOutput,    // Sourceステージから受け取ったコード
            }),
          ],
        },
      ],
    });

    // ========================================
    // 5. 作成後に表示する情報
    // ========================================
    // ↓ デプロイ完了後にリポジトリURLをコンソールに表示
    new cdk.CfnOutput(this, 'RepositoryUrl', {
      value: repository.repositoryCloneUrlHttp,
    });
  }
}
```

> **初学者向け: CDKコードのまとめ**
> 上記のコード約60行で、以下のAWSリソースが作成されます:
> - CodeCommitリポジトリ
> - CodeBuildプロジェクト（+IAMロール+権限）
> - CodePipeline（Source→Buildの2ステージ）
> - 必要なIAMポリシー
>
> CLIで同じことをすると100行以上のコマンドが必要です。

### Step 3: エントリポイント

> **初学者向け**: このファイルが「アプリケーションの起動点」です。
> `cdk deploy`を実行すると、このファイルが最初に読み込まれます。

```typescript
// bin/pipeline-cdk.ts
#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';  // 先ほど作ったスタック

// CDKアプリケーションを作成
const app = new cdk.App();

// パイプラインスタックをインスタンス化（実際にAWSリソースを定義）
new PipelineStack(app, 'MyPipelineStack', {
  repositoryName: 'my-infra',        // ← 好きな名前に変更可能
  pipelineName: 'my-infra-pipeline', // ← 好きな名前に変更可能
  env: {
    // 環境変数からアカウントIDとリージョンを取得
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
```

### Step 4: デプロイ

```bash
# 初回のみ: CDKを使うための準備（S3バケットやIAMロールを作成）
cdk bootstrap
# ↑ 「CDKがAWSにリソースを作る準備をする」コマンド
#   アカウント・リージョンごとに1回だけ実行すればOK

# スタックをデプロイ（AWSにリソースを作成）
cdk deploy
# ↑ このコマンドで実際にAWSリソースが作成される
#   確認メッセージが表示されたら「y」を入力
```

> **初学者向け: デプロイ後の確認**
> ```bash
> # 作成されたスタックを確認
> cdk list
>
> # スタックの詳細を確認
> aws cloudformation describe-stacks --stack-name MyPipelineStack
>
> # リソースを削除したい場合
> cdk destroy
> ```

---

## 推奨構成: マルチシステム・マルチ環境

> **検証済み**: 2026-02-02 ap-northeast-1 でCloudFormationスタック（01-network.yaml）の動作確認済み

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

> **検証済み**: 2026-02-02 ap-northeast-1 で動作確認済み

以下のJSON（ステージ定義）を `stages` 配列に追加します:

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

**手動承認付きパイプライン 完全版一括実行スクリプト**:

> **検証済み**: 2026-02-02 ap-northeast-1 で動作確認済み

```bash
#!/bin/bash
set -e

# === 変数設定 ===
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)
ARTIFACT_BUCKET="codepipeline-${REGION}-${ACCOUNT_ID}"
REPO_NAME="my-approval-repo"
BUILD_PROJECT="my-approval-build"
PIPELINE_NAME="my-approval-pipeline"

echo "Account: $ACCOUNT_ID, Region: $REGION"

# === 1. CodeCommitリポジトリ作成 ===
aws codecommit create-repository --repository-name $REPO_NAME 2>/dev/null || echo "Repository exists"

# === 1.5. リポジトリに初期コミット ===
REPO_URL=$(aws codecommit get-repository --repository-name $REPO_NAME --query 'repositoryMetadata.cloneUrlHttp' --output text)
TEMP_DIR=$(mktemp -d)
cd $TEMP_DIR
git init

# buildspec.yml（正しい形式で作成）
cat > buildspec.yml << 'BUILDSPEC'
version: 0.2

phases:
  build:
    commands:
      - echo "Build started"
      - echo "Environment is ${ENVIRONMENT:-dev}"
BUILDSPEC

git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin $REPO_URL
git push -u origin main 2>/dev/null || echo "Already pushed"
cd -

# === 2. IAMロール作成 ===
# CodeBuildロール
aws iam create-role \
  --role-name codebuild-${BUILD_PROJECT}-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"codebuild.amazonaws.com"},"Action":"sts:AssumeRole"}]}' 2>/dev/null || true

# 重要: S3アクセス権限が必要（アーティファクト取得のため）
aws iam attach-role-policy --role-name codebuild-${BUILD_PROJECT}-role --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess 2>/dev/null || true
aws iam attach-role-policy --role-name codebuild-${BUILD_PROJECT}-role --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess 2>/dev/null || true

# CodePipelineロール
aws iam create-role \
  --role-name codepipeline-${PIPELINE_NAME}-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"codepipeline.amazonaws.com"},"Action":"sts:AssumeRole"}]}' 2>/dev/null || true

aws iam attach-role-policy --role-name codepipeline-${PIPELINE_NAME}-role --policy-arn arn:aws:iam::aws:policy/AWSCodeCommitFullAccess 2>/dev/null || true
aws iam attach-role-policy --role-name codepipeline-${PIPELINE_NAME}-role --policy-arn arn:aws:iam::aws:policy/AWSCodeBuildDeveloperAccess 2>/dev/null || true
aws iam attach-role-policy --role-name codepipeline-${PIPELINE_NAME}-role --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess 2>/dev/null || true

echo "Waiting for IAM propagation..."
sleep 15

# === 3. CodeBuildプロジェクト作成 ===
aws codebuild create-project \
  --name $BUILD_PROJECT \
  --source "type=CODECOMMIT,location=https://git-codecommit.${REGION}.amazonaws.com/v1/repos/${REPO_NAME}" \
  --environment "type=LINUX_CONTAINER,computeType=BUILD_GENERAL1_SMALL,image=aws/codebuild/amazonlinux2-x86_64-standard:5.0" \
  --service-role "arn:aws:iam::${ACCOUNT_ID}:role/codebuild-${BUILD_PROJECT}-role" \
  --artifacts "type=NO_ARTIFACTS" 2>/dev/null || echo "Build project exists"

# === 4. 手動承認付きパイプライン作成 ===
cat > /tmp/pipeline-with-approval.json << EOF
{
  "pipeline": {
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
      },
      {
        "name": "Approval",
        "actions": [{
          "name": "ManualApproval",
          "actionTypeId": {"category": "Approval", "owner": "AWS", "provider": "Manual", "version": "1"},
          "configuration": {"CustomData": "本番環境へのデプロイを承認してください"}
        }]
      },
      {
        "name": "Deploy",
        "actions": [{
          "name": "Deploy",
          "actionTypeId": {"category": "Build", "owner": "AWS", "provider": "CodeBuild", "version": "1"},
          "configuration": {"ProjectName": "${BUILD_PROJECT}", "EnvironmentVariables": "[{\"name\":\"ENVIRONMENT\",\"value\":\"prod\",\"type\":\"PLAINTEXT\"}]"},
          "inputArtifacts": [{"name": "SourceOutput"}]
        }]
      }
    ],
    "pipelineType": "V2"
  }
}
EOF

aws codepipeline create-pipeline --cli-input-json file:///tmp/pipeline-with-approval.json

echo ""
echo "=== Pipeline created successfully ==="
echo "Pipeline: https://${REGION}.console.aws.amazon.com/codesuite/codepipeline/pipelines/${PIPELINE_NAME}/view"
```

> **初学者向け: 重要なポイント**
>
> 1. **S3アクセス権限が必須**: CodeBuildロールには `AmazonS3FullAccess` が必要です。パイプラインがアーティファクトをS3経由で受け渡すためです。
> 2. **buildspec.ymlの形式**: YAMLのインデントを正確に記述してください。空白行があるとエラーになる場合があります。
> 3. **IAM伝播待機**: ロール作成後は15秒程度待機が必要です。

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

## 運用監視とセキュリティ

本番環境でCI/CDパイプラインを運用するために必要な監視設定とセキュリティ対策を解説します。

### CloudWatch によるパイプライン監視

#### パイプライン実行の監視

CodePipelineは自動的にCloudWatch Metricsにメトリクスを送信します。

**主要メトリクス**:

| メトリクス | 説明 | 監視ポイント |
|-----------|------|-------------|
| `SucceededActions` | 成功したアクション数 | デプロイ成功率 |
| `FailedActions` | 失敗したアクション数 | 障害検知 |
| `ActionExecutionTime` | アクション実行時間 | パフォーマンス劣化検知 |

#### CloudWatch アラームの設定

パイプライン失敗時に通知を受け取る設定:

```bash
# SNSトピック作成
aws sns create-topic --name pipeline-alerts
aws sns subscribe --topic-arn arn:aws:sns:ap-northeast-1:${ACCOUNT_ID}:pipeline-alerts \
  --protocol email --notification-endpoint your-email@example.com

# パイプライン失敗アラーム作成
aws cloudwatch put-metric-alarm \
  --alarm-name "Pipeline-Failure-Alert" \
  --alarm-description "CodePipeline execution failed" \
  --metric-name "FailedActions" \
  --namespace "AWS/CodePipeline" \
  --statistic Sum \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:ap-northeast-1:${ACCOUNT_ID}:pipeline-alerts \
  --dimensions Name=PipelineName,Value=my-infra-pipeline
```

#### EventBridge によるパイプラインイベント監視

パイプラインの状態変化をリアルタイムで検知:

```json
{
  "source": ["aws.codepipeline"],
  "detail-type": ["CodePipeline Pipeline Execution State Change"],
  "detail": {
    "state": ["FAILED", "STOPPED", "SUCCEEDED"]
  }
}
```

**EventBridge ルール作成（CLI）**:

```bash
aws events put-rule \
  --name "CodePipeline-State-Change" \
  --event-pattern '{
    "source": ["aws.codepipeline"],
    "detail-type": ["CodePipeline Pipeline Execution State Change"],
    "detail": {
      "state": ["FAILED"]
    }
  }'

aws events put-targets \
  --rule "CodePipeline-State-Change" \
  --targets "Id"="1","Arn"="arn:aws:sns:ap-northeast-1:${ACCOUNT_ID}:pipeline-alerts"
```

#### CodeBuild ログの監視

CodeBuildのビルドログはCloudWatch Logsに自動保存されます。

**ログの検索**:

```bash
# ビルドエラーを検索
aws logs filter-log-events \
  --log-group-name "/aws/codebuild/my-infra-build" \
  --filter-pattern "ERROR"

# 最新のログを取得
aws logs tail "/aws/codebuild/my-infra-build" --follow
```

**ログメトリクスフィルターの設定**:

```bash
# エラー発生回数をメトリクス化
aws logs put-metric-filter \
  --log-group-name "/aws/codebuild/my-infra-build" \
  --filter-name "BuildErrors" \
  --filter-pattern "ERROR" \
  --metric-transformations \
    metricName=BuildErrorCount,metricNamespace=CustomMetrics,metricValue=1
```

### CloudWatch ダッシュボード

パイプラインの状態を一覧表示:

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "title": "Pipeline Success Rate",
        "metrics": [
          ["AWS/CodePipeline", "SucceededActions", "PipelineName", "my-infra-pipeline"],
          [".", "FailedActions", ".", "."]
        ],
        "period": 3600,
        "stat": "Sum"
      }
    },
    {
      "type": "metric",
      "properties": {
        "title": "Build Duration",
        "metrics": [
          ["AWS/CodeBuild", "Duration", "ProjectName", "my-infra-build"]
        ],
        "period": 3600,
        "stat": "Average"
      }
    }
  ]
}
```

### セキュリティ対策

#### IAM 最小権限の原則

**悪い例（本番環境で使用禁止）**:

```json
{
  "Effect": "Allow",
  "Action": "*",
  "Resource": "*"
}
```

**良い例（必要最小限の権限）**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationDeploy",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents"
      ],
      "Resource": "arn:aws:cloudformation:ap-northeast-1:*:stack/my-app-*/*"
    },
    {
      "Sid": "S3ArtifactAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::codepipeline-ap-northeast-1-*/my-app-*"
    }
  ]
}
```

#### シークレット管理

**絶対にやってはいけないこと**:

```yaml
# ❌ 悪い例: buildspec.yml にシークレットを直接記載
env:
  variables:
    DB_PASSWORD: "MySecretPassword123"  # 絶対NG！
```

**推奨方法1: Systems Manager Parameter Store**:

```yaml
# ✅ 良い例: Parameter Store から取得
env:
  parameter-store:
    DB_PASSWORD: /myapp/prod/db-password
```

**推奨方法2: Secrets Manager**:

```yaml
# ✅ 良い例: Secrets Manager から取得
env:
  secrets-manager:
    DB_CREDENTIALS: myapp/prod/db-credentials
```

#### CloudTrail による監査ログ

パイプラインの操作履歴を記録:

```bash
# CloudTrail証跡の作成
aws cloudtrail create-trail \
  --name pipeline-audit-trail \
  --s3-bucket-name my-cloudtrail-logs-bucket \
  --include-global-service-events

# ログの確認
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventSource,AttributeValue=codepipeline.amazonaws.com
```

**監視すべきイベント**:

| イベント | 説明 | 重要度 |
|---------|------|--------|
| `CreatePipeline` | パイプライン作成 | 中 |
| `UpdatePipeline` | パイプライン更新 | 高 |
| `DeletePipeline` | パイプライン削除 | 高 |
| `StartPipelineExecution` | 手動実行 | 中 |
| `PutJobSuccessResult` | アクション成功 | 低 |
| `PutJobFailureResult` | アクション失敗 | 高 |

#### ブランチ保護とコードレビュー

**CodeCommit ブランチ保護**:

```bash
# mainブランチへの直接pushを禁止するトリガー
aws codecommit put-repository-triggers \
  --repository-name my-infra \
  --triggers '[{
    "name": "DenyDirectPush",
    "destinationArn": "arn:aws:lambda:ap-northeast-1:${ACCOUNT_ID}:function:DenyDirectPush",
    "branches": ["main"],
    "events": ["updateReference"]
  }]'
```

**承認ルールの設定（CodeCommit）**:

```bash
# プルリクエスト承認ルール
aws codecommit create-approval-rule-template \
  --approval-rule-template-name "RequireApproval" \
  --approval-rule-template-content '{
    "Version": "2018-11-08",
    "Statements": [{
      "Type": "Approvers",
      "NumberOfApprovalsNeeded": 1,
      "ApprovalPoolMembers": ["arn:aws:iam::*:role/CodeReviewer"]
    }]
  }'
```

#### 静的解析の組み込み

**buildspec.yml での静的解析**:

```yaml
version: 0.2

phases:
  install:
    commands:
      - pip install cfn-lint checkov

  pre_build:
    commands:
      # CloudFormation Linter
      - echo "=== Running cfn-lint ==="
      - cfn-lint template.yaml

      # Checkov（セキュリティスキャン）
      - echo "=== Running Checkov ==="
      - checkov -f template.yaml --framework cloudformation

  build:
    commands:
      - aws cloudformation deploy --template-file template.yaml --stack-name my-stack
```

**CDK Nag（CDKプロジェクト向け）**:

```typescript
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';

// アプリケーション全体にセキュリティチェックを適用
Aspects.of(app).add(new AwsSolutionsChecks());
```

### 運用チェックリスト

#### デプロイ前チェック

- [ ] IAMロールは最小権限になっているか
- [ ] シークレットはParameter Store/Secrets Managerで管理しているか
- [ ] buildspec.ymlに機密情報が含まれていないか
- [ ] 静的解析（cfn-lint, checkov）が組み込まれているか
- [ ] 本番デプロイ前に手動承認ステージがあるか

#### 運用開始後チェック

- [ ] CloudWatchアラームが設定されているか
- [ ] 失敗時のSNS通知が設定されているか
- [ ] CloudTrailでAPIコールが記録されているか
- [ ] ログの保持期間は適切か
- [ ] 定期的なセキュリティレビューを実施しているか

---

## 実践運用ガイド

本番環境でCI/CDパイプラインを運用する際に必要な実践的なノウハウを解説します。

### ロールバック戦略

デプロイ失敗時に迅速にサービスを復旧させるための戦略です。

#### CloudFormation のロールバック設定

**自動ロールバック（推奨）**:

```yaml
# buildspec.yml
phases:
  build:
    commands:
      - aws cloudformation deploy \
          --template-file template.yaml \
          --stack-name my-app-stack \
          --capabilities CAPABILITY_IAM \
          --rollback-configuration "RollbackTriggers=[{Arn=arn:aws:cloudwatch:ap-northeast-1:${ACCOUNT_ID}:alarm:MyApp-HealthCheck,Type=AWS::CloudWatch::Alarm}]"
```

**手動ロールバック手順**:

```bash
# 1. 現在のスタックイベントを確認
aws cloudformation describe-stack-events --stack-name my-app-stack

# 2. 失敗したスタックを前のバージョンにロールバック
aws cloudformation rollback-stack --stack-name my-app-stack

# 3. または特定のバージョンに戻す（変更セット経由）
aws cloudformation create-change-set \
  --stack-name my-app-stack \
  --change-set-name rollback-to-v1 \
  --template-url s3://my-bucket/templates/v1/template.yaml

aws cloudformation execute-change-set \
  --stack-name my-app-stack \
  --change-set-name rollback-to-v1
```

#### CodeDeploy のロールバック

```bash
# 自動ロールバックを有効化
aws deploy update-deployment-group \
  --application-name my-app \
  --deployment-group-name prod \
  --auto-rollback-configuration "enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM"

# 手動ロールバック（前のデプロイに戻す）
aws deploy create-deployment \
  --application-name my-app \
  --deployment-group-name prod \
  --revision revisionType=S3,s3Location="{bucket=my-bucket,key=previous-version.zip,bundleType=zip}"
```

#### ロールバック判断フローチャート

```
デプロイ完了
    ↓
ヘルスチェック実行
    ↓
┌─────────────────┐
│ 正常？          │
└─────────────────┘
    │YES        │NO
    ↓           ↓
  完了      ┌─────────────────┐
            │ 自動ロールバック │
            │ 設定あり？       │
            └─────────────────┘
                │YES        │NO
                ↓           ↓
           自動復旧    手動対応
                          ↓
                    ┌─────────────────┐
                    │ 5分以内に復旧   │
                    │ 可能？          │
                    └─────────────────┘
                        │YES        │NO
                        ↓           ↓
                    手動ロール   インシデント
                    バック実行    対応開始
```

### 通知連携（Slack/Teams）

#### Slack 通知の設定

**1. AWS Chatbot を使用（推奨）**:

```bash
# SNSトピック作成
aws sns create-topic --name pipeline-notifications

# Chatbotの設定はコンソールから実施
# 1. AWS Chatbot コンソールを開く
# 2. Slackワークスペースを連携
# 3. チャンネルを設定
# 4. SNSトピックを紐付け
```

**2. Lambda を使用したカスタム通知**:

```python
# lambda_function.py
import json
import urllib3
import os

def lambda_handler(event, context):
    # SNSメッセージをパース
    message = json.loads(event['Records'][0]['Sns']['Message'])

    # Slack Webhook URL（環境変数から取得）
    webhook_url = os.environ['SLACK_WEBHOOK_URL']

    # パイプライン情報を抽出
    pipeline = message.get('detail', {}).get('pipeline', 'Unknown')
    state = message.get('detail', {}).get('state', 'Unknown')

    # 色を状態に応じて設定
    color = {
        'SUCCEEDED': '#36a64f',  # 緑
        'FAILED': '#ff0000',     # 赤
        'STARTED': '#439fe0',    # 青
    }.get(state, '#808080')

    # Slackメッセージを構築
    slack_message = {
        'attachments': [{
            'color': color,
            'title': f'Pipeline: {pipeline}',
            'text': f'State: {state}',
            'footer': 'AWS CodePipeline',
            'ts': int(context.get_remaining_time_in_millis() / 1000)
        }]
    }

    # Slackに送信
    http = urllib3.PoolManager()
    response = http.request(
        'POST',
        webhook_url,
        body=json.dumps(slack_message),
        headers={'Content-Type': 'application/json'}
    )

    return {'statusCode': response.status}
```

**EventBridge ルールの設定**:

```bash
aws events put-rule \
  --name "Pipeline-Slack-Notification" \
  --event-pattern '{
    "source": ["aws.codepipeline"],
    "detail-type": ["CodePipeline Pipeline Execution State Change"],
    "detail": {
      "state": ["SUCCEEDED", "FAILED", "STARTED"]
    }
  }'

aws events put-targets \
  --rule "Pipeline-Slack-Notification" \
  --targets "Id"="1","Arn"="arn:aws:lambda:ap-northeast-1:${ACCOUNT_ID}:function:SlackNotifier"
```

#### Microsoft Teams 通知

```python
# teams_notification.py
import json
import urllib3

def send_teams_notification(webhook_url, pipeline, state, execution_id):
    color = {
        'SUCCEEDED': '00FF00',
        'FAILED': 'FF0000',
        'STARTED': '0000FF',
    }.get(state, '808080')

    message = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": color,
        "summary": f"Pipeline {pipeline} - {state}",
        "sections": [{
            "activityTitle": f"Pipeline: {pipeline}",
            "facts": [
                {"name": "State", "value": state},
                {"name": "Execution ID", "value": execution_id}
            ],
            "markdown": True
        }],
        "potentialAction": [{
            "@type": "OpenUri",
            "name": "View Pipeline",
            "targets": [{
                "os": "default",
                "uri": f"https://ap-northeast-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/{pipeline}/view"
            }]
        }]
    }

    http = urllib3.PoolManager()
    http.request('POST', webhook_url, body=json.dumps(message))
```

#### PagerDuty/Opsgenie 連携（オンコール対応）

```bash
# PagerDuty Events API v2 を使用
aws events put-targets \
  --rule "Pipeline-Critical-Failure" \
  --targets '[{
    "Id": "pagerduty",
    "Arn": "arn:aws:events:ap-northeast-1:${ACCOUNT_ID}:api-destination/PagerDuty",
    "HttpParameters": {
      "HeaderParameters": {
        "Content-Type": "application/json"
      }
    },
    "InputTransformer": {
      "InputPathsMap": {
        "pipeline": "$.detail.pipeline",
        "state": "$.detail.state"
      },
      "InputTemplate": "{\"routing_key\":\"YOUR_ROUTING_KEY\",\"event_action\":\"trigger\",\"payload\":{\"summary\":\"Pipeline <pipeline> failed\",\"severity\":\"critical\",\"source\":\"AWS CodePipeline\"}}"
    }
  }]'
```

### テスト戦略

パイプライン内でのテスト実行戦略です。

#### テストピラミッド

```
              ┌─────────────┐
              │   E2E Test  │  ← 少数、遅い、高コスト
              │    (10%)    │
              ├─────────────┤
              │ Integration │  ← 中程度
              │   Test      │
              │   (20%)     │
              ├─────────────┤
              │  Unit Test  │  ← 多数、高速、低コスト
              │   (70%)     │
              └─────────────┘
```

#### buildspec.yml でのテスト実行

```yaml
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - npm ci

  pre_build:
    commands:
      # ユニットテスト
      - echo "=== Running Unit Tests ==="
      - npm run test:unit -- --coverage

      # 静的解析
      - echo "=== Running Linter ==="
      - npm run lint

      # セキュリティスキャン
      - echo "=== Running Security Scan ==="
      - npm audit --audit-level=high

  build:
    commands:
      - npm run build

      # 統合テスト
      - echo "=== Running Integration Tests ==="
      - npm run test:integration

  post_build:
    commands:
      # E2Eテスト（本番デプロイ後に実行することも）
      - echo "=== Running E2E Tests ==="
      - npm run test:e2e || echo "E2E tests completed with warnings"

reports:
  # テストレポートをCodeBuildに統合
  unit-tests:
    files:
      - 'coverage/junit.xml'
    file-format: JUNITXML

  coverage:
    files:
      - 'coverage/cobertura-coverage.xml'
    file-format: COBERTURAXML

artifacts:
  files:
    - '**/*'
  exclude-paths:
    - 'node_modules/**/*'
```

#### テストステージの分離

```
Source → Build → Test(Unit) → Test(Integration) → Approval → Deploy → Test(E2E)
                     ↓              ↓
                 並列実行可能    スモークテスト
```

**パイプラインでのテストステージ分離（CDK）**:

```typescript
const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
  stages: [
    { stageName: 'Source', actions: [sourceAction] },
    { stageName: 'Build', actions: [buildAction] },
    {
      stageName: 'Test',
      actions: [
        // 並列実行
        new codepipeline_actions.CodeBuildAction({
          actionName: 'UnitTest',
          project: unitTestProject,
          input: buildOutput,
          runOrder: 1,
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'SecurityScan',
          project: securityScanProject,
          input: buildOutput,
          runOrder: 1,  // 同じrunOrderで並列実行
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'IntegrationTest',
          project: integrationTestProject,
          input: buildOutput,
          runOrder: 2,  // Unit/Securityの後に実行
        }),
      ],
    },
    { stageName: 'Deploy', actions: [deployAction] },
  ],
});
```

### DevOps KPI

パイプラインの健全性を測定する指標です。

#### DORA メトリクス

| メトリクス | 説明 | 目標値（エリート） |
|-----------|------|-------------------|
| **デプロイ頻度** | 本番へのデプロイ回数 | 1日複数回 |
| **リードタイム** | コミットから本番デプロイまで | 1時間未満 |
| **MTTR** | 障害発生から復旧まで | 1時間未満 |
| **変更失敗率** | デプロイ失敗の割合 | 0-15% |

#### CloudWatch メトリクスでのKPI計測

```bash
# カスタムメトリクスを送信するスクリプト
#!/bin/bash

# デプロイ頻度（過去24時間のデプロイ成功数）
DEPLOY_COUNT=$(aws codepipeline list-pipeline-executions \
  --pipeline-name my-pipeline \
  --query "pipelineExecutionSummaries[?status=='Succeeded' && startTime>=\`$(date -d '24 hours ago' --iso-8601=seconds)\`]" \
  --output json | jq length)

aws cloudwatch put-metric-data \
  --namespace "DevOps/KPI" \
  --metric-name "DeployFrequency" \
  --value $DEPLOY_COUNT \
  --unit "Count" \
  --dimensions PipelineName=my-pipeline

# 変更失敗率
TOTAL=$(aws codepipeline list-pipeline-executions \
  --pipeline-name my-pipeline \
  --query "length(pipelineExecutionSummaries[?startTime>=\`$(date -d '7 days ago' --iso-8601=seconds)\`])")

FAILED=$(aws codepipeline list-pipeline-executions \
  --pipeline-name my-pipeline \
  --query "length(pipelineExecutionSummaries[?status=='Failed' && startTime>=\`$(date -d '7 days ago' --iso-8601=seconds)\`])")

if [ $TOTAL -gt 0 ]; then
  FAILURE_RATE=$(echo "scale=2; $FAILED / $TOTAL * 100" | bc)
else
  FAILURE_RATE=0
fi

aws cloudwatch put-metric-data \
  --namespace "DevOps/KPI" \
  --metric-name "ChangeFailureRate" \
  --value $FAILURE_RATE \
  --unit "Percent" \
  --dimensions PipelineName=my-pipeline
```

#### KPI ダッシュボード（CloudWatch）

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "title": "Deploy Frequency (Daily)",
        "metrics": [["DevOps/KPI", "DeployFrequency", "PipelineName", "my-pipeline"]],
        "period": 86400,
        "stat": "Sum",
        "region": "ap-northeast-1"
      }
    },
    {
      "type": "metric",
      "properties": {
        "title": "Change Failure Rate (%)",
        "metrics": [["DevOps/KPI", "ChangeFailureRate", "PipelineName", "my-pipeline"]],
        "period": 604800,
        "stat": "Average",
        "region": "ap-northeast-1"
      }
    },
    {
      "type": "metric",
      "properties": {
        "title": "Pipeline Duration (Lead Time)",
        "metrics": [
          ["AWS/CodePipeline", "SucceededActions", "PipelineName", "my-pipeline", {"stat": "SampleCount"}]
        ],
        "period": 3600
      }
    }
  ]
}
```

### コスト最適化

パイプライン実行コストを最適化する方法です。

#### コスト内訳

| サービス | 課金単位 | 目安コスト |
|---------|---------|-----------|
| CodePipeline | アクティブパイプライン/月 | $1/パイプライン |
| CodeBuild | ビルド時間（分） | $0.005/分（small） |
| S3（アーティファクト） | ストレージ + リクエスト | $0.023/GB/月 |
| CloudWatch Logs | ログ保存量 | $0.033/GB |

#### コスト削減テクニック

**1. CodeBuild インスタンスサイズの最適化**:

```yaml
# buildspec.yml でキャッシュを活用
version: 0.2

cache:
  paths:
    - 'node_modules/**/*'
    - '.npm/**/*'

phases:
  install:
    commands:
      # キャッシュがあればスキップ
      - '[ -d node_modules ] && echo "Using cached node_modules" || npm ci'
```

**2. S3 ライフサイクルポリシー**:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket codepipeline-ap-northeast-1-xxxxx \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "DeleteOldArtifacts",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "Expiration": {"Days": 30},
      "NoncurrentVersionExpiration": {"NoncurrentDays": 7}
    }]
  }'
```

**3. CloudWatch Logs 保持期間**:

```bash
aws logs put-retention-policy \
  --log-group-name /aws/codebuild/my-build-project \
  --retention-in-days 14
```

**4. 並列実行の活用（時間短縮）**:

```typescript
// CDK: 並列ビルドで時間短縮 = コスト削減
{
  stageName: 'Build',
  actions: [
    new CodeBuildAction({ actionName: 'Build-A', runOrder: 1 }),
    new CodeBuildAction({ actionName: 'Build-B', runOrder: 1 }),  // 並列
    new CodeBuildAction({ actionName: 'Build-C', runOrder: 1 }),  // 並列
  ],
}
```

#### コスト監視アラーム

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "CodeBuild-CostAlert" \
  --alarm-description "CodeBuild cost exceeded threshold" \
  --metric-name "EstimatedCharges" \
  --namespace "AWS/Billing" \
  --statistic Maximum \
  --period 86400 \
  --threshold 50 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=ServiceName,Value=CodeBuild \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:ap-northeast-1:${ACCOUNT_ID}:billing-alerts
```

### マルチアカウントデプロイ

本番環境では、開発/検証/本番を別アカウントで管理することが推奨されます。

#### クロスアカウント構成

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DevOps Account (中央管理)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │ CodeCommit  │  │ CodePipeline│  │   S3       │                  │
│  │             │  │             │  │(Artifacts) │                  │
│  └─────────────┘  └──────┬──────┘  └─────────────┘                  │
└──────────────────────────┼──────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  Dev Account  │  │  Stg Account  │  │ Prod Account  │
│ (111111111111)│  │ (222222222222)│  │ (333333333333)│
│               │  │               │  │               │
│ CloudFormation│  │ CloudFormation│  │ CloudFormation│
│    deploy     │  │    deploy     │  │    deploy     │
└───────────────┘  └───────────────┘  └───────────────┘
```

#### クロスアカウント IAM ロール設定

**ターゲットアカウント（デプロイ先）のロール**:

```yaml
# cross-account-role.yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: Cross-account role for CodePipeline

Parameters:
  DevOpsAccountId:
    Type: String
    Description: DevOps account ID

Resources:
  CrossAccountRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: CodePipeline-CrossAccount-Role
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              AWS: !Sub 'arn:aws:iam::${DevOpsAccountId}:root'
            Action: 'sts:AssumeRole'
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/AWSCloudFormationFullAccess
      Policies:
        - PolicyName: S3ArtifactAccess
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - 's3:GetObject'
                  - 's3:GetObjectVersion'
                Resource: !Sub 'arn:aws:s3:::codepipeline-${DevOpsAccountId}-*/*'
              - Effect: Allow
                Action:
                  - 'kms:Decrypt'
                Resource: '*'
```

**DevOpsアカウントのパイプライン設定**:

```typescript
// CDK: クロスアカウントデプロイ
const prodDeployRole = iam.Role.fromRoleArn(
  this, 'ProdDeployRole',
  'arn:aws:iam::333333333333:role/CodePipeline-CrossAccount-Role'
);

new codepipeline_actions.CloudFormationCreateUpdateStackAction({
  actionName: 'DeployToProd',
  stackName: 'my-app-stack',
  templatePath: buildOutput.atPath('template.yaml'),
  adminPermissions: true,
  role: prodDeployRole,  // クロスアカウントロールを指定
});
```

### 障害対応手順

パイプライン障害発生時の対応フローです。

#### 障害対応フローチャート

```
アラート受信
    ↓
┌─────────────────┐
│ 1. 初期確認     │  ← 5分以内
│   - 影響範囲    │
│   - 緊急度判定  │
└─────────────────┘
    ↓
┌─────────────────┐
│ 2. 情報収集     │  ← 10分以内
│   - ログ確認    │
│   - メトリクス  │
│   - 最近の変更  │
└─────────────────┘
    ↓
┌─────────────────┐
│ 3. 判断         │
│   - 復旧優先？  │
│   - 原因調査？  │
└─────────────────┘
    │
┌───┴───┐
↓       ↓
復旧   調査
 ↓      ↓
ロール  詳細
バック  分析
    │
    ↓
┌─────────────────┐
│ 4. 再発防止     │
│   - RCA作成     │
│   - 対策実施    │
└─────────────────┘
```

#### 障害対応コマンド集

```bash
#!/bin/bash
# incident-response.sh

# 1. パイプライン状態確認
aws codepipeline get-pipeline-state --name my-pipeline

# 2. 失敗したアクションの詳細
aws codepipeline get-pipeline-execution \
  --pipeline-name my-pipeline \
  --pipeline-execution-id <execution-id>

# 3. CodeBuildログ取得
aws logs get-log-events \
  --log-group-name /aws/codebuild/my-build \
  --log-stream-name <log-stream-name> \
  --limit 100

# 4. 最近の変更（CloudTrail）
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventSource,AttributeValue=codepipeline.amazonaws.com \
  --start-time $(date -d '1 hour ago' --iso-8601=seconds)

# 5. 緊急ロールバック
aws cloudformation rollback-stack --stack-name my-app-stack

# 6. パイプライン無効化（緊急停止）
aws codepipeline disable-stage-transition \
  --pipeline-name my-pipeline \
  --stage-name Deploy \
  --transition-type Inbound \
  --reason "Emergency stop due to incident"
```

#### インシデント報告テンプレート

```markdown
# インシデント報告書

## 概要
- **発生日時**: YYYY-MM-DD HH:MM (JST)
- **復旧日時**: YYYY-MM-DD HH:MM (JST)
- **影響範囲**: [サービス名、ユーザー数など]
- **重大度**: Critical / High / Medium / Low

## タイムライン
| 時刻 | イベント |
|------|---------|
| HH:MM | アラート発報 |
| HH:MM | 初期対応開始 |
| HH:MM | 原因特定 |
| HH:MM | 復旧完了 |

## 根本原因
[原因の詳細説明]

## 対応内容
[実施した対応の詳細]

## 再発防止策
- [ ] 対策1
- [ ] 対策2
- [ ] 対策3

## 教訓
[今後のために学んだこと]
```

### アーティファクト管理

ビルド成果物のバージョン管理と保持ポリシーです。

#### S3 バージョニングの有効化

```bash
aws s3api put-bucket-versioning \
  --bucket codepipeline-artifacts-bucket \
  --versioning-configuration Status=Enabled
```

#### アーティファクト保持ポリシー

```json
{
  "Rules": [
    {
      "ID": "RetainRecentArtifacts",
      "Status": "Enabled",
      "Filter": {
        "Prefix": ""
      },
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        }
      ],
      "Expiration": {
        "Days": 365
      },
      "NoncurrentVersionTransitions": [
        {
          "NoncurrentDays": 30,
          "StorageClass": "GLACIER"
        }
      ],
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 90
      }
    }
  ]
}
```

#### アーティファクトのタグ付け

```yaml
# buildspec.yml でアーティファクトにメタデータを付与
version: 0.2

env:
  exported-variables:
    - BUILD_VERSION
    - COMMIT_HASH

phases:
  pre_build:
    commands:
      - export BUILD_VERSION=$(date +%Y%m%d-%H%M%S)
      - export COMMIT_HASH=$(git rev-parse --short HEAD)

  post_build:
    commands:
      # アーティファクトにタグを付与
      - |
        aws s3 cp dist/app.zip s3://my-artifacts-bucket/releases/${BUILD_VERSION}/app.zip \
          --metadata "commit=${COMMIT_HASH},build-time=$(date -Iseconds)"

artifacts:
  files:
    - dist/**/*
  name: build-${BUILD_VERSION}
```

#### アーティファクト一覧の管理

```bash
# 最新5件のアーティファクトを表示
aws s3api list-object-versions \
  --bucket codepipeline-artifacts-bucket \
  --prefix "my-pipeline/" \
  --max-keys 5 \
  --query 'Versions[*].{Key:Key,VersionId:VersionId,LastModified:LastModified}'

# 特定バージョンのアーティファクトを取得
aws s3 cp \
  s3://codepipeline-artifacts-bucket/my-pipeline/artifact.zip \
  ./artifact.zip \
  --version-id "xxxxx"
```

---

## クリーンアップ

学習・検証後にリソースを削除してコストを抑えるための手順です。

> **注意**: 削除操作は取り消せません。本番環境のリソースを誤って削除しないよう注意してください。

### CLI で作成したリソースの削除

```bash
#!/bin/bash
# cleanup-cli.sh

# 変数設定（作成時と同じ値を使用）
REPO_NAME="my-infra-repo"
BUILD_PROJECT="my-infra-build"
PIPELINE_NAME="my-infra-pipeline"

# 1. パイプライン削除
echo "=== Deleting Pipeline ==="
aws codepipeline delete-pipeline --name $PIPELINE_NAME

# 2. CodeBuildプロジェクト削除
echo "=== Deleting CodeBuild Project ==="
aws codebuild delete-project --name $BUILD_PROJECT

# 3. CodeCommitリポジトリ削除
echo "=== Deleting CodeCommit Repository ==="
aws codecommit delete-repository --repository-name $REPO_NAME

# 4. IAMロール削除（ポリシーを先にデタッチ）
echo "=== Deleting IAM Roles ==="

# CodeBuildロールのポリシーをデタッチ
for policy in AWSCloudFormationFullAccess AmazonS3FullAccess CloudWatchLogsFullAccess IAMFullAccess; do
  aws iam detach-role-policy \
    --role-name codebuild-${BUILD_PROJECT}-role \
    --policy-arn arn:aws:iam::aws:policy/$policy 2>/dev/null || true
done
aws iam delete-role --role-name codebuild-${BUILD_PROJECT}-role

# CodePipelineロールのポリシーをデタッチ
for policy in AWSCodeCommitFullAccess AWSCodeBuildDeveloperAccess AmazonS3FullAccess; do
  aws iam detach-role-policy \
    --role-name codepipeline-${PIPELINE_NAME}-role \
    --policy-arn arn:aws:iam::aws:policy/$policy 2>/dev/null || true
done
aws iam delete-role --role-name codepipeline-${PIPELINE_NAME}-role

echo "=== Cleanup completed ==="
```

> **初学者向け: IAMロールを削除する際の注意**
>
> IAMロールにはポリシー（権限設定）がアタッチされています。ロールを削除する前に、すべてのポリシーをデタッチする必要があります。デタッチせずに削除しようとするとエラーになります。

### CDK で作成したリソースの削除

```bash
# CDKプロジェクトディレクトリで実行
cd pipeline-cdk

# スタックを削除（確認プロンプトなし）
npx cdk destroy --force

# または確認プロンプトあり
npx cdk destroy
```

> **初学者向け: cdk destroy の仕組み**
>
> `cdk destroy` は、CloudFormationスタックを削除します。スタックに含まれるすべてのリソース（CodeCommit、CodeBuild、CodePipeline、IAMロール等）が自動的に削除されます。

### CloudFormation コンソールからの削除

1. [CloudFormationコンソール](https://console.aws.amazon.com/cloudformation/)を開く
2. 削除したいスタックを選択
3. 「削除」ボタンをクリック
4. 確認画面で「スタックの削除」をクリック

### 削除できない場合のトラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|--------|
| S3バケットが削除できない | バケットにオブジェクトが残っている | `aws s3 rm s3://bucket-name --recursive` で中身を削除してから再試行 |
| IAMロールが削除できない | ポリシーがアタッチされている | すべてのポリシーをデタッチしてから削除 |
| スタック削除が失敗する | リソースが他から参照されている | 参照元を先に削除、または保持設定を確認 |
| DELETE_FAILED 状態 | 手動削除済みのリソースがある | コンソールから「保持するリソース」を選択して再削除 |

### S3バケットの中身を削除してからバケットを削除

```bash
BUCKET_NAME="codepipeline-ap-northeast-1-123456789012"

# バケットの中身を削除
aws s3 rm s3://${BUCKET_NAME} --recursive

# バージョニングが有効な場合、削除マーカーとバージョンも削除
aws s3api list-object-versions --bucket ${BUCKET_NAME} --output json | \
  jq -r '.Versions[]? | "--delete \"Key=\(.Key),VersionId=\(.VersionId)\""' | \
  xargs -I {} aws s3api delete-objects --bucket ${BUCKET_NAME} --delete '{}'

aws s3api list-object-versions --bucket ${BUCKET_NAME} --output json | \
  jq -r '.DeleteMarkers[]? | "--delete \"Key=\(.Key),VersionId=\(.VersionId)\""' | \
  xargs -I {} aws s3api delete-objects --bucket ${BUCKET_NAME} --delete '{}'

# バケットを削除
aws s3api delete-bucket --bucket ${BUCKET_NAME}
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
