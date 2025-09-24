# AWS ゼロデイ攻撃対策ガイド 🛡️

## 📋 概要

CloudFront + API Gateway + Lambda + WAF 構成におけるゼロデイ攻撃対策の包括的ガイドです。
**重要：Lambda以外の全サービスでもゼロデイ攻撃対策が必要です。**

---

## 🎯 結論：全サービスでゼロデイ攻撃対策が必要

### ❌ よくある誤解
- 「Lambdaだけゼロデイ攻撃対策すればいい」
- 「マネージドサービスなので AWS が全て対応してくれる」
- 「WAF があるから他のサービスは安全」

### ✅ 正しい理解
**CloudFront、API Gateway、Lambda、WAF の全てのサービスでゼロデイ攻撃を想定し、多層防御を実装する必要があります。**

---

## 📊 各サービスのゼロデイ攻撃リスク分析

| サービス | リスクレベル | 主な脅威ベクター | 攻撃例 |
|---------|-------------|----------------|--------|
| **AWS WAF** | 🟡 中程度 | マネージドルール回避<br>新規攻撃パターン | 未知のペイロード構造<br>エンコード回避技術 |
| **CloudFront** | 🟡 中程度 | エッジロケーション悪用<br>キャッシュポイズニング | HTTP/2脆弱性<br>TLS実装攻撃 |
| **API Gateway** | 🟠 高 | REST APIエンドポイント<br>認証バイパス | JWT脆弱性<br>パスパラメータ攻撃 |
| **Lambda** | 🔴 **最高** | ランタイム脆弱性<br>実行環境攻撃 | コンテナエスケープ<br>メモリ破損攻撃 |

---

## 🛡️ サービス別対応方法とベストプラクティス

### 1. AWS WAF：最前線防御

#### 🔧 実装例
```bash
# マネージドルール自動更新の確認
aws wafv2 list-managed-rule-sets --scope CLOUDFRONT --region us-east-1

# 脅威インテリジェンス統合の有効化
aws wafv2 put-managed-rule-set-versions \
    --scope CLOUDFRONT \
    --id "AWSManagedRulesCommonRuleSet" \
    --lock-token "your-lock-token"
```

#### ✨ ベストプラクティス
- **AWSマネージドルール群の全活用**
  - `AWSManagedRulesCommonRuleSet`：一般的な攻撃パターン
  - `AWSManagedRulesKnownBadInputsRuleSet`：既知攻撃パターン検出
  - `AWSManagedRulesAmazonIpReputationList`：悪意のあるIP自動ブロック
  - `AWSManagedRulesAntiDDoSRuleSet`：DDoS攻撃対策
- **カスタムルール**でアプリケーション固有の脅威パターン対応
- **リアルタイムログ**で攻撃パターン分析
- **地理的ブロック**で高リスク地域制限

#### 🚨 緊急対応設定
```yaml
# CloudFormation WAF緊急ブロックルール
EmergencyBlockRule:
  Type: AWS::WAFv2::WebACL
  Properties:
    Rules:
      - Name: EmergencyBlockRule
        Priority: 0
        Statement:
          IPSetReferenceStatement:
            Arn: !GetAtt MaliciousIPSet.Arn
        Action:
          Block: {}
        VisibilityConfig:
          SampledRequestsEnabled: true
          CloudWatchMetricsEnabled: true
          MetricName: EmergencyBlockMetric
```

---

### 2. CloudFront：グローバル攻撃経路の保護

#### 🔧 実装例
```javascript
// セキュリティヘッダー実装（Lambda@Edge）
exports.handler = (event, context, callback) => {
    const response = event.Records[0].cf.response;
    const headers = response.headers;
    
    // ゼロデイ攻撃対策セキュリティヘッダー
    headers['strict-transport-security'] = [{
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains; preload'
    }];
    headers['x-content-type-options'] = [{
        key: 'X-Content-Type-Options', 
        value: 'nosniff'
    }];
    headers['x-frame-options'] = [{
        key: 'X-Frame-Options',
        value: 'DENY'
    }];
    headers['content-security-policy'] = [{
        key: 'Content-Security-Policy',
        value: "default-src 'self'; script-src 'self' 'unsafe-inline'"
    }];
    
    callback(null, response);
};
```

#### ✨ ベストプラクティス
- **OAC（Origin Access Control）**でオリジンへの直接アクセス完全遮断
- **Real-time Logs**で異常トラフィック即座検出
- **セキュリティヘッダー**による多層防御
- **TLS 1.3** 最新暗号化プロトコル使用
- **地理的ブロック**で高リスク地域からのアクセス制限

#### 🔒 OAC設定例
```yaml
OriginAccessControl:
  Type: AWS::CloudFront::OriginAccessControl
  Properties:
    OriginAccessControlConfig:
      Name: SecureOAC
      OriginAccessControlOriginType: s3
      SigningBehavior: always
      SigningProtocol: sigv4
```

---

### 3. API Gateway：認証・認可層の多層防御

#### 🔧 実装例
```yaml
# API Gateway セキュリティ強化設定
Resources:
  SecureRestApi:
    Type: AWS::ApiGateway::RestApi
    Properties:
      EndpointConfiguration:
        Types: [REGIONAL]
      Policy:
        Version: '2012-10-17'
        Statement:
          - Effect: Deny
            Principal: "*"
            Action: "execute-api:Invoke"
            Resource: "arn:aws:execute-api:*:*:*"
            Condition:
              IpAddress:
                aws:SourceIp: 
                  - "192.0.2.0/24"  # ブロック対象IP
          - Effect: Allow
            Principal: "*"
            Action: "execute-api:Invoke"
            Resource: "arn:aws:execute-api:*:*:*"

  # スロットリング設定
  ApiUsagePlan:
    Type: AWS::ApiGateway::UsagePlan
    Properties:
      Throttle:
        RateLimit: 100
        BurstLimit: 200
      Quota:
        Limit: 10000
        Period: DAY
```

