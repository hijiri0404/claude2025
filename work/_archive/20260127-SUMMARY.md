# 作業概要 - 20260127

## 作業情報
- **作業日**: 2026-01-27 (JST)
- **主要タスク**: Lambda Function URL + CloudFront + OAC パターンの CDK 構築

## 生成ファイル一覧

### 主要成果物
- `lambda-oac-cdk/` - CDK プロジェクトディレクトリ
  - `lib/lambda-oac-cdk-stack.ts` - メインスタック定義（初学者向けコメント付き）
  - `lambda/index.ts` - Lambda ハンドラ（初学者向けコメント付き）
  - `bin/lambda-oac-cdk.ts` - CDK アプリエントリポイント（初学者向けコメント付き）
  - `README.md` - アーキテクチャ解説ドキュメント

## アーキテクチャ

```
┌──────────────┐     ┌───────────────────────────────┐     ┌─────────────────┐
│   ユーザー    │────▶│  CloudFront Distribution      │────▶│ Lambda Function │
└──────────────┘     │  (OAC で SigV4 署名)          │     │ URL (AWS_IAM)   │
                     └───────────────────────────────┘     └─────────────────┘
                                   │
                                   ▼
                            直接アクセス禁止
                            (Forbidden)
```

## 主要設定ポイント

### 1. Lambda Function URL の AuthType
```typescript
authType: lambda.FunctionUrlAuthType.AWS_IAM  // OAC 使用の必須条件
```

### 2. OAC (Origin Access Control) の設定
```typescript
new cloudfront.CfnOriginAccessControl(this, 'LambdaOAC', {
  originAccessControlConfig: {
    originAccessControlOriginType: 'lambda',
    signingBehavior: 'always',
    signingProtocol: 'sigv4',
  },
});
```

### 3. Lambda Permission (両方必要)
```typescript
fn.addPermission('...', { action: 'lambda:InvokeFunctionUrl', ... });
fn.addPermission('...', { action: 'lambda:InvokeFunction', ... });
```

## デプロイ結果

| リソース | 値 |
|---------|-----|
| CloudFront URL | https://d1dd8i88gfvodj.cloudfront.net |
| Lambda Function URL | zholvpqwbwhsdvpzab5eznq2by0rscge.lambda-url.ap-northeast-1.on.aws |

## 動作確認

| アクセス方法 | 結果 |
|-------------|------|
| CloudFront 経由 | ✅ 成功 |
| Lambda Function URL 直接 | ❌ Forbidden |

## 完了したタスク
- [x] CDK プロジェクト作成
- [x] Lambda Function URL + OAC 構成の実装
- [x] CloudFront Distribution の設定
- [x] Lambda Permission の設定
- [x] デプロイと動作確認
- [x] 初学者向けコメントの追加
- [x] アーキテクチャ解説ドキュメント（README.md）作成
- [x] Git へのアップロード

## 備考
- OAI (Origin Access Identity) は S3 専用のレガシー機能
- OAC (Origin Access Control) は S3 および Lambda Function URL に対応
- API Gateway には OAI/OAC は使用不可（カスタムヘッダー検証が必要）

## コマンド

```bash
# デプロイ
cd /workspaces/ubuntu-3/claude2025/work/20260127/lambda-oac-cdk
npx cdk deploy

# 削除
npx cdk destroy
```
