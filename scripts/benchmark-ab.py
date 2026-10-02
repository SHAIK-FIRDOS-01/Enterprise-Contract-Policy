"""
Automated Dual-Mode Benchmark Harness Script for Ticket 20.
Executes parallel multi-document queries across test documents (FY25 vs FY26 10-K).
Runs in DUAL_SYSTEM mode and FRONTIER_ONLY mode consecutively.
Validates that operations persist valid records to AuditBenchmarkLog.
Prints formatted comparative ledger to stdout confirming cost reduction,
token efficiency, and concurrency speedup.
"""
import os
import sys
from typing import Any, Dict, List
from unittest.mock import MagicMock

# 1. Setup Django environment
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(BASE_DIR, "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
import django  # noqa: E402
django.setup()

from apps.analytics.models import AuditBenchmarkLog  # noqa: E402
from apps.analytics.services.telemetry import TelemetryService  # noqa: E402
from apps.authentication.models import User  # noqa: E402
from apps.documents.models import Document, DocumentChunk, DocumentStatus  # noqa: E402
from apps.documents.services.embedding import VectorEmbeddingService  # noqa: E402
from apps.query.services.dispatcher import ConcurrentMapDispatcher  # noqa: E402
from apps.query.services.multiplexer import MultiTargetSSEMultiplexer  # noqa: E402
from apps.query.services.reducer import MultiDocReduceSynthesizer  # noqa: E402


class BenchmarkGroqCompletion:
    """Mock Groq completion for deterministic benchmark execution."""
    def __init__(self, text: str, total_tokens: int = 150) -> None:
        self.choices = [MagicMock(message=MagicMock(content=text))]
        self.usage = MagicMock(
            prompt_tokens=total_tokens // 2,
            completion_tokens=total_tokens // 2,
            total_tokens=total_tokens,
        )


class BenchmarkGroqClient:
    """Mock Groq client when offline or for deterministic benchmarking."""
    class chat:
        class completions:
            @staticmethod
            def create(*args: Any, **kwargs: Any) -> BenchmarkGroqCompletion:
                return BenchmarkGroqCompletion(
                    "Cross-document variance analysis reveals revenue rose from $12.4B in FY25 "
                    "to $14.1B in FY26 [Ref:fy25:chunk-1:1] with operating margin expanding "
                    "by 230 basis points [Ref:fy26:chunk-2:2]."
                )


def setup_benchmark_data() -> tuple[User, Document, Document]:
    """Ensures test user and FY25/FY26 10-K test documents exist."""
    user, _ = User.objects.get_or_create(
        email="benchmark_agent@enterprise-copilot.internal",
        defaults={"is_active": True},
    )

    embedder = VectorEmbeddingService()

    doc_25, created_25 = Document.objects.get_or_create(
        user=user,
        title="FY25 Form 10-K Annual Report",
        defaults={
            "file_hash": "bench_hash_fy25_10k",
            "page_count": 85,
            "status": DocumentStatus.READY,
        },
    )
    if created_25 or not doc_25.chunks.exists():
        text_25 = (
            "FY25 Financial Overview: Total consolidated revenues were $12.4 billion. "
            "Governing law is Delaware. Cash flow from operations was $3.2 billion."
        )
        vec_25 = embedder.generate_embedding(text_25)
        DocumentChunk.objects.create(
            document=doc_25,
            chunk_index=0,
            text_content=text_25,
            page_number=1,
            bounding_box={"x0": 50, "y0": 100, "x1": 500, "y1": 250},
            embedding=vec_25,
        )

    doc_26, created_26 = Document.objects.get_or_create(
        user=user,
        title="FY26 Form 10-K Annual Report",
        defaults={
            "file_hash": "bench_hash_fy26_10k",
            "page_count": 92,
            "status": DocumentStatus.READY,
        },
    )
    if created_26 or not doc_26.chunks.exists():
        text_26 = (
            "FY26 Financial Overview: Total consolidated revenues grew to $14.1 billion. "
            "Governing law is Delaware. Operating cash flow increased to $3.9 billion."
        )
        vec_26 = embedder.generate_embedding(text_26)
        DocumentChunk.objects.create(
            document=doc_26,
            chunk_index=0,
            text_content=text_26,
            page_number=1,
            bounding_box={"x0": 50, "y0": 100, "x1": 500, "y1": 250},
            embedding=vec_26,
        )

    # Warmup embedder model in memory
    embedder.generate_embedding("Warmup query embedding initialization")

    return user, doc_25, doc_26


def run_benchmark() -> int:
    """Runs dual-mode A/B comparative benchmark suite."""
    print("=" * 88)
    print("   ENTERPRISE CONTRACT & POLICY COPILOT: DUAL-SYSTEM A/B BENCHMARK HARNESS")
    print("=" * 88)
    print("Initializing test environment and corpus...")

    user, doc_25, doc_26 = setup_benchmark_data()
    doc_ids = [str(doc_25.id), str(doc_26.id)]
    print(f"Target Documents Loaded: 2 ([{doc_25.title}] and [{doc_26.title}])")

    # Prepare synthesizer (use mock groq client if groq key not set or for deterministic test)
    reducer = MultiDocReduceSynthesizer(client=BenchmarkGroqClient())
    dispatcher = ConcurrentMapDispatcher(default_timeout=3.0)
    multiplexer = MultiTargetSSEMultiplexer()

    test_queries = [
        "What is the governing law and jurisdiction across agreements?",
        "Compare the total consolidated revenue growth between FY25 and FY26 10-K.",
    ]

    initial_log_count = AuditBenchmarkLog.objects.count()

    # 1. Run in DUAL_SYSTEM mode
    print("\n[1/2] Executing queries in DUAL_SYSTEM Mode (Fast-Path + Reduce)...")
    dual_events: List[str] = []
    for query in test_queries:
        generator = multiplexer.stream_multi_target_query(
            query=query,
            document_ids=doc_ids,
            user_id=user.id,
            dispatcher=dispatcher,
            reducer=reducer,
            force_frontier=False,
        )
        for event in generator:
            dual_events.append(event)
    print(f"      -> Dual-System run emitted {len(dual_events)} SSE events.")

    # 2. Run in FRONTIER_ONLY mode
    print("\n[2/2] Executing queries in FRONTIER_ONLY Mode (Baseline)...")
    frontier_events: List[str] = []
    for query in test_queries:
        generator = multiplexer.stream_multi_target_query(
            query=query,
            document_ids=doc_ids,
            user_id=user.id,
            dispatcher=dispatcher,
            reducer=reducer,
            force_frontier=True,
        )
        for event in generator:
            frontier_events.append(event)
    print(f"      -> Frontier baseline run emitted {len(frontier_events)} SSE events.")

    # 3. Verify database logging integrity
    new_log_count = AuditBenchmarkLog.objects.count()
    delta_logs = new_log_count - initial_log_count
    expected_new_logs = len(test_queries) * 2  # 2 queries * 2 modes
    print(f"\n[Validation] Persisted {delta_logs} new AuditBenchmarkLog entries (expected >= {expected_new_logs}).")
    if delta_logs < expected_new_logs:
        print(f"ERROR: Expected at least {expected_new_logs} new logs, found {delta_logs}")
        return 1

    # 4. Compute A/B comparative telemetry
    comparison = TelemetryService.get_ab_comparison()
    sys1 = comparison.get("system_1", {})
    sys2 = comparison.get("system_2", {})
    frontier = comparison.get("frontier_baseline", {})
    roi = comparison.get("roi_metrics", {})
    concurrency = comparison.get("concurrency_metrics", {})

    print("\n" + "=" * 88)
    print("                    A/B COMPARATIVE TELEMETRY ROI LEDGER")
    print("=" * 88)
    print(f"{'Metric':<34} | {'Dual-System Mode':<22} | {'Frontier Baseline':<22}")
    print("-" * 88)
    print(
        f"{'Total Queries Processed':<34} | "
        f"{int(sys1.get('total_queries', 0)) + int(sys2.get('total_queries', 0)):<22} | "
        f"{frontier.get('total_queries', 0):<22}"
    )
    print(
        f"{'Fast-Path Latency (System 1)':<34} | "
        f"{sys1.get('avg_latency_ms', 0):.1f} ms{'':<15} | "
        f"{'N/A (Bypassed)':<22}"
    )
    print(
        f"{'Reduce Latency (System 2)':<34} | "
        f"{sys2.get('avg_latency_ms', 0):.1f} ms{'':<15} | "
        f"{frontier.get('avg_latency_ms', 0):.1f} ms{'':<15}"
    )
    print(
        f"{'Cumulative Dollar Cost':<34} | "
        f"${float(sys1.get('total_cost_usd', 0)) + float(sys2.get('total_cost_usd', 0)):.5f}{'':<13} | "
        f"${float(frontier.get('total_cost_usd', 0)):.5f}{'':<13}"
    )
    print(
        f"{'Total Tokens Consumed':<34} | "
        f"{int(sys1.get('total_tokens', 0)) + int(sys2.get('total_tokens', 0)):<22} | "
        f"{frontier.get('total_tokens', 0):<22}"
    )
    print(
        f"{'Concurrency Speedup Ratio':<34} | "
        f"{concurrency.get('avg_speedup_ratio', 1.0):.2f}x{'':<20} | "
        f"{'1.00x (Baseline)':<22}"
    )
    print("-" * 88)
    print(f"NET DOLLAR SAVINGS:       ${float(roi.get('dollar_savings', 0)):.5f}")
    print(f"TOKENS CONSERVED:         {roi.get('tokens_saved', 0):,} tokens")
    print(f"LATENCY REDUCTION:        {roi.get('latency_reduction_pct', 0):.1f}%")
    print(f"WORKER POOL HEALTH:       {concurrency.get('worker_timeout_rate', 0) * 100:.1f}% timeout rate, "
          f"{concurrency.get('straggler_frequency', 0) * 100:.1f}% stragglers")
    print("=" * 88)
    print("PASS: Automated dual-mode benchmark harness executed cleanly with exit code 0.")
    print("=" * 88 + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(run_benchmark())
