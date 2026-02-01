#!/bin/bash
set -e

# =============================================================================
# CodePipeline 作成スクリプト
# 用途: 環境ごとのパイプラインを作成
# 使用例: ./scripts/create-pipeline.sh dev
# =============================================================================

# 引数チェック
if [ -z "$1" ]; then
    echo "Usage: $0 <environment>"
    echo "  environment: dev, stg, prod"
    exit 1
fi

ENVIRONMENT=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="${PROJECT_DIR}/environments/${ENVIRONMENT}.json"

# 設定ファイル存在チェック
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: Config file not found: $CONFIG_FILE"
    echo "Available environments:"
    ls -1 "${PROJECT_DIR}/environments/"
    exit 1
fi

# 設定読み込み
SYSTEM_NAME=$(jq -r '.systemName' "$CONFIG_FILE")
STACK_PREFIX=$(jq -r '.stackPrefix' "$CONFIG_FILE")

# AWS設定
REGION=${AWS_REGION:-ap-northeast-1}
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# リソース名定義
REPO_NAME="${SYSTEM_NAME}-infra"
PIPELINE_NAME="${STACK_PREFIX}-pipeline"
BUILD_PROJECT_NAME="${STACK_PREFIX}-build"
ARTIFACT_BUCKET="${STACK_PREFIX}-artifacts-${ACCOUNT_ID}"
CODEBUILD_ROLE_NAME="${STACK_PREFIX}-codebuild-role"
PIPELINE_ROLE_NAME="${STACK_PREFIX}-pipeline-role"

echo "=============================================="
echo "Creating CodePipeline for ${ENVIRONMENT}"
echo "=============================================="
echo "System Name: ${SYSTEM_NAME}"
echo "Stack Prefix: ${STACK_PREFIX}"
echo "Region: ${REGION}"
echo "Account: ${ACCOUNT_ID}"
echo "=============================================="

# 1. S3バケット作成（アーティファクト用）
echo "Step 1: Creating artifact bucket..."
if aws s3api head-bucket --bucket "$ARTIFACT_BUCKET" 2>/dev/null; then
    echo "  Bucket already exists: $ARTIFACT_BUCKET"
else
    aws s3api create-bucket \
        --bucket "$ARTIFACT_BUCKET" \
        --region "$REGION" \
        --create-bucket-configuration LocationConstraint="$REGION"
    aws s3api put-public-access-block \
        --bucket "$ARTIFACT_BUCKET" \
        --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
    echo "  Created bucket: $ARTIFACT_BUCKET"
fi

# 2. CodeBuild用IAMロール作成
echo "Step 2: Creating CodeBuild IAM role..."
CODEBUILD_TRUST_POLICY=$(cat <<EOF
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
)

if aws iam get-role --role-name "$CODEBUILD_ROLE_NAME" 2>/dev/null; then
    echo "  Role already exists: $CODEBUILD_ROLE_NAME"
else
    aws iam create-role \
        --role-name "$CODEBUILD_ROLE_NAME" \
        --assume-role-policy-document "$CODEBUILD_TRUST_POLICY"

    # CloudFormation/S3/CloudWatch権限付与
    aws iam attach-role-policy \
        --role-name "$CODEBUILD_ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/AWSCloudFormationFullAccess
    aws iam attach-role-policy \
        --role-name "$CODEBUILD_ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
    aws iam attach-role-policy \
        --role-name "$CODEBUILD_ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess
    aws iam attach-role-policy \
        --role-name "$CODEBUILD_ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/IAMFullAccess
    aws iam attach-role-policy \
        --role-name "$CODEBUILD_ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/AmazonEC2FullAccess
    aws iam attach-role-policy \
        --role-name "$CODEBUILD_ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess
    aws iam attach-role-policy \
        --role-name "$CODEBUILD_ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess
    aws iam attach-role-policy \
        --role-name "$CODEBUILD_ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/AmazonAPIGatewayAdministrator
    aws iam attach-role-policy \
        --role-name "$CODEBUILD_ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/AmazonSNSFullAccess

    echo "  Created role: $CODEBUILD_ROLE_NAME"
    echo "  Waiting for role propagation..."
    sleep 10
