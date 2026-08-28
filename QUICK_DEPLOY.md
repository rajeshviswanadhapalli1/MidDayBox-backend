# Quick Emergency Deployment

## Run this command directly on your EC2 server:

```bash
ssh -i ~/Downloads/MidDayBox.pem ec2-user@YOUR_EC2_IP 'cd ~/MidiDayBox-Backend && git pull origin main && npm ci --production && pm2 stop MidiDayBoxBackend && pm2 delete MidiDayBoxBackend && pm2 start ecosystem.config.js && sleep 5 && pm2 status && pm2 save'
```

## Or copy this script to the server and run it:

```bash
# Copy the script to server
scp -i ~/Downloads/MidDayBox.pem deploy-live.sh ec2-user@YOUR_EC2_IP:~/MidiDayBox-Backend/

# Then SSH and run it
ssh -i ~/Downloads/MidDayBox.pem ec2-user@YOUR_EC2_IP 'cd ~/MidiDayBox-Backend && chmod +x deploy-live.sh && ./deploy-live.sh'
```

## Manual Step-by-Step (if above doesn't work):

```bash
# 1. SSH into server
ssh -i ~/Downloads/MidDayBox.pem ec2-user@YOUR_EC2_IP

# 2. Navigate to project
cd ~/MidiDayBox-Backend

# 3. Pull latest code
git pull origin main

# 4. Install dependencies
npm ci --production

# 5. Stop and delete old app
pm2 stop MidiDayBoxBackend
pm2 delete MidiDayBoxBackend

# 6. Start new app
pm2 start ecosystem.config.js

# 7. Wait and check status
sleep 5
pm2 status

# 8. Save PM2 config
pm2 save

# 9. Check logs
pm2 logs MidiDayBoxBackend

# 10. Test health endpoint
curl http://localhost:7500/api/health
```

## Verify Nginx Configuration:

Make sure Nginx is pointing to port 7500:

```bash
sudo nano /etc/nginx/sites-available/api.middaybox.com
```

Should have: `proxy_pass http://127.0.0.1:7500;`

Then reload:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

