.PHONY: dev setup migrate seed clean help

# Default target
help:
	@echo "Available commands:"
	@echo "  make dev      - Start development server with all services"
	@echo "  make setup    - Run migrations and seed database"
	@echo "  make migrate  - Run database migrations"
	@echo "  make seed     - Seed database with demo data"
	@echo "  make clean    - Clean build artifacts"

# Start development environment
dev:
	@echo "🚀 Starting development environment..."
	@echo ""
	@echo "Checking prerequisites..."
	@command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed."; exit 1; }
	@command -v npm >/dev/null 2>&1 || { echo "❌ npm is required but not installed."; exit 1; }
	@echo "✓ Node.js and npm found"
	@echo ""
	@echo "Starting Remix development server..."
	@echo "Note: Ensure DATABASE_URL and DATABASE_URL are set in .env"
	@echo ""
	@npm run dev

# Run setup (migrations + seed)
setup:
	@echo "🔧 Running setup..."
	@npm run setup

# Run migrations only
migrate:
	@echo "📦 Running migrations..."
	@tsx app/lib/db/migrate.ts

# Seed database
seed:
	@echo "🌱 Seeding database..."
	@tsx scripts/seed-database.ts

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	@rm -rf build
	@rm -rf .react-router
	@rm -rf node_modules/.cache
	@echo "✓ Clean complete"

