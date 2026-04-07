"""
Google Drive Utilities
Handles all Google Drive API interactions using Service Account
"""

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from googleapiclient.errors import HttpError
from pathlib import Path
from typing import List, Dict, Generator
import logging
import os
import tempfile
import zipfile
import time
import random

from config import settings

logger = logging.getLogger(__name__)

# ============================================================================
# SERVICE ACCOUNT AUTHENTICATION
# ============================================================================

def get_drive_service():
    """
    Get authenticated Drive service using Service Account
    
    Supports two methods:
    1. JSON string in environment variable (Render/cloud deployment)
    2. JSON file in project root (local development)
    """
    import json
    
    SCOPES = ['https://www.googleapis.com/auth/drive']
    
    # Check if JSON is in environment variable (Render deployment)
    if os.getenv('GOOGLE_SERVICE_ACCOUNT_JSON'):
        logger.info("Loading service account from environment variable")
        service_account_info = json.loads(os.getenv('GOOGLE_SERVICE_ACCOUNT_JSON'))
        credentials = service_account.Credentials.from_service_account_info(
            service_account_info,
            scopes=SCOPES
        )
    else:
        # Fallback to file (local development)
        logger.info("Loading service account from file")
        credentials = service_account.Credentials.from_service_account_file(
            settings.GOOGLE_SERVICE_ACCOUNT_FILE,
            scopes=SCOPES
        )
    
    service = build('drive', 'v3', credentials=credentials)
    
    return service


# Global service instance (reused across requests)
_drive_service = None

def get_service():
    """Get cached Drive service"""
    global _drive_service
    if _drive_service is None:
        _drive_service = get_drive_service()
    return _drive_service


def _execute_with_retry(request_factory, context: str, max_attempts: int = 5):
    """Retry transient Google Drive API failures with exponential backoff."""
    last_error = None

    for attempt in range(1, max_attempts + 1):
        try:
            return request_factory().execute()
        except HttpError as e:
            last_error = e
            if not _is_retryable_drive_error(e) or attempt == max_attempts:
                raise

            sleep_for = min(8.0, (2 ** (attempt - 1)) + random.uniform(0, 0.5))
            logger.warning(
                "Retrying Drive request for %s after HTTP %s (attempt %s/%s, sleep %.2fs)",
                context,
                getattr(e.resp, "status", "unknown"),
                attempt,
                max_attempts,
                sleep_for,
            )
            time.sleep(sleep_for)
        except Exception as e:
            last_error = e
            if attempt == max_attempts:
                raise

            sleep_for = min(4.0, attempt + random.uniform(0, 0.25))
            logger.warning(
                "Retrying Drive request for %s after unexpected error %s (attempt %s/%s, sleep %.2fs)",
                context,
                e,
                attempt,
                max_attempts,
                sleep_for,
            )
            time.sleep(sleep_for)

    raise last_error


def _is_retryable_drive_error(error: HttpError) -> bool:
    """Return whether a Drive API error looks transient and worth retrying."""
    status = getattr(error.resp, "status", None)
    if status in {429, 500, 502, 503, 504}:
        return True

    if status != 403:
        return False

    reasons = _extract_drive_error_reasons(error)
    retryable_reasons = {
        "rateLimitExceeded",
        "userRateLimitExceeded",
        "backendError",
    }
    return any(reason in retryable_reasons for reason in reasons)


def _extract_drive_error_reasons(error: HttpError) -> List[str]:
    """Extract Drive API error reasons from an HttpError payload."""
    import json

    try:
        payload = json.loads(error.content.decode("utf-8"))
    except Exception:
        return []

    details = payload.get("error", {}).get("errors", [])
    return [detail.get("reason", "") for detail in details if detail.get("reason")]


# ============================================================================
# LISTING FILES
# ============================================================================

