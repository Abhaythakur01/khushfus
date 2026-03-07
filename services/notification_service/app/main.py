"""
Notification Service — real-time alerts and notifications.

Responsibilities:
1. Consumes analyzed mentions from 'mentions:analyzed' stream
2. Evaluates alert rules per project (volume spikes, negative surges, influencer mentions)
3. Sends notifications via email, Slack webhooks, or custom webhooks
4. Logs all triggered alerts to the alert_logs table

Alert Types:
- volume_spike: Mention count exceeds N*threshold of rolling average
- negative_surge: Negative sentiment % exceeds threshold in time window
- influencer: Mention from author with followers > threshold
- keyword_surge: Specific keyword frequency spikes
"""

import asyncio
import json
import logging
import os
from collections import defaultdict
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx
from sqlalchemy import func, select

from shared.database import create_db
from shared.events import EventBus, STREAM_ANALYZED_MENTIONS, STREAM_ALERTS
from shared.models import AlertLog, AlertRule, AlertSeverity, Mention, Sentiment

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus"
)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

GROUP_NAME = "notification-service"
CONSUMER_NAME = f"notifier-{os.getpid()}"

# SMTP configuration for email notifications
SMTP_HOST = os.getenv("SMTP_HOST", "localhost")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "alerts@khushfus.io")

# In-memory counters for windowed analysis
mention_counts: dict[int, list[datetime]] = defaultdict(list)
negative_counts: dict[int, list[datetime]] = defaultdict(list)


async def evaluate_rules(session_factory, bus: EventBus, data: dict):
    """Check all active alert rules for the project against the new mention."""
    project_id = int(data.get("project_id", 0))
    sentiment = data.get("sentiment", "neutral")
    author_followers = int(data.get("author_followers", 0))
    now = datetime.utcnow()

    # Track in-memory counters
    mention_counts[project_id].append(now)
    if sentiment == "negative":
        negative_counts[project_id].append(now)

    # Cleanup old entries (keep last 2 hours)
    cutoff = now - timedelta(hours=2)
    mention_counts[project_id] = [t for t in mention_counts[project_id] if t > cutoff]
    negative_counts[project_id] = [t for t in negative_counts[project_id] if t > cutoff]

    async with session_factory() as db:
        result = await db.execute(
            select(AlertRule).where(
                AlertRule.project_id == project_id, AlertRule.is_active.is_(True)
            )
        )
        rules = result.scalars().all()

        for rule in rules:
            triggered = False
            severity = AlertSeverity.MEDIUM
            title = ""
            description = ""

            window_start = now - timedelta(minutes=rule.window_minutes)

            if rule.rule_type == "volume_spike":
                # Count mentions in window
                recent = len([t for t in mention_counts[project_id] if t > window_start])
                # Get historical average for this window size
                hist_count = await db.execute(
                    select(func.count(Mention.id)).where(
                        Mention.project_id == project_id,
                        Mention.collected_at >= now - timedelta(days=7),
                        Mention.collected_at < window_start,
                    )
                )
                hist_total = hist_count.scalar() or 1
                # Average per window over the past week
                windows_per_week = (7 * 24 * 60) / rule.window_minutes
                avg_per_window = hist_total / max(windows_per_week, 1)

                if avg_per_window > 0 and recent > avg_per_window * rule.threshold:
                    triggered = True
                    severity = AlertSeverity.HIGH if recent > avg_per_window * rule.threshold * 2 else AlertSeverity.MEDIUM
                    title = f"Volume Spike: {recent} mentions in {rule.window_minutes}min"
                    description = f"Average is {avg_per_window:.0f}, current is {recent} ({recent/avg_per_window:.1f}x)"

            elif rule.rule_type == "negative_surge":
                recent_total = len([t for t in mention_counts[project_id] if t > window_start])
                recent_negative = len([t for t in negative_counts[project_id] if t > window_start])
                if recent_total > 5:  # minimum sample size
                    neg_pct = recent_negative / recent_total
                    if neg_pct > rule.threshold / 100:  # threshold as percentage
                        triggered = True
                        severity = AlertSeverity.HIGH if neg_pct > 0.5 else AlertSeverity.MEDIUM
                        title = f"Negative Sentiment Surge: {neg_pct:.0%}"
                        description = f"{recent_negative}/{recent_total} mentions are negative in last {rule.window_minutes}min"

            elif rule.rule_type == "influencer":
                if author_followers >= rule.threshold:
                    triggered = True
                    severity = AlertSeverity.MEDIUM
                    author = data.get("author_name", data.get("author_handle", "Unknown"))
                    title = f"Influencer Mention: {author} ({author_followers:,} followers)"
                    description = f"Text: {data.get('text', '')[:200]}"

            if triggered:
                # Log the alert
                alert_log = AlertLog(
                    project_id=project_id,
                    rule_id=rule.id,
                    alert_type=rule.rule_type,
                    severity=severity,
                    title=title,
                    description=description,
                    data_json=json.dumps(data, default=str),
                )
                db.add(alert_log)
                await db.commit()

                # Send notifications
                await send_notifications(rule, title, description)

                logger.info(f"Alert triggered: [{severity.value}] {title}")


