
#!/usr/bin/env bash
set -Eeuo pipefail

# Node.js environment
export PATH="/usr/bin:/usr/local/bin:$PATH"

# Application configuration
APP_DIR="/home/ubuntu/apps/dots-travel"
BRANCH="master"
APP_NAME="nextjs-app"

echo "===================================="
echo "Starting Next.js deployment"
echo "===================================="

cd "$APP_DIR"

echo "==> Pulling latest code"

git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Installing dependencies"

pnpm install --frozen-lockfile

echo "==> Generating Prisma Client"

pnpm exec prisma generate

echo "==> Running database migrations"

pnpm exec prisma migrate deploy

echo "==> Building Next.js application"

pnpm build

echo "==> Restarting application"

pm2 restart "$APP_NAME" --update-env

echo "==> Checking application status"

pm2 status "$APP_NAME"

echo "===================================="
echo "Deployment completed successfully"
echo "===================================="
