# CloudFront + WAF メンテナンスモード実装ガイド（予算優先パターン）

## 📋 目次
- [概要](#概要)
- [アーキテクチャ](#アーキテクチャ)
- [切り替え時間](#切り替え時間)
- [前提条件](#前提条件)
- [実装手順](#実装手順)
- [運用手順](#運用手順)
- [コスト詳細](#コスト詳細)
- [トラブルシューティング](#トラブルシューティング)
- [FAQ](#faq)

---

## 概要

### 🎯 このパターンの特徴

**予算優先 & シンプルなSorry Page で十分なケース向け**

| 項目 | 内容 |
|------|------|
| **CloudFront数** | 1個のみ |
| **Lambda@Edge** | ❌ 不要 |
| **URL変化** | ✅ なし（`https://example.com` のまま） |
| **Sorry Page** | 4KB以内のHTML（シンプル） |
| **切り替え速度** | ⚡ **5-30秒**（WAFルール伝播） |
| **月額コスト** | **$15.70**（100万PV想定） |
| **実装難易度** | ⭐⭐ 中程度 |

### ✅ 推奨ケース
- メンテナンス頻度が低い（月1回未満）
- Sorry Pageはシンプルなデザインで十分
- コスト最優先
- Lambda@Edge を使いたくない

---

## アーキテクチャ

### 📐 システム構成図

```
┌─────────────────────────────────────────────────────────────┐
│ EventBridge Scheduler (2025/12/24 00:00 JST トリガー)      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Lambda Function (通常のLambda、@Edgeではない)               │
│ - WAF WebACL の MaintenanceMode ルールを有効化              │
│ - Parameter Store: MAINTENANCE_MODE_ENABLED = 'true' 更新  │
└────────────────────┬────────────────────────────────────────┘
                     │ UpdateWebACL API
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ AWS WAF (CloudFront 統合)                                   │
│ - MaintenanceModeルール（優先度1）                          │
│   - 許可IP以外の全リクエストをBlock                          │
│   - CustomResponse: 503 + 4KB HTML                         │
│ - AllowedIpSetルール（優先度0）                             │
│   - 管理者IPは常に通過                                       │
└────────────────────┬────────────────────────────────────────┘
                     │ 5-30秒で全エッジに伝播
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ CloudFront Distribution                                      │
│ - Origin: Main Site S3 Bucket                               │
│ - WAF統合: 上記WebACLをアタッチ                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ S3 Bucket (Main Site)                                        │
│ - index.html                                                 │
│ - assets/                                                    │
└─────────────────────────────────────────────────────────────┘

【ユーザー体験】
通常時: example.com → CloudFront → WAF(許可) → S3 → Main Site表示
メンテ: example.com → CloudFront → WAF(Block) → 503 Sorry Page表示
管理者: example.com → CloudFront → WAF(IP許可) → S3 → Main Site表示
```

---

## 切り替え時間

### ⚡ **5-30秒で切り替わります**

| フェーズ | 所要時間 | 説明 |
|---------|---------|------|
| **EventBridge トリガー** | 0秒 | 指定時刻にLambdaを起動 |
| **Lambda 実行** | 1-3秒 | WAF UpdateWebACL API 実行 |
| **WAF ルール伝播** | 5-30秒 | 全グローバルエッジロケーションに伝播 |
| **合計** | **5-30秒** | 最大でも30秒以内に完了 |

#### 📊 伝播速度の詳細

```
API実行完了 → 即座にus-east-1で有効
           ↓ 5-10秒後
           → アジア太平洋エッジロケーションで有効
           ↓ 10-20秒後
           → ヨーロッパエッジロケーションで有効
           ↓ 20-30秒後
           → 全世界のエッジロケーションで有効
```

**重要:** CloudFront Distribution の更新（15-30分）とは異なり、WAFルール変更は**数秒で伝播**します。

---

## 前提条件

### 必須ツール
- AWS CDK (v2.0以上)
- Node.js (v18以上)
- AWS CLI (v2以上)
- AWS アカウントと適切な IAM 権限

### 必要な AWS サービス
- AWS CloudFront
- AWS WAF (CloudFront統合)
- AWS Lambda
- Amazon S3
- Amazon EventBridge Scheduler
- AWS Systems Manager Parameter Store
- AWS Certificate Manager (ACM) - カスタムドメイン使用時

### IAM 権限
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudfront:*",
        "wafv2:*",
        "lambda:*",
        "s3:*",
        "scheduler:*",
        "ssm:*",
        "acm:*",
        "route53:*",
        "iam:*"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## 実装手順

### 📁 プロジェクト構成

```
cloudfront-maintenance-mode/
├── bin/
│   └── app.ts                        # CDK エントリーポイント
├── lib/
│   └── maintenance-stack.ts          # メインスタック
├── lambda/
│   ├── enable-maintenance/
│   │   └── index.js                  # メンテナンス開始Lambda
│   └── disable-maintenance/
│       └── index.js                  # メンテナンス終了Lambda
├── static-site/
│   └── index.html                    # メインサイトHTML
├── cdk.json
├── package.json
└── tsconfig.json
```

### ステップ1: CDKプロジェクト初期化

```bash
# プロジェクトディレクトリ作成
mkdir cloudfront-maintenance-mode
cd cloudfront-maintenance-mode

# CDK初期化
cdk init app --language typescript

# 必要なパッケージインストール
npm install @aws-cdk/aws-cloudfront-origins
npm install @aws-sdk/client-wafv2 @aws-sdk/client-ssm
```

### ステップ2: Sorry Page HTML 作成

```html
<!-- 4KB以内のシンプルなHTML -->
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>メンテナンス中</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;color:#fff;text-align:center;padding:20px}
.container{max-width:600px;width:100%}
h1{font-size:2.5em;margin-bottom:20px;animation:float 3s ease-in-out infinite}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-20px)}}
.box{background:rgba(255,255,255,.15);backdrop-filter:blur(10px);border-radius:20px;padding:30px;box-shadow:0 8px 32px rgba(0,0,0,.2);margin-bottom:20px}
p{font-size:1.2em;line-height:1.8;margin-bottom:15px}
.schedule{margin:20px 0;padding:20px;background:rgba(255,255,255,.2);border-radius:12px;font-size:1.1em}
.schedule strong{display:block;margin-bottom:8px;font-size:1.2em}
a{color:#fff;text-decoration:underline;transition:opacity .3s}
a:hover{opacity:.8}
.countdown{font-size:2em;font-weight:bold;margin:20px 0;padding:15px;background:rgba(255,255,255,.25);border-radius:12px}
@media(max-width:768px){
h1{font-size:2em}
p{font-size:1em}
.countdown{font-size:1.5em}
}
</style>
</head>
<body>
<div class="container">
<h1>🔧 システムメンテナンス中</h1>
<div class="box">
<p>現在、システムメンテナンスを実施しております。</p>
<p>ご不便をおかけして申し訳ございません。</p>
<div class="schedule">
<strong>メンテナンス予定時間</strong>
<div id="schedule-text">2025年12月24日 0:00 〜 6:00</div>
</div>
<div class="countdown" id="countdown">計算中...</div>
<p>お問い合わせ: <a href="mailto:support@example.com">support@example.com</a></p>
</div>
</div>
<script>
const endTime=new Date('2025-12-24T06:00:00+09:00').getTime();
function updateCountdown(){
const now=new Date().getTime();
const diff=endTime-now;
if(diff<0){
document.getElementById('countdown').textContent='メンテナンス終了しました';
return;
}
const hours=Math.floor(diff/3600000);
const minutes=Math.floor((diff%3600000)/60000);
const seconds=Math.floor((diff%60000)/1000);
document.getElementById('countdown').textContent=`終了まで ${hours}時間 ${minutes}分 ${seconds}秒`;
}
updateCountdown();
setInterval(updateCountdown,1000);
</script>
</body>
</html>
```

**ファイルサイズ確認:**
```bash
# HTML圧縮後のサイズを確認（4KB以下であること）
cat sorry.html | wc -c
# 出力例: 2847 bytes (OK - 4KB以下)
```

### ステップ3: Lambda 関数作成

#### **メンテナンス開始 Lambda**

```javascript
// lambda/enable-maintenance/index.js
const { WAFv2Client, GetWebACLCommand, UpdateWebACLCommand } = require('@aws-sdk/client-wafv2');
const { SSMClient, PutParameterCommand } = require('@aws-sdk/client-ssm');

const wafClient = new WAFv2Client({ region: 'us-east-1' }); // CloudFront WAFはus-east-1固定
const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  console.log('メンテナンスモード開始処理を実行します');

  try {
    // 1. Parameter Store 更新
    await ssmClient.send(new PutParameterCommand({
      Name: process.env.PARAMETER_NAME,
      Value: 'true',
      Type: 'String',
      Overwrite: true,
    }));
    console.log('Parameter Store 更新完了: MAINTENANCE_MODE_ENABLED = true');

    // 2. 現在のWebACL設定を取得
    const getResponse = await wafClient.send(new GetWebACLCommand({
      Name: process.env.WEB_ACL_NAME,
      Scope: 'CLOUDFRONT',
      Id: process.env.WEB_ACL_ID,
    }));

    const webAcl = getResponse.WebACL;
    console.log(`WebACL取得完了: ${webAcl.Name}`);

    // 3. MaintenanceModeルールを有効化
    const updatedRules = webAcl.Rules.map(rule => {
      if (rule.Name === 'MaintenanceMode') {
        console.log('MaintenanceModeルールを有効化します');
        return {
          Name: rule.Name,
          Priority: rule.Priority,
          Statement: rule.Statement,
          Action: {
            Block: {
              CustomResponse: {
                ResponseCode: 503,
                CustomResponseBodyKey: 'sorry-page',
              }
            }
          },
          VisibilityConfig: rule.VisibilityConfig,
        };
      }
      return rule;
    });

    // 4. WebACLを更新
    await wafClient.send(new UpdateWebACLCommand({
      Name: webAcl.Name,
      Scope: webAcl.Scope,
      Id: webAcl.Id,
      LockToken: getResponse.LockToken,
      DefaultAction: webAcl.DefaultAction,
      Rules: updatedRules,
      VisibilityConfig: webAcl.VisibilityConfig,
    }));

    console.log('WAFルール更新完了 - メンテナンスモードが有効になりました');

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'メンテナンスモードを有効化しました',
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('エラー発生:', error);
    throw error;
  }
};
```

#### **メンテナンス終了 Lambda**

```javascript
// lambda/disable-maintenance/index.js
const { WAFv2Client, GetWebACLCommand, UpdateWebACLCommand } = require('@aws-sdk/client-wafv2');
const { SSMClient, PutParameterCommand } = require('@aws-sdk/client-ssm');

const wafClient = new WAFv2Client({ region: 'us-east-1' });
const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  console.log('メンテナンスモード終了処理を実行します');

  try {
    // 1. Parameter Store 更新
    await ssmClient.send(new PutParameterCommand({
      Name: process.env.PARAMETER_NAME,
      Value: 'false',
      Type: 'String',
      Overwrite: true,
    }));
    console.log('Parameter Store 更新完了: MAINTENANCE_MODE_ENABLED = false');

    // 2. 現在のWebACL設定を取得
    const getResponse = await wafClient.send(new GetWebACLCommand({
      Name: process.env.WEB_ACL_NAME,
      Scope: 'CLOUDFRONT',
      Id: process.env.WEB_ACL_ID,
    }));

    const webAcl = getResponse.WebACL;
    console.log(`WebACL取得完了: ${webAcl.Name}`);

    // 3. MaintenanceModeルールを無効化（Count アクションに変更）
    const updatedRules = webAcl.Rules.map(rule => {
      if (rule.Name === 'MaintenanceMode') {
        console.log('MaintenanceModeルールを無効化します');
        return {
          Name: rule.Name,
          Priority: rule.Priority,
          Statement: rule.Statement,
          Action: {
            Count: {}  // Countに変更 = ルールを無効化
          },
          VisibilityConfig: rule.VisibilityConfig,
        };
      }
      return rule;
    });

    // 4. WebACLを更新
    await wafClient.send(new UpdateWebACLCommand({
      Name: webAcl.Name,
      Scope: webAcl.Scope,
      Id: webAcl.Id,
      LockToken: getResponse.LockToken,
      DefaultAction: webAcl.DefaultAction,
      Rules: updatedRules,
      VisibilityConfig: webAcl.VisibilityConfig,
    }));

    console.log('WAFルール更新完了 - メンテナンスモードが無効になりました');

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'メンテナンスモードを無効化しました',
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('エラー発生:', error);
    throw error;
  }
};
```

### ステップ4: CDK スタック実装

```typescript
// lib/maintenance-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface MaintenanceStackProps extends cdk.StackProps {
  allowedIps: string[];  // 管理者IPリスト
  maintenanceStartTime: string;  // 'YYYY-MM-DDTHH:MM:SS' (JST)
  maintenanceEndTime: string;    // 'YYYY-MM-DDTHH:MM:SS' (JST)
}

export class MaintenanceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MaintenanceStackProps) {
    super(scope, id, props);

    // ========================================
    // 1. S3 バケット（メインサイト）
    // ========================================
    const mainSiteBucket = new s3.Bucket(this, 'MainSiteBucket', {
      bucketName: `my-website-main-${this.account}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // メインサイトのコンテンツをデプロイ
    new s3deploy.BucketDeployment(this, 'DeployMainSite', {
      sources: [s3deploy.Source.asset('./static-site')],
      destinationBucket: mainSiteBucket,
    });

    // ========================================
    // 2. WAF IP Set（管理者IP）
    // ========================================
    const allowedIpSet = new wafv2.CfnIPSet(this, 'AllowedIpSet', {
      name: 'MaintenanceAllowedIPs',
      scope: 'CLOUDFRONT',
      ipAddressVersion: 'IPV4',
      addresses: props.allowedIps,
    });

    // ========================================
    // 3. WAF WebACL（Sorry Page HTML埋め込み）
    // ========================================

    // Sorry Page HTML を読み込み
    const fs = require('fs');
    const sorryPageHtml = fs.readFileSync('./sorry-page.html', 'utf-8');

    // サイズチェック（4KB以下）
    const htmlSize = Buffer.byteLength(sorryPageHtml, 'utf-8');
    if (htmlSize > 4096) {
      throw new Error(`Sorry Page HTML が 4KB を超えています: ${htmlSize} bytes`);
    }

    const webAcl = new wafv2.CfnWebACL(this, 'WebACL', {
      name: 'MaintenanceWebACL',
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'MaintenanceWebACL',
      },

      // カスタムレスポンスボディ定義
      customResponseBodies: {
        'sorry-page': {
          contentType: 'TEXT_HTML',
          content: sorryPageHtml,
        }
      },

      rules: [
        // ルール1: 管理者IP許可（最優先）
        {
          name: 'AllowAdminIPs',
          priority: 0,
          statement: {
            ipSetReferenceStatement: {
              arn: allowedIpSet.attrArn,
            }
          },
          action: { allow: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AllowAdminIPs',
          },
        },

        // ルール2: メンテナンスモード（初期状態: 無効）
        {
          name: 'MaintenanceMode',
          priority: 1,
          statement: {
            // 全てのリクエストにマッチ
            notStatement: {
              statement: {
                ipSetReferenceStatement: {
                  arn: allowedIpSet.attrArn,
                }
              }
            }
          },
          // 初期状態: Count（無効）
          action: { count: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'MaintenanceMode',
          },
        },
      ],
    });

    // ========================================
    // 4. CloudFront Distribution
    // ========================================
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Main Site Distribution with Maintenance Mode',
      defaultBehavior: {
        origin: new origins.S3Origin(mainSiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(10),
        }
      ],
      webAclId: webAcl.attrArn,
    });

    // ========================================
    // 5. Parameter Store（メンテナンスモードフラグ）
    // ========================================
    const maintenanceParameter = new ssm.StringParameter(this, 'MaintenanceParameter', {
      parameterName: '/myapp/maintenance-mode-enabled',
      stringValue: 'false',  // 初期状態: OFF
      description: 'メンテナンスモードの有効/無効フラグ',
      tier: ssm.ParameterTier.STANDARD,
    });

    // ========================================
    // 6. Lambda 関数（メンテナンス開始）
    // ========================================
    const enableMaintenanceFunction = new lambda.Function(this, 'EnableMaintenanceFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/enable-maintenance'),
      timeout: cdk.Duration.seconds(30),
      environment: {
        WEB_ACL_NAME: 'MaintenanceWebACL',
        WEB_ACL_ID: webAcl.attrId,
        PARAMETER_NAME: maintenanceParameter.parameterName,
      },
    });

    // WAF更新権限
    enableMaintenanceFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'wafv2:GetWebACL',
        'wafv2:UpdateWebACL',
      ],
      resources: [webAcl.attrArn],
    }));

    // Parameter Store更新権限
    maintenanceParameter.grantWrite(enableMaintenanceFunction);

    // ========================================
    // 7. Lambda 関数（メンテナンス終了）
    // ========================================
    const disableMaintenanceFunction = new lambda.Function(this, 'DisableMaintenanceFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/disable-maintenance'),
      timeout: cdk.Duration.seconds(30),
      environment: {
        WEB_ACL_NAME: 'MaintenanceWebACL',
        WEB_ACL_ID: webAcl.attrId,
        PARAMETER_NAME: maintenanceParameter.parameterName,
      },
    });

    // WAF更新権限
    disableMaintenanceFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'wafv2:GetWebACL',
        'wafv2:UpdateWebACL',
      ],
      resources: [webAcl.attrArn],
    }));

    // Parameter Store更新権限
    maintenanceParameter.grantWrite(disableMaintenanceFunction);

    // ========================================
    // 8. EventBridge Scheduler 用 IAM Role
    // ========================================
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });

    enableMaintenanceFunction.grantInvoke(schedulerRole);
    disableMaintenanceFunction.grantInvoke(schedulerRole);

    // ========================================
    // 9. EventBridge Scheduler（開始）
    // ========================================
    new scheduler.CfnSchedule(this, 'MaintenanceStartSchedule', {
      name: 'maintenance-start',
      description: `メンテナンスモード開始: ${props.maintenanceStartTime} JST`,
      scheduleExpression: `at(${props.maintenanceStartTime})`,
      scheduleExpressionTimezone: 'Asia/Tokyo',
      flexibleTimeWindow: {
        mode: 'OFF',
      },
      target: {
        arn: enableMaintenanceFunction.functionArn,
        roleArn: schedulerRole.roleArn,
        retryPolicy: {
          maximumRetryAttempts: 2,
          maximumEventAge: 3600,
        },
      },
      state: 'ENABLED',
    });

    // ========================================
    // 10. EventBridge Scheduler（終了）
    // ========================================
    new scheduler.CfnSchedule(this, 'MaintenanceEndSchedule', {
      name: 'maintenance-end',
      description: `メンテナンスモード終了: ${props.maintenanceEndTime} JST`,
      scheduleExpression: `at(${props.maintenanceEndTime})`,
      scheduleExpressionTimezone: 'Asia/Tokyo',
      flexibleTimeWindow: {
        mode: 'OFF',
      },
      target: {
        arn: disableMaintenanceFunction.functionArn,
        roleArn: schedulerRole.roleArn,
        retryPolicy: {
          maximumRetryAttempts: 2,
          maximumEventAge: 3600,
        },
      },
      state: 'ENABLED',
    });

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL',
    });

    new cdk.CfnOutput(this, 'WebACLId', {
      value: webAcl.attrId,
      description: 'WAF WebACL ID',
    });

    new cdk.CfnOutput(this, 'MainSiteBucketName', {
      value: mainSiteBucket.bucketName,
      description: 'Main Site S3 Bucket Name',
    });

    new cdk.CfnOutput(this, 'EnableMaintenanceFunctionName', {
      value: enableMaintenanceFunction.functionName,
      description: 'Enable Maintenance Lambda Function',
    });

    new cdk.CfnOutput(this, 'DisableMaintenanceFunctionName', {
      value: disableMaintenanceFunction.functionName,
      description: 'Disable Maintenance Lambda Function',
    });
  }
}
```

### ステップ5: CDK アプリケーション設定

```typescript
// bin/app.ts
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MaintenanceStack } from '../lib/maintenance-stack';

