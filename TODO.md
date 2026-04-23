# Academic Git — TODO

## PR Pipeline (未完成的链条)

参考 CI/CD 最佳实践，PR 阶段需要补全：

### 1. PR 创建时自动生成 diff 摘要
- 从 `git diff <default-branch>...HEAD` 提取变更
- 按 Issue checklist 对照，标注每个 item 对应的变更
- 自动填充 PR body template

### 2. 自动检查 gate（PR 创建后触发）
- **规约一致性**: 代码做的事是否和 Issue 声明的一致（不多不少）
- **可复现性**: 是否有未固定的随机种子、未记录的依赖
- **Silent failure 检测**: 是否有 tryCatch/try-except 吞掉错误
- **Art. II 校验**: 是否超出声明的 specification space
- **Art. III 校验**: 是否有未标记的 ex post 决策

### 3. Codex/AI Review
- 每个 PR 创建后自动触发
- 检查清单:
  1. 代码是否做了 Issue 声明的事（不多不少）
  2. 是否有 silent error swallowing
  3. 是否有 hardcoded values
  4. 是否破坏可复现性
  5. 是否有 scope creep（做了 Issue 之外的事）
- 返回 PASS / BLOCK + 理由

### 4. 合并后流程
- **Tag 判断**: 是否是 milestone delivery（email/meeting/conference trigger）
- **下一个 Issue 路由**: 检查是否有 open Issues，提示 Adrian
- **分支清理**: 确认 issue-linked `codex/issue-*` 分支和 worktree 已清理
- **Linear 同步**: 如果接了 Linear，触发状态更新

## 其他待做

### MCP Server 增强
- [ ] `push_files` 风格的服务端 commit（可选，当本地 git 不可用时）
- [ ] Rate limiting / retry for gh API calls
- [ ] Better error messages (parse gh stderr)

### Plugin 发布
- [ ] README.md with installation instructions
- [ ] Test with `cc --plugin-dir`
- [ ] index.html 更新（反映 MCP 架构）

### Linear 集成 (Option C)
- [ ] 设置 Linear workspace
- [ ] 开启 Linear GitHub Integration（只读镜像）
- [ ] 验证 Issue 同步

### Research Constitution 编码
- [ ] Art. II — specification space boundary 检查工具
- [ ] Art. III — ex ante/ex post 标记强制
- [ ] Art. VII — rejected path 自动归档（作为 Issue comment）
