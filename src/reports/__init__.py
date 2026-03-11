"""
Report generation package for KhushFus social listening platform.

Provides PDF and PPTX renderers for enterprise-grade report generation,
plus a high-level ReportGenerator that orchestrates data aggregation and rendering.
"""

from src.reports.generator import ReportGenerator
from src.reports.pdf_renderer import PDFRenderer
from src.reports.pptx_renderer import PPTXRenderer

__all__ = [
    "ReportGenerator",
    "PDFRenderer",
    "PPTXRenderer",
]
