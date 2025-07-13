#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────
#  deploy.sh  – One-shot CI/CD script for the Attendance App
#
#  • Builds & pushes Docker image
#  • Deploys to Cloud Run with the required Supabase environment variables
#
#  Prerequisites:
#    ▸ gcloud CLI authenticated  ( gcloud auth login / gcloud init )
#    ▸ Billing & APIs: Artifact Registry, Cloud Run, Cloud Build
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

# Supabase connection URL (optional convenience)
SUPABASE_URL="https://your-project.supabase.co"
# Postgres connection string; can point to Supabase
DATABASE_URL=""
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


# ── Deploy to Cloud Run ──────────────────────────────────────────
echo "🚀  Deploying Cloud Run service  ${APP_NAME}"
gcloud run deploy "$APP_NAME" \
  --image "$FULL_IMG" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --service-account "$SERVICE_ACCOUNT" \
  --set-env-vars "DATABASE_URL=${DATABASE_URL},SUPABASE_URL=${SUPABASE_URL}" \
  --port 8080

# ── Show service URL ─────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe "$APP_NAME" \
  --region "$REGION" --format='value(status.url)')
echo "✅  Deployed!  Open →  ${SERVICE_URL}?employee=Ali"