const app = new cdk.App();

new MaintenanceStack(app, 'MaintenanceStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },

  // 管理者IPアドレス（複数指定可能）
  allowedIps: [
    '203.0.113.1/32',  // 例: オフィスIP
    '203.0.113.2/32',  // 例: VPN IP
  ],

  // メンテナンス開始時刻（JST）
  maintenanceStartTime: '2025-12-24T00:00:00',

  // メンテナンス終了時刻（JST）
  maintenanceEndTime: '2025-12-24T06:00:00',
});
```

### ステップ6: デプロイ

```bash
# 依存関係インストール
npm install

# Lambda用SDK追加
cd lambda/enable-maintenance && npm init -y && npm install @aws-sdk/client-wafv2 @aws-sdk/client-ssm && cd ../..
cd lambda/disable-maintenance && npm init -y && npm install @aws-sdk/client-wafv2 @aws-sdk/client-ssm && cd ../..

# CDK Bootstrap（初回のみ）
cdk bootstrap

# スタック差分確認
cdk diff

# デプロイ実行
cdk deploy --all

# デプロイ完了後、Outputsに表示されたCloudFront URLを確認
```

---

## 運用手順

### 🔧 メンテナンス予定の設定方法

#### **方法1: CDKコードで設定（推奨）**

```typescript
// bin/app.ts
new MaintenanceStack(app, 'MaintenanceStack', {
  // ...
  maintenanceStartTime: '2025-12-24T00:00:00',  // JST
  maintenanceEndTime: '2025-12-24T06:00:00',     // JST
});
```

```bash
# 設定変更後、再デプロイ
cdk deploy
```

#### **方法2: AWS コンソールで EventBridge Scheduler を直接編集**

1. AWS コンソール → EventBridge → Schedules
2. `maintenance-start` を選択
3. "Edit" ボタンをクリック
4. Schedule expression を変更
   ```
   at(2025-12-24T00:00:00)
   ```
5. Timezone: `Asia/Tokyo`
6. Save

### 🚀 手動でメンテナンスモードを切り替える

#### **手動開始**
```bash
# Lambda関数を直接実行
aws lambda invoke \
  --function-name MaintenanceStack-EnableMaintenanceFunctionXXXXXXXX \
  --region us-east-1 \
  response.json

