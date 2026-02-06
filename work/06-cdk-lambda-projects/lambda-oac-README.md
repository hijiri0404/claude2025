# Lambda Function URL + CloudFront + OAC パターン

AWS CDK を使用して、CloudFront Origin Access Control (OAC) で保護された Lambda Function URL を構築するサンプルプロジェクトです。

## アーキテクチャ概要

```
┌──────────────┐         ┌─────────────────────────────┐         ┌─────────────────────┐
│              │         │                             │         │                     │
│   ユーザー    │────────▶│   CloudFront Distribution   │────────▶│  Lambda Function    │
│              │  HTTPS  │                             │  OAC    │  URL                │
└──────────────┘         │   ・グローバルエッジ配信       │ (SigV4) │                     │
                         │   ・HTTPS 終端              │         │  AuthType: AWS_IAM  │
                         │   ・OAC による署名付与        │         │                     │
                         └─────────────────────────────┘         └─────────────────────┘
                                                                          │
                                                                          │ 直接アクセス
                                                                          ▼
                                                                    ❌ Forbidden
                                                                    (認証なしではアクセス不可)
```

## このパターンのメリット

| メリット | 説明 |
|---------|------|
| **セキュリティ** | Lambda への直接アクセスを禁止し、CloudFront 経由のみ許可 |
| **グローバル配信** | CloudFront のエッジロケーションで低レイテンシを実現 |
| **コスト削減** | API Gateway 不要で、Lambda の直接呼び出しよりシンプル |
| **DDoS 保護** | CloudFront の AWS Shield Standard が自動適用 |
| **カスタムドメイン** | CloudFront で独自ドメインと SSL 証明書を設定可能 |

## 生成される AWS リソース

```
┌─────────────────────────────────────────────────────────────────┐
│                    CloudFormation Stack                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │ Lambda Function │    │ Lambda Function │                    │
│  │                 │───▶│ URL             │                    │
│  │ Node.js 20.x   │    │ AuthType:AWS_IAM│                    │
│  │ ARM64          │    └─────────────────┘                    │
│  └─────────────────┘              │                            │
│          │                        │                            │
│          ▼                        ▼                            │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │ IAM Role        │    │ CloudFront      │                    │
│  │ (実行ロール)     │    │ Distribution    │                    │
│  └─────────────────┘    └────────┬────────┘                    │
│                                  │                              │
│                                  ▼                              │
│                         ┌─────────────────┐                    │
│                         │ Origin Access   │                    │
│                         │ Control (OAC)   │                    │
│                         │ Type: lambda    │                    │
│                         └─────────────────┘                    │
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │ Lambda          │    │ CloudWatch      │                    │
│  │ Permission x2   │    │ Log Group       │                    │
│  │ (IAM Policy)    │    │                 │                    │
│  └─────────────────┘    └─────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### リソース一覧

| リソース | タイプ | 説明 |
|---------|-------|------|
| ApiFunction | AWS::Lambda::Function | メインの Lambda 関数 |
| ApiFunctionServiceRole | AWS::IAM::Role | Lambda 実行用 IAM ロール |
| ApiFunctionFunctionUrl | AWS::Lambda::Url | Lambda Function URL |
| LambdaOAC | AWS::CloudFront::OriginAccessControl | オリジンアクセス制御 |
| Distribution | AWS::CloudFront::Distribution | CloudFront ディストリビューション |
| ApiFunctionAllowCloudFrontServicePrincipalUrl | AWS::Lambda::Permission | CloudFront → Lambda 許可 (URL) |
| ApiFunctionAllowCloudFrontServicePrincipalInvoke | AWS::Lambda::Permission | CloudFront → Lambda 許可 (Invoke) |
| ApiFunctionLogGroup | AWS::Logs::LogGroup | Lambda のログ保存先 |

## OAC (Origin Access Control) とは

### 従来の方式との比較

| 方式 | 対象オリジン | 署名方式 | ステータス |
|-----|------------|---------|----------|
| OAI (Origin Access Identity) | S3 のみ | - | 非推奨（レガシー） |
| **OAC (Origin Access Control)** | **S3, Lambda** | **SigV4** | **推奨** |

### OAC の動作原理

```
1. ユーザーが CloudFront にリクエスト
   ┌──────┐      GET /api
   │User  │ ──────────────────▶ CloudFront
   └──────┘

