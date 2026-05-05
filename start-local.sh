#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$ROOT_DIR/api"
UI_DIR="$ROOT_DIR/ui"

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then
    kill "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [[ ! -f "$API_DIR/.env" ]]; then
  cp "$API_DIR/.env.example" "$API_DIR/.env"
  echo "Created api/.env from api/.env.example."
fi

mkdir -p "$API_DIR/local_data/temp"

cd "$API_DIR"
if [[ -x ".venv/bin/python" ]] && .venv/bin/python -m pip --version >/dev/null 2>&1; then
  source .venv/bin/activate
else
  if [[ -z "${PYTHON_BIN:-}" ]]; then
    PYTHON_BIN="python3"
    if command -v python3.12 >/dev/null 2>&1; then
      PYTHON_BIN="python3.12"
    fi
  fi

  if [[ ! -d ".venv" ]] && "$PYTHON_BIN" -m venv .venv >/dev/null 2>&1; then
    source .venv/bin/activate
  elif command -v conda >/dev/null 2>&1; then
    CONDA_BASE="$(conda info --base)"
    source "$CONDA_BASE/etc/profile.d/conda.sh"
    if [[ ! -d ".conda" ]]; then
      conda create -y -p "$API_DIR/.conda" python=3.10 pip
    fi
    conda activate "$API_DIR/.conda"
  else
    echo "Could not create a Python environment. Install python3-venv or Conda, then rerun ./start-local.sh."
    exit 1
  fi
fi

python -m pip install -r requirements.txt

if command -v curl >/dev/null 2>&1 && curl -fsS http://127.0.0.1:8000 >/dev/null 2>&1; then
  echo "WhoDis API already appears to be running on http://localhost:8000. Reusing it."
else
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
  API_PID=$!
fi

cd "$UI_DIR"
if [[ ! -d "node_modules" ]]; then
  npm install
fi

NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
