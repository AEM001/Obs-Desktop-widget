# Obsidian每日计划桌面小组件完整指南：打造高效工作流

> 将Obsidian的每日计划无缝集成到macOS桌面，实现所见即所得的TODO管理

<img src="./Screenshot%202025-08-14%20at%2015.08.26.png" alt="Obsidian每日计划桌面小组件预览" width="350"/>

## 🎯 项目概述

这是一个优雅的全栈解决方案，通过 **Übersicht小组件** + **Python FastAPI后端**，将Obsidian的每日计划文件可视化到macOS桌面。告别频繁切换应用的繁琐，直接在桌面完成待办事项管理。

### 核心特性

- ✅ **实时同步**：桌面小组件与Obsidian文件实时同步
- 🎯 **Markdown支持**：原生支持 `- [ ]` 任务语法
- 🔒 **安全可靠**：本地运行，数据完全私有
- ⚡ **轻量级**：响应式界面，零性能负担
- 🎨 **美观设计**：深度集成macOS视觉风格

## 🏗️ 系统架构解析

```
┌─────────────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   Übersicht Widget      │◄──►│  Python FastAPI      │◄──►│  Obsidian       │
│  (React + JSX)          │    │  Server              │    │  Daily Notes    │
│                         │    │  Port: 8787          │    │                 │
└─────────────────────────┘    └──────────────────────┘    └─────────────────┘
```

### 技术栈详解

- **前端**：Übersicht Widget (React JSX)
- **后端**：FastAPI (uvicorn) + Python 3.x
- **存储**：Markdown文件 (Obsidian Daily Notes)
- **部署**：macOS LaunchAgent (自动启动)
- **协议**：HTTP REST API + X-Auth认证

## 🚀 快速上手

### 1. 环境准备

```bash
# 安装依赖
pip install fastapi uvicorn python-multipart

# 安装Übersicht (如未安装)
brew install --cask ubersicht
```

### 2. 文件部署

#### 后端服务部署

```bash
# 创建项目目录
mkdir -p ~/obsidian-plan-server
cd ~/obsidian-plan-server

# 复制服务端文件 (obs_plan_server.py)
cp /path/to/obs_plan_server.py ./
```

#### LaunchAgent配置（自动启动）

```bash
# 复制plist文件
sudo cp local.obsidian.planserver.plist ~/Library/LaunchAgents/

# 加载服务
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.obsidian.planserver.plist
launchctl enable gui/$(id -u)/local.obsidian.planserver
launchctl kickstart gui/$(id -u)/local.obsidian.planserver
```

#### 前端小组件部署

```bash
# 创建小组件目录
mkdir -p ~/Library/Application\ Support/Übersicht/widgets/ObsidianPlan.widget

# 复制前端文件 (index.jsx)
cp index.jsx ~/Library/Application\ Support/Übersicht/widgets/ObsidianPlan.widget/
```

## ⚙️ 启动与停止指南

### 🔧 自启动配置

服务已配置为随系统启动，通过LaunchAgent管理：

```xml
<!-- ~/Library/LaunchAgents/local.obsidian.planserver.plist -->
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
```

### 🎛️ 手动控制命令

```bash
# 查看服务状态
launchctl list | grep local.obsidian.planserver

# 停止服务
launchctl bootout gui/$(id -u)/local.obsidian.planserver

# 启动服务
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.obsidian.planserver.plist
launchctl kickstart gui/$(id -u)/local.obsidian.planserver

# 重启服务
launchctl kickstart -k gui/$(id -u)/local.obsidian.planserver
```

### 🔍 故障排查

#### 查看日志

```bash
# 实时查看服务日志
tail -f /tmp/planserver.out.log
tail -f /tmp/planserver.err.log

# 测试API连接
curl -H "X-Auth: your-secret-token" http://127.0.0.1:8787/planning?date=2025-08-08
```

#### 常见问题

- **端口冲突**：检查是否已有服务运行 `lsof -i :8787`
- **权限问题**：确保plist文件权限正确 `chmod 644`
- **Python路径**：更新plist中的conda路径为你的实际路径

## 📚 使用技巧

### Obsidian集成最佳实践

#### 每日计划模板

在Obsidian中创建每日计划模板：