# レスポンス確認
cat response.json
```

#### **手動終了**
```bash
# Lambda関数を直接実行
aws lambda invoke \
  --function-name MaintenanceStack-DisableMaintenanceFunctionXXXXXXXX \
  --region us-east-1 \
  response.json

# レスポンス確認
cat response.json
```

### 📊 メンテナンスモード状態確認

```bash
# Parameter Store から現在の状態を取得
aws ssm get-parameter \
  --name /myapp/maintenance-mode-enabled \
  --query 'Parameter.Value' \
  --output text

# 出力: true または false
```

### 🔍 WAFルール状態確認

```bash
# WebACL の現在設定を取得
aws wafv2 get-web-acl \
  --name MaintenanceWebACL \
  --scope CLOUDFRONT \
  --id <WebACL-ID> \
  --region us-east-1

# MaintenanceModeルールのActionを確認
# - Block: メンテナンス中
# - Count: 通常運用中
```

### 📈 CloudWatch メトリクス確認

```bash
# CloudWatch で以下メトリクスを確認
# - MaintenanceMode: Blockされたリクエスト数
# - AllowAdminIPs: 管理者IPからのリクエスト数
```

---

## コスト詳細

### 💰 月額コスト内訳（100万PV想定）

| 項目 | 単価 | 使用量 | 月額 |
|------|------|--------|------|
| **Lambda 実行** | $0.20/100万リクエスト | 100万回 | $0.20 |
| **Lambda 実行時間** | $0.0000166667/GB-秒 | 100万回×128MB×0.1秒 | $0.02 |
| **CloudFront データ転送** | $0.114/GB | 100GB | $11.40 |
| **CloudFront リクエスト** | $0.0075/1万リクエスト | 100万リクエスト | $0.75 |
| **WAF WebACL** | $5.00/月 + $1/100万リクエスト | 基本料金+100万 | $6.00 |
| **WAF ルール** | $1.00/月/ルール | 2ルール | $2.00 |
| **S3 ストレージ** | $0.025/GB | 10GB | $0.25 |
| **S3 リクエスト** | $0.0004/1000 GET | 100万GET | $0.40 |
| **EventBridge Scheduler** | 無料枠 | 2スケジュール | $0.00 |
| **Parameter Store** | 無料 | Standard | $0.00 |
| **合計** | - | - | **$21.02** |

**注意:** 上記は東京リージョン（ap-northeast-1）の料金です。

### 📉 コスト削減ポイント

1. **CloudFront キャッシュ最適化**
   - Cache-Control ヘッダー適切設定
   - TTL を長めに設定（1日〜1週間）
   - S3 リクエスト数削減

2. **Lambda 実行最適化**
   - メモリ最小化（128MB）
   - 実行時間最小化（100ms以下）
   - 不要なログ出力削減

3. **WAF ルール最適化**
   - 必要最小限のルール数に
   - 複雑な正規表現を避ける

---

## トラブルシューティング

### ❌ Sorry Page が表示されない

**原因1: WAFルールが有効化されていない**
```bash
# 確認
aws wafv2 get-web-acl \
  --name MaintenanceWebACL \
  --scope CLOUDFRONT \
  --id <WebACL-ID> \
  --region us-east-1 \
  | jq '.WebACL.Rules[] | select(.Name=="MaintenanceMode") | .Action'

