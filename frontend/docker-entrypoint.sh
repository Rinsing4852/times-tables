#!/bin/sh
set -eu

export HOSTNAME=0.0.0.0
export PORT="${PORT:-3000}"

exec node server.js
