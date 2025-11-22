#!/bin/bash
# User Data Script for RoIP EC2 Instances
# Automatically configures and starts the RoIP application

set -e

# Update system
apt-get update
apt-get upgrade -y

# Install dependencies
apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    python3-pip \
    awscli \
    jq

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Install PM2
npm install -g pm2

# Create application user
useradd -m -s /bin/bash roip

# Create application directories
mkdir -p /opt/roip/{releases,shared,shared/logs,shared/data,shared/recordings}
chown -R roip:roip /opt/roip

# Download and deploy application
cd /opt/roip/releases
RELEASE_VERSION=$(date +%Y%m%d%H%M%S)
mkdir -p $RELEASE_VERSION
cd $RELEASE_VERSION

# Clone from S3 or Git (adjust as needed)
# aws s3 cp s3://roip-releases/latest.tar.gz - | tar xz

# For this example, we'll use a placeholder
echo "Application deployment placeholder"
# In production, fetch the actual application code here

# Create configuration
cat > /opt/roip/releases/$RELEASE_VERSION/.env << EOF
NODE_ENV=${environment}
DB_HOST=${db_host}
DB_NAME=${db_name}
DB_USER=${db_user}
DB_PASSWORD=${db_password}
REDIS_HOST=${redis_endpoint}
REDIS_PORT=6379
EOF

chmod 600 /opt/roip/releases/$RELEASE_VERSION/.env

# Create symlink to current release
ln -sfn /opt/roip/releases/$RELEASE_VERSION /opt/roip/current

# Install dependencies
cd /opt/roip/current
npm ci --production

# Run migrations
node src/migrations/migrate.js up || true

# Start application with PM2
su - roip -c "cd /opt/roip/current && pm2 start src/server.js --name roip-server -i max --env ${environment}"
su - roip -c "pm2 save"

# Setup PM2 startup
env PATH=$PATH:/usr/bin pm2 startup systemd -u roip --hp /home/roip

# Configure CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
dpkg -i amazon-cloudwatch-agent.deb

cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'CWCONFIG'
{
  "metrics": {
    "namespace": "RoIP/Application",
    "metrics_collected": {
      "cpu": {
        "measurement": [
          {
            "name": "cpu_usage_idle",
            "rename": "CPU_IDLE",
            "unit": "Percent"
          }
        ],
        "metrics_collection_interval": 60
      },
      "disk": {
        "measurement": [
          {
            "name": "used_percent",
            "rename": "DISK_USED",
            "unit": "Percent"
          }
        ],
        "metrics_collection_interval": 60,
        "resources": [
          "*"
        ]
      },
      "mem": {
        "measurement": [
          {
            "name": "mem_used_percent",
            "rename": "MEM_USED",
            "unit": "Percent"
          }
        ],
        "metrics_collection_interval": 60
      }
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/opt/roip/shared/logs/*.log",
            "log_group_name": "/aws/roip/${environment}",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
CWCONFIG

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -s \
    -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

echo "RoIP application deployed successfully"
