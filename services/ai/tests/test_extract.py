from app.extract import find_names, find_phones, heuristic_extract
from app.schemas import ExtractionRequest

SAMPLE = """2026-03-04 14:12 Rohit Mehta transferred USD 240,000 to account GB29NWBK60161331926819
2026-03-04 16:55 Daniel Osei called Rohit Mehta +44 7700 900431 duration 320s
Meridian Holdings confirmed routing via rohit.mehta@meridianholdings.example
"""


def test_phones_ignore_dates_and_ibans():
    phones = find_phones(SAMPLE)
    # The +44 number should be found...
    assert "+447700900431" in phones
    # ...but timestamps and the IBAN body must NOT be misread as phones.
    assert all(not p.startswith("2026") for p in phones)
    assert all("60161331926819" not in p for p in phones)


def test_names_classify_org_vs_person():
    names = dict(find_names(SAMPLE))
    assert names.get("Rohit Mehta") == "person"
    assert names.get("Meridian Holdings") == "organization"


def test_extract_builds_graph():
    result = heuristic_extract(
        ExtractionRequest(caseId="c1", filename="ledger.txt", type="transaction", content=SAMPLE)
    )
    labels = {e.label for e in result.entities}
    assert "Rohit Mehta" in labels
    assert "GB29NWBK60161331926819" in labels
    assert "rohit.mehta@meridianholdings.example" in labels
    # Events are created from timestamped lines.
    assert len(result.events) == 2
    # Relations connect the actor to accounts/phones.
    relations = {e.relation for e in result.edges}
    assert "transacted" in relations


def test_extract_empty_content():
    result = heuristic_extract(
        ExtractionRequest(caseId="c1", filename="empty.txt", content="")
    )
    assert result.entities == []
    assert result.edges == []
    assert result.events == []