2. CloudFront が SigV4 署名を生成してオリジンにリクエスト
                                    │
   CloudFront が以下を実行:         │
   ・リクエストに SigV4 署名を付与    │
   ・Authorization ヘッダーを追加    │
                                    ▼
                            ┌─────────────┐
                            │ Lambda URL  │
                            │ (AWS_IAM)   │
                            └─────────────┘

3. Lambda が署名を検証してレスポンス
   ・署名が有効 → 200 OK
   ・署名が無効/なし → 403 Forbidden
```

## ファイル構成

```
lambda-oac-cdk/
├── bin/
│   └── lambda-oac-cdk.ts      # CDK アプリのエントリーポイント
├── lib/
│   └── lambda-oac-cdk-stack.ts # メインスタック定義
├── lambda/
│   └── index.ts               # Lambda ハンドラ
├── cdk.json                   # CDK 設定ファイル
├── package.json               # npm 依存関係
├── tsconfig.json              # TypeScript 設定
└── README.md                  # このファイル
```

## 前提条件

- Node.js 18.x 以上
- AWS CLI 設定済み（`aws configure`）
- AWS CDK CLI（`npm install -g aws-cdk`）

## デプロイ手順

```bash
# 1. 依存関係のインストール
npm install

# 2. TypeScript のビルド
npm run build

# 3. CDK ブートストラップ（初回のみ）
npx cdk bootstrap

# 4. デプロイ
npx cdk deploy

# 5. 動作確認
curl https://<CloudFront-Domain>/
```

## 動作確認

### CloudFront 経由（成功）

```bash
$ curl https://d1dd8i88gfvodj.cloudfront.net
{
  "message": "Hello from Lambda Function URL with OAC!",
  "timestamp": "2026-01-27T14:27:25.888Z",
  "requestContext": {
    "sourceIp": "130.176.189.201",
    "userAgent": "curl/8.5.0"
  }
}
```

### Lambda 直接アクセス（拒否）

```bash
$ curl https://xxx.lambda-url.ap-northeast-1.on.aws
{"Message":"Forbidden"}
```

## 重要なポイント

### 1. Lambda Function URL の AuthType

```typescript
// OAC を使用するには AWS_IAM が必須
authType: lambda.FunctionUrlAuthType.AWS_IAM
```

`NONE` にすると誰でもアクセス可能になり、OAC の意味がなくなります。

### 2. Lambda Permission は2つ必要

```typescript
// 1. Function URL を呼び出す許可
fn.addPermission('...', { action: 'lambda:InvokeFunctionUrl', ... });

// 2. 関数自体を呼び出す許可
fn.addPermission('...', { action: 'lambda:InvokeFunction', ... });
```

両方ないと `403 Forbidden` になります。

### 3. OAC の設定

```typescript
originAccessControlConfig: {
  originAccessControlOriginType: 'lambda',  // Lambda 用
  signingBehavior: 'always',                // 常に署名
  signingProtocol: 'sigv4',                 // AWS 署名 v4
}
```

## 便利なコマンド

| コマンド | 説明 |
|---------|------|
| `npm run build` | TypeScript をコンパイル |
| `npm run watch` | 変更を監視して自動コンパイル |
| `npx cdk synth` | CloudFormation テンプレートを生成 |
| `npx cdk diff` | デプロイ済みスタックとの差分を表示 |
| `npx cdk deploy` | スタックをデプロイ |
| `npx cdk destroy` | スタックを削除 |

## クリーンアップ

```bash
# スタックの削除
npx cdk destroy
```

## 参考資料

- [CloudFront OAC for Lambda Function URL - AWS Documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [Lambda Function URL - AWS Documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)

## ライセンス

MIT