#### ✨ ベストプラクティス
- **AWS WAF統合**でAPI層の脅威フィルタリング
- **スロットリング**で異常なリクエストレート制限
- **Lambda Authorizer**でカスタム認証ロジック実装
- **API Key管理**で認証済みクライアント制御
- **X-Ray トレーシング**でリクエストフロー可視化
- **CloudWatch監視**でリアルタイム異常検出

#### 🔐 Lambda Authorizer実装例
```python
import json
import jwt
import logging

def lambda_handler(event, context):
    """カスタム認証ロジック"""
    
    try:
        # トークン検証
        token = event['authorizationToken']
        decoded = jwt.decode(token, 'secret', algorithms=['HS256'])
        
        # ゼロデイ攻撃対策：異常なペイロード検出
        if validate_payload_security(decoded):
            return generate_policy('user', 'Allow', event['methodArn'])
        else:
            logger.warning(f"Suspicious token payload: {decoded}")
            return generate_policy('user', 'Deny', event['methodArn'])
            
    except Exception as e:
        logger.error(f"Authorization failed: {str(e)}")
        return generate_policy('user', 'Deny', event['methodArn'])

def validate_payload_security(payload):
    """ペイロードのセキュリティ検証"""
    suspicious_patterns = ['<script', 'javascript:', 'SELECT ', 'DROP ']
    payload_str = json.dumps(payload).lower()
    
    return not any(pattern in payload_str for pattern in suspicious_patterns)
```

---

### 4. Lambda：実行環境の最高セキュリティ

#### 🔧 実装例
```python
import boto3
import json
import logging
import hashlib
import time
from datetime import datetime

# セキュリティログ設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """セキュリティ強化されたLambda関数"""
    
    # 実行開始時刻記録
    start_time = time.time()
    
    try:
        # 入力値検証（ゼロデイ攻撃対策）
        if not validate_input_security(event):
            logger.warning(f"Suspicious input detected: {json.dumps(event, default=str)}")
            return security_error_response("Invalid request format")
        
        # コードインジェクション検出
        if detect_code_injection(event):
            logger.error(f"Code injection attempt: {json.dumps(event, default=str)}")
            notify_security_incident("Code injection detected", event)
            return security_error_response("Security violation")
        
        # ビジネスロジック実行
        result = process_secure_request(event)
        
        # 実行時間監視（異常に長い処理の検出）
        execution_time = time.time() - start_time
        if execution_time > 30:  # 30秒以上
            logger.warning(f"Long execution time detected: {execution_time}s")
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'DENY'
            },
            'body': json.dumps(result)
        }
        
    except Exception as e:
        logger.error(f"Lambda execution error: {str(e)}")
        # セキュリティインシデント通知
        notify_security_team(str(e), event)
        return security_error_response("Internal server error")

def validate_input_security(event):
    """入力値の厳密なセキュリティ検証"""
    
    # SQLインジェクション検出
    sql_patterns = [
        'SELECT', 'DROP', 'INSERT', 'UPDATE', 'DELETE',
        'UNION', 'OR 1=1', 'AND 1=1', 'EXEC', 'EXECUTE'
    ]
    
    # XSS検出
    xss_patterns = [
        '<script', 'javascript:', 'onload=', 'onerror=',
        'eval(', 'setTimeout(', 'setInterval('
    ]
    
    # NoSQLインジェクション検出  
    nosql_patterns = [
        '$where', '$ne', '$gt', '$lt', '$regex', '$exists'
    ]
    
    event_str = json.dumps(event, default=str).lower()
    
    # 全パターンチェック
    all_patterns = sql_patterns + xss_patterns + nosql_patterns
    return not any(pattern.lower() in event_str for pattern in all_patterns)

def detect_code_injection(event):
    """コードインジェクション検出"""
    
    dangerous_functions = [
        'eval', 'exec', 'compile', '__import__',
        'open', 'file', 'input', 'raw_input'
    ]
    
    event_str = json.dumps(event, default=str).lower()
    return any(func in event_str for func in dangerous_functions)

def process_secure_request(event):
    """セキュアなビジネスロジック処理"""
    
    # リクエストハッシュ化（改ざん検出用）
    request_hash = hashlib.sha256(
        json.dumps(event, sort_keys=True, default=str).encode()
    ).hexdigest()
    
    logger.info(f"Processing request hash: {request_hash}")
    
    # 実際のビジネスロジック
    return {
        'message': 'Request processed successfully',
        'timestamp': datetime.now().isoformat(),
        'request_id': context.aws_request_id if 'context' in globals() else 'unknown'
    }

def notify_security_incident(incident_type, event_data):
    """セキュリティインシデント通知"""
    
    try:
        sns = boto3.client('sns')
        
        message = {
            'incident_type': incident_type,
            'timestamp': datetime.now().isoformat(),
            'event_data': json.dumps(event_data, default=str)[:1000],  # 1KB制限
            'source': 'Lambda Security Monitor'
        }
        
        sns.publish(
            TopicArn='arn:aws:sns:region:account:security-alerts',
            Message=json.dumps(message),
            Subject=f'Security Alert: {incident_type}'
        )
        
    except Exception as e:
        logger.error(f"Failed to send security notification: {str(e)}")

def notify_security_team(error_message, event_data):
    """セキュリティチーム通知"""
    notify_security_incident("Lambda Exception", {
        'error': error_message,
        'event': event_data
    })

def security_error_response(message):
    """セキュリティエラーレスポンス"""
    return {
        'statusCode': 400,
        'headers': {
            'Content-Type': 'application/json',
            'X-Content-Type-Options': 'nosniff'
        },
        'body': json.dumps({'error': message})
    }
```

