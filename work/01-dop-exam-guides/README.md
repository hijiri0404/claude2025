# AWS Certified DevOps Engineer - Professional (DOP-C02) 学習教材

## 概要

AWS DevOps Professional 認定試験の学習用教材集です。マネジメントコンソールを使用したハンズオン形式で、各サービスの設定と操作を学習できます。

## 試験情報

| 項目 | 内容 |
|------|------|
| 試験コード | DOP-C02 |
| 問題数 | 75問（180分） |
| 合格点 | 750/1000 |
| 受験料 | $300 USD |

## カテゴリ別ガイド一覧

### 01-cicd (CI/CD)
- [ArgoCD CI/CD ハンズオンガイド](./01-cicd/ArgoCD-CICD-ハンズオンガイド.md)
- [CodePipeline 作成手順ガイド](./01-cicd/AWS-CodePipeline-作成手順ガイド.md)
- [CodePipeline 基礎](./01-cicd/handson-01-codepipeline-basics.md)
- [CodeDeploy EC2](./01-cicd/handson-02-codedeploy-ec2.md)

### 02-compute (コンピュート・コンテナ)
- [EKS ハンズオンガイド](./02-compute/AWS-EKS-ハンズオンガイド.md)
- [ROSA ハンズオンガイド](./02-compute/AWS-ROSA-ハンズオンガイド.md)
- [Kubernetes ハンズオンガイド](./02-compute/Kubernetes-ハンズオンガイド.md)
- [Lambda ハンズオンガイド](./02-compute/AWS-Lambda-ハンズオンガイド.md)
- [ECS/ECR ハンズオンガイド](./02-compute/AWS-ECS-ECR-ハンズオンガイド.md)

### 03-iac (Infrastructure as Code)
- [CloudFormation ハンズオンガイド](./03-iac/AWS-CloudFormation-ハンズオンガイド.md)
- [StepFunctions ハンズオンガイド](./03-iac/AWS-StepFunctions-ハンズオンガイド.md)
- [CloudFormation 基礎](./03-iac/handson-04-cloudformation.md)

### 04-monitoring (モニタリング)
- [CloudWatch ハンズオンガイド](./04-monitoring/AWS-CloudWatch-ハンズオンガイド.md)
- [CloudTrail ハンズオンガイド](./04-monitoring/AWS-CloudTrail-ハンズオンガイド.md)
- [X-Ray ハンズオンガイド](./04-monitoring/AWS-X-Ray-ハンズオンガイド.md)
- [EventBridge ハンズオンガイド](./04-monitoring/AWS-EventBridge-ハンズオンガイド.md)

### 05-security (セキュリティ)
- [IAM Advanced ハンズオンガイド](./05-security/AWS-IAM-Advanced-ハンズオンガイド.md)
- [KMS ハンズオンガイド](./05-security/AWS-KMS-ハンズオンガイド.md)
- [Secrets Manager ハンズオンガイド](./05-security/AWS-SecretsManager-ハンズオンガイド.md)
- [GuardDuty/SecurityHub ハンズオンガイド](./05-security/AWS-GuardDuty-SecurityHub-ハンズオンガイド.md)

### 06-networking (ネットワーキング)
- [Route53 ハンズオンガイド](./06-networking/AWS-Route53-ハンズオンガイド.md)
- [API Gateway ハンズオンガイド](./06-networking/AWS-APIGateway-ハンズオンガイド.md)

### 07-storage-database (ストレージ・DB)
- [S3/RDS/Aurora DR ハンズオンガイド](./07-storage-database/AWS-S3運用-RDS-Aurora-DR-ハンズオンガイド.md)
- [DR戦略 ハンズオンガイド](./07-storage-database/AWS-DR戦略-ハンズオンガイド.md)

### 08-management (管理・運用)
- [Systems Manager ハンズオンガイド](./08-management/AWS-Systems-Manager-ハンズオンガイド.md)
- [Config ハンズオンガイド](./08-management/AWS-Config-ハンズオンガイド.md)
- [Organizations/Control Tower ハンズオンガイド](./08-management/AWS-Organizations-ControlTower-ハンズオンガイド.md)
- [Auto Scaling/ELB ハンズオンガイド](./08-management/AWS-AutoScaling-ELB-ハンズオンガイド.md)
- [SNS/SQS ハンズオンガイド](./08-management/AWS-SNS-SQS-ハンズオンガイド.md)
- [Trusted Advisor/Beanstalk ハンズオンガイド](./08-management/AWS-TrustedAdvisor-Beanstalk-ハンズオンガイド.md)

### 09-supplementary (補足)
- [FIS ハンズオンガイド](./09-supplementary/AWS-FIS-ハンズオンガイド.md)
- [補足サービス ハンズオンガイド](./09-supplementary/AWS-補足サービス-ハンズオンガイド.md)

## 試験ドメイン

| ドメイン | 出題割合 | 主要ガイド |
|----------|----------|-----------|
| 1. SDLC Automation | 22% | CI/CD, CloudFormation, CodePipeline |
| 2. Configuration Management & IaC | 17% | CloudFormation, Systems Manager, CDK |
| 3. Resilient Cloud Solutions | 15% | DR戦略, Auto Scaling, EKS |
| 4. Monitoring & Logging | 15% | CloudWatch, X-Ray, EventBridge |
| 5. Incident & Event Response | 14% | EventBridge, FIS, GuardDuty |
| 6. Security & Compliance | 17% | IAM, KMS, Config, Organizations |

## 学習記録

- [学習進捗記録](./DOP-C02-STUDY-PROGRESS.md)

## 公式リソース

- [試験ガイド (PDF)](https://d1.awsstatic.com/training-and-certification/docs-devops-pro/AWS-Certified-DevOps-Engineer-Professional_Exam-Guide.pdf)
- [対象サービス一覧](https://docs.aws.amazon.com/aws-certification/latest/examguides/dop-02-in-scope-services.html)
- [AWS Skill Builder](https://skillbuilder.aws/exam-prep/devops-engineer-professional)

---

**最終更新**: 2026-02-06