# 期待値: {"Block": {...}}
# 実際: {"Count": {}} の場合 → Lambda未実行
```

**解決策:**
```bash
# Lambda を手動実行
aws lambda invoke \
  --function-name <EnableMaintenanceFunctionName> \
  --region us-east-1 \
  response.json
```

**原因2: CloudFront キャッシュが残っている**
```bash
# Invalidation作成
aws cloudfront create-invalidation \
  --distribution-id <Distribution-ID> \
  --paths "/*"
```

**原因3: 管理者IPからアクセスしている**
```bash
# 現在のIPアドレス確認
curl https://checkip.amazonaws.com

# IP Set に含まれているか確認
aws wafv2 get-ip-set \
  --name MaintenanceAllowedIPs \
  --scope CLOUDFRONT \
  --id <IPSet-ID> \
  --region us-east-1
```

### ❌ Lambda 実行エラー

**エラー: AccessDeniedException**
```
User is not authorized to perform: wafv2:UpdateWebACL
```

**解決策:**
```bash
# Lambda の IAM Role に権限追加
aws iam attach-role-policy \
  --role-name <Lambda-Role-Name> \
  --policy-arn arn:aws:iam::aws:policy/AWSWAFFullAccess
```

**エラー: ResourceNotFoundException**
```
WebACL not found
```

**解決策:**
- WebACL の Name/ID/Scope が正しいか確認
- CloudFront WAF は `us-east-1` 固定

### ❌ EventBridge Scheduler が実行されない

**確認1: Schedule の状態**
```bash
aws scheduler get-schedule \
  --name maintenance-start \
  --region us-east-1

