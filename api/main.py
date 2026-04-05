"""
WhoDis Web Service - FastAPI Backend
Main application entry point
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, HttpUrl
from typing import Optional
import uuid
import base64
from datetime import datetime

from database import SessionLocal, Job, JobStatus
from tasks import process_job_task
from config import settings

app = FastAPI(
    title="WhoDis API",
    description="Face recognition and photo organization service",
    version="1.0.0"
)

# CORS - Allow the UI to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,  # e.g., ["https://whodis.app", "http://localhost:3000"]
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
    preview_urls: list[str]  # First 10 image thumbnails


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
async def submit_job(request: JobSubmitRequest):
    """
    Submit a new processing job
    
    Flow:
    1. Validate Drive URL
    2. Save selfie temporarily
    3. Create job in database
    4. Enqueue Celery task
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
                progress=0
            )
            db.add(job)
            db.commit()
            
            # Enqueue Celery task
            process_job_task.delay(job_id)
            
            return {
                "job_id": job_id,
                "status": "queued",
                "message": "Job created successfully. Processing will begin shortly."
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
        
        # Get preview thumbnails from Drive (first 10 images)
        preview_urls = get_folder_preview_urls(job.result_folder_id, limit=10)
        
        return JobResultResponse(
            job_id=job.job_id,
            status=job.status.value,
            matched_images=job.matched_images or 0,
            folder_url=job.result_folder_url or "",
            preview_urls=preview_urls
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
        
        # TODO: Revoke Celery task if possible
        
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
