"""
Database Models
SQLAlchemy ORM models for local SQLite by default, with optional PostgreSQL.
"""

from sqlalchemy import create_engine, Column, String, Integer, DateTime, Text, Enum as SQLEnum, Boolean, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from enum import Enum as PyEnum
from pathlib import Path

from config import settings

# Database engine
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    sqlite_path = settings.DATABASE_URL.replace("sqlite:///", "", 1)
    if sqlite_path not in {":memory:", ""}:
        Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)
    connect_args["check_same_thread"] = False

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ============================================================================
# ENUMS
# ============================================================================

class JobStatus(str, PyEnum):
    """Job status enum"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# ============================================================================
# MODELS
# ============================================================================

class Job(Base):
    """
    Job model - tracks processing jobs
    """
    __tablename__ = "jobs"
    
    # Primary key
    job_id = Column(String(36), primary_key=True)  # UUID
    
    # User input
    drive_folder_url = Column(Text, nullable=False)
    drive_folder_id = Column(String(100), nullable=False)
    selfie_path = Column(Text, nullable=False)  # Path to saved selfie
    user_email = Column(String(255), nullable=True)
    
    # Job status
    status = Column(SQLEnum(JobStatus), default=JobStatus.PENDING, nullable=False)
    progress = Column(Integer, default=0)  # 0-100
    current_message = Column(Text, nullable=True)  # e.g., "Processing image 45/100"
    
    # Results
    total_images = Column(Integer, nullable=True)
    matched_images = Column(Integer, nullable=True)
    result_folder_id = Column(String(100), nullable=True)  # Drive folder ID with results
    result_folder_url = Column(Text, nullable=True)  # Public URL to result folder
    matched_files_json = Column(Text, nullable=True)  # JSON payload with matched source file ids/names
    zip_status = Column(String(32), default="idle", nullable=True)
    zip_path = Column(Text, nullable=True)
    zip_error_message = Column(Text, nullable=True)
    zip_generated_at = Column(DateTime, nullable=True)
    
    # Error handling
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Cleanup tracking
    result_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)
    
    def __repr__(self):
        return f"<Job {self.job_id} status={self.status.value}>"


class Analytics(Base):
    """
    Analytics events (optional)
    Track key events for monitoring
    """
    __tablename__ = "analytics"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(36), nullable=True)
    event_type = Column(String(100), nullable=False)  # e.g., 'job_created', 'match_found'
    event_data = Column(Text, nullable=True)  # JSON string
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f"<Analytics {self.event_type}>"


# ============================================================================
# DATABASE INITIALIZATION
# ============================================================================

def init_db():
    """
    Create all tables
    Safe to call on every API startup
    """
    Base.metadata.create_all(bind=engine)
    ensure_job_columns()
    print("✓ Database tables created")


def ensure_job_columns():
    """Add newer job columns when an older local database already exists."""
    existing_columns = {column["name"] for column in inspect(engine).get_columns("jobs")}
    migrations = {
        "matched_files_json": "TEXT",
        "zip_status": "VARCHAR(32)",
        "zip_path": "TEXT",
        "zip_error_message": "TEXT",
        "zip_generated_at": "TIMESTAMP",
    }

    with engine.begin() as connection:
        for column_name, column_type in migrations.items():
            if column_name not in existing_columns:
                connection.execute(text(f"ALTER TABLE jobs ADD COLUMN {column_name} {column_type}"))


def get_db():
    """
    Get database session (dependency injection)
    
    Usage in FastAPI:
    @app.get("/example")
    def example(db: Session = Depends(get_db)):
        ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def update_job_status(job_id: str, status: JobStatus, **kwargs):
    """
    Update job status and optional fields
    
    Usage:
    update_job_status(job_id, JobStatus.PROCESSING, progress=50, current_message="Halfway done")
    """
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.job_id == job_id).first()
        if job:
            job.status = status
            
            # Update optional fields
            for key, value in kwargs.items():
                if hasattr(job, key):
                    setattr(job, key, value)
            
            # Auto-set timestamps
            if status == JobStatus.PROCESSING and not job.started_at:
                job.started_at = datetime.utcnow()
            elif status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED] and not job.completed_at:
                job.completed_at = datetime.utcnow()
            
            db.commit()
    finally:
        db.close()


def update_job_fields(job_id: str, **kwargs):
    """Update arbitrary job fields without changing status timestamps."""
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.job_id == job_id).first()
        if job:
            for key, value in kwargs.items():
                if hasattr(job, key):
                    setattr(job, key, value)
            db.commit()
    finally:
        db.close()


def log_analytics(event_type: str, job_id: str = None, event_data: str = None):
    """
    Log analytics event
    
    Usage:
    log_analytics('job_started', job_id='abc-123')
    """
    db = SessionLocal()
    try:
        event = Analytics(
            job_id=job_id,
            event_type=event_type,
            event_data=event_data
        )
        db.add(event)
        db.commit()
    finally:
        db.close()


# ============================================================================
# CLEANUP UTILITIES
# ============================================================================

def cleanup_old_results(days: int = 7):
    """
    Delete result folders older than N days
    
    Run this periodically (e.g., daily cron job)
    """
    from datetime import timedelta
    import shutil
    from pathlib import Path
    from google_drive import delete_drive_folder
    
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    db = SessionLocal()
    try:
        # Find completed jobs older than cutoff
        old_jobs = db.query(Job).filter(
            Job.status == JobStatus.COMPLETED,
            Job.completed_at < cutoff_date,
            Job.result_deleted == False
        ).all()
        
        for job in old_jobs:
            if job.zip_path:
                try:
                    zip_path = Path(job.zip_path)
                    if zip_path.exists():
                        zip_path.unlink()
                except Exception as e:
                    print(f"✗ Failed to delete ZIP for job {job.job_id}: {e}")

            try:
                match_dir = Path(settings.TEMP_STORAGE_PATH) / "matches" / job.job_id
                if match_dir.exists():
                    shutil.rmtree(match_dir)
            except Exception as e:
                print(f"✗ Failed to delete local matches for job {job.job_id}: {e}")

            if job.result_folder_id:
                try:
                    # Delete Drive folder
                    delete_drive_folder(job.result_folder_id)
                    
                    # Mark as deleted
                    job.result_deleted = True
                    job.deleted_at = datetime.utcnow()
                    db.commit()
                    
                    print(f"✓ Deleted results for job {job.job_id}")
                except Exception as e:
                    print(f"✗ Failed to delete results for job {job.job_id}: {e}")
    
    finally:
        db.close()


if __name__ == "__main__":
    # Initialize database
    print("Creating database tables...")
    init_db()
