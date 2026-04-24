# ScholarOS

> AI as Infrastructure in Social Science
>
> We do not need more agents. We need better harnesses for agents.

> “学术则黜伪而崇真，于刑政则屈私以为公。”
>
> 严复，《论世变之亟》

ScholarOS 是 Adrian 正在建设的一套开源研究过程操作系统。它首先关心的，不是再做一个“更聪明的 AI 工具”，而是一个更熟悉、也更迫切的问题：在 AI 深度介入研究之后，研究过程怎样才不会失踪。

今天的人文社会科学研究者已经可以更快地写脚本、改回归、重跑图表、整理文本和调用模型。速度上去了，风险也上去了。问题、代码、数据、图表、写作和最后结论之间的对应关系，反而更容易断开。等论文成稿之后，研究者自己也未必还能清楚说明，一张图、一段判断、一次修正，究竟是怎样长出来的。

ScholarOS 对这个问题的回答，不是把研究者绑定到另一个“学术智能体”里，也不是给出一张替人思考的路线图。ScholarOS 更接近一种**面向 AI 时代社会科学研究的过程治理与训练基础设施**。它试图让研究者在使用 AI 时，仍然看得见来时的路，分得清哪些判断属于事前设定，哪些调整属于事后修正，也让合作者、学生、审稿人和未来的自己有机会回到生成过程。

换句话说，ScholarOS 不是先从“如何把 AI 用得更炫”出发，而是先从“如何把研究做得更真”出发。这也是为什么它首先服务于研究规范、研究训练、方法自觉和过程复核，而不只是技术效率。

## 这个项目在解决什么问题

ScholarOS 处理的是一个 pre-pipeline 问题。很多研究并不是先有稳定流程，再谈可复现。真实情况往往相反。研究先以零散探索、临时脚本、对话式试验、写作插入和反复修正的方式发生，随后才可能逐步沉淀出较稳定的 pipeline（分析管线）。

因此，ScholarOS 首先面对的不是“一个既有 pipeline 如何更易复现”，而是“在 pipeline 尚未成型时，研究过程如何保持可见”。这也是 ScholarOS 的核心判断：

`process legibility before reproducibility`

如果连研究过程本身都已经失踪，那么后续关于 reproducibility（可复现性）、复核、解释和方法规范的要求，就没有了可以附着的对象。

## 为什么这件事现在更紧迫

AI 正在成为社会科学研究的新基础设施条件。它带来前所未有的便利，也把新的责任压回到研究过程本身。

- 代码可以更快生成，但来源更容易混乱。
- 图表可以更快改写，但生成路径更难说明。
- 文字可以更快重组，但分析前设想与分析后修正也更容易被抹平。
- 合作者可以更快看到结果，但未必能看见中间的判断、删改与取舍。

这些问题不是技术圈内部的小毛病。它们直接关系到社会科学研究如何处理证据、如何约束解释、如何区分事前设定与事后修正，也关系到研究训练如何在 AI 环境下继续成立。

## 为什么这不是一个炫技工具

ScholarOS 的重点不是展示更多 agent，也不是把技术词堆得更满。它最重要的对象不是模型，而是研究任务、研究过程和研究产物之间的对应关系。

这意味着 ScholarOS 关心的是：

- 研究问题有没有清楚的任务边界
- 代码、数据、图表和文本是否能回到来源
- 修改和判断有没有留下追加记录
- 研究过程能否被复核、教学和传承

只有到了第二层，ScholarOS 才会谈到它如何通过 GitHub-native 的组织方式、确定性的 workflow guard，以及面向 artifact 的记录链来承接这些要求。技术机制是后面的事，前面要先把学术问题说明白。

## 什么是 ScholarOS

ScholarOS 是 `Scholar Operating System` 的缩写。它不是一套普通的 productivity system，而是一个研究者在 AI 时代组织问题、会话、产物和论文之间关系的过程操作系统。