def list_drive_folder_images(folder_id: str) -> Generator[Dict, None, None]:
    """
    List all images in a Drive folder
    
    Args:
        folder_id: Google Drive folder ID
    
    Yields:
        Dicts with {id, name, mimeType}
    """
    service = get_service()
    
    # Query for images in folder
    query = f"'{folder_id}' in parents and (mimeType contains 'image/') and trashed=false"
    
    page_token = None
    total_count = 0
    
    while True:
        try:
            results = service.files().list(
                q=query,
                pageSize=100,
                fields="nextPageToken, files(id, name, mimeType)",
                pageToken=page_token
            )
            results = _execute_with_retry(
                lambda req=results: req,
                context=f"list folder {folder_id}",
            )
            
            files = results.get('files', [])
            
            for file in files:
                yield file
                total_count += 1
            
            page_token = results.get('nextPageToken')
            if not page_token:
                break
        
        except Exception as e:
            logger.error(f"Failed to list folder {folder_id}: {e}")
            break
    
    logger.info(f"Listed {total_count} images from folder {folder_id}")


# ============================================================================
# DOWNLOADING FILES
# ============================================================================

def download_image_to_temp(file_id: str, file_name: str) -> Path:
    """
    Download Drive file to temporary location
    
    ⚠️ CALLER MUST DELETE THIS FILE AFTER USE
    
    Returns:
        Path to temporary file
    """
    service = get_service()
    
    # Create temp directory
    temp_dir = Path(settings.TEMP_STORAGE_PATH) / "downloads"
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    # Create unique temp path
    temp_path = temp_dir / f"{file_id}_{file_name}"
    
    last_error = None

    for attempt in range(1, 6):
        try:
            request = service.files().get_media(fileId=file_id)

            with open(temp_path, 'wb') as f:
                downloader = MediaIoBaseDownload(f, request)
                done = False
                while not done:
                    status, done = downloader.next_chunk()

            logger.debug(f"Downloaded {file_name} to temp")
            return temp_path
        except HttpError as e:
            last_error = e
            if temp_path.exists():
                temp_path.unlink()

            if not _is_retryable_drive_error(e) or attempt == 5:
                logger.error(f"Failed to download {file_id}: {e}")
                raise

            sleep_for = min(8.0, (2 ** (attempt - 1)) + random.uniform(0, 0.5))
            logger.warning(
                "Retrying media download for %s after HTTP %s (attempt %s/%s, sleep %.2fs)",
                file_id,
                getattr(e.resp, "status", "unknown"),
                attempt,
                5,
                sleep_for,
            )
            time.sleep(sleep_for)
        except Exception as e:
            last_error = e
            if temp_path.exists():
                temp_path.unlink()

            if attempt == 5:
                logger.error(f"Failed to download {file_id}: {e}")
                raise

            sleep_for = min(4.0, attempt + random.uniform(0, 0.25))
            logger.warning(
                "Retrying media download for %s after error %s (attempt %s/%s, sleep %.2fs)",
                file_id,
                e,
                attempt,
                5,
                sleep_for,
            )
            time.sleep(sleep_for)

    raise last_error


def cleanup_temp_file(file_path: Path):
    """
    Delete temporary file with verification
    
    This is CRITICAL for memory safety
    """
    if not file_path.exists():
        logger.warning(f"Temp file already deleted: {file_path}")
        return
    
    try:
        file_path.unlink()
        logger.debug(f"✓ Cleaned up: {file_path.name}")
    except Exception as e:
        logger.error(f"Failed to delete temp file {file_path}: {e}")
        raise


# ============================================================================
# FILE METADATA
# ============================================================================

