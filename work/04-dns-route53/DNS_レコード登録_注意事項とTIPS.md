# DNS レコード登録の注意事項と実践TIPS

## 📋 概要
DNSレコードを適切に設定することは、Webサイトやメールシステムの正常な運用、セキュリティ強化、そして高い到達性の確保に不可欠です。本ドキュメントでは、DNS設定における重要な注意事項とベストプラクティスをまとめています。

---

## 🎯 主要な注意事項

### 1. メール送信システムにおける認証設定（SPF/DKIM/DMARC）

#### 📧 なぜ必要か
メール送信を行うシステムでは、メール認証レコードの設定が**必須**です。これらの設定がない場合、送信したメールがスパムフォルダに振り分けられたり、受信拒否される可能性が高くなります。

#### 必須となる認証レコード

##### SPF (Sender Policy Framework)
- **役割**: メール送信を許可するサーバーのIPアドレスやドメインを明示
- **レコードタイプ**: TXT
- **設定例**:
  ```
  v=spf1 ip4:192.0.2.0/24 include:_spf.example.com ~all
  ```
- **注意点**:
  - DNS参照回数は10回まで（include、redirect、mx、a、ptrの合計）
  - 複数のSPFレコードを作成しない（無効になる）
  - ~all（ソフトフェイル）か -all（ハードフェイル）を末尾に設定

##### DKIM (DomainKeys Identified Mail)
- **役割**: メールに電子署名を付与し、改ざんされていないことを証明
- **レコードタイプ**: TXT
- **設定例**:
  ```
  selector._domainkey.example.com TXT "v=DKIM1; k=rsa; p=MIGfMA0GCS..."
  ```
- **注意点**:
  - セレクター名は任意だが、メール送信サービスの指示に従う
  - 公開鍵は送信サービスから提供される
  - 鍵長は1024ビット以上推奨（2048ビット推奨）

##### DMARC (Domain-based Message Authentication, Reporting & Conformance)
- **役割**: SPFとDKIMの認証結果をどう扱うかのポリシーを定義
- **レコードタイプ**: TXT
- **設定例**:
  ```
  _dmarc.example.com TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@example.com"
  ```
- **注意点**:
  - 初期は p=none で運用し、レポートを確認してから厳格化
  - p=quarantine（隔離）→ p=reject（拒否）と段階的に強化
  - ruaで集計レポート、rufで認証失敗レポートの送信先を指定

#### ✅ チェックリスト
- [ ] SPFレコードを設定し、DNS参照回数が10回以内であることを確認
- [ ] DKIMレコードを設定し、公開鍵が正しく登録されていることを確認
- [ ] DMARCレコードを設定し、レポート送信先メールアドレスを確認
- [ ] テストメールを送信し、認証が成功していることを確認

---

### 2. CNAMEレコードの制約と回避策

#### 🚫 CNAMEレコードの重要な制約

##### 制約1: Zone Apex（ドメイン頂点）に設定不可
- **問題**: `example.com` のような Zone Apex には CNAME レコードを作成できない
- **理由**: DNS仕様（RFC 1034）により、Zone Apexには必ずSOAとNSレコードが必要。CNAMEは他のレコードタイプと共存できないため、設定が不可能

**❌ 設定不可の例**:
```
example.com.  CNAME  target.example.net.
```

##### 制約2: 他のレコードタイプとの共存不可
- **問題**: 同じ名前でCNAMEと他のレコードタイプ（A, MX, TXT等）を共存させることができない

**❌ 設定不可の例**:
```
www.example.com.  CNAME  target.cloudfront.net.
www.example.com.  TXT    "v=spf1 include:_spf.example.com ~all"  ← これは設定できない
```

**✅ 正しい設定例**（メールとWebを分離）:
```
# Webサイト用
www.example.com.   CNAME  d111111abcdef8.cloudfront.net.

# メール用（別のサブドメイン）
mail.example.com.  A      192.0.2.1
example.com.       MX 10  mail.example.com.
example.com.       TXT    "v=spf1 include:_spf.example.com ~all"
```