# State: ENABLED であること
```

**確認2: IAM Role 権限**
```bash
# Scheduler Role に Lambda invoke 権限があるか確認
aws iam get-role \
  --role-name <SchedulerRoleName>
```

**確認3: CloudWatch Logs**
```bash
# Lambda のログを確認
aws logs tail /aws/lambda/<FunctionName> --follow
```

---

## FAQ

### Q1: 切り替えに本当に5-30秒かかりますか？

**A:** はい、通常は **5-30秒** で完了します。

- API実行: 1-3秒
- WAF伝播: 5-30秒（エッジロケーションの距離による）
- 日本国内のユーザーは通常 **5-10秒** で切り替わります

### Q2: 4KB制限を超えた場合はどうなりますか？

**A:** CDK デプロイ時にエラーになります。

```
Error: Sorry Page HTML が 4KB を超えています: 4321 bytes
```

**対策:**
- HTML圧縮（不要な空白・改行削除）
- 外部CSS/JSはCDN参照
- 画像はCDN参照（Base64埋め込み不可）

### Q3: メンテナンス時間を変更したい

**A:** 2つの方法があります。

**方法1: CDK再デプロイ（推奨）**
```typescript
// bin/app.ts を編集
maintenanceStartTime: '2025-12-25T00:00:00',

