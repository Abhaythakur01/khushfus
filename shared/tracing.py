"""
Shared OpenTelemetry tracing setup for all KhushFus microservices.

Initializes distributed tracing with OTLP exporter targeting Jaeger.
All imports are inside try/except so services don't crash if OTel
packages aren't installed.

Usage:
    from shared.tracing import setup_tracing
    setup_tracing("gateway")
"""

import logging
import os

logger = logging.getLogger(__name__)


def setup_tracing(service_name: str) -> None:
    """
    Initialize OpenTelemetry tracing for the given service.

    Configures:
    - OTLP gRPC exporter (sends spans to Jaeger or any OTLP-compatible backend)
    - FastAPI auto-instrumentation
    - httpx auto-instrumentation (inter-service HTTP calls)
    - SQLAlchemy auto-instrumentation (database queries)
    - Redis auto-instrumentation (event bus / cache operations)

    The collector endpoint is configurable via the OTEL_EXPORTER_OTLP_ENDPOINT
    environment variable (default: http://jaeger:4317).

    If opentelemetry packages are not installed, this function silently returns
    without raising, so services can run without tracing enabled.
    """
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import SERVICE_NAME, Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        logger.debug("OpenTelemetry SDK not installed — tracing disabled for %s", service_name)
        return

    # Build resource with service name
    resource = Resource.create({SERVICE_NAME: service_name})

    # Configure the tracer provider
    provider = TracerProvider(resource=resource)

    # OTLP exporter targeting Jaeger (or any OTLP-compatible collector)
    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://jaeger:4317")
    exporter = OTLPSpanExporter(endpoint=otlp_endpoint, insecure=True)
    provider.add_span_processor(BatchSpanProcessor(exporter))

    # Set as the global tracer provider
    trace.set_tracer_provider(provider)

    # --- Auto-instrumentation ---

    # FastAPI
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument()
    except ImportError:
        logger.debug("opentelemetry-instrumentation-fastapi not installed — skipping")
    except Exception as exc:
        logger.warning("Failed to instrument FastAPI: %s", exc)

    # httpx (inter-service calls)
    try:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        HTTPXClientInstrumentor().instrument()
    except ImportError:
        logger.debug("opentelemetry-instrumentation-httpx not installed — skipping")
    except Exception as exc:
        logger.warning("Failed to instrument httpx: %s", exc)

    # SQLAlchemy
    try:
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

        SQLAlchemyInstrumentor().instrument()
    except ImportError:
        logger.debug("opentelemetry-instrumentation-sqlalchemy not installed — skipping")
    except Exception as exc:
        logger.warning("Failed to instrument SQLAlchemy: %s", exc)

    # Redis
    try:
        from opentelemetry.instrumentation.redis import RedisInstrumentor

        RedisInstrumentor().instrument()
    except ImportError:
        logger.debug("opentelemetry-instrumentation-redis not installed — skipping")
    except Exception as exc:
        logger.warning("Failed to instrument Redis: %s", exc)

    logger.info("OpenTelemetry tracing initialized for service '%s' → %s", service_name, otlp_endpoint)
