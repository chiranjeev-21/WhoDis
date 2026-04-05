"""
Face Recognition Service
Wraps InsightFace for face detection and matching
"""

import numpy as np
import cv2
from pathlib import Path
from insightface.app import FaceAnalysis
from typing import Optional, List
import logging

from config import settings

logger = logging.getLogger(__name__)


class FaceRecognitionService:
    """
    Face recognition service using InsightFace
    
    Responsibilities:
    - Extract face embeddings from selfies
    - Detect faces in images
    - Compare embeddings for matching
    """
    
    def __init__(self):
        """Initialize InsightFace model"""
        logger.info("Loading InsightFace model...")
        
        self.app = FaceAnalysis(
            name=settings.FACE_MODEL_NAME,
            providers=['CPUExecutionProvider']  # Use 'CUDAExecutionProvider' for GPU
        )
        
        self.app.prepare(
            ctx_id=0,
            det_thresh=settings.DETECTION_THRESHOLD
        )
        
        logger.info(f"✓ InsightFace model loaded: {settings.FACE_MODEL_NAME}")
    
    def extract_selfie_embedding(self, selfie_path: str) -> Optional[np.ndarray]:
        """
        Extract face embedding from selfie
        
        Returns:
            512-d embedding array, or None if no face detected
        """
        try:
            # Load image
            img = cv2.imread(selfie_path)
            if img is None:
                raise ValueError(f"Failed to load image: {selfie_path}")
            
            # Detect faces
            faces = self.app.get(img)
            
            if not faces:
                logger.warning("No face detected in selfie")
                return None
            
            if len(faces) > 1:
                logger.warning(f"Multiple faces detected ({len(faces)}), using largest")
            
            # Use largest face
            largest_face = max(faces, key=lambda f: self._bbox_area(f.bbox))
            
            # Return normalized embedding
            embedding = largest_face.normed_embedding.astype(np.float32)
            
            logger.info(f"✓ Extracted embedding from selfie (confidence: {largest_face.det_score:.2f})")
            
            return embedding
        
        except Exception as e:
            logger.error(f"Failed to extract selfie embedding: {e}")
            return None
    
    def check_image_for_match(self, image_path: Path, query_embedding: np.ndarray,
                              threshold: float = 0.4) -> bool:
        """
        Check if image contains a face matching the query embedding
        
        Args:
            image_path: Path to image file
            query_embedding: 512-d query embedding
            threshold: Similarity threshold (0.0-1.0, higher = stricter)
        
        Returns:
            True if match found, False otherwise
        """
        try:
            # Load image
            img = cv2.imread(str(image_path))
            if img is None:
                logger.warning(f"Failed to load image: {image_path}")
                return False
            
            # Detect faces
            faces = self.app.get(img)
            
            if not faces:
                return False
            
            # Check each face for match
            for face in faces:
                face_embedding = face.normed_embedding.astype(np.float32)
                
                # Compute similarity (cosine similarity via dot product for normalized vectors)
                similarity = float(np.dot(query_embedding, face_embedding))
                
                if similarity >= threshold:
                    logger.debug(f"Match found in {image_path.name} (similarity: {similarity:.3f})")
                    return True
            
            return False
        
        except Exception as e:
            logger.warning(f"Error processing {image_path}: {e}")
            return False
    
    def get_all_matches(self, image_path: Path, query_embedding: np.ndarray,
                       threshold: float = 0.4) -> List[dict]:
        """
        Get all matching faces in an image with similarity scores
        
        Returns:
            List of dicts with {bbox, similarity}
        """
        try:
            img = cv2.imread(str(image_path))
            if img is None:
                return []
            
            faces = self.app.get(img)
            matches = []
            
            for face in faces:
                face_embedding = face.normed_embedding.astype(np.float32)
                similarity = float(np.dot(query_embedding, face_embedding))
                
                if similarity >= threshold:
                    matches.append({
                        'bbox': face.bbox.tolist(),
                        'similarity': similarity
                    })
            
            return matches
        
        except Exception as e:
            logger.warning(f"Error getting matches from {image_path}: {e}")
            return []
    
    @staticmethod
    def _bbox_area(bbox: np.ndarray) -> float:
        """Calculate bounding box area"""
        x1, y1, x2, y2 = bbox
        return (x2 - x1) * (y2 - y1)
    
    @staticmethod
    def compute_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
        """
        Compute cosine similarity between two embeddings
        
        Returns:
            Similarity score between -1 and 1 (higher = more similar)
        """
        return float(np.dot(emb1, emb2))


# ============================================================================
# TESTING
# ============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    service = FaceRecognitionService()
    
    # Test with sample image
    test_image = Path("/tmp/test_face.jpg")
    if test_image.exists():
        embedding = service.extract_selfie_embedding(str(test_image))
        if embedding is not None:
            print(f"✓ Embedding extracted: shape={embedding.shape}, norm={np.linalg.norm(embedding):.4f}")
    else:
        print("No test image found. Service initialized successfully.")
