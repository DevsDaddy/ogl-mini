/*
    OGL-Mini (Open Guard Layer for GO)
    Simplified Heuristics Module (RU / EN)

    @developer                  Elijah Rastorguev
    @version                    1.1.0
    @git                        https://github.com/devsdaddy/ogl-mini
    @license                    MIT
    @build                      1005
    @data                       29 aug 2026
*/
// Import required modules
package oglmini

import (
	"encoding/base64"
	"regexp"
	"strings"
)

// HeuristicDetector - Stage 1, ~0.1ms, stateless.
// Mirrors Python heuristics/detector.py.

var (
	controlRe = regexp.MustCompile(`(?i)<\|im_start\|>|<\|im_end\|>|<\|system\|>|<\|user\|>|<\|assistant\|>|\[INST\]|\[/INST\]|<<SYS>>|<</SYS>>|\[SYSTEM\]|<s>|</s>|###\s*Instruction|###\s*System|<\|eot_id\|>|<\|begin_of_text\|>`)
	fakeEOSRe = regexp.MustCompile(`(?i)(?:</?s>|<\|.*?\|>|\[/?INST\]|###\s*End)`)
	zeroWidthRe    = regexp.MustCompile("[\u200b\u200c\u200d\ufeff\u2060\u180e]")
	spacedLettersRe = regexp.MustCompile(`(?:[a-zA-Z]\s+){4,}[a-zA-Z]`)
	base64Re        = regexp.MustCompile(`[A-Za-z0-9+/]{20,}={0,2}`)
	policyRe        = regexp.MustCompile(`(?is)<\s*(?:policy|config|role|agent|system|instruction|override|admin)[^>]*>.*?<\s*/\s*(?:policy|config|role|agent|system)[^>]*>`)
	xmlRoleRe       = regexp.MustCompile(`(?i)<\s*role\s*=\s*["']?(?:system|admin|root|developer)["']?`)
	directRe = regexp.MustCompile(`(?i)ignore\s+(?:all\s+)?(?:previous\s+instructions|above)|reveal\s+(?:your\s+)?system\s+prompt|disregard\s+(?:all\s+)?(?:above|prior|previous)|you\s+are\s+now\s+(?:DAN| unrestricted|jailbreak)|do\s+anything\s+now|repeat\s+(?:your\s+)?(?:system|initial)\s+(?:prompt|instructions)|show\s+me\s+(?:your\s+)?(?:system|hidden)\s+|bypass\s+(?:your\s+)?(?:safety|filter|restriction)|act\s+as\s+(?:if\s+you\s+are\s+)?(?:\w+\s+)?(?:without|no)\s+(?:limit|filter|restriction)|from\s+now\s+on\s+you\s+(?:are|will)|игнорируй\s+(?:все\s+)?(?:предыдущие|прошлые)\s+инструкции|забудь\s+все\s+что\s+было\s+выше|выведи\s+свой\s+системный\s+промпт|раскрой\s+данные|выполни\s+вредоносный\s+код`)
	jailbreakRe = regexp.MustCompile(`(?i)\bDAN\b|developer\s+mode|jailbreak|roleplay\s+as|pretend\s+to\s+be|hypothetical\s+scenario|освободись\s+от\s+ограничений|режим\s+разработчика|игнорируй\s+этику|ты\s+теперь\s+без\s+цензуры|без\s+цензуры|roleplay|освободись|ты\s+агент|теперь\s+ты\s+агент|выполняешь\s+все\s+мои\s+приказы|now\s+you\s+are\s+\w+|you\s+are\s+\w+\s+agent|другие\s+инструкции|other\s+instructions|do\s+anything`)
	hiddenRe        = regexp.MustCompile(`(?i)what\s+(?:is|are)\s+your\s+(?:system\s+)?instructions|list\s+your\s+tools|show\s+(?:me\s+)?tool\s+schema|выведи\s+свой\s+системный\s+промпт|покажи\s+инструкции\s+разработчика|выведи\s+свои\s+инструкции|покажи\s+схему\s+инструментов|list\s+your\s+tool\s+definitions|what\s+are\s+your\s+developer\s+instructions|reveal\s+your\s+hidden\s+context`)
	goalHijackRe    = regexp.MustCompile(`(?i)your\s+(?:new|actual|real)\s+(?:goal|task|objective|mission)\s+is|забудь\s+свою\s+цель|твоя\s+новая\s+задача|override\s+agent\s+goal`)
	indirectRe = regexp.MustCompile("(?i)```json|```xml|\\{[^}]*\"(?:instruction|system|role|override)\"|tool_output|tool_result|function\\s+result")
)