fi

CODEBUILD_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${CODEBUILD_ROLE_NAME}"

# 3. CodeBuildプロジェクト作成
echo "Step 3: Creating CodeBuild project..."
if aws codebuild batch-get-projects --names "$BUILD_PROJECT_NAME" --query 'projects[0].name' --output text 2>/dev/null | grep -q "$BUILD_PROJECT_NAME"; then
    echo "  Project already exists: $BUILD_PROJECT_NAME"
else
    aws codebuild create-project \
        --name "$BUILD_PROJECT_NAME" \
        --source "type=CODECOMMIT,location=https://git-codecommit.${REGION}.amazonaws.com/v1/repos/${REPO_NAME}" \
        --artifacts "type=NO_ARTIFACTS" \
        --environment "type=LINUX_CONTAINER,computeType=BUILD_GENERAL1_SMALL,image=aws/codebuild/amazonlinux2-x86_64-standard:5.0,environmentVariables=[{name=ENVIRONMENT,value=${ENVIRONMENT}}]" \
        --service-role "$CODEBUILD_ROLE_ARN"
    echo "  Created project: $BUILD_PROJECT_NAME"
fi

# 4. Pipeline用IAMロール作成
echo "Step 4: Creating Pipeline IAM role..."
PIPELINE_TRUST_POLICY=$(cat <<EOF
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
)

if aws iam get-role --role-name "$PIPELINE_ROLE_NAME" 2>/dev/null; then
    echo "  Role already exists: $PIPELINE_ROLE_NAME"
else
    aws iam create-role \
        --role-name "$PIPELINE_ROLE_NAME" \
        --assume-role-policy-document "$PIPELINE_TRUST_POLICY"

    aws iam attach-role-policy \
        --role-name "$PIPELINE_ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/AWSCodeCommitFullAccess
    aws iam attach-role-policy \
        --role-name "$PIPELINE_ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/AWSCodeBuildDeveloperAccess
    aws iam attach-role-policy \
        --role-name "$PIPELINE_ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

    echo "  Created role: $PIPELINE_ROLE_NAME"
    echo "  Waiting for role propagation..."
    sleep 10
fi

PIPELINE_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${PIPELINE_ROLE_NAME}"

# 5. CodePipeline作成
echo "Step 5: Creating CodePipeline..."
PIPELINE_DEFINITION=$(cat <<EOF
{
    "name": "${PIPELINE_NAME}",
    "roleArn": "${PIPELINE_ROLE_ARN}",
    "artifactStore": {
        "type": "S3",
        "location": "${ARTIFACT_BUCKET}"
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
                        "RepositoryName": "${REPO_NAME}",
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
                        "ProjectName": "${BUILD_PROJECT_NAME}"
                    },
                    "inputArtifacts": [{"name": "SourceOutput"}]
                }
            ]
        }
    ],
    "pipelineType": "V2"
}
EOF
)

if aws codepipeline get-pipeline --name "$PIPELINE_NAME" 2>/dev/null; then
    echo "  Pipeline already exists: $PIPELINE_NAME"
    echo "  Updating pipeline..."
    echo "$PIPELINE_DEFINITION" | aws codepipeline update-pipeline --cli-input-json file:///dev/stdin
else
    echo "$PIPELINE_DEFINITION" | aws codepipeline create-pipeline --cli-input-json file:///dev/stdin
    echo "  Created pipeline: $PIPELINE_NAME"
fi

echo ""
echo "=============================================="
echo "Pipeline creation completed!"
echo "=============================================="
echo ""
echo "Next steps:"
echo "1. Push your code to CodeCommit:"
echo "   git remote add codecommit https://git-codecommit.${REGION}.amazonaws.com/v1/repos/${REPO_NAME}"
echo "   git push codecommit main"
echo ""
echo "2. View pipeline in console:"
echo "   https://${REGION}.console.aws.amazon.com/codesuite/codepipeline/pipelines/${PIPELINE_NAME}/view"
echo ""
