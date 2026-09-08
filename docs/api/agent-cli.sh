#!/usr/bin/env bash
# BitSoul AI Manager 终端 Agent 命令行封装（TECH_DESIGN §4.1）
# 依赖：curl、jq。用法见 docs/api/AGENT_GUIDE.md。
#
#   export BSAM_BASE=https://pm.bitsouls.cn
#   ./agent-cli.sh login <username> <password>      # 保存 token 到 ~/.bsam-token
#   ./agent-cli.sh tasks [dev|test]                  # 可认领任务
#   ./agent-cli.sh claim <taskId>                    # 认领（返回分支与凭据）
#   ./agent-cli.sh context <taskId>                  # 上下文包
#   ./agent-cli.sh heartbeat <taskId>
#   ./agent-cli.sh submit <taskId> "<note>" "<selfTest>" <sha1>[,<sha2>...]
#   ./agent-cli.sh release <taskId>
#   ./agent-cli.sh report <testTaskId> <results.json> [PASS|FAIL|BLOCKED]
#     results.json: {"results":[{"caseIdx":0,"pass":true,"note":"..."}],"conclusion":"PASS","defects":[]}

set -euo pipefail
BASE="${BSAM_BASE:-http://localhost:3100}"
TOKEN_FILE="${BSAM_TOKEN_FILE:-$HOME/.bsam-token}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing dependency: $1" >&2; exit 1; }; }
need curl; need jq

auth() { [ -f "$TOKEN_FILE" ] || { echo "not logged in: run '$0 login <user> <pass>'" >&2; exit 1; }; echo "Authorization: Bearer $(cat "$TOKEN_FILE")"; }
api() { # method path [json]
  local m="$1" p="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$m" "$BASE$p" -H "$(auth)" -H 'content-type: application/json' -d "$body"
  else
    curl -sS -X "$m" "$BASE$p" -H "$(auth)"
  fi
}

cmd="${1:-}"; shift || true
case "$cmd" in
  login)
    [ $# -ge 2 ] || { echo "usage: login <username> <password>" >&2; exit 1; }
    tok=$(curl -sS "$BASE/api/agent/login" -H 'content-type: application/json' -d "$(jq -cn --arg u "$1" --arg p "$2" '{username:$u,password:$p}')" | jq -r '.token // empty')
    [ -n "$tok" ] || { echo "login failed" >&2; exit 1; }
    umask 077; printf '%s' "$tok" > "$TOKEN_FILE"; echo "token saved to $TOKEN_FILE"
    ;;
  tasks)
    q=""; [ -n "${1:-}" ] && q="?type=$1"
    api GET "/api/agent/tasks$q" | jq .
    ;;
  claim)     api POST "/api/agent/tasks/$1/claim" | jq . ;;
  context)   api GET  "/api/agent/tasks/$1/context" | jq . ;;
  heartbeat) api POST "/api/agent/tasks/$1/heartbeat" | jq . ;;
  release)   api POST "/api/agent/tasks/$1/release" | jq . ;;
  submit)
    [ $# -ge 4 ] || { echo "usage: submit <taskId> <note> <selfTest> <sha,sha>" >&2; exit 1; }
    body=$(jq -cn --arg n "$2" --arg s "$3" --arg c "$4" '{note:$n,selfTest:$s,commits:($c|split(","))}')
    api POST "/api/agent/tasks/$1/submit" "$body" | jq .
    ;;
  report)
    [ $# -ge 2 ] || { echo "usage: report <testTaskId> <results.json> [conclusion]" >&2; exit 1; }
    body=$(jq -c --arg c "${3:-}" 'if $c != "" then .conclusion=$c else . end' "$2")
    api POST "/api/agent/test-tasks/$1/report" "$body" | jq .
    ;;
  *)
    sed -n '2,14p' "$0"; exit 1 ;;
esac
