#!/usr/bin/env bash
# ==============================================================================
# Enterprise Contract & Policy Copilot — Autonomous Harness Verification Referee
# ==============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

FAILED_GATES=0

# Detect and activate virtual environment
VENV_BIN=""
if [ -d ".venv/bin" ]; then
    VENV_BIN=".venv/bin"
elif [ -d ".venv/Scripts" ]; then
    VENV_BIN=".venv/Scripts"
elif [ -d "backend/.venv/bin" ]; then
    VENV_BIN="backend/.venv/bin"
elif [ -d "backend/.venv/Scripts" ]; then
    VENV_BIN="backend/.venv/Scripts"
fi

if [ -n "$VENV_BIN" ]; then
    echo -e "${BLUE}>> Activating virtual environment from: $VENV_BIN${NC}"
    export PATH="$(pwd)/$VENV_BIN:$PATH"
    export VIRTUAL_ENV="$(cd "$VENV_BIN/.." && pwd)"
fi

log_gate() {
    echo -e "\n${BLUE}======================================================================${NC}"
    echo -e "${YELLOW}>> [HARNESS GATE] $1${NC}"
    echo -e "${BLUE}======================================================================${NC}"
}

run_check() {
    local gate_name="$1"
    local command="$2"
    log_gate "$gate_name"
    if eval "$command"; then
        echo -e "${GREEN}✓ [PASS] $gate_name${NC}"
    else
        echo -e "${RED}✗ [FAIL] $gate_name${NC}"
        FAILED_GATES=$((FAILED_GATES + 1))
    fi
}

echo -e "${YELLOW}Starting Autonomous Harness Referee Verification Gate Checks...${NC}"

# Gate 1: Backend Static Typecheck
if command -v mypy &> /dev/null; then
    run_check "Backend Typecheck (mypy)" "mypy backend"
else
    echo -e "${YELLOW}Skipping mypy (not installed in active virtualenv)${NC}"
fi

# Gate 2: Backend Flake8 Linter
if command -v flake8 &> /dev/null; then
    run_check "Backend Lint (flake8)" "flake8 backend"
else
    echo -e "${YELLOW}Skipping flake8 (not installed in active virtualenv)${NC}"
fi

# Gate 3: Backend Pytest Test Suite
if command -v pytest &> /dev/null; then
    run_check "Backend Test Suite (pytest)" "pytest tests/backend -q --tb=short"
else
    echo -e "${YELLOW}Skipping pytest (not installed in active virtualenv)${NC}"
fi

# Gate 4: Frontend Typecheck and Lint
if [ -d "frontend" ] && [ -f "frontend/package.json" ] && [ -d "frontend/node_modules" ]; then
    run_check "Frontend Typecheck" "npm --prefix frontend run typecheck"
    run_check "Frontend Lint" "npm --prefix frontend run lint"
    run_check "Frontend Unit Suite" "npm --prefix frontend test -- --run"
else
    echo -e "${YELLOW}Skipping frontend checks (dependencies not yet installed)${NC}"
fi

echo -e "\n${BLUE}======================================================================${NC}"
if [ "$FAILED_GATES" -eq 0 ]; then
    echo -e "${GREEN}★ ALL HARNESS GATES PASSED CLEANLY. TICKET READY FOR SIGN-OFF.${NC}"
    echo -e "${BLUE}======================================================================${NC}"
    exit 0
else
    echo -e "${RED}✘ $FAILED_GATES HARNESS GATE(S) FAILED. Log failures in .agent/ERRORS.md before completing.${NC}"
    echo -e "${BLUE}======================================================================${NC}"
    exit 1
fi
