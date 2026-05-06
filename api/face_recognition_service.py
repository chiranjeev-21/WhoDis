"""
Face Recognition Service
Wraps InsightFace for face detection and matching
"""

import gc
import numpy as np
import cv2
from pathlib import Path
from insightface.app import FaceAnalysis
from typing import Optional, List
import logging
from threading import Lock

from config import settings

logger = logging.getLogger(__name__)
_service_instance = None
_service_lock = Lock()


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
            det_thresh=settings.DETECTION_THRESHOLD,
            det_size=(settings.FACE_DETECTION_SIZE, settings.FACE_DETECTION_SIZE)
        )
        
        logger.info(f"✓ InsightFace model loaded: {settings.FACE_MODEL_NAME}")
    
    def extract_selfie_embedding(self, selfie_path: str) -> Optional[np.ndarray]:
        """
        Extract face embedding from selfie
        
        Returns:
            512-d embedding array, or None if no face detected
        """
        try:
            img = self._load_image_for_inference(selfie_path)
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
        finally:
            gc.collect()

    def extract_selfie_semantic_profile(self, selfie_path: str) -> Optional[dict]:
        """
        Build local reference clues from the selfie.

        Face embedding remains the strongest signal. The clothing/body signature
        is a fallback for photos where the user's face is turned away, partly
        hidden, or too small for a confident face match.
        """
        try:
            img = self._load_image_for_inference(selfie_path)
            if img is None:
                raise ValueError(f"Failed to load image: {selfie_path}")

            faces = self.app.get(img)
            if not faces:
                logger.warning("No face detected in selfie")
                return None

            largest_face = max(faces, key=lambda f: self._bbox_area(f.bbox))
            body_box = self._estimate_body_box_from_face(largest_face.bbox, img.shape)

            return {
                "face_embedding": largest_face.normed_embedding.astype(np.float32),
                "body_signature": self._extract_color_signature(img, body_box),
            }
        except Exception as e:
            logger.error(f"Failed to extract selfie semantic profile: {e}")
            return None
        finally:
            gc.collect()
    
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
            img = self._load_image_for_inference(image_path)
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
        finally:
            gc.collect()

    def classify_image_match(self, image_path: Path, selfie_profile: dict) -> dict:
        """
        Classify an image with face matching first, then local semantic fallback.

        Returns:
            {
              "is_match": bool,
              "match_type": "face" | "partial_face" | "body_semantic" | "none",
              "score": float
            }
        """
        try:
            img = self._load_image_for_inference(image_path)
            if img is None:
                logger.warning(f"Failed to load image: {image_path}")
                return self._no_match()

            query_embedding = selfie_profile["face_embedding"]
            selfie_body_signature = selfie_profile.get("body_signature")
            faces = self.app.get(img)
            best_face_score = -1.0
            best_body_score = -1.0
            body_boxes = []

            for face in faces:
                face_embedding = face.normed_embedding.astype(np.float32)
                similarity = float(np.dot(query_embedding, face_embedding))
                best_face_score = max(best_face_score, similarity)

                if similarity >= settings.MATCH_THRESHOLD:
                    return {
                        "is_match": True,
                        "match_type": "face",
                        "score": round(similarity, 3),
                    }

                body_boxes.append(self._estimate_body_box_from_face(face.bbox, img.shape))

            if (
                settings.ENABLE_SEMANTIC_MATCHING
                and best_face_score >= settings.PARTIAL_FACE_MATCH_THRESHOLD
            ):
                return {
                    "is_match": True,
                    "match_type": "partial_face",
                    "score": round(best_face_score, 3),
                }

            if settings.ENABLE_SEMANTIC_MATCHING and selfie_body_signature is not None:
                body_boxes.extend(self._detect_person_boxes(img))
                body_boxes = self._dedupe_boxes(body_boxes)

                if self._is_crowd_scene(len(faces), len(body_boxes)):
                    return {
                        "is_match": False,
                        "match_type": "crowd_rejected",
                        "score": round(max(best_face_score, 0.0), 3),
                    }

                for body_box in body_boxes:
                    candidate_signature = self._extract_color_signature(img, body_box)
                    if candidate_signature is None:
                        continue

                    body_score = self._signature_similarity(selfie_body_signature, candidate_signature)
                    best_body_score = max(best_body_score, body_score)

                    semantic_threshold = max(settings.BODY_SEMANTIC_MATCH_THRESHOLD, 0.68)
                    if body_score >= semantic_threshold:
                        return {
                            "is_match": True,
                            "match_type": "body_semantic",
                            "score": round(body_score, 3),
                        }

            return {
                "is_match": False,
                "match_type": "none",
                "score": round(max(best_face_score, best_body_score, 0.0), 3),
            }
        except Exception as e:
            logger.warning(f"Error processing {image_path}: {e}")
            return self._no_match()
        finally:
            gc.collect()
    
    def get_all_matches(self, image_path: Path, query_embedding: np.ndarray,
                       threshold: float = 0.4) -> List[dict]:
        """
        Get all matching faces in an image with similarity scores
        
        Returns:
            List of dicts with {bbox, similarity}
        """
        try:
            img = self._load_image_for_inference(image_path)
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
        finally:
            gc.collect()
    
    @staticmethod
    def _bbox_area(bbox: np.ndarray) -> float:
        """Calculate bounding box area"""
        x1, y1, x2, y2 = bbox
        return (x2 - x1) * (y2 - y1)

    @staticmethod
    def _load_image_for_inference(image_path: Path | str) -> Optional[np.ndarray]:
        """
        Load and downscale images before face detection to reduce peak memory.

        Original phone photos can be much larger than the model needs for
        accurate matching, so local processing downscales before inference.
        """
        img = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if img is None:
            return None

        height, width = img.shape[:2]
        longest_side = max(height, width)

        if longest_side <= settings.MAX_IMAGE_DIMENSION:
            return img

        scale = settings.MAX_IMAGE_DIMENSION / float(longest_side)
        resized = cv2.resize(
            img,
            (max(1, int(width * scale)), max(1, int(height * scale))),
            interpolation=cv2.INTER_AREA,
        )
        del img
        return resized

    @staticmethod
    def _estimate_body_box_from_face(bbox: np.ndarray, image_shape: tuple[int, ...]) -> tuple[int, int, int, int]:
        """Estimate the upper-body region below a detected face."""
        height, width = image_shape[:2]
        x1, y1, x2, y2 = [float(value) for value in bbox]
        face_width = max(1.0, x2 - x1)
        face_height = max(1.0, y2 - y1)
        center_x = (x1 + x2) / 2.0

        body_x1 = int(max(0, center_x - face_width * 1.35))
        body_x2 = int(min(width, center_x + face_width * 1.35))
        body_y1 = int(min(height, y2))
        body_y2 = int(min(height, y2 + face_height * 3.2))

        if body_y2 - body_y1 < 20:
            body_y1 = int(max(0, height * 0.35))
            body_y2 = int(min(height, height * 0.85))

        return body_x1, body_y1, body_x2, body_y2

    @staticmethod
    def _extract_color_signature(img: np.ndarray, box: tuple[int, int, int, int]) -> Optional[np.ndarray]:
        """Return a normalized HSV color signature for a body/clothing crop."""
        x1, y1, x2, y2 = box
        crop = img[max(0, y1):max(0, y2), max(0, x1):max(0, x2)]
        if crop.size == 0 or crop.shape[0] < 12 or crop.shape[1] < 12:
            return None

        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [18, 10], [0, 180, 20, 256])
        cv2.normalize(hist, hist)
        return hist.flatten().astype(np.float32)

    @staticmethod
    def _signature_similarity(reference: np.ndarray, candidate: np.ndarray) -> float:
        """Compare two color signatures with histogram correlation."""
        score = float(cv2.compareHist(reference, candidate, cv2.HISTCMP_CORREL))
        return max(0.0, min(1.0, (score + 1.0) / 2.0))

    @staticmethod
    def _detect_person_boxes(img: np.ndarray) -> List[tuple[int, int, int, int]]:
        """Find likely full-body boxes with OpenCV's local HOG person detector."""
        hog = cv2.HOGDescriptor()
        hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

        height, width = img.shape[:2]
        scale = min(1.0, 900.0 / max(height, width))
        scan_img = img
        if scale < 1.0:
            scan_img = cv2.resize(
                img,
                (max(1, int(width * scale)), max(1, int(height * scale))),
                interpolation=cv2.INTER_AREA,
            )

        boxes, weights = hog.detectMultiScale(
            scan_img,
            winStride=(8, 8),
            padding=(12, 12),
            scale=1.05,
        )

        results = []
        for (x, y, box_width, box_height), weight in zip(boxes, weights):
            if float(weight) < 0.2:
                continue
            if scale < 1.0:
                x = int(x / scale)
                y = int(y / scale)
                box_width = int(box_width / scale)
                box_height = int(box_height / scale)
            results.append((x, y, min(width, x + box_width), min(height, y + box_height)))

        return results

    @staticmethod
    def _dedupe_boxes(boxes: List[tuple[int, int, int, int]]) -> List[tuple[int, int, int, int]]:
        """Remove near-duplicate candidate body boxes."""
        unique = []
        for box in boxes:
            x1, y1, x2, y2 = box
            area = max(1, (x2 - x1) * (y2 - y1))
            duplicate = False
            for other in unique:
                ox1, oy1, ox2, oy2 = other
                ix1, iy1 = max(x1, ox1), max(y1, oy1)
                ix2, iy2 = min(x2, ox2), min(y2, oy2)
                overlap = max(0, ix2 - ix1) * max(0, iy2 - iy1)
                other_area = max(1, (ox2 - ox1) * (oy2 - oy1))
                if overlap / min(area, other_area) > 0.65:
                    duplicate = True
                    break
            if not duplicate:
                unique.append(box)
        return unique

    @staticmethod
    def _is_crowd_scene(face_count: int, person_candidate_count: int) -> bool:
        """
        Reject body-only semantic guesses in crowd scenes.

        A face match or partial-face match can still pass before this point.
        Body/clothing-only matching in a crowd is too ambiguous because someone
        else can easily have similar colors or posture.
        """
        return (
            face_count >= settings.SEMANTIC_CROWD_FACE_LIMIT
            or person_candidate_count >= settings.SEMANTIC_CROWD_PERSON_LIMIT
        )

    @staticmethod
    def _no_match() -> dict:
        return {"is_match": False, "match_type": "none", "score": 0.0}
    
    @staticmethod
    def compute_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
        """
        Compute cosine similarity between two embeddings
        
        Returns:
            Similarity score between -1 and 1 (higher = more similar)
        """
        return float(np.dot(emb1, emb2))


def get_face_recognition_service() -> FaceRecognitionService:
    """
    Lazily initialize and reuse the face-recognition model.

    Reusing the model avoids repeated warmup and reduces memory spikes when
    multiple jobs arrive close together.
    """
    global _service_instance

    if _service_instance is not None:
        return _service_instance

    with _service_lock:
        if _service_instance is None:
            _service_instance = FaceRecognitionService()

    return _service_instance


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
