"""
Email Service for TenderFlow v4.0
Sends qualification result emails to Tender Managers via Power Automate webhook.
"""

import html
import logging
from typing import List, Optional
from datetime import datetime

import httpx

from config.settings import settings

logger = logging.getLogger(__name__)

_WEBHOOK_TIMEOUT = 15.0


def _webhook_configured() -> bool:
    url = (settings.power_automate_webhook or "").strip()
    return url.startswith("http://") or url.startswith("https://")


def _post_webhook(payload: dict) -> bool:
    """POST JSON payload to the Power Automate webhook (sync, with timeout)."""
    if not _webhook_configured():
        logger.error("[Email] Power Automate webhook URL is not configured")
        return False
    try:
        with httpx.Client(timeout=_WEBHOOK_TIMEOUT) as client:
            response = client.post(settings.power_automate_webhook.strip(), json=payload)
            response.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"[Email] Webhook POST failed: {e}")
        return False


def _esc(value) -> str:
    return html.escape(str(value)) if value is not None else ""


def send_eligibility_email(
    recipient_email: str,
    recipient_name: str,
    department_name: str,
    tender_name: str,
    deadline: Optional[str],
    website_url: Optional[str],
    source_domain: Optional[str],
    portal_base_url: Optional[str],
    qualification_score: float,
    verdict: str,
    gaps: List[str],
    strengths: List[str],
    recommendations: List[str],
    tender_summary: Optional[str] = None,
    clarification_date: Optional[str] = None,
    query_deadline: Optional[str] = None,
    final_deadline: Optional[str] = None,
):
    """
    Send a qualification result email to a Tender Manager via Power Automate.
    """
    subject = f"[TenderFlow] {verdict} - {tender_name[:60]}"

    verdict_color = {
        "ELIGIBLE":    "#22c55e",
        "CONDITIONAL": "#f59e0b",
        "INELIGIBLE":  "#ef4444",
    }.get(verdict, "#94a3b8")

    verdict_subtitle = {
        "ELIGIBLE":    "Meets all qualification requirements",
        "CONDITIONAL": "Meets minimum requirements — review gaps before bidding",
        "INELIGIBLE":  "Does not meet one or more qualification criteria",
    }.get(verdict, "")

    gaps_html = "".join(f"<li>{_esc(g)}</li>" for g in gaps) if gaps else "<li>None identified</li>"
    strengths_html = "".join(f"<li>{_esc(s)}</li>" for s in strengths) if strengths else "<li>None identified</li>"
    recs_html = "".join(f"<li>{_esc(r)}</li>" for r in recommendations) if recommendations else "<li>No recommendations</li>"

    summary_block = ""
    if tender_summary:
        summary_block = f"""
        <div style="background:#eff6ff;border-left:4px solid #4f6ef7;border-radius:0 8px 8px 0;padding:12px 16px;margin:16px 0">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#4f6ef7;margin-bottom:5px">Tender Summary</div>
          <div style="font-size:13px;color:#1e3a5f;line-height:1.6">{_esc(tender_summary)}</div>
        </div>"""

    has_timeline = any([clarification_date, query_deadline, final_deadline])

    def _row(label, value):
        if not value:
            return ""
        return f"""<tr>
          <td style="padding:7px 12px;font-size:12px;font-weight:600;color:#475569;border-bottom:1px solid #e4e8f0;white-space:nowrap">{_esc(label)}</td>
          <td style="padding:7px 12px;font-size:12px;color:#0f172a;border-bottom:1px solid #e4e8f0">{_esc(value)}</td>
        </tr>"""

    timeline_block = ""
    if has_timeline:
        rows = (
            _row("Pre-Bid Clarification Meeting", clarification_date) +
            _row("Query Submission Deadline", query_deadline) +
            _row("Final Submission Deadline", final_deadline or deadline)
        )
        timeline_block = f"""
        <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;margin:20px 0 8px">Deadline Timeline</h4>
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="border:1px solid #e4e8f0;border-radius:8px;border-collapse:separate;overflow:hidden">
          {rows}
        </table>"""

    if portal_base_url:
        view_url = _esc(portal_base_url)
        domain = _esc(portal_base_url.replace('https://', '').replace('http://', '').split('/')[0])
        view_text = f"Go to {domain} "
    elif source_domain:
        view_url = _esc(f"https://{source_domain}")
        view_text = f"Go to {_esc(source_domain)} "
    elif website_url:
        view_url = _esc(website_url)
        view_text = "View on Portal "
    else:
        view_url = "#"
        view_text = "No link available"

    url_section = f'<p><a href="{view_url}" style="color:#4f6ef7">{view_text}</a></p>'

    html_body = f"""
    <html><body style="font-family:Inter,Arial,sans-serif;color:#0f172a;max-width:600px;margin:0 auto">
      <div style="background:#4f6ef7;padding:20px 24px;border-radius:10px 10px 0 0">
        <h2 style="color:#fff;margin:0;font-size:18px">TenderFlow Qualification Report</h2>
        <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px">Department: {_esc(department_name)}</p>
      </div>
      <div style="border:1px solid #e4e8f0;border-top:none;padding:24px;border-radius:0 0 10px 10px">
        <p style="font-size:14px">Hi {_esc(recipient_name)},</p>
        <p style="font-size:13px;color:#475569">A new tender has been matched and qualified for your department.</p>

        {summary_block}

        <div style="background:#f4f6fb;border-radius:8px;padding:16px;margin:16px 0">
          <strong style="font-size:14px">{_esc(tender_name)}</strong>
          {"<p style='font-size:12px;color:#64748b;margin:6px 0 0'>Deadline: " + _esc(deadline) + "</p>" if deadline else ""}
          {url_section}
        </div>

        {timeline_block}

        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="border:2px solid {verdict_color};border-radius:10px;overflow:hidden;margin:20px 0;border-collapse:separate">
          <tr>
            <td width="38%" valign="middle"
              style="background:{verdict_color};padding:18px 20px;text-align:center">
              <div style="font-size:38px;font-weight:900;color:#ffffff;line-height:1;letter-spacing:-1px">{qualification_score}</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.85);font-weight:700;margin-top:5px;letter-spacing:0.06em">/100 &nbsp;SCORE</div>
            </td>
            <td valign="middle"
              style="background:{verdict_color}18;padding:18px 20px">
              <div style="font-size:11px;color:{verdict_color};font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">VERDICT</div>
              <div style="font-size:20px;font-weight:900;color:{verdict_color};line-height:1">{_esc(verdict)}</div>
              <div style="font-size:12px;color:#64748b;margin-top:8px;line-height:1.4">{_esc(verdict_subtitle)}</div>
            </td>
          </tr>
        </table>

        <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8">Strengths</h4>
        <ul style="font-size:13px;color:#475569;padding-left:18px">{strengths_html}</ul>

        <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8">Gaps</h4>
        <ul style="font-size:13px;color:#475569;padding-left:18px">{gaps_html}</ul>

        <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8">Recommendations</h4>
        <ul style="font-size:13px;color:#475569;padding-left:18px">{recs_html}</ul>

        <hr style="border:none;border-top:1px solid #e4e8f0;margin:20px 0"/>
        <p style="font-size:11px;color:#94a3b8">
          Sent by TenderFlow v4.0 · AI-Powered Tender Intelligence<br/>
          {datetime.now().strftime('%d %b %Y, %I:%M %p IST')}
        </p>
      </div>
    </body></html>
    """

    payload = {
        "To": recipient_email,
        "Subject": subject,
        "Body": html_body,
    }

    if _post_webhook(payload):
        logger.info(f"[Email] Sent via Power Automate to {recipient_email} - {verdict}: {tender_name[:50]}")
        return True
    logger.error(f"[Email] Failed to send via Power Automate to {recipient_email}")
    return False


