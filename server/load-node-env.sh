#!/bin/bash

export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

if [ -n "${NVM_DIR:-}" ] && [ -s "${NVM_DIR}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR}/nvm.sh"
elif [ -s "${HOME}/.nvm/nvm.sh" ]; then
  export NVM_DIR="${HOME}/.nvm"
  # shellcheck disable=SC1091
  . "${NVM_DIR}/nvm.sh"
elif [ -s "/root/.nvm/nvm.sh" ]; then
  export NVM_DIR="/root/.nvm"
  # shellcheck disable=SC1091
  . "${NVM_DIR}/nvm.sh"
fi

if [ -s "${HOME}/.bashrc" ]; then
  # shellcheck disable=SC1091
  . "${HOME}/.bashrc"
fi

if [ -s "${HOME}/.profile" ]; then
  # shellcheck disable=SC1091
  . "${HOME}/.profile"
fi