var toolMisuseMarkers = []string{"rm -rf", "curl ", "wget ", "exec(", "eval(", "os.system", "subprocess", "api_key", "secret"}

// HeuristicDetector is stateless and safe for concurrent use.
type HeuristicDetector struct{}

func NewHeuristicDetector() *HeuristicDetector { return &HeuristicDetector{} }

// Scan returns all hits for the given text.
func (h *HeuristicDetector) Scan(text string) []HeuristicHit {
	var hits []HeuristicHit
	if text == "" {
		return hits
	}
	if m := controlRe.FindStringIndex(text); m != nil {
		evidence := text[m[0]:m[1]]
		if len(evidence) > 80 {
			evidence = evidence[:80]
		}
		hits = append(hits, HeuristicHit{ID: "control_tokens", Label: "control_token_injection", Score: 0.95, Evidence: evidence, Start: m[0], End: m[1]})
	}
	if fakeEOSRe.MatchString(text) {
		hits = append(hits, HeuristicHit{ID: "fake_eos", Label: "control_token_injection", Score: 0.75, Evidence: "fake eos delimiter"})
	}
	zw := zeroWidthRe.FindAllString(text, -1)
	if len(zw) >= 2 {
		hits = append(hits, HeuristicHit{ID: "zero_width", Label: "obfuscation", Score: 0.85, Evidence: "zero-width chars"})
	} else if len(zw) == 1 {
		hits = append(hits, HeuristicHit{ID: "zero_width", Label: "obfuscation", Score: 0.55, Evidence: "zero-width char"})
	}
	if hasHomoglyphMix(text) {
		hits = append(hits, HeuristicHit{ID: "homoglyph", Label: "obfuscation", Score: 0.65, Evidence: "cyrillic/latin homoglyph mix"})
	}
	if m := spacedLettersRe.FindStringIndex(text); m != nil {
		seg := text[m[0]:m[1]]
		letters := strings.ReplaceAll(strings.ReplaceAll(seg, " ", ""), "\t", "")
		letters = strings.ReplaceAll(letters, "\n", "")
		if len(letters) >= 5 {
			isAlpha := true
			for _, c := range letters {
				if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
					isAlpha = false
					break
				}
			}
			if isAlpha {
				ev := seg
				if len(ev) > 60 {
					ev = ev[:60]
				}
				hits = append(hits, HeuristicHit{ID: "spaced_letters", Label: "obfuscation", Score: 0.70, Evidence: ev, Start: m[0], End: m[1]})
			}
		}
	}
	if b64 := detectBase64(text); b64 != nil {
		hits = append(hits, *b64)
	}
	if m := policyRe.FindStringIndex(text); m != nil {
		ev := text[m[0]:m[1]]
		if len(ev) > 80 {
			ev = ev[:80]
		}
		hits = append(hits, HeuristicHit{ID: "policy_puppetry", Label: "policy_puppetry", Score: 0.90, Evidence: ev, Start: m[0], End: m[1]})
	} else if m := xmlRoleRe.FindStringIndex(text); m != nil {
		ev := text[m[0]:m[1]]
		if len(ev) > 80 {
			ev = ev[:80]
		}
		hits = append(hits, HeuristicHit{ID: "policy_puppetry", Label: "policy_puppetry", Score: 0.90, Evidence: ev, Start: m[0], End: m[1]})
	}
	if m := directRe.FindStringIndex(text); m != nil {
		ev := text[m[0]:m[1]]
		if len(ev) > 80 {
			ev = ev[:80]
		}
		hits = append(hits, HeuristicHit{ID: "direct_injection", Label: "direct_prompt_injection", Score: 0.88, Evidence: ev, Start: m[0], End: m[1]})
	}
	if m := jailbreakRe.FindStringIndex(text); m != nil {
		ev := text[m[0]:m[1]]
		if len(ev) > 80 {
			ev = ev[:80]
		}
		hits = append(hits, HeuristicHit{ID: "jailbreak", Label: "jailbreak", Score: 0.80, Evidence: ev, Start: m[0], End: m[1]})
	}
	if m := hiddenRe.FindStringIndex(text); m != nil {
		ev := text[m[0]:m[1]]
		if len(ev) > 80 {
			ev = ev[:80]
		}
		hits = append(hits, HeuristicHit{ID: "hidden_context", Label: "hidden_context_exposure", Score: 0.82, Evidence: ev, Start: m[0], End: m[1]})
	}
	if m := goalHijackRe.FindStringIndex(text); m != nil {
		ev := text[m[0]:m[1]]
		if len(ev) > 80 {
			ev = ev[:80]
		}
		hits = append(hits, HeuristicHit{ID: "goal_hijack", Label: "agent_goal_hijack", Score: 0.85, Evidence: ev, Start: m[0], End: m[1]})
	}
	if m := indirectRe.FindStringIndex(text); m != nil {
		ev := text[m[0]:m[1]]
		if len(ev) > 80 {
			ev = ev[:80]
		}
		hits = append(hits, HeuristicHit{ID: "indirect_injection", Label: "indirect_prompt_injection", Score: 0.85, Evidence: ev, Start: m[0], End: m[1]})
	}
	if hasToolMisuse(text) {
		hits = append(hits, HeuristicHit{ID: "tool_misuse", Label: "tool_misuse", Score: 0.60, Evidence: "tool misuse marker"})
	}
	return hits
}

