package extractor

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"strings"
)

// The Go string pool has no delimiters. Only reviewed, complete fields in
// this exact 2.35.0 Darwin arm64 executable can serve as binary evidence.
const serverSource = "binary:language_server"
const reviewedServerSize = 197326912
const reviewedServerSHA = "7235d144514112b8dc86b38253590c69de306c32ba98408bd061bf36d532848b"

type binaryField struct {
	scope        string
	offset, size int
}

// Offsets are in file order. System command extents come from the Go
// registry's string descriptors. Skill extents cover the description in the
// embedded SKILL.md front matter, including YAML folded-line indentation.
// Shelves use displayName and description from the embedded agy-plugin-shelves JSON.
// Layout fields are complete title/description values in project-4k-mode-copy.
// The marketplace notice is the marketplace value in third-party-tools-disclaimer-text.
var serverFields = []binaryField{
	{"slash-command/grill-me", 58027341, 32},
	{"slash-command/browser", 58183469, 37},
	{"slash-command/plan", 58236947, 39},
	{"slash-command/goal", 58517493, 52},
	{"slash-command/computer", 58581213, 56},
	{"slash-command/boost", 58643333, 60},
	{"slash-command/teamwork", 58671564, 62},
	{"slash-command/schedule", 58725314, 66},
	{"slash-command/compact", 58846709, 79},
	{"slash-command/learn", 58846788, 79},
	{"slash-command/deepagent", 58852176, 80},
	{"slash-command/browser-vision", 58858518, 81},
	{"slash-command/review-agent", 58927269, 98},
	{"slash-command/antigravity-guide", 60155403, 416},
	{"slash-command/agy-customizations", 60482323, 242},
	{"slash-command/migrate-workflows", 60540413, 200},
	{"slash-command/generative_ui", 60583636, 274},
	{"slash-command/permissioned-github", 60816288, 141},
	{"slash-command/run-workflow", 60917620, 479},
	{"slash-command/migrate-agent-settings", 60969440, 404},
	{"slash-command/automation", 61179429, 289},
	{"slash-command/mcp-app-development", 61205165, 347},
	{"slash-command/plugin", 61504602, 634},
	{"slash-command/swarm", 61998701, 304},
	{"marketplace-shelf/google-workspace", 156671491, 16},
	{"marketplace-shelf/google-workspace", 156671533, 88},
	{"marketplace-shelf/build-with-google", 156672059, 17},
	{"marketplace-shelf/build-with-google", 156672102, 91},
	{"marketplace-shelf/design-creative-media", 156673276, 29},
	{"marketplace-shelf/design-creative-media", 156673331, 34},
	{"marketplace-shelf/science", 156673683, 7},
	{"marketplace-shelf/science", 156673716, 73},
	{"marketplace-shelf/productivity-project-management", 156674227, 38},
	{"marketplace-shelf/productivity-project-management", 156674291, 73},
	{"marketplace-shelf/cloud-hosting-deployment", 156675036, 31},
	{"marketplace-shelf/cloud-hosting-deployment", 156675093, 53},
	{"marketplace-shelf/developer-tools", 156675648, 15},
	{"marketplace-shelf/developer-tools", 156675689, 68},
	{"marketplace-shelf/business", 156677861, 8},
	{"marketplace-shelf/business", 156677895, 96},
	{"settings-detail", 156684190, 14},
	{"settings-detail", 156684240, 63},
	{"settings-detail", 156684372, 20},
	{"settings-detail", 156684428, 64},
	{"marketplace-notice", 156685585, 310},
}

type binaryLiteral struct {
	scope, text string
}

func (f binaryLiteral) module() string {
	if f.scope == "settings-detail" {
		return "settings"
	}
	return "agents"
}

// Hash and collect from the same bounded stream, retaining only the complete
// display fields. No filename, range, or decoding rule comes from a locale.
func readBinaryFields(src io.Reader, size int64, fields []binaryField) (map[int]binaryLiteral, string, error) {
	hash := sha256.New()
	r := io.TeeReader(io.LimitReader(src, size), hash)
	values := make(map[int]binaryLiteral, len(fields))
	var pos int64
	for _, f := range fields {
		start, n := int64(f.offset), int64(f.size)
		if start < pos || n <= 0 || n > 4096 || start > size-n {
			return nil, "", fmt.Errorf("无效的语言服务证据范围 %d+%d", f.offset, f.size)
		}
		if _, err := io.CopyN(io.Discard, r, start-pos); err != nil {
			return nil, "", err
		}
		b := make([]byte, f.size)
		if _, err := io.ReadFull(r, b); err != nil {
			return nil, "", err
		}
		text := string(b)
		switch {
		case strings.HasPrefix(f.scope, "marketplace-shelf/"):
			// The sole escape in the reviewed display fields is the
			// JSON spelling of the ampersand in three shelf titles.
			text = strings.ReplaceAll(text, `\u0026`, "&")
		case strings.HasPrefix(f.scope, "slash-command/"):
			text = strings.ReplaceAll(text, "\n  ", " ")
		}
		values[f.offset] = binaryLiteral{f.scope, text}
		pos = start + n
	}
	if _, err := io.CopyN(io.Discard, r, size-pos); err != nil {
		return nil, "", err
	}
	return values, hex.EncodeToString(hash.Sum(nil)), nil
}
