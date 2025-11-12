# API 测试示例

本文档提供了测试各个新增接口的示例脚本。

## 1. 导入测试任务

```bash
# 方式1: 通过 JSON 导入
curl -X POST http://localhost:3000/api/tasks/import \
  -H "Content-Type: application/json" \
  -d '{
    "paths": [
      "/data/file1.pdf",
      "/data/file2.pdf",
      "/data/file3.pdf"
    ]
  }'
```

## 2. 获取任务（模拟节点请求任务）

```bash
curl -X POST http://localhost:3000/api/tasks/get_task \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 2}'

# 响应示例:
# [
#   {"task_id": "task_xxx", "body": "/data/file1.pdf"},
#   {"task_id": "task_yyy", "body": "/data/file2.pdf"}
# ]
```

## 3. 上报任务完成状态

```bash
# 成功完成
curl -X POST http://localhost:3000/api/tasks/set_task_status \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "task_xxx",
    "status": true,
    "message": "处理成功"
  }'

# 失败
curl -X POST http://localhost:3000/api/tasks/set_task_status \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "task_yyy",
    "status": false,
    "message": "文件损坏"
  }'
```

## 4. 上报节点处理速度统计

```bash
# 节点1上报
curl -X POST http://localhost:3000/api/tasks/set_processed_info \
  -H "Content-Type: application/json" \
  -d '{
    "node_id": "worker-node-001",
    "item_num": 150,
    "running_time": 45.5
  }'

# 节点2上报
curl -X POST http://localhost:3000/api/tasks/set_processed_info \
  -H "Content-Type: application/json" \
  -d '{
    "node_id": "worker-node-002",
    "item_num": 200,
    "running_time": 60.2
  }'
```

## 5. 查询节点统计信息

```bash
curl http://localhost:3000/api/tasks/node_stats

# 响应示例:
# {
#   "nodes": [
#     {
#       "nodeId": "worker-node-001",
#       "totalItemNum": 150,
#       "totalRunningTime": 45.5,
#       "recordCount": 1,
#       "avgSpeed": 3.2967,
#       "lastUpdated": 1699999999999
#     }
#   ]
# }
```

## 6. 查询任务状态

```bash
# 按任务ID查询
curl "http://localhost:3000/api/tasks/search?query=task_xxx"

# 按文件路径查询
curl "http://localhost:3000/api/tasks/search?query=/data/file1.pdf"

# 响应示例:
# {
#   "found": true,
#   "task": {
#     "id": "task_xxx",
#     "path": "/data/file1.pdf",
#     "status": "completed",
#     "failureCount": 0,
#     "message": "处理成功",
#     "createdAt": 1699999999999,
#     "updatedAt": 1699999999999,
#     "processingStartedAt": null
#   }
# }
```

## 7. 检查并重置超时任务

```bash
# 检查超过5分钟的超时任务
curl -X POST http://localhost:3000/api/tasks/check_timeout \
  -H "Content-Type: application/json" \
  -d '{"timeoutMs": 300000}'

# 检查超过1分钟的超时任务（测试用）
curl -X POST http://localhost:3000/api/tasks/check_timeout \
  -H "Content-Type: application/json" \
  -d '{"timeoutMs": 60000}'

# 响应示例:
# {
#   "success": true,
#   "requeuedCount": 3,
#   "timeoutMs": 300000
# }
```

## 8. 获取任务汇总信息

```bash
# 查看所有任务
curl "http://localhost:3000/api/tasks/summary?status=all&page=1&pageSize=20"

# 查看未处理任务
curl "http://localhost:3000/api/tasks/summary?status=pending&page=1&pageSize=20"

# 查看处理中任务
curl "http://localhost:3000/api/tasks/summary?status=processing&page=1&pageSize=20"
```

## 完整工作流测试

```bash
# 1. 导入任务
curl -X POST http://localhost:3000/api/tasks/import \
  -H "Content-Type: application/json" \
  -d '{"paths": ["/test/file1.pdf", "/test/file2.pdf", "/test/file3.pdf"]}'

# 2. 获取任务（模拟节点拉取）
TASKS=$(curl -s -X POST http://localhost:3000/api/tasks/get_task \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 2}')
echo $TASKS

# 3. 提取第一个任务ID并标记完成（需要手动替换task_id）
curl -X POST http://localhost:3000/api/tasks/set_task_status \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "替换为实际的task_id",
    "status": true,
    "message": "处理完成"
  }'

# 4. 上报节点性能
curl -X POST http://localhost:3000/api/tasks/set_processed_info \
  -H "Content-Type: application/json" \
  -d '{
    "node_id": "test-node-001",
    "item_num": 100,
    "running_time": 30.5
  }'

# 5. 查询刚才的任务
curl "http://localhost:3000/api/tasks/search?query=/test/file1.pdf"

# 6. 查看统计
curl "http://localhost:3000/api/tasks/summary?status=all&page=1&pageSize=10"
```

## 压力测试

```bash
# 导入大量任务
for i in {1..1000}; do
  curl -s -X POST http://localhost:3000/api/tasks/import \
    -H "Content-Type: application/json" \
    -d "{\"paths\": [\"/data/batch$i/file$i.pdf\"]}" > /dev/null
done

# 批量获取任务
curl -X POST http://localhost:3000/api/tasks/get_task \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 100}'
```