#### ✨ ベストプラクティス
- **最新ランタイム**の自動更新設定
- **GuardDuty Lambda Protection**で悪意のあるコード実行監視
- **Code Signing**でコード整合性保証
- **環境変数暗号化**で機密情報保護
- **最小権限IAMロール**でリソースアクセス制限
- **VPC内実行**でネットワーク分離
- **Dead Letter Queue**でエラーハンドリング強化

#### 🔐 Code Signing設定例
```yaml
LambdaCodeSigningConfig:
  Type: AWS::Lambda::CodeSigningConfig
  Properties:
    AllowedPublishers:
      SigningProfileVersionArns:
        - !Ref SigningProfileVersionArn
    CodeSigningPolicies:
      UntrustedArtifactOnDeployment: Enforce

SecureLambdaFunction:
  Type: AWS::Lambda::Function
  Properties:
    CodeSigningConfigArn: !Ref LambdaCodeSigningConfig
    Runtime: python3.11
    Handler: index.lambda_handler
```

---

## 📊 統合モニタリング・アラートシステム

### 🔧 CloudWatch統合監視
```bash
# ゼロデイ攻撃検出アラーム作成
aws cloudwatch put-metric-alarm \
    --alarm-name "ZeroDayAttackDetection" \
    --alarm-description "Detect potential zero-day attacks" \
    --metric-name "4xxErrorRate" \
    --namespace "AWS/ApiGateway" \
    --statistic "Average" \
    --period 300 \
    --threshold 10.0 \
    --comparison-operator "GreaterThanThreshold" \
    --evaluation-periods 2 \
    --alarm-actions "arn:aws:sns:region:account:security-alerts"

# Lambda異常実行検出
aws cloudwatch put-metric-alarm \
    --alarm-name "LambdaAnomalousExecution" \
    --alarm-description "Detect Lambda anomalous execution patterns" \
    --metric-name "Duration" \
    --namespace "AWS/Lambda" \
    --statistic "Average" \
    --period 300 \
    --threshold 30000 \
    --comparison-operator "GreaterThanThreshold" \
    --evaluation-periods 1
```

### 🚨 GuardDuty脅威検出自動対応
```python
import boto3
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handle_guardduty_finding(event, context):
    """GuardDuty検出結果の自動対応"""
    
    try:
        for record in event['Records']:
            # SNS経由でGuardDuty Finding受信
            finding = json.loads(record['Sns']['Message'])
            
            logger.info(f"Processing GuardDuty finding: {finding['id']}")
            
            # 高危険度の場合は即座対応
            if finding['severity'] >= 7.0:
                
                # 悪意のあるIPを自動ブロック
                if 'remoteIpDetails' in finding.get('service', {}):
                    malicious_ip = finding['service']['remoteIpDetails']['ipAddressV4']
                    block_malicious_ip(malicious_ip)
                
                # 影響を受けたリソースの一時停止
                affected_resource = finding.get('resource', {})
                if affected_resource.get('resourceType') == 'Instance':
                    isolate_ec2_instance(affected_resource['instanceDetails']['instanceId'])
                
                # セキュリティチームに緊急通知
                notify_security_incident_urgent(finding)
            
            # 中程度以上の場合は監査ログ記録
            elif finding['severity'] >= 4.0:
                log_security_audit(finding)
                
        return {'statusCode': 200, 'body': 'Processed successfully'}
        
    except Exception as e:
        logger.error(f"Failed to process GuardDuty finding: {str(e)}")
        return {'statusCode': 500, 'body': 'Processing failed'}

def block_malicious_ip(ip_address):
    """悪意のあるIPをWAFで自動ブロック"""
    
    try:
        wafv2 = boto3.client('wafv2')
        
        # IPセットに追加
        response = wafv2.update_ip_set(
            Scope='CLOUDFRONT',
            Id='malicious-ip-set',
            Addresses=[f"{ip_address}/32"],
            LockToken='current-lock-token'
        )
        
        logger.info(f"Blocked IP address: {ip_address}")
        
    except Exception as e:
        logger.error(f"Failed to block IP {ip_address}: {str(e)}")

def isolate_ec2_instance(instance_id):
    """影響を受けたEC2インスタンスの分離"""
    
    try:
        ec2 = boto3.client('ec2')
        
        # 分離用セキュリティグループに変更
        ec2.modify_instance_attribute(
            InstanceId=instance_id,
            Groups=['sg-isolation-group']
        )
        
        logger.info(f"Isolated EC2 instance: {instance_id}")
        
    except Exception as e:
        logger.error(f"Failed to isolate instance {instance_id}: {str(e)}")

def notify_security_incident_urgent(finding):
    """緊急セキュリティインシデント通知"""
    
    try:
        sns = boto3.client('sns')
        
        message = {
            'alert_level': 'CRITICAL',
            'finding_id': finding['id'],
            'finding_type': finding['type'],
            'severity': finding['severity'],
            'description': finding['description'],
            'timestamp': finding['updatedAt'],
            'affected_resources': finding.get('resource', {}),
            'recommended_actions': [
                'Investigate affected resources immediately',
                'Review security logs for related activity',
                'Consider temporary service isolation'
            ]
        }
        
        # 複数チャンネルで通知
        sns.publish(
            TopicArn='arn:aws:sns:region:account:security-critical-alerts',
            Message=json.dumps(message, indent=2),
            Subject=f'🚨 CRITICAL: GuardDuty Security Alert - {finding["type"]}'
        )
        
        # Slack通知も送信
        send_slack_alert(message)
        
    except Exception as e:
        logger.error(f"Failed to send urgent notification: {str(e)}")

def send_slack_alert(alert_data):
    """Slack緊急アラート送信"""
    # Slack Webhook実装
    pass

def log_security_audit(finding):
    """セキュリティ監査ログ記録"""
    
    audit_log = {
        'timestamp': finding['updatedAt'],
        'event_type': 'security_finding',
        'severity': finding['severity'],
        'finding_type': finding['type'],
        'resource_affected': finding.get('resource', {}),
        'source': 'GuardDuty'
    }
    
    logger.info(f"Security audit log: {json.dumps(audit_log)}")
```

