#!/bin/bash

# Emergency Live Deployment Script
# Run this directly on the EC2 server to deploy immediately

set -e

echo "=========================================="
echo "EMERGENCY LIVE DEPLOYMENT"
echo "MidiDayBox Backend - Port 7500"
echo "=========================================="

# Navigate to project directory
echo ""
echo "Step 1: Navigating to project directory..."
cd ~/MidiDayBox-Backend || { 
  echo "ERROR: Directory not found. Creating it..."
  mkdir -p ~/MidiDayBox-Backend
  cd ~/MidiDayBox-Backend
  git clone https://github.com/MidDayBox/MidiDayBox-Backend.git . || exit 1
}
pwd

# Pull latest code
echo ""
echo "Step 2: Pulling latest code from repository..."
git fetch origin
git pull origin main || git pull origin master || { 
  echo "ERROR: Failed to pull code"
  exit 1
}
echo "Latest commit: $(git log -1 --oneline)"

# Create necessary directories
echo ""
echo "Step 3: Creating necessary directories..."
mkdir -p logs uploads/profile-pictures || true

# Install dependencies
echo ""
echo "Step 4: Installing dependencies..."
npm ci --production || { 
  echo "ERROR: Failed to install dependencies"
  exit 1
}

# Check PM2 status
echo ""
echo "Step 5: Checking current PM2 status..."
pm2 list || echo "PM2 not initialized"

# Stop and delete existing app
echo ""
echo "Step 6: Stopping and removing existing application..."
pm2 stop MidiDayBoxBackend 2>/dev/null || echo "App not running"
pm2 delete MidiDayBoxBackend 2>/dev/null || echo "App not in PM2 list"

# Start application with PM2
echo ""
echo "Step 7: Starting application with PM2 on port 7500..."
pm2 start ecosystem.config.js || { 
  echo "ERROR: Failed to start application with ecosystem.config.js"
  echo "Trying to start directly with port 7500..."
  PORT=7500 pm2 start index.js --name MidiDayBoxBackend || { 
    echo "ERROR: Failed to start application"
    exit 1
  }
}

# Wait for app to initialize
echo ""
echo "Step 8: Waiting for application to initialize..."
sleep 10

# Verify app is running
echo ""
echo "Step 9: Verifying application status..."
pm2 status

# Check if app is online
APP_STATUS=$(pm2 describe MidiDayBoxBackend 2>/dev/null | grep "status" | head -1 | awk '{print $4}' || echo "unknown")
echo "App status: $APP_STATUS"

if [ "$APP_STATUS" != "online" ]; then
  echo ""
  echo "ERROR: Application is not online. Current status: $APP_STATUS"
  echo ""
  echo "=== Recent Error Logs ==="
  pm2 logs MidiDayBoxBackend --lines 50 --nostream --err 2>/dev/null || true
  echo ""
  echo "=== Recent Output Logs ==="
  pm2 logs MidiDayBoxBackend --lines 50 --nostream --out 2>/dev/null || true
  echo ""
  echo "=== PM2 Process Info ==="
  pm2 describe MidiDayBoxBackend || true
  exit 1
fi

# Verify app is listening on port 7500
echo ""
echo "Step 10: Verifying app is listening on port 7500..."
if netstat -tuln 2>/dev/null | grep -q ":7500"; then
  echo "✓ App is listening on port 7500"
elif ss -tuln 2>/dev/null | grep -q ":7500"; then
  echo "✓ App is listening on port 7500"
else
  echo "WARNING: App may not be listening on port 7500"
  echo "Checking what ports are in use..."
  netstat -tuln 2>/dev/null | grep LISTEN || ss -tuln 2>/dev/null | grep LISTEN || true
fi

# Test health endpoint
echo ""
echo "Step 11: Testing health endpoint on port 7500..."
sleep 3
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:7500/api/health 2>/dev/null || echo "000")
if [ "$HEALTH_CHECK" = "200" ]; then
  echo "✓ Health check passed (HTTP $HEALTH_CHECK)"
  echo "Response:"
  curl -s http://localhost:7500/api/health | head -5 || true
else
  echo "WARNING: Health check failed (HTTP $HEALTH_CHECK)"
  echo "Checking app logs for errors..."
  pm2 logs MidiDayBoxBackend --lines 20 --nostream 2>/dev/null || true
fi

# Show recent logs
echo ""
echo "Step 12: Recent application logs:"
pm2 logs MidiDayBoxBackend --lines 30 --nostream 2>/dev/null || true

# Save PM2 configuration
echo ""
echo "Step 13: Saving PM2 configuration..."
pm2 save || { echo "WARNING: Failed to save PM2 configuration"; }

# Final status
echo ""
echo "=========================================="
echo "DEPLOYMENT COMPLETED!"
echo "=========================================="
echo "Application: MidiDayBoxBackend"
echo "Status: $(pm2 describe MidiDayBoxBackend 2>/dev/null | grep "status" | head -1 | awk '{print $4}' || echo 'unknown')"
echo "Port: 7500"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Verify Nginx is configured to proxy to http://127.0.0.1:7500"
echo "2. Test: curl http://localhost:7500/api/health"
echo "3. Check logs: pm2 logs MidiDayBoxBackend"
echo "=========================================="