#### 💡 回避策

##### 解決策1: AWS Alias レコードの活用（Route 53利用時）
AWS Route 53では、Aliasレコードを使用することでCNAMEの制約を回避できます。

**Aliasレコードの利点**:
- Zone Apexに設定可能
- 他のレコードタイプと共存可能
- クエリ料金が無料（CNAMEは有料）
- 自動的にIPアドレス変更を追跡

**対応するAWSリソース**:
- CloudFront ディストリビューション
- S3 バケット（静的Webサイト）
- Application/Network/Classic Load Balancer
- API Gateway
- Elastic Beanstalk 環境
- Global Accelerator

**設定例**:
```
# Zone Apexへの設定も可能
example.com.  A  ALIAS  d111111abcdef8.cloudfront.net.

# 他のレコードタイプとも共存可能
example.com.  MX 10  mail.example.com.
example.com.  TXT    "v=spf1 include:_spf.example.com ~all"
```

##### 解決策2: ドメイン分離戦略
Webサイトとメールで異なるドメイン/サブドメインを使用します。

**推奨パターン**:
```
# パターン1: wwwサブドメインをWebサイトに
www.example.com.   CNAME  target.cloudfront.net.
example.com.       MX 10  mail.example.com.
example.com.       TXT    "v=spf1 include:_spf.example.com ~all"

# パターン2: mailサブドメインをメールに
example.com.       A      192.0.2.1  (Webサイト)
mail.example.com.  A      192.0.2.2
example.com.       MX 10  mail.example.com.
mail.example.com.  TXT    "v=spf1 include:_spf.example.com ~all"
```

#### ✅ チェックリスト
- [ ] Zone ApexにCNAMEを設定していないことを確認
- [ ] CNAMEと他のレコードタイプが同じ名前で共存していないことを確認
- [ ] AWS利用時はAliasレコードの使用を検討
- [ ] Webとメールでドメインまたはサブドメインを分離

---

## 📚 その他の重要なTIPS

### 3. TTL（Time To Live）の適切な設定

#### ⏱️ TTLとは
DNSキャッシュの有効期間を秒単位で指定します。短すぎるとDNSサーバーへの問い合わせが増加し、長すぎると変更が反映されるまでに時間がかかります。

#### 推奨値
- **本番環境（安定稼働時）**: 86400秒（24時間）
- **移行期間・変更予定時**: 300-900秒（5-15分）
- **開発・テスト環境**: 60-300秒（1-5分）

#### 変更時のベストプラクティス
1. 変更予定の24-48時間前にTTLを短く設定（例: 300秒）
2. DNS変更を実施
3. 旧TTLの期間待機（変更前のTTLが24時間なら24時間待つ）
4. 問題なければTTLを元の値に戻す

---

### 4. MXレコードの優先度設定

#### 📨 複数のメールサーバー設定
MXレコードは優先度（プリファレンス値）を持ち、小さい数値ほど優先度が高くなります。

**設定例**:
```
example.com.  MX 10  mail1.example.com.  (プライマリ)
example.com.  MX 20  mail2.example.com.  (セカンダリ)
example.com.  MX 30  mail3.example.com.  (ターシャリ)
```

#### 注意点
- 同じ優先度を複数設定すると負荷分散される（ラウンドロビン）
- 優先度は0-65535の範囲（通常10, 20, 30...と10刻みで設定）
- MXレコードのターゲットはIPアドレスではなくホスト名を指定

---

### 5. CAA (Certificate Authority Authorization) レコード

#### 🔒 証明書発行の制御
CAAレコードを設定することで、どの認証局がSSL/TLS証明書を発行できるかを制御できます。

