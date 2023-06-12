#!/bin/bash
set -eou pipefail

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "${SCRIPT_DIR}/../.."

# name=$(logname)
node -r tsconfig-paths/register -r ts-node/register ./src/installer/gen-certs.ts --config-json ./test/config.json --out ./test/output.json

root_crt=$( cat ./test/output.json | jq -r .rootCert )

echo "root_crt ${root_crt}"
sudo cp "${root_crt}" "/usr/local/share/ca-certificates/test-root-ca.crt"
sudo update-ca-certificates