async def send_notifications(rule: AlertRule, title: str, description: str):
    """Send alert via configured channels."""
    channels = [c.strip() for c in rule.channels.split(",")]

    for channel in channels:
        if channel == "webhook" and rule.webhook_url:
            try:
                async with httpx.AsyncClient() as client:
                    await client.post(
                        rule.webhook_url,
                        json={
                            "alert_type": rule.rule_type,
                            "title": title,
                            "description": description,
                            "project_id": rule.project_id,
                            "timestamp": datetime.utcnow().isoformat(),
                        },
                        timeout=10.0,
                    )
            except Exception as e:
                logger.error(f"Webhook notification failed: {e}")

        elif channel == "slack" and rule.webhook_url:
            try:
                async with httpx.AsyncClient() as client:
                    await client.post(
                        rule.webhook_url,
                        json={
                            "text": f"*{title}*\n{description}",
                            "blocks": [
                                {"type": "header", "text": {"type": "plain_text", "text": title}},
                                {"type": "section", "text": {"type": "mrkdwn", "text": description}},
                            ],
                        },
                        timeout=10.0,
                    )
            except Exception as e:
                logger.error(f"Slack notification failed: {e}")

        elif channel == "email":
            await send_email_notification(rule, title, description)


async def send_email_notification(rule: AlertRule, title: str, description: str):
    """Send an alert notification via email using SMTP.

    Uses aiosmtplib if available for native async support, otherwise falls back
    to smtplib executed in a thread pool executor.
    """
    if not SMTP_HOST:
        logger.warning("SMTP_HOST not configured — skipping email notification")
        return

    # Build the email message
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[KhushFus Alert] {title}"
    msg["From"] = SMTP_FROM
    # Use a recipient from the rule's webhook_url field if it looks like an email,
    # otherwise fall back to SMTP_FROM (self-notify)
    recipient = SMTP_FROM
    if rule.webhook_url and "@" in rule.webhook_url:
        recipient = rule.webhook_url
    msg["To"] = recipient

    # Plain text body
    text_body = f"{title}\n\n{description}\n\nProject ID: {rule.project_id}\nRule: {rule.name}\nTimestamp: {datetime.utcnow().isoformat()}"
    # HTML body
    html_body = (
        f"<html><body>"
        f"<h2 style='color:#d32f2f;'>{title}</h2>"
        f"<p>{description}</p>"
        f"<hr/>"
        f"<p><small>Project ID: {rule.project_id} | Rule: {rule.name} | "
        f"{datetime.utcnow().isoformat()}</small></p>"
        f"</body></html>"
    )
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        import aiosmtplib

        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER or None,
            password=SMTP_PASSWORD or None,
            start_tls=True if SMTP_PORT == 587 else False,
        )
        logger.info("Email alert sent to %s: %s", recipient, title)
    except ImportError:
        # Fallback: use stdlib smtplib in a thread executor
        logger.debug("aiosmtplib not available, falling back to smtplib in executor")
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _send_email_sync, msg, recipient)
    except Exception as e:
        logger.error(f"Email notification failed: {e}")


def _send_email_sync(msg: MIMEMultipart, recipient: str):
    """Synchronous SMTP send, intended to be run via run_in_executor."""
    import smtplib

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
            if SMTP_PORT == 587:
                server.starttls()
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(msg["From"], [recipient], msg.as_string())
        logger.info("Email alert sent (sync) to %s: %s", recipient, msg["Subject"])
    except Exception as e:
        logger.error(f"Email notification failed (sync): {e}")


async def process_loop(bus: EventBus, session_factory):
    """Main loop: consume analyzed mentions, check alert rules."""
    await bus.ensure_group(STREAM_ANALYZED_MENTIONS, GROUP_NAME)
    logger.info("Notification Service listening for analyzed mentions...")

    while True:
        try:
            messages = await bus.consume(
                STREAM_ANALYZED_MENTIONS, GROUP_NAME, CONSUMER_NAME,
                count=20, block_ms=3000,
            )
            for msg_id, data in messages:
                try:
                    await evaluate_rules(session_factory, bus, data)
                except Exception as e:
                    logger.error(f"Alert evaluation failed: {e}")
                finally:
                    await bus.ack(STREAM_ANALYZED_MENTIONS, GROUP_NAME, msg_id)

        except Exception as e:
            logger.error(f"Notification loop error: {e}")
            await asyncio.sleep(1)


async def main():
    engine, session_factory = create_db(DATABASE_URL)
    bus = EventBus(REDIS_URL)
    await bus.connect()

    logger.info("Notification Service started")
    await process_loop(bus, session_factory)


if __name__ == "__main__":
    asyncio.run(main())
