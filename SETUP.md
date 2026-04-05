# WhoDis - Complete Setup Guide
## Get Your Face Recognition Service Running in 30 Minutes

---

## 📋 What You'll Build

A web service where users:
1. Paste a Google Drive folder link (with photos)
2. Take a selfie using their camera
3. Get all photos with their face organized in a new Drive folder

**Tech:** Next.js UI + FastAPI API + Celery workers + InsightFace AI

**Deployment:** Render (API) + Vercel (UI) = **FREE**

---

## 🎯 Part 1: Google Drive Setup (5 minutes)

### Step 1.1: Create Google Cloud Project

1. Go to https://console.cloud.google.com
2. Click project dropdown (top left) → "New Project"
3. Name: `WhoDis`
4. Click "Create"
5. Wait for project to be created (you'll see notification)

### Step 1.2: Enable Google Drive API

1. In the search bar at top, type: `Google Drive API`
2. Click on "Google Drive API"
3. Click blue "ENABLE" button
4. Wait for it to enable

### Step 1.3: Create Service Account

1. In left menu: "APIs & Services" → "Credentials"
2. Click "Create Credentials" (top) → "Service Account"
3. **Service account details:**
   - Name: `whodis-service`
   - ID: (auto-filled)
   - Click "CREATE AND CONTINUE"
4. **Grant access (skip):**
   - Click "CONTINUE" (don't select any role)
5. **Grant users access (skip):**
   - Click "DONE"

### Step 1.4: Create Service Account Key

1. You'll see your service account in the list
2. Click on the service account email (something like `whodis-service@whodis-xxxxx.iam.gserviceaccount.com`)
3. Go to "KEYS" tab
4. Click "ADD KEY" → "Create new key"
5. Choose "JSON"
6. Click "CREATE"
7. **A JSON file downloads** - SAVE THIS FILE!
8. **Open the JSON file** and COPY the service account email:
   ```json
   {
     "client_email": "whodis-service@whodis-xxxxx.iam.gserviceaccount.com"
   }
   ```
   Copy this email - you'll need it next!

### Step 1.5: Create Output Folder in Your Drive

1. Go to https://drive.google.com
2. Click "New" → "Folder"
3. Name it: `WhoDis Results`
4. Right-click the folder → "Share"
5. In "Add people and groups", paste the service account email you copied
6. Change permission to "Editor"
7. **Uncheck** "Notify people"
8. Click "Share"
9. Click "Share anyway" (it's a service account, not a person)
10. **Copy the folder ID:**
    - Look at the URL: `https://drive.google.com/drive/folders/XXXXXXXXXXXXX`
    - Copy the XXXXXXXXXXXXX part
    - This is your FOLDER_ID - save it!

**✅ You now have:**
- ✓ Service account JSON file (downloaded)
- ✓ Service account email
- ✓ Drive folder ID

---

## 🎯 Part 2: Push Code to GitHub (5 minutes)

### Step 2.1: Extract the ZIP

```bash
# Extract the downloaded ZIP
unzip WhoDis.zip
cd WhoDis
```

### Step 2.2: Initialize Git

```bash
git init
git add .
git commit -m "Initial commit"
```

### Step 2.3: Create GitHub Repository

1. Go to https://github.com
2. Click "+" (top right) → "New repository"
3. Name: `whodis`
4. Make it **Public** (required for free Render)
5. DON'T initialize with README
6. Click "Create repository"

### Step 2.4: Push Code

GitHub will show you commands. Run these:

```bash
git remote add origin https://github.com/YOUR_USERNAME/whodis.git
git branch -M main
git push -u origin main
```

**✅ Code is now on GitHub!**

---

## 🎯 Part 3: Deploy API to Render (15 minutes)

### Step 3.1: Create Render Account

1. Go to https://render.com
2. Click "Get Started for Free"
3. Sign up with GitHub (click "GitHub" button)
4. Authorize Render to access your repos

### Step 3.2: Create PostgreSQL Database

1. Click "New +" (top right) → "PostgreSQL"
2. Fill in:
   - Name: `whodis-db`
   - Database: `whodis`
   - User: `whodis_user`
   - Region: Choose closest to you (e.g., Oregon USA, Frankfurt EU)
   - Plan: **Free**
3. Click "Create Database"
4. Wait for it to create (~30 seconds)
5. **COPY** the "Internal Database URL" (looks like `postgresql://whodis_user:xxxxx@...`)
   - Save this somewhere - you'll need it multiple times!

### Step 3.3: Create Redis

1. Click "New +" → "Redis"
2. Fill in:
   - Name: `whodis-redis`
   - Region: **Same as database**
   - Plan: **Free**
3. Click "Create Redis"
4. Wait for it to create
5. **COPY** the "Internal Redis URL" (looks like `redis://red-xxxxx:6379`)
   - Save this too!

### Step 3.4: Create Web Service (API)

1. Click "New +" → "Web Service"
2. Click "Build and deploy from a Git repository"
3. Click "Next"
4. Find your `whodis` repository and click "Connect"
5. Fill in:
   - **Name:** `whodis-api`
   - **Region:** Same as database/redis
   - **Branch:** `main`
   - **Root Directory:** `api`
   - **Runtime:** `Python 3`
   - **Build Command:** 
     ```
     pip install -r requirements.txt
     ```
   - **Start Command:**
     ```
     uvicorn main:app --host 0.0.0.0 --port $PORT
     ```
   - **Plan:** Free

6. Scroll down to **Environment Variables**
7. Click "Add Environment Variable" for EACH of these:

   **DATABASE_URL**
   ```
   <paste your PostgreSQL Internal URL here>
   ```

   **REDIS_URL**
   ```
   <paste your Redis Internal URL here>
   ```

   **CELERY_BROKER_URL**
   ```
   <paste your Redis Internal URL here>
   ```

   **CELERY_RESULT_BACKEND**
   ```
   <paste your Redis Internal URL here>
   ```

   **GOOGLE_SERVICE_ACCOUNT_JSON**
   ```
   <open your downloaded service account JSON file, copy ENTIRE contents and paste here>
   ```

   **GOOGLE_DRIVE_OUTPUT_FOLDER_ID**
   ```
   <paste your Drive folder ID here>
   ```

   **CORS_ORIGINS**
   ```
   ["http://localhost:3000"]
   ```
   (We'll update this after Vercel deployment)

   **DEBUG**
   ```
   false
   ```

   **MAX_IMAGES_PER_JOB**
   ```
   200
   ```

   **MATCH_THRESHOLD**
   ```
   0.4
   ```

8. Click "Create Web Service"
9. Wait for deployment (~5-10 minutes)
10. When it says "Live", **COPY your API URL** (looks like `https://whodis-api.onrender.com`)

### Step 3.5: Create Background Worker

1. Click "New +" → "Background Worker"
2. Click "Build and deploy from a Git repository"
3. Click "Next"
4. Find your `whodis` repository and click "Connect"
5. Fill in:
   - **Name:** `whodis-worker`
   - **Region:** Same as others
   - **Branch:** `main`
   - **Root Directory:** `api`
   - **Runtime:** `Python 3`
   - **Build Command:**
     ```
     pip install -r requirements.txt
     ```
   - **Start Command:**
     ```
     celery -A tasks worker --loglevel=info --concurrency=2
     ```
   - **Plan:** Free

6. **Environment Variables:** Copy ALL the same variables from Step 3.4 (all of them!)
7. Click "Create Background Worker"
8. Wait for deployment

### Step 3.6: Initialize Database

1. Go to your `whodis-api` service (the Web Service)
2. Click "Shell" tab (in the left menu)
3. Wait for shell to connect
4. Type this command and press Enter:
   ```bash
   python database.py
   ```
5. You should see: "✓ Database tables created"

### Step 3.7: Test API

Open a new browser tab and go to:
```
https://whodis-api.onrender.com
```

You should see:
```json
{"service":"WhoDis API","status":"running","version":"1.0.0"}
```

**✅ API is live!**

---

## 🎯 Part 4: Deploy UI to Vercel (5 minutes)

### Step 4.1: Create Vercel Account

1. Go to https://vercel.com
2. Click "Sign Up"
3. Click "Continue with GitHub"
4. Authorize Vercel

### Step 4.2: Deploy Project

1. Click "Add New..." → "Project"
2. Find your `whodis` repository
3. Click "Import"
4. **IMPORTANT:** Change "Root Directory"
   - Click "Edit" next to Root Directory
   - Select `ui`
   - Click "Continue"
5. Framework Preset: **Next.js** (should auto-detect)
6. **Environment Variables:**
   Click "Add" and enter:
   
   **Name:**
   ```
   NEXT_PUBLIC_API_URL
   ```
   
   **Value:**
   ```
   https://whodis-api.onrender.com
   ```
   (Use your actual API URL from Step 3.4)

7. Click "Deploy"
8. Wait for deployment (~2-3 minutes)
9. When done, you'll see "🎉" - click "Continue to Dashboard"
10. **COPY your UI URL** (looks like `https://whodis-ui-xxxxx.vercel.app`)

### Step 4.3: Update CORS in API

1. Go back to Render dashboard
2. Click on `whodis-api` service
3. Click "Environment" (left menu)
4. Find `CORS_ORIGINS` variable
5. Click "Edit" (pencil icon)
6. Change value to:
   ```
   ["https://whodis-xxxxx.vercel.app"]
   ```
   (Use your actual Vercel URL)
7. Click "Save Changes"
8. Service will automatically redeploy (wait ~2 minutes)

**✅ UI is live!**

---

## 🎯 Part 5: Test Everything (5 minutes)

### Step 5.1: Prepare Test Photos

1. Create a new folder in YOUR Google Drive
2. Add 5-10 photos that have YOUR face in them
3. Right-click folder → "Share"
4. Click "Change to anyone with the link"
5. Make sure it says "Anyone with the link" can **Viewer**
6. Click "Copy link"

### Step 5.2: Test the Service

1. Go to your Vercel URL (e.g., `https://whodis-xxxxx.vercel.app`)
2. **Step 1: Paste your Drive folder link**
   - The link you just copied
3. **Step 2: Take selfie**
   - Click "Open Camera"
   - Allow camera access
   - Make sure your face is clearly visible
   - Click "Capture"
4. **Step 3: Enter email (optional)**
   - You can skip this
5. Click "🚀 Find My Photos"
6. **Processing page:**
   - May take 30 seconds to start (free tier wakes up)
   - Watch the progress bar
   - Should process each image
7. **Results page:**
   - Should show "Found X photos!"
   - Click "Open in Google Drive"
   - Check your "WhoDis Results" folder
   - There should be a new folder with your photos!

### Step 5.3: Verify Results

Go to your Google Drive:
1. Open "WhoDis Results" folder
2. You should see a new folder (named like `WhoDis_Job_xxxxx`)
3. Inside should be copies of all photos with your face!

**✅ IT WORKS!**

---

## 🐛 Troubleshooting

### Problem: "Service Unavailable" when submitting

**Cause:** Free tier services sleep after 15 minutes of inactivity

**Solution:** 
- Wait 30-60 seconds
- Refresh the page
- Try again
- The first request wakes up the service

### Problem: "Failed to access Drive folder"

**Cause:** Folder not publicly accessible

**Solution:**
1. Open your Drive folder
2. Right-click → Share
3. Change to "Anyone with the link"
4. Make sure it says "Viewer" access
5. Copy the new link and try again

### Problem: "No face detected in selfie"

**Cause:** Selfie quality issues

**Solution:**
- Take selfie in good lighting
- Face the camera directly (not profile)
- Make sure your full face is visible
- Don't wear sunglasses or masks
- Try retaking the selfie

### Problem: Processing stuck at "Initializing..."

**Cause:** Worker not running

**Solution:**
1. Go to Render dashboard
2. Click on `whodis-worker`
3. Check if it says "Live"
4. If not, click "Manual Deploy" → "Deploy latest commit"
5. Check the logs for errors

### Problem: No photos in results folder

**Possible causes:**

**1. No matches found:**
- Your face might not be in the photos
- Try with different photos where you're clearly visible
- Lower the MATCH_THRESHOLD (in API env vars) to 0.3

**2. Service account doesn't have access:**
- Check "WhoDis Results" folder is shared with service account
- Service account email should be in "Share" list with Editor access

**3. Folder ID wrong:**
- Double-check GOOGLE_DRIVE_OUTPUT_FOLDER_ID in env vars
- Should match your "WhoDis Results" folder ID

### Problem: Camera not working

**Cause:** Browser permissions

**Solution:**
- Click the camera icon in browser address bar
- Allow camera access
- Refresh the page
- Try a different browser (Chrome works best)

### Problem: Backend errors in Render logs

**Check logs:**
1. Render dashboard → whodis-api
2. Click "Logs" tab
3. Look for error messages

**Common errors:**

**"ModuleNotFoundError"**
- Build command might be wrong
- Make sure it's: `pip install -r requirements.txt`

**"Database connection error"**
- Check DATABASE_URL is correct
- Should be the Internal URL, not External

**"Drive API error"**
- Check GOOGLE_SERVICE_ACCOUNT_JSON is complete
- Should be entire JSON file content
- Check quotes are escaped correctly

---

## 📊 What's Running

After successful deployment:

**Render (API):**
- `whodis-api` - Web service (API)
- `whodis-worker` - Background worker (processes jobs)
- `whodis-db` - PostgreSQL database
- `whodis-redis` - Redis queue

**Vercel (UI):**
- `whodis-ui` - Next.js app

**Your Drive:**
- "WhoDis Results" folder (where organized photos go)

**Cost: $0/month** (free tier)

---

## 🔄 Making Changes

### Update API Code

1. Make changes to files in `api/` folder
2. Commit and push:
   ```bash
   git add .
   git commit -m "Update API"
   git push
   ```
3. Render auto-deploys (takes 3-5 min)

### Update UI Code

1. Make changes to files in `ui/` folder
2. Commit and push:
   ```bash
   git add .
   git commit -m "Update UI"
   git push
   ```
3. Vercel auto-deploys (takes 1-2 min)

---

## ⚡ Keeping Services Awake (Optional)

Free tier services sleep after 15 minutes. To keep them awake:

### Method 1: cron-job.org (Free)

1. Go to https://cron-job.org
2. Create free account
3. Create new cron job:
   - URL: `https://whodis-api.onrender.com`
   - Interval: Every 10 minutes
   - Save
4. This pings your API every 10 min to keep it awake

### Method 2: UptimeRobot (Free)

1. Go to https://uptimerobot.com
2. Create free account
3. Add New Monitor:
   - Type: HTTP(s)
   - URL: `https://whodis-api.onrender.com`
   - Interval: 5 minutes
4. This monitors and keeps service awake

---

## 💰 Upgrade to Paid (Optional)

When you're ready for always-on services:

### Render Upgrades:

**whodis-api:** $7/month
- No sleep
- Always instant response
- More CPU/RAM

**whodis-worker:** $7/month
- Faster processing
- More concurrent jobs

**whodis-db:** $7/month
- No 90-day limit
- Automatic backups
- More storage

**whodis-redis:** $7/month
- More memory (256MB)
- Better performance

**Total:** $28/month for all services always-on

To upgrade:
1. Go to service dashboard
2. Click "Settings"
3. Change "Instance Type" to "Starter"
4. Click "Save Changes"

---

## 📱 Custom Domain (Optional - Free)

### On Vercel:

1. Go to project settings
2. Click "Domains"
3. Add your domain: `whodis.yourdomain.com`
4. Follow DNS instructions
5. SSL is automatic
6. **Update CORS:** Add new domain to API `CORS_ORIGINS`

---

## 🎯 What You Built

Congratulations! You now have:

✅ AI-powered face recognition service
✅ Web interface with camera capture
✅ Background job processing
✅ Google Drive integration
✅ Real-time progress updates
✅ Automatic result delivery
✅ Production deployment
✅ FREE hosting

**Service URLs:**
- Frontend: `https://whodis-xxxxx.vercel.app`
- API: `https://whodis-api.onrender.com`

**Share it with friends and start organizing photos!** 🎉

---

## 🚀 Next Steps

### Add Features:
- User accounts / authentication
- Payment integration
- AI social media content generation (your Phase 2!)
- Photo editing tools
- Bulk processing
- Email notifications

### Scale Up:
- Upgrade to paid tier ($28/mo) when you get traffic
- Add monitoring (Sentry for errors)
- Add analytics (Google Analytics)
- Optimize database queries
- Add caching

---

## 📞 Need Help?

**Render Issues:**
- Docs: https://render.com/docs
- Community: https://community.render.com

**Vercel Issues:**
- Docs: https://vercel.com/docs
- Discord: https://vercel.com/discord

**Google Drive API:**
- Docs: https://developers.google.com/drive

**Your service is LIVE! 🚀**