### 📈 セキュリティダッシュボード
```yaml
# CloudWatch Dashboard設定
ZeroDaySecurityDashboard:
  Type: AWS::CloudWatch::Dashboard
  Properties:
    DashboardName: "ZeroDayAttackMonitoring"
    DashboardBody: !Sub |
      {
        "widgets": [
          {
            "type": "metric",
            "x": 0, "y": 0, "width": 12, "height": 6,
            "properties": {
              "metrics": [
                ["AWS/WAF", "BlockedRequests", "WebACL", "SecurityWebACL", "Rule", "ALL"],
                ["AWS/CloudFront", "4xxErrorRate", "DistributionId", "ALL"],
                ["AWS/ApiGateway", "4xxError", "ApiName", "ALL"],
                ["AWS/Lambda", "Errors", "FunctionName", "ALL"]
              ],
              "title": "Security Metrics Overview",
              "period": 300,
              "stat": "Sum",
              "region": "${AWS::Region}",
              "view": "timeSeries"
            }
          },
          {
            "type": "log",
            "x": 0, "y": 6, "width": 24, "height": 6,
            "properties": {
              "query": "SOURCE '/aws/lambda/security-monitor'\n| fields @timestamp, @message\n| filter @message like /SECURITY/\n| sort @timestamp desc\n| limit 100",
              "title": "Security Events Log",
              "region": "${AWS::Region}",
              "view": "table"
            }
          },
          {
            "type": "metric",
            "x": 12, "y": 0, "width": 12, "height": 6,
            "properties": {
              "metrics": [
                ["AWS/GuardDuty", "FindingCount", "DetectorId", "ALL"]
              ],
              "title": "GuardDuty Threat Detection",
              "period": 3600,
              "stat": "Sum",
              "region": "${AWS::Region}",
              "view": "singleValue"
            }
          }
        ]
      }
```

---

## 🎯 優先対策実装ロードマップ

### 🔴 最優先（今すぐ実施）

#### 1. Lambda最新ランタイム更新
```bash
# 現在のランタイム確認
aws lambda list-functions --query 'Functions[?Runtime!=`nodejs18.x` && Runtime!=`python3.11`].[FunctionName,Runtime]'

# 最新ランタイムに更新
aws lambda update-function-configuration \
    --function-name your-function-name \
    --runtime python3.11
```

#### 2. WAFマネージドルール全活用
```bash
# 利用可能なマネージドルール確認
aws wafv2 describe-managed-rule-group \
    --vendor-name AWS \
    --name AWSManagedRulesCommonRuleSet \
    --scope CLOUDFRONT

# マネージドルール追加
aws wafv2 update-web-acl \
    --scope CLOUDFRONT \
    --id your-web-acl-id \
    --default-action Allow={} \
    --rules file://managed-rules.json
```

#### 3. GuardDuty有効化
```bash
# GuardDuty有効化
aws guardduty create-detector --enable

# Lambda Protection有効化
aws guardduty update-detector \
    --detector-id your-detector-id \
    --features Name=LAMBDA_NETWORK_LOGS,Status=ENABLED
```

### 🟠 高優先（1週間以内）

#### 4. CloudFront OAC設定
#### 5. API Gateway WAF統合
#### 6. セキュリティモニタリング自動化

### 🟡 中優先（1ヶ月以内）

#### 7. Lambda Code Signing導入
#### 8. X-Ray分散トレーシング
#### 9. セキュリティインシデント対応自動化

---

## 🔍 継続的脅威インテリジェンス

### 情報収集ソース
- **AWS Security Bulletins**：https://aws.amazon.com/security/security-bulletins/
- **MITRE ATT&CK**：https://attack.mitre.org/
- **CVE Database**：https://cve.org/
- **OWASP Top 10**：https://owasp.org/www-project-top-ten/

### 自動脅威情報更新
```python
def update_threat_intelligence():
    """脅威情報の自動更新"""
    
    # AWS Security Bulletins監視
    check_aws_security_bulletins()
    
    # CVEデータベース更新
    update_cve_database()
    
    # WAFルール自動更新
    update_waf_managed_rules()
    
    # GuardDuty脅威インテリジェンス更新
    update_guardduty_threat_intelligence()
```

---

## 🗃️ S3ファイル改ざん検知：数分以内リアルタイム監視

### 📋 概要
S3に保存されたファイルの改ざんを**数分以内**で検知するための包括的ソリューション。
複数のAWSサービスを組み合わせた多層検知システムで、ゼロデイ攻撃によるデータ改ざんも即座に発見します。

---

### 🎯 検知方法比較表

