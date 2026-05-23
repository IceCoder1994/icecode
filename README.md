# Icecode

Icecode 基于 [Codebuff](https://github.com/CodebuffAI/codebuff) / Freebuff CLI 改造而来。

由于 Codebuff/Freebuff CLI 无法接入自定义模型，Icecode 在保留原版完整 Agent 特性的基础上，移除了对后端 API 的依赖，可直接通过本地环境变量配置使用。

## 特性

- 完整保留 Codebuff/Freebuff CLI 的 Agent 能力：code review、suggested followups、多文件编辑等
- 支持自定义 LLM 模型
- 纯本地 CLI 运行，不依赖远程服务

## 安装

```bash
npm i -g icecode
```

## 配置

全局配置文件位于 `~/.config/icecode/` 目录下

## 运行

```bash
icecode
```

## 知识库与初始化

### 1. 本地 Agent 知识库支持 (`AGENTS.md`)

Icecode 全面支持本地知识库引导。AI 在启动和交互时，会自动且优先读取项目根目录下的 **`AGENTS.md`** 作为最核心的系统 Prompt 引导上下文（若 `AGENTS.md` 不存在，则会退而次选根目录的 `CLAUDE.md`）。

> 💡 原版的 `knowledge.md` 已被弃用并完全替换为 `AGENTS.md`，帮助你实现更加符合 Agent 协作机制的本地规则定制。

### 2. 初始化命令 (`/init`)

在 CLI 终端中，我们提供了专有的初始化命令 `/init`：

- **作用**：一键在当前项目根目录下自动创建最适合本地 Agent 的 `AGENTS.md` 知识库模板，并生成定义本地 Agent 规则所需的 `.agents/types/` 类型声明文件。
- **使用方法**：在 CLI 输入栏中输入 `/init` 并回车执行。
