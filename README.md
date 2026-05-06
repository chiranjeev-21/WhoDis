# WhoDis
A fun project built to solve a very real problem: when a group of friends goes on a long trip and all the photos get mixed up — WhoDis helps you instantly find all the photos you’re in, so you can post to Instagram, Facebook, Snapchat, or even Tinder without the chaos.

Current architecture:
- `ui/` is the Next.js frontend.
- `api/` is the FastAPI service.
- Jobs run inside the API service via FastAPI background tasks.
- Local SQLite is the default database, so Postgres/Render/Vercel are not required.
- Images are downloaded from Google Drive for local processing, cleaned up as each file finishes, and optional ZIP downloads are removed after download.
- Matching now uses confident face matches first, then local semantic fallback for likely partial-face, back-turned, or face-hidden photos. Crowd scenes reject body-only guesses unless a face/partial-face match is present.
- Matched originals are cached locally during scanning, so ZIP creation no longer re-downloads every match from Drive for new jobs.

Run locally:

```bash
./start-local.sh
```

Open `http://localhost:3000`.

[GenAI Ref](https://chatgpt.com/share/696f653e-d9b8-800a-8cc3-f7a1e60de456)

[Further Plans](https://chatgpt.com/share/696f6735-b254-800a-b339-edb5aa2810de)
