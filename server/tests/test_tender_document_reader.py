from core.tender_document_reader import _PageParser
from core.laya_qualification import _evidence


def test_page_parser_keeps_visible_text_and_pdf_links():
    parser = _PageParser()
    parser.feed('<html><script>ignore me</script><h1>Tender</h1><p>Minimum turnover shall be 10 Cr.</p><a href="docs/tender.pdf">Download</a></html>')
    text = ' '.join(parser.text_parts)
    assert 'Tender' in text
    assert 'Minimum turnover shall be 10 Cr.' in text
    assert 'ignore me' not in text
    assert 'docs/tender.pdf' in parser.pdf_links


def test_factor_evidence_searches_late_clauses_not_only_prefix():
    text = ('General introduction. ' * 500) + 'The bidder shall have minimum annual turnover of INR 25 crore.'
    matches = _evidence(text, 'Financial Strength')
    assert matches
    assert any('minimum annual turnover' in clause.lower() for clause in matches)
