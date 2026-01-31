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

## ハンズオン教材一覧

### CI/CD パイプライン

| # | タイトル | 所要時間 | 難易度 |
|---|----------|----------|--------|
| 01 | [CodePipeline 基礎](./handson-01-codepipeline-basics.md) | 30分 | ★☆☆ |
| 02 | [CodeDeploy による EC2 デプロイ](./handson-02-codedeploy-ec2.md) | 45分 | ★★☆ |

### 運用管理

| # | タイトル | 所要時間 | 難易度 |
|---|----------|----------|--------|
| 03 | [Systems Manager 基礎](./handson-03-systems-manager.md) | 30分 | ★★☆ |

### Infrastructure as Code

| # | タイトル | 所要時間 | 難易度 |
|---|----------|----------|--------|
| 04 | [CloudFormation 基礎](./handson-04-cloudformation.md) | 40分 | ★★☆ |

## 試験ドメイン

| ドメイン | 出題割合 | 主要サービス |
|----------|----------|--------------|
| 1. SDLC Automation | 22% | CodePipeline, CodeBuild, CodeDeploy |
| 2. Configuration Management & IaC | 17% | CloudFormation, Systems Manager, CDK |
| 3. Resilient Cloud Solutions | 15% | Auto Scaling, Route 53, Aurora |
| 4. Monitoring & Logging | 15% | CloudWatch, X-Ray, EventBridge |
| 5. Incident & Event Response | 14% | Config, Lambda, SNS |
| 6. Security & Compliance | 17% | IAM, KMS, Secrets Manager, Config |

## 学習の進め方

### 推奨順序

```
1. CodePipeline 基礎 (01)
   ↓
2. CodeDeploy による EC2 デプロイ (02)
   ↓
3. Systems Manager 基礎 (03)
   ↓
4. CloudFormation 基礎 (04)
   ↓
5. (今後追加予定) AWS Config
   ↓
6. (今後追加予定) CloudWatch
```

### ハンズオン実施のポイント

1. **手を動かす**: コンソールで実際に操作する
2. **コスト管理**: 終了後は必ずリソースを削除する
3. **エラー対処**: エラーが出たら原因を調査する
4. **復習**: 翌日に同じ手順をもう一度実施する

## 学習記録

- [学習進捗記録](./DOP-C02-STUDY-PROGRESS.md)

## 公式リソース

- [試験ガイド (PDF)](https://d1.awsstatic.com/training-and-certification/docs-devops-pro/AWS-Certified-DevOps-Engineer-Professional_Exam-Guide.pdf)
- [対象サービス一覧](https://docs.aws.amazon.com/aws-certification/latest/examguides/dop-02-in-scope-services.html)
- [AWS Skill Builder](https://skillbuilder.aws/exam-prep/devops-engineer-professional)

## 注意事項

- ハンズオンで使用するリソースは終了後に必ず削除してください
- 料金が発生する可能性があります（無料枠内で収まるよう設計していますが、保証はできません）
- 本番環境では使用しないでください

---

**最終更新**: 2026-01-20
