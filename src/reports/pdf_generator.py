import logging
from datetime import datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).parent / "templates"
OUTPUT_DIR = Path("reports_output")


def generate_pdf_report(report_data: dict, report_type: str, project_name: str) -> str:
    """Generate a PDF report from report data. Returns the file path."""
    OUTPUT_DIR.mkdir(exist_ok=True)

    env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))
    template = env.get_template("report.html")

    html_content = template.render(
        report=report_data,
        report_type=report_type,
        project_name=project_name,
        generated_at=datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    )

    filename = f"{project_name}_{report_type}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    filepath = OUTPUT_DIR / filename

    try:
        from weasyprint import HTML

        HTML(string=html_content).write_pdf(str(filepath))
        logger.info(f"PDF report generated: {filepath}")
    except ImportError:
        # Fallback: save as HTML if weasyprint not installed
        html_path = filepath.with_suffix(".html")
        html_path.write_text(html_content, encoding="utf-8")
        logger.warning(f"WeasyPrint not available, saved HTML: {html_path}")
        return str(html_path)

    return str(filepath)
