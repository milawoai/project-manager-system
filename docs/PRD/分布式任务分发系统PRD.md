# 分布式任务分发系统 PRD

## 1. 项目概述

### 1.1 项目背景

本系统旨在构建一个分布式任务分发平台，用于将开发任务自动分发到配置好的工作机器上执行。工作机器安装有各种 AI 编程工具（Claude Code、Cursor、TRAE 等），完成任务后会进行远程上报。

### 1.2 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         服务端 (NestJS + MySQL)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  REST API   │  │  WebSocket  │  │   任务调度引擎          │ │
│  │  (管理接口) │  │  (长连接)    │  │   (任务分发)           │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │ │
                    WebSocket │ │ REST
                              │ ▼
┌─────────────────────────────────────────────────────────────────┐
│                      工作机器 (Node.js + SQLite)                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  WebSocket  │  │  本地工程    │  │   Agent 任务执行器      │ │
│  │  客户端     │  │  管理        │  │   (Prompt 展示)        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 核心模块

| 模块 | 技术栈 | 说明 |
|------|--------|------|
| 服务端 | NestJS + MySQL + WebSocket | 任务管理、机器管理、工程管理、任务分发 |
| 工作机器 | Node.js + SQLite + WebSocket | 本地工程管理、任务接收执行、状态上报 |

---

## 2. 功能需求

### 2.1 服务端功能

#### 2.1.1 任务发放接口

**接口路径：** `POST /api/tasks/distribute`

**功能描述：**
- 用户提供任务内容 + 可选的工程 ID 列表
- 服务端通过大模型将任务分解为子任务
- 根据工程 ID 找到绑定的空闲工作机器
- 通过 WebSocket 将任务下发到对应机器

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| content | string | 是 | 任务内容/需求描述 |
| projectIds | string[] | 否 | 指定在哪些工程上执行，不填则所有工程 |
| priority | number | 否 | 优先级，1-5，默认为 3 |

**返回：**

| 字段 | 类型 | 说明 |
|------|------|------|
| taskId | string | 任务 ID |
| subTasks | array | 分解后的子任务列表 |
| assignedMachines | array | 分配的工作机器列表 |

#### 2.1.2 工程管理

**接口列表：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/projects | 创建工程 |
| GET | /api/projects | 获取工程列表 |
| GET | /api/projects/:id | 获取工程详情 |
| PUT | /api/projects/:id | 更新工程 |
| DELETE | /api/projects/:id | 删除工程 |

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 工程名称 |
| gitUrl | string | 是 | Git 仓库地址 |
| description | string | 否 | 工程描述 |
| platform | string | 否 | 平台：windows/linux/macos |

#### 2.1.3 工作机器管理

**接口列表：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/machines | 注册工作机器 |
| GET | /api/machines | 获取机器列表 |
| GET | /api/machines/:id | 获取机器详情 |
| PUT | /api/machines/:id | 更新机器信息 |
| DELETE | /api/machines/:id | 删除机器 |
| POST | /api/machines/:id/projects | 绑定工程到机器 |
| DELETE | /api/machines/:id/projects/:projectId | 解绑工程 |

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 机器名称 |
| platform | string | 是 | 平台：windows/linux/macos |
| ip | string | 是 | 机器 IP |
| apiKey | string | 是 | 机器 API Key |
| capabilities | string[] | 否 | 支持的工具列表 |

#### 2.1.4 任务状态报告接口

**接口路径：** `POST /api/tasks/:id/status`

**功能描述：** 工作机器通过此接口上报任务状态

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 是 | 状态：pending/running/completed/failed |
| result | string | 否 | 执行结果 |
| logs | string | 否 | 执行日志 |
| machineId | string | 是 | 工作机器 ID |

#### 2.1.5 WebSocket 长连接

**连接路径：** `ws://server:port/ws`

**消息类型：**

| 类型 | 方向 | 说明 |
|------|------|------|
| REGISTER | 机器→服务端 | 机器注册认证 |
| HEARTBEAT | 机器→服务端 | 心跳保活 |
| TASK_ASSIGNED | 服务端→机器 | 下发任务 |
| TASK_RESULT | 机器→服务端 | 上报任务结果 |
| MACHINE_STATUS | 机器→服务端 | 机器状态变更 |

**连接流程：**
1. 工作机器连接 WebSocket
2. 发送 REGISTER 消息，包含 apiKey
3. 服务端验证后返回 REGISTER_ACK
4. 双方定期发送 HEARTBEAT 保持连接
5. 服务端通过 TASK_ASSIGNED 下发任务
6. 机器执行完成后发送 TASK_RESULT

### 2.2 工作机器功能

#### 2.2.1 本地工程管理

**功能描述：**
- 维护本地工程列表（从服务端同步）
- Git 仓库的克隆/拉取/切换分支
- 工程的构建/测试命令配置

**本地接口：**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/local/projects | 获取本地工程列表 |
| POST | /api/local/projects/sync | 同步工程列表 |
| POST | /api/local/projects/:id/git-pull | 拉取最新代码 |

#### 2.2.2 任务接收与执行

**功能描述：**
- 通过 WebSocket 接收服务端任务
- 将任务转成 Prompt 展示给用户（本期目标）
- 支持用户手动确认开始/完成

**本地接口：**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/tasks | 获取任务列表 |
| GET | /api/tasks/:id | 获取任务详情 |
| POST | /api/tasks/:id/start | 开始执行任务 |
| POST | /api/tasks/:id/complete | 标记任务完成 |
| POST | /api/tasks/:id/fail | 标记任务失败 |

