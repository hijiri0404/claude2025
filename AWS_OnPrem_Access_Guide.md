# 🔐 オンプレサーバからAWSへのセキュアアクセスガイド

## 📋 概要

オンプレミスサーバからAWSリソースを操作する際、長期的なアクセスキーを保存せずにセキュアにアクセスする方法を説明します。

### 🎯 IAM Role + Assume Role（シンプル構成）

```
オンプレサーバ  →  IAMユーザー  →  IAM Role  →  AWSリソース
    ↓              (初回のみ)        ↓           ↓
長期キー不要    一時的な認証     Assume Role   S3/EC2等
```

---

## 🔧 Step 1: AWS側の設定

### 1-1. Cross-Account IAM Roleの作成

**Trust Policy (trust-policy.json)**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::471112657080:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "unique-external-id-123"
        }
      }
    }
  ]
}
```

**コマンド**:
```bash
aws iam create-role \
  --role-name OnPremAccessRole \
  --assume-role-policy-document file://trust-policy.json
```

### 1-2. IAM Roleに権限ポリシーをアタッチ

**Permissions Policy (permissions-policy.json)**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject", 
        "s3:PutObject",
        "ec2:DescribeInstances",
        "ec2:StartInstances",
        "ec2:StopInstances"
      ],
      "Resource": "*"
    }
  ]
}
```

**コマンド**:
```bash
aws iam put-role-policy \
  --role-name OnPremAccessRole \
  --policy-name OnPremAccessPolicy \
  --policy-document file://permissions-policy.json
```

### 1-3. IAM Userに最小限の権限付与

**Assume Role Policy (assume-role-policy.json)**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::471112657080:role/OnPremAccessRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "unique-external-id-123"
        }
      }
    }
  ]
}
```

**コマンド**:
```bash
aws iam put-user-policy \
  --user-name M1 \
  --policy-name AssumeOnPremRole \
  --policy-document file://assume-role-policy.json
```

---

## 🚀 Step 2: オンプレサーバ側の実装

### 2-1. Assume Role実行スクリプト

**aws-assume-role.sh**:
```bash
#!/bin/bash

# AWS Assume Role スクリプト
# オンプレサーバ用のセキュアなAWS認証

set -euo pipefail

# 設定値
ROLE_ARN="arn:aws:iam::471112657080:role/OnPremAccessRole"
EXTERNAL_ID="unique-external-id-123"
SESSION_NAME="OnPrem-$(hostname)-$(date +%Y%m%d-%H%M%S)"
CREDENTIALS_FILE="$HOME/.aws-temp-credentials"

# カラー出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# AWS CLI確認
if ! command -v aws &> /dev/null; then
    log_error "AWS CLI が見つかりません。インストールしてください。"
    exit 1
fi