| 手法 | 検知速度 | 精度 | 実装複雑度 | 推奨度 |
|------|---------|------|-----------|---------|
| **EventBridge + Lambda** | ⚡ 秒単位 | 🟢 高 | 🟡 中 | ⭐⭐⭐⭐⭐ |
| **S3 Event Notifications** | ⚡ 秒単位 | 🟢 高 | 🟢 低 | ⭐⭐⭐⭐⭐ |
| **CloudTrail + EventBridge** | 🕐 1-2分 | 🟢 高 | 🟠 高 | ⭐⭐⭐⭐ |
| **S3 Checksum Validation** | 📊 分析時 | 🔴 最高 | 🟠 高 | ⭐⭐⭐⭐⭐ |
| **GuardDuty Malware Protection** | 🕐 数分 | 🟢 高 | 🟢 低 | ⭐⭐⭐⭐ |
| **Amazon Macie** | 🕐 数分 | 🟢 高 | 🟢 低 | ⭐⭐⭐ |

---

### 🚀 **推奨アプローチ：多層リアルタイム検知システム**

#### 🏗️ **アーキテクチャ概要**
```
S3 Bucket → EventBridge → Lambda → 複数検証 → 即時アラート
    ↓           ↓          ↓        ↓          ↓
チェックサム  イベント    改ざん    CloudWatch  SNS/Slack
計算・保存   フィルタリング 検証      メトリクス   通知
```

---

### 🔧 **実装例1：EventBridge + Lambda リアルタイム検知**

#### EventBridge Rule設定
```yaml
S3TamperingDetectionRule:
  Type: AWS::Events::Rule
  Properties:
    Name: S3FileTamperingDetection
    Description: "Detect S3 file modifications in real-time"
    EventPattern:
      source: ["aws.s3"]
      detail-type: 
        - "Object Created"
        - "Object Deleted" 
        - "Object Restore Completed"
        - "Object Storage Class Changed"
        - "Object ACL Updated"
      detail:
        bucket:
          name: ["critical-data-bucket"]  # 監視対象バケット
        object:
          key:
            - prefix: "sensitive/"      # 機密ファイルのプレフィックス
    State: ENABLED
    Targets:
      - Arn: !GetAtt TamperDetectionLambda.Arn
        Id: "S3TamperDetectionTarget"
```

