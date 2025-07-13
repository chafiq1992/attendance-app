# Attendance App

A lightweight Flask application for tracking employee attendance. Each employee
has their own sheet/tab inside a Google Sheets spreadsheet. Employees can check
in, start breaks, log work outcomes, and more, all via a simple web UI.

## Required Environment Variables

The app pulls configuration from a few environment variables:

- `GOOGLE_SHEET_ID` – ID of the Google Sheet that stores attendance data.
- `GCP_SA_B64` – Base64-encoded service account JSON with access to the sheet.
- `DATABASE_URL` – Postgres connection string used by `db.get_engine()`.

## Running Locally

### Backend

1. Install Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

2. Export the environment variables:

   ```bash
   export GOOGLE_SHEET_ID=your_spreadsheet_id
   export GCP_SA_B64=$(base64 -w0 service_account.json)
   export DATABASE_URL=postgresql://user:pass@localhost/dbname
   ```

3. Start the server:

   ```bash
   gunicorn --bind 0.0.0.0:8080 app:server
   ```

Visit `http://localhost:8080/?employee=YourName` to interact with the app.

### Frontend

The React frontend lives in the `frontend/` directory. To start the Vite dev
server:

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:3000`.

## Deploying

The `deploy.sh` script builds a Docker image and deploys it to Cloud Run. Edit the
variables at the top of the script, then run:

```bash
chmod +x deploy.sh
./deploy.sh
```

The script uploads the service account key to Secret Manager and sets the
`GOOGLE_SHEET_ID`, `GCP_SA_B64`, and `DATABASE_URL` variables for the Cloud Run
service.
