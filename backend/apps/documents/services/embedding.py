"""
Embedding generation service utilizing HuggingFace sentence-transformers.
Generates 384-dimensional dense vectors with telemetry wall-clock timing instrumentation.
"""
from typing import List, Optional
from django.conf import settings
from sentence_transformers import SentenceTransformer

from apps.analytics.services.telemetry import track_telemetry


class VectorEmbeddingService:
    """
    Singleton service wrapper around SentenceTransformer producing normalized
    384-dimensional vector embeddings for cosine similarity retrieval.
    """
    _model: Optional[SentenceTransformer] = None

    def __init__(self, model_name: Optional[str] = None) -> None:
        self.model_name: str = str(
            model_name
            or getattr(
                settings,
                "EMBEDDING_MODEL_NAME",
                "sentence-transformers/all-MiniLM-L6-v2",
            )
        )

    def _get_model(self) -> SentenceTransformer:
        """Lazy singleton loader avoiding redundant model initialization."""
        if VectorEmbeddingService._model is None:
            VectorEmbeddingService._model = SentenceTransformer(self.model_name)
        return VectorEmbeddingService._model

    def generate_embedding(self, text: str) -> List[float]:
        """Generate a single 384-dimensional embedding vector."""
        return self.generate_embeddings([text])[0]

    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """
        Generate batch vector embeddings for a list of text chunks.
        Monitored via the operational telemetry engine.
        """
        if not texts:
            return []

        model = self._get_model()

        with track_telemetry(
            operation="EMBEDDING_GEN",
            model_name=self.model_name,
            metadata={"batch_size": len(texts)},
        ):
            # Encode with L2 normalization for direct cosine distance ranking
            embeddings_array = model.encode(texts, normalize_embeddings=True)
            embeddings: List[List[float]] = embeddings_array.tolist()

        return embeddings
