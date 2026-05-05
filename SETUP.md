# WhoDis Local Setup

WhoDis now runs locally: Next.js UI on port `3000`, FastAPI on port `8000`, and a SQLite database file in `api/whodis.db`. Photos are downloaded from Google Drive only for processing, saved under `api/local_data/temp`, and deleted after each processing step. Prepared ZIP downloads are also deleted after they are sent.

## 1. Google Drive Access

1. Enable the Google Drive API in a Google Cloud project.
2. Create a service account and download its JSON key.
3. Put the JSON file at `api/service-account.json`.
4. Share the Google Drive input folders with the service account email.

The app reads from shared Drive folders. It does not need Render, Vercel, hosted Postgres, Redis, or Celery.

## 2. Environment

Copy the local template if `.env` does not exist:

```bash
cp api/.env.example api/.env
```

Important local defaults:

```bash
DATABASE_URL=sqlite:///./whodis.db
GOOGLE_SERVICE_ACCOUNT_FILE=service-account.json
CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
CORS_ORIGIN_REGEX=
TEMP_STORAGE_PATH=./local_data/temp
MAX_IMAGES_PER_JOB=1000
```

Tune `MAX_IMAGES_PER_JOB`, `MAX_CONCURRENT_JOBS`, `MAX_IMAGE_DIMENSION`, and `MATCH_THRESHOLD` based on your machine.

## 3. Run Locally

From the repo root:

```bash
./start-local.sh
```

Then open:

```text
http://localhost:3000
```

The API health check is:

```text
http://localhost:8000
```

## 4. Docker Option

If you prefer Docker:

```bash
docker compose up --build
```

This starts the same local UI and API without a Postgres container. Runtime data stays in `api/local_data`.

## 5. Cleanup

Automatic cleanup covers:

- Selfies after job processing
- Downloaded Drive images after each image is scanned
- ZIP archives after they are downloaded
- Social Studio extraction directories after analysis

Manual cleanup is safe when servers are stopped:

```bash
rm -rf api/local_data/temp
```

Keep `api/service-account.json` and `api/.env` private. They are ignored by git.
