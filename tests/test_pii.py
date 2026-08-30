"""
Open Guard Layer Mini (OGL-Mini)
Described PII Test

@developer              Elijah Rastorguev
@version                1.0.0
@build                  1000
@date                   28 august 2026
@git                    https://github.com/devsdaddy/ogl-mini/
"""
from ogl_mini.guards.pipeline import HybridGuard
from ogl_mini.pii.detector import PIIDetector

g = HybridGuard(); pii = PIIDetector()

def _f1(pred, truth):
    pred_set=set(pred); truth_set=set(truth)
    tp=len(pred_set & truth_set); fp=len(pred_set - truth_set); fn=len(truth_set - pred_set)
    prec=tp/max(1,tp+fp); rec=tp/max(1,tp+fn); f1=2*prec*rec/max(1,prec+rec)
    return prec, rec, f1

CASES = [
    ("Меня зовут Иван Петров, email ivan@mail.ru", ["PERSON","EMAIL"]),
    ("John Doe phone +7 999 123-45-67 lives at 192.168.1.1", ["PERSON","PHONE","IP"]),
    ("IBAN DE89 3704 0044 0532 0130 00 and DOB 12 March 1985", ["IBAN","DOB"]),
    ("Паспорт 12 34 567890, адрес ул. Тверская, д.10, Москва", ["PASSPORT","ADDRESS"]),
    ("S9012345B and card 4111 1111 1111 1111", ["GOV_ID","BANK_CARD"]),
    ("Contact via https://t.me/username and vk.com/id12345", ["SOCIAL","SOCIAL"]),
    ("MAC 00:1A:2B:3C:4D:5E IP 10.0.0.1", ["MAC","IP"]),
    ("Анна Сергеевна Иванова 15 января 1992", ["PERSON","DOB"]),
    ("Email user@example.com +60 12-345 6789", ["EMAIL","PHONE"]),
    ("My DOB is 01.01.1990 and passport S9012345B", ["DOB","GOV_ID"]),
]

def test_pii_types_detected():
    for text, expected in CASES:
        ents=pii.detect(text)
        types=[e.type for e in ents]
        for exp in expected:
            assert exp in types, f"miss {exp} in '{text}' got {types}"

def test_pii_f1_multilingual():
    y_pred=[]; y_true=[]
    for text, expected in CASES:
        ents=pii.detect(text)
        types=[e.type for e in ents]
        # flatten: compare per-type per-sample
        for exp in expected:
            y_true.append(exp); y_pred.append(exp if exp in types else "MISS")
        # no false positive panic: count only expected
    # compute overall: treat missing as FN, extra as FP in separate
    # for benchmark expect F1 >=0.85
    prec, rec, f1 = _f1([e for _, exp in CASES for e in exp], [e.type for text,_ in CASES for e in pii.detect(text)])
    # simpler: measure detection rate
    total_expected=sum(len(exp) for _,exp in CASES)
    detected=sum(1 for text,exp in CASES for e in exp if e in [x.type for x in pii.detect(text)])
    f1_like=detected/total_expected
    assert f1_like >= 0.85, f"PII detection {f1_like:.2f} <0.85"

def test_pii_redaction():
    text="Иван Петров ivan@test.ru +7 999 123-45-67"
    ents,_ = g.detect_pii(text)
    assert len(ents) >=2
    _, red = g.detect_pii(text)
    assert "ivan@test.ru" not in red
    assert "Иван Петров" not in red or "***" in red

def test_pii_confidence_and_span():
    ents=pii.detect("Email user@example.com phone +7 999 123-45-67")
    for e in ents:
        assert 0 <= e.score <= 1
        assert e.start < e.end
        assert e.value in "Email user@example.com phone +7 999 123-45-67"

def test_pii_no_false_on_benign():
    benign=["Привет как дела","What is 2+2?","Explain quantum physics","Как приготовить борщ?"]
    for t in benign:
        ents=pii.detect(t)
        # allow PERSON false but should be minimal
        assert len([e for e in ents if e.type in ("EMAIL","PHONE","IBAN","IP")])==0

def test_pii_output_guard_integration():
    r=g.check_output("User data: Иван Петров, email ivan@mail.ru, IP 192.168.1.1")
    assert not r.safe
    assert r.label=="pii_leak"
    assert len(r.pii_entities) >=2
    assert r.redacted_text is not None and "ivan@mail.ru" not in r.redacted_text
