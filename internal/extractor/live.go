package extractor

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// Live reads only the explicitly selected local Hub's static /main.js.
// The asset is never executed. The client uses neither credentials nor a proxy.
func (s *SourceSet) Live(ctx context.Context, origin string) error {
	u, err := url.Parse(origin)
	if err != nil || u.Opaque != "" || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() != "127.0.0.1" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" {
		return errors.New("live-origin 必须为 http(s)://127.0.0.1:端口")
	}
	port, err := strconv.Atoi(u.Port())
	if err != nil || port < 1 || port > 65535 || u.Host != fmt.Sprintf("127.0.0.1:%d", port) {
		return errors.New("live-origin 的端口无效")
	}
	u.Path = "/main.js"
	transport := &http.Transport{DisableCompression: true, DisableKeepAlives: true, MaxResponseHeaderBytes: 32 << 10}
	defer transport.CloseIdleConnections()
	client := http.Client{Transport: transport, Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return err
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	return s.addLive(res)
}
func (s *SourceSet) addLive(res *http.Response) error {
	mt, _, err := mime.ParseMediaType(res.Header.Get("Content-Type"))
	if res.StatusCode != 200 || err != nil || (mt != "text/javascript" && mt != "application/javascript") || res.ContentLength > maxScript {
		return errors.New("本机端口未返回受支持的静态 JavaScript 资源")
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, maxScript+1))
	if err != nil {
		return err
	}
	return s.add("live:main.js", data)
}
