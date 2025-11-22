# RoIP Docker - Quick Start Guide

## 30-Second Setup

```bash
cd /home/user/MMDVM/docker
./start.sh
```

That's it! The script handles everything.

## 2-Minute Manual Setup

```bash
# Copy environment template
cp .env.example .env

# Edit configuration (change passwords!)
nano .env

# Start services
docker-compose up -d

# Verify it's running
docker-compose ps
```

## Access Your Services

After startup (wait 15-30 seconds for services to be ready):

### REST API
```
http://localhost:8080
GET /health - Health check
```

### WebSocket
```
ws://localhost:8081 - Real-time updates
```

### SIP Server
```
sip:localhost:5060 - SIP signaling
```

### Database
```
Host: localhost
Port: 5432
Database: roip
User: roip
Password: (from .env)
```

### TURN/STUN
```
Server: localhost
Port: 3478
Username: roip
Password: (from .env)
```

## Common Commands

```bash
# View logs
docker-compose logs -f roip-server

# Stop services
docker-compose down

# Restart services
docker-compose restart

# Check health
docker-compose exec postgres psql -U roip -d roip -c "SELECT version();"

# Backup database
docker-compose exec postgres pg_dump -U roip roip | gzip > backup.sql.gz

# List containers
docker-compose ps
```

## Troubleshooting

### Services won't start
```bash
# Check logs
docker-compose logs

# Check port conflicts
netstat -tulpn | grep -E '(5060|8080|8081|3478|5432)'
```

### Can't connect to API
```bash
# Wait longer (services may still be starting)
sleep 30
curl http://localhost:8080/health

# Check container is running
docker-compose ps roip-server
```

### Database connection error
```bash
# Check PostgreSQL logs
docker-compose logs postgres

# Verify database is ready
docker-compose exec postgres pg_isready -U roip
```

## Essential Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Service orchestration |
| `Dockerfile` | RoIP server image definition |
| `.env` | Configuration (create from .env.example) |
| `init-db.sql` | Database schema |
| `coturn.conf` | TURN server configuration |
| `start.sh` | Automated setup script |
| `Makefile` | Quick commands (make help) |
| `README.md` | Detailed guide |
| `DEPLOYMENT.md` | Production deployment guide |

## Using Make Commands

```bash
# Setup and start everything
make all

# Show available commands
make help

# Start services
make up

# Stop services
make down

# View logs
make logs

# Check health
make health

# Backup database
make backup

# Open database shell
make shell-db
```

## Important Security Notes

1. **Change all passwords** in `.env` before production:
   - DB_PASSWORD
   - JWT_SECRET
   - TURN_PASSWORD

2. **Generate strong secrets**:
   ```bash
   openssl rand -base64 32    # JWT_SECRET
   openssl rand -base64 24    # Passwords
   ```

3. **Restrict CORS** in production:
   - Change `API_CORS_ORIGINS` from `*` to your domain

4. **Use HTTPS** in production:
   - Set TLS_CERT_PATH and TLS_KEY_PATH

5. **Change default admin**:
   - Edit init-db.sql before first run, or change after startup

## Next Steps

- Read `README.md` for detailed documentation
- Read `DEPLOYMENT.md` for production setup
- Update `.env` with your configuration
- Test API: `curl http://localhost:8080/health`
- View logs: `docker-compose logs -f`
- Create firewall rules for external access

## Need Help?

- Check logs: `docker-compose logs [service-name]`
- Review DEPLOYMENT.md Troubleshooting section
- Check container health: `docker-compose ps`
- Run health checks: `make health`

---

**For production deployment, see DEPLOYMENT.md**
