# GitHub Actions Queuing Issue - Troubleshooting Guide

## Problem: Workflow Stuck in "Queued" Status

When your GitHub Actions workflow is stuck in "Queued" status, it typically means GitHub cannot allocate a runner to execute your workflow.

## Common Causes & Solutions

### 1. GitHub Actions Minutes Quota Exhausted

**Check your quota:**
- Go to: Repository → Settings → Actions → Usage
- Or: https://github.com/settings/billing

**Solutions:**
- Upgrade your GitHub plan if you've exceeded free tier limits
- Free tier: 2,000 minutes/month for private repos
- Public repos: Unlimited minutes

### 2. Repository Actions Settings

**Check if Actions are enabled:**
- Go to: Repository → Settings → Actions → General
- Ensure "Allow all actions and reusable workflows" is selected
- Or at minimum, allow the specific actions you're using

### 3. Too Many Concurrent Workflows

**Solution:** The workflow now includes concurrency control:
```yaml
concurrency:
  group: deploy-ec2
  cancel-in-progress: true
```
This ensures only one deployment runs at a time.

### 4. Billing/Payment Issues

**Check:**
- Go to: https://github.com/settings/billing
- Ensure your payment method is valid
- Check for any billing alerts

### 5. Workflow File Syntax Errors

**Check:**
- Go to: Repository → Actions tab
- Look for any red error indicators
- Check the workflow file for YAML syntax errors

## What Was Fixed

1. **Added Concurrency Control:**
   - Prevents multiple deployments from running simultaneously
   - Cancels in-progress runs when a new one starts

2. **Updated Action Versions:**
   - `actions/checkout@v4` (was v3)
   - `appleboy/ssh-action@v1.0.3` (was v1.0.0)

3. **Added Permissions:**
   - Explicit permissions for better security and compatibility

4. **Added Timeout:**
   - 15-minute job timeout to prevent infinite runs

5. **Improved Error Handling:**
   - Added `|| exit 1` to script commands for better failure detection

## Immediate Actions to Take

1. **Check GitHub Actions Usage:**
   ```bash
   # Visit in browser:
   https://github.com/settings/billing
   ```

2. **Verify Repository Settings:**
   - Repository → Settings → Actions → General
   - Ensure Actions are enabled

3. **Check Workflow Status:**
   - Go to: Repository → Actions tab
   - Click on the queued workflow
   - Check for any error messages

4. **Cancel Queued Workflows:**
   - If multiple workflows are queued, cancel old ones
   - Keep only the latest one

## Testing the Fix

After pushing the updated workflow:

1. **Monitor the workflow:**
   - Go to Actions tab
   - Watch the workflow status
   - It should move from "Queued" to "In progress" within 1-2 minutes

2. **If still queued:**
   - Check GitHub Actions usage/billing
   - Verify repository Actions settings
   - Check for any error messages in the workflow run

## Alternative: Use Self-Hosted Runner

If you continue to have quota issues, consider setting up a self-hosted runner on your EC2 instance:

1. **Install runner on EC2:**
   ```bash
   mkdir actions-runner && cd actions-runner
   curl -o actions-runner-linux-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
   tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz
   ./config.sh --url https://github.com/YOUR_ORG/YOUR_REPO --token YOUR_TOKEN
   ./run.sh
   ```

2. **Update workflow to use self-hosted runner:**
   ```yaml
   runs-on: self-hosted
   ```

## Contact GitHub Support

If none of the above solutions work:
- Visit: https://support.github.com
- Check GitHub Status: https://www.githubstatus.com

