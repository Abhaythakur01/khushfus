"""
High-level report generator that orchestrates data aggregation and rendering.

Coordinates between data sources and renderers (PDF, PPTX) to produce
enterprise-grade reports for the KhushFus social listening platform.
"""

import logging

logger = logging.getLogger(__name__)


class ReportGenerator:
    """Orchestrates report generation across multiple formats."""

    SUPPORTED_FORMATS = ("pdf", "pptx")

    def __init__(self, report_data: dict, report_type: str, project_name: str):
        self.data = report_data
        self.report_type = report_type
        self.project_name = project_name

    def generate(self, fmt: str = "pdf", output_path: str | None = None) -> str:
        """Generate a report in the specified format.

        Args:
            fmt: Output format - 'pdf' or 'pptx'
            output_path: Optional custom output path

        Returns:
            Path to the generated file
        """
        if fmt not in self.SUPPORTED_FORMATS:
            raise ValueError(f"Unsupported format: {fmt}. Use one of {self.SUPPORTED_FORMATS}")

        if fmt == "pptx":
            return self._generate_pptx(output_path)
        return self._generate_pdf(output_path)

    def _generate_pdf(self, output_path: str | None = None) -> str:
        from src.reports.pdf_renderer import PDFRenderer

        renderer = PDFRenderer(self.data, self.report_type, self.project_name)
        return renderer.render(output_path)

    def _generate_pptx(self, output_path: str | None = None) -> str:
        from src.reports.pptx_renderer import PPTXRenderer

        renderer = PPTXRenderer(self.data, self.report_type, self.project_name)
        return renderer.render(output_path)
