#!/bin/bash

echo "🚀 Setting up production server for erp.enoterra.pl..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
echo "📦 Installing required packages..."
sudo apt install -y nginx certbot python3-certbot-nginx curl

# Create application directory
echo "📁 Creating application directory..."
mkdir -p /home/$USER/enoterra_erp/logs
mkdir -p /home/$USER/enoterra_erp/server/uploads
mkdir -p /home/$USER/enoterra_erp/server/fonts

# Install Node.js if not installed
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "✅ Node.js already installed"
fi

# Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    sudo npm install -g pm2
else
    echo "✅ PM2 already installed"
fi

# Configure Nginx
echo "🌐 Configuring Nginx..."
sudo cp nginx.conf /etc/nginx/sites-available/erp.enoterra.pl
sudo ln -sf /etc/nginx/sites-available/erp.enoterra.pl /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
echo "🔍 Testing Nginx configuration..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Nginx configuration is valid"
    sudo systemctl restart nginx
    sudo systemctl enable nginx
else
    echo "❌ Nginx configuration has errors"
    exit 1
fi

# Setup SSL certificate
echo "🔒 Setting up SSL certificate..."
sudo certbot --nginx -d erp.enoterra.pl -d www.erp.enoterra.pl --non-interactive --agree-tos --email admin@enoterra.pl

# Setup PM2 startup
echo "⚡ Setting up PM2 startup..."
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp /home/$USER

echo "✅ Production server setup completed!"
echo ""
echo "📋 Next steps:"
echo "1. Deploy your application using GitHub Actions"
echo "2. Start the application: pm2 start ecosystem.config.js"
echo "3. Save PM2 configuration: pm2 save"
echo "4. Check logs: pm2 logs enoterra_erp"
echo ""
echo "🌐 Your application will be available at: https://erp.enoterra.pl" 