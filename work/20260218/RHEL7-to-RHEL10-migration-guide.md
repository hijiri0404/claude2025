# RHEL7 → RHEL10 エンジニア向け学習教材
## 〜 変化点を徹底解説・コマンドリファレンス付き 〜

**対象者**: RHEL7 の実務経験があり、RHEL10 へ移行するエンジニア
**作成日**: 2026-02-18
**対象バージョン**: RHEL 7 (kernel 3.10) → RHEL 10 (kernel 6.12 LTS)

---

## 目次

1. [RHEL バージョン系譜と主要変化の概観](#1-rhel-バージョン系譜と主要変化の概観)
2. [パッケージ管理: yum → dnf](#2-パッケージ管理-yum--dnf)
3. [ネットワーク管理の変化](#3-ネットワーク管理の変化)
4. [ファイアウォール管理: firewalld の進化](#4-ファイアウォール管理-firewalld-の進化)
5. [systemd の進化と新機能](#5-systemd-の進化と新機能)
6. [cgroups v1 から v2 への完全移行](#6-cgroups-v1-から-v2-への完全移行)
7. [セキュリティ: SELinux の強化](#7-セキュリティ-selinux-の強化)
8. [コンテナ技術: Docker → Podman](#8-コンテナ技術-docker--podman)
9. [ストレージ管理の変化](#9-ストレージ管理の変化)
10. [カーネル 6.12 の新機能](#10-カーネル-612-の新機能)
11. [削除・廃止された機能一覧](#11-削除廃止された機能一覧)
12. [移行チェックリスト](#12-移行チェックリスト)

---

## 1. RHEL バージョン系譜と主要変化の概観

### バージョン比較表

| 項目 | RHEL 7 | RHEL 8 | RHEL 9 | RHEL 10 |
|------|--------|--------|--------|---------|
| リリース | 2014年 | 2019年 | 2022年 | 2025年5月 |
| カーネル | 3.10 | 4.18 | 5.14 | 6.12 LTS |
| systemd | 208→219 | 239 | 250 | 256+ |
| cgroups | v1 のみ | v1+v2 | v2 デフォルト | v2 のみ |
| パッケージ管理 | yum v3 | dnf (yum はエイリアス) | dnf (yum 非推奨) | dnf のみ |
| コンテナ | Docker | Podman/Buildah | Podman 4.x | Podman 5.x |
| ネットワーク設定ファイル | ifcfg-* | ifcfg-* | .nmconnection | .nmconnection |
| 暗号化基準 | 旧来 | SHA-1 廃止 | TLS 1.3 | 耐量子暗号 + FIPS |

### RHEL10 のコードネームと特徴

```
RHEL 10 コードネーム: "Coughlan"
リリース日          : 2025年5月20日 (Red Hat Summit)
カーネルバージョン  : Linux 6.12.0-55.9.1.el10_0
アーキテクチャ対象  : x86-64-v3 (旧世代 CPU では動作不可の場合あり)
```

> **注意**: RHEL 10 は x86-64-v3 マイクロアーキテクチャを対象としています。
> 古い CPU (Sandy Bridge 世代以前など) では動作しない場合があります。
> 移行前に必ず CPU 互換性を確認してください。

---

## 2. パッケージ管理: yum → dnf

### 背景と変化の理由

RHEL 7 で使用していた `yum` (Yellowdog Updater Modified v3) は以下の問題を抱えていました。

- **メモリ使用量が多い**: 依存関係解決時に大量メモリを消費
- **依存関係解決が遅い**: libsolv を使用していないため非効率
- **モジュール非対応**: 同一パッケージの複数バージョン管理ができない
- **Python API の不安定性**: プラグイン開発が困難

DNF (Dandified YUM) は libsolv を採用し、これらの問題を解決しました。

### 移行の段階

```
RHEL 7: yum v3 (本物の yum)
RHEL 8: yum v4 = DNF の内部実装 (yum コマンドは dnf へのエイリアス)
RHEL 9: yum 非推奨 (コマンドは動くが警告が出る)
RHEL 10: dnf が唯一の標準 (yum の完全廃止)
```

### 基本コマンド比較

#### パッケージのインストール

```bash
# RHEL 7 (yum)
yum install httpd

# RHEL 10 (dnf) - 構文は同じだが dnf を使用する
dnf install httpd
# インストール対象のパッケージとその依存関係を表示した後、
# y/N の確認を求めます。-y オプションで自動確認が可能です。

dnf install -y httpd
# -y: すべての確認に自動的に「yes」と回答します。
#     スクリプト自動化時に必ず指定してください。
```

#### パッケージの削除

```bash
# RHEL 7
yum remove httpd

# RHEL 10
dnf remove httpd
# パッケージを削除します。依存するパッケージも表示されます。

dnf autoremove
# 他のパッケージに依存されなくなった「孤立パッケージ」を自動削除します。
# yum の "yum autoremove" と同様の機能です。
```

#### システムアップデート

```bash
# RHEL 7
yum update
yum update httpd       # 特定パッケージのみ更新

# RHEL 10
dnf update             # 全パッケージを最新に更新 (check-update → 更新の流れ)
dnf upgrade            # dnf update と同義。こちらが推奨表記です。
dnf upgrade httpd      # 特定パッケージのみ更新

dnf check-update
# 更新可能なパッケージの一覧を表示します (実際の更新は行いません)。
# 戻り値: 更新あり=100、更新なし=0 (スクリプトで活用可能)
```

#### パッケージの検索

```bash
# RHEL 7
yum search nginx
yum info nginx

# RHEL 10
dnf search nginx
# パッケージ名と概要を検索します。キーワードは部分一致です。

dnf info nginx
# パッケージの詳細情報を表示します:
# - バージョン、アーキテクチャ
# - インストールサイズ
# - ライセンス
# - 依存パッケージ
# - 概要・説明文

dnf search --all nginx
# パッケージ名・概要・説明すべてを対象に検索します。
# より広範な検索が必要な場合に使用します。
```

#### ファイルからパッケージを特定

```bash
# RHEL 7
yum provides /usr/bin/python3

# RHEL 10
dnf provides /usr/bin/python3
# 指定したファイルパスまたはコマンドを提供するパッケージを特定します。
# 「このコマンドはどのパッケージに含まれているか？」を調べる際に使用します。

dnf repoquery --file /usr/bin/python3
# provides と同様ですが、repoquery はリポジトリ内を検索します。
# インストール済みでないパッケージも対象にできます。
```

#### インストール済みパッケージの確認

```bash
# RHEL 7
yum list installed
rpm -qa

# RHEL 10
dnf list installed
# インストール済みパッケージの一覧を表示します。
# "リポジトリ名" 列が "@System" のものがインストール済みです。

dnf list installed | grep httpd
# grep と組み合わせて特定パッケージを確認します。

dnf history
# パッケージ管理操作の履歴を表示します。
# RHEL 7の /var/log/yum.log に相当する機能です (RHEL 10では /var/log/dnf.rpm.log)。

dnf history info 5
# 履歴の特定トランザクション (番号5) の詳細を表示します。
# インストール・削除された全パッケージが確認できます。

dnf history undo 5
# 指定したトランザクションを取り消します (ロールバック機能)。
# 誤ってパッケージを削除した場合などに使用します。
```

### DNF モジュール (RHEL 7 には存在しない新機能)

```bash
# モジュールストリームの確認
dnf module list
# 利用可能なモジュールとそのストリーム (バージョン系列) を一覧表示します。
# 例: nodejs:18, nodejs:20 など複数バージョンが選択可能です。

dnf module list nodejs
# nodejs モジュールのみ表示します。
# "d" マークがデフォルトストリーム、"[e]" が有効化済みを示します。

dnf module enable nodejs:20
# nodejs のバージョン 20 ストリームを有効化します。
# 有効化後に dnf install nodejs でバージョン 20 がインストールされます。

dnf module install nodejs:20
# モジュールの有効化とインストールを同時に行います。

dnf module info nodejs
# モジュールの詳細情報 (含まれるパッケージ、プロファイル等) を表示します。

dnf module reset nodejs
# モジュールのストリーム選択をリセットします。
# 別のストリームに切り替える前に実行します。
```

### ログファイルの変化

```bash
# RHEL 7 のログ場所
cat /var/log/yum.log

# RHEL 10 のログ場所
cat /var/log/dnf.log        # DNF の操作ログ (一般的な操作)
cat /var/log/dnf.rpm.log    # RPM レベルの詳細ログ (インストール・削除の詳細)
cat /var/log/dnf.librepo.log # リポジトリ接続に関するログ
```

---

## 3. ネットワーク管理の変化

### 大きな変化点の概要

| 項目 | RHEL 7 | RHEL 10 |
|------|--------|---------|
| 設定ファイル | `/etc/sysconfig/network-scripts/ifcfg-*` | `/etc/NetworkManager/system-connections/*.nmconnection` |
| ifup/ifdown コマンド | 利用可能 | **削除** (nmcli で代替) |
| NetworkManager | デフォルト (無効化可) | **必須** (無効化不可) |
| ネットワークサービス | `network.service` も利用可 | NetworkManager のみ |

### 設定ファイルの比較

#### RHEL 7 の設定ファイル例 (`/etc/sysconfig/network-scripts/ifcfg-eth0`)

```ini
TYPE=Ethernet
BOOTPROTO=none
NAME=eth0
DEVICE=eth0
ONBOOT=yes
IPADDR=192.168.1.100
PREFIX=24
GATEWAY=192.168.1.1
DNS1=8.8.8.8
```

#### RHEL 10 の設定ファイル例 (`/etc/NetworkManager/system-connections/eth0.nmconnection`)

```ini
[connection]
id=eth0
type=ethernet
interface-name=eth0
autoconnect=true

[ethernet]

[ipv4]
method=manual
addresses=192.168.1.100/24
gateway=192.168.1.1
dns=8.8.8.8;

[ipv6]
method=auto
```

> **注意**: `.nmconnection` ファイルはパーミッション `600` が必要です。
> `chmod 600 /etc/NetworkManager/system-connections/eth0.nmconnection`

### nmcli コマンド詳解

#### 接続の確認

```bash
# RHEL 7 での確認
ifconfig
ip addr show
cat /etc/sysconfig/network-scripts/ifcfg-eth0

# RHEL 10 での確認
nmcli connection show
# すべてのネットワーク接続の一覧を表示します。
# NAME: 接続名, UUID: 一意識別子, TYPE: 接続タイプ, DEVICE: デバイス名

nmcli connection show eth0
# 特定の接続の詳細設定を表示します。
# すべての設定項目 (IP, DNS, ゲートウェイ等) を確認できます。

nmcli device status
# ネットワークデバイスの状態を表示します。
# connected/disconnected/unmanaged などのステータスが確認できます。

nmcli device show eth0
# 特定デバイスの詳細情報 (IPアドレス、MACアドレス、速度等) を表示します。

ip addr show
# ip コマンドは RHEL 7 同様に使用できます (ifconfig の後継)。
# eth0 が enp3s0 のような名前になっている場合は Predictable Network Interface Names 参照。
```

#### 接続の起動・停止

```bash
# RHEL 7 (ifup/ifdown - RHEL 10 では削除)
ifup eth0
ifdown eth0

# RHEL 10 (nmcli を使用)
nmcli connection up eth0
# 指定した接続を有効化します。
# 接続名 (NAME列の値) または UUID を指定します。

nmcli connection down eth0
# 指定した接続を無効化します。
# 注意: 接続名はデバイス名と異なる場合があります。
#       nmcli connection show で事前に確認してください。

nmcli device connect enp3s0
# デバイス名で接続を有効化します (接続名ではなくデバイス名を指定)。

nmcli device disconnect enp3s0
# デバイス名で接続を無効化します。
```

#### IP アドレスの設定

```bash
# RHEL 7 (一時的な設定)
ifconfig eth0 192.168.1.100 netmask 255.255.255.0

# RHEL 10 (nmcli で設定 - 再起動後も維持される)
nmcli connection modify eth0 ipv4.addresses 192.168.1.100/24
# 接続の IPv4 アドレスを設定します。
# CIDR 形式 (アドレス/プレフィックス長) で指定します。

nmcli connection modify eth0 ipv4.gateway 192.168.1.1
# デフォルトゲートウェイを設定します。

nmcli connection modify eth0 ipv4.dns "8.8.8.8 8.8.4.4"
# DNS サーバを設定します。複数指定はスペース区切りです。

nmcli connection modify eth0 ipv4.method manual
# IP 取得方法を手動 (static) に設定します。
# manual: 静的IP, auto: DHCP, disabled: IPv4 無効

nmcli connection up eth0
# 設定変更を適用するために接続を再起動します。
# (modify コマンド後は必ず up コマンドで適用が必要です)
```

#### 新しい接続の作成

```bash
# 静的 IP の Ethernet 接続を作成
nmcli connection add \
  type ethernet \
  con-name "本番NIC" \
  ifname eth0 \
  ipv4.method manual \
  ipv4.addresses 10.0.0.100/24 \
  ipv4.gateway 10.0.0.1 \
  ipv4.dns "10.0.0.53"
# type ethernet  : 接続タイプを Ethernet に指定
# con-name       : 接続の論理名 (任意の名前)
# ifname         : 対応するネットワークインターフェース名
# ipv4.addresses : IPアドレスとサブネットマスク (CIDR形式)
# ipv4.gateway   : デフォルトゲートウェイ
# ipv4.dns       : DNS サーバ

# DHCP 接続を作成
nmcli connection add \
  type ethernet \
  con-name "dhcp-eth0" \
  ifname eth0 \
  ipv4.method auto
# ipv4.method auto: DHCP で自動取得します。
```

#### ネットワーク設定のリロード

```bash
# RHEL 7
service network restart
# または
systemctl restart network

# RHEL 10 (NetworkManager のリロード)
nmcli connection reload
# 設定ファイル (.nmconnection) を再読み込みします。
# サービスの再起動なしに設定を反映できます。

systemctl restart NetworkManager
# NetworkManager サービス自体を再起動します。
# reload で反映できない場合に使用しますが、
# 一瞬ネットワークが切断されるため注意が必要です。
```

#### Predictable Network Interface Names (予測可能なインターフェース名)

```bash
# RHEL 7 では eth0, eth1 などの名前が使われていた
# RHEL 7 以降 (RHEL 10 含む) では Predictable Network Interface Names が標準

# 命名規則の例:
# enp3s0  : PCI バス 3, スロット 0 の Ethernet
# ens33   : PCI スロット 33 の Ethernet
# eno1    : オンボード Ethernet デバイス 1
# enx001122334455: MACアドレス ベースの名前

ip link show
# 現在のインターフェース名と状態を確認します。
# eth0 という名前が見えない場合は Predictable Names が有効です。

# 旧来の eth0 形式に戻す場合 (非推奨)
# GRUB に net.ifnames=0 biosdevname=0 を追加し再起動
# ただし RHEL 10 では推奨されません
```

---

## 4. ファイアウォール管理: firewalld の進化

### バックエンドの変化

| バージョン | バックエンド | 説明 |
|-----------|-------------|------|
| RHEL 7 | iptables | 旧来の静的ファイアウォール |
| RHEL 8 | nftables (移行期) | iptables は互換性レイヤとして残存 |
| RHEL 9/10 | nftables | iptables は完全に deprecated |

> RHEL 7 で `iptables` コマンドを直接使用していたスクリプトは修正が必要です。

### firewalld の基本概念 (RHEL 7 から変化なし)

```
ゾーン (Zone): 信頼レベルを定義したネットワーク区域
サービス (Service): プロトコルとポートの定義セット
ランタイム設定: 即時適用、再起動すると消える
永続設定 (--permanent): ファイルに書き込まれ、再起動後も維持
```

### firewalld コマンド詳解

#### 状態確認

```bash
# サービス状態の確認
systemctl status firewalld
# firewalld サービスの起動状態と最近のログを表示します。
# Active: active (running) が正常状態です。

firewall-cmd --state
# firewalld が running (稼働中) か not running かを表示します。
# シンプルに起動確認したい場合に使用します。

firewall-cmd --get-default-zone
# デフォルトゾーンを表示します。
# 新しいインターフェースはこのゾーンに自動割り当てされます。
# RHEL のデフォルトは "public" です。

firewall-cmd --get-active-zones
# 現在アクティブなゾーンとそこに割り当てられたインターフェースを表示します。
# どのインターフェースがどのゾーンで管理されているか確認できます。

firewall-cmd --list-all
# デフォルトゾーンのすべての設定 (許可サービス、ポート、ルール等) を表示します。

firewall-cmd --list-all --zone=public
# 特定ゾーン (public) のすべての設定を表示します。
```

#### サービスの許可・拒否

```bash
# HTTP サービスを許可 (ランタイム=即時有効、再起動で消える)
firewall-cmd --zone=public --add-service=http
# --zone=public  : 操作するゾーンを指定します
# --add-service  : 指定サービスを許可します
# HTTP (80/tcp) がこのゾーンで許可されます

# 永続的に許可 (再起動後も維持)
firewall-cmd --permanent --zone=public --add-service=http
# --permanent    : 設定を永続化します (ファイルに書き込む)
# ランタイムには即座には反映されません

# 永続設定をランタイムに反映
firewall-cmd --reload
# 永続設定をランタイム設定として反映します。
# 現在の接続は切断されません (graceful reload)。

# 一般的なベストプラクティス: --permanent + --reload の組み合わせ
firewall-cmd --permanent --zone=public --add-service=https
firewall-cmd --reload
# ① 永続設定に追加 → ② ランタイムに反映 の 2ステップが推奨です。

# サービスを削除
firewall-cmd --permanent --zone=public --remove-service=http
firewall-cmd --reload
# --remove-service : 指定サービスの許可を削除します

# 利用可能なサービス一覧
firewall-cmd --get-services
# firewalld が定義済みのサービス名一覧を表示します。
# http, https, ssh, dns, mysql, postgresql など多数あります。

firewall-cmd --info-service=http
# 特定サービスの詳細 (ポート番号、プロトコル等) を表示します。
```

#### ポートの直接指定

```bash
# カスタムポートを許可
firewall-cmd --permanent --zone=public --add-port=8080/tcp
# --add-port=8080/tcp : TCP の 8080 番ポートを許可します
# プロトコルは tcp または udp を指定します

firewall-cmd --permanent --zone=public --add-port=9000-9100/tcp
# ポート範囲を許可します (9000 から 9100 まで)

firewall-cmd --permanent --zone=public --remove-port=8080/tcp
# 指定ポートの許可を削除します

firewall-cmd --reload

# 現在許可されているポートの確認
firewall-cmd --list-ports
firewall-cmd --list-ports --zone=public
```

#### ゾーンとインターフェースの管理

```bash
# インターフェースにゾーンを割り当て
firewall-cmd --permanent --zone=internal --add-interface=eth1
# eth1 インターフェースを internal ゾーンに割り当てます。
# internal ゾーンは信頼度が高い社内ネットワーク向けです。

firewall-cmd --reload

# 特定 IP/ネットワークをゾーンに追加 (信頼できる送信元)
firewall-cmd --permanent --zone=trusted --add-source=192.168.0.0/24
# 192.168.0.0/24 からの全通信を trusted ゾーンで処理します。
# このネットワークからの通信はすべて許可されます。

firewall-cmd --reload
```

#### RHEL 10 での nftables 直接確認

```bash
# iptables (RHEL 7 での確認方法) - RHEL 10 では非推奨
iptables -L -n -v

# RHEL 10: nftables で確認
nft list ruleset
# nftables のすべてのルールを表示します。
# firewalld が内部的に生成したルールが確認できます。

nft list table inet firewalld
# firewalld が管理する inet テーブルのルールを表示します。
```

---

## 5. systemd の進化と新機能

### バージョン変化と主要改善

```
RHEL 7  : systemd 208 → 219
RHEL 8  : systemd 239
RHEL 9  : systemd 250
RHEL 10 : systemd 256+
```

### 基本コマンド (RHEL 7 から変化なし)

```bash
# サービスの起動・停止・再起動
systemctl start httpd
# httpd サービスを起動します。

systemctl stop httpd
# httpd サービスを停止します。

systemctl restart httpd
# httpd サービスを停止してから起動します。
# 接続が一時的に切断されます。

systemctl reload httpd
# サービスを停止せずに設定ファイルを再読み込みします。
# httpd の場合は graceful reload が実行されます。
# すべてのサービスが reload をサポートするわけではありません。

# 状態確認
systemctl status httpd
# サービスの状態を詳細表示します:
# - Active: active (running) / inactive (dead) / failed
# - Main PID: メインプロセスのPID
# - 最近のログ (journald から取得)

# 自動起動の設定
systemctl enable httpd
# システム起動時に httpd を自動起動するよう設定します。
# /etc/systemd/system/ にシンボリックリンクが作成されます。

systemctl disable httpd
# 自動起動を無効化します。
# シンボリックリンクが削除されます (サービスは停止しません)。

systemctl enable --now httpd
# 自動起動を有効化し、即座にサービスも起動します。
# enable + start を一度に実行できる便利なオプションです。

systemctl disable --now httpd
# 自動起動を無効化し、即座にサービスも停止します。

# 有効/無効の確認
systemctl is-enabled httpd
# enabled / disabled / static などのステータスを返します。
# スクリプトでの条件分岐に活用できます。

systemctl is-active httpd
# active / inactive / failed などのステータスを返します。
# 戻り値: active=0, それ以外=1 (スクリプトで利用可能)
```

### systemctl の便利なコマンド群

```bash
# 全サービスの一覧表示
systemctl list-units --type=service
# 現在ロードされているすべてのサービスを表示します。
# --all オプションで inactive なサービスも表示できます。

systemctl list-units --type=service --state=running
# 現在稼働中のサービスのみを表示します。

systemctl list-unit-files --type=service
# インストールされているすべてのサービスファイルを表示します。
# enabled/disabled/static/masked の状態が確認できます。

# 障害サービスの確認
systemctl --failed
# 起動に失敗したサービスの一覧を表示します。
# 障害発生時のトラブルシューティングの出発点として使用します。

# サービスの依存関係確認
systemctl list-dependencies httpd
# httpd サービスが依存するユニットのツリーを表示します。
# どのサービスが先に起動する必要があるかが分かります。

# マスク (完全無効化)
systemctl mask httpd
# httpd サービスを完全に無効化します。
# enable/start を実行してもエラーになります。
# 誤って起動されたくないサービスに使用します。

systemctl unmask httpd
# マスクを解除します。
```

### ジャーナル (ログ管理)

RHEL 7 でも systemd-journald は存在しましたが、RHEL 10 ではより高機能になりました。

```bash
# ジャーナルの表示
journalctl
# システム全体のログを時系列で表示します。
# q で終了、/で検索、矢印キーでスクロールします。

journalctl -f
# ログをリアルタイムで表示します (tail -f の journald 版)。
# 新しいログエントリが追加されると即座に表示されます。

journalctl -u httpd
# -u: 特定のサービス (ユニット) のログのみ表示します。
# httpd に関連するすべてのログが表示されます。

journalctl -u httpd -f
# httpd のログをリアルタイム表示します。
# サービスのトラブルシューティング時に使用します。

journalctl -u httpd --since "2026-02-18 09:00:00" --until "2026-02-18 18:00:00"
# --since: 指定日時以降のログを表示します
# --until: 指定日時以前のログを表示します
# 特定の時間帯の障害調査に有効です。

journalctl -u httpd --since "1 hour ago"
# 直近 1 時間のログを表示します。
# 相対時間指定も可能です (1 hour ago, yesterday, etc.)

journalctl -p err
# -p: プライオリティでフィルタリングします。
# emerg, alert, crit, err, warning, notice, info, debug が指定可能です。
# err 以上のエラーログのみを表示します。

journalctl -p err -u httpd --since today
# 複数の条件を組み合わせることができます。
# 今日の httpd エラーログを表示します。

journalctl --disk-usage
# ジャーナルのディスク使用量を表示します。

journalctl --vacuum-size=500M
# ジャーナルのサイズを 500MB 以下に削減します。
# ディスク容量が不足した場合のクリーンアップに使用します。

journalctl --vacuum-time=2weeks
# 2週間より古いジャーナルエントリを削除します。
```

### systemd タイマー (cron の代替)

RHEL 10 では cron に加えて systemd タイマーが推奨されます。

```bash
# タイマーの一覧確認
systemctl list-timers
# 設定されているすべての systemd タイマーを表示します。
# 次回実行時刻 (NEXT) と前回実行時刻 (LAST) が確認できます。

systemctl list-timers --all
# 非アクティブなタイマーも含めて表示します。
```

---

## 6. cgroups v1 から v2 への完全移行

### 最重要変化点

**RHEL 7**: cgroups v1 のみ
**RHEL 8/9**: v1 と v2 が共存 (v1 がデフォルト)
**RHEL 10**: **cgroups v2 のみ** (v1 は完全に削除)

これはコンテナ実行環境、リソース管理スクリプトに大きな影響を与えます。

### cgroups v1 と v2 の違い

| 項目 | cgroups v1 | cgroups v2 |
|------|-----------|-----------|
| 階層構造 | 複数の独立したツリー | 単一の統合ツリー |
| CPU 制御 | `cpu.shares` | `cpu.weight` |
| マウントポイント | `/sys/fs/cgroup/<controller>/` | `/sys/fs/cgroup/` (統合) |
| OOM Kill | コントローラ非対応 | cgroup 単位で OOM kill |
| スレッド管理 | コントローラによって異なる | 統一されたスレッドモード |

### cgroups v2 の確認コマンド

```bash
# cgroups v2 が有効か確認
mount | grep cgroup
# RHEL 10 では "cgroup2 on /sys/fs/cgroup" が表示されます。
# v1 では "/sys/fs/cgroup/cpu" のように各コントローラが個別にマウントされます。

ls /sys/fs/cgroup/
# RHEL 7 (v1): cpu, memory, blkio などのディレクトリが表示される
# RHEL 10 (v2): system.slice, user.slice などのスライスが表示される

cat /sys/fs/cgroup/cgroup.controllers
# 利用可能なコントローラを表示します。
# RHEL 10 では: cpuset cpu io memory hugetlb pids rdma misc が表示されます。
```

### systemd によるリソース管理 (v1→v2 の変化)

```bash
# CPU リソース制限

# RHEL 7 (v1) での方法 - RHEL 10 では非推奨
# systemd の CPUShares= を使用していた
# /sys/fs/cgroup/cpu/system.slice/httpd.service/cpu.shares に書き込まれていた

# RHEL 10 (v2) での方法
systemctl set-property httpd.service CPUWeight=200
# CPUWeight: CPU の相対的な重み付け (1-10000、デフォルト=100)
# 200 に設定すると、デフォルトの 2 倍の CPU 時間が割り当てられます。
# この設定は即座に適用されます (再起動不要)。

systemctl set-property httpd.service CPUQuota=50%
# CPUQuota: CPU 使用率の上限をパーセントで指定します。
# 50% と設定すると 1 コア相当の 50% を超えて使用できなくなります。
# マルチコア環境では 200% のような値も指定可能です。

# メモリ制限
systemctl set-property httpd.service MemoryMax=512M
# MemoryMax: プロセスが使用できる最大メモリ量を指定します。
# この上限を超えると OOM killer によって強制終了されます。
# 512M, 1G, 2048M のように指定します。

systemctl set-property httpd.service MemoryHigh=400M
# MemoryHigh: ソフトリミット (この値を超えるとスロットリングされる)。
# MemoryMax との組み合わせで段階的な制限が可能です。

# 設定の確認
systemctl show httpd.service | grep -E "CPU|Memory"
# 現在のリソース制限設定を表示します。

# 永続的な設定 (再起動後も維持)
# /etc/systemd/system/httpd.service.d/override.conf に記述します
mkdir -p /etc/systemd/system/httpd.service.d/
cat > /etc/systemd/system/httpd.service.d/override.conf << 'EOF'
[Service]
CPUWeight=200
MemoryMax=512M
EOF

systemctl daemon-reload
# systemd に設定ファイルの変更を通知します。
# Unit ファイルを変更した後は必ず実行してください。
```

---

## 7. セキュリティ: SELinux の強化

### SELinux の基本 (RHEL 7 から変化なし)

```bash
# SELinux の状態確認
getenforce
# Enforcing: SELinux が有効 (違反をブロック)
# Permissive: ログのみ (ブロックしない)
# Disabled: 完全無効

sestatus
# SELinux の詳細状態を表示します:
# - 現在のモード (Enforcing/Permissive/Disabled)
# - ポリシータイプ (targeted)
# - ポリシーバージョン

# 一時的に Permissive に変更 (再起動で元に戻る)
setenforce 0
# 0: Permissive モードに変更します。
# トラブルシューティング時に SELinux が原因か切り分けるために使用します。
# 本番環境での常用は禁止です。

setenforce 1
# 1: Enforcing モードに戻します。
```

### SELinux のトラブルシューティング

```bash
# 違反ログの確認
ausearch -m avc -ts recent
# -m avc     : AVC (Access Vector Cache) 拒否メッセージを検索します
# -ts recent : 直近のログに絞り込みます

# わかりやすいメッセージで表示
ausearch -m avc -ts recent | audit2why
# audit2why : 拒否の理由を人間が読みやすい形式で説明します。
# 「なぜ SELinux が拒否したのか」を解説してくれます。

# カスタムポリシーの生成 (RHEL 10 の推奨方法)
ausearch -m avc -ts recent | audit2allow -M mymodule
# -M mymodule : mymodule という名前のポリシーモジュールを生成します
# mymodule.pp (バイナリポリシー) と mymodule.te (テキストポリシー) が生成されます。

semodule -i mymodule.pp
# 生成したポリシーモジュールをシステムに適用します。
# これにより SELinux の拒否が解除されます。

# ファイルのコンテキスト確認
ls -lZ /var/www/html/
# -Z オプション: SELinux コンテキストを表示します。
# "httpd_sys_content_t" のようなタイプが表示されます。

# ファイルのコンテキスト変更
chcon -t httpd_sys_content_t /srv/myapp/index.html
# -t: SELinux タイプを変更します。
# Web サーバが読めるようにファイルを設定します。
# ただし restorecon で元に戻ることがあるため、fcontext で永続化推奨。

# 永続的なコンテキスト変更
semanage fcontext -a -t httpd_sys_content_t "/srv/myapp(/.*)?"
# -a   : ルールを追加します
# -t   : タイプを指定します
# 正規表現でディレクトリ以下すべてを対象にします。

restorecon -Rv /srv/myapp/
# -R: 再帰的に適用します
# -v: 変更されたファイルを表示します
# semanage fcontext で設定したルールを実際のファイルに適用します。
```

### RHEL 10 の新しいセキュリティ機能

```bash
# 耐量子暗号 (Post-Quantum Cryptography) の確認
update-crypto-policies --show
# 現在の暗号ポリシーを表示します。
# RHEL 10 では DEFAULT, FUTURE, FIPS, LEGACY などが選択可能です。

update-crypto-policies --set FUTURE
# FUTURE ポリシーに変更します。
# 量子コンピュータに対しても安全な暗号アルゴリズムを強制します。
# SHA-1 や RSA-2048 などの弱い暗号が無効化されます。

update-crypto-policies --set FIPS
# FIPS 140-2/140-3 準拠の暗号ポリシーに変更します。
# 政府機関・金融機関など規制産業で必要となるケースがあります。
# 変更後は再起動が必要です。

# FIPS モードの有効化
fips-mode-setup --enable
# システム全体で FIPS モードを有効化します。
# FIPS は特定の暗号アルゴリズムのみを許可する厳格な基準です。
# 有効化後はシステムの再起動が必要です。

fips-mode-setup --check
# FIPS モードが有効かどうかを確認します。

# ライブカーネルパッチ (RHEL 10 新機能)
kpatch list
# 現在適用されているライブパッチの一覧を表示します。
# カーネルを再起動せずにセキュリティパッチを適用できます。
```

---

## 8. コンテナ技術: Docker → Podman

### RHEL における Docker から Podman への移行

RHEL 7 では Docker が広く使われていましたが、RHEL 8 以降は Podman が標準コンテナツールになりました。

| 項目 | Docker (RHEL 7) | Podman (RHEL 10) |
|------|----------------|-----------------|
| デーモン | dockerd が必要 | **デーモンレス** |
| root 権限 | デフォルトで root | **rootless (一般ユーザ) が推奨** |
| SELinux | デフォルト無効 | **デフォルト有効** |
| コマンド互換 | - | `docker` コマンドとほぼ互換 |
| compose | docker-compose | `podman-compose` または `podman compose` |

### Podman の基本コマンド

```bash
# コンテナイメージの検索・取得
podman search nginx
# Docker Hub や設定されたレジストリからイメージを検索します。

podman pull registry.access.redhat.com/ubi10/ubi:latest
# 指定したレジストリからイメージを取得します。
# RHEL 10 では Red Hat の UBI (Universal Base Image) が推奨されます。
# UBI は RHEL ベースの再配布可能なコンテナイメージです。

# イメージの確認
podman images
# ローカルに存在するコンテナイメージを一覧表示します。
# IMAGE ID, SIZE, 作成日時が確認できます。

# コンテナの起動
podman run -d --name web nginx
# -d        : バックグラウンド (デタッチ) モードで起動します。
# --name web: コンテナに "web" という名前を付けます。
# nginx     : 使用するイメージ名です。

podman run -d \
  --name web \
  -p 8080:80 \
  -v /srv/html:/usr/share/nginx/html:Z \
  nginx
# -p 8080:80 : ホストの 8080 番ポートをコンテナの 80 番に転送します
# -v         : ボリュームマウントを指定します
# :Z         : SELinux ラベルを自動設定します (private ラベル)
#              RHEL 10 では SELinux が有効なため :Z は必須です！

# :Z vs :z の違い
# :Z : そのコンテナ専用のラベル (他コンテナからアクセス不可)
# :z : 複数コンテナで共有できるラベル

# コンテナの状態確認
podman ps
# 起動中のコンテナを表示します。

podman ps -a
# -a: 停止中のコンテナも含めてすべて表示します。
# STATUS 列で Running/Exited などの状態が確認できます。

# コンテナのログ確認
podman logs web
# "web" コンテナの標準出力・エラー出力のログを表示します。

podman logs -f web
# -f: リアルタイムでログを追跡します (tail -f 相当)。

# コンテナ内でコマンド実行
podman exec -it web bash
# -i: 標準入力を有効にします (interactive)
# -t: 疑似 TTY を割り当てます (terminal)
# bash: コンテナ内で bash シェルを起動します。
# exit で抜けます。

# コンテナの停止・削除
podman stop web
# コンテナに SIGTERM を送信して停止します。
# 10秒後に SIGKILL が送られます。

podman rm web
# 停止済みコンテナを削除します。
# 起動中のコンテナは削除できません (先に stop が必要)。

podman rm -f web
# -f: 起動中でも強制削除します。
```

### Rootless コンテナ (RHEL 10 の推奨方法)

```bash
# 一般ユーザとしてコンテナを起動 (sudo 不要)
whoami    # ← 一般ユーザ (例: engineer) でログインしていることを確認

podman run -d --name myweb nginx
# sudo なしで実行できます。
# コンテナはユーザの名前空間で動作します。

# rootless コンテナの確認
podman info | grep rootless
# rootless: true が表示されれば rootless モードです。

# rootless コンテナのデータ保存場所
ls ~/.local/share/containers/
# rootless コンテナのデータはユーザのホームディレクトリに保存されます。
# /var/lib/docker や /var/lib/containers は root 用です。
```

### Podman でのシステムサービス化 (docker-compose との違い)

```bash
# Podman を systemd サービスとして登録
podman generate systemd --name web --files --new
# --name web: "web" コンテナのサービスファイルを生成します
# --files   : ファイルとして出力します
# --new     : サービス起動時にコンテナを新規作成するよう設定します
# container-web.service というファイルが生成されます。

# 生成されたサービスファイルをシステムにコピー
cp container-web.service /etc/systemd/system/

systemctl daemon-reload
# systemd に新しいユニットファイルを認識させます。

systemctl enable --now container-web.service
# システム起動時に自動起動するよう設定し、即座に起動します。

# Podman Compose (docker-compose の代替)
dnf install podman-compose
# podman-compose をインストールします。
# docker-compose.yml との互換性があります。

podman compose up -d
# docker-compose up -d と同じ使い方です。
# バックグラウンドで全サービスを起動します。

podman compose ps
# 起動中のサービスを確認します。

podman compose down
# すべてのサービスを停止・削除します。
```

### udica: SELinux ポリシーの自動生成 (RHEL 10 新機能)

```bash
# udica のインストール
dnf install udica

# コンテナの検査情報を取得
podman inspect web > web.json
# コンテナの設定情報を JSON ファイルに出力します。

# SELinux ポリシーを自動生成
udica my_web_policy < web.json
# web.json の情報 (マウントポイント、ポート、Capability) を分析して
# 最適な SELinux ポリシーを生成します。
# my_web_policy.cil と my_web_policy_base.cil が生成されます。

# ポリシーを適用
semodule -i my_web_policy.cil /usr/share/udica/templates/{base_container.cil,net_container.cil}
# 生成したポリシーをシステムに適用します。
# テンプレートとの組み合わせで完全なポリシーになります。

# ポリシーを適用してコンテナを再起動
podman run -d --name web --security-opt label=type:my_web_policy.process nginx
# --security-opt label=type: : 使用する SELinux ポリシーを指定します。
```

---

## 9. ストレージ管理の変化

### LVM (変化なし)

```bash
# LVM の基本コマンドは RHEL 7 から変化なし
pvs    # Physical Volume の一覧
vgs    # Volume Group の一覧
lvs    # Logical Volume の一覧

# ボリュームの拡張
lvextend -L +10G /dev/mapper/vg0-lv_root
# -L +10G : 10GB 拡張します

xfs_growfs /
# XFS ファイルシステムをオンライン拡張します (再マウント不要)。
# RHEL 7/10 ともに / のファイルシステムは XFS が標準です。
```

### Stratis ストレージ (RHEL 8 以降)

RHEL 10 では Stratis という新しいストレージ管理ツールが利用可能です。

```bash
# Stratis のインストール
dnf install stratisd stratis-cli
systemctl enable --now stratisd

# プールの作成
stratis pool create mypool /dev/sdb /dev/sdc
# /dev/sdb と /dev/sdc を使って "mypool" というストレージプールを作成します。
# LVM のボリュームグループに相当します。

# ファイルシステムの作成
stratis filesystem create mypool myfs
# mypool 上に "myfs" という名前のファイルシステムを作成します。
# Stratis のファイルシステムは thin-provisioned です (必要な分だけ実際に使用)。

# マウント
mount /dev/stratis/mypool/myfs /mnt/data
# Stratis のファイルシステムをマウントします。

# 状態確認
stratis pool list
# ストレージプールの一覧と使用量を表示します。

stratis filesystem list
# ファイルシステムの一覧を表示します。

# スナップショット作成
stratis filesystem snapshot mypool myfs myfs-snap
# myfs のスナップショット myfs-snap を作成します。
# バックアップや変更前の状態保持に使用します。
```

---

## 10. カーネル 6.12 の新機能

### カーネルのバージョン確認

```bash
uname -r
# 現在動作しているカーネルバージョンを表示します。
# RHEL 10: 6.12.0-55.9.1.el10_0 のような表示になります。

uname -a
# カーネルバージョン、ホスト名、アーキテクチャなど詳細を表示します。

rpm -q kernel
# インストールされているカーネルパッケージを確認します。
# 複数のカーネルがインストールされている場合は全て表示されます。
```

### 主要な新機能

#### x86-64-v3 アーキテクチャ要件

```bash
# CPU が RHEL 10 をサポートするか確認
grep -m1 -o 'avx2\|avx\|sse4_2\|sse4_1' /proc/cpuinfo
# RHEL 10 (x86-64-v3) には以下の CPU 機能が必要:
# SSE4.1, SSE4.2, AVX, AVX2, BMI1, BMI2, MOVBE, POPCNT など

# x86-64 バージョンレベルの確認
/lib64/ld-linux-x86-64.so.2 --help 2>&1 | grep "x86-64"
# サポートされているマイクロアーキテクチャレベルが表示されます。
# "x86-64-v3" が含まれていれば RHEL 10 が動作します。
```

#### IO_uring (高性能 I/O)

```bash
# IO_uring のサポート確認
cat /proc/sys/kernel/io_uring_disabled
# 0: 有効 (デフォルト)
# 1: 特権ユーザのみ
# 2: 完全に無効

# IO_uring を使用したアプリケーションのパフォーマンス確認
# (io_uring 対応アプリケーション: PostgreSQL 14+, nginx, Node.js 等)
```

---

## 11. 削除・廃止された機能一覧

RHEL 7 で使用していた以下の機能は RHEL 10 では削除または非推奨です。

### ネットワーク関連

| 機能 | RHEL 7 | RHEL 10 | 代替手段 |
|------|--------|---------|---------|
| `ifup` / `ifdown` | 利用可能 | **削除** | `nmcli connection up/down` |
| `ifconfig` | 利用可能 | **非推奨** | `ip addr` / `nmcli` |
| `netstat` | 利用可能 | **削除** | `ss` コマンド |
| `route` | 利用可能 | **削除** | `ip route` |
| `network.service` | 利用可能 | **削除** | NetworkManager のみ |
| `/etc/sysconfig/network-scripts/ifcfg-*` | 標準 | **削除** | `/etc/NetworkManager/system-connections/*.nmconnection` |

#### 代替コマンドの使い方

```bash
# netstat の代替: ss (Socket Statistics)
netstat -tuln         # RHEL 7
ss -tuln              # RHEL 10
# -t: TCP ソケット
# -u: UDP ソケット
# -l: リスニング状態のみ
# -n: 数値で表示 (名前解決しない)

ss -tulnp
# -p: プロセス名と PID も表示します。
# どのプロセスがどのポートでリスニングしているか確認できます。

# route の代替: ip route
route -n              # RHEL 7
ip route show         # RHEL 10
# ルーティングテーブルを表示します。

ip route add 10.0.0.0/8 via 192.168.1.1
# スタティックルートを追加します (一時的)。
# 永続化は nmcli で行います。

# ifconfig の代替: ip
ifconfig eth0         # RHEL 7
ip addr show eth0     # RHEL 10
# インターフェースの IP アドレス情報を表示します。

ip link show eth0
# インターフェースのリンク状態 (UP/DOWN, MACアドレス等) を表示します。
```

### パッケージ管理関連

| 機能 | RHEL 7 | RHEL 10 | 代替手段 |
|------|--------|---------|---------|
| `yum` コマンド | 標準 | **廃止** | `dnf` |
| `/var/log/yum.log` | 存在 | **削除** | `/var/log/dnf.rpm.log` |
| Delta RPMs | サポート | **削除** | 通常 RPM ダウンロード |
| YUM v3 Python API | サポート | **削除** | DNF Python API |

### セキュリティ関連

| 機能 | RHEL 7 | RHEL 10 | 備考 |
|------|--------|---------|------|
| SHA-1 証明書 | 利用可能 | **無効** | SHA-256 以上を使用 |
| TLS 1.0/1.1 | 利用可能 | **無効** | TLS 1.2/1.3 を使用 |
| iptables (直接) | 標準 | **非推奨** | firewalld / nftables |
| SSLv3 | 非推奨 | **完全削除** | - |

### ストレージ関連

| 機能 | RHEL 7 | RHEL 10 | 代替手段 |
|------|--------|---------|---------|
| GFS2 ファイルシステム | サポート | **削除** | - |
| cgroups v1 | 標準 | **削除** | cgroups v2 |

### デスクトップ関連 (サーバ用途では影響小)

| 機能 | RHEL 7 | RHEL 10 | 代替手段 |
|------|--------|---------|---------|
| X11 | 標準 | **非推奨** | Wayland |
| PulseAudio | 標準 | **削除** | PipeWire |

---

## 12. 移行チェックリスト

### 移行前の確認事項

#### CPU 互換性

```bash
# RHEL 7 サーバで実行して CPU 機能を確認
grep -c avx2 /proc/cpuinfo
# 0 が返った場合: AVX2 非対応 → RHEL 10 は動作しない可能性があります。
# 1以上が返った場合: AVX2 対応。

# より詳細な確認
cat /proc/cpuinfo | grep flags | head -1 | tr ' ' '\n' | grep -E 'avx|sse4|bmi'
# 必要なフラグ: avx, avx2, bmi1, bmi2, sse4_1, sse4_2
```

#### 現在の設定のバックアップ

```bash
# ネットワーク設定のバックアップ
cp -r /etc/sysconfig/network-scripts/ /backup/network-scripts-$(date +%Y%m%d)/
# RHEL 10 では形式が変わるため、移行前に保存しておきます。

# ファイアウォール設定のエクスポート
firewall-cmd --runtime-to-permanent
firewall-cmd --list-all > /backup/firewall-rules-$(date +%Y%m%d).txt
# 現在のファイアウォールルールをファイルに保存します。

# インストールパッケージのリスト作成
rpm -qa --queryformat '%{NAME}\n' | sort > /backup/installed-packages-$(date +%Y%m%d).txt
# 後でどのパッケージを再インストールすべきか確認できます。

# crontab のバックアップ
crontab -l > /backup/crontab-$(whoami)-$(date +%Y%m%d).txt
for user in $(cut -d: -f1 /etc/passwd); do
  crontab -u $user -l 2>/dev/null > /backup/crontab-${user}.txt
done
# すべてのユーザの crontab をバックアップします。
```

#### スクリプトの確認

```bash
# yum コマンドを使用しているスクリプトを特定
grep -r "yum " /usr/local/bin/ /usr/local/sbin/ /etc/cron.d/ --include="*.sh"
# RHEL 10 では yum を dnf に書き換える必要があります。

# ifconfig, netstat, route を使用しているスクリプトを特定
grep -r -E "ifconfig|netstat|ifup|ifdown" /usr/local/bin/ /usr/local/sbin/
# RHEL 10 では代替コマンドに書き換える必要があります。

# cgroups v1 のパスを直接参照しているスクリプトを特定
grep -r "/sys/fs/cgroup/cpu\|/sys/fs/cgroup/memory" /usr/local/bin/ /etc/
# RHEL 10 では /sys/fs/cgroup/ に統合されているため修正が必要です。

# Docker を使用している箇所を特定
grep -r "docker " /usr/local/bin/ /usr/local/sbin/ /etc/cron.d/ /etc/systemd/
# Podman に移行が必要な箇所を特定します。
```

### 移行後の確認事項

```bash
# ネットワーク接続確認
nmcli connection show
ip addr show
ping -c 3 8.8.8.8

# サービス起動確認
systemctl list-units --state=failed
# 起動に失敗したサービスがあれば調査します。

# ファイアウォール確認
firewall-cmd --list-all

# SELinux 確認
getenforce
ausearch -m avc -ts today | wc -l
# 本日の SELinux 違反数を確認します。多い場合はポリシー調整が必要です。

# パッケージ確認
dnf check
# パッケージデータベースの整合性を確認します。

# カーネルバージョン確認
uname -r
# 6.12 系であることを確認します。

# cgroups v2 確認
mount | grep cgroup2
# "cgroup2 on /sys/fs/cgroup" が表示されることを確認します。
```

---

## 参考リソース

- [Red Hat Enterprise Linux 10 リリースノート](https://www.redhat.com/en/blog/whats-new-rhel-10)
- [RHEL 10 開発者向け新機能](https://developers.redhat.com/articles/2025/07/02/whats-new-developers-rhel-10)
- [9to5Linux: RHEL 10 新機能](https://9to5linux.com/red-hat-enterprise-linux-10-officially-released-heres-whats-new)
- [Web Asha: RHEL 10 完全ガイド](https://www.webasha.com/blog/whats-new-in-red-hat-enterprise-linux-rhel-10the-complete-guide)
- [Red Hat ドキュメント: cgroups v2 移行](https://access.redhat.com/articles/3735611)
- [Red Hat ドキュメント: SELinux コンテナガイド](https://developers.redhat.com/articles/2025/04/11/my-advice-on-selinux-container-labeling)
- [firewalld コマンドリファレンス](https://www.devopstraininginstitute.com/blog/rhel-10-firewalld-commands-examples)

---

*本資料は 2026年2月時点の情報を基に作成しています。最新情報は Red Hat 公式ドキュメントをご参照ください。*