def get_files_result_data(file_ids: List[str], file_names_by_id: Dict[str, str] | None = None) -> List[Dict]:
    """
    Build lightweight result metadata for matched source files.

    This keeps results tied to the original Drive items instead of copying
    them into a separate folder, which avoids service-account storage limits.
    """
    service = get_service()
    file_names_by_id = file_names_by_id or {}
    results = []

    for file_id in file_ids:
        fallback_name = file_names_by_id.get(file_id, "Matched photo")
        fallback_view_url = f"https://drive.google.com/file/d/{file_id}/view"

        try:
            file = _execute_with_retry(
                lambda file_id=file_id: service.files().get(
                    fileId=file_id,
                    fields="id, name, thumbnailLink, webViewLink"
                ),
                context=f"fetch metadata for {file_id}",
            )

            results.append({
                "file_id": file["id"],
                "name": file.get("name", fallback_name),
                "thumbnail_url": file.get("thumbnailLink"),
                "view_url": file.get("webViewLink", fallback_view_url),
            })
        except Exception as e:
            logger.warning(f"Failed to load metadata for file {file_id}: {e}")
            results.append({
                "file_id": file_id,
                "name": fallback_name,
                "thumbnail_url": None,
                "view_url": fallback_view_url,
            })

    return results


def build_results_zip(file_entries: List[Dict], archive_name_prefix: str) -> Path:
    """
    Download matched source files one by one and package them into a ZIP.

    The archive is created in temporary storage and should be deleted by the
    caller after the response is sent.
    """
    archive_dir = Path(settings.TEMP_STORAGE_PATH) / "archives"
    archive_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=".zip",
        prefix=f"{archive_name_prefix}_",
        dir=archive_dir,
    ) as temp_archive:
        archive_path = Path(temp_archive.name)

    successful_files = 0
    name_counts: dict[str, int] = {}

    try:
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for index, file_entry in enumerate(file_entries, start=1):
                file_id = file_entry.get("file_id")
                if not file_id:
                    continue

                original_name = file_entry.get("name") or f"match_{index}.jpg"
                archive_name = _get_unique_archive_name(original_name, index, name_counts)
                temp_path = None

                try:
                    temp_path = download_image_to_temp(file_id, archive_name)
                    archive.write(temp_path, arcname=archive_name)
                    successful_files += 1
                except Exception as e:
                    logger.warning(f"Failed to add {file_id} to ZIP archive: {e}")
                finally:
                    if temp_path is not None:
                        try:
                            cleanup_temp_file(temp_path)
                        except Exception as cleanup_error:
                            logger.warning(f"Failed to cleanup temp file {temp_path}: {cleanup_error}")

        if successful_files == 0:
            raise RuntimeError("No matched files could be added to the ZIP archive.")

        return archive_path
    except Exception:
        if archive_path.exists():
            archive_path.unlink()
        raise


def _get_unique_archive_name(file_name: str, index: int, name_counts: Dict[str, int]) -> str:
    """Normalize duplicate Drive filenames so the ZIP contents stay distinct."""
    base_name = Path(file_name).name.strip() or f"match_{index}.jpg"
    stem = Path(base_name).stem or f"match_{index}"
    suffix = Path(base_name).suffix

    occurrence = name_counts.get(base_name, 0)
    name_counts[base_name] = occurrence + 1

    if occurrence == 0:
        return base_name

    return f"{stem}_{occurrence + 1}{suffix}"


# ============================================================================
# CREATING AND MANAGING FOLDERS
# ============================================================================

def create_result_folder(job_id: str) -> Dict:
    """
    Create a result folder in service Drive for a job
    
    Folder structure:
    WhoDis Results/
      └── job_<job_id>/
    
    Returns:
        Dict with {id, name, webViewLink}
    """
    service = get_service()
    
    # Get or create parent folder
    parent_folder_id = settings.GOOGLE_DRIVE_OUTPUT_FOLDER_ID
    
    if not parent_folder_id:
        # Create "WhoDis Results" folder if not configured
        parent_folder_id = get_or_create_parent_folder()
    
    # Create job-specific folder
    folder_metadata = {
        'name': f'WhoDis_Job_{job_id[:8]}',  # Use first 8 chars of UUID
        'mimeType': 'application/vnd.google-apps.folder',
        'parents': [parent_folder_id]
    }
    
    folder = service.files().create(
        body=folder_metadata,
        fields='id, name, webViewLink'
    ).execute()
    
    logger.info(f"Created result folder: {folder['name']} ({folder['id']})")
    
    return folder


