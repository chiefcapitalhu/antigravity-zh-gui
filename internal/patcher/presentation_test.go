package patcher

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"antigravity-zh-gui/internal/asar"
	"antigravity-zh-gui/internal/config"
	"antigravity-zh-gui/locales"
)

// This additional developer check reads the reviewed sample and only writes its
// generated test scripts into t.TempDir. Hosted CI uses independent fixtures.
func TestReviewedLocalizationSample(t *testing.T) {
	archive := os.Getenv("AGZH_UI_SAMPLE_ASAR")
	if archive == "" {
		t.Skip("optional local 2.34.0 sample")
	}
	p := config.Defaults()
	change, warnings, err := presentationPlan(archive, "darwin", Options{Preferences: &p, Custom: map[string]string{"New Conversation": "自定义对话"}})
	if err != nil || len(change) != 5 || len(warnings) != 0 {
		t.Fatalf("changes=%d warnings=%+v err=%v", len(change), warnings, err)
	}
	dir := t.TempDir()
	for member, data := range change {
		path := filepath.Join(dir, filepath.Base(member))
		if err := os.WriteFile(path, data, 0600); err != nil {
			t.Fatal(err)
		}
		if out, err := exec.Command("node", "--check", path).CombinedOutput(); err != nil {
			t.Fatalf("%s: %s %v", member, out, err)
		}
	}
	if !bytes.Contains(change[preloadMember], []byte("自定义对话")) {
		t.Fatal("custom dictionary absent")
	}
	candidate := filepath.Join(dir, "candidate.asar")
	if err := asar.Rewrite(archive, candidate, change); err != nil {
		t.Fatal(err)
	}
	if report, err := asar.VerifyCandidate(archive, candidate, allowed(change)); err != nil || len(report.Changes) != 5 {
		t.Fatal(report, err)
	}
	drift := filepath.Join(dir, "platform-variant.asar")
	updater, err := asar.ReadFile(archive, member)
	if err != nil {
		t.Fatal(err)
	}
	if err := asar.Rewrite(archive, drift, map[string][]byte{member: append(updater, []byte("\n// platform variant")...)}); err != nil {
		t.Fatal(err)
	}
	partial, skipped, err := presentationPlan(drift, "windows", Options{Preferences: &p})
	if err != nil || len(partial) != 4 || len(skipped) != 1 || skipped[0].Member != member || partial[member] != nil {
		t.Fatalf("partial=%d skipped=%v err=%v", len(partial), skipped, err)
	}

}

func TestNativeHostLifecycle(t *testing.T) {
	p := config.Defaults()
	b, err := locales.Build("darwin", p, nil)
	if err != nil {
		t.Fatal(err)
	}
	js := "const attach = " + nativeHost + ";\nconst factory = " + b.NativeFactory + ";\n" + `
const assert = require('node:assert/strict');
const shown=[];
const helper=attach(factory,{setApplicationMenu(m){shown.push(m);}});
const item={id:'check-for-updates',label:'Check for Updates'};
const parent={label:'File',submenu:{items:[item]}};
const menu={items:[parent]};
helper.application(menu);
assert.equal(item.label,'检查更新');
assert.equal(parent.label,'文件');
helper.current(item,'Restart to Update','application');
assert.equal(helper.english(item),'Restart to Update');
helper.presenter.setMode('en');
assert.equal(parent.label,'File');
assert.equal(item.label,'Restart to Update');
const tray={items:[{id:'running-agents',label:'No agents running'}]};
helper.track('tray',tray,()=>{});
helper.current(tray.items[0],'2 agents running','tray');
helper.presenter.setMode('zh');
assert.equal(tray.items[0].label,'2 个 AI 助手运行中');
assert.ok(shown.length>=3);
`
	path := filepath.Join(t.TempDir(), "native.cjs")
	if err = os.WriteFile(path, []byte(js), 0600); err != nil {
		t.Fatal(err)
	}
	if out, err := exec.Command("node", path).CombinedOutput(); err != nil {
		t.Fatalf("%s %v", out, err)
	}
}

