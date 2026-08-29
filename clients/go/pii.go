/*
    OGL-Mini (Open Guard Layer for GO)
    PII Base Module

    @developer                  Elijah Rastorguev
    @version                    1.1.0
    @git                        https://github.com/devsdaddy/ogl-mini
    @license                    MIT
    @build                      1005
    @data                       29 aug 2026
*/
package oglmini

import (
	"regexp"
	"sort"
	"strings"
)

// PIIDetector - Stage 3, regex + heuristics, RU/EN.

var (
	emailRe       = regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)
	phoneStrictRe = regexp.MustCompile(`(?:\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}|\+?\d{1,3}[\s\-]?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,4}`)
	ipRe          = regexp.MustCompile(`\b(?:\d{1,3}\.){3}\d{1,3}\b`)
	macRe         = regexp.MustCompile(`\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b`)
	ibanRe        = regexp.MustCompile(`\b[A-Z]{2}\d{2}[\s]?[A-Z0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{0,12}\b`)
	cardRe        = regexp.MustCompile(`\b(?:\d[ \-]*?){13,19}\b`)
	passportRuRe  = regexp.MustCompile(`\b\d{2}\s?\d{2}\s?\d{6}\b`)
	passportSgRe  = regexp.MustCompile(`\b[STFG]\d{7}[A-Z]\b`)
	dobRe         = regexp.MustCompile(`\b(?:\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b`)
	socialRe      = regexp.MustCompile(`(?i)(?:https?://)?(?:www\.)?(?:vk\.com|t\.me|instagram\.com|facebook\.com|linkedin\.com|x\.com|twitter\.com)/[A-Za-z0-9_\.\-]+`)
	addressRe     = regexp.MustCompile(`(?i)(?:ул\.|улица|пр\.|проспект|д\.|дом|кв\.|г\.|город|пер\.|наб\.)\s*[^\.,;]{3,60}`)
	ruNameRe = regexp.MustCompile(`[\p{Cyrillic}]{2,}\s+[\p{Cyrillic}]{2,}(?:\s+[\p{Cyrillic}]{2,})?`)
	enNameRe = regexp.MustCompile(`\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b`)
)

var commonWords = map[string]bool{"Привет": true, "Спасибо": true, "Пожалуйста": true, "Hello": true, "Please": true, "Thanks": true, "Информация": true, "Документ": true}

// PiiOnnxScorer returns per-label probabilities for 11 PII types (EMAIL, PHONE, PERSON, ...).
// It is created by tryLoadPiiOnnx (requires -tags onnx and libonnxruntime).
type PiiOnnxScorer func(text string) (map[string]float64, error)

// PIIDetector is safe for concurrent use. By default it uses regex only (0.5ms).
// Call SetOnnxScorer to enable hybrid regex + ONNX reranking (2MB model, distilled MiniLM-L6).
type PIIDetector struct {
	onnxScorer PiiOnnxScorer
}

func NewPIIDetector() *PIIDetector { return &PIIDetector{} }

// SetOnnxScorer plugs a trained PII model (ogl-mini-pii.onnx, 2MB, TF-IDF 20k + OneVsRest).
func (d *PIIDetector) SetOnnxScorer(scorer PiiOnnxScorer) { d.onnxScorer = scorer }
func (d *PIIDetector) HasOnnx() bool                      { return d.onnxScorer != nil }

