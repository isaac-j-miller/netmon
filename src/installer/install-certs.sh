#!/bin/bash
set -eou pipefail

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "${SCRIPT_DIR}/../.."

node -r tsconfig-paths/register -r ts-node/register ./src/installer/gen-certs.ts --config-json ./test/config.json --out ./test/output.json

root_crt=$( cat ./test/output.json | jq -r .rootCert )

# this is the path of the root certificate to trust
echo "root_crt ${root_crt}"

# update system trusted certs (this works on debian. will need to figure out something else for arch/fedora or mac/windows)
sudo cp "${root_crt}" "/usr/local/share/ca-certificates/test-root-ca.crt"
sudo update-ca-certificates

# update chrome/firefox trusted certs
while read -r -d $'\0' i ; do
    certutil -d 'sql:'"$i" -A -t "C,," -n test-root-ca -i "${root_crt}"
done < <(find "$HOME" -type f -iregex '.*[/]cert[89][.]db' -printf '%h\0')
