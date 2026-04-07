"""
WhoDis Web Service - FastAPI API
Main application entry point
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid
import json
import os
from datetime import datetime
import logging

from database import SessionLocal, Job, JobStatus, init_db, update_job_fields
from tasks import process_job_task, prepare_zip_task, is_worker_busy
from config import settings

logger = logging.getLogger(__name__)

app = FastAPI(
    title="WhoDis API",
    description="Face recognition and photo organization service",
    version="1.0.0"
)


@app.on_event("startup")
async def startup_event():
    """Ensure the database schema exists whenever the API boots."""
    init_db()
    logger.info("Database initialized")

# CORS - Allow the UI to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,  # e.g., ["https://whodis.app", "http://localhost:3000"]
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class JobSubmitRequest(BaseModel):
    """Request to create a new job"""
    drive_folder_url: str
    selfie_base64: str  # Base64-encoded image
    user_email: Optional[EmailStr] = None


class JobStatusResponse(BaseModel):
    """Job status response"""
    job_id: str
    status: str  # pending, processing, completed, failed
    progress: int  # 0-100
    total_images: Optional[int] = None
    matched_images: Optional[int] = None
    current_message: Optional[str] = None
    result_folder_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class JobResultResponse(BaseModel):
    """Final job results"""
    job_id: str
    status: str
    matched_images: int
    folder_url: str
    result_mode: str
    preview_urls: list[str]  # First 10 image thumbnails
    matched_files: list[dict]
    zip_status: str = "idle"
    zip_error_message: Optional[str] = None


class ZipPreparationResponse(BaseModel):
    """Response for ZIP archive preparation requests."""
    job_id: str
    zip_status: str
    detail: str


# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "WhoDis API",
        "status": "running",
        "version": "1.0.0"
    }


@app.post("/api/submit-job", response_model=dict)
async def submit_job(request: JobSubmitRequest, background_tasks: BackgroundTasks):
    """
    Submit a new processing job
    
    Flow:
    1. Validate Drive URL
    2. Save selfie temporarily
    3. Create job in database
    4. Start background processing inside the API service
    5. Return job ID
    """
    try:
        # Extract Drive folder ID from URL
        folder_id = extract_folder_id(request.drive_folder_url)
        if not folder_id:
            raise HTTPException(status_code=400, detail="Invalid Google Drive URL")
        
        # Generate job ID
        job_id = str(uuid.uuid4())
        
        # Save selfie to temp storage (S3/local)
        selfie_path = await save_selfie_temp(job_id, request.selfie_base64)
        
        worker_busy = is_worker_busy()

        # Create job record in database
        db = SessionLocal()
        try:
            job = Job(
                job_id=job_id,
                drive_folder_url=request.drive_folder_url,
                drive_folder_id=folder_id,
                selfie_path=selfie_path,
                user_email=request.user_email,
                status=JobStatus.PENDING,
                progress=0,
                current_message="Queued. Waiting for an available worker..." if worker_busy else "Queued. Starting soon..."
            )
            db.add(job)
            db.commit()
            
            # Run the job after the response is sent so users can
            # immediately transition to the progress screen.
            background_tasks.add_task(process_job_task, job_id)
            
            return {
                "job_id": job_id,
                "status": "queued" if worker_busy else "processing",
                "message": "Job created successfully. Processing has started." if not worker_busy else "Job created successfully. It has been queued and will start soon."
            }
        
        finally:
            db.close()
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create job: {str(e)}")


@app.get("/api/job-status/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """
    Get current job status and progress
    
    Called by the UI to display progress bar
    """
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.job_id == job_id).first()
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        return JobStatusResponse(
            job_id=job.job_id,
            status=job.status.value,
            progress=job.progress or 0,
            total_images=job.total_images,
            matched_images=job.matched_images,
            current_message=job.current_message,
            result_folder_url=job.result_folder_url,
            error_message=job.error_message,
            created_at=job.created_at,
            completed_at=job.completed_at
        )
    
    finally:
        db.close()


@app.get("/api/results/{job_id}", response_model=JobResultResponse)
async def get_job_results(job_id: str):
    """
    Get final results for a completed job
    
    Returns:
    - Number of matches
    - Drive folder URL
    - Preview thumbnails
    """
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.job_id == job_id).first()
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        if job.status != JobStatus.COMPLETED:
            raise HTTPException(status_code=400, detail=f"Job status is {job.status.value}, not completed")
        
        matched_files = []
        result_mode = "drive_folder"
        folder_url = job.result_folder_url or ""
        preview_urls = []
        zip_status, zip_error_message = normalize_zip_state(job)

        if job.matched_files_json:
            result_mode = "source_links"
            folder_url = job.drive_folder_url

            stored_matches = json.loads(job.matched_files_json)
            matched_files = get_matched_file_results(stored_matches)
            preview_urls = [
                file["thumbnail_url"]
                for file in matched_files
                if file.get("thumbnail_url")
            ][:10]
        elif job.result_folder_id:
            preview_urls = get_folder_preview_urls(job.result_folder_id, limit=10)
        
        return JobResultResponse(
            job_id=job.job_id,
            status=job.status.value,
            matched_images=job.matched_images or 0,
            folder_url=folder_url,
            result_mode=result_mode,
            preview_urls=preview_urls,
            matched_files=matched_files,
            zip_status=zip_status,
            zip_error_message=zip_error_message,
        )
    
    finally:
        db.close()


@app.post("/api/results/{job_id}/prepare-download", response_model=ZipPreparationResponse)
async def prepare_job_results_download(job_id: str, background_tasks: BackgroundTasks):
    """Start background ZIP generation for a completed job."""
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.job_id == job_id).first()

        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        if job.status != JobStatus.COMPLETED:
            raise HTTPException(status_code=400, detail=f"Job status is {job.status.value}, not completed")

        if not job.matched_files_json:
            raise HTTPException(status_code=400, detail="ZIP download is only available for source-link results.")

        zip_status, zip_error_message = normalize_zip_state(job)

        if zip_status == "ready":
            return ZipPreparationResponse(
                job_id=job.job_id,
                zip_status="ready",
                detail="ZIP archive is ready to download.",
            )

        if zip_status != "processing":
            update_job_fields(
                job_id,
                zip_status="processing",
                zip_error_message=None,
                zip_path=None,
                zip_generated_at=None,
            )
            background_tasks.add_task(prepare_zip_task, job_id)
            zip_status = "processing"

        detail = "Preparing your ZIP archive now."
        if zip_error_message:
            detail = f"Retrying ZIP generation after the previous error: {zip_error_message}"

        return ZipPreparationResponse(
            job_id=job.job_id,
            zip_status=zip_status,
            detail=detail,
        )
    finally:
        db.close()


@app.get("/api/results/{job_id}/download")
async def download_job_results(job_id: str):
    """Download a prepared ZIP archive for a completed job."""
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.job_id == job_id).first()

        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        if job.status != JobStatus.COMPLETED:
            raise HTTPException(status_code=400, detail=f"Job status is {job.status.value}, not completed")

        if not job.matched_files_json:
            raise HTTPException(status_code=400, detail="ZIP download is only available for source-link results.")

        zip_status, zip_error_message = normalize_zip_state(job)
        if zip_status != "ready" or not job.zip_path:
            raise HTTPException(
                status_code=409,
                detail=zip_error_message or "ZIP archive is still being prepared. Try again in a moment.",
            )

        return FileResponse(
            path=job.zip_path,
            media_type="application/zip",
            filename=f"whodis-{job_id[:8]}-matches.zip",
        )
    finally:
        db.close()


@app.delete("/api/job/{job_id}")
async def cancel_job(job_id: str):
    """
    Cancel a pending or running job
    """
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.job_id == job_id).first()
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        if job.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
            raise HTTPException(status_code=400, detail="Cannot cancel completed/failed job")
        
        # Mark as cancelled
        job.status = JobStatus.FAILED
        job.error_message = "Cancelled by user"
        job.completed_at = datetime.utcnow()
        db.commit()
        
        # The lightweight deployment runs jobs in-process, so cancellation
        # only updates the stored job state.
        
        return {"message": "Job cancelled"}
    
    finally:
        db.close()


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def extract_folder_id(drive_url: str) -> Optional[str]:
    """
    Extract folder ID from Google Drive URL
    
    Supports:
    - https://drive.google.com/drive/folders/FOLDER_ID
    - https://drive.google.com/drive/folders/FOLDER_ID?usp=sharing
    """
    import re
    
    # Pattern: /folders/FOLDER_ID
    pattern = r'/folders/([a-zA-Z0-9_-]+)'
    match = re.search(pattern, drive_url)
    
    if match:
        return match.group(1)
    
    return None


async def save_selfie_temp(job_id: str, selfie_base64: str) -> str:
    """
    Save selfie to temporary storage
    
    Options:
    1. Local filesystem (/tmp/)
    2. S3/Cloud Storage
    3. Database (if small)
    
    Returns:
        Path/URL to saved selfie
    """
    import os
    import base64
    
    # Decode base64
    image_data = base64.b64decode(selfie_base64)
    
    # Save to temp directory
    temp_dir = "/tmp/whodis/selfies"
    os.makedirs(temp_dir, exist_ok=True)
    
    selfie_path = f"{temp_dir}/{job_id}.jpg"
    
    with open(selfie_path, 'wb') as f:
        f.write(image_data)
    
    return selfie_path


def get_folder_preview_urls(folder_id: str, limit: int = 10) -> list[str]:
    """
    Get thumbnail URLs for first N images in folder
    
    Uses Google Drive API to get thumbnail links
    """
    from google_drive import get_drive_service
    
    try:
        service = get_drive_service()
        
        results = service.files().list(
            q=f"'{folder_id}' in parents and mimeType contains 'image/'",
            pageSize=limit,
            fields="files(id, thumbnailLink)"
        ).execute()
        
        files = results.get('files', [])
        
        return [file['thumbnailLink'] for file in files if 'thumbnailLink' in file]
    
    except Exception as e:
        print(f"Failed to get preview URLs: {e}")
        return []


def get_matched_file_results(stored_matches: list[dict]) -> list[dict]:
    """Enrich stored source-file ids with display metadata for the results page."""
    from google_drive import get_files_result_data

    file_ids = [item["file_id"] for item in stored_matches if item.get("file_id")]
    file_names_by_id = {
        item["file_id"]: item.get("name", "Matched photo")
        for item in stored_matches
        if item.get("file_id")
    }

    return get_files_result_data(file_ids, file_names_by_id=file_names_by_id)


def normalize_zip_state(job: Job) -> tuple[str, Optional[str]]:
    """
    Return a sane ZIP status for the job, resetting stale cached paths when needed.
    """
    zip_status = job.zip_status or "idle"
    zip_error_message = job.zip_error_message

    if zip_status == "ready" and (not job.zip_path or not os.path.exists(job.zip_path)):
        update_job_fields(
            job.job_id,
            zip_status="idle",
            zip_path=None,
            zip_error_message=None,
            zip_generated_at=None,
        )
        zip_status = "idle"
        zip_error_message = None

    return zip_status, zip_error_message


# ============================================================================
# ERROR HANDLERS
# ============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global error handler"""
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc) if settings.DEBUG else "An unexpected error occurred"
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
