"""
Celery Tasks
Background job processing
"""

from celery import Celery
import os
import logging
from pathlib import Path

from config import settings
from database import update_job_status, JobStatus, log_analytics, SessionLocal, Job
from face_recognition_service import FaceRecognitionService
from google_drive import (
    list_drive_folder_images,
    download_image_to_temp,
    create_result_folder,
    copy_files_to_folder,
    share_folder_with_email,
    cleanup_temp_file
)

# Initialize Celery
celery_app = Celery(
    "whodis",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_time_limit=settings.JOB_TIMEOUT_MINUTES * 60,  # Hard limit
    task_soft_time_limit=(settings.JOB_TIMEOUT_MINUTES - 2) * 60  # Soft limit
)

logger = logging.getLogger(__name__)


@celery_app.task(name="process_job")
def process_job_task(job_id: str):
    """
    Main job processing task
    
    Flow:
    1. Load job from database
    2. Extract selfie embedding
    3. Stream images from user's Drive folder
    4. Find matches
    5. Copy matches to service Drive folder
    6. Share folder with user
    7. Cleanup
    """
    
    logger.info(f"Starting job {job_id}")
    log_analytics('job_started', job_id=job_id)
    
    try:
        # Update status to processing
        update_job_status(job_id, JobStatus.PROCESSING, current_message="Initializing...")
        
        # Get job from database
        db = SessionLocal()
        job = db.query(Job).filter(Job.job_id == job_id).first()
        if not job:
            raise Exception(f"Job {job_id} not found")
        db.close()
        
        # Initialize face recognition service
        face_service = FaceRecognitionService()
        
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
        
        matched_file_ids = []
        processed_count = 0
        
        for idx, image_file in enumerate(image_files, 1):
            file_id = image_file['id']
            file_name = image_file['name']
            
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
                    matched_file_ids.append(file_id)
                    logger.info(f"Job {job_id}: Match found in {file_name}")
                
                # Cleanup temp file
                cleanup_temp_file(temp_path)
                
                processed_count += 1
                
                # Update progress
                progress = 15 + int((processed_count / total_images) * 70)  # 15% to 85%
                update_job_status(job_id, JobStatus.PROCESSING,
                                progress=progress,
                                current_message=f"Processing image {processed_count}/{total_images}... ({len(matched_file_ids)} matches so far)")
            
            except Exception as e:
                logger.warning(f"Job {job_id}: Failed to process {file_name}: {e}")
                # Continue with next image
        
        matched_count = len(matched_file_ids)
        logger.info(f"Job {job_id}: Found {matched_count} matches out of {total_images} images")
        
        if matched_count == 0:
            # No matches found - still mark as completed
            update_job_status(job_id, JobStatus.COMPLETED,
                            progress=100,
                            matched_images=0,
                            current_message="No matches found. Try a different selfie or check your Drive folder.")
            log_analytics('job_completed_no_matches', job_id=job_id)
            return
        
        # ====================================================================
        # STEP 4: Create result folder in service Drive
        # ====================================================================
        
        update_job_status(job_id, JobStatus.PROCESSING,
                         progress=90,
                         matched_images=matched_count,
                         current_message=f"Creating your folder with {matched_count} photos...")
        
        result_folder = create_result_folder(job_id)
        result_folder_id = result_folder['id']
        result_folder_url = result_folder['webViewLink']
        
        logger.info(f"Job {job_id}: Created result folder {result_folder_id}")
        
        # ====================================================================
        # STEP 5: Copy matched files to result folder
        # ====================================================================
        
        update_job_status(job_id, JobStatus.PROCESSING,
                         progress=95,
                         current_message="Copying your photos...")
        
        copy_files_to_folder(matched_file_ids, result_folder_id)
        
        logger.info(f"Job {job_id}: Copied {matched_count} files to result folder")
        
        # ====================================================================
        # STEP 6: Share folder with user (if email provided)
        # ====================================================================
        
        if job.user_email:
            share_folder_with_email(result_folder_id, job.user_email)
            logger.info(f"Job {job_id}: Shared folder with {job.user_email}")
        
        # ====================================================================
        # STEP 7: Cleanup selfie (if configured)
        # ====================================================================
        
        if settings.DELETE_SELFIE_AFTER_PROCESSING:
            try:
                os.remove(job.selfie_path)
                logger.info(f"Job {job_id}: Deleted selfie")
            except Exception as e:
                logger.warning(f"Job {job_id}: Failed to delete selfie: {e}")
        
        # ====================================================================
        # STEP 8: Mark job as completed
        # ====================================================================
        
        update_job_status(job_id, JobStatus.COMPLETED,
                         progress=100,
                         matched_images=matched_count,
                         result_folder_id=result_folder_id,
                         result_folder_url=result_folder_url,
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


@celery_app.task(name="cleanup_old_results")
def cleanup_old_results_task():
    """
    Periodic task to clean up old result folders
    
    Schedule with:
    celery -A tasks beat --loglevel=info
    
    Or use celery-beat in production
    """
    from database import cleanup_old_results
    
    logger.info("Running cleanup of old results...")
    cleanup_old_results(days=settings.AUTO_DELETE_RESULTS_DAYS)
    logger.info("✓ Cleanup complete")


# ============================================================================
# CELERY BEAT SCHEDULE (Periodic Tasks)
# ============================================================================

celery_app.conf.beat_schedule = {
    'cleanup-old-results': {
        'task': 'cleanup_old_results',
        'schedule': 86400.0,  # Run daily (86400 seconds = 24 hours)
    },
}
