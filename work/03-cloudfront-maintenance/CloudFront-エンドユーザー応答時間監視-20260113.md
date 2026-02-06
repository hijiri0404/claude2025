# CloudFront エンドユーザー応答時間監視ガイド

## 📅 作成日
2026-01-13

## 🎯 目的
CloudFrontのオリジンにS3を利用している環境で、エンドユーザーが3秒以内に画面応答を得られているかを監視する方法を解説します。

---

## 📊 監視すべき主要メトリクス

### 1. **CloudFront標準メトリクス（CloudWatch）**

エンドユーザーの応答時間を直接測定するには、以下のメトリクスを組み合わせます：

#### **OriginLatency**（最重要）
- **説明**: CloudFrontエッジからオリジン（S3）へのリクエストからレスポンス受信までの時間
- **単位**: ミリ秒
- **統計**: Average, P50, P90, P99
- **推奨閾値**: Average < 500ms（3秒の目標に対する余裕を持つため）

#### **ResponseTime**（CloudFront monitoring）
- **説明**: エッジロケーションがリクエストを受信してからレスポンスを返すまでの全体時間
- **注意**: このメトリクスを直接取得するには**CloudFront Real-time monitoring**（追加料金）が必要

### 2. **CloudWatch RUM（Real User Monitoring）** ⭐推奨
```javascript
// 実際のエンドユーザー体験を測定
{
  メトリクス: {
    "navigation_duration": "ページロード完了時間",
    "first_contentful_paint": "最初のコンテンツ描画時間",
    "largest_contentful_paint": "最大コンテンツ描画時間",
    "time_to_first_byte": "最初のバイト受信時間"
  },
  閾値設定: "navigation_duration < 3000ms"
}
```

### 3. **CloudFront Real-time Logs**
以下のフィールドを監視：
- `time-to-first-byte`: エンドユーザーへの最初のバイト配信時間
- `time-taken`: 完全なレスポンス時間

### 4. **CloudWatch Synthetics（Canary）**
```python
# 定期的なエンドユーザーシミュレーション
監視頻度: 1分〜5分ごと
測定項目:
  - ページロード時間
  - リソース取得時間
  - エラー率
```

---

## 🎯 推奨監視アーキテクチャ

```
┌─────────────────────────────────────┐
│ エンドユーザー体験測定              │
├─────────────────────────────────────┤
│ CloudWatch RUM                      │
│ └─ navigation_duration < 3秒        │
└─────────────────────────────────────┘
         ↓ 補完
┌─────────────────────────────────────┐
│ インフラ側メトリクス                │
├─────────────────────────────────────┤
│ CloudFront OriginLatency            │
│ └─ Average < 500ms                  │
│ CloudWatch Synthetics               │
│ └─ 5分ごとチェック                  │
└─────────────────────────────────────┘
```

---

## ⚙️ 実装例

### CloudWatch アラーム設定（OriginLatency）
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "cloudfront-origin-latency-high" \
  --alarm-description "Origin latency exceeds 500ms" \
  --metric-name OriginLatency \
  --namespace AWS/CloudFront \
  --statistic Average \
  --period 300 \
  --threshold 500 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --dimensions Name=DistributionId,Value=YOUR_DISTRIBUTION_ID
```

### CloudWatch RUM設定
```typescript
// ウェブページに埋め込み
import { AwsRum } from 'aws-rum-web';

