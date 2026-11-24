// Package server serves the embedded control panel on one ephemeral loopback port.
package server

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"antigravity-zh-gui/internal/app"
	"antigravity-zh-gui/internal/config"
	"antigravity-zh-gui/internal/patcher"
)

//go:embed web/index.html web/panel.js web/panel.css
var resources embed.FS

type service interface {
	Preferences() (config.Preferences, error)
	SavePreferences(config.Preferences) error
	Dictionary() (map[string]string, error)
	EditDictionary(string, *string) (map[string]string, error)
	Status(string) (*app.Status, error)
	Execute(string, config.Preferences, func(string)) (*patcher.Result, error)
}

type panel struct {
	service     service
	host, token string
	// Only one configuration change or client operation can be in flight.
	gate     sync.Mutex
	mu       sync.Mutex
	closing  bool
	current  job
	shutdown context.CancelFunc
}

type message struct {
	Elapsed int64  `json:"ms"`
	Text    string `json:"text"`
}

type job struct {
	ID     uint64          `json:"id"`
	Action string          `json:"action"`
	Active bool            `json:"active"`
	Logs   []message       `json:"logs"`
	Result *patcher.Result `json:"result,omitempty"`
	Error  string          `json:"error,omitempty"`
}

func Run(ctx context.Context, svc *app.Service, out io.Writer) error {
	return run(ctx, svc, out, openBrowser)
}

func run(ctx context.Context, svc service, out io.Writer, open func(string) error) error {
	var secret [32]byte
	if _, err := rand.Read(secret[:]); err != nil {
		return err
	}
	ln, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("本地控制台监听失败: %w", err)
	}
	defer ln.Close()
	ctx, stop := context.WithCancel(ctx)
	defer stop()
	p := &panel{service: svc, host: ln.Addr().String(), token: base64.RawURLEncoding.EncodeToString(secret[:]), shutdown: stop}
	srv := http.Server{Handler: p, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 2 * time.Minute, IdleTimeout: 45 * time.Second, MaxHeaderBytes: 16 << 10, ErrorLog: log.New(io.Discard, "", 0)}
	url := "http://" + p.host + "/?token=" + p.token
	go func() {
		if err := open(url); err != nil && out != nil {
			fmt.Fprintf(out, "请用本机浏览器打开控制台：%s\n", url)
		}
	}()
	drained := make(chan struct{})
	go func() {
		<-ctx.Done()
		p.mu.Lock()
		p.closing = true
		p.mu.Unlock()
		// In-flight filesystem transactions must reach their own commit or rollback.
		_ = srv.Shutdown(context.Background())
		p.gate.Lock()
		p.gate.Unlock()
		close(drained)
	}()
	err = srv.Serve(ln)
	stop()
	<-drained
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("/usr/bin/open", url).Run()
	case "windows":
		exe := filepath.Join(os.Getenv("SystemRoot"), "System32", "rundll32.exe")
		if !filepath.IsAbs(exe) {
			return errors.New("无法定位 Windows 系统目录")
		}
		return exec.Command(exe, "url.dll,FileProtocolHandler", url).Run()
	default:
		return errors.New("当前平台需要手动打开浏览器")
	}
}

func reply(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
func fail(w http.ResponseWriter, status int, err error) {
	reply(w, status, map[string]string{"error": err.Error()})
}

func body(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(&dst); err != nil || dst == nil {
		fail(w, 400, errors.New("请求内容无效或过大"))
		return false
	}
	if err := d.Decode(new(any)); err != io.EOF {
		fail(w, 400, errors.New("请求必须包含一个 JSON 对象"))
		return false
	}
	return true
}

var assets = map[string][2]string{
	"/":          {"web/index.html", "text/html; charset=utf-8"},
	"/panel.css": {"web/panel.css", "text/css; charset=utf-8"},
	"/panel.js":  {"web/panel.js", "application/javascript; charset=utf-8"},
}

func (p *panel) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	h.Set("Cache-Control", "no-store")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("X-Frame-Options", "DENY")
	h.Set("Cross-Origin-Resource-Policy", "same-origin")
	h.Set("Cross-Origin-Opener-Policy", "same-origin")
	h.Set("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'")
	if r.Host != p.host {
		fail(w, 403, errors.New("本机地址校验失败"))
		return
	}
	if a, ok := assets[r.URL.Path]; ok {
		if r.Method != "GET" && r.Method != "HEAD" {
			w.Header().Set("Allow", "GET, HEAD")
			w.WriteHeader(405)
			return
		}
		b, err := resources.ReadFile(a[0])
		if err != nil {
			http.Error(w, "资源读取失败", 500)
			return
		}
		h.Set("Content-Type", a[1])
		if r.Method != "HEAD" {
			_, _ = w.Write(b)
		}
		return
	}
	switch r.URL.Path {
	case "/api/bootstrap", "/api/status", "/api/preferences", "/api/dictionary", "/api/start", "/api/job", "/api/exit":
	default:
		http.NotFound(w, r)
		return
	}
	if r.Method != "POST" {
		h.Set("Allow", "POST")
		w.WriteHeader(405)
		return
	}
	token := r.Header.Values("X-ZH-GUI-Token")
	origins := r.Header.Values("Origin")
	if len(token) != 1 || subtle.ConstantTimeCompare([]byte(token[0]), []byte(p.token)) != 1 ||
		len(origins) != 1 || origins[0] != "http://"+p.host {
		fail(w, 403, errors.New("会话校验失败，请从工具启动的地址重新打开"))
		return
	}
	mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mt != "application/json" {
		fail(w, 415, errors.New("请使用 JSON 请求"))
		return
	}
	switch r.URL.Path {
	case "/api/bootstrap":
		var empty struct{}
		if !body(w, r, &empty) {
			return
		}
		prefs, err := p.service.Preferences()
		if err != nil {
			fail(w, 400, err)
			return
		}
		dict, err := p.service.Dictionary()
		if err != nil {
			fail(w, 400, err)
			return
		}
		reply(w, 200, map[string]any{"version": app.Version, "platform": runtime.GOOS, "preferences": prefs, "dictionary": dict})
	case "/api/status":
		var q struct {
			Target string `json:"target"`
		}
		if !body(w, r, &q) {
			return
		}
		s, err := p.service.Status(q.Target)
		if err != nil {
			fail(w, 400, err)
			return
		}
		reply(w, 200, s)
	case "/api/job":
		var empty struct{}
		if !body(w, r, &empty) {
			return
		}
		p.mu.Lock()
		snap := p.current
		snap.Logs = append([]message(nil), snap.Logs...)
		p.mu.Unlock()
		reply(w, 200, snap)
	default:
		p.write(w, r)
	}
}