def send_test_email(recipient_email: str) -> bool:
    """Send a simple test email to verify Power Automate connection."""
    subject = "[TenderFlow] Test Email"
    html_body = f"""
    <html><body style="font-family:Inter,Arial,sans-serif;color:#0f172a;max-width:600px;margin:0 auto">
      <div style="background:#4f6ef7;padding:20px 24px;border-radius:10px 10px 0 0">
        <h2 style="color:#fff;margin:0;font-size:18px">TenderFlow Test</h2>
      </div>
      <div style="border:1px solid #e4e8f0;border-top:none;padding:24px;border-radius:0 0 10px 10px">
        <p>This is a test email sent from TenderFlow App Settings to verify your Power Automate integration.</p>
        <p>If you are receiving this, your webhook is working correctly!</p>
        <hr style="border:none;border-top:1px solid #e4e8f0;margin:20px 0"/>
        <p style="font-size:11px;color:#94a3b8">
          Sent by TenderFlow v4.0<br/>
          {datetime.now().strftime('%d %b %Y, %I:%M %p IST')}
        </p>
      </div>
    </body></html>
    """

    payload = {
        "To": recipient_email,
        "Subject": subject,
        "Body": html_body,
    }

    if _post_webhook(payload):
        logger.info(f"[Email] Test email sent to {recipient_email}")
        return True
    logger.error(f"[Email] Failed to send test email to {recipient_email}")
    return False
