#!/bin/bash

echo "🚀 Starting Enoterra ERP in production mode..."

# Navigate to application directory
cd /home/$USER/enoterra_erp

# Check if application directory exists
if [ ! -d "/home/$USER/enoterra_erp" ]; then
    echo "❌ Application directory not found!"
    echo "Please deploy the application first using GitHub Actions"
    exit 1
fi

# Check if server directory exists
if [ ! -d "/home/$USER/enoterra_erp/server" ]; then
    echo "❌ Server directory not found!"
    echo "Please check if the deployment was successful"
    exit 1
fi

# Install dependencies if needed
echo "📦 Installing dependencies..."
npm install --production
cd server && npm install --production
cd ..

# Create logs directory
mkdir -p logs

# Initialize database if needed
echo "🗄️ Checking database..."
if [ ! -f "server/enoterra_erp.db" ]; then
    echo "📊 Initializing database..."
    if [ -f "server/clean_database.mjs" ]; then
        cd server && node clean_database.mjs && cd ..
    else
        echo "⚠️ clean_database.mjs not found, creating empty database"
        touch server/enoterra_erp.db
    fi
else
    echo "✅ Database already exists"
fi

# Run database migrations
echo "🔄 Running database migrations..."
if [ -f "server/database_migrations.mjs" ]; then
    cd server && node database_migrations.mjs && cd ..
else
    echo "⚠️ No database migrations found"
fi

# Start application with PM2
echo "⚡ Starting application with PM2..."
if command -v pm2 &> /dev/null; then
    # Stop existing process if running
    pm2 stop enoterra_erp 2>/dev/null || true
    pm2 delete enoterra_erp 2>/dev/null || true
    
    # Start new process
    pm2 start ecosystem.config.js
    
    # Save PM2 configuration
    pm2 save
    
    echo "✅ Application started successfully!"
    echo ""
    echo "📊 PM2 Status:"
    pm2 status
    
    echo ""
    echo "📋 Useful commands:"
    echo "- View logs: pm2 logs enoterra_erp"
    echo "- Restart: pm2 restart enoterra_erp"
    echo "- Stop: pm2 stop enoterra_erp"
    echo "- Monitor: pm2 monit"
    
    echo ""
    echo "🌐 Application should be available at: https://erp.enoterra.pl"
    
else
    echo "❌ PM2 not found! Please install PM2 first:"
    echo "sudo npm install -g pm2"
    exit 1
fi 