#### Lambda検知関数
```python
import json
import boto3
import hashlib
import logging
from datetime import datetime
from typing import Dict, Any, Optional

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS clients
s3_client = boto3.client('s3')
sns_client = boto3.client('sns')
cloudwatch = boto3.client('cloudwatch')

def lambda_handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """S3ファイル改ざんリアルタイム検知"""
    
    try:
        # EventBridge からのS3イベント処理
        for record in event.get('Records', [event]):
            if 'detail' in record:
                process_eventbridge_event(record)
            else:
                process_s3_event(record)
                
        return {'statusCode': 200, 'body': 'Detection completed'}
        
    except Exception as e:
        logger.error(f"Tamper detection failed: {str(e)}")
        send_alert(f"Detection system error: {str(e)}", "CRITICAL")
        return {'statusCode': 500, 'body': 'Detection failed'}

def process_eventbridge_event(event: Dict[str, Any]) -> None:
    """EventBridge経由のS3イベント処理"""
    
    detail = event['detail']
    bucket = detail['bucket']['name']
    key = detail['object']['key']
    event_name = event['detail-type']
    
    logger.info(f"Processing EventBridge S3 event: {event_name} for {bucket}/{key}")
    
    # 改ざん検知実行
    tamper_result = detect_file_tampering(bucket, key, event_name)
    
    if tamper_result['is_tampered']:
        handle_tampering_detected(bucket, key, tamper_result, event_name)

def detect_file_tampering(bucket: str, key: str, event_name: str) -> Dict[str, Any]:
    """ファイル改ざん検知ロジック"""
    
    result = {
        'is_tampered': False,
        'tampering_type': None,
        'evidence': {},
        'timestamp': datetime.now().isoformat()
    }
    
    try:
        # 1. オブジェクトメタデータ取得
        response = s3_client.head_object(Bucket=bucket, Key=key)
        current_metadata = response.get('Metadata', {})
        current_etag = response.get('ETag', '').strip('"')
        current_last_modified = response.get('LastModified')
        
        # 2. 保存済みチェックサム比較
        stored_checksum = current_metadata.get('original-checksum')
        if stored_checksum:
            # オブジェクト取得してチェックサム計算
            obj_response = s3_client.get_object(Bucket=bucket, Key=key)
            current_content = obj_response['Body'].read()
            calculated_checksum = hashlib.sha256(current_content).hexdigest()
            
            if stored_checksum != calculated_checksum:
                result.update({
                    'is_tampered': True,
                    'tampering_type': 'CONTENT_MODIFIED',
                    'evidence': {
                        'stored_checksum': stored_checksum,
                        'current_checksum': calculated_checksum,
                        'size_bytes': len(current_content)
                    }
                })
                
        # 3. 異常なイベントパターン検知
        suspicious_patterns = [
            'Object Deleted',
            'Object ACL Updated', 
            'Object Storage Class Changed'
        ]
        
        if event_name in suspicious_patterns:
            # DynamoDB等で過去のアクティビティ確認
            if is_unusual_access_pattern(bucket, key):
                result.update({
                    'is_tampered': True,
                    'tampering_type': 'SUSPICIOUS_ACCESS',
                    'evidence': {
                        'event_type': event_name,
                        'access_pattern': 'unusual'
                    }
                })
        
        # 4. ファイルサイズ異常検知
        expected_size_range = get_expected_file_size(bucket, key)
        current_size = response.get('ContentLength', 0)
        
        if expected_size_range and not (expected_size_range['min'] <= current_size <= expected_size_range['max']):
            result.update({
                'is_tampered': True,
                'tampering_type': 'SIZE_ANOMALY',
                'evidence': {
                    'current_size': current_size,
                    'expected_range': expected_size_range
                }
            })
            
    except s3_client.exceptions.NoSuchKey:
        # ファイル削除検知
        result.update({
            'is_tampered': True,
            'tampering_type': 'FILE_DELETED',
            'evidence': {'action': 'file_deleted'}
        })
    except Exception as e:
        logger.error(f"Error detecting tampering: {str(e)}")
        
    return result

def handle_tampering_detected(bucket: str, key: str, result: Dict[str, Any], event_name: str) -> None:
    """改ざん検知時の対応処理"""
    
    tampering_type = result['tampering_type']
    evidence = result['evidence']
    
    logger.critical(f"🚨 TAMPERING DETECTED: {tampering_type} in {bucket}/{key}")
    
    # 1. 即座アラート送信
    alert_message = {
        'alert_level': 'CRITICAL',
        'event_type': 'S3_FILE_TAMPERING',
        'bucket': bucket,
        'object_key': key,
        'tampering_type': tampering_type,
        'evidence': evidence,
        'detection_time': datetime.now().isoformat(),
        'original_event': event_name
    }
    
    send_alert(json.dumps(alert_message, indent=2), "CRITICAL")
    
    # 2. CloudWatch カスタムメトリクス記録
    record_tampering_metric(bucket, key, tampering_type)
    
    # 3. セキュリティ隔離（オプション）
    if tampering_type in ['CONTENT_MODIFIED', 'SUSPICIOUS_ACCESS']:
        quarantine_object(bucket, key)
    
    # 4. フォレンジック証拠保存
    preserve_forensic_evidence(bucket, key, result)

def send_alert(message: str, severity: str) -> None:
    """アラート送信（SNS + Slack）"""
    
    try:
        # SNS通知
        sns_client.publish(
            TopicArn='arn:aws:sns:region:account:s3-tampering-alerts',
            Message=message,
            Subject=f'🚨 S3 Tampering Alert - {severity}'
        )
        
        # Slack通知（Webhook）
        send_slack_alert(message, severity)
        
        logger.info("Alert sent successfully")
        
    except Exception as e:
        logger.error(f"Failed to send alert: {str(e)}")

def record_tampering_metric(bucket: str, key: str, tampering_type: str) -> None:
    """CloudWatch カスタムメトリクス記録"""
    
    try:
        cloudwatch.put_metric_data(
            Namespace='S3/TamperingDetection',
            MetricData=[
                {
                    'MetricName': 'TamperingDetected',
                    'Dimensions': [
                        {'Name': 'Bucket', 'Value': bucket},
                        {'Name': 'TamperingType', 'Value': tampering_type}
                    ],
                    'Value': 1,
                    'Unit': 'Count',
                    'Timestamp': datetime.now()
                }
            ]
        )
    except Exception as e:
        logger.error(f"Failed to record metric: {str(e)}")

def quarantine_object(bucket: str, key: str) -> None:
    """疑わしいオブジェクトの隔離"""
    
    try:
        # 隔離バケットにコピー
        quarantine_bucket = f"{bucket}-quarantine"
        quarantine_key = f"tampering-{datetime.now().strftime('%Y%m%d-%H%M%S')}/{key}"
        
        s3_client.copy_object(
            CopySource={'Bucket': bucket, 'Key': key},
            Bucket=quarantine_bucket,
            Key=quarantine_key,
            MetadataDirective='COPY'
        )
        
        # 元オブジェクトにタグ付け
        s3_client.put_object_tagging(
            Bucket=bucket,
            Key=key,
            Tagging={
                'TagSet': [
                    {'Key': 'SecurityStatus', 'Value': 'QUARANTINED'},
                    {'Key': 'DetectionTime', 'Value': datetime.now().isoformat()}
                ]
            }
        )
        
        logger.info(f"Object quarantined: {bucket}/{key} -> {quarantine_bucket}/{quarantine_key}")
        
    except Exception as e:
        logger.error(f"Failed to quarantine object: {str(e)}")

def preserve_forensic_evidence(bucket: str, key: str, result: Dict[str, Any]) -> None:
    """フォレンジック証拠の保存"""
    
    try:
        evidence_key = f"forensic-evidence/{datetime.now().strftime('%Y/%m/%d')}/{key}-evidence.json"
        
        s3_client.put_object(
            Bucket=f"{bucket}-forensics",
            Key=evidence_key,
            Body=json.dumps(result, indent=2, default=str),
            ContentType='application/json',
            Metadata={
                'evidence-type': 'tampering-detection',
                'source-bucket': bucket,
                'source-key': key
            }
        )
        
        logger.info(f"Forensic evidence preserved: {evidence_key}")
        
    except Exception as e:
        logger.error(f"Failed to preserve evidence: {str(e)}")

def is_unusual_access_pattern(bucket: str, key: str) -> bool:
    """異常なアクセスパターンの検知"""
    
    # DynamoDB等でアクセス履歴確認
    # 実装例：通常時間外、異常な頻度、未知のIPアドレスなど
    return False

def get_expected_file_size(bucket: str, key: str) -> Optional[Dict[str, int]]:
    """期待されるファイルサイズ範囲取得"""
    
    # ファイルタイプ別の期待サイズ範囲
    # 実装例：設定ファイルは1KB-10KB、ログファイルは1MB-100MBなど
    return None

def send_slack_alert(message: str, severity: str) -> None:
    """Slack アラート送信"""
    
    # Slack Webhook実装
    pass
```

---

### 🔧 **実装例2：S3 Event Notifications + 即時検証**

