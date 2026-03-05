# Server ↔ Electron 交互文档

> 描述服务端（NestJS）与 Electron 客户端之间在**工程、机器、任务**三个业务模块上的完整交互逻辑，以及 WebSocket 长连接的建立与握手机制。

---

## 目录

1. [整体架构](#整体架构)
2. [WebSocket 长连接](#websocket-长连接)
   - [连接建立](#连接建立)
   - [注册握手](#注册握手)
   - [READY 握手](#ready-握手)
   - [心跳保活](#心跳保活)
   - [断线重连](#断线重连)
   - [消息类型总览](#消息类型总览)
3. [机器模块](#机器模块)
4. [工程模块](#工程模块)
5. [任务模块](#任务模块)
   - [创建与实时下发](#创建与实时下发)
   - [任务捕捉确认](#任务捕捉确认)
   - [离线补推机制](#离线补推机制)
   - [任务执行结果上报](#任务执行结果上报)
   - [重新下发](#重新下发)

---

## 整体架构

```
┌─────────────────────┐          HTTP (REST)          ┌──────────────────────┐
│                     │ ◄────────────────────────────► │                      │
│   NestJS Server     │                                │  Electron 客户端      │
│                     │ ◄────────────────────────────► │                      │
│  - TasksController  │      WebSocket (/ws namespace) │  - WsClient          │
│  - MachinesCtrl     │                                │  - distribute/index  │
│  - ProjectsCtrl     │                                │  - 本地 SQLite DB     │
│  - TasksGateway     │                                │                      │
│                     │                                │                      │
└─────────────────────┘                                └──────────────────────┘
         │
         │  SQLite / MySQL
         ▼
    ┌─────────┐
    │   DB    │
    └─────────┘
```

- **HTTP**：机器注册、工程管理、任务查询/编辑等管理类操作
- **WebSocket**：任务实时下发、心跳保活、任务结果上报等实时类操作
- **本地 SQLite**：Electron 在本地缓存服务端工程和任务，离线也可查看历史

---

## WebSocket 长连接

### 连接建立

Electron 调用 `connectServer({ serverUrl })` 时触发连接，内部使用 `socket.io-client` 连接到服务端的 `/ws` namespace。

```
Electron                                Server
   │                                       │
   │──── TCP 握手，连接 /ws namespace ──────►│
   │                                       │  handleConnection()
   │◄──── 连接成功 ────────────────────────│
```

连接参数：
```typescript
io(`${serverUrl}/ws`, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelayMax: 30000,   // 最大重连间隔 30s
  timeout: 10000
})
```

---

### 注册握手

TCP 连接建立后，Electron 立即发送 `REGISTER` 消息，携带本机 API Key，服务端验证后完成身份绑定。

```
Electron                                    Server
   │                                           │
   │──── REGISTER { apiKey } ─────────────────►│
   │                                           │  bcrypt.compare(apiKey, machine.apiKey)
   │                                           │  绑定 socket.machineId
   │                                           │  更新 Machine.status = ONLINE
   │◄─── REGISTER_ACK { status: 'accepted',   │
   │       machineId } ────────────────────────│
   │                                           │
   │  [等待 1000ms]                            │
   │                                           │
   │──── READY ───────────────────────────────►│  触发离线任务补推
```

- API Key 在服务端以 bcrypt 哈希存储，注册时逐条比对
- 同一台机器重复连接时，服务端会踢掉旧连接（发送 ERROR 后 disconnect）
- 注册失败（apiKey 无效）时，服务端返回 `REGISTER_ACK { status: 'rejected' }`，客户端主动断开

---

### READY 握手

`REGISTER_ACK` 成功后，Electron **延迟 1 秒**自动发送 `READY` 信号。

**设计意图**：1 秒窗口期留给业务层完成初始化（加载本地 DB、初始化 UI 等）。若后续业务初始化逻辑变复杂，可在初始化完成后手动调用 `ipc.distribute.sendReady()` 替代定时器。

```
收到 REGISTER_ACK(accepted)
    │
    ▼
setTimeout(1000ms)
    │
    ▼
socket.emit(READY)
    │
    ▼  服务端 handleReady()
pushPendingTasksToMachine()   ← 补推所有未捕捉的待处理任务
```

---

### 心跳保活

注册成功后，Electron 每 **15 秒**发送一次心跳，携带当前工作状态。

```
Electron                              Server
   │──── HEARTBEAT { status, currentTaskId } ──►│
   │                                             │  更新 Machine.lastHeartbeat
   │                                             │  更新 Machine.status (ONLINE/BUSY)
```

服务端有超时检测定时器（`HEARTBEAT_TIMEOUT = 30s`，额外 5s 缓冲）：
- 超过 35s 未收到心跳 → 发送 `ERROR { message: 'Heartbeat timeout' }` → 强制断开客户端
- 断开后 `Machine.status` 更新为 `OFFLINE`

心跳 `status` 字段：
| 值 | 含义 | 服务端机器状态 |
|---|---|---|
| `idle` | 空闲 | `ONLINE` |
| `busy` | 执行中 | `BUSY` |

---

### 断线重连

socket.io 内置自动重连，重连成功后重新执行注册流程：

```
断线
  │
  ▼
reconnect_attempt (状态变为 RECONNECTING)
  │
  ▼
reconnect 成功
  │
  ▼
重新发送 REGISTER   ←  与首次连接相同流程
  │
  ▼
REGISTER_ACK → 延迟 1s → READY → 补推离线任务
```

---

### 消息类型总览

| 消息 | 方向 | 触发时机 |
|---|---|---|
| `REGISTER` | Electron → Server | TCP 连接建立后立即发送 |
| `REGISTER_ACK` | Server → Electron | 验证 API Key 后回包 |
| `READY` | Electron → Server | 注册成功后延迟 1s，或手动调用 |
| `HEARTBEAT` | Electron → Server | 每 15s 定时发送 |
| `TASK_ASSIGNED` | Server → Electron | 任务下发 / 离线补推 |
| `TASK_CAPTURED` | Electron → Server | 收到 `TASK_ASSIGNED` 后立即回包 |
| `TASK_RESULT` | Electron → Server | 任务执行完成后上报结果 |
| `TASK_RESULT_ACK` | Server → Electron | 确认收到任务结果 |
| `ERROR` | Server → Electron | 认证失败、心跳超时、任务异常等 |

---

## 机器模块

机器代表一台 Electron 客户端节点，通过 HTTP 接口管理，通过 WebSocket 保持在线状态。

### HTTP 接口

| 接口 | 说明 |
|---|---|
| `POST /api/machines/create` | 注册本机，返回 `apiKey`（明文，仅此一次）|
| `POST /api/machines/list` | 获取所有机器列表 |
| `POST /api/machines/pageList` | 分页获取机器列表 |
| `POST /api/machines/detail` | 获取机器详情，body: `{ id }` |
| `POST /api/machines/update` | 更新机器信息，body: `{ id, ...fields }` |
| `POST /api/machines/remove` | 删除机器，body: `{ id }` |
| `POST /api/machines/bindProject` | 绑定工程到机器 |
| `POST /api/machines/unbindProject` | 解绑工程 |
| `POST /api/machines/boundProjects` | 获取机器已绑定的工程列表 |

### 注册流程

```
Electron 首次启动
    │
    ▼
POST /api/machines/create { name, platform, ... }
    │
    ▼  服务端生成 apiKey（明文返回一次，DB 存 bcrypt 哈希）
{ machine: { id, ... }, apiKey: '原始密钥' }
    │
    ▼
Electron 本地 store 保存 apiKey 和 machineId
    │
    ▼
自动触发 connectServer() → WebSocket 连接
```

### 状态流转

```
OFFLINE  ──[WebSocket 注册成功]──►  ONLINE
ONLINE   ──[心跳 status=busy]──►   BUSY
BUSY     ──[心跳 status=idle]──►   ONLINE
ONLINE   ──[超时/断线]───────────►  OFFLINE
BUSY     ──[超时/断线]───────────►  OFFLINE
```

---

## 工程模块

工程是任务的执行上下文，描述一个代码仓库。服务端统一管理，Electron 本地缓存一份镜像用于展示和路径绑定。

### HTTP 接口（服务端）

| 接口 | 说明 |
|---|---|
| `POST /api/projects/create` | 创建工程 |
| `POST /api/projects/list` | 获取所有工程 |
| `POST /api/projects/pageList` | 分页获取工程 |
| `POST /api/projects/detail` | 获取工程详情，body: `{ id }` |
| `POST /api/projects/update` | 更新工程信息 |
| `POST /api/projects/remove` | 删除工程，body: `{ id }` |

### Electron 本地工程管理

Electron 在本地 SQLite 维护一张 `local_projects` 表，镜像服务端工程并附加本地信息：

| 字段 | 说明 |
|---|---|
| `id` | 本地自增主键 |
| `remoteId` | 服务端工程 ID，纯本地工程为空 |
| `localPath` | 本地代码目录路径 |
| `branch` | 工作分支，默认 `main` |
| `syncedAt` | 最后一次从服务端同步的时间 |
| `uploadedAt` | 上报到服务端的时间（纯本地工程专用）|

**数据流向：**

```
服务端工程
    │
    ▼  syncProjects() / syncRemoteProject()
本地 SQLite (local_projects)
    │
    ├── setProjectLocalPath()   设置本地代码路径
    └── updateLocalProject()    更新本地元数据
```

**纯本地工程上报流程：**

```
addLocalProject()      在本地创建一条纯本地工程
    │
    ▼
uploadLocalProject()   POST /api/projects/create
    │
    ▼
dbMarkUploaded()       写入 remoteId + uploadedAt，与服务端关联
```

### 机器-工程绑定

机器绑定工程表示"这台 Electron 可以处理该工程的任务"，是**离线补推**和**任务匹配**的依据。

```
POST /api/machines/bindProject { machineId, projectId, localPath?, branch? }
```

绑定关系存储在 `machine_projects` 表（服务端），Electron 通过 `getMachineProjects()` 拉取后展示。

---

## 任务模块

任务是核心业务对象，由 Web 端创建，服务端通过 WebSocket 下发给 Electron 执行。

### 任务状态机

```
PENDING
  │
  ├──[机器在线，立即下发]──────────────────► RUNNING
  │                                            │
  ├──[机器离线，等待补推]                      ├──[执行完成]──► COMPLETED
  │      │                                     └──[执行失败]──► FAILED
  │      └──[机器上线，READY 触发补推]──────► RUNNING
  │
  └──[手动重新下发 redispatch]──────────────► RUNNING（机器在线）
                                              PENDING（机器仍离线）
```

额外字段：
- `isCaptured`：`0` 未捕捉 / `1` 已捕捉（客户端已收到任务的 WebSocket 推送）
- `assignedMachineId`：绑定的目标机器 ID

---

### 创建与实时下发

```
Web 端
  │
  ▼  POST /api/tasks/create { title, description, priority, list:[{projectId, machineId?}] }
  │
  ▼  TasksService.create()
     ├── 校验 projectId / machineId 有效性
     ├── 保存 Task（status=PENDING）
     └── dispatchTaskItems()
            │
            ▼  对每个指定了 machineId 的 taskItem：
            TasksGateway.sendTaskToMachine(machineId, taskPayload)
               ├── [机器在线]  emit TASK_ASSIGNED  → Task.status = RUNNING，Machine.status = BUSY
               └── [机器离线]  返回 false          → Task.status 保持 PENDING
```

---

### 任务捕捉确认

```
Server ──── TASK_ASSIGNED { taskId, content, projectId, projectName, gitUrl } ────► Electron
                                                                                        │
                                                                                        │  收到任务
                                                                                        │  写入本地 SQLite (local_tasks)
                                                                                        │  系统通知弹出
                                                                                        │  推送给渲染进程 (distribute:task-received)
                                                                                        │
Electron ◄──────────────── 立即回包 ────────────────────────────────────────────────────┘
  │
  ▼  socket.emit(TASK_CAPTURED, { taskId })
  │
Server: handleTaskCaptured()
  └── Task.isCaptured = 1
  └── Task.assignedMachineId = client.machineId  （补全无指定机器的任务）
```

Web 端任务列表据此显示**已捕捉 / 未捕捉**状态标签。

---

### 离线补推机制

当机器处于离线状态时，Web 端创建的任务无法立即推送，补推机制保证上线后能自动获取。

**触发时机**：机器发送 `READY` 信号（注册成功后延迟 1s 自动发送）

**补推范围**（满足其一即补推）：

```
① 任务.assignedMachineId = 当前机器
   AND 任务.isCaptured = 0
   AND 任务.status IN (PENDING, DISTRIBUTED)

② 任务.assignedMachineId IS NULL
   AND 任务.isCaptured = 0
   AND 任务.status IN (PENDING, DISTRIBUTED)
   AND 任务.projectIds ∩ 机器绑定工程 ≠ ∅
```

```
Electron ──── READY ────────────────────────────────────────► Server
                                                                 │
                                                          查询机器绑定的工程 IDs
                                                                 │
                                                          查询符合条件的任务
                                                                 │
                                              FOR EACH task in tasksToSend:
                                                  emit TASK_ASSIGNED → Electron
```

---

### 任务执行结果上报

Electron 执行完任务后通过 WebSocket 上报结果（HTTP 降级备用）：

```
Electron
  │  调用 finishLocalTask(localTaskId, { success, result })
  │
  ▼  [WebSocket 已连接]                   [WebSocket 断线]
  socket.emit(TASK_RESULT, {              POST /api/tasks/updateStatus {
    taskId, status, result, logs            taskId, machineId, status, result, logs
  })                                      }
       │
       ▼  Server: handleTaskResult()
          ├── 验证 task.assignedMachineId === client.machineId
          ├── 更新 Task.status / result / logs
          ├── 更新 Machine.status = ONLINE（任务结束，机器空闲）
          └── 回包 TASK_RESULT_ACK { taskId, status: 'acknowledged' }
```

---

### 重新下发

Web 端可对状态为 `PENDING` / `DISTRIBUTED` 的任务手动触发重新下发：

```
Web 端
  │  POST /api/tasks/redispatch { id }
  │
  ▼  TasksService.redispatch()
     ├── 重置 Task.status = PENDING
     └── dispatchTaskItems()  （复用创建时的下发逻辑）
            │
            ├── [机器在线]  TASK_ASSIGNED → RUNNING
            └── [机器离线]  保持 PENDING，等待下次 READY 补推
```
