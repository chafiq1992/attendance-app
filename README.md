# Attendance App

A lightweight Flask application for tracking employee attendance backed by a
Postgres database. You can point `DATABASE_URL` at any Postgres host, including
Supabase which is used purely as a managed Postgres provider. Employees can check in, start breaks, log
work outcomes and more, all via a simple web UI.

## Required Environment Variables

Set up the backend with a Postgres connection string:

- `DATABASE_URL` – Postgres connection string. This can point to any
  reachable database instance and may reference Supabase's Postgres service.
- `SUPABASE_URL` – optional shorthand containing just the Supabase project URL
  if you prefer not to embed credentials in `DATABASE_URL`.

## Running Locally

### Backend

1. Install Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

2. Export the environment variables:

   ```bash
   export DATABASE_URL=postgresql://user:pass@localhost/dbname
   export SUPABASE_URL=https://your-project.supabase.co  # optional convenience
   ```

3. Start the server:

   ```bash
   gunicorn --bind 0.0.0.0:8080 app:server
   ```

Visit `https://<your-cloud-run-url>/?employee=YourName` to interact with the app.
The FastAPI API is mounted under `/api`, e.g. `https://<your-cloud-run-url>/api/events`.

All other GET routes that don't begin with `/api`, `/attendance`, `/payout` or
`/healthz` return the compiled React app from `frontend/dist/index.html`. This
allows bookmarking URLs like `/admin-dashboard` or `/employee-dashboard` when
deploying the single page app.

### Frontend

The React frontend lives in the `frontend/` directory.

```bash
cd frontend
npm install
npm run dev     # development mode
npm run build   # production build
```

During development the Vite dev server serves the app on `http://localhost:5173`
and API requests are sent to the backend running on `http://localhost:8080`.
When deploying, the Dockerfile builds the frontend and copies the compiled
files from `frontend/dist` into the final image so the backend can serve them
directly. No manual npm commands are needed in the deployment pipeline.

## Deploying

The `deploy.sh` script builds a Docker image and deploys it to Cloud Run. Edit the
variables at the top of the script, then run:

```bash
chmod +x deploy.sh
./deploy.sh
```

The script sets the `DATABASE_URL` (and optionally `SUPABASE_URL`) environment
variables for the Cloud Run service.
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

