#!/bin/bash

# Script to get GitHub Actions IP ranges for EC2 Security Group

echo "Fetching GitHub Actions IP ranges..."
echo ""

# Get IP ranges from GitHub API
IPS=$(curl -s https://api.github.com/meta | jq -r '.actions[]' | grep -v '::')

if [ -z "$IPS" ]; then
    echo "Error: Could not fetch IP ranges"
    exit 1
fi

echo "GitHub Actions IP Ranges:"
echo "========================"
echo "$IPS"
echo ""
echo "To add these to your EC2 Security Group:"
echo "1. Go to AWS Console → EC2 → Security Groups"
echo "2. Select your instance's security group"
echo "3. Edit inbound rules"
echo "4. Add SSH rule (port 22) with these IP ranges"
echo ""
echo "Or use AWS CLI (replace SECURITY_GROUP_ID):"
echo ""

# Generate AWS CLI commands
while IFS= read -r ip; do
    if [ -n "$ip" ]; then
        echo "aws ec2 authorize-security-group-ingress --group-id SECURITY_GROUP_ID --protocol tcp --port 22 --cidr $ip"
    fi
done <<< "$IPS"

