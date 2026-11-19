#!/usr/bin/env bash
# Deploys web/ to the gh-pages branch as an orphan commit.
# IDENTITY RULE: every commit pushed to GitHub must be
#   name  "Ashiq Hussain Mir"
#   email "imsrenpsycho@gmail.com"
# (the email from upload/github-details.txt, the one linked to the
#  mir-ashiq GitHub account). Never rely on sandbox git defaults.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f /home/z/my-project/.ghtoken_tmp ]; then
  echo "ERROR: /home/z/my-project/.ghtoken_tmp missing (re-extract from upload/github-details.txt)" >&2
  exit 1
fi

BUILD=/home/z/my-project/.ghpages-build
rm -rf "$BUILD"
mkdir -p "$BUILD"
trap 'rm -rf "$BUILD"' EXIT

git init -q -b gh-pages "$BUILD"
cp web/* "$BUILD"/
git -C "$BUILD" add -A
git -C "$BUILD" \
  -c user.name="Ashiq Hussain Mir" \
  -c user.email="imsrenpsycho@gmail.com" \
  commit -q -m "deploy: dashboard (real corpus aggregates + 3D trajectory viewer)"
git -C "$BUILD" remote add origin https://github.com/mir-ashiq/breachiq3d.git
git -C "$BUILD" \
  -c credential.helper='!f() { echo username=mir-ashiq; echo password=$(cat /home/z/my-project/.ghtoken_tmp); }; f' \
  push -f origin gh-pages
echo "gh-pages deployed with identity: Ashiq Hussain Mir <imsrenpsycho@gmail.com>"
