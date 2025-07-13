# ---------- 1. build frontend ----------
FROM node:18 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---------- 2. backend base image ----------
FROM python:3.11-slim

# ---------- 2. env & deps ----------
ENV PYTHONUNBUFFERED=1 \
    TZ=Africa/Casablanca \
    PORT=8080
# This image expects DATABASE_URL to be provided at runtime

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---------- 3. copy source ----------
COPY . .
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# ---------- 4. non-root user for Cloud Run ----------
RUN adduser --disabled-password --gecos '' appuser \
 && chown -R appuser /app
USER appuser

CMD ["gunicorn", "--bind", "0.0.0.0:8080", "app:server"]
