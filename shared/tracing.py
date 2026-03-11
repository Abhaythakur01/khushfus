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
        if os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
            logger.warning(
                "OTEL_EXPORTER_OTLP_ENDPOINT is set but OpenTelemetry SDK is not installed — "
                "install opentelemetry-sdk to enable tracing for %s",
                service_name,
            )
        else:
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

    # --- W3C TraceContext propagation ---
    try:
        from opentelemetry.propagate import set_global_textmap
        from opentelemetry.propagators.composite import CompositePropagator
        from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

        propagator = CompositePropagator([TraceContextTextMapPropagator()])
        set_global_textmap(propagator)
        logger.debug("W3C TraceContext propagation configured")
    except ImportError:
        logger.debug("opentelemetry propagators not available — skipping W3C TraceContext setup")
    except Exception as exc:
        logger.warning("Failed to configure W3C TraceContext propagation: %s", exc)

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

    logger.info("OpenTelemetry tracing initialized for service '%s' -> %s", service_name, otlp_endpoint)


def extract_trace_context(headers: dict[str, str]) -> object | None:
    """Extract W3C TraceContext from incoming request headers.

    Returns an OpenTelemetry context object, or ``None`` when OTel is not
    installed.  The returned context can be passed to
    ``opentelemetry.context.attach()`` to propagate the trace.
    """
    try:
        from opentelemetry.propagate import extract

        return extract(carrier=headers)
    except ImportError:
        return None
    except Exception:
        logger.debug("Failed to extract trace context", exc_info=True)
        return None


def inject_trace_context(headers: dict[str, str]) -> dict[str, str]:
    """Inject the current span's ``traceparent`` header into *headers*.

    Modifies *headers* in-place and also returns it for convenience.
    When OTel is not installed the dict is returned unchanged.
    """
    try:
        from opentelemetry.propagate import inject

        inject(carrier=headers)
    except ImportError:
        pass
    except Exception:
        logger.debug("Failed to inject trace context", exc_info=True)
    return headers
