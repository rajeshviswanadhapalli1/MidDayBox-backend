# Deployment Guide - Fixing GitHub Actions SSH Timeout

## Problem
GitHub Actions cannot SSH into your EC2 instance because the security group doesn't allow connections from GitHub's IP ranges.

## Solution Options

### Option 1: Allow GitHub Actions IP Ranges (Quick Fix)

GitHub Actions runners use IP addresses from specific ranges. You need to add these to your EC2 security group.

#### Steps:

1. **Get GitHub Actions IP Ranges:**
   - Visit: https://api.github.com/meta
   - Or use this command to get the IPs:
   ```bash
   curl -s https://api.github.com/meta | jq -r '.actions[]' | grep -v '::'
   ```

2. **Update EC2 Security Group:**
   - Go to AWS Console → EC2 → Security Groups
   - Select your instance's security group
   - Click "Edit inbound rules"
   - Add a new rule:
     - **Type:** SSH
     - **Protocol:** TCP
     - **Port:** 22
     - **Source:** Custom (paste GitHub Actions IP ranges)
     - **Description:** GitHub Actions

3. **Note:** GitHub's IP ranges change frequently. Consider using Option 2 or 3 for a more permanent solution.

### Option 2: Use AWS Systems Manager Session Manager (Recommended - Most Secure)

This method doesn't require opening SSH port 22 and is more secure.

#### Prerequisites:
- EC2 instance must have SSM Agent installed (pre-installed on Amazon Linux 2)
- IAM role with SSM permissions attached to EC2 instance

#### Steps:

1. **Attach IAM Role to EC2 Instance:**
   - Create/attach IAM role: `AmazonSSMManagedInstanceCore`
   - Or create custom policy with SSM permissions

2. **Update GitHub Actions Workflow:**
   - Use `aws-actions/configure-aws-credentials` to authenticate
   - Use `aws-actions/amazon-ec2-instance-connect` or custom script with `aws ssm start-session`

### Option 3: Use a Bastion Host (For Production)

Set up a bastion host that:
- Has a fixed IP or Elastic IP
- Allows SSH from GitHub Actions IP ranges
- Can SSH into your application server

### Option 4: Self-Hosted GitHub Actions Runner (Most Control)

Run a GitHub Actions runner directly on your EC2 instance:
- No SSH needed
- Full control over the environment
- Better for private repositories

## Current Workflow Configuration

Your workflow uses `appleboy/ssh-action@v1.0.0` with:
- Timeout: 60s (connection timeout)
- Command timeout: 10m (script execution timeout)

## Required GitHub Secrets

Make sure these secrets are configured in your repository:
- `EC2_HOST`: Your EC2 instance public IP or domain
- `EC2_USER`: SSH username (usually `ec2-user` for Amazon Linux)
- `EC2_SSH_KEY`: Your private SSH key (contents of the .pem file)
- `EC2_PORT`: SSH port (default: 22)

## Quick Fix Script

To quickly add GitHub Actions IPs to your security group, you can use AWS CLI:

```bash
# Get GitHub Actions IPs
GITHUB_IPS=$(curl -s https://api.github.com/meta | jq -r '.actions[]' | grep -v '::' | tr '\n' ',' | sed 's/,$//')

# Add to security group (replace SECURITY_GROUP_ID with your actual ID)
aws ec2 authorize-security-group-ingress \
  --group-id SECURITY_GROUP_ID \
  --protocol tcp \
  --port 22 \
  --cidr "$GITHUB_IPS"
```

## Troubleshooting

1. **Check Security Group:**
   ```bash
   aws ec2 describe-security-groups --group-ids YOUR_GROUP_ID
   ```

2. **Test SSH Connection:**
   ```bash
   ssh -v -i your-key.pem ec2-user@YOUR_EC2_IP
   ```

3. **Check Instance Status:**
   - Ensure instance is running
   - Check if public IP has changed (if not using Elastic IP)

4. **Verify GitHub Secrets:**
   - Go to Repository → Settings → Secrets and variables → Actions
   - Ensure all required secrets are set correctly

## Security Best Practices

1. **Never commit SSH keys to the repository**
2. **Use GitHub Secrets for sensitive data**
3. **Rotate SSH keys regularly**
4. **Use least privilege principle for security groups**
5. **Consider using AWS Systems Manager instead of direct SSH**

