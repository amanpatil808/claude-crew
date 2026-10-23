#!/usr/bin/env bash
# Seeds the empty workspace with the shared tiny-shop fixture (see evals/fixtures/README.md).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$here/../../fixtures/tiny-shop.sh" "$here/../../fixtures"