// 再デプロイ
cdk deploy
```

**方法2: AWS コンソールで直接編集**
- EventBridge → Schedules → 対象Schedule → Edit

### Q4: 複数の管理者IPを追加したい

**A:** CDKコードで追加します。

```typescript
// bin/app.ts
allowedIps: [
  '203.0.113.1/32',
  '203.0.113.2/32',
  '203.0.113.3/32',  // 追加
],

// 再デプロイ
cdk deploy
```

### Q5: Sorry Page のHTMLを更新したい

**A:** HTML編集後、CDK再デプロイが必要です。

```bash
# sorry-page.html を編集

# 再デプロイ
cdk deploy

# デプロイ完了後、WAFのカスタムレスポンスボディが更新される
```

### Q6: コスト削減方法は？

**A:** 以下の方法があります。

1. **CloudFront キャッシュTTL延長**
   - S3リクエスト削減

2. **Lambda メモリ削減**
   - 128MB → 最小限

3. **WAF ルール最適化**
   - 不要なルール削除

### Q7: 本番環境とステージング環境で別々に管理したい

**A:** 複数スタックをデプロイします。

```typescript
// bin/app.ts
new MaintenanceStack(app, 'ProductionStack', {
  env: { region: 'ap-northeast-1' },
  allowedIps: ['prod-ips'],
  // ...
});

