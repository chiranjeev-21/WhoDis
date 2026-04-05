"""
Backend Configuration
All settings loaded from environment variables
"""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application settings"""
    
    # Application
    APP_NAME: str = "WhoDis"
    DEBUG: bool = False
    
    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",  # Next.js dev
        "https://whodis.app",     # Production frontend
    ]
    
    # Database (PostgreSQL)
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/whodis"
    
    # Redis (for Celery)
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    
    # Google Drive Service Account
    GOOGLE_SERVICE_ACCOUNT_FILE: str = "service-account.json"
    GOOGLE_DRIVE_OUTPUT_FOLDER_ID: str = ""  # Your service Drive folder ID
    
    # Face Recognition
    FACE_MODEL_NAME: str = "buffalo_l"
    DETECTION_THRESHOLD: float = 0.5
    MATCH_THRESHOLD: float = 0.4
    EMBEDDING_DIM: int = 512
    
    # Job Settings
    MAX_IMAGES_PER_JOB: int = 500  # Limit to prevent abuse
    JOB_TIMEOUT_MINUTES: int = 30  # Max time for a job
    
    # Cleanup
    AUTO_DELETE_RESULTS_DAYS: int = 7  # Delete result folders after N days
    DELETE_SELFIE_AFTER_PROCESSING: bool = True
    
    # Email (optional - for notifications)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = "noreply@whodis.app"
    
    # Storage
    TEMP_STORAGE_PATH: str = "/tmp/whodis"
    
    # Rate Limiting
    MAX_JOBS_PER_IP_PER_DAY: int = 10
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# Global settings instance
settings = Settings()