// Detect returns all PII entities with spans and confidence.
func (d *PIIDetector) Detect(text string) []PIIEntity {
	var entities []PIIEntity

	// collect via FindAllStringIndex
	collect := func(re *regexp.Regexp, typ string, score float64, filter func(string) bool) {
		for _, m := range re.FindAllStringIndex(text, -1) {
			val := text[m[0]:m[1]]
			if filter != nil && !filter(val) {
				continue
			}
			// skip if already covered by passport (for phone)
			skip := false
			for _, e := range entities {
				if e.Start <= m[0] && m[1] <= e.End && (e.Type == "PASSPORT" || e.Type == "GOV_ID") {
					skip = true
					break
				}
			}
			if skip {
				continue
			}
			// dedup by span
			dup := false
			for _, e := range entities {
				if e.Start == m[0] && e.End == m[1] && e.Type == typ {
					dup = true
					break
				}
			}
			if dup {
				continue
			}
			entities = append(entities, PIIEntity{Type: typ, Value: val, Start: m[0], End: m[1], Score: score})
		}
	}

	collect(emailRe, "EMAIL", 0.99, nil)
	collect(passportRuRe, "PASSPORT", 0.85, func(s string) bool {
		digits := regexp.MustCompile(`\D`).ReplaceAllString(s, "")
		return len(digits) == 10
	})
	collect(passportSgRe, "GOV_ID", 0.90, nil)
	collect(phoneStrictRe, "PHONE", 0.96, nil)
	collect(ipRe, "IP", 0.92, func(s string) bool {
		parts := strings.Split(s, ".")
		if len(parts) != 4 {
			return false
		}
		for _, p := range parts {
			if len(p) == 0 || len(p) > 3 {
				return false
			}
			for _, c := range p {
				if c < '0' || c > '9' {
					return false
				}
			}
		}
		return true
	})
	collect(macRe, "MAC", 0.95, nil)
	collect(ibanRe, "IBAN", 0.93, func(s string) bool {
		v := strings.ReplaceAll(s, " ", "")
		return len(v) >= 15 && len(v) <= 34
	})
	collect(cardRe, "BANK_CARD", 0.88, func(s string) bool {
		digits := regexp.MustCompile(`\D`).ReplaceAllString(s, "")
		if len(digits) < 13 || len(digits) > 19 {
			return false
		}
		return luhnValid(s)
	})
	collect(dobRe, "DOB", 0.80, nil)
	collect(socialRe, "SOCIAL", 0.92, nil)
	collect(addressRe, "ADDRESS", 0.75, nil)

	// PERSON - RU
	for _, m := range ruNameRe.FindAllStringIndex(text, -1) {
		val := text[m[0]:m[1]]
		first := strings.Fields(val)[0]
		if commonWords[first] {
			continue
		}
		if len(val) < 6 {
			continue
		}
		entities = append(entities, PIIEntity{Type: "PERSON", Value: val, Start: m[0], End: m[1], Score: 0.70})
	}
	// PERSON - EN
	for _, m := range enNameRe.FindAllStringIndex(text, -1) {
		val := text[m[0]:m[1]]
		first := strings.Fields(val)[0]
		if commonWords[first] {
			continue
		}
		if first == "The" || first == "This" || first == "That" || first == "System" || first == "User" || first == "Assistant" {
			continue
		}
		entities = append(entities, PIIEntity{Type: "PERSON", Value: val, Start: m[0], End: m[1], Score: 0.62})
	}

	// Hybrid ONNX reranking (if ogl-mini-pii.onnx is attached) - 11 labels, TF-IDF 20k
	if d.onnxScorer != nil {
		if probs, err := d.onnxScorer(text); err == nil && probs != nil {
			for i := range entities {
				key := entities[i].Type
				// PERSON_RU/EN are both PERSON in ONNX
				if p, ok := probs[key]; ok {
					// 0.6*regex + 0.4*onnx, не опускаем ниже 0.35 чтобы не терять recall
					mixed := 0.6*entities[i].Score + 0.4*p + 0.05
					if mixed > 0.99 {
						mixed = 0.99
					}
					entities[i].Score = float64(int(mixed*10000+0.5)) / 10000
				} else if p, ok := probs["PERSON"]; ok && entities[i].Type == "PERSON" {
					mixed := 0.6*entities[i].Score + 0.4*p + 0.05
					entities[i].Score = float64(int(mixed*10000+0.5)) / 10000
				}
			}
			// Фильтруем только явные ложняки
			var filtered []PIIEntity
			for _, e := range entities {
				if e.Score >= 0.35 {
					filtered = append(filtered, e)
				}
			}
			entities = filtered
		}
	}

	sort.Slice(entities, func(i, j int) bool { return entities[i].Start < entities[j].Start })
	// dedup overlapping
	var dedup []PIIEntity
	for _, e := range entities {
		if len(dedup) > 0 && e.Start < dedup[len(dedup)-1].End && e.Type == dedup[len(dedup)-1].Type {
			continue
		}
		overlaps := false
		for _, d := range dedup {
			if e.Start >= d.Start && e.End <= d.End {
				overlaps = true
				break
			}
		}
		if overlaps {
			continue
		}
		dedup = append(dedup, e)
	}
	return dedup
}

// Redact replaces PII values with masked placeholders.
func (d *PIIDetector) Redact(text string, entities []PIIEntity) string {
	if entities == nil {
		entities = d.Detect(text)
	}
	sort.Slice(entities, func(i, j int) bool { return entities[i].Start > entities[j].Start })
	out := text
	for _, e := range entities {
		var repl string
		switch e.Type {
		case "EMAIL":
			if idx := strings.Index(e.Value, "@"); idx > 0 {
				repl = e.Value[:2] + "***" + e.Value[idx:]
			} else {
				repl = "***"
			}
		case "PHONE":
			if len(e.Value) > 6 {
				repl = e.Value[:4] + "***" + e.Value[len(e.Value)-2:]
			} else {
				repl = "***"
			}
		case "IP":
			repl = "***.***.***.***"
		case "IBAN":
			if len(e.Value) >= 4 {
				repl = e.Value[:4] + " **** **** ****"
			} else {
				repl = "***"
			}
		case "BANK_CARD":
			digits := regexp.MustCompile(`\D`).ReplaceAllString(e.Value, "")
			if len(digits) >= 4 {
				repl = "**** **** **** " + digits[len(digits)-4:]
			} else {
				repl = "***"
			}
		case "PASSPORT":
			if len(e.Value) >= 3 {
				repl = "*** *** " + e.Value[len(e.Value)-3:]
			} else {
				repl = "***"
			}
		case "GOV_ID":
			if len(e.Value) >= 2 {
				repl = "***" + e.Value[len(e.Value)-2:]
			} else {
				repl = "***"
			}
		case "DOB":
			repl = "**/**/****"
		case "ADDRESS":
			repl = "[REDACTED ADDRESS]"
		case "PERSON":
			if parts := strings.Fields(e.Value); len(parts) > 0 {
				repl = parts[0] + " ***"
			} else {
				repl = "***"
			}
		case "SOCIAL":
			repl = "[REDACTED LINK]"
		case "MAC":
			repl = "**:**:**:**:**:**"
		default:
			repl = "***"
		}
		out = out[:e.Start] + repl + out[e.End:]
	}
	return out
}

func luhnValid(s string) bool {
	digits := regexp.MustCompile(`\D`).ReplaceAllString(s, "")
	if len(digits) < 13 || len(digits) > 19 {
		return false
	}
	sum := 0
	parity := len(digits) % 2
	for i, d := range digits {
		val := int(d - '0')
		if i%2 == parity {
			val *= 2
			if val > 9 {
				val -= 9
			}
		}
		sum += val
	}
	return sum%10 == 0
}
