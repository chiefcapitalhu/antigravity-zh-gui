package extractor

import (
	"errors"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

func ident(c byte) bool {
	return c == '_' || c == '$' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= 128
}
func white(c byte) bool {
	return c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '\f' || c == '\v'
}

// Return the decoded complete static literal. Unsupported or invalid escapes
// are not evidence. Strings inside comments, regexps and template raw sections
// are excluded by the scanner.
func decode(raw []byte) (string, bool) {
	if len(raw) < 2 || raw[0] != raw[len(raw)-1] {
		return "", false
	}
	chars := raw[1 : len(raw)-1]
	if !strings.ContainsRune(string(chars), '\\') {
		return string(chars), utf8.Valid(chars)
	}
	var out strings.Builder
	for i := 0; i < len(chars); i++ {
		c := chars[i]
		if c != '\\' {
			out.WriteByte(c)
			continue
		}
		i++
		if i >= len(chars) {
			return "", false
		}
		c = chars[i]
		switch c {
		case '\n':
			continue
		case '\r':
			if i+1 < len(chars) && chars[i+1] == '\n' {
				i++
			}
		case 'b':
			out.WriteByte('\b')
		case 'f':
			out.WriteByte('\f')
		case 'n':
			out.WriteByte('\n')
		case 'r':
			out.WriteByte('\r')
		case 't':
			out.WriteByte('\t')
		case 'v':
			out.WriteByte('\v')
		case 'x', 'u':
			start, end := i+1, i+3
			braces := false
			if c == 'u' {
				end = i + 5
				if start < len(chars) && chars[start] == '{' {
					braces = true
					start++
					end = start
					for end < len(chars) && chars[end] != '}' {
						end++
					}
					if end >= len(chars) || end-start > 6 {
						return "", false
					}
				}
			}
			if end > len(chars) {
				return "", false
			}
			v, err := strconv.ParseUint(string(chars[start:end]), 16, 32)
			if err != nil {
				return "", false
			}
			ch := rune(v)
			i = end - 1
			if braces {
				i++
			}
			if utf16.IsSurrogate(ch) {
				if braces || i+7 > len(chars) || string(chars[i+1:i+3]) != "\\u" {
					return "", false
				}
				v, err := strconv.ParseUint(string(chars[i+3:i+7]), 16, 16)
				if err != nil {
					return "", false
				}
				ch = utf16.DecodeRune(ch, rune(v))
				if ch == utf8.RuneError {
					return "", false
				}
				i += 6
			}
			if !utf8.ValidRune(ch) {
				return "", false
			}
			out.WriteRune(ch)
		default:
			if c >= '0' && c <= '9' {
				return "", false
			}
			out.WriteByte(c)
		}
	}
	return out.String(), utf8.ValidString(out.String())
}

type frame struct {
	key           string
	delim         byte
	commas        int
	interpolation bool
	statementBody bool
	classHead     string
}

// Uncertain starts are treated as declarations. This can omit a candidate
// in a chained division, but avoids accepting quotes inside a following regexp.
func declarationStart(previous string) bool {
	switch previous {
	case "=", "(", "[", ",", ":", "?", "!", "~", "+", "-", "*", "/", "%", "<", ">", "|", "^", "&", "return", "throw", "yield", "await", "void", "typeof", "new", "=>":
		return false
	}
	return true
}

func staticLiterals(src []byte, visit func(start, end int, context string)) error {
	i := 0
	last, before := "", ""
	canRegex := true
	frames := []frame{{}} // root lexical level
	template := false
	set := func(s string, regex bool) { before, last = last, s; canRegex = regex }
	for i < len(src) {
		if len(frames) > 4096 {
			return errors.New("JS 嵌套超过限制")
		}
		if template {
			for i < len(src) {
				c := src[i]
				i++
				if c == '\\' && i < len(src) {
					i++
					continue
				}
				if c == 0x60 {
					template = false
					set("#", false)
					break
				}
				if c == '$' && i < len(src) && src[i] == '{' {
					i++
					frames = append(frames, frame{delim: '{', interpolation: true})
					template = false
					set("{", true)
					break
				}
			}
			continue
		}
		c := src[i]
		if white(c) {
			i++
			continue
		}
		if c == '/' && i+1 < len(src) {
			if src[i+1] == '/' {
				i += 2
				for i < len(src) && src[i] != '\n' && src[i] != '\r' {
					i++
				}
				continue
			}
			if src[i+1] == '*' {
				i += 2
				for i+1 < len(src) && (src[i] != '*' || src[i+1] != '/') {
					i++
				}
				i = min(len(src), i+2)
				continue
			}
			if canRegex {
				j := i + 1
				cls := false
				for j < len(src) && src[j] != '\n' && src[j] != '\r' {
					x := src[j]
					j++
					if x == '\\' && j < len(src) {
						j++
						continue
					}
					if x == '[' {
						cls = true
					}
					if x == ']' {
						cls = false
					}
					if x == '/' && !cls {
						for j < len(src) && ident(src[j]) {
							j++
						}
						i = j
						set("#", false)
						break
					}
				}
				if i == j {
					continue
				}
			}
		}
		if c == '"' || c == '\'' || c == 0x60 {
			start := i
			i++
			finished := false
			for i < len(src) {
				x := src[i]
				i++
				if x == '\\' && i < len(src) {
					if src[i] == '\r' && i+1 < len(src) && src[i+1] == '\n' {
						i++
					}
					i++
					continue
				}
				if x == c {
					finished = true
					break
				}
				if c == 0x60 && x == '$' && i < len(src) && src[i] == '{' {
					i++
					frames = append(frames, frame{delim: '{', interpolation: true})
					set("{", true)
					break
				}
				if c != 0x60 && (x == '\n' || x == '\r') {
					break
				}
			}
			if !finished {
				continue
			}
			context := ""
			if last == ":" {
				context = before
			}
			if n := len(frames); n > 0 && frames[n-1].delim == '(' && last == "," && frames[n-1].key == "createElement" && frames[n-1].commas >= 2 {
				context = "child"
			}
			if n := len(frames); n > 0 && frames[n-1].key == "showErrorBox" && last == "(" {
				context = "title"
			}
			visit(start, i, context)
			// A quoted property key is useful only for the bounded presentation fields.
			property := "#"
			if i-start < 24 {
				v, ok := decode(src[start:i])
				if ok {
					switch v {
					case "label", "placeholder", "title", "aria-label", "message":
						property = v
					}
				}
			}
			set(property, false)
			continue
		}
		if ident(c) || c >= '0' && c <= '9' {
			j := i
			i++
			for i < len(src) && (ident(src[i]) || src[i] >= '0' && src[i] <= '9') {
				i++
			}
			token := string(src[j:i])
			previous := last
			if previous == "async" {
				previous = before
			}
			// Carry a function's role across its optional generator star and
			// name, then across the parameter list in that delimiter's frame.
			if token == "function" && last != "." {
				if declarationStart(previous) {
					token = "#function-declaration"
				} else {
					token = "#function-expression"
				}
			} else if last == "#function-declaration" || last == "#function-expression" {
				token = last
			} else if token == "class" && last != "." {
				head := "#class-expression"
				if declarationStart(previous) {
					head = "#class-declaration"
				}
				frames[len(frames)-1].classHead = head
			}
			regex := false
			switch token {
			case "return", "case", "throw", "void", "typeof", "delete", "instanceof", "in", "of", "new", "yield", "await", "else", "do":
				regex = true
			}
			set(token, regex)
			continue
		}
		i++
		switch c {
		case '(', '[', '{':
			statementBody := false
			if c == '{' {
				f := &frames[len(frames)-1]
				switch {
				case f.classHead != "":
					statementBody = f.classHead == "#class-declaration"
					f.classHead = ""
				case last == "#function-expression", last == "=>":
				case last == "#function-declaration", last == ")", last == "else", last == "do", last == "try", last == "finally":
					statementBody = true
				default:
					statementBody = declarationStart(last)
				}
			}
			frames = append(frames, frame{key: last, delim: c, statementBody: statementBody})
			set(string(c), true)
		case ')', ']', '}':
			regex := false
			if n := len(frames); n > 1 {
				f := frames[n-1]
				frames = frames[:n-1]
				if f.interpolation && c == '}' {
					template = true
				}
				if f.statementBody && c == '}' {
					regex = true
				}
				if c == ')' {
					switch f.key {
					case "#function-declaration", "#function-expression":
						set(f.key, false)
						continue
					case "if", "while", "for", "with", "switch", "catch":
						regex = true
					}
				}
			}
			set(string(c), regex)
		case ',':
			frames[len(frames)-1].classHead = ""
			if len(frames) > 0 {
				frames[len(frames)-1].commas++
			}
			set(",", true)
		case ':', ';':
			frames[len(frames)-1].classHead = ""
			set(string(c), true)
		case '=':
			if i < len(src) && src[i] == '>' {
				i++
				set("=>", true)
			} else {
				frames[len(frames)-1].classHead = ""
				set("=", true)
			}
		case '*':
			if last != "#function-declaration" && last != "#function-expression" {
				set("*", true)
			}
		case '+', '-':
			if i < len(src) && src[i] == c {
				i++
				set("#", false)
			} else {
				set(string(c), true)
			}
		default:
			set(string(c), c != '.')
		}
	}
	return nil
}
