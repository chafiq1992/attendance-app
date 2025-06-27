FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app /app/app
COPY static /app/static
COPY backend/gunicorn_conf.py .

EXPOSE 8080
CMD ["gunicorn", "-c", "gunicorn_conf.py", "app.main:app"]
