"""
Background job processing helpers.

Jobs run inside the API service using FastAPI background tasks so the
deployment can stay on a single low-cost web service.
"""

import os
import logging
import gc
import json
from threading import BoundedSemaphore
from datetime import datetime

from config import settings
from database import update_job_status, update_job_fields, JobStatus, log_analytics, SessionLocal, Job
from face_recognition_service import get_face_recognition_service
from google_drive import (
    list_drive_folder_images,
    download_image_to_temp,
    cleanup_temp_file,
    build_results_zip,
)

logger = logging.getLogger(__name__)
_job_slots = BoundedSemaphore(max(1, settings.MAX_CONCURRENT_JOBS))


def is_worker_busy() -> bool:
    """Return whether the lightweight in-process worker is currently busy."""
    return _job_slots._value == 0


def _run_job(job_id: str):
    """Run the actual photo-processing workflow."""
    logger.info(f"Starting job {job_id}")
    log_analytics('job_started', job_id=job_id)
    
    try:
        # Update status to processing
        update_job_status(job_id, JobStatus.PROCESSING, current_message="Initializing...")
        
        # Get job from database
        db = SessionLocal()
        try:
            job = db.query(Job).filter(Job.job_id == job_id).first()
            if not job:
                raise Exception(f"Job {job_id} not found")
        finally:
            db.close()
        
        # Reuse a single loaded face-recognition model to avoid repeated memory spikes.
        face_service = get_face_recognition_service()
        
        # ====================================================================
        # STEP 1: Process selfie to get query embedding
        # ====================================================================
        
        update_job_status(job_id, JobStatus.PROCESSING, 
                         progress=5,
                         current_message="Processing your selfie...")
        
        selfie_embedding = face_service.extract_selfie_embedding(job.selfie_path)
        
        if selfie_embedding is None:
            raise Exception("No face detected in selfie. Please upload a clear photo.")
        
        logger.info(f"Job {job_id}: Selfie processed, embedding extracted")
        
        # ====================================================================
        # STEP 2: List images from user's Drive folder
        # ====================================================================
        
        update_job_status(job_id, JobStatus.PROCESSING,
                         progress=10,
                         current_message="Scanning your Drive folder...")
        
        image_files = list(list_drive_folder_images(job.drive_folder_id))
        total_images = len(image_files)
        
        if total_images == 0:
            raise Exception("No images found in the provided Drive folder")
        
        if total_images > settings.MAX_IMAGES_PER_JOB:
            raise Exception(f"Too many images ({total_images}). Maximum allowed: {settings.MAX_IMAGES_PER_JOB}")
        
        update_job_status(job_id, JobStatus.PROCESSING,
                         total_images=total_images,
                         progress=15,
                         current_message=f"Found {total_images} images. Starting face detection...")
        
        logger.info(f"Job {job_id}: Found {total_images} images")
        
        # ====================================================================
        # STEP 3: Process each image and find matches
        # ====================================================================
        
        matched_files = []
        processed_count = 0
        
        for idx, image_file in enumerate(image_files, 1):
            file_id = image_file['id']
            file_name = image_file['name']
            temp_path = None
            
            try:
                # Download image to temp
                temp_path = download_image_to_temp(file_id, file_name)
                
                # Detect faces and check for matches
                is_match = face_service.check_image_for_match(
                    temp_path,
                    selfie_embedding,
                    threshold=settings.MATCH_THRESHOLD
                )
                
                if is_match:
                    matched_files.append({
                        "file_id": file_id,
                        "name": file_name,
                    })
                    logger.info(f"Job {job_id}: Match found in {file_name}")
                
                processed_count += 1
                
                # Update progress
                progress = 15 + int((processed_count / total_images) * 70)  # 15% to 85%
                update_job_status(job_id, JobStatus.PROCESSING,
                                progress=progress,
                                current_message=f"Processing image {processed_count}/{total_images}... ({len(matched_files)} matches so far)")
            
            except Exception as e:
                logger.warning(f"Job {job_id}: Failed to process {file_name}: {e}")
                # Continue with next image
            finally:
                if temp_path is not None:
                    try:
                        cleanup_temp_file(temp_path)
                    except Exception as cleanup_error:
                        logger.warning(f"Job {job_id}: Failed to cleanup temp file {temp_path}: {cleanup_error}")

                # Explicit collection keeps the lightweight Render instance more stable.
                if idx % 10 == 0:
                    gc.collect()
        
        matched_count = len(matched_files)
        logger.info(f"Job {job_id}: Found {matched_count} matches out of {total_images} images")
        
        if matched_count == 0:
            # No matches found - still mark as completed
            update_job_status(job_id, JobStatus.COMPLETED,
                            progress=100,
                            matched_images=0,
                            zip_status="idle",
                            zip_path=None,
                            zip_error_message=None,
                            zip_generated_at=None,
                            current_message="No matches found. Try a different selfie or check your Drive folder.")
            log_analytics('job_completed_no_matches', job_id=job_id)
            return
        
        # ====================================================================
        # STEP 4: Persist matched source-file links
        # ====================================================================

        update_job_status(job_id, JobStatus.PROCESSING,
                         progress=92,
                         matched_images=matched_count,
                         current_message="Preparing result links...")

        matched_files_json = json.dumps(matched_files)

        # ====================================================================
        # STEP 5: Cleanup selfie (if configured)
        # ====================================================================
        
        if settings.DELETE_SELFIE_AFTER_PROCESSING:
            try:
                os.remove(job.selfie_path)
                logger.info(f"Job {job_id}: Deleted selfie")
            except Exception as e:
                logger.warning(f"Job {job_id}: Failed to delete selfie: {e}")
        
        # ====================================================================
        # STEP 6: Mark job as completed
        # ====================================================================
        
        update_job_status(job_id, JobStatus.COMPLETED,
                         progress=100,
                         matched_images=matched_count,
                         result_folder_url=job.drive_folder_url,
                         matched_files_json=matched_files_json,
                         zip_status="idle",
                         zip_path=None,
                         zip_error_message=None,
                         zip_generated_at=None,
                         current_message=f"✓ Complete! Found {matched_count} photos with you.")
        
        log_analytics('job_completed', job_id=job_id, 
                     event_data=f'{{"matched": {matched_count}, "total": {total_images}}}')
        
        logger.info(f"✓ Job {job_id} completed successfully")
    
    except Exception as e:
        # Job failed
        error_message = str(e)
        logger.error(f"✗ Job {job_id} failed: {error_message}", exc_info=True)
        
        update_job_status(job_id, JobStatus.FAILED,
                         error_message=error_message,
                         current_message=f"Error: {error_message}")
        
        log_analytics('job_failed', job_id=job_id, event_data=error_message)
    finally:
        gc.collect()


