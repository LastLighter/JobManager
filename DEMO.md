# 功能演示指南

本文档演示任务调度系统的主要功能，特别是最新改进的复制功能和自动超时管理。

## 启动项目

```bash
pnpm install
pnpm dev
```

访问 http://localhost:3000

---

## 1. 复制功能演示 📋

### 操作步骤

1. **导入测试任务**
   - 在"直接粘贴路径"区域输入：
     ```
     /data/test-file-001.pdf
     /data/test-file-002.pdf
     /data/very-long-path/with/multiple/directories/test-file-003.pdf
     ```
   - 点击"导入任务"

2. **测试复制功能**
   - 在任务列表中，找到任务ID列
   - **鼠标悬停**在📋图标上：
     - ✅ 应该看到灰色背景高亮
     - ✅ 鼠标指针变为手型
   - **点击**📋图标：
     - ✅ 按钮短暂显示深灰色（active 状态）
     - ✅ 页面顶部出现蓝色提示框："✓ 已复制到剪贴板"
     - ✅ 2 秒后提示框自动消失
   - **验证复制**：
     - 在任意文本编辑器中按 Ctrl+V
     - ✅ 应该粘贴出完整的任务ID

3. **测试路径复制**
   - 在"文件路径"列点击📋图标
   - ✅ 相同的交互效果
   - ✅ 复制成功提示
   - ✅ 可以粘贴出完整路径

---

## 2. 自动超时管理演示 ⏱️

### 配置说明

页面中的"自动超时管理"板块包含：
- **超时时间**：处理中的任务超过此时间会被重置（默认 15 分钟）
- **检查间隔**：系统每隔此时间自动检查一次（默认 1 分钟）
- **状态指示**：显示绿色"已启用"徽章

### 快速测试（1 分钟版本）

1. **调整配置以加快测试**
   - 将"超时时间"设为：`1` 分钟
   - 将"检查间隔"设为：`1` 分钟

2. **创建测试任务**
   ```bash
   # 使用 API 导入任务
   curl -X POST http://localhost:3000/api/tasks/import \
     -H "Content-Type: application/json" \
     -d '{"paths": ["/test/timeout-demo.pdf"]}'
   ```

3. **获取任务（让它进入"处理中"状态）**
   ```bash
   curl -X POST http://localhost:3000/api/tasks/get_task \
     -H "Content-Type: application/json" \
     -d '{"batchSize": 1}'
   
   # 记录返回的 task_id
   ```

4. **观察自动超时**
   - 在页面上切换到"处理中"标签
   - ✅ 应该看到刚才获取的任务
   - **等待 1 分钟**...
   - 打开浏览器控制台（F12）
   - ✅ 1 分钟后，控制台输出：`自动检查：已将 1 个超时任务重新加入队列`
   - ✅ 任务列表自动刷新
   - ✅ 该任务自动从"处理中"移回"未处理"

5. **验证任务仍可完成**
   - 即使任务已超时被重置，仍可通过 API 设置其状态
   ```bash
   curl -X POST http://localhost:3000/api/tasks/set_task_status \
     -H "Content-Type: application/json" \
     -d '{
       "task_id": "之前记录的task_id",
       "status": true,
       "message": "延迟完成"
     }'
   ```
   - ✅ 任务会被标记为"已完成"

### 正常场景测试（15 分钟版本）

1. **恢复默认配置**
   - 超时时间：`15` 分钟
   - 检查间隔：`1` 分钟

2. **模拟正常工作流**
   ```bash
   # 1. 导入任务
   curl -X POST http://localhost:3000/api/tasks/import \
     -H "Content-Type: application/json" \
     -d '{"paths": ["/prod/file1.pdf", "/prod/file2.pdf"]}'
   
   # 2. 节点获取任务
   curl -X POST http://localhost:3000/api/tasks/get_task \
     -H "Content-Type: application/json" \
     -d '{"batchSize": 2}'
   
   # 3. 节点快速完成（< 15分钟）
   curl -X POST http://localhost:3000/api/tasks/set_task_status \
     -H "Content-Type: application/json" \
     -d '{"task_id": "task_xxx", "status": true, "message": ""}'
   ```
   - ✅ 正常完成的任务不会被超时重置

3. **模拟节点宕机**
   - 获取任务但不回传状态
  - 15 分钟后系统自动检测并重置
   - 其他节点可以重新获取该任务

---

## 3. 任务查询演示 🔍

1. **导入测试数据**
   ```bash
   curl -X POST http://localhost:3000/api/tasks/import \
     -H "Content-Type: application/json" \
     -d '{"paths": ["/search/test-001.pdf", "/search/test-002.pdf"]}'
   ```