def get_or_create_parent_folder() -> str:
    """
    Get or create the main "WhoDis Results" folder
    
    Returns:
        Folder ID
    """
    service = get_service()
    
    # Search for existing folder
    query = "name='WhoDis Results' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    
    results = service.files().list(
        q=query,
        fields="files(id, name)"
    ).execute()
    
    files = results.get('files', [])
    
    if files:
        folder_id = files[0]['id']
        logger.info(f"Using existing parent folder: {folder_id}")
        return folder_id
    
    # Create new folder
    folder_metadata = {
        'name': 'WhoDis Results',
        'mimeType': 'application/vnd.google-apps.folder'
    }
    
    folder = service.files().create(
        body=folder_metadata,
        fields='id'
    ).execute()
    
    folder_id = folder['id']
    logger.info(f"Created parent folder: {folder_id}")
    
    return folder_id


# ============================================================================
# COPYING FILES
# ============================================================================

def copy_files_to_folder(file_ids: List[str], dest_folder_id: str):
    """
    Copy multiple files to destination folder (in Drive, no download)
    
    Args:
        file_ids: List of Drive file IDs to copy
        dest_folder_id: Destination folder ID
    """
    service = get_service()
    
    copied_count = 0
    
    for file_id in file_ids:
        try:
            # Get original file name
            original = service.files().get(
                fileId=file_id,
                fields='name'
            ).execute()
            
            # Copy file
            service.files().copy(
                fileId=file_id,
                body={
                    'parents': [dest_folder_id],
                    'name': original['name']
                }
            ).execute()
            
            copied_count += 1
        
        except Exception as e:
            logger.warning(f"Failed to copy file {file_id}: {e}")
    
    logger.info(f"Copied {copied_count}/{len(file_ids)} files to folder {dest_folder_id}")


# ============================================================================
# SHARING
# ============================================================================

def share_folder_with_email(folder_id: str, email: str):
    """
    Share folder with user's email address
    
    Args:
        folder_id: Drive folder ID
        email: User's email address
    """
    service = get_service()
    
    try:
        permission = {
            'type': 'user',
            'role': 'reader',
            'emailAddress': email
        }
        
        service.permissions().create(
            fileId=folder_id,
            body=permission,
            sendNotificationEmail=True
        ).execute()
        
        logger.info(f"Shared folder {folder_id} with {email}")
    
    except Exception as e:
        logger.error(f"Failed to share folder {folder_id} with {email}: {e}")
        raise


def make_folder_public_link(folder_id: str):
    """
    Make folder accessible via link (anyone with link can view)
    
    Returns:
        Public URL
    """
    service = get_service()
    
    try:
        # Create public permission
        permission = {
            'type': 'anyone',
            'role': 'reader'
        }
        
        service.permissions().create(
            fileId=folder_id,
            body=permission
        ).execute()
        
        # Get webViewLink
        file = service.files().get(
            fileId=folder_id,
            fields='webViewLink'
        ).execute()
        
        logger.info(f"Made folder {folder_id} publicly accessible")
        
        return file['webViewLink']
    
    except Exception as e:
        logger.error(f"Failed to make folder public: {e}")
        raise


# ============================================================================
# DELETION
# ============================================================================

def delete_drive_folder(folder_id: str):
    """
    Delete a Drive folder (move to trash)
    
    Used for cleanup of old result folders
    """
    service = get_service()
    
    try:
        service.files().delete(fileId=folder_id).execute()
        logger.info(f"Deleted folder {folder_id}")
    
    except Exception as e:
        logger.error(f"Failed to delete folder {folder_id}: {e}")
        raise


# ============================================================================
# TESTING
# ============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # Test authentication
    try:
        service = get_drive_service()
        print("✓ Service account authentication successful")
        
        # List some files (if output folder is configured)
        if settings.GOOGLE_DRIVE_OUTPUT_FOLDER_ID:
            images = list(list_drive_folder_images(settings.GOOGLE_DRIVE_OUTPUT_FOLDER_ID))
            print(f"✓ Found {len(images)} images in configured folder")
    
    except Exception as e:
        print(f"✗ Authentication failed: {e}")
