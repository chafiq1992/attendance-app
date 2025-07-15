FROM python:3.11-slim

# Install Node.js 18
RUN apt-get update \
    && apt-get install -y curl gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/attendance-app

COPY requirements.txt requirements.txt
COPY requirements-dev.txt requirements-dev.txt
RUN pip install --no-cache-dir -r requirements.txt -r requirements-dev.txt

# Install frontend dependencies
COPY frontend/package.json frontend/package.json
RUN npm install --prefix frontend

CMD ["bash"]
