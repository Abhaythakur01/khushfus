"""
PDF report renderer using ReportLab.

Generates professional, enterprise-grade PDF reports with charts, tables,
and branded styling for the KhushFus social listening platform.
"""

import logging
from datetime import datetime
from pathlib import Path

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

logger = logging.getLogger(__name__)

# Brand colors
COLOR_DARK_BLUE = colors.HexColor("#1e293b")
COLOR_INDIGO = colors.HexColor("#6366f1")
COLOR_INDIGO_LIGHT = colors.HexColor("#a5b4fc")
COLOR_POSITIVE = colors.HexColor("#22c55e")
COLOR_NEGATIVE = colors.HexColor("#ef4444")
COLOR_NEUTRAL = colors.HexColor("#f59e0b")
COLOR_MIXED = colors.HexColor("#8b5cf6")
COLOR_LIGHT_GRAY = colors.HexColor("#f1f5f9")
COLOR_MID_GRAY = colors.HexColor("#94a3b8")
COLOR_WHITE = colors.white
COLOR_BLACK = colors.HexColor("#0f172a")

PAGE_WIDTH, PAGE_HEIGHT = A4


class PDFRenderer:
    """Renders report data as a professional branded PDF document."""

    def __init__(self):
        self._styles = getSampleStyleSheet()
        self._init_custom_styles()

    def _init_custom_styles(self):
        """Register custom paragraph styles for the report."""
        self._styles.add(ParagraphStyle(
            "CoverTitle",
            parent=self._styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=28,
            textColor=COLOR_WHITE,
            alignment=TA_CENTER,
            spaceAfter=12,
        ))
        self._styles.add(ParagraphStyle(
            "CoverSubtitle",
            parent=self._styles["Normal"],
            fontName="Helvetica",
            fontSize=14,
            textColor=COLOR_INDIGO_LIGHT,
            alignment=TA_CENTER,
            spaceAfter=6,
        ))
        self._styles.add(ParagraphStyle(
            "SectionHeader",
            parent=self._styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=16,
            textColor=COLOR_DARK_BLUE,
            spaceBefore=20,
            spaceAfter=10,
            borderWidth=0,
            borderPadding=0,
            borderColor=COLOR_INDIGO,
        ))
        self._styles.add(ParagraphStyle(
            "SubHeader",
            parent=self._styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            textColor=COLOR_DARK_BLUE,
            spaceBefore=12,
            spaceAfter=6,
        ))
        self._styles.add(ParagraphStyle(
            "BodyText2",
            parent=self._styles["Normal"],
            fontName="Helvetica",
            fontSize=10,
            textColor=COLOR_BLACK,
            spaceBefore=4,
            spaceAfter=4,
        ))
        self._styles.add(ParagraphStyle(
            "MetricValue",
            parent=self._styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=20,
            textColor=COLOR_INDIGO,
            alignment=TA_CENTER,
        ))
        self._styles.add(ParagraphStyle(
            "MetricLabel",
            parent=self._styles["Normal"],
            fontName="Helvetica",
            fontSize=9,
            textColor=COLOR_MID_GRAY,
            alignment=TA_CENTER,
        ))
        self._styles.add(ParagraphStyle(
            "FooterStyle",
            parent=self._styles["Normal"],
            fontName="Helvetica",
            fontSize=7,
            textColor=COLOR_MID_GRAY,
            alignment=TA_CENTER,
        ))

    def render(self, data: dict, project_name: str, report_type: str, output_path: str) -> str:
        """Generate a branded PDF report.

        Args:
            data: Aggregated report data dict.
            project_name: Name of the project.
            report_type: One of hourly/daily/weekly/monthly/yearly.
            output_path: File path for the output PDF.

        Returns:
            The absolute path to the generated PDF file.
        """
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        doc = SimpleDocTemplate(
            str(path),
            pagesize=A4,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
            leftMargin=2 * cm,
            rightMargin=2 * cm,
            title=f"KhushFus {report_type.title()} Report - {project_name}",
            author="KhushFus Social Listening Platform",
        )

        elements = []
        elements.extend(self._build_cover_page(data, project_name, report_type))
        elements.append(PageBreak())
        elements.extend(self._build_executive_summary(data))
        elements.append(PageBreak())
        elements.extend(self._build_sentiment_analysis(data))
        elements.append(PageBreak())
        elements.extend(self._build_mention_volume_trend(data))
        elements.extend(self._build_platform_breakdown(data))
        elements.append(PageBreak())
        elements.extend(self._build_top_influencers(data))
        elements.append(PageBreak())
        elements.extend(self._build_topic_analysis(data))
        elements.extend(self._build_engagement_insights(data))
        elements.append(PageBreak())
        elements.extend(self._build_crisis_brand_health(data))
        elements.extend(self._build_language_distribution(data))

        doc.build(elements, onFirstPage=self._page_template, onLaterPages=self._page_template)
        logger.info("PDF report generated: %s", path)
        return str(path.resolve())

    # ------------------------------------------------------------------
    # Page template (header / footer / watermark)
    # ------------------------------------------------------------------

    def _page_template(self, canvas, doc):
        """Draw header, footer, and watermark on every page."""
        canvas.saveState()

        # Header bar
        canvas.setFillColor(COLOR_DARK_BLUE)
        canvas.rect(0, PAGE_HEIGHT - 1.2 * cm, PAGE_WIDTH, 1.2 * cm, fill=1, stroke=0)
        canvas.setFillColor(COLOR_WHITE)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.drawString(2 * cm, PAGE_HEIGHT - 0.8 * cm, "KhushFus Social Listening")
        canvas.drawRightString(PAGE_WIDTH - 2 * cm, PAGE_HEIGHT - 0.8 * cm, "CONFIDENTIAL")

        # Footer
        canvas.setFillColor(COLOR_MID_GRAY)
        canvas.setFont("Helvetica", 7)
        canvas.drawCentredString(
            PAGE_WIDTH / 2, 1 * cm,
            f"Page {doc.page}  |  Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}  |  KhushFus Platform",
        )

        # Accent line under header
        canvas.setStrokeColor(COLOR_INDIGO)
        canvas.setLineWidth(2)
        canvas.line(0, PAGE_HEIGHT - 1.2 * cm, PAGE_WIDTH, PAGE_HEIGHT - 1.2 * cm)

        # Confidential watermark (very faint)
        canvas.setFillColor(colors.Color(0, 0, 0, alpha=0.03))
        canvas.setFont("Helvetica-Bold", 60)
        canvas.saveState()
        canvas.translate(PAGE_WIDTH / 2, PAGE_HEIGHT / 2)
        canvas.rotate(45)
        canvas.drawCentredString(0, 0, "CONFIDENTIAL")
        canvas.restoreState()

        canvas.restoreState()

    # ------------------------------------------------------------------
    # Section builders
    # ------------------------------------------------------------------

    def _build_cover_page(self, data: dict, project_name: str, report_type: str) -> list:
        """Build the branded cover page."""
        elements = []

        # Large spacer to push content down
        elements.append(Spacer(1, 6 * cm))

        # Background block rendered via a colored table
        period_start = data.get("period_start", "N/A")
        period_end = data.get("period_end", "N/A")

        cover_data = [
            [Paragraph("KhushFus", self._styles["CoverTitle"])],
            [Paragraph("Social Listening Platform", self._styles["CoverSubtitle"])],
            [Spacer(1, 1 * cm)],
            [Paragraph(f"{report_type.title()} Report", ParagraphStyle(
                "CoverReportType",
                fontName="Helvetica-Bold",
                fontSize=22,
                textColor=COLOR_WHITE,
                alignment=TA_CENTER,
            ))],
            [Spacer(1, 0.5 * cm)],
            [Paragraph(project_name, ParagraphStyle(
                "CoverProjectName",
                fontName="Helvetica",
                fontSize=16,
                textColor=COLOR_INDIGO_LIGHT,
                alignment=TA_CENTER,
            ))],
            [Spacer(1, 0.5 * cm)],
            [Paragraph(f"{period_start}  to  {period_end}", ParagraphStyle(
                "CoverPeriod",
                fontName="Helvetica",
                fontSize=11,
                textColor=COLOR_INDIGO_LIGHT,
                alignment=TA_CENTER,
            ))],
            [Spacer(1, 1 * cm)],
            [Paragraph(
                f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
                ParagraphStyle(
                    "CoverDate",
                    fontName="Helvetica",
                    fontSize=9,
                    textColor=COLOR_MID_GRAY,
                    alignment=TA_CENTER,
                ),
            )],
        ]

        available_width = PAGE_WIDTH - 4 * cm
        cover_table = Table(cover_data, colWidths=[available_width])
        cover_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), COLOR_DARK_BLUE),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 20),
            ("RIGHTPADDING", (0, 0), (-1, -1), 20),
            ("ROUNDEDCORNERS", [8, 8, 8, 8]),
        ]))

        elements.append(cover_table)
        return elements

    def _build_executive_summary(self, data: dict) -> list:
        """Build the executive summary section with KPI cards."""
        elements = []
        elements.append(Paragraph("Executive Summary", self._styles["SectionHeader"]))
        elements.append(Spacer(1, 0.3 * cm))

        total_mentions = data.get("total_mentions", 0)
        sentiment = data.get("sentiment", {})
        avg_score = sentiment.get("average_score", 0.0)
        engagement = data.get("engagement", {})
        total_reach = engagement.get("total_reach", 0)
        brand_health = data.get("brand_health", {})
        bh_score = brand_health.get("score", 0.0)
        bh_grade = brand_health.get("grade", "N/A")

        # KPI grid (2x2)
        kpi_data = [
            [
                self._kpi_cell("Total Mentions", f"{total_mentions:,}"),
                self._kpi_cell("Avg Sentiment", f"{avg_score:+.2f}"),
            ],
            [
                self._kpi_cell("Total Reach", self._format_number(total_reach)),
                self._kpi_cell("Brand Health", f"{bh_score:.0f}/100 ({bh_grade})"),
            ],
        ]

        col_width = (PAGE_WIDTH - 4 * cm - 0.5 * cm) / 2
        kpi_table = Table(kpi_data, colWidths=[col_width, col_width])
        kpi_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), COLOR_LIGHT_GRAY),
            ("BACKGROUND", (1, 0), (1, 0), COLOR_LIGHT_GRAY),
            ("BACKGROUND", (0, 1), (0, 1), COLOR_LIGHT_GRAY),
            ("BACKGROUND", (1, 1), (1, 1), COLOR_LIGHT_GRAY),
            ("BOX", (0, 0), (0, 0), 1, COLOR_INDIGO),
            ("BOX", (1, 0), (1, 0), 1, COLOR_INDIGO),
            ("BOX", (0, 1), (0, 1), 1, COLOR_INDIGO),
            ("BOX", (1, 1), (1, 1), 1, COLOR_INDIGO),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 12),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ]))

        elements.append(kpi_table)
        elements.append(Spacer(1, 0.5 * cm))

        # Summary text
        breakdown = sentiment.get("breakdown", {})
        positive = breakdown.get("positive", 0)
        negative = breakdown.get("negative", 0)
        neutral = breakdown.get("neutral", 0)
        mixed = breakdown.get("mixed", 0)

        summary = (
            f"During this reporting period, <b>{total_mentions:,}</b> mentions were collected. "
            f"Sentiment was distributed as: <font color='#22c55e'>{positive:,} positive</font>, "
            f"<font color='#ef4444'>{negative:,} negative</font>, "
            f"<font color='#f59e0b'>{neutral:,} neutral</font>, and "
            f"<font color='#8b5cf6'>{mixed:,} mixed</font>. "
            f"Total engagement reached <b>{self._format_number(total_reach)}</b> impressions."
        )
        elements.append(Paragraph(summary, self._styles["BodyText2"]))
        return elements

    def _build_sentiment_analysis(self, data: dict) -> list:
        """Build the sentiment analysis section."""
        elements = []
        elements.append(Paragraph("Sentiment Analysis", self._styles["SectionHeader"]))
        elements.append(Spacer(1, 0.3 * cm))

        # Sentiment breakdown table
        sentiment = data.get("sentiment", {})
        breakdown = sentiment.get("breakdown", {})

        table_data = [
            [
                Paragraph("<b>Sentiment</b>", self._styles["BodyText2"]),
                Paragraph("<b>Count</b>", self._styles["BodyText2"]),
                Paragraph("<b>Percentage</b>", self._styles["BodyText2"]),
                Paragraph("<b>Indicator</b>", self._styles["BodyText2"]),
            ],
        ]

        total = sum(breakdown.values()) or 1
        sentiment_colors = {
            "positive": COLOR_POSITIVE,
            "negative": COLOR_NEGATIVE,
            "neutral": COLOR_NEUTRAL,
            "mixed": COLOR_MIXED,
        }

        for label in ["positive", "negative", "neutral", "mixed"]:
            count = breakdown.get(label, 0)
            pct = (count / total) * 100

            # Progress bar as a small drawing
            bar = self._progress_bar(pct / 100, sentiment_colors.get(label, COLOR_MID_GRAY), width=120, height=12)
            table_data.append([
                Paragraph(label.title(), self._styles["BodyText2"]),
                Paragraph(f"{count:,}", self._styles["BodyText2"]),
                Paragraph(f"{pct:.1f}%", self._styles["BodyText2"]),
                bar,
            ])

        avail_width = PAGE_WIDTH - 4 * cm
        widths = [avail_width * 0.2, avail_width * 0.2, avail_width * 0.2, avail_width * 0.4]
        sent_table = Table(table_data, colWidths=widths)
        sent_table.setStyle(self._alternating_table_style(len(table_data)))
        elements.append(sent_table)
        elements.append(Spacer(1, 0.5 * cm))

        # Momentum indicator
        sentiment_trends = data.get("sentiment_trends", {})
        momentum = sentiment_trends.get("momentum", 0.0)
        if momentum > 0.05:
            momentum_text = f"Sentiment momentum: <font color='#22c55e'><b>Improving</b> (+{momentum:.3f})</font>"
        elif momentum < -0.05:
            momentum_text = f"Sentiment momentum: <font color='#ef4444'><b>Declining</b> ({momentum:.3f})</font>"
        else:
            momentum_text = f"Sentiment momentum: <b>Stable</b> ({momentum:.3f})"
        elements.append(Paragraph(momentum_text, self._styles["BodyText2"]))
        elements.append(Spacer(1, 0.3 * cm))

        # Spike alerts
        spikes = sentiment_trends.get("spikes", [])
        if spikes:
            elements.append(Paragraph("<b>Sentiment Spikes Detected:</b>", self._styles["SubHeader"]))
            for spike in spikes[:5]:
                direction = spike.get("direction", "unknown")
                date = spike.get("date", "N/A")
                magnitude = spike.get("magnitude", spike.get("deviation", 0))
                color = "#ef4444" if "negative" in direction else "#22c55e"
                elements.append(Paragraph(
                    f"&bull; <font color='{color}'>{date}</font>: {direction.replace('_', ' ').title()} "
                    f"(magnitude: {magnitude:.3f})",
                    self._styles["BodyText2"],
                ))
        return elements

    def _build_mention_volume_trend(self, data: dict) -> list:
        """Build the daily mention volume trend chart."""
        elements = []
        elements.append(Paragraph("Mention Volume Trend", self._styles["SectionHeader"]))
        elements.append(Spacer(1, 0.3 * cm))

        daily_trend = data.get("daily_trend", [])
        if not daily_trend:
            elements.append(Paragraph("No trend data available for this period.", self._styles["BodyText2"]))
            return elements

        # Use a vertical bar chart for daily mention counts
        chart_width = PAGE_WIDTH - 4 * cm
        chart_height = 180

        drawing = Drawing(chart_width, chart_height)
        chart = VerticalBarChart()
        chart.x = 50
        chart.y = 30
        chart.width = chart_width - 80
        chart.height = chart_height - 50

        mentions_data = [entry.get("mentions", 0) for entry in daily_trend]
        chart.data = [mentions_data]
        chart.bars[0].fillColor = COLOR_INDIGO
        chart.bars[0].strokeColor = None

        # Category axis labels (dates)
        labels = [entry.get("date", "")[-5:] for entry in daily_trend]  # MM-DD
        chart.categoryAxis.categoryNames = labels
        chart.categoryAxis.labels.fontName = "Helvetica"
        chart.categoryAxis.labels.fontSize = 6
        chart.categoryAxis.labels.angle = 45 if len(labels) > 14 else 0
        chart.categoryAxis.labels.textAnchor = "end" if len(labels) > 14 else "middle"

        chart.valueAxis.valueMin = 0
        chart.valueAxis.labels.fontName = "Helvetica"
        chart.valueAxis.labels.fontSize = 7

        drawing.add(chart)
        elements.append(drawing)
        elements.append(Spacer(1, 0.5 * cm))
        return elements

    def _build_platform_breakdown(self, data: dict) -> list:
        """Build the platform mentions breakdown."""
        elements = []
        elements.append(Paragraph("Platform Breakdown", self._styles["SectionHeader"]))
        elements.append(Spacer(1, 0.3 * cm))

        platforms = data.get("platforms", {})
        if not platforms:
            elements.append(Paragraph("No platform data available.", self._styles["BodyText2"]))
            return elements

        # Sort by count descending
        sorted_platforms = sorted(platforms.items(), key=lambda x: x[1], reverse=True)
        total = sum(v for _, v in sorted_platforms) or 1

        table_data = [
            [
                Paragraph("<b>Platform</b>", self._styles["BodyText2"]),
                Paragraph("<b>Mentions</b>", self._styles["BodyText2"]),
                Paragraph("<b>Share</b>", self._styles["BodyText2"]),
                Paragraph("<b>Distribution</b>", self._styles["BodyText2"]),
            ],
        ]

        for platform, count in sorted_platforms:
            pct = (count / total) * 100
            bar = self._progress_bar(pct / 100, COLOR_INDIGO, width=140, height=10)
            table_data.append([
                Paragraph(platform.title(), self._styles["BodyText2"]),
                Paragraph(f"{count:,}", self._styles["BodyText2"]),
                Paragraph(f"{pct:.1f}%", self._styles["BodyText2"]),
                bar,
            ])

        avail_width = PAGE_WIDTH - 4 * cm
        plat_table = Table(
            table_data,
            colWidths=[avail_width * 0.2, avail_width * 0.15, avail_width * 0.15, avail_width * 0.5],
        )
        plat_table.setStyle(self._alternating_table_style(len(table_data)))
        elements.append(plat_table)
        elements.append(Spacer(1, 0.5 * cm))
        return elements

    def _build_top_influencers(self, data: dict) -> list:
        """Build the top influencers table."""
        elements = []
        elements.append(Paragraph("Top Influencers", self._styles["SectionHeader"]))
        elements.append(Spacer(1, 0.3 * cm))

        influencers_data = data.get("influencers", {})
        influencers = influencers_data.get("influencers", [])
        if not influencers:
            elements.append(Paragraph("No influencer data available.", self._styles["BodyText2"]))
            return elements

        table_data = [
            [
                Paragraph("<b>#</b>", self._styles["BodyText2"]),
                Paragraph("<b>Name</b>", self._styles["BodyText2"]),
                Paragraph("<b>Handle</b>", self._styles["BodyText2"]),
                Paragraph("<b>Platform</b>", self._styles["BodyText2"]),
                Paragraph("<b>Followers</b>", self._styles["BodyText2"]),
                Paragraph("<b>Mentions</b>", self._styles["BodyText2"]),
                Paragraph("<b>Score</b>", self._styles["BodyText2"]),
            ],
        ]

        for idx, inf in enumerate(influencers[:15], 1):
            table_data.append([
                Paragraph(str(idx), self._styles["BodyText2"]),
                Paragraph(str(inf.get("name", "Unknown")), self._styles["BodyText2"]),
                Paragraph(str(inf.get("handle", "")), self._styles["BodyText2"]),
                Paragraph(str(inf.get("platform", "")).title(), self._styles["BodyText2"]),
                Paragraph(self._format_number(inf.get("followers", 0)), self._styles["BodyText2"]),
                Paragraph(str(inf.get("mentions", 0)), self._styles["BodyText2"]),
                Paragraph(f"{inf.get('score', 0):.1f}", self._styles["BodyText2"]),
            ])

        avail_width = PAGE_WIDTH - 4 * cm
        inf_table = Table(
            table_data,
            colWidths=[
                avail_width * 0.05,
                avail_width * 0.18,
                avail_width * 0.18,
                avail_width * 0.12,
                avail_width * 0.15,
                avail_width * 0.12,
                avail_width * 0.12,
            ],
        )
        inf_table.setStyle(self._alternating_table_style(len(table_data)))
        elements.append(inf_table)
        return elements

    def _build_topic_analysis(self, data: dict) -> list:
        """Build the topic clusters analysis section."""
        elements = []
        elements.append(Paragraph("Topic Analysis", self._styles["SectionHeader"]))
        elements.append(Spacer(1, 0.3 * cm))

        topics_data = data.get("topics", {})
        clusters = topics_data.get("clusters", [])
        if not clusters:
            elements.append(Paragraph("No topic clusters identified.", self._styles["BodyText2"]))
            return elements

        table_data = [
            [
                Paragraph("<b>Cluster</b>", self._styles["BodyText2"]),
                Paragraph("<b>Key Terms</b>", self._styles["BodyText2"]),
                Paragraph("<b>Mentions</b>", self._styles["BodyText2"]),
            ],
        ]

        for cluster in clusters[:20]:
            terms = cluster.get("terms", [])
            terms_str = ", ".join(terms[:8])
            if len(terms) > 8:
                terms_str += f" (+{len(terms) - 8} more)"
            table_data.append([
                Paragraph(f"#{cluster.get('id', '?')}", self._styles["BodyText2"]),
                Paragraph(terms_str, self._styles["BodyText2"]),
                Paragraph(f"{cluster.get('mention_count', 0):,}", self._styles["BodyText2"]),
            ])

        avail_width = PAGE_WIDTH - 4 * cm
        topic_table = Table(
            table_data,
            colWidths=[avail_width * 0.12, avail_width * 0.65, avail_width * 0.23],
        )
        topic_table.setStyle(self._alternating_table_style(len(table_data)))
        elements.append(topic_table)
        elements.append(Spacer(1, 0.5 * cm))
        return elements

    def _build_engagement_insights(self, data: dict) -> list:
        """Build the engagement insights section with best posting times."""
        elements = []
        elements.append(Paragraph("Engagement Insights", self._styles["SectionHeader"]))
        elements.append(Spacer(1, 0.3 * cm))

        engagement_analysis = data.get("engagement_analysis", {})

        # Best posting times by hour
        by_hour = engagement_analysis.get("by_hour", [])
        if by_hour:
            elements.append(Paragraph("Best Posting Times (by Hour)", self._styles["SubHeader"]))

            # Sort by avg engagement descending and show top 10
            sorted_hours = sorted(by_hour, key=lambda x: x.get("avg_engagement", 0), reverse=True)
            max_eng = sorted_hours[0].get("avg_engagement", 1) if sorted_hours else 1

            table_data = [
                [
                    Paragraph("<b>Hour (UTC)</b>", self._styles["BodyText2"]),
                    Paragraph("<b>Avg Engagement</b>", self._styles["BodyText2"]),
                    Paragraph("<b>Relative</b>", self._styles["BodyText2"]),
                ],
            ]
            for entry in sorted_hours[:10]:
                hour = entry.get("hour", 0)
                avg_eng = entry.get("avg_engagement", 0)
                rel = avg_eng / max_eng if max_eng > 0 else 0
                bar = self._progress_bar(rel, COLOR_INDIGO, width=140, height=10)
                table_data.append([
                    Paragraph(f"{hour:02d}:00 - {hour:02d}:59", self._styles["BodyText2"]),
                    Paragraph(f"{avg_eng:,.0f}", self._styles["BodyText2"]),
                    bar,
                ])

            avail_width = PAGE_WIDTH - 4 * cm
            hour_table = Table(
                table_data,
                colWidths=[avail_width * 0.25, avail_width * 0.25, avail_width * 0.5],
            )
            hour_table.setStyle(self._alternating_table_style(len(table_data)))
            elements.append(hour_table)
            elements.append(Spacer(1, 0.4 * cm))

        # Engagement by platform
        by_platform = engagement_analysis.get("by_platform", [])
        if by_platform:
            elements.append(Paragraph("Engagement by Platform", self._styles["SubHeader"]))

            table_data = [
                [
                    Paragraph("<b>Platform</b>", self._styles["BodyText2"]),
                    Paragraph("<b>Avg Likes</b>", self._styles["BodyText2"]),
                    Paragraph("<b>Avg Shares</b>", self._styles["BodyText2"]),
                    Paragraph("<b>Avg Comments</b>", self._styles["BodyText2"]),
                    Paragraph("<b>Total Engagement</b>", self._styles["BodyText2"]),
                ],
            ]
            for entry in by_platform:
                platform = entry.get("platform", "unknown")
                table_data.append([
                    Paragraph(platform.title(), self._styles["BodyText2"]),
                    Paragraph(f"{entry.get('avg_likes', 0):,.0f}", self._styles["BodyText2"]),
                    Paragraph(f"{entry.get('avg_shares', 0):,.0f}", self._styles["BodyText2"]),
                    Paragraph(f"{entry.get('avg_comments', 0):,.0f}", self._styles["BodyText2"]),
                    Paragraph(f"{entry.get('total_engagement', 0):,}", self._styles["BodyText2"]),
                ])

            avail_width = PAGE_WIDTH - 4 * cm
            plat_eng_table = Table(
                table_data,
                colWidths=[avail_width * 0.2] * 5,
            )
            plat_eng_table.setStyle(self._alternating_table_style(len(table_data)))
            elements.append(plat_eng_table)

        elements.append(Spacer(1, 0.5 * cm))
        return elements

    def _build_crisis_brand_health(self, data: dict) -> list:
        """Build the crisis and brand health section."""
        elements = []
        elements.append(Paragraph("Brand Health & Crisis Status", self._styles["SectionHeader"]))
        elements.append(Spacer(1, 0.3 * cm))

        # Brand health
        brand_health = data.get("brand_health", {})
        bh_score = brand_health.get("score", 0.0)
        bh_grade = brand_health.get("grade", "N/A")
        bh_trend = brand_health.get("trend", "stable")

        if bh_score >= 70:
            score_color = "#22c55e"
        elif bh_score >= 40:
            score_color = "#f59e0b"
        else:
            score_color = "#ef4444"

        elements.append(Paragraph(
            f"Brand Health Score: <font color='{score_color}'><b>{bh_score:.0f}/100</b></font> "
            f"(Grade: <b>{bh_grade}</b>, Trend: {bh_trend.title()})",
            self._styles["BodyText2"],
        ))
        elements.append(Spacer(1, 0.3 * cm))

        # Component breakdown
        components = brand_health.get("components", {})
        if components:
            elements.append(Paragraph("Score Components:", self._styles["SubHeader"]))
            table_data = [
                [
                    Paragraph("<b>Component</b>", self._styles["BodyText2"]),
                    Paragraph("<b>Score</b>", self._styles["BodyText2"]),
                    Paragraph("<b>Rating</b>", self._styles["BodyText2"]),
                ],
            ]
            for comp_name, comp_value in components.items():
                if isinstance(comp_value, dict):
                    score = comp_value.get("score", 0)
                else:
                    score = float(comp_value)
                bar = self._progress_bar(score / 100, COLOR_INDIGO, width=140, height=10)
                table_data.append([
                    Paragraph(comp_name.replace("_", " ").title(), self._styles["BodyText2"]),
                    Paragraph(f"{score:.0f}", self._styles["BodyText2"]),
                    bar,
                ])

            avail_width = PAGE_WIDTH - 4 * cm
            comp_table = Table(
                table_data,
                colWidths=[avail_width * 0.3, avail_width * 0.15, avail_width * 0.55],
            )
            comp_table.setStyle(self._alternating_table_style(len(table_data)))
            elements.append(comp_table)
            elements.append(Spacer(1, 0.4 * cm))

        # Crisis status
        crisis = data.get("crisis", {})
        is_crisis = crisis.get("is_crisis", False)
        if is_crisis:
            severity = crisis.get("severity", "unknown")
            summary = crisis.get("summary", "No details available.")
            sev_color = "#ef4444" if severity in ("high", "critical") else "#f59e0b"
            elements.append(Paragraph(
                f"<font color='{sev_color}'><b>CRISIS ALERT — Severity: {severity.upper()}</b></font>",
                self._styles["BodyText2"],
            ))
            elements.append(Paragraph(summary, self._styles["BodyText2"]))
        else:
            elements.append(Paragraph(
                "<font color='#22c55e'><b>No active crisis detected.</b></font>",
                self._styles["BodyText2"],
            ))

        elements.append(Spacer(1, 0.5 * cm))
        return elements

    def _build_language_distribution(self, data: dict) -> list:
        """Build the language distribution table."""
        elements = []
        elements.append(Paragraph("Language Distribution", self._styles["SectionHeader"]))
        elements.append(Spacer(1, 0.3 * cm))

        languages = data.get("languages", {})
        distribution = languages.get("distribution", [])
        if not distribution:
            elements.append(Paragraph("No language data available.", self._styles["BodyText2"]))
            return elements

        table_data = [
            [
                Paragraph("<b>Language</b>", self._styles["BodyText2"]),
                Paragraph("<b>Mentions</b>", self._styles["BodyText2"]),
                Paragraph("<b>Percentage</b>", self._styles["BodyText2"]),
                Paragraph("<b>Distribution</b>", self._styles["BodyText2"]),
            ],
        ]

        for lang in distribution[:15]:
            pct = lang.get("percentage", 0)
            bar = self._progress_bar(pct / 100, COLOR_INDIGO, width=120, height=10)
            table_data.append([
                Paragraph(str(lang.get("language", "Unknown")), self._styles["BodyText2"]),
                Paragraph(f"{lang.get('count', 0):,}", self._styles["BodyText2"]),
                Paragraph(f"{pct:.1f}%", self._styles["BodyText2"]),
                bar,
            ])

        avail_width = PAGE_WIDTH - 4 * cm
        lang_table = Table(
            table_data,
            colWidths=[avail_width * 0.2, avail_width * 0.2, avail_width * 0.2, avail_width * 0.4],
        )
        lang_table.setStyle(self._alternating_table_style(len(table_data)))
        elements.append(lang_table)
        return elements

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _kpi_cell(self, label: str, value: str) -> Table:
        """Create a KPI card as a mini table."""
        cell_data = [
            [Paragraph(value, self._styles["MetricValue"])],
            [Paragraph(label, self._styles["MetricLabel"])],
        ]
        t = Table(cell_data, colWidths=[6 * cm])
        t.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        return t

    def _progress_bar(self, ratio: float, color, width: float = 120, height: float = 10) -> Drawing:
        """Draw a simple colored progress bar."""
        ratio = max(0.0, min(1.0, ratio))
        d = Drawing(width, height)
        # Background
        d.add(Drawing._drawingClass(width, height))
        from reportlab.graphics.shapes import Rect
        bg = Rect(0, 0, width, height, fillColor=COLOR_LIGHT_GRAY, strokeColor=None)
        d.add(bg)
        # Fill
        if ratio > 0:
            fill = Rect(0, 0, width * ratio, height, fillColor=color, strokeColor=None)
            d.add(fill)
        return d

    def _alternating_table_style(self, num_rows: int) -> TableStyle:
        """Create a table style with alternating row colors and professional borders."""
        commands = [
            # Header row
            ("BACKGROUND", (0, 0), (-1, 0), COLOR_DARK_BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), COLOR_WHITE),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
            ("TOPPADDING", (0, 0), (-1, 0), 8),
            # All cells
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("TOPPADDING", (0, 1), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            # Grid lines
            ("LINEBELOW", (0, 0), (-1, 0), 1, COLOR_INDIGO),
            ("LINEBELOW", (0, -1), (-1, -1), 0.5, COLOR_MID_GRAY),
            ("LINEAFTER", (0, 0), (-2, -1), 0.25, colors.Color(0, 0, 0, alpha=0.1)),
        ]
        # Alternating row backgrounds
        for i in range(1, num_rows):
            if i % 2 == 0:
                commands.append(("BACKGROUND", (0, i), (-1, i), COLOR_LIGHT_GRAY))
            else:
                commands.append(("BACKGROUND", (0, i), (-1, i), COLOR_WHITE))

        return TableStyle(commands)

    @staticmethod
    def _format_number(n) -> str:
        """Format large numbers with K/M/B suffixes."""
        n = int(n or 0)
        if n >= 1_000_000_000:
            return f"{n / 1_000_000_000:.1f}B"
        elif n >= 1_000_000:
            return f"{n / 1_000_000:.1f}M"
        elif n >= 1_000:
            return f"{n / 1_000:.1f}K"
        return f"{n:,}"
