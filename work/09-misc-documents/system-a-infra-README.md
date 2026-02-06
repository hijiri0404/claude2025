# System-A インフラストラクチャ

マルチ環境（dev/stg/prod）対応の CloudFormation ベースインフラストラクチャ

## ディレクトリ構成

```
system-a-infra/
├── README.md                    # このファイル
├── buildspec.yml               # CodeBuild用ビルド仕様
├── environments/               # 環境別設定
│   ├── dev.json
│   ├── stg.json
│   └── prod.json
├── stacks/                     # CloudFormationテンプレート
│   ├── 01-network.yaml        # VPC, Subnet, IGW
│   ├── 02-security.yaml       # IAM Role, Security Group
│   ├── 03-storage.yaml        # S3, DynamoDB
│   ├── 04-compute.yaml        # Lambda, API Gateway
│   └── 05-monitoring.yaml     # CloudWatch Alarm, Dashboard
└── scripts/
    └── create-pipeline.sh     # パイプライン作成スクリプト
```

## クイックスタート

### 1. CodeCommitリポジトリ作成とプッシュ

```bash
# リポジトリ作成
aws codecommit create-repository --repository-name system-a-infra

# プッシュ
git init
git add .
git commit -m "Initial commit"
git remote add origin https://git-codecommit.ap-northeast-1.amazonaws.com/v1/repos/system-a-infra
git push -u origin main
```

### 2. パイプライン作成

```bash
# dev環境用パイプライン作成
./scripts/create-pipeline.sh dev

# stg環境用パイプライン作成
./scripts/create-pipeline.sh stg

# prod環境用パイプライン作成
./scripts/create-pipeline.sh prod
```

## スタック依存関係

スタックは以下の順序でデプロイされます（Cross-Stack参照あり）：

```
01-network → 02-security → 03-storage → 04-compute → 05-monitoring
     ↓            ↓             ↓
   VpcId    LambdaRoleArn   DataBucket
```

## 環境設定

各環境の設定は `environments/*.json` で管理します。

| 環境 | CIDR | リソースサイズ | アラーム閾値 |
|------|------|----------------|--------------|
| dev  | 10.2.0.0/16 | 小 | 緩い |
| stg  | 10.1.0.0/16 | 中 | 中程度 |
| prod | 10.0.0.0/16 | 大 | 厳格 |

## 手動デプロイ

パイプラインを使わずに手動でデプロイする場合：

```bash
ENVIRONMENT=dev
STACK_PREFIX=system-a-dev

# 1. Network
aws cloudformation deploy \
  --template-file stacks/01-network.yaml \
  --stack-name ${STACK_PREFIX}-network \
  --parameter-overrides Environment=${ENVIRONMENT} SystemName=system-a

# 2. Security (IAM権限が必要)
aws cloudformation deploy \
  --template-file stacks/02-security.yaml \
  --stack-name ${STACK_PREFIX}-security \
  --parameter-overrides Environment=${ENVIRONMENT} SystemName=system-a \
  --capabilities CAPABILITY_NAMED_IAM

# 3. Storage
aws cloudformation deploy \
  --template-file stacks/03-storage.yaml \
  --stack-name ${STACK_PREFIX}-storage \
  --parameter-overrides Environment=${ENVIRONMENT} SystemName=system-a

# 4. Compute
aws cloudformation deploy \
  --template-file stacks/04-compute.yaml \
  --stack-name ${STACK_PREFIX}-compute \
  --parameter-overrides Environment=${ENVIRONMENT} SystemName=system-a \
  --capabilities CAPABILITY_IAM

# 5. Monitoring
aws cloudformation deploy \
  --template-file stacks/05-monitoring.yaml \
  --stack-name ${STACK_PREFIX}-monitoring \
  --parameter-overrides Environment=${ENVIRONMENT} SystemName=system-a
```

## クリーンアップ

```bash
STACK_PREFIX=system-a-dev

# 逆順で削除
aws cloudformation delete-stack --stack-name ${STACK_PREFIX}-monitoring
aws cloudformation delete-stack --stack-name ${STACK_PREFIX}-compute
aws cloudformation delete-stack --stack-name ${STACK_PREFIX}-storage
aws cloudformation delete-stack --stack-name ${STACK_PREFIX}-security
aws cloudformation delete-stack --stack-name ${STACK_PREFIX}-network
```
