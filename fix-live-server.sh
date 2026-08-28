#!/bin/bash

# Complete Live Server Fix Script
# This script deploys code and fixes Nginx configuration

set -e

echo "=========================================="
echo "COMPLETE LIVE SERVER FIX"
echo "Deploying code + Fixing Nginx"
echo "=========================================="

# Navigate to project directory
echo ""
echo "Step 1: Navigating to project directory..."
cd ~/MidiDayBox-Backend || { 
  echo "ERROR: Directory not found"
  exit 1
}
pwd

# Pull latest code
echo ""
echo "Step 2: Pulling latest code..."
git fetch origin
git pull origin main || git pull origin master || { 
  echo "ERROR: Failed to pull code"
  exit 1
}
echo "Latest commit: $(git log -1 --oneline)"

# Install dependencies
echo ""
echo "Step 3: Installing dependencies..."
npm ci --production || { 
  echo "ERROR: Failed to install dependencies"
  exit 1
}

# Restart app with PM2
echo ""
echo "Step 4: Restarting application with PM2..."
pm2 stop MidiDayBoxBackend 2>/dev/null || echo "App not running"
pm2 delete MidiDayBoxBackend 2>/dev/null || echo "App not in PM2 list"
pm2 start ecosystem.config.js || { 
  echo "ERROR: Failed to start application"
  exit 1
}

# Wait for app
echo ""
echo "Step 5: Waiting for application to start..."
sleep 10

# Verify app is running
echo ""
echo "Step 6: Verifying application status..."
pm2 status
APP_STATUS=$(pm2 describe MidiDayBoxBackend 2>/dev/null | grep "status" | head -1 | awk '{print $4}' || echo "unknown")
if [ "$APP_STATUS" != "online" ]; then
  echo "ERROR: Application is not online"
  pm2 logs MidiDayBoxBackend --lines 20 --nostream
  exit 1
fi

# Test backend directly
echo ""
echo "Step 7: Testing backend directly on port 7500..."
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:7500/api/health 2>/dev/null || echo "000")
if [ "$HEALTH_CHECK" = "200" ]; then
  echo "✓ Backend is working (HTTP $HEALTH_CHECK)"
  curl -s http://localhost:7500/api/health | head -3
else
  echo "ERROR: Backend health check failed (HTTP $HEALTH_CHECK)"
  exit 1
fi

# Fix Nginx configuration
echo ""
echo "=========================================="
echo "FIXING NGINX CONFIGURATION"
echo "=========================================="

# Find Nginx config
NGINX_CONFIG=""
if [ -f "/etc/nginx/sites-available/api.middaybox.com" ]; then
  NGINX_CONFIG="/etc/nginx/sites-available/api.middaybox.com"
elif [ -f "/etc/nginx/conf.d/api.middaybox.com.conf" ]; then
  NGINX_CONFIG="/etc/nginx/conf.d/api.middaybox.com.conf"
elif [ -f "/etc/nginx/sites-available/default" ]; then
  NGINX_CONFIG="/etc/nginx/sites-available/default"
else
  echo "Searching for Nginx config files..."
  NGINX_CONFIG=$(sudo find /etc/nginx -name "*middaybox*" -o -name "*api*" -type f 2>/dev/null | head -1)
  if [ -z "$NGINX_CONFIG" ]; then
    echo "ERROR: Could not find Nginx configuration"
    echo "Please manually update Nginx to point to http://127.0.0.1:7500"
    exit 1
  fi
fi

echo "Found Nginx config: $NGINX_CONFIG"

# Backup config
echo ""
echo "Backing up configuration..."
sudo cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

# Update proxy_pass to port 7500
echo ""
echo "Updating proxy_pass to port 7500..."
sudo sed -i 's|proxy_pass http://127.0.0.1:[0-9]*;|proxy_pass http://127.0.0.1:7500;|g' "$NGINX_CONFIG"
sudo sed -i 's|proxy_pass http://localhost:[0-9]*;|proxy_pass http://127.0.0.1:7500;|g' "$NGINX_CONFIG"

# Verify change
NEW_PROXY=$(sudo grep -i "proxy_pass" "$NGINX_CONFIG" | grep -v "^#" | head -1 || echo "")
echo "Updated proxy_pass: $NEW_PROXY"

# Test and reload Nginx
echo ""
echo "Testing Nginx configuration..."
if sudo nginx -t; then
  echo "✓ Nginx configuration is valid"
  echo ""
  echo "Reloading Nginx..."
  sudo systemctl reload nginx
  echo "✓ Nginx reloaded"
else
  echo "ERROR: Nginx configuration test failed"
  exit 1
fi

# Save PM2 config
echo ""
echo "Saving PM2 configuration..."
pm2 save

# Final verification
echo ""
echo "=========================================="
echo "FINAL VERIFICATION"
echo "=========================================="
echo "App Status: $(pm2 describe MidiDayBoxBackend 2>/dev/null | grep "status" | head -1 | awk '{print $4}')"
echo "App Port: 7500"
echo "Nginx Config: $NGINX_CONFIG"
echo ""
echo "Testing endpoints..."
echo "Backend (direct): $(curl -s -o /dev/null -w "%{http_code}" http://localhost:7500/api/health 2>/dev/null || echo 'failed')"
echo ""
echo "=========================================="
echo "DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "Your API should now be live at:"
echo "  https://api.middaybox.com/api/health"
echo ""
echo "If you still get 502 errors:"
echo "  1. Check Nginx logs: sudo tail -f /var/log/nginx/error.log"
echo "  2. Check app logs: pm2 logs MidiDayBoxBackend"
echo "  3. Verify Nginx config: sudo cat $NGINX_CONFIG | grep proxy_pass"
echo "=========================================="