#### S3バケット設定
```yaml
CriticalDataBucket:
  Type: AWS::S3::Bucket
  Properties:
    BucketName: critical-data-bucket
    VersioningConfiguration:
      Status: Enabled
    NotificationConfiguration:
      LambdaConfigurations:
        - Event: "s3:ObjectCreated:*"
          Function: !GetAtt IntegrityCheckLambda.Arn
          Filter:
            S3Key:
              Rules:
                - Name: prefix
                  Value: "sensitive/"
        - Event: "s3:ObjectRemoved:*"
          Function: !GetAtt IntegrityCheckLambda.Arn
    PublicAccessBlockConfiguration:
      BlockPublicAcls: true
      BlockPublicPolicy: true
      IgnorePublicAcls: true
      RestrictPublicBuckets: true
    ObjectLockEnabled: true
    ObjectLockConfiguration:
      ObjectLockEnabled: Enabled
      Rule:
        DefaultRetention:
          Mode: COMPLIANCE
          Days: 2555  # 7年間保持
```

#### チェックサム自動計算・保存Lambda
```python
import json
import boto3
import hashlib
import logging
from datetime import datetime

def lambda_handler(event, context):
    """S3イベント即時処理とチェックサム管理"""
    
    for record in event['Records']:
        bucket = record['s3']['bucket']['name']
        key = record['s3']['object']['key']
        event_name = record['eventName']
        
        if event_name.startswith('ObjectCreated'):
            # 新規ファイルのチェックサム計算・保存
            calculate_and_store_checksum(bucket, key)
        elif event_name.startswith('ObjectRemoved'):
            # ファイル削除のアラート
            send_deletion_alert(bucket, key)

def calculate_and_store_checksum(bucket: str, key: str) -> None:
    """チェックサム計算・メタデータ保存"""
    
    try:
        s3_client = boto3.client('s3')
        
        # オブジェクト取得
        response = s3_client.get_object(Bucket=bucket, Key=key)
        content = response['Body'].read()
        
        # 複数アルゴリズムでチェックサム計算
        checksums = {
            'sha256': hashlib.sha256(content).hexdigest(),
            'sha1': hashlib.sha1(content).hexdigest(),
            'md5': hashlib.md5(content).hexdigest(),
        }
        
        # メタデータ更新
        s3_client.copy_object(
            CopySource={'Bucket': bucket, 'Key': key},
            Bucket=bucket,
            Key=key,
            Metadata={
                'original-sha256': checksums['sha256'],
                'original-sha1': checksums['sha1'],
                'original-md5': checksums['md5'],
                'checksum-timestamp': datetime.now().isoformat(),
                'original-size': str(len(content))
            },
            MetadataDirective='REPLACE'
        )
        
        # DynamoDB等に詳細情報保存
        store_integrity_record(bucket, key, checksums, len(content))
        
        logger.info(f"Checksums calculated and stored for {bucket}/{key}")
        
    except Exception as e:
        logger.error(f"Failed to calculate checksum: {str(e)}")

def store_integrity_record(bucket: str, key: str, checksums: dict, size: int) -> None:
    """整合性記録をDynamoDBに保存"""
    
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table('S3-Integrity-Records')
    
    table.put_item(
        Item={
            'bucket-key': f"{bucket}#{key}",
            'timestamp': datetime.now().isoformat(),
            'checksums': checksums,
            'original_size': size,
            'ttl': int(datetime.now().timestamp()) + (365 * 24 * 3600)  # 1年保持
        }
    )
```

---

### 🔧 **実装例3：CloudTrail + 詳細監査**

#### CloudTrail データイベント設定
```yaml
S3DataEventsTrail:
  Type: AWS::CloudTrail::Trail
  Properties:
    TrailName: S3-Critical-Data-Trail
    S3BucketName: !Ref CloudTrailBucket
    IncludeGlobalServiceEvents: true
    IsMultiRegionTrail: true
    EnableLogFileValidation: true
    EventSelectors:
      - ReadWriteType: All
        IncludeManagementEvents: true
        DataResources:
          - Type: "AWS::S3::Object"
            Values: 
              - "arn:aws:s3:::critical-data-bucket/sensitive/*"
          - Type: "AWS::S3::Bucket"
            Values:
              - "arn:aws:s3:::critical-data-bucket"
```

#### CloudTrail解析Lambda
```python
def analyze_cloudtrail_events(event, context):
    """CloudTrail S3イベント解析"""
    
    for record in event['Records']:
        # CloudTrail ログ解析
        s3_bucket = record['s3']['bucket']['name']
        log_key = record['s3']['object']['key']
        
        # ログファイル取得・解析
        cloudtrail_events = parse_cloudtrail_log(s3_bucket, log_key)
        
        for ct_event in cloudtrail_events:
            if is_suspicious_s3_activity(ct_event):
                trigger_security_response(ct_event)

def is_suspicious_s3_activity(event: dict) -> bool:
    """疑わしいS3アクティビティの判定"""
    
    suspicious_indicators = [
        # 通常時間外のアクセス
        is_unusual_time(event.get('eventTime')),
        # 未知のIPアドレス
        is_unknown_ip(event.get('sourceIPAddress')),
        # 異常な操作パターン
        is_unusual_operation_pattern(event),
        # 権限昇格の形跡
        has_privilege_escalation_signs(event)
    ]
    
    return any(suspicious_indicators)
```

---

### 📊 **統合監視ダッシュボード**

