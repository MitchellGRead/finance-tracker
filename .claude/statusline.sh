#!/bin/bash
# Read JSON input from stdin
input=$(cat)

# Helper functions for common extractions
get_model_name() { echo "$input" | jq -r '.model.display_name'; }
get_current_dir() { echo "$input" | jq -r '.workspace.current_dir'; }
get_project_dir() { echo "$input" | jq -r '.workspace.project_dir'; }
get_version() { echo "$input" | jq -r '.version'; }
get_cost() { echo "$input" | jq -r '.cost.total_cost_usd'; }
get_duration() { echo "$input" | jq -r '.cost.total_duration_ms'; }
get_lines_added() { echo "$input" | jq -r '.cost.total_lines_added'; }
get_lines_removed() { echo "$input" | jq -r '.cost.total_lines_removed'; }
get_remaining_context() { echo "$input" | jq -r '.context_window.remaining_percentage'; }

# Token usage helpers
get_input_tokens() { echo "$input" | jq -r '.context_window.current_usage.input_tokens // 0'; }
get_output_tokens() { echo "$input" | jq -r '.context_window.current_usage.output_tokens // 0'; }
get_cache_creation_tokens() { echo "$input" | jq -r '.context_window.current_usage.cache_creation_input_tokens // 0'; }
get_cache_read_tokens() { echo "$input" | jq -r '.context_window.current_usage.cache_read_input_tokens // 0'; }
get_context_window_size() { echo "$input" | jq -r '.context_window.context_window_size'; }

# Show git branch if in a git repo
GIT_BRANCH=""
if git rev-parse --git-dir > /dev/null 2>&1; then
    BRANCH=$(git branch --show-current 2>/dev/null)
    if [ -n "$BRANCH" ]; then
        GIT_BRANCH=" | 🌿 $BRANCH"
    fi
fi

# Use the helpers
MODEL=$(get_model_name)
DIR=$(get_current_dir)
COST=$(get_cost)

REMAINING_CONTEXT=$(get_remaining_context)
if [ "$REMAINING_CONTEXT" = "null" ] || [ -z "$REMAINING_CONTEXT" ]; then
    REMAINING_CONTEXT="100"
fi

# Red text warning when context is low
RED='\033[0;31m'
NC='\033[0m' # No Color
COMPACT_WARNING=""
if [ "$REMAINING_CONTEXT" -le 35 ] 2>/dev/null; then
    COMPACT_WARNING=" ${RED}⚠ Consider compacting conversation${NC}"
fi

echo -e "[$MODEL] 💸 $(printf '%.4f' "${COST:-0}") | 📊 ${REMAINING_CONTEXT}% remaining${COMPACT_WARNING} \n 📁 ${DIR##*/}$GIT_BRANCH"
