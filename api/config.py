"""
API configuration loaded from environment variables.
"""

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional


class Settings(BaseSettings):
    """Application settings"""

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )
    
    # Application
    APP_NAME: str = "WhoDis"
    DEBUG: bool = False
    
    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]
    CORS_ORIGIN_REGEX: Optional[str] = None
    
    # Database. SQLite is the local default; set DATABASE_URL to PostgreSQL only
    # if you intentionally want an external database.
    DATABASE_URL: str = "sqlite:///./whodis.db"
    
    # Google Drive Service Account
    GOOGLE_SERVICE_ACCOUNT_FILE: str = "service-account.json"
    GOOGLE_DRIVE_OUTPUT_FOLDER_ID: str = ""  # Your service Drive folder ID
    
    # Face Recognition
    FACE_MODEL_NAME: str = "buffalo_l"
    DETECTION_THRESHOLD: float = 0.5
    MATCH_THRESHOLD: float = 0.4
    ENABLE_SEMANTIC_MATCHING: bool = True
    PARTIAL_FACE_MATCH_THRESHOLD: float = 0.28
    BODY_SEMANTIC_MATCH_THRESHOLD: float = 0.68
    SEMANTIC_CROWD_FACE_LIMIT: int = 2
    SEMANTIC_CROWD_PERSON_LIMIT: int = 2
    EMBEDDING_DIM: int = 512
    FACE_DETECTION_SIZE: int = 640
    MAX_IMAGE_DIMENSION: int = 1600
    
    # Job Settings
    MAX_IMAGES_PER_JOB: int = 1000
    JOB_TIMEOUT_MINUTES: int = 30  # Max time for a job
    MAX_CONCURRENT_JOBS: int = 1
    
    # Cleanup
    AUTO_DELETE_RESULTS_DAYS: int = 7  # Delete result folders after N days
    DELETE_SELFIE_AFTER_PROCESSING: bool = True
    
    # Email (optional - for notifications)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = "noreply@localhost"
    
    # Storage
    TEMP_STORAGE_PATH: str = "./local_data/temp"
    
    # Rate Limiting
    MAX_JOBS_PER_IP_PER_DAY: int = 10

    # Social Studio
    SOCIAL_STUDIO_IMAGE_LIMIT: int = 24
    SOCIAL_STUDIO_AI_IMAGE_LIMIT: int = 8
    SOCIAL_STUDIO_MAX_ZIP_MB: int = 150
    HF_TOKEN: str = ""
    HF_VISION_MODEL: str = "Qwen/Qwen2.5-VL-3B-Instruct"
    HF_TEXT_MODEL: str = "Qwen/Qwen2.5-7B-Instruct"
    HF_IMAGE_CAPTION_MODEL: str = ""  # Deprecated legacy key kept for backwards compatibility.

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug_flag(cls, value):
        if isinstance(value, str) and value.lower() in {"release", "prod", "production"}:
            return False
        return value

    @field_validator("CORS_ORIGIN_REGEX", mode="before")
    @classmethod
    def blank_regex_is_none(cls, value):
        if value == "":
            return None
        return value


# Global settings instance
settings = Settings()
