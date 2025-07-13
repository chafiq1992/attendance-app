# Attendance App

A lightweight Flask application for tracking employee attendance backed by a
Postgres database hosted on Supabase. Employees can check in, start breaks, log
work outcomes and more, all via a simple web UI.

## Required Environment Variables

Configure the backend with your Supabase credentials using these variables:

- `SUPABASE_URL` – URL of your Supabase project.
- `SUPABASE_KEY` – service API key for the project.
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
   export SUPABASE_URL=https://your-project.supabase.co
   export SUPABASE_KEY=your_service_key
   export DATABASE_URL=postgresql://user:pass@localhost/dbname  # optional
   ```

3. Start the server:

   ```bash
   gunicorn --bind 0.0.0.0:8080 app:server
   ```

Visit `https://<your-cloud-run-url>/?employee=YourName` to interact with the app.
The FastAPI API is mounted under `/api`, e.g. `https://<your-cloud-run-url>/api/events`.

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
When deploying, the backend will serve the compiled files from
`frontend/dist` so the frontend and API share the same URL.

## Deploying

The `deploy.sh` script builds a Docker image and deploys it to Cloud Run. Edit the
variables at the top of the script, then run:

```bash
chmod +x deploy.sh
./deploy.sh
```

The script sets the `SUPABASE_URL`, `SUPABASE_KEY` and `DATABASE_URL`
environment variables for the Cloud Run service.
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
