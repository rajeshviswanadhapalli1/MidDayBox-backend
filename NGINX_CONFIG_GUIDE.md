# Nginx Configuration Guide for MidiDayBox Backend

## Problem: 502 Bad Gateway

If you're getting a 502 Bad Gateway error, it means Nginx is running but can't connect to your Node.js application.

## Solution: Verify Nginx Configuration

### 1. Check Nginx Configuration

Your Nginx configuration should proxy requests to `http://127.0.0.1:7500` or `http://localhost:7500`.

**Typical Nginx configuration location:**
```bash
sudo nano /etc/nginx/sites-available/api.middaybox.com
# or
sudo nano /etc/nginx/conf.d/api.middaybox.com.conf
```

### 2. Correct Nginx Configuration

Your Nginx config should look like this:

```nginx
server {
    listen 80;
    server_name api.middaybox.com;

    # Redirect HTTP to HTTPS (if using SSL)
    # return 301 https://$server_name$request_uri;

    location / {
        proxy_pass http://127.0.0.1:7500;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### 3. If Using HTTPS/SSL

```nginx
server {
    listen 443 ssl http2;
    server_name api.middaybox.com;

    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;

    location / {
        proxy_pass http://127.0.0.1:7500;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### 4. Test and Reload Nginx

After updating the configuration:

```bash
# Test Nginx configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx
# or
sudo service nginx reload
```

### 5. Verify Application is Running

```bash
# Check if app is listening on port 7500
sudo netstat -tuln | grep 7500
# or
sudo ss -tuln | grep 7500

# Check PM2 status
pm2 status

# Check app logs
pm2 logs MidiDayBoxBackend

# Test health endpoint directly
curl http://localhost:7500/api/health
```

### 6. Check Nginx Error Logs

```bash
# View Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Common errors:
# - "connect() failed (111: Connection refused)" - App not running
# - "connect() failed (110: Connection timed out)" - Firewall blocking
# - "upstream prematurely closed connection" - App crashed
```

### 7. Common Issues and Fixes

#### Issue: Connection Refused
**Symptom:** `connect() failed (111: Connection refused)`
**Fix:** 
- Ensure PM2 app is running: `pm2 restart MidiDayBoxBackend`
- Check if app is listening: `netstat -tuln | grep 7500`

#### Issue: App Not Listening on Correct Interface
**Symptom:** App shows as online but Nginx can't connect
**Fix:** 
- Ensure app listens on `0.0.0.0` (all interfaces), not just `127.0.0.1`
- The updated `index.js` now listens on `0.0.0.0` by default

#### Issue: Port Mismatch
**Symptom:** Nginx pointing to wrong port
**Fix:**
- Verify app is on port 7500: `pm2 describe MidiDayBoxBackend`
- Update Nginx config to use port 7500

#### Issue: Firewall Blocking
**Symptom:** Connection timeout
**Fix:**
```bash
# Check firewall rules
sudo iptables -L -n | grep 7500

# If needed, allow localhost connections (usually not needed)
sudo ufw allow from 127.0.0.1 to any port 7500
```

### 8. Quick Diagnostic Commands

Run these commands to diagnose the issue:

```bash
# 1. Check if app is running
pm2 status

# 2. Check if app is listening
sudo netstat -tuln | grep 7500

# 3. Test app directly
curl http://localhost:7500/api/health

# 4. Check Nginx status
sudo systemctl status nginx

# 5. Check Nginx config
sudo nginx -t

# 6. View recent Nginx errors
sudo tail -20 /var/log/nginx/error.log

# 7. View app logs
pm2 logs MidiDayBoxBackend --lines 50
```

### 9. Restart Everything

If all else fails, restart everything:

```bash
# Restart the app
pm2 restart MidiDayBoxBackend

# Wait a few seconds
sleep 5

# Restart Nginx
sudo systemctl restart nginx

# Check status
pm2 status
sudo systemctl status nginx
```

## After Fixing

Once Nginx is configured correctly:
1. Test the health endpoint: `curl https://api.middaybox.com/api/health`
2. Check browser: Visit `https://api.middaybox.com/api/health`
3. Monitor logs: `pm2 logs MidiDayBoxBackend`

