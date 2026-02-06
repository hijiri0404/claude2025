# Kubernetes ハンズオンガイド

## 目次
1. [Kubernetes概要](#1-kubernetes概要)
2. [アーキテクチャ](#2-アーキテクチャ)
3. [Pod](#3-pod)
4. [ReplicaSet / Deployment](#4-replicaset--deployment)
5. [Service](#5-service)
6. [ConfigMap / Secret](#6-configmap--secret)
7. [Volume / PersistentVolume](#7-volume--persistentvolume)
8. [Namespace / ResourceQuota](#8-namespace--resourcequota)
9. [StatefulSet / DaemonSet / Job](#9-statefulset--daemonset--job)
10. [Ingress](#10-ingress)
11. [RBAC](#11-rbac)
12. [NetworkPolicy](#12-networkpolicy)
13. [Pod Security](#13-pod-security)
14. [Scheduling](#14-scheduling)
15. [Helm](#15-helm)
16. [トラブルシューティング](#16-トラブルシューティング)
17. [ハンズオン演習](#17-ハンズオン演習)
18. [DOP試験対策チェックリスト](#18-dop試験対策チェックリスト)

---

## 1. Kubernetes概要

### 1.1 Kubernetesとは

```
┌─────────────────────────────────────────────────────────────────┐
│                     Kubernetes (K8s)                            │
│                                                                 │
│  「コンテナオーケストレーションプラットフォーム」                │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   主要機能                               │   │
│  │                                                         │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │   │
│  │  │ 自動        │ │ セルフ      │ │ ローリング  │       │   │
│  │  │ スケーリング│ │ ヒーリング  │ │ アップデート│       │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘       │   │
│  │                                                         │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │   │
│  │  │ サービス    │ │ 設定        │ │ ストレージ  │       │   │
│  │  │ ディスカバリ│ │ 管理        │ │ オーケスト  │       │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Kubernetesオブジェクト階層

```
┌─────────────────────────────────────────────────────────────┐
│                    Kubernetes オブジェクト                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Cluster                                                    │
│    └── Namespace                                            │
│          ├── Deployment                                     │
│          │     └── ReplicaSet                               │
│          │           └── Pod                                │
│          │                 └── Container                    │
│          ├── Service                                        │
│          ├── ConfigMap / Secret                             │
│          ├── PersistentVolumeClaim                          │
│          ├── Ingress                                        │
│          ├── NetworkPolicy                                  │
│          └── ServiceAccount                                 │
│                                                             │
│  Cluster-scoped:                                            │
│    ├── Node                                                 │
│    ├── PersistentVolume                                     │
│    ├── StorageClass                                         │
│    ├── ClusterRole / ClusterRoleBinding                     │
│    └── Namespace                                            │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 kubectlコマンド基本

```bash
# クラスター情報
kubectl cluster-info
kubectl get nodes

# リソース操作の基本形
kubectl get <resource>              # 一覧表示
kubectl describe <resource> <name>  # 詳細表示
kubectl create -f <file.yaml>       # 作成
kubectl apply -f <file.yaml>        # 作成/更新
kubectl delete -f <file.yaml>       # 削除

# よく使うオプション
kubectl get pods -o wide            # 詳細出力
kubectl get pods -o yaml            # YAML形式
kubectl get pods -o json            # JSON形式
kubectl get pods -w                 # ウォッチ
kubectl get pods -A                 # 全namespace
kubectl get pods -n kube-system     # namespace指定
kubectl get pods -l app=nginx       # ラベルセレクタ

# 短縮形
kubectl get po                      # pods
kubectl get svc                     # services
kubectl get deploy                  # deployments
kubectl get cm                      # configmaps
kubectl get pv                      # persistentvolumes
kubectl get pvc                     # persistentvolumeclaims
kubectl get ns                      # namespaces
```

---

## 2. アーキテクチャ

### 2.1 コントロールプレーン

```
┌─────────────────────────────────────────────────────────────────┐
│                    Control Plane                                │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    kube-apiserver                        │   │
│  │  - RESTful API エンドポイント                           │   │
│  │  - 認証・認可                                           │   │
│  │  - リソースのバリデーション                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│          ┌───────────────────┼───────────────────┐             │
│          │                   │                   │             │
│          ▼                   ▼                   ▼             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │    etcd     │    │  scheduler  │    │ controller  │        │
│  │             │    │             │    │  manager    │        │
│  │ 分散KVS     │    │ Pod配置     │    │ リソース    │        │
│  │ 全状態保存  │    │ 決定       │    │ 制御ループ  │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              cloud-controller-manager                    │   │
│  │  - クラウドプロバイダー固有のコントローラー              │   │
│  │  - LoadBalancer, Node, Route 管理                        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 ワーカーノード

```
┌─────────────────────────────────────────────────────────────────┐
│                       Worker Node                               │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                       kubelet                            │   │
│  │  - Pod のライフサイクル管理                              │   │
│  │  - コンテナランタイムとの通信                           │   │
│  │  - ヘルスチェック実行                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Container Runtime (containerd/CRI-O)        │   │
│  │  - コンテナの作成・実行・削除                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│          ┌───────────────────┼───────────────────┐             │
│          ▼                   ▼                   ▼             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │  Pod A      │    │  Pod B      │    │  Pod C      │        │
│  │ ┌─────────┐ │    │ ┌─────────┐ │    │ ┌─────────┐ │        │
│  │ │Container│ │    │ │Container│ │    │ │Container│ │        │
│  │ └─────────┘ │    │ └─────────┘ │    │ └─────────┘ │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      kube-proxy                          │   │
│  │  - Service の実装（iptables/IPVS）                       │   │
│  │  - ネットワークルール管理                                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 コンポーネント通信

```
┌─────────────────────────────────────────────────────────────┐
│                    通信フロー                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  kubectl ──(HTTPS)──▶ kube-apiserver ──▶ etcd             │
│                              │                              │
│                              ▼                              │
│                       ┌──────────────┐                     │
│                       │  Controller  │                     │
│                       │   Manager    │                     │
│                       └──────────────┘                     │
│                              │                              │
│                              ▼                              │
│                       ┌──────────────┐                     │
│                       │  Scheduler   │                     │
│                       └──────────────┘                     │
│                              │                              │
│              ┌───────────────┼───────────────┐             │
│              ▼               ▼               ▼             │
│         ┌────────┐     ┌────────┐     ┌────────┐          │
│         │kubelet │     │kubelet │     │kubelet │          │
│         │(Node1) │     │(Node2) │     │(Node3) │          │
│         └────────┘     └────────┘     └────────┘          │
│                                                             │
│  全ての通信はkube-apiserver経由（スター型トポロジ）         │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Pod

### 3.1 Pod基本概念

```
┌─────────────────────────────────────────────────────────────┐
│                         Pod                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   共有リソース                         │  │
│  │  - Network Namespace（同一IP）                        │  │
│  │  - IPC Namespace                                      │  │
│  │  - Volume                                             │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Container 1 │  │ Container 2 │  │ Init        │        │
│  │ (App)       │  │ (Sidecar)   │  │ Container   │        │
│  │             │  │             │  │ (初期化)    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│        │                │                                   │
│        └────────────────┴──────────▶ localhost:port        │
│                                                             │
│  Pod IP: 10.244.1.5 (クラスター内からアクセス可能)          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Pod定義

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
  labels:
    app: myapp
    tier: frontend
  annotations:
    description: "My application pod"
spec:
  # Init Container（メインコンテナ起動前に実行）
  initContainers:
    - name: init-db
      image: busybox
      command: ['sh', '-c', 'until nc -z db-service 5432; do sleep 2; done']

  containers:
    - name: app
      image: nginx:1.25
      ports:
        - containerPort: 80
          name: http

      # リソース制限
      resources:
        requests:
          memory: "64Mi"
          cpu: "250m"
        limits:
          memory: "128Mi"
          cpu: "500m"

      # 環境変数
      env:
        - name: ENV
          value: "production"
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: db_host
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: password

      # ヘルスチェック
      livenessProbe:
        httpGet:
          path: /healthz
          port: 80
        initialDelaySeconds: 15
        periodSeconds: 10

      readinessProbe:
        httpGet:
          path: /ready
          port: 80
        initialDelaySeconds: 5
        periodSeconds: 5

      startupProbe:
        httpGet:
          path: /startup
          port: 80
        failureThreshold: 30
        periodSeconds: 10

      # ボリュームマウント
      volumeMounts:
        - name: data
          mountPath: /data
        - name: config
          mountPath: /etc/config
          readOnly: true

    # サイドカーコンテナ
    - name: log-shipper
      image: fluentd
      volumeMounts:
        - name: logs
          mountPath: /var/log

  # ボリューム定義
  volumes:
    - name: data
      emptyDir: {}
    - name: config
      configMap:
        name: app-config
    - name: logs
      emptyDir: {}

  # 再起動ポリシー
  restartPolicy: Always  # Always | OnFailure | Never

  # ノード選択
  nodeSelector:
    disk: ssd
```

### 3.3 Probeの種類

```
┌─────────────────────────────────────────────────────────────┐
│                    ヘルスチェックProbe                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  【startupProbe】                                           │
│  └─ 起動完了確認。成功するまでliveness/readiness無効       │
│     → 起動が遅いアプリ向け                                  │
│                                                             │
│  【livenessProbe】                                          │
│  └─ 生存確認。失敗するとコンテナ再起動                     │
│     → デッドロック検出                                      │
│                                                             │
│  【readinessProbe】                                         │
│  └─ 準備完了確認。失敗するとServiceから除外               │
│     → 一時的な負荷対応                                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  チェック方法:                                              │
│  - httpGet: HTTP GETリクエスト                             │
│  - tcpSocket: TCPポート接続                                │
│  - exec: コマンド実行（終了コード0で成功）                 │
│  - grpc: gRPCヘルスチェック                                │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 Pod操作コマンド

```bash
# Pod作成
kubectl run nginx --image=nginx
kubectl apply -f pod.yaml

# Pod一覧
kubectl get pods
kubectl get pods -o wide
kubectl get pods --show-labels

# Pod詳細
kubectl describe pod nginx

# Podログ
kubectl logs nginx
kubectl logs nginx -c sidecar           # コンテナ指定
kubectl logs nginx --previous           # 前回のログ
kubectl logs nginx -f                   # フォロー
kubectl logs -l app=nginx --all-containers

# Pod内コマンド実行
kubectl exec nginx -- ls /
kubectl exec -it nginx -- /bin/bash
kubectl exec nginx -c sidecar -- cat /var/log/app.log

# Podへのポートフォワード
kubectl port-forward nginx 8080:80

# Pod削除
kubectl delete pod nginx
kubectl delete pod nginx --grace-period=0 --force  # 強制削除
```

---

## 4. ReplicaSet / Deployment

### 4.1 ReplicaSet

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: nginx-rs
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.25
```

### 4.2 Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                      Deployment                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   ReplicaSet v2                        │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐               │  │
│  │  │ Pod     │  │ Pod     │  │ Pod     │               │  │
│  │  │ (v2)    │  │ (v2)    │  │ (v2)    │               │  │
│  │  └─────────┘  └─────────┘  └─────────┘               │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              ReplicaSet v1 (縮小中)                    │  │
│  │  ┌─────────┐                                          │  │
│  │  │ Pod     │  ← ローリングアップデート中               │  │
│  │  │ (v1)    │                                          │  │
│  │  └─────────┘                                          │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx

  # 更新戦略
  strategy:
    type: RollingUpdate          # RollingUpdate | Recreate
    rollingUpdate:
      maxSurge: 1                # 追加Pod数（絶対値 or %）
      maxUnavailable: 0          # 停止Pod数（絶対値 or %）

  # リビジョン履歴
  revisionHistoryLimit: 10

  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.25
          ports:
            - containerPort: 80
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 200m
              memory: 256Mi
```

### 4.3 Deployment操作

```bash
# 作成
kubectl create deployment nginx --image=nginx --replicas=3
kubectl apply -f deployment.yaml

# スケール
kubectl scale deployment nginx --replicas=5

# イメージ更新（ローリングアップデート）
kubectl set image deployment/nginx nginx=nginx:1.26

# ロールアウト状況
kubectl rollout status deployment/nginx

# ロールアウト履歴
kubectl rollout history deployment/nginx
kubectl rollout history deployment/nginx --revision=2

# ロールバック
kubectl rollout undo deployment/nginx
kubectl rollout undo deployment/nginx --to-revision=1

# 一時停止/再開
kubectl rollout pause deployment/nginx
kubectl rollout resume deployment/nginx

# 再起動（全Pod入れ替え）
kubectl rollout restart deployment/nginx
```

### 4.4 更新戦略比較

```
┌─────────────────────────────────────────────────────────────┐
│                    更新戦略比較                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  【RollingUpdate】                                          │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                              │
│  │ v1 │ │ v1 │ │ v1 │ │ v2 │ ← 1つずつ更新                │
│  └────┘ └────┘ └────┘ └────┘                              │
│  - ゼロダウンタイム                                         │
│  - v1/v2が一時的に混在                                      │
│  - maxSurge/maxUnavailableで制御                           │
│                                                             │
│  【Recreate】                                               │
│  ┌────┐ ┌────┐ ┌────┐                                     │
│  │ v1 │ │ v1 │ │ v1 │ ← 全削除                            │
│  └────┘ └────┘ └────┘                                     │
│          ↓                                                  │
│  ┌────┐ ┌────┐ ┌────┐                                     │
│  │ v2 │ │ v2 │ │ v2 │ ← 全作成                            │
│  └────┘ └────┘ └────┘                                     │
│  - ダウンタイムあり                                         │
│  - バージョン混在なし                                       │
│  - DBスキーマ変更時などに使用                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Service

### 5.1 Serviceタイプ

```
┌─────────────────────────────────────────────────────────────┐
│                     Service Types                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  【ClusterIP】(デフォルト)                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ クラスター内部からのみアクセス可能                    │   │
│  │ 内部DNS: <service>.<namespace>.svc.cluster.local    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  【NodePort】                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 各ノードの固定ポート (30000-32767) で公開           │   │
│  │ <NodeIP>:<NodePort> でアクセス                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  【LoadBalancer】                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ クラウドプロバイダーのLBを自動プロビジョニング       │   │
│  │ 外部IPが割り当てられる                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  【ExternalName】                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 外部DNSへのCNAMEエイリアス                          │   │
│  │ 外部サービスへの参照用                               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Service定義

```yaml
# ClusterIP Service
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  type: ClusterIP
  selector:
    app: myapp
  ports:
    - name: http
      port: 80           # Service ポート
      targetPort: 8080   # Pod ポート
      protocol: TCP

---
# NodePort Service
apiVersion: v1
kind: Service
metadata:
  name: my-nodeport-service
spec:
  type: NodePort
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080    # 省略時は自動割当

---
# LoadBalancer Service
apiVersion: v1
kind: Service
metadata:
  name: my-lb-service
  annotations:
    # AWS NLB使用
    service.beta.kubernetes.io/aws-load-balancer-type: nlb
spec:
  type: LoadBalancer
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 8080

---
# Headless Service (StatefulSet用)
apiVersion: v1
kind: Service
metadata:
  name: my-headless-service
spec:
  clusterIP: None        # Headless
  selector:
    app: myapp
  ports:
    - port: 80
```

### 5.3 Service通信フロー

```
┌─────────────────────────────────────────────────────────────┐
│                  Service 通信フロー                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Client                                                     │
│     │                                                       │
│     │ my-service.default.svc.cluster.local:80              │
│     ▼                                                       │
│  ┌──────────────┐                                          │
│  │  kube-dns    │ ← DNS解決: Service ClusterIP返却         │
│  └──────────────┘                                          │
│     │                                                       │
│     │ ClusterIP: 10.96.100.50:80                           │
│     ▼                                                       │
│  ┌──────────────┐                                          │
│  │  kube-proxy  │ ← iptables/IPVS ルール適用              │
│  │  (iptables)  │                                          │
│  └──────────────┘                                          │
│     │                                                       │
│     │ ロードバランシング（ランダム or ラウンドロビン）       │
│     ▼                                                       │
│  ┌────────┐  ┌────────┐  ┌────────┐                       │
│  │ Pod 1  │  │ Pod 2  │  │ Pod 3  │                       │
│  │:8080   │  │:8080   │  │:8080   │                       │
│  └────────┘  └────────┘  └────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Service操作コマンド

```bash
# Service作成
kubectl expose deployment nginx --port=80 --target-port=8080
kubectl apply -f service.yaml

# Service一覧
kubectl get svc
kubectl get endpoints

# Service詳細
kubectl describe svc my-service

# Service経由でアクセステスト
kubectl run test --rm -it --image=busybox -- wget -qO- my-service:80
```

---

## 6. ConfigMap / Secret

### 6.1 ConfigMap

```yaml
# ConfigMap定義
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  # キー=値
  database_host: "db.example.com"
  database_port: "5432"

  # ファイル形式
  config.json: |
    {
      "logLevel": "info",
      "timeout": 30
    }

  nginx.conf: |
    server {
      listen 80;
      location / {
        proxy_pass http://backend;
      }
    }
```

```bash
# ConfigMap作成
kubectl create configmap app-config \
  --from-literal=key1=value1 \
  --from-file=config.json \
  --from-env-file=.env
```

### 6.2 Secret

```yaml
# Secret定義（base64エンコード）
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
type: Opaque
data:
  username: YWRtaW4=          # echo -n 'admin' | base64
  password: cGFzc3dvcmQxMjM=  # echo -n 'password123' | base64

---
# stringData使用（自動エンコード）
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
type: Opaque
stringData:
  username: admin
  password: password123
```

```bash
# Secret作成
kubectl create secret generic db-secret \
  --from-literal=username=admin \
  --from-literal=password=password123

# TLS Secret
kubectl create secret tls tls-secret \
  --cert=cert.pem \
  --key=key.pem

# Docker Registry Secret
kubectl create secret docker-registry regcred \
  --docker-server=https://index.docker.io/v1/ \
  --docker-username=user \
  --docker-password=pass \
  --docker-email=user@example.com
```

### 6.3 Podでの使用方法

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: config-demo
spec:
  containers:
    - name: app
      image: nginx

      # 環境変数として使用
      env:
        # 単一キー
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: database_host
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: password

      # 全キーを環境変数に
      envFrom:
        - configMapRef:
            name: app-config
        - secretRef:
            name: db-secret
            optional: true

      # ボリュームとしてマウント
      volumeMounts:
        - name: config-volume
          mountPath: /etc/config
        - name: secret-volume
          mountPath: /etc/secrets
          readOnly: true

  volumes:
    - name: config-volume
      configMap:
        name: app-config
        items:
          - key: config.json
            path: app-config.json
    - name: secret-volume
      secret:
        secretName: db-secret
        defaultMode: 0400
```

---

## 7. Volume / PersistentVolume

### 7.1 Volumeタイプ

```
┌─────────────────────────────────────────────────────────────┐
│                     Volume Types                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  【一時的なボリューム】                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ emptyDir    : Pod終了で削除。一時ファイル/キャッシュ  │   │
│  │ configMap   : ConfigMapをマウント                     │   │
│  │ secret      : Secretをマウント                        │   │
│  │ downwardAPI : Pod/Container情報をマウント             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  【永続的なボリューム】                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ hostPath    : ノードのパス（本番非推奨）              │   │
│  │ nfs         : NFSマウント                             │   │
│  │ awsEBS      : AWS EBS（非推奨、CSI使用）              │   │
│  │ gcePD       : GCP Persistent Disk                     │   │
│  │ csi         : CSIドライバー（推奨）                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  【PersistentVolume経由】                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ persistentVolumeClaim : PVC参照（推奨）              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 PersistentVolume / PersistentVolumeClaim

```
┌─────────────────────────────────────────────────────────────┐
│              PV / PVC / StorageClass 関係                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐                                          │
│  │ StorageClass │ ← 動的プロビジョニングの設定             │
│  │ (gp3, efs)   │                                          │
│  └──────────────┘                                          │
│         │                                                   │
│         │ provisioner                                       │
│         ▼                                                   │
│  ┌──────────────┐      binding      ┌──────────────┐       │
│  │ Persistent   │◀─────────────────▶│ Persistent   │       │
│  │ Volume (PV)  │                   │ VolumeClaim  │       │
│  │              │                   │ (PVC)        │       │
│  │ - 100Gi      │                   │ - 50Gi要求   │       │
│  │ - RWO        │                   │ - RWO        │       │
│  │ - gp3        │                   │ - gp3指定    │       │
│  └──────────────┘                   └──────────────┘       │
│         │                                  │                │
│         │                                  │                │
│         ▼                                  ▼                │
│  ┌──────────────┐                   ┌──────────────┐       │
│  │ 実ストレージ │                   │    Pod       │       │
│  │ (EBS, EFS)   │                   │  (volume     │       │
│  │              │                   │   mount)     │       │
│  └──────────────┘                   └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 PV / PVC定義

```yaml
# StorageClass
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-storage
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
reclaimPolicy: Delete          # Delete | Retain
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true

---
# PersistentVolumeClaim
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-pvc
spec:
  accessModes:
    - ReadWriteOnce            # RWO | ROX | RWX
  storageClassName: fast-storage
  resources:
    requests:
      storage: 50Gi

---
# Podでの使用
apiVersion: v1
kind: Pod
metadata:
  name: storage-pod
spec:
  containers:
    - name: app
      image: nginx
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: data-pvc
```

### 7.4 Access Modes

| Mode | 略称 | 説明 |
|------|------|------|
| ReadWriteOnce | RWO | 単一ノードから読み書き |
| ReadOnlyMany | ROX | 複数ノードから読み取り専用 |
| ReadWriteMany | RWX | 複数ノードから読み書き（EFS等） |
| ReadWriteOncePod | RWOP | 単一Podから読み書き（K8s 1.22+） |

---

## 8. Namespace / ResourceQuota

### 8.1 Namespace

```bash
# Namespace作成
kubectl create namespace development
kubectl create ns production

# Namespace一覧
kubectl get namespaces

# デフォルトNamespace変更
kubectl config set-context --current --namespace=development

# Namespace内リソース確認
kubectl get all -n development
```

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: development
  labels:
    env: dev
```

### 8.2 ResourceQuota

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: dev-quota
  namespace: development
spec:
  hard:
    # コンピュートリソース
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi

    # オブジェクト数
    pods: "50"
    services: "10"
    secrets: "20"
    configmaps: "20"
    persistentvolumeclaims: "10"

    # ストレージ
    requests.storage: 100Gi
```

### 8.3 LimitRange

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: development
spec:
  limits:
    # コンテナのデフォルト値
    - type: Container
      default:
        cpu: "500m"
        memory: "512Mi"
      defaultRequest:
        cpu: "100m"
        memory: "128Mi"
      max:
        cpu: "2"
        memory: "4Gi"
      min:
        cpu: "50m"
        memory: "64Mi"

    # Podの制限
    - type: Pod
      max:
        cpu: "4"
        memory: "8Gi"

    # PVCの制限
    - type: PersistentVolumeClaim
      max:
        storage: 50Gi
      min:
        storage: 1Gi
```

---

## 9. StatefulSet / DaemonSet / Job

### 9.1 StatefulSet

```
┌─────────────────────────────────────────────────────────────┐
│                     StatefulSet                              │
│                                                             │
│  特徴:                                                      │
│  - 順序保証されたデプロイ/スケール (0, 1, 2...)            │
│  - 安定したネットワークID (pod-0, pod-1, ...)              │
│  - 永続ストレージ (各Podに専用PVC)                         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Headless Service: db-service                        │   │
│  │  pod-0.db-service.ns.svc.cluster.local              │   │
│  │  pod-1.db-service.ns.svc.cluster.local              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │   pod-0    │  │   pod-1    │  │   pod-2    │           │
│  │  (Primary) │  │ (Replica)  │  │ (Replica)  │           │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘           │
│        │               │               │                   │
│        ▼               ▼               ▼                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │ data-pod-0 │  │ data-pod-1 │  │ data-pod-2 │           │
│  │   (PVC)    │  │   (PVC)    │  │   (PVC)    │           │
│  └────────────┘  └────────────┘  └────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres-headless    # 必須: Headless Service
  replicas: 3
  selector:
    matchLabels:
      app: postgres

  # 更新戦略
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      partition: 0    # この番号未満はスキップ

  # Pod管理ポリシー
  podManagementPolicy: OrderedReady  # OrderedReady | Parallel

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

  # PVCテンプレート
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: gp3
        resources:
          requests:
            storage: 20Gi
```

### 9.2 DaemonSet

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
  namespace: kube-system
spec:
  selector:
    matchLabels:
      name: fluentd

  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1

  template:
    metadata:
      labels:
        name: fluentd
    spec:
      # 全ノードで実行（Tolerations必要）
      tolerations:
        - key: node-role.kubernetes.io/control-plane
          operator: Exists
          effect: NoSchedule

      containers:
        - name: fluentd
          image: fluentd:latest
          volumeMounts:
            - name: varlog
              mountPath: /var/log
            - name: containers
              mountPath: /var/lib/docker/containers
              readOnly: true

      volumes:
        - name: varlog
          hostPath:
            path: /var/log
        - name: containers
          hostPath:
            path: /var/lib/docker/containers
```

### 9.3 Job / CronJob

```yaml
# Job
apiVersion: batch/v1
kind: Job
metadata:
  name: batch-job
spec:
  completions: 5          # 成功数
  parallelism: 2          # 同時実行数
  backoffLimit: 3         # リトライ回数
  activeDeadlineSeconds: 600
  ttlSecondsAfterFinished: 300

  template:
    spec:
      containers:
        - name: job
          image: busybox
          command: ["sh", "-c", "echo Processing... && sleep 30"]
      restartPolicy: Never    # Never | OnFailure

---
# CronJob
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup-job
spec:
  schedule: "0 2 * * *"    # cron形式
  concurrencyPolicy: Forbid  # Allow | Forbid | Replace
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  startingDeadlineSeconds: 200

  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: backup-tool
              command: ["/backup.sh"]
          restartPolicy: OnFailure
```

---

## 10. Ingress

### 10.1 Ingress概要

```
┌─────────────────────────────────────────────────────────────┐
│                      Ingress                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  インターネット                                              │
│       │                                                     │
│       ▼                                                     │
│  ┌──────────────┐                                          │
│  │   Ingress    │ ← L7ロードバランサー                     │
│  │  Controller  │   (NGINX, ALB, Traefik等)                │
│  └──────────────┘                                          │
│       │                                                     │
│       │ Ingressルール適用                                   │
│       │                                                     │
│       ├─────────────────────────────────────┐               │
│       │                                     │               │
│       │ Host: app1.example.com              │ Host: app2... │
│       │ Path: /api                          │               │
│       ▼                                     ▼               │
│  ┌──────────┐  ┌──────────┐          ┌──────────┐         │
│  │ api-svc  │  │ web-svc  │          │ app2-svc │         │
│  └──────────┘  └──────────┘          └──────────┘         │
│       │              │                     │               │
│       ▼              ▼                     ▼               │
│    [Pods]         [Pods]               [Pods]              │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Ingress定義

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    # NGINX Ingress Controller用
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"

    # AWS ALB用
    # kubernetes.io/ingress.class: alb
    # alb.ingress.kubernetes.io/scheme: internet-facing
spec:
  ingressClassName: nginx    # Ingress Controller指定

  # デフォルトTLS
  tls:
    - hosts:
        - app.example.com
      secretName: tls-secret

  rules:
    # ホストベースルーティング
    - host: app.example.com
      http:
        paths:
          # パスベースルーティング
          - path: /api
            pathType: Prefix    # Prefix | Exact | ImplementationSpecific
            backend:
              service:
                name: api-service
                port:
                  number: 80

          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-service
                port:
                  number: 80

    # 別ホスト
    - host: admin.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: admin-service
                port:
                  number: 80

  # デフォルトバックエンド
  defaultBackend:
    service:
      name: default-backend
      port:
        number: 80
```

### 10.3 IngressClass

```yaml
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: nginx
  annotations:
    ingressclass.kubernetes.io/is-default-class: "true"
spec:
  controller: k8s.io/ingress-nginx
```

---

## 11. RBAC

### 11.1 RBAC概要

```
┌─────────────────────────────────────────────────────────────┐
│                        RBAC                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐       ┌─────────────┐                     │
│  │   Subject   │       │    Role     │                     │
│  │             │       │             │                     │
│  │ - User      │       │ - Role      │ ← Namespace内       │
│  │ - Group     │◀─────▶│ - ClusterRole│← Cluster全体       │
│  │ - SA        │       │             │                     │
│  └─────────────┘       └─────────────┘                     │
│        │                     │                              │
│        │     Binding         │                              │
│        │  ┌──────────────┐   │                              │
│        └─▶│ RoleBinding  │◀──┘  ← Namespace内              │
│           │ ClusterRole  │                                  │
│           │   Binding    │      ← Cluster全体              │
│           └──────────────┘                                  │
│                  │                                          │
│                  ▼                                          │
│           ┌──────────────┐                                  │
│           │  Resources   │                                  │
│           │  - pods      │                                  │
│           │  - services  │                                  │
│           │  - secrets   │                                  │
│           └──────────────┘                                  │
└─────────────────────────────────────────────────────────────┘
```

### 11.2 Role / ClusterRole

```yaml
# Namespace内のRole
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: development
rules:
  - apiGroups: [""]           # コアAPI
    resources: ["pods", "pods/log"]
    verbs: ["get", "list", "watch"]

  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list"]

---
# Cluster全体のClusterRole
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: node-reader
rules:
  - apiGroups: [""]
    resources: ["nodes"]
    verbs: ["get", "list", "watch"]

  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]
    resourceNames: ["specific-pod"]  # 特定リソースのみ
```

### 11.3 RoleBinding / ClusterRoleBinding

```yaml
# RoleBinding（Namespace内）
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods
  namespace: development
subjects:
  - kind: User
    name: developer
    apiGroup: rbac.authorization.k8s.io
  - kind: ServiceAccount
    name: app-sa
    namespace: development
  - kind: Group
    name: developers
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io

---
# ClusterRoleBinding（Cluster全体）
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: cluster-admin-binding
subjects:
  - kind: User
    name: admin@example.com
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: cluster-admin
  apiGroup: rbac.authorization.k8s.io
```

### 11.4 ServiceAccount

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app-sa
  namespace: default
automountServiceAccountToken: false  # セキュリティ向上

---
# Podでの使用
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  serviceAccountName: app-sa
  automountServiceAccountToken: true
  containers:
    - name: app
      image: myapp
```

### 11.5 RBAC操作コマンド

```bash
# 権限確認
kubectl auth can-i create pods
kubectl auth can-i delete pods --as developer
kubectl auth can-i '*' '*' --as system:admin

# Role/Binding一覧
kubectl get roles,rolebindings -n development
kubectl get clusterroles,clusterrolebindings

# 組み込みClusterRole
kubectl get clusterrole admin -o yaml
kubectl get clusterrole edit -o yaml
kubectl get clusterrole view -o yaml
```

---

## 12. NetworkPolicy

### 12.1 NetworkPolicy概要

```
┌─────────────────────────────────────────────────────────────┐
│                     NetworkPolicy                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  【デフォルト動作】                                          │
│  NetworkPolicy未適用 → 全通信許可                           │
│  NetworkPolicy適用 → 明示的に許可されたもののみ通信可能     │
│                                                             │
│  【Ingress/Egress制御】                                     │
│  ┌─────────┐        ┌─────────┐        ┌─────────┐        │
│  │ Pod A   │───────▶│ Pod B   │───────▶│ Pod C   │        │
│  └─────────┘        └─────────┘        └─────────┘        │
│     Egress            Ingress             Egress           │
│     制御              制御                制御             │
│                                                             │
│  【セレクタ】                                               │
│  - podSelector: Pod選択                                     │
│  - namespaceSelector: Namespace選択                         │
│  - ipBlock: CIDR指定                                        │
└─────────────────────────────────────────────────────────────┘
```

### 12.2 NetworkPolicy定義

```yaml
# デフォルト拒否（重要）
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}           # 全Pod対象
  policyTypes:
    - Ingress
    - Egress

---
# 特定通信許可
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-allow
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: api

  policyTypes:
    - Ingress
    - Egress

  ingress:
    # frontendからのアクセス許可
    - from:
        - podSelector:
            matchLabels:
              app: frontend
        - namespaceSelector:
            matchLabels:
              env: production
      ports:
        - protocol: TCP
          port: 8080

    # 外部CIDR許可
    - from:
        - ipBlock:
            cidr: 10.0.0.0/8
            except:
              - 10.0.1.0/24

  egress:
    # DBへのアクセス許可
    - to:
        - podSelector:
            matchLabels:
              app: database
      ports:
        - protocol: TCP
          port: 5432

    # DNS許可（重要）
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
```

---

## 13. Pod Security

### 13.1 Pod Security Standards (PSS)

```
┌─────────────────────────────────────────────────────────────┐
│              Pod Security Standards (PSS)                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  【Privileged】最も緩い                                      │
│  └─ 制限なし。特権Pod許可                                   │
│                                                             │
│  【Baseline】基本セキュリティ                                │
│  └─ 既知の特権エスカレーションを防止                        │
│     - hostNetwork/hostPID/hostIPC 禁止                      │
│     - 特権コンテナ禁止                                      │
│     - 危険なcapabilities禁止                                │
│                                                             │
│  【Restricted】最も厳格                                      │
│  └─ 高セキュリティ要件向け                                  │
│     - Baselineの全制限 +                                    │
│     - root実行禁止                                          │
│     - 全capabilities削除                                    │
│     - seccompプロファイル必須                               │
└─────────────────────────────────────────────────────────────┘
```

### 13.2 Pod Security Admission

```yaml
# Namespace ラベルで適用
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    # enforce: 違反Podを拒否
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: v1.28

    # warn: 警告のみ
    pod-security.kubernetes.io/warn: restricted

    # audit: 監査ログに記録
    pod-security.kubernetes.io/audit: restricted
```

### 13.3 SecurityContext

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod
spec:
  # Pod レベル
  securityContext:
    runAsUser: 1000
    runAsGroup: 3000
    fsGroup: 2000
    runAsNonRoot: true
    seccompProfile:
      type: RuntimeDefault

  containers:
    - name: app
      image: myapp
      # Container レベル
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop:
            - ALL
          add:
            - NET_BIND_SERVICE
```

---

## 14. Scheduling

### 14.1 nodeSelector

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: gpu-pod
spec:
  nodeSelector:
    gpu: "true"
    disk: ssd
  containers:
    - name: app
      image: gpu-app
```

### 14.2 Node Affinity

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: affinity-pod
spec:
  affinity:
    nodeAffinity:
      # 必須条件
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: zone
                operator: In
                values: ["ap-northeast-1a", "ap-northeast-1c"]

      # 優先条件
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          preference:
            matchExpressions:
              - key: instance-type
                operator: In
                values: ["m5.large"]

  containers:
    - name: app
      image: myapp
```

### 14.3 Pod Affinity / Anti-Affinity

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-pod
spec:
  affinity:
    # Pod Affinity: 特定Podと同じノード
    podAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchLabels:
              app: cache
          topologyKey: kubernetes.io/hostname

    # Pod Anti-Affinity: 特定Podと異なるノード
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchLabels:
                app: web
            topologyKey: topology.kubernetes.io/zone

  containers:
    - name: web
      image: nginx
```

### 14.4 Taints / Tolerations

```bash
# ノードにTaint追加
kubectl taint nodes node1 special=true:NoSchedule
kubectl taint nodes node1 dedicated=gpu:NoExecute

# Taint削除
kubectl taint nodes node1 special=true:NoSchedule-
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: toleration-pod
spec:
  tolerations:
    # 完全一致
    - key: "special"
      operator: "Equal"
      value: "true"
      effect: "NoSchedule"

    # キーの存在のみ確認
    - key: "dedicated"
      operator: "Exists"
      effect: "NoExecute"
      tolerationSeconds: 3600

  containers:
    - name: app
      image: myapp
```

### 14.5 Priority / Preemption

```yaml
# PriorityClass
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority
value: 1000000
globalDefault: false
preemptionPolicy: PreemptLowerPriority
description: "高優先度Pod用"

---
# Podで使用
apiVersion: v1
kind: Pod
metadata:
  name: important-pod
spec:
  priorityClassName: high-priority
  containers:
    - name: app
      image: myapp
```

---

## 15. Helm

### 15.1 Helm基本

```bash
# Helmインストール
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# リポジトリ追加
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add stable https://charts.helm.sh/stable
helm repo update

# リポジトリ検索
helm search repo nginx
helm search hub nginx    # Artifact Hub検索

# チャート情報
helm show chart bitnami/nginx
helm show values bitnami/nginx
```

### 15.2 チャートインストール

```bash
# インストール
helm install my-release bitnami/nginx

# values指定
helm install my-release bitnami/nginx \
  --set replicaCount=3 \
  --set service.type=LoadBalancer

# valuesファイル指定
helm install my-release bitnami/nginx -f values.yaml

# Namespace指定
helm install my-release bitnami/nginx -n production --create-namespace

# Dry-run
helm install my-release bitnami/nginx --dry-run --debug
```

### 15.3 リリース管理

```bash
# リリース一覧
helm list
helm list -A

# リリース状態
helm status my-release

# アップグレード
helm upgrade my-release bitnami/nginx --set replicaCount=5

# ロールバック
helm history my-release
helm rollback my-release 1

# アンインストール
helm uninstall my-release
```

### 15.4 チャート作成

```bash
# 新規チャート作成
helm create my-chart

# 構造
my-chart/
├── Chart.yaml          # メタデータ
├── values.yaml         # デフォルト値
├── templates/          # テンプレート
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── _helpers.tpl    # ヘルパー関数
│   └── NOTES.txt       # インストール後メッセージ
└── charts/             # 依存チャート

# テンプレートレンダリング確認
helm template my-release ./my-chart

# パッケージ化
helm package my-chart
```

---

## 16. トラブルシューティング

### 16.1 Pod問題診断

```bash
# Pod状態確認
kubectl get pods
kubectl describe pod <pod-name>

# イベント確認
kubectl get events --sort-by='.lastTimestamp'
kubectl get events --field-selector involvedObject.name=<pod-name>

# ログ確認
kubectl logs <pod-name>
kubectl logs <pod-name> -c <container-name>
kubectl logs <pod-name> --previous

# Pod内デバッグ
kubectl exec -it <pod-name> -- /bin/sh
kubectl debug <pod-name> -it --image=busybox
```

### 16.2 よくあるPod状態

```
┌─────────────────────────────────────────────────────────────┐
│                   Pod状態と対処                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  【Pending】                                                │
│  原因: リソース不足、スケジュール不可                       │
│  対処: describe確認、ノードリソース確認                     │
│                                                             │
│  【ImagePullBackOff】                                       │
│  原因: イメージ取得失敗                                     │
│  対処: イメージ名確認、認証設定確認                         │
│                                                             │
│  【CrashLoopBackOff】                                       │
│  原因: コンテナ起動失敗の繰り返し                          │
│  対処: ログ確認、コマンド/設定確認                          │
│                                                             │
│  【CreateContainerConfigError】                             │
│  原因: ConfigMap/Secret参照エラー                          │
│  対処: 参照リソース存在確認                                 │
│                                                             │
│  【OOMKilled】                                              │
│  原因: メモリ不足                                          │
│  対処: リソースlimits引き上げ                               │
│                                                             │
│  【Evicted】                                                │
│  原因: ノードリソース逼迫                                   │
│  対処: ノード追加、リソース見直し                           │
└─────────────────────────────────────────────────────────────┘
```

### 16.3 ネットワーク診断

```bash
# Service確認
kubectl get svc
kubectl get endpoints <service-name>

# DNS確認
kubectl run test --rm -it --image=busybox -- nslookup <service-name>

# 接続テスト
kubectl run test --rm -it --image=busybox -- wget -qO- <service-name>:<port>

# ノード間通信確認
kubectl get pods -o wide
kubectl exec <pod1> -- ping <pod2-ip>
```

### 16.4 リソース確認

```bash
# ノードリソース
kubectl top nodes
kubectl describe node <node-name>

# Podリソース
kubectl top pods
kubectl top pods --containers

# リソース使用量詳細
kubectl describe node <node-name> | grep -A5 "Allocated resources"
```

---

## 17. ハンズオン演習

### 演習1: Deployment作成とスケール

```bash
# 1. Deployment作成
kubectl create deployment nginx --image=nginx:1.25 --replicas=3

# 2. 確認
kubectl get deploy,rs,pods

# 3. スケール
kubectl scale deployment nginx --replicas=5

# 4. イメージ更新
kubectl set image deployment/nginx nginx=nginx:1.26

# 5. ロールアウト確認
kubectl rollout status deployment/nginx
kubectl rollout history deployment/nginx

# 6. ロールバック
kubectl rollout undo deployment/nginx

# 7. クリーンアップ
kubectl delete deployment nginx
```

### 演習2: Service作成

```bash
# 1. Deployment作成
kubectl create deployment web --image=nginx --replicas=3

# 2. ClusterIP Service
kubectl expose deployment web --port=80 --target-port=80

# 3. 確認
kubectl get svc,endpoints

# 4. 接続テスト
kubectl run test --rm -it --image=busybox -- wget -qO- web:80

# 5. NodePort Service
kubectl expose deployment web --port=80 --type=NodePort --name=web-nodeport

# 6. クリーンアップ
kubectl delete deployment web
kubectl delete svc web web-nodeport
```

### 演習3: ConfigMap / Secret

```bash
# 1. ConfigMap作成
kubectl create configmap app-config \
  --from-literal=APP_ENV=production \
  --from-literal=LOG_LEVEL=info

# 2. Secret作成
kubectl create secret generic db-secret \
  --from-literal=username=admin \
  --from-literal=password=secret123

# 3. Pod作成
cat << 'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: config-test
spec:
  containers:
    - name: app
      image: busybox
      command: ["sh", "-c", "env && sleep 3600"]
      envFrom:
        - configMapRef:
            name: app-config
        - secretRef:
            name: db-secret
EOF

# 4. 確認
kubectl exec config-test -- env | grep -E "APP_ENV|LOG_LEVEL|username|password"

# 5. クリーンアップ
kubectl delete pod config-test
kubectl delete configmap app-config
kubectl delete secret db-secret
```

### 演習4: PersistentVolumeClaim

```bash
# 1. PVC作成
cat << 'EOF' | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
EOF

# 2. Podで使用
cat << 'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: pvc-test
spec:
  containers:
    - name: app
      image: busybox
      command: ["sh", "-c", "echo 'Hello PVC' > /data/test.txt && sleep 3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: test-pvc
EOF

# 3. 確認
kubectl exec pvc-test -- cat /data/test.txt

# 4. クリーンアップ
kubectl delete pod pvc-test
kubectl delete pvc test-pvc
```

### 演習5: RBAC設定

```bash
# 1. ServiceAccount作成
kubectl create serviceaccount dev-sa

# 2. Role作成
cat << 'EOF' | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
EOF

# 3. RoleBinding作成
kubectl create rolebinding dev-sa-pod-reader \
  --role=pod-reader \
  --serviceaccount=default:dev-sa

# 4. 権限確認
kubectl auth can-i list pods --as=system:serviceaccount:default:dev-sa
kubectl auth can-i delete pods --as=system:serviceaccount:default:dev-sa

# 5. クリーンアップ
kubectl delete rolebinding dev-sa-pod-reader
kubectl delete role pod-reader
kubectl delete serviceaccount dev-sa
```

### 演習6: NetworkPolicy

```bash
# 1. テスト環境作成
kubectl create namespace netpol-test
kubectl -n netpol-test create deployment web --image=nginx
kubectl -n netpol-test expose deployment web --port=80
kubectl -n netpol-test create deployment client --image=busybox -- sleep 3600

# 2. 初期状態確認（通信可能）
kubectl -n netpol-test exec deploy/client -- wget -qO- --timeout=3 web

# 3. デフォルト拒否Policy
cat << 'EOF' | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all
  namespace: netpol-test
spec:
  podSelector: {}
  policyTypes:
    - Ingress
EOF

# 4. 通信確認（タイムアウト）
kubectl -n netpol-test exec deploy/client -- wget -qO- --timeout=3 web || echo "Blocked!"

# 5. クリーンアップ
kubectl delete namespace netpol-test
```

### 演習7: Helm

```bash
# 1. リポジトリ追加
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# 2. チャートインストール
helm install my-nginx bitnami/nginx \
  --set replicaCount=2 \
  --set service.type=ClusterIP

# 3. 確認
helm list
kubectl get deploy,svc

# 4. アップグレード
helm upgrade my-nginx bitnami/nginx --set replicaCount=3

# 5. ロールバック
helm rollback my-nginx 1

# 6. クリーンアップ
helm uninstall my-nginx
```

---

## 18. DOP試験対策チェックリスト

### Q1: Deploymentの更新戦略

**問題**: ダウンタイムなしでアプリケーションを更新する方法は？

**解答**: **RollingUpdate戦略**を使用

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

- `maxUnavailable: 0` で常に希望数を維持
- `maxSurge: 1` で1つずつ新バージョンを追加

---

### Q2: Pod間通信の制御

**問題**: 特定のPod間のみ通信を許可する方法は？

**解答**: **NetworkPolicy**を使用

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
spec:
  podSelector:
    matchLabels:
      app: backend
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
```

---

### Q3: Secretの安全な管理

**問題**: 機密情報をPodに安全に渡す方法は？

**解答**:
1. **Secret**リソースを使用
2. **環境変数**または**ボリュームマウント**で参照
3. 本番ではAWS Secrets Manager + External Secrets Operator推奨

---

### Q4: リソース不足への対応

**問題**: Podがスケジュールされない場合の対処は？

**解答**:
1. `kubectl describe pod` でイベント確認
2. `kubectl describe node` でリソース確認
3. ノード追加またはリソースrequests削減

---

### Q5: ステートフルアプリの管理

**問題**: データベースのようなステートフルアプリの管理方法は？

**解答**: **StatefulSet**を使用
- 安定したネットワークID（pod-0, pod-1...）
- 順序付きデプロイ/スケール
- volumeClaimTemplatesで専用PVC

---

### Q6: ノード選択

**問題**: 特定のノードにPodを配置する方法は？

**解答**:
1. **nodeSelector**: シンプルなラベルマッチ
2. **nodeAffinity**: 柔軟な条件指定
3. **Taints/Tolerations**: ノード側からの制御

---

### Q7: ヘルスチェック

**問題**: アプリの正常性を確認する仕組みは？

**解答**: **Probe**を設定
- **livenessProbe**: 生存確認（失敗→再起動）
- **readinessProbe**: 準備完了確認（失敗→Service除外）
- **startupProbe**: 起動確認（成功までliveness/readiness無効）

---

### Q8: ログ収集

**問題**: 複数コンテナのログを収集する方法は？

**解答**:
1. **サイドカーパターン**: ログ収集コンテナを同一Podに配置
2. **DaemonSet**: 各ノードにログ収集エージェント
3. CloudWatch Logs / Fluent Bit

---

### Q9: 設定変更の反映

**問題**: ConfigMap変更をPodに反映する方法は？

**解答**:
1. **ボリュームマウント**: 自動反映（数秒〜分の遅延）
2. **環境変数**: Pod再起動が必要
3. **Deployment再起動**: `kubectl rollout restart deployment/xxx`

---

### Q10: RBAC設計

**問題**: 開発者に読み取り専用アクセスを付与する方法は？

**解答**: 組み込みClusterRole `view` を使用

```bash
kubectl create rolebinding dev-view \
  --clusterrole=view \
  --user=developer@example.com \
  --namespace=development
```

---

## 付録: よく使うコマンド

```bash
# リソース操作
kubectl apply -f <file.yaml>
kubectl delete -f <file.yaml>
kubectl get all -A
kubectl describe <resource> <name>

# デバッグ
kubectl logs <pod> [-c container] [-f] [--previous]
kubectl exec -it <pod> -- /bin/sh
kubectl port-forward <pod> 8080:80
kubectl debug <pod> -it --image=busybox

# Deployment
kubectl rollout status deployment/<name>
kubectl rollout undo deployment/<name>
kubectl rollout restart deployment/<name>
kubectl scale deployment/<name> --replicas=5

# 情報取得
kubectl get pods -o wide --show-labels
kubectl top nodes / pods
kubectl api-resources
kubectl explain <resource>

# クラスター管理
kubectl config get-contexts
kubectl config use-context <context>
kubectl cluster-info
```
