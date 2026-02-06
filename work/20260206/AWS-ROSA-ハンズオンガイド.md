# ROSA (Red Hat OpenShift Service on AWS) ハンズオンガイド

## 目次
1. [ROSA概要](#1-rosa概要)
2. [EKSとの比較](#2-eksとの比較)
3. [アーキテクチャ](#3-アーキテクチャ)
4. [前提条件とセットアップ](#4-前提条件とセットアップ)
5. [クラスター作成](#5-クラスター作成)
6. [認証とアクセス管理](#6-認証とアクセス管理)
7. [アプリケーションデプロイ](#7-アプリケーションデプロイ)
8. [ネットワーキング](#8-ネットワーキング)
9. [ストレージ](#9-ストレージ)
10. [モニタリング・ロギング](#10-モニタリングロギング)
11. [セキュリティ](#11-セキュリティ)
12. [運用管理](#12-運用管理)
13. [ハンズオン演習](#13-ハンズオン演習)
14. [DOP試験対策チェックリスト](#14-dop試験対策チェックリスト)

---

## 1. ROSA概要

### 1.1 ROSAとは

```
┌─────────────────────────────────────────────────────────────────┐
│              ROSA (Red Hat OpenShift Service on AWS)            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    フルマネージドOpenShift                 │ │
│  │                                                           │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │ │
│  │  │ OpenShift   │ │ Kubernetes  │ │ Red Hat     │        │ │
│  │  │ Web Console │ │ API + CRI-O │ │ CoreOS      │        │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘        │ │
│  │                                                           │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │ │
│  │  │ OperatorHub │ │ Source-to-  │ │ Service     │        │ │
│  │  │ (豊富な     │ │ Image (S2I) │ │ Mesh        │        │ │
│  │  │  アドオン)  │ │             │ │ (Istio)     │        │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  共同管理:                                                      │
│  ┌─────────────────┐  ┌─────────────────┐                     │
│  │    AWS          │  │   Red Hat       │                     │
│  │  (インフラ)     │  │  (OpenShift)    │                     │
│  │  EC2, VPC, EBS  │  │  クラスター管理 │                     │
│  │  IAM, 請求      │  │  パッチ適用     │                     │
│  └─────────────────┘  └─────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 ROSAの特徴

| 特徴 | 説明 |
|------|------|
| **エンタープライズKubernetes** | Red Hat OpenShiftのフルマネージド版 |
| **統合課金** | AWS請求に統合（Red Hat契約不要） |
| **SLA** | 99.95% 可用性保証 |
| **サポート** | Red Hat + AWS の共同サポート |
| **認定** | SOC2, ISO 27001, PCI-DSS, HIPAA等 |
| **OperatorHub** | 200+のCertified Operators |

### 1.3 ROSAのデプロイモデル

```
┌─────────────────────────────────────────────────────────────┐
│                   ROSA デプロイモデル                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  【ROSA Classic】              【ROSA with HCP】            │
│  ┌─────────────────┐          ┌─────────────────┐          │
│  │ コントロール    │          │ Hosted Control  │          │
│  │ プレーン        │          │ Plane           │          │
│  │ (顧客VPC内)     │          │ (Red Hat管理)   │          │
│  └─────────────────┘          └─────────────────┘          │
│          │                            │                    │
│          ▼                            ▼                    │
│  ┌─────────────────┐          ┌─────────────────┐          │
│  │ Worker Node     │          │ Worker Node     │          │
│  │ (顧客VPC)       │          │ (顧客VPC)       │          │
│  └─────────────────┘          └─────────────────┘          │
│                                                             │
│  コスト: 高い                  コスト: 低い（30-50%削減）   │
│  管理性: 従来型                管理性: シンプル             │
│  スケール: 制限あり            スケール: 高速               │
└─────────────────────────────────────────────────────────────┘

HCP = Hosted Control Plane（推奨）
```

---

## 2. EKSとの比較

### 2.1 機能比較

| 項目 | ROSA | EKS |
|------|------|-----|
| **Kubernetes基盤** | OpenShift (OKD) | バニラKubernetes |
| **コンソール** | OpenShift Web Console | kubectl / Lens等 |
| **CI/CD統合** | OpenShift Pipelines (Tekton) | 別途構築 |
| **イメージビルド** | Source-to-Image (S2I) | 別途構築 |
| **サービスメッシュ** | OpenShift Service Mesh | 別途構築 |
| **Operator管理** | OperatorHub (Certified) | 手動インストール |
| **セキュリティ** | SCC (より厳格) | PSS/PSA |
| **コスト** | 高い (Red Hat込み) | 低い |
| **学習曲線** | 高い | 低い |

### 2.2 選択基準

```
┌─────────────────────────────────────────────────────────────┐
│                   選択基準フローチャート                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  既存のRed Hat/OpenShift資産がある？                        │
│           │                                                 │
│     Yes ──┼── No                                           │
│           │    │                                            │
│           ▼    │  エンタープライズ機能が必要？              │
│        ROSA    │  (統合CI/CD, Service Mesh, Operator管理)   │
│                │           │                                │
│                │     Yes ──┼── No                          │
│                │           │    │                           │
│                │           ▼    ▼                           │
│                │        ROSA   EKS                          │
│                │                                            │
│                │  コスト優先？                               │
│                │           │                                │
│                │     Yes ──┼── No                          │
│                │           │    │                           │
│                │           ▼    ▼                           │
│                │         EKS  ROSA (サポート重視)           │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. アーキテクチャ

### 3.1 ROSA Classic アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                        Customer AWS Account                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                         VPC                                │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │                 Private Subnet (AZ-1)                │  │  │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐         │  │  │
│  │  │  │ Master 1  │ │ Infra 1   │ │ Worker 1  │         │  │  │
│  │  │  │(Control)  │ │(Router,   │ │(App Pod)  │         │  │  │
│  │  │  │           │ │ Registry) │ │           │         │  │  │
│  │  │  └───────────┘ └───────────┘ └───────────┘         │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │                 Private Subnet (AZ-2)                │  │  │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐         │  │  │
│  │  │  │ Master 2  │ │ Infra 2   │ │ Worker 2  │         │  │  │
│  │  │  └───────────┘ └───────────┘ └───────────┘         │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │                 Private Subnet (AZ-3)                │  │  │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐         │  │  │
│  │  │  │ Master 3  │ │ Infra 3   │ │ Worker 3  │         │  │  │
│  │  │  └───────────┘ └───────────┘ └───────────┘         │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐                       │  │
│  │  │ NLB (API)    │  │ NLB (Ingress)│                       │  │
│  │  └──────────────┘  └──────────────┘                       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 ROSA with HCP アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│              Red Hat Managed Account                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Hosted Control Plane                          │  │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐               │  │
│  │  │ API Server│ │ etcd      │ │ Controller│               │  │
│  │  │           │ │           │ │ Manager   │               │  │
│  │  └───────────┘ └───────────┘ └───────────┘               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │ AWS PrivateLink                   │
│                              ▼                                   │
├─────────────────────────────────────────────────────────────────┤
│              Customer AWS Account                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                         VPC                                │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │              Worker Nodes Only                       │  │  │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐         │  │  │
│  │  │  │ Worker 1  │ │ Worker 2  │ │ Worker 3  │         │  │  │
│  │  │  │           │ │           │ │           │         │  │  │
│  │  │  └───────────┘ └───────────┘ └───────────┘         │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

利点:
- コントロールプレーンコスト削減
- 高速なクラスター作成（約10分）
- マルチテナント効率化
```

---

## 4. 前提条件とセットアップ

### 4.1 AWS前提条件

```bash
# サービスクォータ確認
aws service-quotas get-service-quota \
  --service-code ec2 \
  --quota-code L-1216C47A  # Running On-Demand Standard instances

# 必要なクォータ（最小構成）
# - EC2 vCPU: 100以上
# - EBS gp3: 500GB以上
# - Elastic IP: 5以上
# - VPC: 1以上
# - NAT Gateway: 1以上

# ROSA サービス有効化
aws configure  # リージョン設定

# ELB サービスリンクロール確認
aws iam get-role --role-name AWSServiceRoleForElasticLoadBalancing
```

### 4.2 ROSAツールセットアップ

```bash
# ROSA CLIインストール
# Linux
curl -O https://mirror.openshift.com/pub/openshift-v4/clients/rosa/latest/rosa-linux.tar.gz
tar xvf rosa-linux.tar.gz
sudo mv rosa /usr/local/bin/

# macOS
brew install rosa-cli

# バージョン確認
rosa version

# OpenShift CLI (oc) インストール
curl -O https://mirror.openshift.com/pub/openshift-v4/clients/ocp/latest/openshift-client-linux.tar.gz
tar xvf openshift-client-linux.tar.gz
sudo mv oc kubectl /usr/local/bin/

# oc バージョン確認
oc version
```

### 4.3 ROSA初期設定

```bash
# Red Hat アカウントでログイン
rosa login

# AWS アカウント検証
rosa verify permissions
rosa verify quota

# ROSA有効化（初回のみ）
rosa enable

# アカウント情報確認
rosa whoami
```

---

## 5. クラスター作成

### 5.1 ROSA Classic クラスター作成

```bash
# インタラクティブモード
rosa create cluster --interactive

# CLIオプション指定
rosa create cluster \
  --cluster-name my-rosa-cluster \
  --region ap-northeast-1 \
  --version 4.14.10 \
  --compute-machine-type m5.xlarge \
  --replicas 3 \
  --machine-cidr 10.0.0.0/16 \
  --service-cidr 172.30.0.0/16 \
  --pod-cidr 10.128.0.0/14 \
  --host-prefix 23 \
  --multi-az \
  --enable-autoscaling \
  --min-replicas 3 \
  --max-replicas 6

# クラスター状態確認（約40分）
rosa describe cluster --cluster my-rosa-cluster
rosa logs install --cluster my-rosa-cluster --watch
```

### 5.2 ROSA with HCP クラスター作成

```bash
# HCPクラスター作成（推奨）
rosa create cluster \
  --cluster-name my-hcp-cluster \
  --hosted-cp \
  --region ap-northeast-1 \
  --version 4.14.10 \
  --compute-machine-type m5.xlarge \
  --replicas 2 \
  --subnet-ids subnet-xxx,subnet-yyy \
  --enable-autoscaling \
  --min-replicas 2 \
  --max-replicas 10

# クラスター状態確認（約10-15分）
rosa describe cluster --cluster my-hcp-cluster
```

### 5.3 既存VPCへのデプロイ

```bash
# VPCサブネット指定
rosa create cluster \
  --cluster-name rosa-existing-vpc \
  --hosted-cp \
  --subnet-ids subnet-private-1a,subnet-private-1c,subnet-private-1d \
  --machine-cidr 10.0.0.0/16

# プライベートクラスター（インターネット接続なし）
rosa create cluster \
  --cluster-name rosa-private \
  --hosted-cp \
  --private \
  --subnet-ids subnet-private-1a,subnet-private-1c
```

### 5.4 クラスター管理コマンド

```bash
# クラスター一覧
rosa list clusters

# クラスター詳細
rosa describe cluster --cluster my-rosa-cluster

# クラスター削除
rosa delete cluster --cluster my-rosa-cluster --watch

# Operator Roles作成（STS使用時）
rosa create operator-roles --cluster my-rosa-cluster

# OIDC Provider作成
rosa create oidc-provider --cluster my-rosa-cluster
```

---

## 6. 認証とアクセス管理

### 6.1 クラスター管理者作成

```bash
# cluster-admin ユーザー作成
rosa create admin --cluster my-rosa-cluster

# 出力例:
# W: It is recommended to add an identity provider to login to this cluster.
# I: Admin account has been added to cluster 'my-rosa-cluster'.
# I: Please securely store this generated password.
# I: To login, run the following command:
#    oc login https://api.my-rosa-cluster.xxx.p1.openshiftapps.com:6443 \
#      --username cluster-admin --password XXXX-XXXX-XXXX-XXXX

# ログイン
oc login https://api.my-rosa-cluster.xxx.p1.openshiftapps.com:6443 \
  --username cluster-admin --password XXXX-XXXX-XXXX-XXXX
```

### 6.2 Identity Provider設定

```bash
# GitHub IDP追加
rosa create idp \
  --cluster my-rosa-cluster \
  --type github \
  --name github-idp \
  --client-id <github-oauth-app-client-id> \
  --client-secret <github-oauth-app-client-secret> \
  --organizations my-org

# LDAP IDP追加
rosa create idp \
  --cluster my-rosa-cluster \
  --type ldap \
  --name ldap-idp \
  --url ldaps://ldap.example.com:636/ou=users,dc=example,dc=com \
  --bind-dn cn=admin,dc=example,dc=com \
  --bind-password <password> \
  --id-attributes uid \
  --name-attributes cn \
  --email-attributes mail

# Google IDP追加
rosa create idp \
  --cluster my-rosa-cluster \
  --type google \
  --name google-idp \
  --client-id <google-client-id> \
  --client-secret <google-client-secret> \
  --hosted-domain example.com

# IDP一覧
rosa list idps --cluster my-rosa-cluster
```

### 6.3 ユーザー/グループ管理

```bash
# ユーザーにcluster-admin権限付与
rosa grant user cluster-admin \
  --cluster my-rosa-cluster \
  --user developer@example.com

# dedicated-admin権限付与（クラスター設定以外の管理権限）
rosa grant user dedicated-admin \
  --cluster my-rosa-cluster \
  --user team-lead@example.com

# グループ作成とロール割り当て
oc adm groups new developers
oc adm groups add-users developers user1 user2
oc adm policy add-role-to-group edit developers -n my-project
```

### 6.4 STS (Secure Token Service) 認証

```
┌─────────────────────────────────────────────────────────────┐
│                 ROSA STS 認証フロー                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐        ┌─────────────┐                    │
│  │ ROSA        │        │ AWS STS     │                    │
│  │ Operator    │───────▶│             │                    │
│  │             │        │ AssumeRole  │                    │
│  └─────────────┘        └──────┬──────┘                    │
│                                │                            │
│                                ▼                            │
│                       ┌─────────────┐                       │
│                       │ IAM Role    │                       │
│                       │ (短期認証)  │                       │
│                       └──────┬──────┘                       │
│                              │                              │
│                              ▼                              │
│                       ┌─────────────┐                       │
│                       │ AWSサービス │                       │
│                       │ (S3, EC2等) │                       │
│                       └─────────────┘                       │
│                                                             │
│  利点:                                                      │
│  - 長期認証情報不要                                         │
│  - 最小権限の原則                                           │
│  - 監査可能                                                 │
└─────────────────────────────────────────────────────────────┘
```

```bash
# STS使用のクラスター作成
rosa create cluster \
  --cluster-name sts-cluster \
  --sts \
  --mode auto

# Account Roles確認
rosa list account-roles

# Operator Roles確認
rosa list operator-roles --cluster sts-cluster
```

---

## 7. アプリケーションデプロイ

### 7.1 OpenShift Web Console

```bash
# Web Consoleアクセス
rosa describe cluster --cluster my-rosa-cluster | grep Console

# URL例: https://console-openshift-console.apps.my-rosa-cluster.xxx.p1.openshiftapps.com
```

### 7.2 プロジェクト（Namespace）作成

```bash
# 新規プロジェクト作成
oc new-project my-application \
  --display-name="My Application" \
  --description="Production application"

# プロジェクト切替
oc project my-application

# プロジェクト一覧
oc get projects
```

### 7.3 Source-to-Image (S2I) デプロイ

```bash
# GitリポジトリからS2Iビルド
oc new-app https://github.com/sclorg/nodejs-ex.git \
  --name=nodejs-app

# ビルド状況確認
oc logs -f buildconfig/nodejs-app

# Routeでアプリ公開
oc expose service nodejs-app

# アクセス確認
oc get route nodejs-app
```

### 7.4 コンテナイメージからデプロイ

```bash
# DockerHubイメージからデプロイ
oc new-app nginx:latest --name=nginx

# ECRイメージからデプロイ（認証設定必要）
oc create secret docker-registry ecr-secret \
  --docker-server=123456789012.dkr.ecr.ap-northeast-1.amazonaws.com \
  --docker-username=AWS \
  --docker-password=$(aws ecr get-login-password)

oc new-app 123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-app:latest \
  --name=my-ecr-app

oc secrets link default ecr-secret --for=pull
```

### 7.5 Helmチャートデプロイ

```bash
# Helmリポジトリ追加
helm repo add bitnami https://charts.bitnami.com/bitnami

# チャートインストール
helm install my-release bitnami/postgresql \
  --set auth.postgresPassword=mypassword \
  --namespace databases

# OpenShiftカタログからインストール（Web Console推奨）
oc get packagemanifest -n openshift-marketplace | grep postgresql
```

---

## 8. ネットワーキング

### 8.1 OpenShift Router (Ingress)

```
┌─────────────────────────────────────────────────────────────┐
│              OpenShift Router アーキテクチャ                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  インターネット                                              │
│        │                                                    │
│        ▼                                                    │
│  ┌─────────────┐                                           │
│  │ AWS NLB     │                                           │
│  │ (Ingress)   │                                           │
│  └──────┬──────┘                                           │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────────────────────────────┐               │
│  │         OpenShift Router (HAProxy)       │               │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐   │               │
│  │  │Router 1 │ │Router 2 │ │Router 3 │   │               │
│  │  │(Infra 1)│ │(Infra 2)│ │(Infra 3)│   │               │
│  │  └─────────┘ └─────────┘ └─────────┘   │               │
│  └─────────────────────────────────────────┘               │
│                    │                                        │
│         Route/Host │ ベースルーティング                     │
│                    ▼                                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │  App1 Pod   │ │  App2 Pod   │ │  App3 Pod   │          │
│  │ app1.apps...│ │ app2.apps...│ │ app3.apps...│          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Route設定

```yaml
# 基本Route
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: my-app-route
  namespace: my-project
spec:
  host: my-app.apps.my-rosa-cluster.xxx.p1.openshiftapps.com
  to:
    kind: Service
    name: my-app
    weight: 100
  port:
    targetPort: 8080
  tls:
    termination: edge
    insecureEdgeTerminationPolicy: Redirect

# パスベースルーティング
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: api-route
spec:
  host: app.example.com
  path: /api
  to:
    kind: Service
    name: api-service
```

### 8.3 カスタムドメイン設定

```bash
# カスタムドメイン用TLS証明書
oc create secret tls custom-domain-cert \
  --cert=/path/to/cert.pem \
  --key=/path/to/key.pem \
  -n openshift-ingress

# Routeでカスタムドメイン使用
cat << EOF | oc apply -f -
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: custom-domain-route
spec:
  host: app.example.com
  to:
    kind: Service
    name: my-app
  tls:
    termination: edge
    certificate: |
      -----BEGIN CERTIFICATE-----
      ...
      -----END CERTIFICATE-----
    key: |
      -----BEGIN RSA PRIVATE KEY-----
      ...
      -----END RSA PRIVATE KEY-----
EOF
```

### 8.4 Network Policy

```yaml
# デフォルト拒否
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress

# 特定ラベルからのみ許可
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: backend
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
      ports:
        - port: 8080
```

---

## 9. ストレージ

### 9.1 StorageClass

```bash
# 利用可能なStorageClass確認
oc get storageclass

# 出力例:
# NAME            PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE
# gp3             ebs.csi.aws.com         Delete          WaitForFirstConsumer
# gp3-csi         ebs.csi.aws.com         Delete          WaitForFirstConsumer
# gp2             kubernetes.io/aws-ebs   Delete          WaitForFirstConsumer
```

### 9.2 PersistentVolumeClaim

```yaml
# EBS gp3 PVC
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-data
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: gp3-csi
  resources:
    requests:
      storage: 50Gi
```

```bash
# PVCでStatefulSet
cat << 'EOF' | oc apply -f -
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:14
          ports:
            - containerPort: 5432
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
          env:
            - name: POSTGRES_PASSWORD
              value: mysecretpassword
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: gp3-csi
        resources:
          requests:
            storage: 20Gi
EOF
```

### 9.3 EFS (共有ストレージ)

```bash
# AWS EFS CSI Driver Operator インストール（OperatorHub経由）
# Operator → OperatorHub → AWS EFS CSI Driver Operator

# EFS StorageClass作成
cat << EOF | oc apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: efs-sc
provisioner: efs.csi.aws.com
parameters:
  provisioningMode: efs-ap
  fileSystemId: fs-12345678
  directoryPerms: "700"
EOF

# ReadWriteMany PVC
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: shared-data
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: efs-sc
  resources:
    requests:
      storage: 100Gi
```

---

## 10. モニタリング・ロギング

### 10.1 組み込みモニタリング

```bash
# Prometheusエンドポイント確認
oc get route -n openshift-monitoring

# Grafanaダッシュボード（OpenShift Monitoring）
oc get route grafana -n openshift-monitoring

# アラート確認
oc get alertmanagerconfig -n openshift-monitoring
```

### 10.2 ユーザーワークロードモニタリング有効化

```yaml
# ConfigMap編集
oc edit configmap cluster-monitoring-config -n openshift-monitoring

apiVersion: v1
kind: ConfigMap
metadata:
  name: cluster-monitoring-config
  namespace: openshift-monitoring
data:
  config.yaml: |
    enableUserWorkload: true
```

```yaml
# アプリケーション用ServiceMonitor
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: my-app-monitor
  namespace: my-project
spec:
  selector:
    matchLabels:
      app: my-app
  endpoints:
    - port: metrics
      interval: 30s
```

### 10.3 CloudWatch統合

```bash
# CloudWatch Container Insights（オプション）
rosa install addon --cluster my-rosa-cluster \
  cloudwatch-container-insights

# または手動設定
oc create namespace amazon-cloudwatch
oc apply -f https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/quickstart/cwagent-fluent-bit-quickstart.yaml
```

### 10.4 ログ集約

```bash
# OpenShift Loggingインストール
# OperatorHub → OpenShift Logging → Install

# ClusterLogging設定
cat << EOF | oc apply -f -
apiVersion: logging.openshift.io/v1
kind: ClusterLogging
metadata:
  name: instance
  namespace: openshift-logging
spec:
  managementState: Managed
  logStore:
    type: elasticsearch
    elasticsearch:
      nodeCount: 3
      storage:
        storageClassName: gp3-csi
        size: 200G
  visualization:
    type: kibana
  collection:
    logs:
      type: fluentd
EOF
```

---

## 11. セキュリティ

### 11.1 Security Context Constraints (SCC)

```
┌─────────────────────────────────────────────────────────────┐
│              Security Context Constraints (SCC)              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  【デフォルトSCC一覧（厳格順）】                             │
│                                                             │
│  restricted-v2 ← 最も厳格（デフォルト）                     │
│    │  - root実行不可                                        │
│    │  - 特権コンテナ不可                                    │
│    │  - ホストネットワーク不可                              │
│    ▼                                                        │
│  nonroot-v2                                                 │
│    │  - non-root必須                                        │
│    ▼                                                        │
│  hostnetwork-v2                                             │
│    │  - ホストネットワーク許可                              │
│    ▼                                                        │
│  hostaccess                                                 │
│    │  - ホストディレクトリアクセス許可                      │
│    ▼                                                        │
│  privileged ← 最も緩い                                      │
│       - 全て許可（管理コンポーネント用）                    │
│                                                             │
│  EKSのPSS (Pod Security Standards) より厳格                 │
└─────────────────────────────────────────────────────────────┘
```

```bash
# SCC一覧
oc get scc

# サービスアカウントにSCC割り当て
oc adm policy add-scc-to-user anyuid -z my-service-account -n my-project

# Pod使用中のSCC確認
oc get pod my-pod -o yaml | grep openshift.io/scc
```

### 11.2 RBAC設定

```bash
# ClusterRole一覧
oc get clusterroles | grep -E '^(admin|edit|view|cluster)'

# RoleBinding作成
oc create rolebinding developer-binding \
  --clusterrole=edit \
  --user=developer@example.com \
  --namespace=my-project

# ClusterRoleBinding（クラスター全体）
oc create clusterrolebinding cluster-viewer \
  --clusterrole=view \
  --group=viewers
```

### 11.3 イメージセキュリティ

```bash
# イメージストリームインポート
oc import-image my-app:v1 \
  --from=docker.io/myrepo/my-app:v1 \
  --confirm

# イメージ署名検証設定
oc get image.config.openshift.io/cluster -o yaml

# 許可レジストリ設定
oc edit image.config.openshift.io/cluster

spec:
  registrySources:
    allowedRegistries:
      - docker.io
      - quay.io
      - 123456789012.dkr.ecr.ap-northeast-1.amazonaws.com
    blockedRegistries:
      - untrusted-registry.example.com
```

---

## 12. 運用管理

### 12.1 クラスターアップグレード

```bash
# 利用可能バージョン確認
rosa list upgrade --cluster my-rosa-cluster

# アップグレードスケジュール
rosa upgrade cluster \
  --cluster my-rosa-cluster \
  --version 4.14.15 \
  --schedule-date 2024-03-01 \
  --schedule-time 03:00

# アップグレード状況確認
rosa describe upgrade --cluster my-rosa-cluster
```

### 12.2 マシンプール管理

```bash
# マシンプール追加
rosa create machinepool \
  --cluster my-rosa-cluster \
  --name spot-workers \
  --instance-type m5.xlarge \
  --replicas 3 \
  --use-spot-instances \
  --spot-max-price 0.10

# マシンプール一覧
rosa list machinepools --cluster my-rosa-cluster

# マシンプールスケール
rosa edit machinepool \
  --cluster my-rosa-cluster \
  --replicas 5 \
  spot-workers

# オートスケーリング設定
rosa edit machinepool \
  --cluster my-rosa-cluster \
  --enable-autoscaling \
  --min-replicas 2 \
  --max-replicas 10 \
  spot-workers
```

### 12.3 メンテナンスウィンドウ

```bash
# メンテナンススケジュール確認
rosa describe cluster --cluster my-rosa-cluster | grep -A5 "Maintenance"

# メンテナンスウィンドウ変更（サポートチケット経由）
```

### 12.4 バックアップとリストア

```bash
# OpenShift API for Data Protection (OADP) インストール
# OperatorHub → OADP Operator

# バックアップロケーション設定
cat << EOF | oc apply -f -
apiVersion: oadp.openshift.io/v1alpha1
kind: DataProtectionApplication
metadata:
  name: dpa
  namespace: openshift-adp
spec:
  configuration:
    velero:
      defaultPlugins:
        - aws
    restic:
      enable: true
  backupLocations:
    - velero:
        config:
          region: ap-northeast-1
          profile: default
        default: true
        provider: aws
        objectStorage:
          bucket: my-backup-bucket
          prefix: rosa
        credential:
          name: cloud-credentials
          key: cloud
EOF

# バックアップ実行
cat << EOF | oc apply -f -
apiVersion: velero.io/v1
kind: Backup
metadata:
  name: my-app-backup
  namespace: openshift-adp
spec:
  includedNamespaces:
    - my-project
  storageLocation: dpa-1
EOF
```

---

## 13. ハンズオン演習

### 演習1: ROSAクラスター作成

```bash
# 1. 前提条件確認
rosa verify quota
rosa verify permissions

# 2. クラスター作成（HCP推奨）
rosa create cluster \
  --cluster-name handson-rosa \
  --hosted-cp \
  --region ap-northeast-1 \
  --version 4.14 \
  --compute-machine-type m5.xlarge \
  --replicas 2

# 3. 完了待機（約10-15分）
rosa describe cluster --cluster handson-rosa --watch

# 4. 管理者作成
rosa create admin --cluster handson-rosa

# 5. ログイン
oc login <api-url> --username cluster-admin --password <password>

# 6. 確認
oc get nodes
oc get clusterversion
```

### 演習2: S2Iアプリケーションデプロイ

```bash
# 1. プロジェクト作成
oc new-project s2i-demo

# 2. S2Iでアプリデプロイ
oc new-app python:3.9-ubi8~https://github.com/sclorg/django-ex.git \
  --name=django-app

# 3. ビルド監視
oc logs -f bc/django-app

# 4. Route公開
oc expose svc/django-app

# 5. アクセス確認
oc get route django-app
curl $(oc get route django-app -o jsonpath='{.spec.host}')
```

### 演習3: Identity Provider設定

```bash
# 1. HTPasswd IDP作成（テスト用）
htpasswd -c -B -b users.htpasswd user1 password1
htpasswd -B -b users.htpasswd user2 password2

# 2. Secret作成
oc create secret generic htpass-secret \
  --from-file=htpasswd=users.htpasswd \
  -n openshift-config

# 3. OAuth設定更新
oc edit oauth cluster

# spec.identityProviders に追加:
# - name: htpasswd
#   mappingMethod: claim
#   type: HTPasswd
#   htpasswd:
#     fileData:
#       name: htpass-secret

# 4. ユーザーログインテスト
oc login -u user1 -p password1
```

### 演習4: オートスケーリング設定

```bash
# 1. HPA対象アプリデプロイ
oc new-project autoscale-demo
oc new-app php:7.4-ubi8~https://github.com/sclorg/cakephp-ex.git \
  --name=php-app

# 2. リソース制限設定
oc set resources deployment/php-app \
  --limits=cpu=200m,memory=256Mi \
  --requests=cpu=100m,memory=128Mi

# 3. HPA作成
oc autoscale deployment/php-app \
  --min=1 --max=10 --cpu-percent=50

# 4. 負荷テスト
oc run load-generator --rm -i --tty \
  --image=busybox \
  --restart=Never \
  -- /bin/sh -c "while true; do wget -q -O- http://php-app:8080; done"

# 5. スケール確認
oc get hpa -w
```

### 演習5: Network Policy

```bash
# 1. テスト環境作成
oc new-project netpol-demo

oc new-app nginx --name=web
oc new-app nginx --name=api
oc expose svc/web

# 2. 初期状態確認（通信可能）
oc exec deploy/web -- curl -s http://api:8080

# 3. デフォルト拒否Policy
cat << EOF | oc apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all
  namespace: netpol-demo
spec:
  podSelector: {}
  policyTypes:
    - Ingress
EOF

# 4. 通信確認（タイムアウト）
oc exec deploy/web -- curl -s --max-time 3 http://api:8080

# 5. webからapiへの通信許可
cat << EOF | oc apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-web-to-api
  namespace: netpol-demo
spec:
  podSelector:
    matchLabels:
      deployment: api
  ingress:
    - from:
        - podSelector:
            matchLabels:
              deployment: web
      ports:
        - port: 8080
EOF

# 6. 通信確認（成功）
oc exec deploy/web -- curl -s http://api:8080
```

### 演習6: 永続ストレージ

```bash
# 1. PVC作成
cat << EOF | oc apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-pvc
  namespace: netpol-demo
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: gp3-csi
  resources:
    requests:
      storage: 10Gi
EOF

# 2. Podでマウント
cat << EOF | oc apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: storage-test
  namespace: netpol-demo
spec:
  containers:
    - name: test
      image: nginx
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: data-pvc
EOF

# 3. データ書き込みテスト
oc exec storage-test -- sh -c "echo 'Hello ROSA' > /data/test.txt"
oc exec storage-test -- cat /data/test.txt

# 4. Pod削除後もデータ永続化確認
oc delete pod storage-test
# 再作成後
oc exec storage-test -- cat /data/test.txt
```

### 演習7: クリーンアップ

```bash
# プロジェクト削除
oc delete project s2i-demo autoscale-demo netpol-demo

# クラスター削除
rosa delete cluster --cluster handson-rosa --watch

# Operator Roles削除
rosa delete operator-roles --cluster handson-rosa

# OIDC Provider削除
rosa delete oidc-provider --cluster handson-rosa
```

---

## 14. DOP試験対策チェックリスト

### Q1: ROSAとEKSの選択基準

**問題**: エンタープライズでKubernetesプラットフォームを選択する際、ROSAを選ぶべき状況は？

**解答**:
- 既存のRed Hat/OpenShiftスキルセットがある
- 統合されたCI/CD、Service Mesh、Operatorエコシステムが必要
- 厳格なセキュリティ要件（SCC）
- Red Hatサポートが必要
- コストより運用効率を重視

---

### Q2: ROSAデプロイモデル

**問題**: ROSA ClassicとROSA with HCPの違いは？

**解答**:

| 項目 | ROSA Classic | ROSA with HCP |
|------|-------------|---------------|
| コントロールプレーン | 顧客VPC内 | Red Hat管理 |
| 作成時間 | 約40分 | 約10-15分 |
| コスト | 高い | 30-50%削減 |
| スケーラビリティ | 制限あり | 高い |
| **推奨** | レガシー | **新規推奨** |

---

### Q3: ROSA認証設定

**問題**: ROSAクラスターで企業のActive Directoryと連携する方法は？

**解答**: **LDAP Identity Provider** を設定

```bash
rosa create idp \
  --cluster my-cluster \
  --type ldap \
  --name corp-ldap \
  --url ldaps://ad.example.com:636/dc=example,dc=com \
  --bind-dn cn=admin,dc=example,dc=com \
  --bind-password <password>
```

---

### Q4: SCC (Security Context Constraints)

**問題**: OpenShiftでroot権限が必要なコンテナを実行する方法は？

**解答**: サービスアカウントに適切なSCCを付与

```bash
# anyuid SCCを付与（root許可）
oc adm policy add-scc-to-user anyuid -z my-sa -n my-project

# PodでServiceAccount指定
spec:
  serviceAccountName: my-sa
```

**注意**: 本番環境では可能な限り`restricted-v2`を使用し、必要最小限の権限に留める

---

### Q5: ROSAアップグレード戦略

**問題**: ROSAクラスターのアップグレード時のダウンタイムを最小化する方法は？

**解答**:
1. **コントロールプレーン**: Red Hat管理で自動ローリングアップグレード
2. **ワーカーノード**: Machine Pool単位でローリング更新
3. **スケジュール設定**: メンテナンスウィンドウでの計画アップグレード

```bash
rosa upgrade cluster \
  --cluster my-cluster \
  --version 4.14.15 \
  --schedule-date 2024-03-01 \
  --schedule-time 03:00
```

---

### Q6: ROSAでのAWSサービス統合

**問題**: ROSAのPodからS3バケットにアクセスする最も安全な方法は？

**解答**: **STS (Secure Token Service)** を使用したIRSA相当の機能

```bash
# STSクラスター作成時に自動設定
rosa create cluster --sts --mode auto

# Pod用のIAMロール設定
oc create serviceaccount s3-access
oc annotate serviceaccount s3-access \
  eks.amazonaws.com/role-arn=arn:aws:iam::123456789012:role/S3AccessRole
```

---

## 付録: よく使うコマンド

```bash
# ROSA CLI
rosa login
rosa create cluster --hosted-cp ...
rosa describe cluster --cluster <name>
rosa create admin --cluster <name>
rosa create idp --cluster <name> --type github ...
rosa list machinepools --cluster <name>
rosa delete cluster --cluster <name>

# OpenShift CLI (oc)
oc login <api-url> --username <user> --password <pass>
oc new-project <name>
oc new-app <source-url>
oc expose svc/<name>
oc get route
oc get pods -o wide
oc logs -f deploy/<name>
oc exec -it <pod> -- /bin/bash
oc adm policy add-scc-to-user <scc> -z <sa> -n <ns>

# デバッグ
oc describe pod <name>
oc get events --sort-by='.lastTimestamp'
oc adm top nodes
oc adm top pods
```