```markdown
# 2025-08-08 计划

## 🌅 今日聚焦
- [ ] 重点任务1
- [ ] 重点任务2

## 📋 任务清单
### 上午
- [ ] 邮件处理
- [ ] 项目讨论

### 下午
- [ ] 代码开发
- [ ] 文档更新

## 🎯 长期目标
- [ ] 学习Flutter
- [ ] 健康打卡
```

#### 快捷键增强

为Obsidian添加快捷键生成每日计划：

```json
{
  "一键创建今日计划": {
    "modal": "core:insert-template",
    "args": {"template": "Daily Plan"}
  }
}
```

### 桌面小组件使用

#### 交互特性

1. **实时编辑**：点击任意任务直接编辑内容
2. **任务状态**：支持 `- [x]` 标记完成，`- [ ]` 标记待办
3. **快速添加**：底部输入框快速添加新任务
4. **格式化按钮**：一键将文本转换为标准任务格式
5. **自动保存**：失去焦点时自动保存到Obsidian

#### 可视化特性

- ✅ 已完成任务：绿色勾选标识
- ⚪ 待办任务：空心圆圈
- 📅 日期显示：顶部显示当前日期
- 📏 进度条：显示当日任务完成百分比

## 🔧 高级配置

### 自定义样式

在你的 `index.jsx` 文件中自定义外观：

```javascript
// 自定义主题颜色
const styles = {
  container: {
    width: '320px',
    fontFamily: 'SF Pro Display, sans-serif',
    backgroundColor: 'rgba(30, 30, 30, 0.9)',
    backdropFilter: 'blur(10px)',
    border: '1px solid #333',
    borderRadius: '8px',
    overflow: 'hidden'
  },
  
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#fff'
  },
  
  task: {
    completed: {
      textDecoration: 'line-through',
      opacity: 0.6
    }
  }
};
```

### API端点扩展

#### 添加任务搜索功能

```python
@app.get("/search")
async def search_tasks(query: str, x_auth: str = Header(...)):
    if x_auth != AUTH_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid token")
  
    results = []
    for filename in glob.glob(os.path.join(DAILY_NOTES_DIR, "*.md")):
        with open(filename, 'r', encoding='utf-8') as f:
            content = f.read()
            if query.lower() in content.lower():
                results.append({
                    "file": os.path.basename(filename),
                    "matches": [line for line in content.split('\n') 
                               if query.lower() in line.lower()]
                })
  
    return {"results": results}
```

## 🛠️ 开发调试

### 本地开发环境

#### 手动启动服务端

```bash
# 进入项目目录
cd ~/obsidian-plan-server

# 启动开发服务器
uvicorn obs_plan_server:app --host 127.0.0.1 --port 8787 --reload --log-level debug
```

#### 测试API

```bash
# 测试获取计划
curl -H "X-Auth: your-secret-token" "http://127.0.0.1:8787/planning?date=2025-08-08"

# 测试保存计划
curl -X POST -H "X-Auth: your-secret-token" -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "date=2025-08-08&content=- [ ] 新任务测试" \\
  http://127.0.0.1:8787/planning
```

## 📊 性能优化

### 启动优化

- **预热加载**：设置LaunchAgent为KeepAlive，减少冷启动时间
- **日志精简**：生产环境使用 `log-level warning`
- **缓存策略**：前端组件每30秒自动刷新

### 存储优化

- **文件监控**：使用macOS的FSEvents监控文件变化
- **增量更新**：仅同步变化的部分，减少IO操作
- **备份机制**：每日自动备份历史文件

## 🎯 扩展规划

### 下一步功能

- [ ] 周视图/月视图切换
- [ ] 任务优先级（高/中/低）支持
- [ ] 番茄钟集成
- [ ] 统计图表（任务完成率趋势）
- [ ] 多设备同步方案
- [ ] 语音输入支持

### 移动端考虑

- 通过**快捷指令**实现iOS快捷输入
- **快捷指令模板**：接收输入→调用API→保存到Obsidian

## 📚 相关资源

- **Obsidian官方文档**：https://help.obsidian.md
- **Übersicht文档**：https://docs.uebersicht.oscardelben.com
- **FastAPI文档**：https://fastapi.tiangolo.com
- **项目源码**：请根据实际路径更新

---

> 💡 **小贴士**：保持简洁，专注当下。每天只列出3-5个最重要的任务，避免计划过载。

**Last Updated**: 2025-08-08
**版本**: v1.0.0-beta
