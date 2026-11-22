package detector

import "testing"

func TestMacProcessParsing(t *testing.T) {
	for _, item := range []struct {
		output          string
		running, failed bool
	}{
		{"\n ", false, true},
		{"/usr/local/bin/antigravity-zh-gui\n/sbin/launchd", false, false},
		{"/Applications/Antigravity Testing.app/Contents/Frameworks/Antigravity Helper (GPU).app/Contents/MacOS/Antigravity Helper (GPU)", true, false},
		{"/test/X.app/Contents/Resources/bin/language_server", true, false},
		{"/test/X.app.extra/Contents/Resources/bin/language_server", false, false},
	} {
		got, err := parseMacProcesses(item.output, "/test/X.app")
		if got != item.running || (err != nil) != item.failed {
			t.Errorf("%q: %t, %v", item.output, got, err)
		}
	}
}