2. **按路径查询**
   - 在"任务查询"输入框输入：`/search/test-001.pdf`
   - 点击"查询"
   - ✅ 显示任务详情
   - ✅ 可以点击📋复制ID和路径

3. **按ID查询**
   - 从任务列表复制一个任务ID
   - 粘贴到查询框
   - ✅ 找到对应任务

---

## 4. 节点统计演示 📊

1. **上报节点数据**
   ```bash
   # 节点1上报
   curl -X POST http://localhost:3000/api/tasks/set_processed_info \
     -H "Content-Type: application/json" \
     -d '{"node_id": "worker-001", "item_num": 150, "running_time": 45.5}'
   
   # 节点2上报
   curl -X POST http://localhost:3000/api/tasks/set_processed_info \
     -H "Content-Type: application/json" \
     -d '{"node_id": "worker-002", "item_num": 200, "running_time": 60.2}'
   
   # 节点1再次上报
   curl -X POST http://localhost:3000/api/tasks/set_processed_info \
     -H "Content-Type: application/json" \
     -d '{"node_id": "worker-001", "item_num": 180, "running_time": 52.3}'
   ```

2. **查看统计**
   - 在"节点统计"板块点击"显示"
   - ✅ 看到两个节点的统计数据
   - ✅ worker-001 显示累计数据：330 项，97.8 秒，2 次上报
   - ✅ 自动计算平均速度（项/秒）

---

## 5. 完整工作流演示 🔄

### 模拟真实场景

```bash
# 步骤1: 批量导入1000个任务
for i in {1..1000}; do
  echo "/batch/file-$i.pdf"
done > tasks.txt

curl -X POST http://localhost:3000/api/tasks/import \
  -F "file=@tasks.txt"

# 步骤2: 模拟3个工作节点
for node in {1..3}; do
  (
    while true; do
      # 获取任务
      tasks=$(curl -s -X POST http://localhost:3000/api/tasks/get_task \
        -H "Content-Type: application/json" \
        -d '{"batchSize": 10}')
      
      # 解析任务ID并处理
      echo "$tasks" | jq -r '.[].task_id' | while read task_id; do
        # 模拟处理（随机延迟）
        sleep $((RANDOM % 3))
        
        # 上报完成
        curl -s -X POST http://localhost:3000/api/tasks/set_task_status \
          -H "Content-Type: application/json" \
          -d "{\"task_id\": \"$task_id\", \"status\": true, \"message\": \"\"}" > /dev/null
        
        # 上报节点统计
        curl -s -X POST http://localhost:3000/api/tasks/set_processed_info \
          -H "Content-Type: application/json" \
          -d "{\"node_id\": \"node-$node\", \"item_num\": 1, \"running_time\": 0.5}" > /dev/null
      done
      
      # 如果没有任务了就退出
      if [ $(echo "$tasks" | jq '. | length') -eq 0 ]; then
        break
      fi
    done
  ) &
done

# 在页面上观察：
# ✅ 任务数量实时变化
# ✅ 未处理 -> 处理中 -> 已完成
# ✅ 节点统计持续更新
# ✅ 如果某个节点卡住，超时任务会自动重新分配
```

---

## 常见问题

### Q: 复制提示为什么消失太快/太慢？
A: 提示框显示 2 秒。如需调整，修改代码：
```typescript
setTimeout(() => setCopiedText(null), 2000); // 改为你想要的毫秒数
```

### Q: 自动检查会影响性能吗？
A: 不会。检查是异步的，仅在检测到超时任务时才刷新列表。默认间隔 1 分钟对性能影响可忽略。

### Q: 可以禁用自动检查吗？
A: 可以。将"检查间隔"设为 `0` 即可禁用（但不推荐）。

### Q: 为什么超时任务还能被设置为完成？
A: 这是设计特性。允许延迟回传的任务仍能正确标记状态，避免节点超时但实际已完成的情况。

---

## 快捷键

- **Ctrl+V**：粘贴复制的内容
- **F12**：打开浏览器控制台查看日志
- **F5**：刷新页面

---

## 技术亮点

1. **复制反馈**：使用 `navigator.clipboard` API + React state 管理
2. **自动检查**：使用 `useEffect` + `setInterval` 实现定时任务
3. **交互优化**：CSS `transition` + `hover`/`active` 状态
4. **错误处理**：完善的 try-catch 和错误提示
5. **响应式设计**：移动端友好的 Tailwind CSS 布局

