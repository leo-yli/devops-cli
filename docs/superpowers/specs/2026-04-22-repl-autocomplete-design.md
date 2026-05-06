# REPL 命令自动补全设计

## 概述

为 devops-cli 的交互式 REPL 模式添加命令自动补全功能。用户输入 `/` 时弹出浮动候选菜单，支持 Tab/箭头键选择、输入过滤、两级补全（命令 + 子命令）。

## 补全数据源

### 一级命令

从 `commandHandlers` 对象的 key 提取，包含：login, logout, pipeline, project, demand, repo, skill, bash, cat, ls, grep, help, clear, exit, quit。

### 二级子命令映射

```typescript
const SUBCOMMANDS: Record<string, string[]> = {
  pipeline: ['list', 'show', 'trigger'],
  project:  ['list', 'show'],
  demand:   ['list', 'show'],
  repo:     ['list', 'branches', 'mrs'],
  skill:    ['list', 'show'],
};
```

不在此映射中的命令（login, logout, bash, cat, ls, grep, help, clear, exit, quit）选中后直接关闭菜单。

## 交互流程

### 一级补全

1. 用户输入 `/` → 弹出全部命令候选列表
2. 继续输入字符 → 按前缀过滤列表
3. 过滤结果为空 → 自动关闭菜单

### 二级补全

4. 用户选中有子命令的命令后，输入空格 → 弹出子命令列表
5. 继续输入过滤子命令，Tab/Enter 选中
6. 选中后关闭菜单

### 键盘映射（菜单打开时）

| 按键 | 行为 |
|------|------|
| Tab / 下箭头 | 高亮下移 |
| Shift+Tab / 上箭头 | 高亮上移 |
| Enter | 选中高亮项，填入输入框 |
| Escape | 关闭菜单 |
| 其他字符 | 传递给 TextInput，触发过滤 |

### 键盘映射（菜单关闭时）

所有按键恢复原有行为（TextInput 处理输入，Enter 执行命令，上下箭头浏览历史）。

## 组件结构

```
ReplApp
├── 历史输出
├── loading spinner
├── CommandSuggestions  ← 新组件，条件渲染在输入行上方
│   └── 候选项列表 (Box + Text，高亮项用反色/颜色区分)
└── 输入行 (dops> + TextInput)
```

### CommandSuggestions 组件

纯展示组件，不持有状态。Props：

```typescript
interface CommandSuggestionsProps {
  suggestions: string[];
  selectedIndex: number;
}
```

渲染为垂直列表，每项一行。高亮项使用 `inverse` 或 `bgCyan` 样式。列表最多显示 8 项，超出时跟随选中项滚动。

### ReplApp 状态扩展

新增状态：

```typescript
const [suggestions, setSuggestions] = useState<string[]>([]);
const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
const [suggestionsOpen, setSuggestionsOpen] = useState(false);
```

### 补全逻辑（在 onChange 中触发）

```
输入变化时:
  if 输入匹配 /^\/(\w*)$/:
    提取 prefix = $1
    candidates = 所有命令名.filter(startsWith prefix)
    if candidates.length > 0: 打开菜单, 设置 suggestions
    else: 关闭菜单
  else if 输入匹配 /^\/(\w+)\s+(\w*)$/ 且 $1 在 SUBCOMMANDS 中:
    提取 subcmdPrefix = $2
    candidates = SUBCOMMANDS[$1].filter(startsWith subcmdPrefix)
    if candidates.length > 0: 打开菜单, 设置 suggestions
    else: 关闭菜单
  else:
    关闭菜单
```

### useInput 键盘拦截

菜单打开时，`useInput` 拦截 Tab / 上 / 下 / Enter / Escape。拦截方式：在 handler 中根据 `suggestionsOpen` 状态决定是否消费事件。

Enter 选中后的填充逻辑：
- 一级命令：`setInput('/selectedCmd')`
- 二级子命令：`setInput('/cmd selectedSubcmd')`

## 文件变更

| 文件 | 变更 |
|------|------|
| `src/repl/suggestions.tsx` | 新建。`CommandSuggestions` 展示组件 + `SUBCOMMANDS` 映射 + `getCommandNames()` 工具函数 |
| `src/repl/app.tsx` | 集成补全状态、onChange 补全逻辑、useInput 键盘拦截、渲染 CommandSuggestions |

## 边界情况

- 输入 `/` 后立即删除 → 关闭菜单
- 快速连续输入 → 每次 onChange 重新计算，无防抖（候选列表小，计算量可忽略）
- 菜单打开时按 Enter 但无候选项 → 不应发生（无候选项时菜单已自动关闭）
- 命令历史上下浏览时 → 菜单关闭状态，不干扰