# IAM User認証情報確認
if [[ -z "${AWS_ACCESS_KEY_ID:-}" ]] || [[ -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
    log_error "AWS_ACCESS_KEY_ID と AWS_SECRET_ACCESS_KEY が設定されていません。"
    log_info "export AWS_ACCESS_KEY_ID=your_key"
    log_info "export AWS_SECRET_ACCESS_KEY=your_secret"
    exit 1
fi

log_info "Assume Role を実行中..."
log_info "Role ARN: $ROLE_ARN"
log_info "Session Name: $SESSION_NAME"

# Assume Role実行
ASSUME_ROLE_OUTPUT=$(aws sts assume-role \
    --role-arn "$ROLE_ARN" \
    --role-session-name "$SESSION_NAME" \
    --external-id "$EXTERNAL_ID" \
    --duration-seconds 3600 \
    --output json)

if [[ $? -ne 0 ]]; then
    log_error "Assume Role に失敗しました。"
    exit 1
fi

# 認証情報を抽出
ACCESS_KEY=$(echo "$ASSUME_ROLE_OUTPUT" | jq -r '.Credentials.AccessKeyId')
SECRET_KEY=$(echo "$ASSUME_ROLE_OUTPUT" | jq -r '.Credentials.SecretAccessKey')
SESSION_TOKEN=$(echo "$ASSUME_ROLE_OUTPUT" | jq -r '.Credentials.SessionToken')
EXPIRATION=$(echo "$ASSUME_ROLE_OUTPUT" | jq -r '.Credentials.Expiration')

# 環境変数ファイル作成
cat > "$CREDENTIALS_FILE" << EOF
# AWS Temporary Credentials
# Generated: $(date)
# Expires: $EXPIRATION
export AWS_ACCESS_KEY_ID="$ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$SECRET_KEY"
export AWS_SESSION_TOKEN="$SESSION_TOKEN"

# 元のIAMユーザー認証情報をクリア
unset AWS_ACCESS_KEY_ID_ORIG
unset AWS_SECRET_ACCESS_KEY_ORIG
EOF

# ファイル権限設定
chmod 600 "$CREDENTIALS_FILE"

log_info "一時認証情報を取得しました！"
log_info "有効期限: $EXPIRATION"
log_info ""
log_info "以下のコマンドで環境変数を設定してください:"
log_info "source $CREDENTIALS_FILE"
log_info ""
log_warn "この認証情報は1時間で期限切れになります。"
```

### 2-2. 自動更新スクリプト

**aws-credential-refresher.sh**:
```bash
#!/bin/bash

# AWS認証情報自動更新スクリプト
# cron job で定期実行用

set -euo pipefail

CREDENTIALS_FILE="$HOME/.aws-temp-credentials"
ASSUME_ROLE_SCRIPT="$(dirname "$0")/aws-assume-role.sh"
LOG_FILE="$HOME/.aws-assume-role.log"

# ログ関数
log_with_timestamp() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 認証情報の有効性確認
check_credentials() {
    if [[ -f "$CREDENTIALS_FILE" ]]; then
        source "$CREDENTIALS_FILE"
        
        # AWS CLIで簡単な確認
        if aws sts get-caller-identity >/dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

# 有効期限確認
check_expiration() {
    if [[ -f "$CREDENTIALS_FILE" ]]; then
        EXPIRATION_LINE=$(grep "Expires:" "$CREDENTIALS_FILE" | head -1)
        if [[ -n "$EXPIRATION_LINE" ]]; then
            EXPIRATION_DATE=$(echo "$EXPIRATION_LINE" | sed 's/# Expires: //')
            EXPIRATION_EPOCH=$(date -d "$EXPIRATION_DATE" +%s 2>/dev/null || echo 0)
            CURRENT_EPOCH=$(date +%s)
            
            # 10分前に更新
            REFRESH_THRESHOLD=$((CURRENT_EPOCH + 600))
            
            if [[ $EXPIRATION_EPOCH -le $REFRESH_THRESHOLD ]]; then
                return 1  # 更新が必要
            fi
        fi
    fi
    return 0  # まだ有効
}

log_with_timestamp "認証情報チェックを開始"

# 認証情報確認
if check_credentials && check_expiration; then
    log_with_timestamp "認証情報は有効です。更新不要。"
    exit 0
fi

log_with_timestamp "認証情報の更新が必要です。"

# Assume Role実行
if [[ -x "$ASSUME_ROLE_SCRIPT" ]]; then
    log_with_timestamp "Assume Role スクリプトを実行中..."
    
    if "$ASSUME_ROLE_SCRIPT" >> "$LOG_FILE" 2>&1; then
        log_with_timestamp "認証情報を正常に更新しました。"
        
        # 環境変数を現在のシェルに読み込み
        if [[ -f "$CREDENTIALS_FILE" ]]; then
            source "$CREDENTIALS_FILE"
            log_with_timestamp "環境変数を更新しました。"
        fi
    else
        log_with_timestamp "ERROR: 認証情報の更新に失敗しました。"
        exit 1
    fi
else
    log_with_timestamp "ERROR: Assume Role スクリプトが見つかりません: $ASSUME_ROLE_SCRIPT"
    exit 1
fi

log_with_timestamp "認証情報更新プロセス完了"
```

---

## ⚙️ Step 3: 運用設定

### 3-1. Cron設定（自動更新）

**crontab設定例**:
```bash
# AWS認証情報自動更新
# 50分ごとに実行（1時間有効期限の10分前に更新）
*/50 * * * * /path/to/aws-credential-refresher.sh >/dev/null 2>&1

# 毎日午前6時にログをローテーション
0 6 * * * mv $HOME/.aws-assume-role.log $HOME/.aws-assume-role.log.$(date +%Y%m%d) && touch $HOME/.aws-assume-role.log

# 7日前のログを削除
0 7 * * * find $HOME -name ".aws-assume-role.log.*" -mtime +7 -delete
```

### 3-2. Systemdサービス設定

**aws-credentials.service**:
```ini
[Unit]
Description=AWS Credentials Refresher
After=network.target

[Service]
Type=oneshot
User=your_user
Environment=AWS_ACCESS_KEY_ID=AKIA...
Environment=AWS_SECRET_ACCESS_KEY=your_secret
Environment=AWS_DEFAULT_REGION=ap-northeast-1
ExecStart=/path/to/aws-credential-refresher.sh
StandardOutput=append:/var/log/aws-credentials.log
StandardError=append:/var/log/aws-credentials.log

[Install]
WantedBy=multi-user.target
```

**aws-credentials.timer**:
```ini
[Unit]
Description=AWS Credentials Refresher Timer
Requires=aws-credentials.service

[Timer]
OnBootSec=5min
OnUnitActiveSec=50min
Unit=aws-credentials.service

[Install]
WantedBy=timers.target
```

---

## 🔍 Step 4: テスト・検証

### 4-1. 動作テストスクリプト

**test-aws-access.sh**:
```bash
#!/bin/bash

# AWS アクセステストスクリプト

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    if [[ $1 -eq 0 ]]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
    fi
}

echo "========================================="
echo "AWS Access Test Suite"
echo "========================================="

# 1. 認証情報確認
echo -e "\n${YELLOW}1. 認証情報確認${NC}"
if aws sts get-caller-identity >/dev/null 2>&1; then
    IDENTITY=$(aws sts get-caller-identity --output text)
    echo "現在のID: $IDENTITY"
    print_status 0 "認証情報が有効"
else
    print_status 1 "認証情報が無効"
    echo "以下を確認してください:"
    echo "source ~/.aws-temp-credentials"
    exit 1
fi

# 2. Role確認
echo -e "\n${YELLOW}2. Role権限確認${NC}"
CURRENT_ARN=$(aws sts get-caller-identity --query 'Arn' --output text)
if [[ "$CURRENT_ARN" == *"role/OnPremAccessRole"* ]]; then
    print_status 0 "正しいRoleでアクセス中"
else
    print_status 1 "想定外のRoleまたはUser"
    echo "現在のARN: $CURRENT_ARN"
fi

# 3. S3アクセステスト
echo -e "\n${YELLOW}3. S3アクセステスト${NC}"
if aws s3 ls >/dev/null 2>&1; then
    BUCKET_COUNT=$(aws s3 ls | wc -l)
    print_status 0 "S3バケット一覧取得成功 ($BUCKET_COUNT buckets)"
else
    print_status 1 "S3バケット一覧取得失敗"
fi

# 4. EC2アクセステスト
echo -e "\n${YELLOW}4. EC2アクセステスト${NC}"
if aws ec2 describe-instances >/dev/null 2>&1; then
    INSTANCE_COUNT=$(aws ec2 describe-instances --query 'Reservations[*].Instances[*]' --output text | wc -l)
    print_status 0 "EC2インスタンス情報取得成功 ($INSTANCE_COUNT instances)"
else
    print_status 1 "EC2インスタンス情報取得失敗"
fi

# 5. セッション有効期限確認
echo -e "\n${YELLOW}5. セッション有効期限${NC}"
if [[ -f "$HOME/.aws-temp-credentials" ]]; then
    EXPIRATION_LINE=$(grep "Expires:" "$HOME/.aws-temp-credentials" | head -1)
    if [[ -n "$EXPIRATION_LINE" ]]; then
        EXPIRATION_DATE=$(echo "$EXPIRATION_LINE" | sed 's/# Expires: //')
        echo "有効期限: $EXPIRATION_DATE"
        
        EXPIRATION_EPOCH=$(date -d "$EXPIRATION_DATE" +%s 2>/dev/null || echo 0)
        CURRENT_EPOCH=$(date +%s)
        REMAINING=$((EXPIRATION_EPOCH - CURRENT_EPOCH))
        
        if [[ $REMAINING -gt 0 ]]; then
            print_status 0 "セッション有効 (残り${REMAINING}秒)"
        else
            print_status 1 "セッション期限切れ"
        fi
    fi
else
    print_status 1 "認証情報ファイルが見つかりません"
fi

echo -e "\n========================================="
echo "テスト完了"
echo "========================================="
```

---

## 🛠️ 使用手順（実践編）

### 初回セットアップ
```bash
# 1. IAM User認証情報設定（一度だけ）
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="your_secret"

# 2. Assume Role実行
./aws-assume-role.sh

# 3. 一時認証情報読み込み
source ~/.aws-temp-credentials

# 4. 動作確認
./test-aws-access.sh
```

### 日常運用
```bash
# 認証情報の状態確認
./test-aws-access.sh

# 手動更新（必要に応じて）
./aws-credential-refresher.sh

# AWSコマンド実行
aws s3 ls
aws ec2 describe-instances
```

---

## 🛡️ セキュリティ考慮事項

### ✅ セキュリティメリット

1. **長期認証情報不要**: オンプレサーバにアクセスキーを保存不要
2. **一時的な認証**: 1時間で自動失効する一時認証情報
3. **External ID**: 追加のセキュリティ層
4. **監査対応**: CloudTrailで全ての操作をログ記録
5. **最小権限原則**: 必要な権限のみ付与

### 🔒 追加セキュリティ設定

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "unique-external-id"
        },
        "IpAddress": {
          "aws:SourceIp": "203.0.113.0/24"
        },
        "Bool": {
          "aws:MultiFactorAuthPresent": "true"
        }
      }
    }
  ]
}
```

---

## 🚨 トラブルシューティング

### よくあるエラーと対処法

| エラー | 原因 | 対処法 |
|--------|------|--------|
| `AccessDenied` | External ID不一致 | External IDを確認 |
| `InvalidUserID.NotFound` | アカウントID間違い | Trust Policyのアカウント確認 |
| `TokenRefreshRequired` | セッション期限切れ | `aws-assume-role.sh`を再実行 |
| `UnauthorizedOperation` | 権限不足 | Permissions Policyを確認 |

### デバッグコマンド
```bash
# 現在の認証情報確認
aws sts get-caller-identity

# Role情報確認  
aws iam get-role --role-name OnPremAccessRole

# セッション詳細確認
aws sts get-session-token --duration-seconds 3600
```

---

## 🌟 まとめ

この設定により、オンプレミスサーバからAWSリソースへ**長期的なアクセスキーを保存することなく**セキュアにアクセスできます。

**主要なメリット**:
- ✅ セキュリティ向上（一時認証情報のみ使用）
- ✅ 運用効率化（自動更新機能）
- ✅ 監査対応（CloudTrail連携）
- ✅ 障害対応（詳細なログ出力）

**運用のコツ**:
1. 定期的なテスト実行でヘルスチェック
2. ログの監視による異常検出
3. 権限の定期的な見直し
4. External IDの定期的な変更

この構成で、セキュリティと利便性を両立したAWS環境へのアクセスが実現できます！✨