const awsRum = new AwsRum(
  'YOUR_APP_ID',
  '1.0.0',
  'us-east-1',
  {
    sessionSampleRate: 1,
    telemetries: ['performance', 'errors'],
    allowCookies: true
  }
);
```

### CloudWatch Synthetics Canary（TypeScript例）
```typescript
import { Construct } from 'constructs';
import * as synthetics from 'aws-cdk-lib/aws-synthetics';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export class CloudFrontMonitoring extends Construct {
  constructor(scope: Construct, id: string, props: {
    distributionUrl: string,
    alarmEmail: string
  }) {
    super(scope, id);

    // Canary作成
    const canary = new synthetics.Canary(this, 'CloudFrontCanary', {
      canaryName: 'cloudfront-response-time-check',
      runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_6_2,
      test: synthetics.Test.custom({
        code: synthetics.Code.fromInline(`
          const synthetics = require('Synthetics');
          const log = require('SyntheticsLogger');

          const pageLoadBlueprint = async function () {
            const page = await synthetics.getPage();
            const response = await page.goto("${props.distributionUrl}", {
              waitUntil: 'networkidle0',
              timeout: 30000
            });

            const responseTime = response.timing().responseEnd;
            log.info('Response time: ' + responseTime + 'ms');

            if (responseTime > 3000) {
              throw new Error('Response time exceeded 3 seconds');
            }
          };

          exports.handler = async () => {
            return await pageLoadBlueprint();
          };
        `),
        handler: 'index.handler',
      }),
      schedule: synthetics.Schedule.rate(Duration.minutes(5)),
    });

    // アラーム設定
    const alarm = new cloudwatch.Alarm(this, 'ResponseTimeAlarm', {
      metric: canary.metricDuration(),
      threshold: 3000,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
  }
}
```

---

## 📋 監視メトリクス優先順位

| 優先度 | メトリクス | 理由 | コスト |
|--------|-----------|------|--------|
| **🥇 最優先** | CloudWatch RUM | 実際のユーザー体験を測定 | 中 |
| **🥈 重要** | CloudFront OriginLatency | S3応答速度を直接監視 | 低 |
| **🥉 推奨** | CloudWatch Synthetics | 継続的な可用性確認 | 中 |
| 補助 | CloudFront Real-time Logs | 詳細分析用 | 高 |

---

## 🚨 3秒閾値の具体的設定

```yaml
CloudWatch Alarm設定:
  # RUM - エンドユーザー体験
  - メトリクス: NavigationDuration
    統計: p90  # 90パーセンタイル
    閾値: 3000ms
    評価期間: 3回中2回

  # CloudFront - インフラ側
  - メトリクス: OriginLatency
    統計: Average
    閾値: 500ms  # 余裕を持った設定
    評価期間: 2回中2回

  # Synthetics - 外形監視
  - メトリクス: Duration
    統計: Average
    閾値: 3000ms
    頻度: 5分
```

---

## 💡 ベストプラクティス

### 1. 多層監視アプローチ
- **RUM**: ユーザー体験を測定（真の指標）
- **OriginLatency**: インフラ問題を早期検知
- **Synthetics**: 24/7監視

### 2. 統計値の選択
- **Average**: 全体傾向把握
- **P90/P95**: 大多数のユーザー体験
- **P99**: 最悪ケースの検知

### 3. コスト最適化
- **初期段階**: OriginLatency + Synthetics（低コスト）
- **本格運用**: 上記 + RUM（完全な可視化）

### 4. アラート設計
```
レベル1（警告）: OriginLatency > 500ms
レベル2（注意）: P90 ResponseTime > 2500ms
レベル3（重大）: P90 ResponseTime > 3000ms
```

---

## 📊 ダッシュボード設計例

### CloudWatch Dashboard構成
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/CloudFront", "OriginLatency", {"stat": "Average"}],
          ["...", {"stat": "p90"}],
          ["...", {"stat": "p99"}]
        ],
        "period": 300,
        "title": "Origin Latency (S3)",
        "yAxis": {"left": {"min": 0, "max": 1000}}
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/CloudWatch/RUM", "NavigationDuration", {"stat": "p90"}]
        ],
        "period": 300,
        "title": "End User Response Time (RUM)",
        "annotations": {
          "horizontal": [
            {"value": 3000, "label": "3秒閾値", "color": "#d62728"}
          ]
        }
      }
    }
  ]
}
```

---

## 🔍 トラブルシューティング

### 応答時間が3秒を超える場合のチェックポイント

1. **OriginLatencyが高い場合**
   - S3バケットのリージョンを確認
   - S3 Transfer Accelerationの検討
   - CloudFront Origin Shieldの活用

2. **OriginLatencyは正常だが全体が遅い場合**
   - CloudFrontキャッシュヒット率を確認
   - オブジェクトサイズの最適化
   - 圧縮設定の確認（Gzip/Brotli）

3. **地域によって遅い場合**
   - CloudFrontエッジロケーションのカバレッジ確認
   - Price Classの見直し

---

## 📚 参考リソース

- [CloudFront Metrics and Dimensions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/monitoring-using-cloudwatch.html)
- [CloudWatch RUM Documentation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-RUM.html)
- [CloudWatch Synthetics](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Synthetics_Canaries.html)

---

## ✅ チェックリスト

- [ ] CloudFront OriginLatencyアラーム設定完了
- [ ] CloudWatch RUM導入（本番環境）
- [ ] CloudWatch Synthetics Canary作成
- [ ] CloudWatch Dashboard作成
- [ ] アラート通知先設定（SNS/Email/Slack）
- [ ] 1週間のベースライン取得
- [ ] 閾値の微調整実施
- [ ] ランブックの作成（対応手順書）

---

## 🎯 まとめ

CloudFrontのエンドユーザー応答時間を3秒以内に保つためには、以下の3つの監視を組み合わせることが最適です：

1. **CloudWatch RUM**: 実際のユーザー体験を測定（最重要）
2. **CloudFront OriginLatency**: インフラ側の問題を早期検知
3. **CloudWatch Synthetics**: 継続的な外形監視

この多層アプローチにより、ユーザー体験の劣化を迅速に検知し、原因を特定できます。
