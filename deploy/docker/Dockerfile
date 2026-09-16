# LoveOS — production image (frontend build + Django/Gunicorn in one container)
# Django serves the built frontend itself (SERVE_FRONTEND=True), so a single
# container is enough; put a reverse proxy with TLS (Caddy/Nginx/Traefik) in front.

# ---- stage 1: build the frontend
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- stage 2: backend
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends \
        default-libmysqlclient-dev build-essential pkg-config curl cron \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt gunicorn mysqlclient
COPY backend/ backend/
COPY --from=frontend /app/frontend/dist frontend/dist
COPY deploy/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p backend/media backend/staticfiles
ENV SERVE_FRONTEND=True FRONTEND_DIST=/app/frontend/dist
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -fs http://127.0.0.1:8000/healthz || exit 1
ENTRYPOINT ["/entrypoint.sh"]
