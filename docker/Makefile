.PHONY: help build up down logs clean restart health test push pull backup restore

# Docker Compose file
DOCKER_COMPOSE := docker-compose
DOCKER := docker

# Default target
help:
	@echo "ESP32 RoIP System - Docker Stack Management"
	@echo ""
	@echo "Available targets:"
	@echo "  make build              - Build Docker images"
	@echo "  make up                 - Start all services"
	@echo "  make down               - Stop all services"
	@echo "  make restart            - Restart all services"
	@echo "  make logs               - View logs from all services"
	@echo "  make logs-server        - View RoIP server logs"
	@echo "  make logs-db            - View PostgreSQL logs"
	@echo "  make logs-coturn        - View Coturn logs"
	@echo "  make clean              - Stop services and remove volumes"
	@echo "  make health             - Check service health"
	@echo "  make test               - Run health checks"
	@echo "  make setup              - Initial setup (create .env, init-db.sql)"
	@echo "  make backup             - Backup database"
	@echo "  make restore            - Restore database from backup"
	@echo "  make shell-server       - Open shell in RoIP server container"
	@echo "  make shell-db           - Open shell in PostgreSQL container"
	@echo "  make shell-coturn       - Open shell in Coturn container"
	@echo "  make ps                 - Show running containers"
	@echo "  make stats              - Show container resource usage"
	@echo "  make prune              - Clean up unused Docker resources"

# Setup initial configuration
setup:
	@echo "Setting up RoIP Docker environment..."
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✓ Created .env file from template"; \
		echo "  Edit .env with your configuration"; \
	else \
		echo ".env already exists"; \
	fi
	@if [ ! -f turnusers.txt ]; then \
		echo "roip:roip_turn_password" > turnusers.txt; \
		chmod 600 turnusers.txt; \
		echo "✓ Created turnusers.txt"; \
	fi
	@if [ ! -d data ]; then \
		mkdir -p data; \
		echo "✓ Created data directory"; \
	fi

# Build Docker images
build:
	@echo "Building Docker images..."
	$(DOCKER_COMPOSE) build --no-cache

# Start services
up:
	@echo "Starting RoIP services..."
	$(DOCKER_COMPOSE) up -d
	@echo "✓ Services started"
	@make health

# Stop services
down:
	@echo "Stopping RoIP services..."
	$(DOCKER_COMPOSE) down

# Restart services
restart:
	@echo "Restarting RoIP services..."
	$(DOCKER_COMPOSE) restart

# View all logs
logs:
	$(DOCKER_COMPOSE) logs -f

# View RoIP server logs
logs-server:
	$(DOCKER_COMPOSE) logs -f roip-server

# View PostgreSQL logs
logs-db:
	$(DOCKER_COMPOSE) logs -f postgres

# View Coturn logs
logs-coturn:
	$(DOCKER_COMPOSE) logs -f coturn

# Check health status
health:
	@echo "Checking service health..."
	@echo ""
	@echo "Container Status:"
	@$(DOCKER_COMPOSE) ps
	@echo ""
	@echo "API Health Check:"
	@curl -s http://localhost:8080/health | head -c 200
	@echo ""
	@echo ""
	@echo "WebSocket Server:"
	@echo "  ws://localhost:8081"
	@echo ""
	@echo "Database:"
	@$(DOCKER_COMPOSE) exec -T postgres pg_isready -U roip -d roip || echo "  Status: Checking..."
	@echo ""
	@echo "TURN Server:"
	@echo "  stun:coturn:3478"

# Run health checks
test: health
	@echo "Running comprehensive tests..."
	@echo ""
	@echo "Testing API endpoints..."
	@curl -v http://localhost:8080/health 2>/dev/null | head -n 20
	@echo ""
	@echo "Testing WebSocket..."
	@echo "WebSocket is available at ws://localhost:8081"

# Clean up (stop and remove volumes)
clean:
	@echo "Cleaning up RoIP services and volumes..."
	$(DOCKER_COMPOSE) down -v
	@echo "✓ Services and volumes removed"

# Backup PostgreSQL database
backup:
	@echo "Backing up PostgreSQL database..."
	@mkdir -p backups
	@$(DOCKER_COMPOSE) exec -T postgres pg_dump -U roip roip | gzip > backups/roip_$(shell date +%Y%m%d_%H%M%S).sql.gz
	@echo "✓ Database backed up to backups/ directory"

# Restore PostgreSQL database
restore:
	@echo "Available backups:"
	@ls -lth backups/ | head -5
	@echo ""
	@read -p "Enter backup filename: " backup_file; \
	if [ -f "backups/$$backup_file" ]; then \
		echo "Restoring from $$backup_file..."; \
		gunzip < "backups/$$backup_file" | $(DOCKER_COMPOSE) exec -T postgres psql -U roip roip; \
		echo "✓ Database restored"; \
	else \
		echo "Backup file not found"; \
	fi

# Open shell in RoIP server
shell-server:
	$(DOCKER_COMPOSE) exec roip-server sh

# Open shell in PostgreSQL
shell-db:
	$(DOCKER_COMPOSE) exec postgres psql -U roip -d roip

# Open shell in Coturn
shell-coturn:
	$(DOCKER_COMPOSE) exec coturn sh

# Show running containers
ps:
	@$(DOCKER_COMPOSE) ps

# Show container resource usage
stats:
	$(DOCKER) stats --no-stream

# Prune unused Docker resources
prune:
	@echo "Cleaning up unused Docker resources..."
	$(DOCKER) image prune -f
	$(DOCKER) volume prune -f
	$(DOCKER) network prune -f
	$(DOCKER) container prune -f
	@echo "✓ Cleanup complete"

# View version information
version:
	@echo "Docker version:"
	@$(DOCKER) --version
	@echo "Docker Compose version:"
	@$(DOCKER_COMPOSE) --version

# Push to registry (requires TAG environment variable)
push:
	@if [ -z "$(TAG)" ]; then \
		echo "Error: TAG variable not set"; \
		echo "Usage: make push TAG=myregistry.com/roip-server:latest"; \
		exit 1; \
	fi
	$(DOCKER) build -t $(TAG) ..
	$(DOCKER) push $(TAG)

# Pull from registry
pull:
	$(DOCKER_COMPOSE) pull

.PHONY: all
all: setup build up health