func TestStageFiveSkipAndCandidateReceipts(t *testing.T) {
	e, i := sample(t, "windows", updateFixture, wslFixture)
	opt := presentationDefaults(Options{})
	var steps []string
	opt.Progress = func(step string) { steps = append(steps, step) }
	r, err := e.run(i, opt, false)
	if err != nil || !r.Committed || len(r.Warnings) == 0 || len(steps) < 3 {
		t.Fatal(r, steps, err)
	}
	// Persisted preferences may change before verify, update or restore.
	// Recreate from the options line if a user moves the patched app or
	// transfers it without their per-install build receipts.
	base, _ := hashFile(i.Archive + BackupSuffix)
	installed, _ := hashFile(i.Archive)
	receipt, _ := installedReceipt(i, base, installed)
	if err = os.Remove(receipt); err != nil {
		t.Fatal(err)
	}
	pinned, err := e.selectBuild(i, false)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := pinned.inspect(i); err != nil {
		t.Fatalf("reconstruct: %v", err)
	}
	p := config.Defaults()
	p.Brand = "hide"
	p.Hotkey = false
	p.DefaultLang = "en"
	if _, err = e.run(i, Options{Preferences: &p}, false); err != nil {
		t.Fatal(err)
	}
	english, err := asar.ReadFile(i.Archive, member)
	if err != nil || !bytes.Contains(english, []byte(`message: "No updates available",`)) || bytes.Contains(english, []byte("已是最新版本")) {
		t.Fatalf("fallback English reapply: %s %v", english, err)
	}
	if _, err = e.run(i, Options{Preferences: &p}, true); err != nil {
		t.Fatal(err)
	}
}

func TestEditedCandidateFailsReceiptReplay(t *testing.T) {
	e, i := sample(t, "windows", updateFixture, wslFixture)
	if _, err := e.run(i, presentationDefaults(Options{}), false); err != nil {
		t.Fatal(err)
	}
	live, err := asar.ReadFile(i.Archive, member)
	if err != nil {
		t.Fatal(err)
	}
	other := filepath.Join(t.TempDir(), "changed.asar")
	if err = asar.Rewrite(i.Archive, other, map[string][]byte{member: append(live, []byte("\n// unknown content")...)}); err != nil {
		t.Fatal(err)
	}
	writeFixture(t, i.Archive, fileBytes(t, other))
	if _, err = e.run(i, presentationDefaults(Options{}), false); err == nil {
		t.Fatal("changed candidate accepted")
	}
}

func TestRendererHandshakeAndNativeMode(t *testing.T) {
	js := "const attach = " + hubHost + ";\n" + `
const assert=require('node:assert/strict');
const address='https://127.0.0.1:4519';
const event={senderFrame:{url:address+'/home'}};
let selected=false;
const electron_1={
    ipcMain:{handle(name,fn){assert.equal(name,'agzh:local-ui'); this.handler=fn;}},
    ipcRenderer:{invoke:async(name,lang)=>electron_1.ipcMain.handler(event,lang)}
};
const menu_1={agZhLabels:{presenter:{setMode(lang){selected=lang;}}}};
let DEV_URL='';
const utils_1={isLocalHubTopFrame:ev=>ev===event};
const resolveLocalHubEntryUrl=()=>address+'/';
let agZhContext=null;
let isRemoteWindow=false;
global.window={location:new URL(address)};
window.top=window;
global.document={readyState:'complete'};
process.isMainFrame=true;
` + localUIHandler + `
let installs=0,listener;
const install=(win,host)=>{assert.equal(host.origin,address);installs++;listener=host.onModeChange;listener('zh');return {};};
let contextLang;
const native=()=>({setMode(lang){contextLang=lang;}});
(async()=>{
    attach(install,native);await new Promise(setImmediate);
    assert.equal(installs,1);assert.equal(selected,'zh');
    listener('en');await new Promise(setImmediate);
    assert.equal(selected,'en');assert.equal(contextLang,'en');
    isRemoteWindow=true;attach(install,native);await new Promise(setImmediate);
    assert.equal(installs,1);
    assert.equal(electron_1.ipcMain.handler({},'zh'),null);
    assert.equal(electron_1.ipcMain.handler(event,'other'),null);
    DEV_URL='development';assert.equal(electron_1.ipcMain.handler(event,'zh'),null);
    assert.equal(selected,'en');
})().catch(e=>{console.error(e);process.exitCode=1});
`
	path := filepath.Join(t.TempDir(), "handshake.cjs")
	if err := os.WriteFile(path, []byte(js), 0600); err != nil {
		t.Fatal(err)
	}
	if out, err := exec.Command("node", path).CombinedOutput(); err != nil {
		t.Fatalf("%s: %v", out, err)
	}
}

func TestOnlyReviewedMembersAndUniqueAnchors(t *testing.T) {
	_, err := renderEdits("xx", []edit{{"x", "z"}})
	if err == nil {
		t.Fatal("ambiguous anchor accepted")
	}
	for _, src := range []string{nativeHost, hubHost, localUIHandler} {
		for _, blocked := range []string{"eval(", "new Function", "innerHTML", "outerHTML", "document.write", "fetch(", "WebSocket(", "executeJavaScript", "sendSync("} {
			if strings.Contains(src, blocked) {
				t.Fatalf("host adapter uses %s", blocked)
			}
		}
	}
}
