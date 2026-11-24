package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"antigravity-zh-gui/internal/app"
	"antigravity-zh-gui/internal/asar"
	"antigravity-zh-gui/internal/config"
	"antigravity-zh-gui/internal/patcher"
)

// Synthetic service; tests never launch a browser or inspect an installation.
type fixture struct {
	prefs  config.Preferences
	dict   map[string]string
	began  chan struct{}
	finish chan struct{}
}

func fixturePanel() (*panel, *fixture) {
	f := &fixture{prefs: config.Defaults(), dict: map[string]string{}, began: make(chan struct{}), finish: make(chan struct{})}
	p := &panel{host: "127.0.0.1:34567", token: "one-session", service: f, shutdown: func() {}}
	return p, f
}
func (f *fixture) Preferences() (config.Preferences, error)   { return f.prefs, nil }
func (f *fixture) SavePreferences(p config.Preferences) error { f.prefs = p; return nil }
func (f *fixture) Dictionary() (map[string]string, error)     { return f.dict, nil }
func (f *fixture) EditDictionary(en string, zh *string) (map[string]string, error) {
	if zh == nil {
		delete(f.dict, en)
	} else {
		if err := config.ValidateGlobalEntry(en, *zh); err != nil {
			return nil, err
		}
		f.dict[en] = *zh
	}
	return f.dict, nil
}
func (f *fixture) Status(target string) (*app.Status, error) {
	if target == "missing" {
		return nil, errors.New("找不到客户端")
	}
	return &app.Status{Target: target, Version: "2.34.0"}, nil
}
func (f *fixture) Execute(action string, p config.Preferences, emit func(string)) (*patcher.Result, error) {
	emit("检查目录")
	close(f.began)
	<-f.finish
	emit("完成校验")
	return &patcher.Result{AuditReport: &asar.AuditReport{FileCount: 1, Changes: []asar.Change{{Path: "dist/menu.js", BeforeSHA256: "before", AfterSHA256: "after"}}}, Committed: true}, nil
}
func request(p *panel, path, raw string) *http.Request {
	r := httptest.NewRequest("POST", "http://"+p.host+path, strings.NewReader(raw))
	r.Header.Set("X-ZH-GUI-Token", p.token)
	r.Header.Set("Origin", "http://"+p.host)
	r.Header.Set("Content-Type", "application/json")
	return r
}
func send(p *panel, r *http.Request) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	p.ServeHTTP(w, r)
	return w
}
func TestSessionBoundaries(t *testing.T) {
	p, _ := fixturePanel()
	for _, path := range []string{"bootstrap", "status", "preferences", "dictionary", "start", "job", "exit"} {
		for name, change := range map[string]func(*http.Request){
			"token":           func(r *http.Request) { r.Header.Del("X-ZH-GUI-Token"); r.URL.RawQuery = "token=" + p.token },
			"origin":          func(r *http.Request) { r.Header.Del("Origin") },
			"different-port":  func(r *http.Request) { r.Header.Set("Origin", "http://127.0.0.1:1234") },
			"foreign-origin":  func(r *http.Request) { r.Header.Set("Origin", "http://example.invalid") },
			"foreign-host":    func(r *http.Request) { r.Host = "other.invalid:34567" },
			"duplicate-token": func(r *http.Request) { r.Header.Add("X-ZH-GUI-Token", p.token) },
			"wrong-secret":    func(r *http.Request) { r.Header.Set("X-ZH-GUI-Token", "invalid") },
			"repeated-origin": func(r *http.Request) { r.Header.Add("Origin", "null") },
		} {
			t.Run(path+"/"+name, func(t *testing.T) {
				r := request(p, "/api/"+path, "{}")
				change(r)
				w := send(p, r)
				if w.Code != 403 || w.Header().Get("Access-Control-Allow-Origin") != "" || w.Header().Get("Cache-Control") != "no-store" {
					t.Fatalf("%d %v", w.Code, w.Header())
				}
			})
		}
	}
	for name, path := range map[string]string{"page": "/?token=one-session", "js": "/panel.js", "css": "/panel.css"} {
		r := httptest.NewRequest("GET", "http://"+p.host+path, nil)
		w := send(p, r)
		if w.Code != 200 || strings.Contains(w.Body.String(), p.token) || w.Header().Get("Referrer-Policy") != "no-referrer" || !strings.Contains(w.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") {
			t.Fatalf("asset %s", name)
		}
	}
	for _, method := range []string{"GET", "OPTIONS"} {
		r := request(p, "/api/exit", "{}")
		r.Method = method
		if w := send(p, r); w.Code != 405 {
			t.Fatalf("%s %d", method, w.Code)
		}
	}
	r := request(p, "/api/exit", "{}")
	r.Header.Set("Content-Type", "text/plain")
	if w := send(p, r); w.Code != 415 {
		t.Fatal(w.Code)
	}
	for _, bad := range []string{"null", "[]", "{} {}", "{\"extra\":true}", strings.Repeat(" ", 2<<20) + "{}"} {
		if w := send(p, request(p, "/api/exit", bad)); w.Code != 400 {
			t.Fatalf("body length %d -> %d", len(bad), w.Code)
		}
	}
}
func TestPreferencesDictionaryAndExit(t *testing.T) {
	p, f := fixturePanel()
	w := send(p, request(p, "/api/bootstrap", "{}"))
	if w.Code != 200 || !bytes.Contains(w.Body.Bytes(), []byte(`"defaultLang":"zh"`)) {
		t.Fatal(w.Body.String())
	}
	for _, sample := range []struct {
		path, raw string
		code      int
	}{
		{"preferences", `{"hotkey":false,"defaultLang":"en","brand":"hide"}`, 200},
		{"preferences", `{"defaultLang":"other","brand":"keep"}`, 400},
		{"dictionary", `{"operation":"set","english":"open","chinese":"开"}`, 400},
		{"dictionary", `{"operation":"set","english":"New window","chinese":"新窗口"}`, 200},
		{"dictionary", `{"operation":"remove","english":"New window"}`, 200},
		{"status", `{"target":"missing"}`, 400}, {"status", `{"target":"fixture"}`, 200},
		{"start", `{"action":"unexpected"}`, 400},
		{"exit", "{}", 200}, {"dictionary", `{"operation":"set","english":"File picker","chinese":"文件"}`, 409},
	} {
		w = send(p, request(p, "/api/"+sample.path, sample.raw))
		if w.Code != sample.code {
			t.Fatalf("%s got %d %s", sample.path, w.Code, w.Body.String())
		}
	}
	if f.prefs.DefaultLang != "en" || !p.closing || len(f.dict) != 0 {
		t.Fatal(f.prefs, p.closing, f.dict)
	}
}
func TestJobAndConcurrentWrites(t *testing.T) {
	p, f := fixturePanel()
	req := `{"action":"apply","preferences":{"defaultLang":"zh","brand":"keep","hotkey":true}}`
	if w := send(p, request(p, "/api/start", req)); w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	<-f.began
	for _, path := range []string{"start", "preferences", "dictionary", "exit"} {
		if w := send(p, request(p, "/api/"+path, req)); w.Code != 409 {
			t.Fatalf("%s %d", path, w.Code)
		}
	}
	inspect := func() job {
		w := send(p, request(p, "/api/job", "{}"))
		var j job
		if err := json.Unmarshal(w.Body.Bytes(), &j); err != nil {
			t.Fatal(err)
		}
		return j
	}
	j := inspect()
	if !j.Active || len(j.Logs) != 1 {
		t.Fatal(j)
	}
	close(f.finish)
	deadline := time.Now().Add(time.Second * 5)
	for time.Now().Before(deadline) {
		j = inspect()
		if !j.Active {
			break
		}
		time.Sleep(time.Millisecond)
	}
	if j.Active || j.ID != 1 || j.Result == nil || j.Result.Changes[0].AfterSHA256 != "after" || len(j.Logs) != 3 || j.Logs[2].Text != "操作结束" || j.Logs[2].Elapsed < j.Logs[1].Elapsed {
		t.Fatal(j)
	}
}
