.PHONY: up down dev install db k8s-build k8s-deploy k8s-forward k8s-status k8s-delete

up:
	docker compose up --build

down:
	docker compose down

db:
	docker compose up postgres -d

install:
	pnpm install
	pnpm --filter @olliveai/inference-sdk build

dev:
	@echo "Run in separate terminals:"
	@echo "  make db && docker compose up redis -d"
	@echo "  cd apps/ingestion-api && uvicorn main:app --reload --port 8001"
	@echo "  cd apps/ingestion-api && python worker.py"
	@echo "  pnpm --filter @olliveai/chat-api dev"
	@echo "  pnpm --filter @olliveai/web dev"

k8s-build:
	./scripts/build-images.sh

k8s-deploy:
	@test -f k8s/overlays/local/secret.yaml || (echo "Run: cp k8s/overlays/local/secret.example.yaml k8s/overlays/local/secret.yaml && edit keys" && exit 1)
	kubectl apply -k k8s/overlays/local

k8s-forward:
	kubectl -n olliveai port-forward svc/web 8080:80

k8s-status:
	kubectl -n olliveai get pods,svc

k8s-delete:
	kubectl delete -k k8s/overlays/local