**設定例**:
```
# AWS Certificate Manager（ACM）のみ許可
example.com.  CAA  0 issue "amazon.com"
example.com.  CAA  0 issue "amazontrust.com"
example.com.  CAA  0 issue "awstrust.com"
example.com.  CAA  0 issue "amazonaws.com"

# ワイルドカード証明書も許可する場合
example.com.  CAA  0 issuewild "amazon.com"

# すべての証明書発行を禁止
example.com.  CAA  0 issue ";"
```

#### 注意点
- CAAレコードとCNAMEは共存できない
- サブドメインにCAAレコードがない場合、親ドメインのCAAレコードが適用される
- 証明書更新時に問題が起きないよう、必要な認証局すべてを設定

---

### 6. NSレコードとSOAレコードの管理

#### ⚠️ 手動変更は原則不要
- **NSレコード**: ネームサーバーを指定。ドメイン登録業者やDNSホスティングサービスが自動設定
- **SOAレコード**: ゾーン情報を管理。通常は自動設定される

#### 変更が必要なケース
- DNSサービスプロバイダーの移行時
- 権威DNSサーバーの追加・変更時

#### 注意点
- NSレコードの変更は慎重に（誤るとドメイン全体がアクセス不能に）
- SOAレコードのシリアル番号は自動増加させる
- 親ゾーンとの整合性を保つ

---

### 7. ワイルドカードレコードの活用と注意

#### 🌟 ワイルドカードレコードとは
`*.example.com` のように、存在しないすべてのサブドメインに適用されるレコード。

**設定例**:
```
*.example.com.  A  192.0.2.1
```

**マッチング動作**:
- `anything.example.com` → 192.0.2.1（マッチ）
- `test.example.com` → 192.0.2.1（マッチ）
- `example.com` → マッチしない（ワイルドカードは1階層のみ）
- `sub.test.example.com` → マッチしない（2階層以上）

#### 注意点
- より具体的なレコードが存在する場合、そちらが優先される
- セキュリティリスク: 意図しないサブドメインもマッチする可能性
- 用途: 開発環境、動的サブドメイン生成システムなど

---

### 8. IPv6対応（AAAAレコード）

#### 🌐 デュアルスタック構成の推奨
IPv4（Aレコード）とIPv6（AAAAレコード）の両方を設定することが推奨されます。

**設定例**:
```
example.com.  A     192.0.2.1
example.com.  AAAA  2001:0db8:85a3:0:0:8a2e:0370:7334
```

#### 注意点
- AAAAレコードのみだとIPv4ユーザーがアクセスできない
- Aレコードのみだと将来的にIPv6ユーザーがアクセスできない可能性
- 両方設定することでより広範なユーザーに対応

---

### 9. TXTレコードの長さ制限

#### 📏 文字列長の制限
- 1つのTXTレコード値は255文字まで
- 255文字を超える場合は複数の文字列に分割して記述

**長い文字列の設定例**:
```
example.com.  TXT  "v=spf1 include:_spf1.example.com include:_spf2.example.com"
                   "include:_spf3.example.com include:_spf4.example.com ~all"
```

#### 用途
- SPFレコード
- DKIMレコード
- ドメイン所有権の確認（Google Search Console、Microsoft 365等）
- DMARC レポート設定

---

### 10. DNSプロパゲーション（伝播）時間

#### ⏰ 変更が反映されるまでの時間
DNS変更は即座には反映されず、TTLに応じて段階的に世界中に伝播します。

#### 確認方法
```bash
# 特定のDNSサーバーでの解決結果を確認
dig @8.8.8.8 example.com
dig @1.1.1.1 example.com

# 複数地点からの確認（Webツール）
# - https://www.whatsmydns.net/
# - https://dnschecker.org/
```

#### 注意点
- TTLが長いほど伝播に時間がかかる
- 重要な変更の前は事前にTTLを短縮
- ブラウザやOSのDNSキャッシュもクリアが必要な場合あり

---

## 🔍 検証とトラブルシューティング

