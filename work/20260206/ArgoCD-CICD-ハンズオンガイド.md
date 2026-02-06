# ArgoCD CI/CD ハンズオンガイド

> **対象**: AWS DevOps Professional (DOP-C02) / Kubernetes CI/CD 学習
> **前提知識**: Kubernetes基礎、Git、Docker、AWS EKS
> **所要時間**: 約4時間

---

## 目次

1. [ArgoCD概要](#1-argocd概要)
2. [GitOpsの原則](#2-gitopsの原則)
3. [アーキテクチャ](#3-アーキテクチャ)
4. [EKSへのArgoCD導入](#4-eksへのargocd導入)
5. [Application設定](#5-application設定)
6. [同期戦略と自動化](#6-同期戦略と自動化)
7. [マルチクラスター管理](#7-マルチクラスター管理)
8. [ApplicationSet](#8-applicationset)
9. [CI/CDパイプライン統合](#9-cicdパイプライン統合)
10. [ハンズオン演習](#10-ハンズオン演習)
11. [DOP試験対策チェックリスト](#11-dop試験対策チェックリスト)

---

## 1. ArgoCD概要

### 1.1 ArgoCDとは

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Argo CD                                     │
│        Kubernetes向けGitOps継続的デリバリーツール                    │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                  GitOps ワークフロー                           │  │
│  │                                                               │  │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐              │  │
│  │  │   Git    │    │ Argo CD  │    │Kubernetes│              │  │
│  │  │Repository│───▶│ Controller│───▶│ Cluster  │              │  │
│  │  │          │    │          │    │          │              │  │
│  │  │ マニフェスト│    │ 差分検出  │    │ リソース │              │  │
│  │  │ の真実源  │    │ 同期実行  │    │ デプロイ │              │  │
│  │  └──────────┘    └──────────┘    └──────────┘              │  │
│  │                                                               │  │
│  │         ↑ Push                    ↓ 監視                     │  │
│  │  ┌──────────┐                                                │  │
│  │  │ 開発者   │                                                │  │
│  │  │ Pull     │                                                │  │
│  │  │ Request  │                                                │  │
│  │  └──────────┘                                                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  主要機能:                                                          │
│  ・自動同期（Git→クラスター）                                       │
│  ・差分検出とドリフト通知                                           │
│  ・ロールバック                                                    │
│  ・マルチクラスター管理                                             │
│  ・RBAC/SSO統合                                                    │
│  ・Webhook対応                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 DOP試験での位置づけ

| トピック | 重要度 | 出題パターン |
|---------|--------|-------------|
| **GitOps原則** | ★★★★★ | 宣言的設定、Gitを真実の源に |
| **同期戦略** | ★★★★★ | 自動同期 vs 手動同期 |
| **EKS統合** | ★★★★☆ | AWS環境でのArgoCD活用 |
| **マルチクラスター** | ★★★★☆ | 複数環境への展開 |
| **ロールバック** | ★★★★☆ | 問題発生時の迅速な復旧 |
| **CI/CDパイプライン統合** | ★★★★☆ | CodePipeline/GitHub Actionsとの連携 |

---

## 2. GitOpsの原則

### 2.1 GitOps 4原則

```
【GitOps 4つの原則】

1. 宣言的 (Declarative)
   ┌─────────────────────────────────────────────┐
   │ システムの望ましい状態を宣言的に記述         │
   │ → YAML/JSON マニフェスト                    │
   │ → 「何をデプロイするか」を定義              │
   └─────────────────────────────────────────────┘

2. バージョン管理・不変 (Versioned and Immutable)
   ┌─────────────────────────────────────────────┐
   │ 望ましい状態はGitに保存                     │
   │ → 全変更の履歴が残る                        │
   │ → いつでも過去の状態に戻せる               │
   └─────────────────────────────────────────────┘

3. 自動プル (Pulled Automatically)
   ┌─────────────────────────────────────────────┐
   │ ソフトウェアエージェントが自動で変更を取得  │
   │ → Push型ではなくPull型                      │
   │ → クラスターからGitをポーリング            │
   └─────────────────────────────────────────────┘

4. 継続的調整 (Continuously Reconciled)
   ┌─────────────────────────────────────────────┐
   │ エージェントが継続的に望ましい状態を維持    │
   │ → ドリフト（意図しない変更）を自動修正     │
   │ → 自己修復機能                              │
   └─────────────────────────────────────────────┘
```

### 2.2 従来のCI/CD vs GitOps

```
【従来のPush型CI/CD】
┌──────┐  ┌──────┐  ┌──────┐  ┌──────────┐
│ Code │─▶│Build │─▶│ Test │─▶│  Deploy  │
│      │  │      │  │      │  │ (kubectl)│
└──────┘  └──────┘  └──────┘  └──────────┘
                                    │
                                    ▼ Push
                              ┌──────────┐
                              │ Cluster  │
                              └──────────┘
問題点:
- CIシステムがクラスターへの認証情報を持つ
- クラスター状態とGitの乖離が起きやすい
- 監査証跡が分散

【GitOps（Pull型）】
┌──────┐  ┌──────┐  ┌──────┐  ┌──────────┐
│ Code │─▶│Build │─▶│ Test │─▶│ Git Push │
│      │  │      │  │      │  │(manifest)│
└──────┘  └──────┘  └──────┘  └──────────┘
                                    │
                              ┌─────┴─────┐
                              │ Git Repo  │
                              │ (真実の源)│
                              └─────┬─────┘
                                    │ Pull
                              ┌─────▼─────┐
                              │ Argo CD   │
                              │ (クラスター内)│
                              └─────┬─────┘
                                    │ Apply
                              ┌─────▼─────┐
                              │ Cluster   │
                              └───────────┘
利点:
- 認証情報がクラスター内に閉じる
- Gitが唯一の真実の源
- 監査証跡がGit履歴に集約
```

---

## 3. アーキテクチャ

### 3.1 ArgoCDコンポーネント

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Argo CD アーキテクチャ                           │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    argocd Namespace                           │  │
│  │                                                               │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                   │  │
│  │  │ argocd-server   │  │ argocd-repo-    │                   │  │
│  │  │ (API/Web UI)    │  │ server          │                   │  │
│  │  │                 │  │ (Git操作)        │                   │  │
│  │  │ ・REST API      │  │                 │                   │  │
│  │  │ ・gRPC API      │  │ ・Git clone     │                   │  │
│  │  │ ・Web Dashboard │  │ ・マニフェスト  │                   │  │
│  │  │ ・認証/認可     │  │   生成          │                   │  │
│  │  └────────┬────────┘  └────────┬────────┘                   │  │
│  │           │                    │                             │  │
│  │  ┌────────▼────────────────────▼────────┐                   │  │
│  │  │      argocd-application-controller   │                   │  │
│  │  │      (コア コントローラー)             │                   │  │
│  │  │                                      │                   │  │
│  │  │  ・Gitリポジトリの監視               │                   │  │
│  │  │  ・クラスター状態との差分検出        │                   │  │
│  │  │  ・同期（Sync）実行                  │                   │  │
│  │  │  ・ヘルスチェック                    │                   │  │
│  │  └──────────────────────────────────────┘                   │  │
│  │                                                               │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                   │  │
│  │  │ argocd-dex-     │  │ argocd-redis   │                   │  │
│  │  │ server          │  │                │                   │  │
│  │  │ (SSO/OIDC)      │  │ (キャッシュ)   │                   │  │
│  │  └─────────────────┘  └─────────────────┘                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Applicationリソース

```yaml
# ArgoCD Application の構造
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app
  namespace: argocd
spec:
  # デプロイ先クラスター・Namespace
  destination:
    server: https://kubernetes.default.svc
    namespace: production

  # ソース（Gitリポジトリ）
  source:
    repoURL: https://github.com/myorg/my-app.git
    targetRevision: main
    path: manifests/production

  # プロジェクト（RBAC用グループ）
  project: default

  # 同期ポリシー
  syncPolicy:
    automated:
      prune: true      # 削除されたリソースを自動削除
      selfHeal: true   # ドリフトを自動修正
    syncOptions:
      - CreateNamespace=true
```

---

## 4. EKSへのArgoCD導入

### 4.1 インストール方法

```bash
# 1. EKSクラスターに接続
aws eks update-kubeconfig --name my-cluster --region ap-northeast-1

# 2. argocd Namespace作成
kubectl create namespace argocd

# 3. ArgoCDインストール（公式マニフェスト）
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# 4. インストール確認
kubectl get pods -n argocd
kubectl get svc -n argocd

# 5. 初期管理者パスワード取得
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# 6. ArgoCD CLIインストール（オプション）
curl -sSL -o argocd-linux-amd64 https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
sudo install -m 555 argocd-linux-amd64 /usr/local/bin/argocd
rm argocd-linux-amd64
```

### 4.2 外部アクセス設定

```bash
# 方法1: LoadBalancer (AWS ALB/NLB)
kubectl patch svc argocd-server -n argocd -p '{"spec": {"type": "LoadBalancer"}}'

# 方法2: Ingress (AWS ALB Ingress Controller)
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd-server-ingress
  namespace: argocd
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:ap-northeast-1:123456789012:certificate/xxx
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/backend-protocol: HTTPS
spec:
  rules:
    - host: argocd.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: argocd-server
                port:
                  number: 443
EOF

# 方法3: Port-forward（ローカルテスト用）
kubectl port-forward svc/argocd-server -n argocd 8080:443
# ブラウザで https://localhost:8080 にアクセス
```

### 4.3 CLIログイン

```bash
# サーバーアドレス取得
ARGOCD_SERVER=$(kubectl get svc argocd-server -n argocd -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# ログイン
argocd login ${ARGOCD_SERVER} --username admin --password <初期パスワード> --insecure

# パスワード変更
argocd account update-password
```

---

## 5. Application設定

### 5.1 Applicationの作成方法

```bash
# 方法1: CLI
argocd app create guestbook \
  --repo https://github.com/argoproj/argocd-example-apps.git \
  --path guestbook \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace default

# 方法2: 宣言的マニフェスト（推奨）
cat <<EOF | kubectl apply -f -
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD
    path: guestbook
  destination:
    server: https://kubernetes.default.svc
    namespace: default
EOF
```

### 5.2 Helmチャートのデプロイ

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nginx-ingress
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://kubernetes.github.io/ingress-nginx
    chart: ingress-nginx
    targetRevision: 4.7.1
    helm:
      releaseName: nginx-ingress
      values: |
        controller:
          replicaCount: 2
          service:
            type: LoadBalancer
      # または values.yaml ファイルを参照
      # valueFiles:
      #   - values-production.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: ingress-nginx
  syncPolicy:
    syncOptions:
      - CreateNamespace=true
```

### 5.3 Kustomizeのデプロイ

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app-production
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/my-app.git
    targetRevision: main
    path: kustomize/overlays/production
    # Kustomize オプション
    kustomize:
      namePrefix: prod-
      images:
        - my-app=123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-app:v1.2.3
  destination:
    server: https://kubernetes.default.svc
    namespace: production
```

---

## 6. 同期戦略と自動化

### 6.1 同期ポリシー

```yaml
spec:
  syncPolicy:
    # 自動同期
    automated:
      prune: true       # Gitから削除されたリソースをクラスターからも削除
      selfHeal: true    # 手動変更（ドリフト）を自動修正
      allowEmpty: false # 空のリソースセットを許可しない

    # 同期オプション
    syncOptions:
      - Validate=true              # マニフェスト検証
      - CreateNamespace=true       # Namespace自動作成
      - PrunePropagationPolicy=foreground  # 削除の伝播ポリシー
      - PruneLast=true             # 最後にPrune実行
      - ApplyOutOfSyncOnly=true    # 差分のみ適用
      - ServerSideApply=true       # サーバーサイド適用

    # リトライ設定
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

### 6.2 同期フェーズとフック

```
【同期フェーズ】

PreSync  ──▶  Sync  ──▶  PostSync  ──▶  SyncFail (失敗時)
   │           │            │              │
   ▼           ▼            ▼              ▼
DB Migration  Deploy    Notification    Rollback
              Resources  Integration     Alert
                        Tests
```

```yaml
# PreSync フック例（DBマイグレーション）
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
  annotations:
    argocd.argoproj.io/hook: PreSync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: my-app:latest
          command: ["./migrate.sh"]
      restartPolicy: Never
```

### 6.3 アプリケーション状態

```
【Application Status】

┌─────────────────────────────────────────────────────────────┐
│ Sync Status                                                 │
├─────────────────────────────────────────────────────────────┤
│ Synced      │ Gitとクラスターが一致                        │
│ OutOfSync   │ 差分あり（同期が必要）                       │
│ Unknown     │ 状態不明                                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Health Status                                               │
├─────────────────────────────────────────────────────────────┤
│ Healthy     │ 全リソースが正常                             │
│ Progressing │ デプロイ中                                   │
│ Degraded    │ 一部リソースに問題                           │
│ Suspended   │ 一時停止中                                   │
│ Missing     │ リソースが存在しない                         │
│ Unknown     │ 状態不明                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. マルチクラスター管理

### 7.1 クラスター登録

```bash
# 方法1: CLI（ServiceAccount + Token方式）
argocd cluster add arn:aws:eks:ap-northeast-1:123456789012:cluster/prod-cluster

# 方法2: 宣言的（Secret方式）
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: prod-cluster-secret
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: cluster
type: Opaque
stringData:
  name: prod-cluster
  server: https://xxxx.gr7.ap-northeast-1.eks.amazonaws.com
  config: |
    {
      "awsAuthConfig": {
        "clusterName": "prod-cluster",
        "roleARN": "arn:aws:iam::123456789012:role/ArgoCD-EKS-Role"
      }
    }
EOF
```

### 7.2 マルチクラスターアーキテクチャ

```
【Hub-Spoke パターン】

                    ┌──────────────────┐
                    │ Management       │
                    │ Cluster (Hub)    │
                    │                  │
                    │ ┌──────────────┐ │
                    │ │   ArgoCD     │ │
                    │ └──────┬───────┘ │
                    └────────┼─────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Dev Cluster    │ │ Staging Cluster │ │  Prod Cluster   │
│  (Spoke)        │ │ (Spoke)         │ │  (Spoke)        │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### 7.3 環境別デプロイ

```yaml
# dev-app.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app-dev
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/my-app.git
    targetRevision: develop
    path: kustomize/overlays/dev
  destination:
    server: https://dev-cluster.example.com
    namespace: my-app

---
# prod-app.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app-prod
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/my-app.git
    targetRevision: main
    path: kustomize/overlays/prod
  destination:
    server: https://prod-cluster.example.com
    namespace: my-app
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

---

## 8. ApplicationSet

### 8.1 ApplicationSetとは

```
【ApplicationSet コントローラー】

従来: 各環境ごとにApplication YAMLを作成
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ app-dev.yaml │ │ app-stg.yaml │ │app-prod.yaml │
└──────────────┘ └──────────────┘ └──────────────┘

ApplicationSet: テンプレートから複数Application自動生成
┌────────────────────────────────────────────────────┐
│           ApplicationSet (1つのYAML)               │
│                                                    │
│  Generator:  [dev, staging, prod]                  │
│  Template:   Application定義                        │
│                                                    │
│  → dev-app, staging-app, prod-app を自動生成      │
└────────────────────────────────────────────────────┘
```

### 8.2 Generator種類

```yaml
# List Generator
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: my-app
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - cluster: dev
            url: https://dev-cluster.example.com
          - cluster: staging
            url: https://staging-cluster.example.com
          - cluster: prod
            url: https://prod-cluster.example.com
  template:
    metadata:
      name: 'my-app-{{cluster}}'
    spec:
      project: default
      source:
        repoURL: https://github.com/myorg/my-app.git
        targetRevision: HEAD
        path: 'kustomize/overlays/{{cluster}}'
      destination:
        server: '{{url}}'
        namespace: my-app
```

```yaml
# Git Directory Generator
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: cluster-addons
  namespace: argocd
spec:
  generators:
    - git:
        repoURL: https://github.com/myorg/cluster-addons.git
        revision: HEAD
        directories:
          - path: addons/*
  template:
    metadata:
      name: '{{path.basename}}'
    spec:
      project: default
      source:
        repoURL: https://github.com/myorg/cluster-addons.git
        targetRevision: HEAD
        path: '{{path}}'
      destination:
        server: https://kubernetes.default.svc
        namespace: '{{path.basename}}'
```

```yaml
# Cluster Generator（登録済みクラスター全てに展開）
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: prometheus
  namespace: argocd
spec:
  generators:
    - clusters: {}  # 全登録クラスター
  template:
    metadata:
      name: 'prometheus-{{name}}'
    spec:
      project: default
      source:
        repoURL: https://prometheus-community.github.io/helm-charts
        chart: prometheus
        targetRevision: 25.0.0
      destination:
        server: '{{server}}'
        namespace: monitoring
```

---

## 9. CI/CDパイプライン統合

### 9.1 Image Updater（推奨）

```
【ArgoCD Image Updater パターン】

┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ CI Pipeline  │───▶│    ECR       │───▶│ Image Updater│
│ (Build/Push) │    │ (新イメージ) │    │ (検出)       │
└──────────────┘    └──────────────┘    └──────┬───────┘
                                               │
                                        Git Commit
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │ Git Repo     │
                                        │ (manifest    │
                                        │  更新)       │
                                        └──────┬───────┘
                                               │
                                        ┌──────▼───────┐
                                        │   ArgoCD     │
                                        │ (同期)       │
                                        └──────────────┘
```

```yaml
# Image Updaterの設定
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app
  namespace: argocd
  annotations:
    # Image Updater設定
    argocd-image-updater.argoproj.io/image-list: myapp=123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-app
    argocd-image-updater.argoproj.io/myapp.update-strategy: semver
    argocd-image-updater.argoproj.io/write-back-method: git
spec:
  # ...
```

### 9.2 GitHub Actions統合

```yaml
# .github/workflows/deploy.yml
name: Deploy to EKS via ArgoCD

on:
  push:
    branches: [main]
    paths:
      - 'src/**'

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-1

      - name: Login to Amazon ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push Docker image
        env:
          ECR_REGISTRY: 123456789012.dkr.ecr.ap-northeast-1.amazonaws.com
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/my-app:$IMAGE_TAG .
          docker push $ECR_REGISTRY/my-app:$IMAGE_TAG

      - name: Update Kubernetes manifests
        env:
          IMAGE_TAG: ${{ github.sha }}
        run: |
          cd manifests
          kustomize edit set image my-app=$ECR_REGISTRY/my-app:$IMAGE_TAG
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add .
          git commit -m "Update image to $IMAGE_TAG"
          git push
```

### 9.3 CodePipeline統合

```yaml
# buildspec.yml（CodeBuild）
version: 0.2

phases:
  pre_build:
    commands:
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY

  build:
    commands:
      - docker build -t $ECR_REGISTRY/$IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION .
      - docker push $ECR_REGISTRY/$IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION

  post_build:
    commands:
      # マニフェストリポジトリを更新
      - git clone https://github.com/myorg/k8s-manifests.git
      - cd k8s-manifests
      - |
        cat <<EOF > kustomization.yaml
        resources:
          - deployment.yaml
          - service.yaml
        images:
          - name: my-app
            newName: $ECR_REGISTRY/$IMAGE_REPO_NAME
            newTag: $CODEBUILD_RESOLVED_SOURCE_VERSION
        EOF
      - git add .
      - git commit -m "Update image tag to $CODEBUILD_RESOLVED_SOURCE_VERSION"
      - git push
      # ArgoCDが自動でGit変更を検出してデプロイ
```

---

## 10. ハンズオン演習

### 10.1 演習1: ArgoCDインストール

```bash
# EKSクラスター接続（既存クラスターがある前提）
aws eks update-kubeconfig --name my-cluster --region ap-northeast-1

# ArgoCD Namespace作成
kubectl create namespace argocd

# ArgoCDインストール
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Pod起動確認
kubectl get pods -n argocd -w

# 初期パスワード取得
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo

# ポートフォワード
kubectl port-forward svc/argocd-server -n argocd 8080:443 &

# ブラウザで https://localhost:8080 にアクセス
# ユーザー: admin / パスワード: 上記で取得した値
```

### 10.2 演習2: サンプルアプリケーションのデプロイ

```bash
# ArgoCD CLIインストール
curl -sSL -o /usr/local/bin/argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x /usr/local/bin/argocd

# CLIログイン
argocd login localhost:8080 --username admin --password <password> --insecure

# Guestbookアプリケーション作成
argocd app create guestbook \
  --repo https://github.com/argoproj/argocd-example-apps.git \
  --path guestbook \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace default

# アプリケーション一覧
argocd app list

# アプリケーション状態確認
argocd app get guestbook

# 同期実行
argocd app sync guestbook

# リソース確認
kubectl get all -l app=guestbook
```

### 10.3 演習3: 宣言的Application管理

```bash
# マニフェストでApplication作成
cat <<EOF | kubectl apply -f -
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nginx-demo
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD
    path: nginx
  destination:
    server: https://kubernetes.default.svc
    namespace: nginx-demo
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
EOF

# 状態確認
argocd app get nginx-demo
kubectl get all -n nginx-demo
```

### 10.4 演習4: 手動変更の自動修復（selfHeal）

```bash
# 現在のレプリカ数確認
kubectl get deployment -n nginx-demo

# 手動でスケール変更（ドリフトを発生させる）
kubectl scale deployment nginx -n nginx-demo --replicas=5

# 数秒待つと自動修復
kubectl get deployment -n nginx-demo -w

# ArgoCD UIでも "Self Heal" イベントが表示される
```

### 10.5 演習5: ロールバック

```bash
# アプリケーション履歴確認
argocd app history guestbook

# 特定リビジョンにロールバック
argocd app rollback guestbook <REVISION_NUMBER>

# または特定のGitコミットに同期
argocd app sync guestbook --revision <GIT_COMMIT_SHA>
```

### 10.6 演習6: ApplicationSet

```bash
# ApplicationSetでマルチ環境デプロイ
cat <<EOF | kubectl apply -f -
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: multi-env-app
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - env: dev
            replicas: "1"
          - env: staging
            replicas: "2"
          - env: prod
            replicas: "3"
  template:
    metadata:
      name: 'guestbook-{{env}}'
    spec:
      project: default
      source:
        repoURL: https://github.com/argoproj/argocd-example-apps.git
        targetRevision: HEAD
        path: guestbook
        kustomize:
          commonAnnotations:
            environment: '{{env}}'
      destination:
        server: https://kubernetes.default.svc
        namespace: 'guestbook-{{env}}'
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true
EOF

# 生成されたApplication確認
argocd app list | grep guestbook

# 各環境のリソース確認
kubectl get all -n guestbook-dev
kubectl get all -n guestbook-staging
kubectl get all -n guestbook-prod
```

### 10.7 クリーンアップ

```bash
# アプリケーション削除
argocd app delete guestbook --cascade
argocd app delete nginx-demo --cascade
kubectl delete applicationset multi-env-app -n argocd

# ArgoCD削除
kubectl delete -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl delete namespace argocd
```

---

## 11. DOP試験対策チェックリスト

### Q1: GitOps原則
**Q: GitOpsの4原則を説明し、従来のCI/CDとの違いを述べよ。**

<details><summary>模範解答</summary>

GitOpsの4原則:
1. **宣言的**: システムの望ましい状態をYAML/JSONで宣言
2. **バージョン管理・不変**: 全設定をGitで管理、履歴を保持
3. **自動プル**: エージェントがGitの変更を自動検出（Push型ではなくPull型）
4. **継続的調整**: ドリフト（意図しない変更）を自動修正

従来のCI/CDとの違い:
- **認証情報の保持場所**: 従来はCIシステムがクラスター認証情報を保持。GitOpsはクラスター内のエージェントがGitにアクセス
- **真実の源**: 従来は状態が分散。GitOpsはGitが唯一の真実の源
- **監査証跡**: 従来は各システムに分散。GitOpsはGit履歴に集約
- **ドリフト検出**: 従来は手動確認。GitOpsは自動検出・修復

</details>

### Q2: 同期ポリシー
**Q: ArgoCDのautomated sync、prune、selfHealの違いを説明せよ。**

<details><summary>模範解答</summary>

- **automated**: Git変更を検出したら自動で同期を実行。手動同期が不要になる

- **prune**: Gitリポジトリから削除されたリソースをクラスターからも自動削除。falseの場合、Gitから消してもクラスターにリソースが残る

- **selfHeal**: クラスター上で手動変更（kubectl edit等）が行われた場合、Gitの状態に自動で戻す。ドリフトを防止

本番環境での推奨設定:
```yaml
syncPolicy:
  automated:
    prune: true      # 孤立リソースを防止
    selfHeal: true   # 意図しない変更を防止
```

</details>

### Q3: マルチクラスター
**Q: ArgoCDでマルチクラスター環境を管理する際のベストプラクティスは？**

<details><summary>模範解答</summary>

1. **Hub-Spokeパターン**: 管理クラスター（Hub）にArgoCDをインストールし、各環境クラスター（Spoke）を管理

2. **クラスター登録**: `argocd cluster add`またはSecret（argocd.argoproj.io/secret-type: cluster）で登録

3. **EKSの場合**: IAM Roles for Service Accounts (IRSA)を使用してセキュアにクラスターアクセス

4. **環境分離**:
   - Projectでリソース制限（許可するNamespace、クラスター）
   - ApplicationSetで環境ごとの設定を自動生成

5. **段階的デプロイ**: dev→staging→prodの順でSyncWave/Hookを使用

</details>

### Q4: CI/CD統合
**Q: ArgoCDとCI/CDパイプライン（CodePipeline/GitHub Actions）の統合パターンは？**

<details><summary>模範解答</summary>

**推奨パターン（Image Updater）**:
1. CIパイプラインでDockerイメージをビルド→ECRにプッシュ
2. ArgoCD Image Updaterが新イメージを検出
3. Image UpdaterがGitリポジトリのマニフェストを更新（自動コミット）
4. ArgoCDがGit変更を検出して同期

**代替パターン（CIからGit更新）**:
1. CIでDockerイメージをビルド→プッシュ
2. CIからマニフェストリポジトリを更新（kustomize edit set image）
3. Gitにコミット・プッシュ
4. ArgoCDが同期

**セキュリティ考慮**:
- CIはGitリポジトリへの書き込み権限のみ必要
- CIからクラスターへの直接アクセスは不要
- クラスター認証情報はArgoCD内に閉じる

</details>

### Q5: ApplicationSet
**Q: ApplicationSetを使うべきシナリオと主要なGenerator種類を説明せよ。**

<details><summary>模範解答</summary>

**シナリオ**:
- 複数環境（dev/staging/prod）への同一アプリのデプロイ
- 複数クラスターへの共通コンポーネント展開
- テナントごとのアプリケーション生成
- ディレクトリ構造に基づく動的Application生成

**主要Generator**:
1. **List Generator**: 明示的なリストから生成。環境固有の設定を持つ場合に有用
2. **Cluster Generator**: 登録済み全クラスターに展開。監視エージェント等の共通コンポーネント向け
3. **Git Directory Generator**: Gitリポジトリのディレクトリ構造から自動生成。マイクロサービス群の管理に有用
4. **Git File Generator**: Git内の設定ファイル（JSON/YAML）から生成
5. **Matrix/Merge Generator**: 複数Generatorの組み合わせ

</details>

### Q6: トラブルシューティング
**Q: ArgoCDでSyncが失敗した場合のトラブルシューティング手順は？**

<details><summary>模範解答</summary>

1. **Sync状態確認**:
   ```bash
   argocd app get <app-name>
   argocd app sync <app-name> --dry-run
   ```

2. **リソース状態確認**:
   - UIで各リソースのHealth状態を確認
   - OutOfSyncの原因を特定

3. **ログ確認**:
   ```bash
   kubectl logs -n argocd deployment/argocd-application-controller
   kubectl logs -n argocd deployment/argocd-repo-server
   ```

4. **よくある原因**:
   - マニフェストの文法エラー
   - リソースクォータ/LimitRange超過
   - RBAC権限不足
   - Namespace未作成（CreateNamespace=trueを確認）
   - イメージプルエラー

5. **強制同期**:
   ```bash
   argocd app sync <app-name> --force --prune
   ```

6. **ロールバック**:
   ```bash
   argocd app rollback <app-name> <revision>
   ```

</details>

---

## 付録: よく使うArgoCDコマンド

```bash
# アプリケーション管理
argocd app list
argocd app get <app-name>
argocd app create <app-name> --repo <url> --path <path> --dest-server <server>
argocd app sync <app-name>
argocd app sync <app-name> --dry-run
argocd app delete <app-name> --cascade

# ロールバック
argocd app history <app-name>
argocd app rollback <app-name> <revision>

# クラスター管理
argocd cluster list
argocd cluster add <context-name>
argocd cluster rm <server>

# リポジトリ管理
argocd repo list
argocd repo add <repo-url> --username <user> --password <pass>

# プロジェクト管理
argocd proj list
argocd proj get <project-name>

# アカウント管理
argocd account list
argocd account update-password
```

---

**作成日**: 2026-02-06
**最終更新**: 2026-02-06
**検証環境**: AWS EKS 1.29, ArgoCD v2.10