```yaml
S3IntegrityDashboard:
  Type: AWS::CloudWatch::Dashboard
  Properties:
    DashboardName: "S3-Tampering-Detection-Dashboard"
    DashboardBody: !Sub |
      {
        "widgets": [
          {
            "type": "metric",
            "x": 0, "y": 0, "width": 12, "height": 6,
            "properties": {
              "metrics": [
                ["S3/TamperingDetection", "TamperingDetected", "TamperingType", "CONTENT_MODIFIED"],
                ["S3/TamperingDetection", "TamperingDetected", "TamperingType", "FILE_DELETED"],
                ["S3/TamperingDetection", "TamperingDetected", "TamperingType", "SUSPICIOUS_ACCESS"]
              ],
              "title": "S3 Tampering Detection Events",
              "period": 300,
              "stat": "Sum",
              "region": "${AWS::Region}",
              "view": "timeSeries"
            }
          },
          {
            "type": "log",
            "x": 0, "y": 6, "width": 24, "height": 6,
            "properties": {
              "query": "SOURCE '/aws/lambda/s3-tampering-detection'\n| fields @timestamp, @message\n| filter @message like /TAMPERING DETECTED/\n| sort @timestamp desc\n| limit 50",
              "title": "Recent Tampering Detection Log Events",
              "region": "${AWS::Region}",
              "view": "table"
            }
          },
          {
            "type": "metric", 
            "x": 12, "y": 0, "width": 12, "height": 6,
            "properties": {
              "metrics": [
                ["AWS/Lambda", "Duration", "FunctionName", "S3TamperingDetection"],
                ["AWS/Lambda", "Errors", "FunctionName", "S3TamperingDetection"]
              ],
              "title": "Detection System Performance",
              "period": 300,
              "stat": "Average",
              "region": "${AWS::Region}",
              "view": "timeSeries"
            }
          }
        ]
      }
```

---

### 🚨 **アラート設定**

#### CloudWatch Alarm
```yaml
TamperingDetectionAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: "S3-File-Tampering-Alert"
    AlarmDescription: "Alert when S3 file tampering is detected"
    MetricName: "TamperingDetected"
    Namespace: "S3/TamperingDetection"
    Statistic: "Sum"
    Period: 60
    EvaluationPeriods: 1
    Threshold: 1
    ComparisonOperator: "GreaterThanOrEqualToThreshold"
    AlarmActions:
      - !Ref CriticalSecurityTopic
    TreatMissingData: "notBreaching"
```

---

### 🔒 **予防的セキュリティ対策**

#### S3 Object Lock設定
```python
def enable_object_lock_protection(bucket_name: str) -> None:
    """改ざん防止のためのObject Lock有効化"""
    
    s3_client = boto3.client('s3')
    
    # Compliance モードで改ざん完全防止
    s3_client.put_object_lock_configuration(
        Bucket=bucket_name,
        ObjectLockConfiguration={
            'ObjectLockEnabled': 'Enabled',
            'Rule': {
                'DefaultRetention': {
                    'Mode': 'COMPLIANCE',  # 削除・変更完全禁止
                    'Days': 2555  # 7年間保護
                }
            }
        }
    )
    
    # バケット政策で追加保護
    bucket_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "DenyObjectDeletion",
                "Effect": "Deny", 
                "Principal": "*",
                "Action": [
                    "s3:DeleteObject",
                    "s3:DeleteObjectVersion",
                    "s3:PutObjectRetention",
                    "s3:PutObjectLegalHold"
                ],
                "Resource": f"arn:aws:s3:::{bucket_name}/*",
                "Condition": {
                    "StringNotEquals": {
                        "aws:username": "emergency-admin"
                    }
                }
            }
        ]
    }
    
    s3_client.put_bucket_policy(
        Bucket=bucket_name,
        Policy=json.dumps(bucket_policy)
    )
```

---

### 🎯 **実装優先度**

#### 🔴 **最優先（今すぐ実装）**
1. **S3 Event Notifications + Lambda**
   - 数秒以内の検知実現
   - 実装が比較的簡単
   - 即座のアラート可能

#### 🟠 **高優先（1週間以内）**
2. **EventBridge統合**
   - より柔軟なイベントフィルタリング
   - 他AWSサービスとの連携強化

3. **Object Lock有効化**
   - 改ざん自体を防止
   - コンプライアンス要件対応

#### 🟡 **中優先（1ヶ月以内）**
4. **CloudTrail詳細監査**
   - より詳細な証跡確保
   - フォレンジック調査対応

5. **GuardDuty Malware Protection**
   - マルウェア検知との連携
   - 包括的脅威検知

---

### 💡 **ベストプラクティス**

1. **多層防御**：複数の検知手法を組み合わせる
2. **即座対応**：検知から1分以内のアラート
3. **証拠保全**：フォレンジック調査用の証拠保存
4. **隔離機能**：疑わしいファイルの自動隔離
5. **定期検証**：保存済みチェックサムとの定期比較

---

## 🏁 まとめ

### ❗ 重要なポイント

1. **全サービスでゼロデイ攻撃対策が必要**
   - Lambda以外（CloudFront、API Gateway、WAF）も攻撃対象
   - 多層防御による包括的セキュリティ実装

2. **自動化が鍵**
   - マネージドルールの自動更新
   - 脅威検出の自動対応
   - セキュリティモニタリングの自動化

3. **継続的改善**
   - 脅威インテリジェンスの定期更新
   - セキュリティ設定の定期見直し
   - インシデント対応プロセスの継続的改善

### 📞 緊急時対応

```bash
# 緊急時IP遮断
aws wafv2 update-ip-set \
    --scope CLOUDFRONT \
    --id emergency-block-set \
    --addresses 192.0.2.1/32,198.51.100.1/32

# 緊急時Lambda関数停止
aws lambda put-function-concurrency \
    --function-name critical-function \
    --reserved-concurrent-executions 0
```

---

**🛡️ あなたのAWSアーキテクチャを、ゼロデイ攻撃にも負けない堅牢なセキュリティで守りましょう！**

---

*最終更新: 2025-09-24*  
*作成者: Claude Code Security Analysis*