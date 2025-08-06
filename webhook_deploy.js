// Webhook сервер для автоматического деплоя EnoTerra ERP
const express = require('express');
const { exec } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
app.use(express.json());

// Секретный ключ для webhook (измените на свой!)
const WEBHOOK_SECRET = 'enoterra_webhook_2024_secret_key';

app.post('/deploy', (req, res) => {
    console.log('🎯 Received webhook request');
    
    // Проверяем подпись GitHub
    const signature = req.headers['x-hub-signature-256'];
    if (signature) {
        const expectedSignature = 'sha256=' + crypto
            .createHmac('sha256', WEBHOOK_SECRET)
            .update(JSON.stringify(req.body))
            .digest('hex');
            
        if (signature !== expectedSignature) {
            console.log('❌ Invalid signature');
            return res.status(403).send('Forbidden');
        }
    }
    
    // Проверяем, что это push в нужную ветку
    if (req.body.ref === 'refs/heads/new-main') {
        console.log('🚀 Starting deployment...');
        
        // Выполняем деплой
        const deployScript = `
            cd /home/root/enoterra_erp && 
            echo "🔄 Pulling latest changes..." && 
            git pull origin new-main && 
            echo "📦 Installing dependencies..." && 
            npm install && 
            echo "🏗️ Building React app..." && 
            npm run build && 
            echo "📦 Installing server dependencies..." && 
            cd server && npm install --production && cd .. && 
            echo "🔄 Restarting PM2..." && 
            pm2 restart enoterra_erp && 
            echo "✅ Deployment completed!"
        `;
        
        exec(deployScript, (error, stdout, stderr) => {
            if (error) {
                console.error('❌ Deployment failed:', error);
                return res.status(500).send('Deployment failed');
            }
            
            console.log('✅ Deployment completed');
            console.log(stdout);
            res.send('Deployment successful');
        });
    } else {
        res.send('Not target branch');
    }
});

app.listen(3002, () => {
    console.log('🎣 Webhook server listening on port 3002');
});