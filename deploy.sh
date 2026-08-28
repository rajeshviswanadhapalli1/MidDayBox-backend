#!/bin/bash

# Manual deployment script for MidiDayBox Backend
# This script can be run manually on the EC2 server if needed

set -e

echo "=========================================="
echo "MidiDayBox Backend - Manual Deployment"
echo "=========================================="

# Navigate to project directory
cd ~/MidiDayBox-Backend || { echo "ERROR: Directory not found"; exit 1; }

# Pull latest code
echo "Pulling latest code..."
git fetch origin
git pull origin main || git pull origin master || { echo "ERROR: Failed to pull code"; exit 1; }

# Create necessary directories
echo "Creating necessary directories..."
mkdir -p logs uploads/profile-pictures || true

# Install dependencies
echo "Installing dependencies..."
npm ci --production || { echo "ERROR: Failed to install dependencies"; exit 1; }

# Stop and delete existing app
echo "Stopping existing application..."
pm2 stop MidiDayBoxBackend 2>/dev/null || echo "App not running"
pm2 delete MidiDayBoxBackend 2>/dev/null || echo "App not in PM2 list"

# Start application
echo "Starting application..."
pm2 start ecosystem.config.js || { 
  echo "ERROR: Failed to start application"
  exit 1
}

# Wait for app to start
echo "Waiting for application to start..."
sleep 5

# Check status
echo "Checking application status..."
pm2 status

# Save PM2 configuration
echo "Saving PM2 configuration..."
pm2 save

echo "=========================================="
echo "Deployment completed!"
echo "=========================================="