// RiskScore computes weighted max + boost, identical to Python.
func (h *HeuristicDetector) RiskScore(hits []HeuristicHit) float64 {
	if len(hits) == 0 {
		return 0
	}
	weights := map[string]float64{
		"control_tokens":      1.15,
		"policy_puppetry":     1.05,
		"direct_injection":    1.05,
		"base64_obfuscation":  1.0,
		"zero_width":          0.95,
		"jailbreak":           1.05,
		"hidden_context":      1.05,
		"goal_hijack":         1.05,
		"indirect_injection":  1.05,
		"tool_misuse":         0.95,
	}
	max := 0.0
	for _, hit := range hits {
		w, ok := weights[hit.ID]
		if !ok {
			w = hit.Score
		}
		s := w * hit.Score
		if s > max {
			max = s
		}
	}
	boost := 0.06 * float64(len(hits)-1)
	if boost > 0.15 {
		boost = 0.15
	}
	v := max + boost
	if v > 0.99 {
		v = 0.99
	}
	return v
}

func hasHomoglyphMix(text string) bool {
	hasCyr := false
	hasLat := false
	for _, c := range text {
		if c >= 0x0400 && c <= 0x04FF {
			hasCyr = true
		}
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') {
			hasLat = true
		}
	}
	if !(hasCyr && hasLat) {
		return false
	}
	homoglyphs := map[rune]bool{'а': true, 'е': true, 'о': true, 'р': true, 'с': true, 'х': true, 'у': true, 'А': true, 'В': true, 'Е': true, 'К': true, 'М': true, 'Н': true, 'О': true, 'Р': true, 'С': true, 'Т': true, 'Х': true}
	mixed := 0
	for _, c := range text {
		if homoglyphs[c] {
			mixed++
			if mixed >= 3 {
				return true
			}
		}
	}
	return false
}

func hasToolMisuse(text string) bool {
	low := strings.ToLower(text)
	for _, k := range toolMisuseMarkers {
		if strings.Contains(low, k) {
			return true
		}
	}
	return false
}

func detectBase64(text string) *HeuristicHit {
	matches := base64Re.FindAllStringIndex(text, -1)
	for _, m := range matches {
		cand := strings.TrimSpace(text[m[0]:m[1]])
		if len(cand) < 24 || len(cand)%4 != 0 {
			continue
		}
		decoded, err := base64.StdEncoding.DecodeString(cand)
		if err != nil {
			continue
		}
		if len(decoded) < 8 {
			continue
		}
		printable := 0
		for _, b := range decoded {
			if (b >= 32 && b <= 126) || b == 10 || b == 13 {
				printable++
			}
		}
		ratio := float64(printable) / float64(len(decoded))
		if ratio >= 0.7 {
			txt := strings.ToLower(string(decoded))
			suspicious := strings.Contains(txt, "ignore") || strings.Contains(txt, "system") || strings.Contains(txt, "instruction") || strings.Contains(txt, "jailbreak") || strings.Contains(txt, "dan") || strings.Contains(txt, "reveal") || strings.Contains(txt, "prompt")
			score := 0.60
			if suspicious {
				score = 0.92
			}
			ev := cand
			if len(ev) > 40 {
				ev = ev[:40] + "..."
			}
			return &HeuristicHit{ID: "base64_obfuscation", Label: "obfuscation", Score: score, Evidence: ev, Start: m[0], End: m[1]}
		}
	}
	return nil
}