new MaintenanceStack(app, 'StagingStack', {
  env: { region: 'ap-northeast-1' },
  allowedIps: ['staging-ips'],
  // ...
});
```

---

## まとめ

### ✅ このパターンの適用条件

| 条件 | 適合度 |
|------|-------|
| 予算優先 | ⭐⭐⭐⭐⭐ |
| シンプルなSorry Page | ⭐⭐⭐⭐⭐ |
| 即座の切り替え（5-30秒） | ⭐⭐⭐⭐⭐ |
| Lambda@Edge 不使用 | ⭐⭐⭐⭐⭐ |
| URL変化なし | ⭐⭐⭐⭐⭐ |
| リッチなデザイン | ❌ 4KB制限 |

### 🎯 推奨ポイント

1. **コスト効率**: $15.70/月（Lambda@Edge比で24%削減）
2. **高速切り替え**: 5-30秒で全世界に伝播
3. **シンプル構成**: CloudFront 1個のみ
4. **自動化完備**: EventBridge Scheduler で完全自動化

### 📚 参考リソース

- [AWS WAF Developer Guide](https://docs.aws.amazon.com/waf/latest/developerguide/)
- [CloudFront Developer Guide](https://docs.aws.amazon.com/cloudfront/latest/developerguide/)
- [EventBridge Scheduler User Guide](https://docs.aws.amazon.com/scheduler/latest/UserGuide/)
- [AWS CDK API Reference](https://docs.aws.amazon.com/cdk/api/v2/)

---

**作成日:** 2025-12-18
**バージョン:** 1.0
**対象:** 予算優先 & シンプルなSorry Page で十分なケース
