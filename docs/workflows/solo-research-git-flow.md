# ScholarOS Solo Research Git Flow

## 一句话定位

ScholarOS 把 solo Git workflow 转译为 AI 时代社会科学研究的过程治理结构：一个人做研究，也需要区分稳定公开层、日常工作层、局部实验层和远端保存层。

## 面向谁

这份说明面向已经理解 ScholarOS 问题意识、但想知道“具体怎样组织研究过程”的读者。它不是 Git 教程，也不是命令手册，而是 ScholarOS 的工作流原则。

## 它回答什么问题

很多 solo project 的失败，不是因为没有协作者，而是因为没有结构。研究者一个人推进时，更容易把探索、修正、临时脚本、AI 对话和最终产物压缩成一团。ScholarOS 要解决的是：个人研究如何既允许探索，又不让过程消失。

## 它在 ScholarOS 叙事中的位置

这份 flow 是 ScholarOS 的操作层。公共入口说明为什么研究过程会失踪；endorsement packet 说明为什么这件事有学术价值；这份文档说明 ScholarOS 如何把个人研究组织成可回看、可分段、可复核的历史。

## 四层结构

### 1. Public stable layer

公开稳定层只放已经能解释清楚的材料。它对应 repo 里的 README、docs、diagram、case note 和 endorsement packet。

这层的要求是：

- 读者能理解项目解决什么问题
- 每个公开 artifact 都能说清自己的位置
- 不把临时探索直接伪装成成熟结论

### 2. Working layer

日常工作层承载真实研究推进。它允许探索、试错和修正，但每一段工作都要保留任务边界。

这层的要求是：

- 工作从明确研究问题开始
- 会话和修改服务同一个任务边界
- 产物能说明来源、修改理由和后续去向

### 3. Isolated research unit

局部研究单元对应一个可独立说明的问题、case、修正或 artifact。它可以是一次失败分析、一个 transition case、一张图、一段 README 重写，也可以是一个具体研究问题的实现过程。

这层的要求是：

- 一个单元只处理一个主要问题
- 单元之间不要互相吞并
- 失败、过渡和成功要分开写，不把真实过程抹平成完美流程

### 4. Remote preservation layer

远端保存层不是只为了发布最终结果，而是为了让研究过程能够恢复、复核和继续推进。

这层的要求是：

- 保存的不只是代码，还有任务边界和 artifact 链条
- 能从公开材料回到生成过程
- 中断之后能恢复上下文，而不是重新猜测当时为什么这样做

## ScholarOS 与普通 solo Git flow 的区别

普通 solo Git flow 主要关心一个人如何安全开发软件。ScholarOS 关心的是一个研究者如何在 AI 深度介入之后，仍然保留可解释的研究过程。

因此，ScholarOS 不把 Git 当作单纯版本控制工具，而把它放进更宽的过程治理结构中：

```text
研究问题
   |
   v
日常工作层
   |
   v
局部研究单元
   |
   v
公开 artifact
   |
   v
可复核的论文、报告、讲稿或图表
```

## 下一步该读什么

- [core diagram](../diagrams/question-session-artifact-paper.md)
- [case archive](../cases/README.md)
- [endorsement packet](../endorsement/endorsement-packet-zh.md)
