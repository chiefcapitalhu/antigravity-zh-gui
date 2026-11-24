// Package l10nruntime packages the renderer and native presentation factories.
package l10nruntime

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"

	"antigravity-zh-gui/internal/config"
)

//go:embed ui_translator.js
var translator string

//go:embed main_hooks.js
var native string

type Scope struct {
	Scope   string            `json:"scope"`
	Entries map[string]string `json:"entries"`
}

type Template struct {
	ID     string `json:"id"`
	Format string `json:"format"`
}

type Dictionary struct {
	Custom    map[string]string `json:"custom,omitempty"`
	Exact     map[string]string `json:"exact,omitempty"`
	Scoped    []Scope           `json:"scoped,omitempty"`
	Templates []Template        `json:"templates,omitempty"`
}

type Bundle struct {
	// HubFactory(window, trustedHost) returns a translator or null. Only the
	// existing, isolated host may supply its verified Hub identity and origin.
	HubFactory string
	// NativeFactory(refresh) takes a host-owned presentation rebuild callback.
	NativeFactory string
}

func validEntries(entries map[string]string) error {
	for key, value := range entries {
		if strings.TrimSpace(key) == "" || strings.TrimSpace(value) == "" || !utf8.ValidString(key) || !utf8.ValidString(value) {
			return fmt.Errorf("dictionary contains a blank or invalid entry")
		}
	}
	return nil
}

// Validate checks the dictionaries and matching scopes accepted by the presentation runtimes.
func (d Dictionary) Validate() error {
	for _, entries := range []map[string]string{d.Custom, d.Exact} {
		for en, zh := range entries {
			if err := config.ValidateGlobalEntry(en, zh); err != nil {
				return err
			}
		}
	}
	seen := map[string]map[string]bool{}
	for _, group := range d.Scoped {
		switch group.Scope {
		case "toolbar", "workspace", "settings", "onboarding", "permissions", "agents", "model", "sidecar", "controls", "application", "context", "tray", "dock":
		default:
			return fmt.Errorf("unknown translation scope %q", group.Scope)
		}
		if err := validEntries(group.Entries); err != nil {
			return err
		}
		if seen[group.Scope] == nil {
			seen[group.Scope] = map[string]bool{}
		}
		for key := range group.Entries {
			if seen[group.Scope][key] {
				return fmt.Errorf("duplicate entry in scope %q", group.Scope)
			}
			seen[group.Scope][key] = true
		}
	}
	templates := map[string]bool{}
	for _, t := range d.Templates {
		switch t.ID {
		case "minutesAgo", "hoursAgo", "itemCount", "quotaRemaining", "permissionCount", "agentsRunning",
			"thoughtFor", "thinkingFor", "workedFor", "updatesCount", "showMore", "seeAll",
			"toolsEnabled", "toolsExcluded", "pluginsCount", "draftsCount", "referencesCount",
			"hiddenHosts", "availableCredits", "resetsIn", "refreshesIn", "percentLeft", "hourLimit":
		default:
			return fmt.Errorf("unknown translation template %q", t.ID)
		}
		if templates[t.ID] || !utf8.ValidString(t.Format) || !strings.Contains(t.Format, "{n}") {
			return fmt.Errorf("duplicate or invalid format for %q", t.ID)
		}
		templates[t.ID] = true
	}
	return nil
}

// Build supplies only the preferences relevant to presentation. No install
// paths, credentials, command strings or source programs are input fields.
func Build(platform string, prefs config.Preferences, d Dictionary) (Bundle, error) {
	if platform == "windows" {
		platform = "win32"
	}
	if platform != "darwin" && platform != "win32" {
		return Bundle{}, fmt.Errorf("unknown renderer platform %q", platform)
	}
	if err := prefs.Validate(); err != nil {
		return Bundle{}, err
	}
	if err := d.Validate(); err != nil {
		return Bundle{}, err
	}
	data, err := json.Marshal(struct {
		Dictionary
		Platform    string `json:"platform"`
		Hotkey      bool   `json:"hotkey"`
		DefaultLang string `json:"defaultLang"`
		Brand       string `json:"brand"`
	}{d, platform, prefs.Hotkey, prefs.DefaultLang, prefs.Brand})
	if err != nil {
		return Bundle{}, err
	}
	// Encoding the complete JSON document as a JSON string keeps every byte
	// of user text data, including "__proto__" and script-like punctuation.
	quoted, err := json.Marshal(string(data))
	if err != nil {
		return Bundle{}, err
	}
	options := "JSON.parse(" + string(quoted) + ")"
	return Bundle{
		HubFactory: `((install) => function installLocalHub(win, host) {
  "use strict";
  if (!host || host.isLocalHub !== true || host.isMainFrame !== true || win.top !== win) return null;
  if (typeof host.origin !== "string" || !/^https:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(host.origin)) return null;
  if (Number(host.origin.slice(host.origin.lastIndexOf(":") + 1)) > 65535) return null;
  if (win.location.origin !== host.origin) return null;
  const options = ` + options + `;
  if (typeof host.onModeChange === "function") options.onModeChange = mode => host.onModeChange(mode);
  return install(win, options);
})(` + translator + `)`,
		NativeFactory: `(function createHostPresentation(refresh) {
  "use strict";
  return (` + native + `)(` + options + `, refresh);
})`,
	}, nil
}
