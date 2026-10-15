"""Best-effort full tender text reader for qualification.

Uses the stored description plus the public tender landing page and linked PDF
attachments (same host only). Text is extracted locally; no tender content is sent
anywhere by this module. Downloads are bounded and failures are non-fatal.
"""
from __future__ import annotations

import ipaddress
import logging
import re
import socket
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import httpx

logger = logging.getLogger(__name__)
MAX_HTML_BYTES = 3 * 1024 * 1024
MAX_PDF_BYTES = 20 * 1024 * 1024
MAX_PDFS = 5
TIMEOUT = httpx.Timeout(12.0, connect=5.0)


class _PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text_parts = []
        self.pdf_links = []
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "style", "noscript", "svg"):
            self._skip_depth += 1
        if tag == "a" and attrs.get("href"):
            self.pdf_links.append(attrs["href"])
        if tag in ("p", "div", "br", "li", "tr", "td", "th", "h1", "h2", "h3", "h4"):
            self.text_parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg") and self._skip_depth:
            self._skip_depth -= 1
        if tag in ("p", "div", "li", "tr", "h1", "h2", "h3", "h4"):
            self.text_parts.append("\n")

    def handle_data(self, data):
        if not self._skip_depth and data.strip():
            self.text_parts.append(data.strip())


def _public_http_url(url: str) -> bool:
    try:
        p = urlparse(url)
        if p.scheme not in ("http", "https") or not p.hostname or p.username or p.password:
            return False
        # Reject localhost and private/reserved IPs to avoid SSRF.
        host = p.hostname.lower()
        if host in {"localhost", "localhost.localdomain"}:
            return False
        try:
            addresses = [ipaddress.ip_address(host)]
        except ValueError:
            addresses = [ipaddress.ip_address(x[4][0]) for x in socket.getaddrinfo(host, p.port or (443 if p.scheme == "https" else 80), type=socket.SOCK_STREAM)]
        return all(a.is_global for a in addresses)
    except Exception:
        return False


def _pdf_text(data: bytes) -> str:
    try:
        import fitz  # PyMuPDF, optional until installed
        doc = fitz.open(stream=data, filetype="pdf")
        try:
            return "\n".join(page.get_text("text") for page in doc)
        finally:
            doc.close()
    except ImportError:
        logger.info("PyMuPDF is not installed; linked PDFs cannot be text-extracted")
    except Exception as exc:
        logger.warning("Could not extract tender PDF text: %s", exc)
    return ""


def read_tender_text(name: str, description: str, website_url: str | None) -> str:
    """Combine stored description with landing-page text and same-host PDF links."""
    sections = [f"TENDER TITLE: {name or ''}", f"STORED TENDER DESCRIPTION:\n{description or ''}"]
    if not website_url or not _public_http_url(website_url):
        return "\n\n".join(s for s in sections if s.strip())

    try:
        with httpx.Client(timeout=TIMEOUT, follow_redirects=True, headers={"User-Agent": "TenderFlow/4.0 tender-document-reader"}) as client:
            response = client.get(website_url)
            response.raise_for_status()
            final_url = str(response.url)
            if not _public_http_url(final_url):
                return "\n\n".join(s for s in sections if s.strip())
            content_type = response.headers.get("content-type", "").lower()
            body = response.content
            if len(body) > MAX_HTML_BYTES and "pdf" not in content_type:
                body = body[:MAX_HTML_BYTES]
            if "pdf" in content_type or body[:4] == b"%PDF":
                pdf = _pdf_text(body[:MAX_PDF_BYTES]) if len(body) <= MAX_PDF_BYTES else ""
                if pdf:
                    sections.append("TENDER PDF TEXT:\n" + pdf)
                return "\n\n".join(s for s in sections if s.strip())
            parser = _PageParser()
            parser.feed(body.decode(response.encoding or "utf-8", errors="replace"))
            page_text = re.sub(r"[ \t]+", " ", " ".join(parser.text_parts))
            if page_text.strip():
                sections.append("TENDER WEBPAGE TEXT:\n" + page_text)
            base_host = urlparse(final_url).hostname
            candidates = []
            for href in parser.pdf_links:
                url = urljoin(final_url, href)
                p = urlparse(url)
                if p.hostname == base_host and (p.path.lower().endswith(".pdf") or "pdf" in p.path.lower()):
                    if url not in candidates and _public_http_url(url):
                        candidates.append(url)
            for url in candidates[:MAX_PDFS]:
                try:
                    pdf_resp = client.get(url)
                    if pdf_resp.status_code != 200 or len(pdf_resp.content) > MAX_PDF_BYTES:
                        continue
                    if "pdf" not in pdf_resp.headers.get("content-type", "").lower() and not pdf_resp.content.startswith(b"%PDF"):
                        continue
                    extracted = _pdf_text(pdf_resp.content)
                    if extracted.strip():
                        sections.append(f"ATTACHED TENDER PDF ({urlparse(url).path.rsplit('/', 1)[-1]}):\n{extracted}")
                except Exception as exc:
                    logger.info("Skipping tender attachment %s: %s", url, exc)
    except Exception as exc:
        logger.info("Tender page fetch failed; using stored description only: %s", exc)

    # Deduplicate repeated whitespace while retaining clause boundaries.
    return "\n\n".join(s for s in sections if s.strip())
