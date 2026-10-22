#!/usr/bin/env bash
# Seeds the empty eval workspace with the tiny-shop fixture as a one-commit git repo.
# Called from each case's setup.sh; $1 is the path to evals/fixtures.
set -euo pipefail
src="$1/tiny-shop"
cp -R "$src/." .
git init -q -b main
git -c user.name=eval -c user.email=eval@example.invalid add -A
git -c user.name=eval -c user.email=eval@example.invalid commit -q -m "tiny-shop fixture"