### DNSレコードの確認コマンド

```bash
# 基本的な名前解決
dig example.com

# 特定のレコードタイプを確認
dig example.com A
dig example.com MX
dig example.com TXT
dig example.com AAAA

# トレース（ルートDNSから順に確認）
dig +trace example.com

# 特定のネームサーバーに問い合わせ
dig @ns1.example.com example.com

# SPFレコードの確認
dig example.com TXT | grep spf

# DMARCレコードの確認
dig _dmarc.example.com TXT
```

### よくあるトラブルと対処法

| 問題 | 原因 | 対処法 |
|------|------|--------|
| メールが届かない | SPF/DKIM/DMARECの設定不足 | 認証レコードを設定し、テストメール送信で確認 |
| Zone ApexでCNAME設定エラー | DNS仕様の制約 | Aliasレコード使用 or wwwサブドメインに変更 |
| DNS変更が反映されない | TTLによるキャッシュ | TTL期間待機 or DNSキャッシュクリア |
| SSL証明書が発行されない | CAAレコードで認証局がブロックされている | CAAレコードを確認・修正 |
| サブドメインが解決されない | NSレコードの委任設定ミス | 親ゾーンのNSレコードを確認 |

---

## 📋 DNS設定前のチェックリスト

### 基本設定
- [ ] 正しいレコードタイプを選択している
- [ ] 完全修飾ドメイン名（FQDN）を使用している
- [ ] TTL値を適切に設定している
- [ ] レコード値に誤字・脱字がない

### メール送信システム
- [ ] MXレコードが設定されている
- [ ] SPFレコードが設定されている
- [ ] DKIMレコードが設定されている
- [ ] DMARCレコードが設定されている（段階的なポリシー強化計画あり）

### CNAME関連
- [ ] Zone ApexにCNAMEを設定していない
- [ ] CNAMEと他のレコードタイプを同じ名前で設定していない
- [ ] AWS利用時はAliasレコードの活用を検討している

### セキュリティ
- [ ] CAAレコードで証明書発行を適切に制御している
- [ ] 不要なワイルドカードレコードがない
- [ ] DNSSECの有効化を検討している（該当する場合）

### 変更管理
- [ ] 変更前のレコード情報をバックアップしている
- [ ] 重要な変更前にTTLを短縮している
- [ ] 変更後の検証手順を準備している
- [ ] ロールバック手順を用意している

---

## 🎯 まとめ

DNSレコードの適切な設定は、システムの可用性、セキュリティ、パフォーマンスに直結する重要な要素です。特に以下の点に注意してください：

1. **メール送信システムでは SPF/DKIM/DMARC を必ず設定**
2. **CNAMEレコードの制約を理解し、適切な回避策を選択**
3. **Zone ApexではAWSのAliasレコードを活用**
4. **TTL値を戦略的に設定し、変更時は事前に短縮**
5. **変更前後の検証とバックアップを徹底**

これらのベストプラクティスに従うことで、安定したDNS運用が実現できます。

---

## 📚 参考リンク

- [AWS Route 53 - Supported DNS record types](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/ResourceRecordTypes.html)
- [AWS SES - Email authentication methods](https://docs.aws.amazon.com/ses/latest/dg/email-authentication-methods.html)
- [AWS Route 53 - Choosing between alias and non-alias records](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-choosing-alias-non-alias.html)
- [RFC 1034 - Domain Names - Concepts and Facilities](https://tools.ietf.org/html/rfc1034)
- [RFC 7208 - Sender Policy Framework (SPF)](https://tools.ietf.org/html/rfc7208)
- [RFC 6376 - DomainKeys Identified Mail (DKIM)](https://tools.ietf.org/html/rfc6376)
- [RFC 7489 - Domain-based Message Authentication, Reporting, and Conformance (DMARC)](https://tools.ietf.org/html/rfc7489)

---

**作成日**: 2025-12-23
**最終更新**: 2025-12-23
