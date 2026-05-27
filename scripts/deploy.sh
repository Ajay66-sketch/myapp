#!/bin/bash
# scripts/deploy.sh
# DevOps automated staging and production deployment workflow script
# Performs compile checks, verifies build outputs, and provides clear SRE rollback steps.

set -e

COLOR_GREEN='\033[0;32m'
COLOR_BLUE='\033[0;34m'
COLOR_RED='\033[0;31m'
COLOR_RESET='\033[0m'

echo -e "${COLOR_BLUE}=====================================================${COLOR_RESET}"
echo -e "${COLOR_BLUE}🚀 DEPLOYMENT PIPELINE ORCHESTRATION INITIATED${COLOR_RESET}"
echo -e "${COLOR_BLUE}=====================================================${COLOR_RESET}"

# 1. Ask environment target
TARGET_ENV=${1:-"staging"}
if [ "$TARGET_ENV" != "staging" ] && [ "$TARGET_ENV" != "production" ]; then
  echo -e "${COLOR_RED}❌ Error: Invalid environment target. Must be 'staging' or 'production'.${COLOR_RESET}"
  exit 1
fi

echo -e "📦 Target Environment: ${COLOR_GREEN}${TARGET_ENV}${COLOR_RESET}"

# 2. Compile and validation checks
echo -e "\n🛠️  Step 1: Running compiler validation smoke tests..."
npm run test

# 3. Check client build
echo -e "\n🛠️  Step 2: Checking frontend client compilation..."
if [ -d "client" ]; then
  echo "⌛ Building React client bundle..."
  cd client && npm run build
  cd ..
  echo -e "${COLOR_GREEN}✅ Frontend bundle builds successfully!${COLOR_RESET}"
else
  echo "⚠️  Client directory not found. Skipping client compilation check."
fi

# 4. Success summary and Deploy Instructions
echo -e "\n${COLOR_GREEN}====================================================="
echo -e "🎉 PRE-DEPLOYMENT VERIFICATION PASSED WITH 100% SUCCESS!"
echo -e "=====================================================${COLOR_RESET}"
echo -e "To deploy this build to your managed hosting provider, run:"
echo -e "   - ${COLOR_BLUE}Render:${COLOR_RESET} Git commit and push to your staging/main branch (auto-deploys via blueprint)"
echo -e "   - ${COLOR_BLUE}Railway:${COLOR_RESET} railway up"
echo -e "\n${COLOR_RED}⚠️ EMERGENCY ROLLBACK PLAN INSTRUCTIONS:${COLOR_RESET}"
echo -e "If the smoke checks or health metrics degrade immediately post-deploy:"
echo -e "   1. Render: Go to Dashboard -> Events -> Rollback to last successful deploy."
echo -e "   2. Railway: Go to Deployments -> select previous active deployment -> Redeploy."
echo -e "   3. CLI Direct: git checkout <previous-tag-or-commit-sha> && git push origin <branch> --force"
echo -e "=====================================================\n"
