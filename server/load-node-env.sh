#!/bin/bash

export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

load_nvm() {
  local nvm_script="$1"
  if [ ! -s "${nvm_script}" ]; then
    return 1
  fi

  export NVM_DIR
  NVM_DIR="$(dirname "${nvm_script}")"

  set +u
  # shellcheck disable=SC1091
  . "${nvm_script}"
  set -u 2>/dev/null || true
}

if [ -n "${NVM_DIR:-}" ] && [ -s "${NVM_DIR}/nvm.sh" ]; then
  load_nvm "${NVM_DIR}/nvm.sh"
elif [ -s "${HOME}/.nvm/nvm.sh" ]; then
  load_nvm "${HOME}/.nvm/nvm.sh"
elif [ -s "/root/.nvm/nvm.sh" ]; then
  load_nvm "/root/.nvm/nvm.sh"
fi