def process_job_task(job_id: str):
    """
    Main job processing task
    
    Flow:
    1. Load job from database
    2. Extract selfie embedding
    3. Stream images from user's Drive folder
    4. Find matches
    5. Persist matched source-file ids
    6. Cleanup
    """
    
    if not _job_slots.acquire(blocking=False):
        update_job_status(
            job_id,
            JobStatus.PENDING,
            progress=0,
            current_message="Queued. Another scan is already running on this worker..."
        )
        logger.info("Job %s is waiting for an available worker slot", job_id)
        _job_slots.acquire()

    try:
        _run_job(job_id)
    finally:
        _job_slots.release()


def cleanup_old_results_task():
    """
    Manual cleanup helper for old result folders.

    Automatic scheduling is intentionally omitted in the lightweight
    single-service deployment.
    """
    from database import cleanup_old_results

    logger.info("Running cleanup of old results...")
    cleanup_old_results(days=settings.AUTO_DELETE_RESULTS_DAYS)
    logger.info("✓ Cleanup complete")


def prepare_zip_task(job_id: str):
    """Build and cache a ZIP archive for a completed job's matched files."""
    logger.info("Preparing ZIP archive for job %s", job_id)

    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.job_id == job_id).first()
        if not job:
            logger.warning("Cannot prepare ZIP for missing job %s", job_id)
            return

        if job.status != JobStatus.COMPLETED or not job.matched_files_json:
            update_job_fields(
                job_id,
                zip_status="failed",
                zip_error_message="ZIP download is only available after a completed run with matches.",
                zip_path=None,
                zip_generated_at=None,
            )
            return

        if job.zip_status == "ready" and job.zip_path and os.path.exists(job.zip_path):
            logger.info("Reusing cached ZIP for job %s", job_id)
            return
    finally:
        db.close()

    update_job_fields(
        job_id,
        zip_status="processing",
        zip_error_message=None,
        zip_path=None,
        zip_generated_at=None,
    )

    try:
        matched_files = json.loads(job.matched_files_json)
        archive_path = build_results_zip(matched_files, archive_name_prefix=f"whodis_{job_id[:8]}")
        update_job_fields(
            job_id,
            zip_status="ready",
            zip_error_message=None,
            zip_path=str(archive_path),
            zip_generated_at=datetime.utcnow(),
        )
        logger.info("ZIP archive ready for job %s", job_id)
    except Exception as e:
        logger.error("ZIP archive generation failed for job %s: %s", job_id, e, exc_info=True)
        update_job_fields(
            job_id,
            zip_status="failed",
            zip_error_message=str(e),
            zip_path=None,
            zip_generated_at=None,
        )
