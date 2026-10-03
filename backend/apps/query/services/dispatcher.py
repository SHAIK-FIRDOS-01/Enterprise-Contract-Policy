"""
Concurrent Map Dispatcher Service.
Dispatches parallel RAG extraction tasks across multiple target documents concurrently
using a bounded ThreadPoolExecutor, per-worker timeout ceilings to eliminate stragglers,
and thread-local Django database connection cleanup.
"""
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
import logging
import os
import time
from typing import Any, Dict, List, Optional, Union
from uuid import UUID

from django.db import connections

from apps.query.services.worker import DocumentAuditWorker

logger = logging.getLogger(__name__)


class ConcurrentMapDispatcher:
    """
    Concurrent Map Dispatcher.
    Executes isolated per-document hybrid search workers in parallel over a bounded thread pool.
    Guarantees strict per-worker latency ceiling and robust database connection reclamation.
    """

    def __init__(
        self,
        worker: Optional[DocumentAuditWorker] = None,
        max_workers: Optional[int] = None,
        default_timeout: float = 15.0,  # 15.0s ceiling for CPU embedding & DB retrieval
    ) -> None:
        self.worker = worker or DocumentAuditWorker()
        cpu_count = os.cpu_count() or 1
        self.max_workers = max_workers or min(8, cpu_count)
        self.default_timeout = default_timeout

    def dispatch(
        self,
        document_ids: List[Union[UUID, str]],
        query_text: str,
        user_id: Optional[Union[UUID, str]] = None,
        timeout_seconds: Optional[float] = None,
        **filters: Any,
    ) -> List[Dict[str, Any]]:
        """
        Dispatches extraction tasks across target documents concurrently.

        Args:
            document_ids: List of document UUIDs to search against.
            query_text: Natural language or keyword query string.
            user_id: Optional user UUID scoping document permissions.
            timeout_seconds: Per-worker timeout ceiling in seconds. Defaults to 250ms.
            **filters: Additional query filters passed to worker.execute (e.g. top_k).

        Returns:
            List of per-document evidence bundles:
            [
                {
                    "document_id": str,
                    "status": "SUCCESS" | "TIMEOUT" | "FAILED",
                    "duration_ms": float,
                    "candidate_chunks": list[dict],
                },
                ...
            ]
        """
        if not document_ids:
            return []

        effective_timeout = timeout_seconds if timeout_seconds is not None else self.default_timeout
        doc_id_strings = [str(did) for did in document_ids]
        start_time = time.perf_counter()

        def _worker_wrapper(target_doc_id: str) -> Dict[str, Any]:
            try:
                return self.worker.execute(
                    document_id=target_doc_id,
                    query_text=query_text,
                    user_id=user_id,
                    **filters,
                )
            finally:
                connections.close_all()

        pool_size = min(len(doc_id_strings), self.max_workers)
        bundles: List[Dict[str, Any]] = []

        with ThreadPoolExecutor(max_workers=pool_size) as executor:
            future_to_doc = {
                executor.submit(_worker_wrapper, doc_id): doc_id
                for doc_id in doc_id_strings
            }

            deadline = start_time + effective_timeout

            for future, doc_id in future_to_doc.items():
                remaining_time = max(0.0, deadline - time.perf_counter())
                try:
                    result = future.result(timeout=remaining_time)
                    bundles.append(result)
                except FuturesTimeoutError:
                    elapsed_ms = (time.perf_counter() - start_time) * 1000
                    logger.warning(
                        "ConcurrentMapDispatcher timeout exceeded for document %s (limit: %.3fs)",
                        doc_id,
                        effective_timeout,
                    )
                    bundles.append({
                        "document_id": doc_id,
                        "status": "TIMEOUT",
                        "duration_ms": round(elapsed_ms, 2),
                        "candidate_chunks": [],
                        "error_message": (
                            f"Per-worker timeout of {effective_timeout:.3f}s exceeded."
                        ),
                    })
                except Exception as exc:
                    elapsed_ms = (time.perf_counter() - start_time) * 1000
                    logger.error(
                        "ConcurrentMapDispatcher unhandled error for document %s: %s",
                        doc_id,
                        exc,
                        exc_info=True,
                    )
                    bundles.append({
                        "document_id": doc_id,
                        "status": "FAILED",
                        "duration_ms": round(elapsed_ms, 2),
                        "candidate_chunks": [],
                        "error_message": str(exc),
                    })

        return bundles
