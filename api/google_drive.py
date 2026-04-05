"""
Google Drive Utilities
Handles all Google Drive API interactions using Service Account
"""

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from pathlib import Path
from typing import List, Dict, Generator
import logging
import os

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
            ).execute()
            
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
    
    try:
        request = service.files().get_media(fileId=file_id)
        
        with open(temp_path, 'wb') as f:
            downloader = MediaIoBaseDownload(f, request)
            done = False
            while not done:
                status, done = downloader.next_chunk()
        
        logger.debug(f"Downloaded {file_name} to temp")
        return temp_path
    
    except Exception as e:
        logger.error(f"Failed to download {file_id}: {e}")
        # Clean up partial download
        if temp_path.exists():
            temp_path.unlink()
        raise


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
