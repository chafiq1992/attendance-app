# Attendance App

A lightweight Flask application for tracking employee attendance backed by a
Postgres database (for example on Supabase). Employees can check in, start
breaks, log work outcomes and more, all via a simple web UI.

## Required Environment Variables

The app pulls configuration from a few environment variables:

- `SUPABASE_URL` – Postgres connection string.
- `SUPABASE_KEY` – service API key for Supabase (if required).
- `DATABASE_URL` – optional Postgres connection string overriding
  `SUPABASE_URL`.

## Running Locally

### Backend

1. Install Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

2. Export the environment variables:

   ```bash
   export SUPABASE_URL=postgresql://user:pass@localhost/dbname
   export SUPABASE_KEY=your_service_key
   ```

3. Start the server:

   ```bash
   gunicorn --bind 0.0.0.0:8080 app:server
   ```

Visit `https://<your-cloud-run-url>/?employee=YourName` to interact with the app.
The FastAPI API is mounted under `/api`, e.g. `https://<your-cloud-run-url>/api/events`.

### Frontend

The React frontend lives in the `frontend/` directory. To start the Vite dev
server:

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `https://<your-cloud-run-url>`.

## Deploying

The `deploy.sh` script builds a Docker image and deploys it to Cloud Run. Edit the
variables at the top of the script, then run:

```bash
chmod +x deploy.sh
./deploy.sh
```

The script uploads the service account key to Secret Manager and sets the
`SUPABASE_URL` and `SUPABASE_KEY` variables for the Cloud Run service.
The script prints the service URL when deployment completes. Use that
`https://<your-cloud-run-url>` to access the app. The FastAPI API will be
reachable under `/api` on the deployed URL.

## Database Migrations

Alembic manages schema changes. To apply the latest migrations run:

```bash
alembic upgrade head
```

To undo the most recent migration:

```bash
alembic downgrade -1
```

## Running Tests

The test suite spins up a temporary Postgres 15 container using `testcontainers`.
Install the extra testing dependencies and run `pytest` with coverage:

```bash
pip install -r requirements.txt -r requirements-dev.txt
pip install httpx
pytest --cov
```

Coverage should report at least 80%.