#### 2.2.3 状态上报

**功能描述：**
- 定时向服务端发送心跳
- 任务状态变更时主动上报

---

## 3. 数据库设计

### 3.1 服务端 MySQL 表

#### 3.1.1 projects（工程表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | 主键 UUID |
| name | varchar(255) | 工程名称 |
| git_url | varchar(500) | Git 仓库地址 |
| description | text | 工程描述 |
| platform | varchar(50) | 平台：windows/linux/macos |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

#### 3.1.2 machines（工作机器表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | 主键 UUID |
| name | varchar(255) | 机器名称 |
| platform | varchar(50) | 平台：windows/linux/macos |
| ip | varchar(50) | 机器 IP |
| api_key | varchar(255) | API Key |
| status | varchar(50) | 状态：online/offline/busy |
| capabilities | json | 支持的工具列表 |
| last_heartbeat | datetime | 最后心跳时间 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

#### 3.1.3 machine_projects（机器-工程关联表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | 主键 UUID |
| machine_id | varchar(36) | 机器 ID |
| project_id | varchar(36) | 工程 ID |
| local_path | varchar(500) | 本地路径 |
| branch | varchar(100) | 当前分支 |
| created_at | datetime | 创建时间 |

#### 3.1.4 tasks（任务表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | 主键 UUID |
| content | text | 任务内容 |
| project_ids | json | 目标工程 ID 列表 |
| priority | int | 优先级 1-5 |
| status | varchar(50) | 状态：pending/distributed/running/completed/failed |
| assigned_machine_id | varchar(36) | 分配的机器 ID |
| result | text | 执行结果 |
| logs | text | 执行日志 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

#### 3.1.5 api_keys（API Key 管理表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | 主键 UUID |
| key | varchar(255) | API Key |
| name | string | 名称/用途 |
| type | varchar(50) | 类型：machine/admin |
| expires_at | datetime | 过期时间 |
| created_at | datetime | 创建时间 |

### 3.2 工作机器 SQLite 表

#### 3.2.1 local_projects（本地工程表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | 主键 UUID（与服务端一致） |
| name | varchar(255) | 工程名称 |
| git_url | varchar(500) | Git 仓库地址 |
| local_path | varchar(500) | 本地路径 |
| branch | varchar(100) | 当前分支 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

#### 3.2.2 local_tasks（本地任务表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | 主键 UUID（与服务端一致） |
| content | text | 任务内容 |
| status | varchar(50) | 状态：pending/running/completed/failed |
| prompt | text | 生成的 Prompt |
| result | text | 执行结果 |
| logs | text | 执行日志 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

---

## 4. 非功能需求

### 4.1 性能要求

- 服务端支持至少 10 个工作机器同时在线
- WebSocket 连接建立时间 < 1 秒
- 任务分发延迟 < 2 秒

### 4.2 可用性

- 工作机器断线后自动重连
- 服务端 WebSocket 需要心跳检测，30 秒内无心跳则判定离线
- 任务执行超时可配置，默认 30 分钟

### 4.3 安全性

- 所有 API 调用需要 API Key 认证
- API Key 存储使用 bcrypt 加密
- WebSocket 连接需要先通过 REGISTER 消息认证

### 4.4 部署要求

- 服务端支持 Docker 部署
- 工作机器为独立进程，可在 Windows/Linux/macOS 运行

---

## 5. 一期实现范围

### 5.1 包含功能

1. ✅ 服务端 REST API（工程管理、机器管理、任务发放、状态上报）
2. ✅ 服务端 WebSocket 长连接（任务下发、状态接收）
3. ✅ 工作机器客户端（WebSocket 连接、本地工程管理、任务接收）
4. ✅ 任务转 Prompt 展示功能

### 5.2 不包含（放入二期）

- 大模型任务分解
- Agent 工具自动执行
- 前端管理页面
- 任务结果审核
- 动态工具安装

---

## 6. 接口详细设计

### 6.1 任务发放接口详解

```
POST /api/tasks/distribute

Request:
{
  "content": "为用户模块添加忘记密码功能",
  "projectIds": ["uuid1", "uuid2"],
  "priority": 3
}

Response (200):
{
  "taskId": "uuid",
  "subTasks": [
    {
      "id": "sub-uuid-1",
      "content": "添加密码重置API接口",
      "projectId": "uuid1"
    },
    {
      "id": "sub-uuid-2",
      "content": "添加邮箱发送逻辑",
      "projectId": "uuid2"
    }
  ],
  "assignedMachines": [
    {
      "machineId": "machine-uuid-1",
      "machineName": "dev-mac-01",
      "platform": "macos"
    }
  ]
}
```

### 6.2 WebSocket 消息格式

```json
// 机器注册
{
  "type": "REGISTER",
  "payload": {
    "apiKey": "machine-api-key"
  }
}

// 服务端响应注册
{
  "type": "REGISTER_ACK",
  "payload": {
    "machineId": "uuid",
    "status": "accepted"
  }
}

// 心跳
{
  "type": "HEARTBEAT",
  "payload": {
    "status": "idle",
    "currentTaskId": null
  }
}

// 下发任务
{
  "type": "TASK_ASSIGNED",
  "payload": {
    "taskId": "uuid",
    "content": "任务内容",
    "projectId": "uuid",
    "projectName": "工程名",
    "gitUrl": "git@xxx"
  }
}

// 上报结果
{
  "type": "TASK_RESULT",
  "payload": {
    "taskId": "uuid",
    "status": "completed",
    "result": "执行结果",
    "logs": "执行日志"
  }
}
```