因此，ScholarOS 的第一层公共表述是：

**面向 AI 时代社会科学研究的过程治理与训练基础设施探索**

`ScholarOS` 这个名字说明的是：这套基础设施不是凭空设计出来的，而是 Adrian 先在自己的真实研究工作中把它用起来，再逐步把它做成可公开讨论的 scholarly object（学术对象）。

## ScholarOS 的 solo research Git flow

ScholarOS 吸收了 solo Git workflow 的一个关键判断：即使只有一个人开发，也需要把稳定公开线、日常工作线、局部实验线和远端留存线分开。对研究者来说，这不是软件工程洁癖，而是过程治理。

在 ScholarOS 里，这个 flow 被转译为四层：

1. **Public stable layer**
   `master` 或公开发布入口只承载已经能被解释的公共材料，例如 README、docs、case note、diagram 和 endorsement packet。

2. **Working layer**
   日常研究推进发生在明确任务边界内。每一段工作都应能回答：它服务哪个研究问题，产生了什么 artifact，哪些判断是事前设定，哪些是事后修正。

3. **Isolated research unit**
   每个相对独立的问题、修正、case 或 artifact 都应有自己的 issue / branch / worktree 边界。这样探索可以发生，但不会把整个研究历史揉成一个事后扫尾的大提交。

4. **Remote preservation layer**
   远端不是最终炫耀结果的地方，而是研究过程能够被恢复、复核和继续推进的保存层。备份的是工作边界和过程链，不只是最后的代码。

这也是 ScholarOS 和普通 solo Git flow 的差别：普通 Git flow 关心一个人如何安全开发软件；ScholarOS 关心一个研究者如何在 AI 深度介入之后，仍然保留可解释、可教学、可复核的研究过程。

## 适用对象

ScholarOS 的第一受众不是已经熟悉 AI for Social Science 的少数方法共同体，而是更广泛的人文社会科学同行，尤其是政治学、社会学及相邻领域中熟悉常规研究方法、但未必熟悉计算社会科学或 AI-native workflow 的研究者。

在此基础上，ScholarOS 才进一步面向：

1. 希望理解 AI 时代研究过程规范问题的广义社会科学同行
2. 可能提供认可、评价或 endorsement 的前辈学者与学科建设者
3. AI for Social Science / computational social science 方法共同体
4. 关心 harness、workflow 和 local governance 的技术读者

## 仓库入口

这个仓库现在有两条主要入口：

- **Public entry**：从本 README 进入，先理解问题、意义和公共定位
- **Endorsement packet**：从 [docs/endorsement/endorsement-packet-zh.md](docs/endorsement/endorsement-packet-zh.md) 进入，面向前辈学者、学科建设者与潜在支持者

配套 artifact 位于：

- [docs/README.md](docs/README.md)：文档总览
- [docs/workflows/solo-research-git-flow.md](docs/workflows/solo-research-git-flow.md)：ScholarOS 版 solo research Git flow
- [docs/diagrams/question-session-artifact-paper.md](docs/diagrams/question-session-artifact-paper.md)：核心结构图
- [docs/cases/README.md](docs/cases/README.md)：case archive 入口

## 设计线索

ScholarOS 继续保留两个最核心的判断：

- `AI as Infrastructure in Social Science`
- `We do not need more agents. We need better harnesses for agents.`

但这些句子不再被当作第一层解释本身，而是被放回一个更宽的框架里：AI 进入研究以后，真正稀缺的不是更多生成能力，而是能把研究过程接回任务边界、产物来源和方法训练的治理能力。

## 下一步公开 artifact

第三轮之后，ScholarOS 的首批公共 artifact 顺序固定为：

1. README / public entry
2. endorsement packet
3. solo research Git flow
4. `question -> session -> artifact -> paper` 结构图
5. case archive 结构与首个 case 对

methods note、evidence board 和 workshop packet 继续后置，不提前抢占第一层公共入口。