func (p *panel) write(w http.ResponseWriter, r *http.Request) {
	if !p.gate.TryLock() {
		fail(w, 409, errors.New("操作正在进行，请等待完成"))
		return
	}
	async := false
	defer func() {
		if !async {
			p.gate.Unlock()
		}
	}()
	p.mu.Lock()
	closing := p.closing
	p.mu.Unlock()
	if closing {
		fail(w, 409, errors.New("控制台正在退出"))
		return
	}
	switch r.URL.Path {
	case "/api/exit":
		var empty struct{}
		if !body(w, r, &empty) {
			return
		}
		p.mu.Lock()
		p.closing = true
		p.mu.Unlock()
		reply(w, 200, map[string]bool{"closed": true})
		p.shutdown()
	case "/api/preferences":
		var q config.Preferences
		if !body(w, r, &q) {
			return
		}
		if err := q.Validate(); err != nil {
			fail(w, 400, err)
			return
		}
		if err := p.service.SavePreferences(q); err != nil {
			fail(w, 400, err)
			return
		}
		reply(w, 200, q)
	case "/api/dictionary":
		var q struct{ Operation, English, Chinese string }
		if !body(w, r, &q) {
			return
		}
		var translation *string
		switch q.Operation {
		case "set":
			translation = &q.Chinese
		case "remove":
		default:
			fail(w, 400, errors.New("未知词条操作"))
			return
		}
		d, err := p.service.EditDictionary(q.English, translation)
		if err != nil {
			fail(w, 400, err)
			return
		}
		reply(w, 200, d)
	case "/api/start":
		var q struct {
			Action      string             `json:"action"`
			Preferences config.Preferences `json:"preferences"`
		}
		if !body(w, r, &q) {
			return
		}
		switch q.Action {
		case "apply", "restore", "verify", "restore-app":
		default:
			fail(w, 400, errors.New("未知客户端操作"))
			return
		}
		if err := q.Preferences.Validate(); err != nil {
			fail(w, 400, err)
			return
		}
		if q.Action == "apply" {
			if err := p.service.SavePreferences(q.Preferences); err != nil {
				fail(w, 400, err)
				return
			}
		}
		p.mu.Lock()
		id := p.current.ID + 1
		p.current = job{ID: id, Active: true, Action: q.Action}
		p.mu.Unlock()
		async = true
		go p.execute(q.Action, q.Preferences)
		reply(w, 202, map[string]uint64{"id": id})
	}
}

func (p *panel) execute(action string, prefs config.Preferences) {
	defer p.gate.Unlock()
	started := time.Now()
	emit := func(s string) {
		p.mu.Lock()
		p.current.Logs = append(p.current.Logs, message{Elapsed: time.Since(started).Milliseconds(), Text: s})
		p.mu.Unlock()
	}
	result, err := p.service.Execute(action, prefs, emit)
	p.mu.Lock()
	defer p.mu.Unlock()
	p.current.Result = result
	p.current.Active = false
	label := "操作结束"
	if err != nil {
		label = "操作中止"
	}
	p.current.Logs = append(p.current.Logs, message{Elapsed: time.Since(started).Milliseconds(), Text: label})
	if err != nil {
		p.current.Error = err.Error()
	}
}
