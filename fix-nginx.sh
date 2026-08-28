#!/bin/bash

# Fix Nginx Configuration Script
# This script updates Nginx to point to port 7500

set -e

echo "=========================================="
echo "Fixing Nginx Configuration"
echo "=========================================="

# Find Nginx configuration file
echo ""
echo "Step 1: Finding Nginx configuration file..."

NGINX_CONFIG=""
if [ -f "/etc/nginx/sites-available/api.middaybox.com" ]; then
  NGINX_CONFIG="/etc/nginx/sites-available/api.middaybox.com"
elif [ -f "/etc/nginx/conf.d/api.middaybox.com.conf" ]; then
  NGINX_CONFIG="/etc/nginx/conf.d/api.middaybox.com.conf"
elif [ -f "/etc/nginx/sites-available/default" ]; then
  NGINX_CONFIG="/etc/nginx/sites-available/default"
else
  echo "ERROR: Could not find Nginx configuration file"
  echo "Searching for all Nginx config files..."
  sudo find /etc/nginx -name "*.conf" -type f 2>/dev/null | head -5
  exit 1
fi

echo "Found config file: $NGINX_CONFIG"

# Backup current config
echo ""
echo "Step 2: Backing up current configuration..."
sudo cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
echo "Backup created"

# Check current proxy_pass setting
echo ""
echo "Step 3: Checking current proxy_pass configuration..."
CURRENT_PROXY=$(sudo grep -i "proxy_pass" "$NGINX_CONFIG" | grep -v "^#" | head -1 || echo "")
echo "Current proxy_pass: $CURRENT_PROXY"

# Update proxy_pass to port 7500
echo ""
echo "Step 4: Updating proxy_pass to port 7500..."

# Use sed to replace any port number in proxy_pass with 7500
sudo sed -i 's|proxy_pass http://127.0.0.1:[0-9]*;|proxy_pass http://127.0.0.1:7500;|g' "$NGINX_CONFIG"
sudo sed -i 's|proxy_pass http://localhost:[0-9]*;|proxy_pass http://127.0.0.1:7500;|g' "$NGINX_CONFIG"

# Verify the change
echo ""
echo "Step 5: Verifying the change..."
NEW_PROXY=$(sudo grep -i "proxy_pass" "$NGINX_CONFIG" | grep -v "^#" | head -1 || echo "")
echo "New proxy_pass: $NEW_PROXY"

if echo "$NEW_PROXY" | grep -q "7500"; then
  echo "✓ Configuration updated successfully"
else
  echo "WARNING: Configuration may not have been updated correctly"
  echo "Please check the file manually: sudo nano $NGINX_CONFIG"
fi

# Test Nginx configuration
echo ""
echo "Step 6: Testing Nginx configuration..."
if sudo nginx -t; then
  echo "✓ Nginx configuration is valid"
else
  echo "ERROR: Nginx configuration test failed"
  echo "Restoring backup..."
  sudo cp "${NGINX_CONFIG}.backup."* "$NGINX_CONFIG" 2>/dev/null || true
  exit 1
fi

# Reload Nginx
echo ""
echo "Step 7: Reloading Nginx..."
if sudo systemctl reload nginx; then
  echo "✓ Nginx reloaded successfully"
else
  echo "ERROR: Failed to reload Nginx"
  exit 1
fi

# Verify Nginx is running
echo ""
echo "Step 8: Verifying Nginx status..."
sudo systemctl status nginx --no-pager | head -5 || true

# Test the endpoint
echo ""
echo "Step 9: Testing health endpoint..."
sleep 2
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:7500/api/health 2>/dev/null || echo "000")
if [ "$HEALTH_CHECK" = "200" ]; then
  echo "✓ Backend health check passed (HTTP $HEALTH_CHECK)"
else
  echo "WARNING: Backend health check failed (HTTP $HEALTH_CHECK)"
fi

# Final status
echo ""
echo "=========================================="
echo "Nginx Configuration Fixed!"
echo "=========================================="
echo "Config file: $NGINX_CONFIG"
echo "Proxy target: http://127.0.0.1:7500"
echo ""
echo "Test your API:"
echo "  curl https://api.middaybox.com/api/health"
echo ""
echo "If you still get 502 errors, check:"
echo "  1. Nginx error logs: sudo tail -f /var/log/nginx/error.log"
echo "  2. App logs: pm2 logs MidiDayBoxBackend"
echo "  3. App status: pm2 status"
echo "=========================================="

