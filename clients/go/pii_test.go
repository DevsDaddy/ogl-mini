/*
    OGL-Mini (Open Guard Layer for GO)
    PII Tests

    @developer                  Elijah Rastorguev
    @version                    1.1.0
    @git                        https://github.com/devsdaddy/ogl-mini
    @license                    MIT
    @build                      1005
    @data                       29 aug 2026
*/
package oglmini

import "testing"

func TestPII(t *testing.T) {
	d := NewPIIDetector()

	if !containsEntity(d.Detect("Contact user@example.com"), "EMAIL") {
		t.Fatal("EMAIL miss")
	}
	if !containsEntity(d.Detect("Иван Петров живет в Москве"), "PERSON") {
		t.Fatal("PERSON miss")
	}
	if !containsEntity(d.Detect("IBAN DE89 3704 0044 0532 0130 00"), "IBAN") {
		t.Fatal("IBAN miss")
	}
	if !containsEntity(d.Detect("IP 192.168.1.1"), "IP") {
		t.Fatal("IP miss")
	}
	if !containsEntity(d.Detect("паспорт 12 34 567890"), "PASSPORT") {
		t.Fatal("PASSPORT miss")
	}
	if !containsEntity(d.Detect("S9012345B"), "GOV_ID") {
		t.Fatal("GOV_ID miss")
	}
	if !containsEntity(d.Detect("card 4111 1111 1111 1111"), "BANK_CARD") {
		t.Fatal("BANK_CARD miss")
	}
	if !containsEntity(d.Detect("12 March 1985"), "DOB") {
		t.Fatal("DOB miss")
	}
	if !containsEntity(d.Detect("ул. Тверская, д. 10, Москва"), "ADDRESS") {
		t.Fatal("ADDRESS miss")
	}
	if !containsEntity(d.Detect("https://t.me/username"), "SOCIAL") {
		t.Fatal("SOCIAL miss")
	}
	if !containsEntity(d.Detect("00:1A:2B:3C:4D:5E"), "MAC") {
		t.Fatal("MAC miss")
	}
}

func TestPIIRedact(t *testing.T) {
	d := NewPIIDetector()
	text := "Иван Петров ivan@test.ru +7 999 123-45-67"
	ents := d.Detect(text)
	if len(ents) < 2 {
		t.Fatalf("expected >=2 entities got %d", len(ents))
	}
	red := d.Redact(text, ents)
	if contains(red, "ivan@test.ru") {
		t.Fatal("should redact email")
	}
	for _, e := range ents {
		if e.Score < 0 || e.Score > 1 {
			t.Fatalf("score out of range")
		}
		if e.Start >= e.End {
			t.Fatalf("invalid span")
		}
	}
}

func TestPIIF1Like(t *testing.T) {
	d := NewPIIDetector()
	cases := []struct {
		text string
		want []string
	}{
		{"Меня зовут Иван Петров, email ivan@mail.ru", []string{"PERSON", "EMAIL"}},
		{"John Doe phone +7 999 123-45-67 lives at 192.168.1.1", []string{"PERSON", "PHONE", "IP"}},
		{"IBAN DE89 3704 0044 0532 0130 00 and DOB 12 March 1985", []string{"IBAN", "DOB"}},
	}
	total, hit := 0, 0
	for _, c := range cases {
		types := map[string]bool{}
		for _, e := range d.Detect(c.text) {
			types[e.Type] = true
		}
		for _, w := range c.want {
			total++
			if types[w] {
				hit++
			}
		}
	}
	if float64(hit)/float64(total) < 0.85 {
		t.Fatalf("PII recall too low")
	}
}

func containsEntity(ents []PIIEntity, typ string) bool {
	for _, e := range ents {
		if e.Type == typ {
			return true
		}
	}
	return false
}
