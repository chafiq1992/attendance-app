#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────
#  deploy.sh  – One-shot CI/CD script for the Attendance App
#
#  • Builds & pushes Docker image
#  • Uploads / updates service-account key (as Base-64 text) in Secret Manager
#  • Deploys to Cloud Run with   GCP_SA_B64   &   GOOGLE_SHEET_ID   env-vars
#
#  Prerequisites:
#    ▸ gcloud CLI authenticated  ( gcloud auth login / gcloud init )
#    ▸ Billing & APIs: Artifact Registry, Cloud Run, Secret Manager, Cloud Build
#    ▸ ./service_account.json   (key for a SA with Sheets + Cloud Run roles)
#
#  Usage:
#    1.  Edit the “VARIABLES – EDIT ME” section.
#    2.  chmod +x deploy.sh
#    3.  ./deploy.sh
# ───────────────────────────────────────────────────────────────────
set -eo pipefail

# ╔════════════════════════════════════════════════════════════════╗
# ║           🔧  VARIABLES –––– EDIT THESE ONCE  🔧               ║
# ╚════════════════════════════════════════════════════════════════╝
PROJECT_ID="YOUR_GCP_PROJECT_ID"
REGION="us-central1"
APP_NAME="attendance-app"                        # Cloud Run service
REPO="apps"                                     # Artifact Registry repo name
IMAGE_NAME="attendance-app"
SERVICE_ACCOUNT="attendance-run-sa@${PROJECT_ID}.iam.gserviceaccount.com"

GOOGLE_SHEET_ID="YOUR_SHEET_ID_HERE"
SA_KEY_PATH="./service_account.json"            # Local key file
SECRET_NAME="attendance-sa-b64"                 # Secret Manager entry
# ══════════════════════════════════════════════════════════════════

echo "🔧  Setting active project to  ${PROJECT_ID} ..."
gcloud config set project "$PROJECT_ID" >/dev/null

# ── Ensure Artifact Registry repo exists ──────────────────────────
printf "📦  Checking Artifact Registry repo … "
if ! gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1; then
  echo "not found – creating."
  gcloud artifacts repositories create "$REPO" \
      --repository-format=docker \
      --location="$REGION" \
      --description="Docker images for ${APP_NAME}"
else
  echo "found."
fi

FULL_IMG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE_NAME}:$(git rev-parse --short HEAD)-$(date +%s)"

# ── Build & push container ───────────────────────────────────────
echo "🏗  Building and pushing image  ${FULL_IMG}"
gcloud builds submit --tag "${FULL_IMG}" .

# ── Base-64 encode key & store in Secret Manager ─────────────────
echo "🔐  Preparing Base-64 service-account key …"
SA_B64=$(base64 -w0 "${SA_KEY_PATH}")

printf "🔐  Uploading secret %s … " "$SECRET_NAME"
if gcloud secrets describe "$SECRET_NAME" >/dev/null 2>&1; then
  echo "adding new version."
  echo -n "$SA_B64" | gcloud secrets versions add "$SECRET_NAME" --data-file=-
else
  echo "creating."
  echo -n "$SA_B64" | gcloud secrets create "$SECRET_NAME" --data-file=-
fi

# ── Deploy to Cloud Run ──────────────────────────────────────────
echo "🚀  Deploying Cloud Run service  ${APP_NAME}"
gcloud run deploy "$APP_NAME" \
  --image "$FULL_IMG" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --service-account "$SERVICE_ACCOUNT" \
  --set-env-vars "GOOGLE_SHEET_ID=${GOOGLE_SHEET_ID}" \
  --update-secrets "GCP_SA_B64=${SECRET_NAME}:latest" \
  --port 8080

# ── Show service URL ─────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe "$APP_NAME" \
  --region "$REGION" --format='value(status.url)')
echo "✅  Deployed!  Open →  ${SERVICE_URL}?employee=Ali"
