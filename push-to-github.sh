#!/usr/bin/env bash
# ============================================================
# 把本地"声音设计学习站"推送到 GitHub 仓库
#   chen-house/timbre-explorer
# ============================================================
# 用法：
#   1. 在终端 cd 到本项目根目录
#   2. chmod +x push-to-github.sh
#   3. ./push-to-github.sh
#
# 前置条件：
#   - 已装 git
#   - 已在 GitHub 配置好 SSH key 或 Personal Access Token
#   - 或者会在弹出提示时输入 GitHub 用户名 + token
#
# 这个脚本会做什么：
#   1. 初始化 git 仓库（如尚未初始化）
#   2. 配置 remote 指向 chen-house/timbre-explorer
#   3. 把所有文件 add + commit
#   4. 用 force-push 推送到 main 分支
#      （会覆盖远程已有内容 — EQ.html / ambient.html 等会被本地新版本替代）
# ============================================================

set -e

REPO_URL="https://github.com/chen-house/timbre-explorer.git"
BRANCH="main"
COMMIT_MSG="整站重构：声音设计学习站（效果器+音色+氛围色 三大支柱整合）"

echo "──────────────────────────────────────────────"
echo "  推送到 $REPO_URL"
echo "──────────────────────────────────────────────"

# 1. 初始化 git
if [ ! -d .git ]; then
  echo "→ git init"
  git init
  git branch -M "$BRANCH"
fi

# 2. 检查/配置 user.name & user.email（如未配置）
if ! git config user.name > /dev/null; then
  echo
  echo "请输入 git 用户名（用于提交记录）："
  read -r GIT_NAME
  git config user.name "$GIT_NAME"
fi
if ! git config user.email > /dev/null; then
  echo
  echo "请输入 git 邮箱："
  read -r GIT_EMAIL
  git config user.email "$GIT_EMAIL"
fi

# 3. 配置 remote
if git remote get-url origin > /dev/null 2>&1; then
  echo "→ 更新现有 origin 指向 $REPO_URL"
  git remote set-url origin "$REPO_URL"
else
  echo "→ 添加 origin → $REPO_URL"
  git remote add origin "$REPO_URL"
fi

# 4. 把所有文件 add + commit
echo "→ git add ."
git add .

if git diff --cached --quiet; then
  echo "→ 暂存区为空，没有新改动需要 commit"
else
  echo "→ git commit"
  git commit -m "$COMMIT_MSG"
fi

# 5. 推送 — 用 -f 因为我们要覆盖远程已有的旧文件
echo
echo "──────────────────────────────────────────────"
echo "  即将 force-push 到 $REPO_URL ($BRANCH)"
echo "  注意：远程现有的 EQ.html / ambient.html /"
echo "        timbre_explorer.html 等文件会被覆盖。"
echo "──────────────────────────────────────────────"
echo
read -r -p "确认推送？输入 yes 继续，其他取消：" CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "已取消。"
  exit 0
fi

git push -f -u origin "$BRANCH"

echo
echo "✓ 推送完成。访问 https://github.com/chen-house/timbre-explorer 查看。"
echo
echo "下一步：启用 GitHub Pages"
echo "  1. 浏览器打开 https://github.com/chen-house/timbre-explorer/settings/pages"
echo "  2. Source: Deploy from a branch"
echo "  3. Branch: main / (root) → Save"
echo "  4. 等 1-3 分钟后访问 https://chen-house.github.io/timbre-explorer/"
