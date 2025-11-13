## 任务调度系统 Demo

该项目基于 Next.js App Router，实现了一个用于管理大规模文件处理任务的调度系统。支持从文本文件或手动输入导入待处理文件路径，并通过接口对任务状态进行统一分发与回传，同时提供可视化界面，便于分页查看不同状态队列的任务。

### 功能概览

- 批量导入：上传 `.txt` 文件或粘贴多行文本，每行一个路径。
- 状态管理：内置"未处理、处理中、已完成、失败"四大队列，支持连续失败阈值控制。
- 超时管理：自动定时检查超时任务，可页面配置超时时间和检查间隔，自动将超时的"处理中"任务重新加入未处理队列。
- 任务查询：支持按任务ID或文件路径查询任务的当前状态。
- 节点统计：记录各执行节点的处理速度、运行时间等性能数据。
- 调度接口：
  - `POST /api/tasks/get_task`：按批次分配任务。
  - `POST /api/tasks/set_task_status`：回传任务执行结果及失败原因。
  - `POST /api/tasks/set_processed_info`：上报节点处理速度统计。
  - `GET /api/tasks/search?query=xxx`：查询任务状态。
  - `POST /api/tasks/check_timeout`：检查并重置超时任务。
- 数据统计：统计各队列任务数量，支持分页与筛选。
- UI 控制台：实时刷新任务列表，支持调整每页数量及状态筛选，表格支持一键复制任务ID和路径（带反馈提示）。

### 环境变量

| 变量名 | 默认值 | 说明 |
| ------ | ------ | ---- |
| `TASK_BATCH_SIZE` | `10` | 调度接口默认每批返回的任务数量 |
| `TASK_BATCH_MAX` | `1000` | `get_task` 接口单次最大分发数量上限 |
| `TASK_FAILURE_THRESHOLD` | `3` | 任务连续失败达到该值时，转入失败队列 |
| `TASK_PAGE_SIZE` | `20` | 控制台接口默认分页大小 |
| `TASK_PAGE_MAX` | `200` | 控制台接口允许的最大分页大小 |
| `TASK_TIMEOUT_MS` | `900000` | 任务超时时间（毫秒），默认15分钟 |

可以在根目录创建 `.env.local` 文件覆盖上述默认值：

```
TASK_BATCH_SIZE=50
TASK_FAILURE_THRESHOLD=5
TASK_TIMEOUT_MS=600000
```

### 启动项目

```bash
pnpm install
pnpm dev
```

启动后访问 [http://localhost:3000](http://localhost:3000)。界面支持上传文件、查看队列、刷新统计等操作。

### API 接口示例

#### 1. 获取任务（分配任务给节点）

```bash
# POST /api/tasks/get_task
curl -X POST http://localhost:3000/api/tasks/get_task \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 50}'

# 返回
[
  {"task_id": "task_xxx", "body": "/path/to/file1.pdf"},
  {"task_id": "task_yyy", "body": "/path/to/file2.pdf"}
]
```

#### 2. 回传任务状态

```bash
# POST /api/tasks/set_task_status
curl -X POST http://localhost:3000/api/tasks/set_task_status \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "task_xxx",
    "status": true,
    "message": ""
  }'
```

#### 3. 上报节点处理速度

```bash
# POST /api/tasks/set_processed_info
curl -X POST http://localhost:3000/api/tasks/set_processed_info \
  -H "Content-Type: application/json" \
  -d '{
    "node_id": "node-001",
    "item_num": 120,
    "running_time": 45.5
  }'
```

#### 4. 查询任务状态

```bash
# GET /api/tasks/search?query=xxx
curl "http://localhost:3000/api/tasks/search?query=task_xxx"

# 或通过文件路径查询
curl "http://localhost:3000/api/tasks/search?query=/path/to/file1.pdf"
```

#### 5. 检查超时任务

```bash
# POST /api/tasks/check_timeout
curl -X POST http://localhost:3000/api/tasks/check_timeout \
  -H "Content-Type: application/json" \
  -d '{"timeoutMs": 900000}'
```

> 本 Demo 使用内存存储以简化实现，若用于生产环境，请替换为持久化存储（如数据库、消息队列）并补充鉴权机制。
