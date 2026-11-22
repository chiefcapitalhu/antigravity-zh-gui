package detector

import (
	"errors"
	"fmt"
	"path/filepath"
	"runtime"
	"sync"
	"syscall"
	"unsafe"
)

// These structures follow the WinTrust ABI. uintptr fields match pointer
// width on both Windows architectures; native padding is provided by Go.
type trustFile struct {
	size    uint32
	path    *uint16
	handle  uintptr
	subject *syscall.GUID
}

type trustData struct {
	size                   uint32
	policy, sip            uintptr
	ui, revocation, choice uint32
	file                   *trustFile
	action                 uint32
	state                  uintptr
	reference              *uint16
	flags, context         uint32
	signatureSettings      uintptr
}

type providerCert struct {
	size        uint32
	certificate uintptr
}

type trustAPI struct {
	verify, provider, signer, cert, certName, readRecord *syscall.LazyProc
}

var loadTrust = sync.OnceValues(func() (trustAPI, error) {
	// Load security providers from the actual system directory, independent
	// of the current directory, PATH and environment variable overrides.
	kernel := syscall.NewLazyDLL("kernel32.dll")
	system := kernel.NewProc("GetSystemDirectoryW")
	var dir [32768]uint16
	n, _, e := system.Call(uintptr(unsafe.Pointer(&dir[0])), uintptr(len(dir)))
	if n == 0 || n >= uintptr(len(dir)) {
		return trustAPI{}, fmt.Errorf("GetSystemDirectoryW: %v", e)
	}
	systemDir := syscall.UTF16ToString(dir[:n])
	trustDLL := syscall.NewLazyDLL(filepath.Join(systemDir, "wintrust.dll"))
	cryptoDLL := syscall.NewLazyDLL(filepath.Join(systemDir, "crypt32.dll"))
	verify := trustDLL.NewProc("WinVerifyTrust")
	provider := trustDLL.NewProc("WTHelperProvDataFromStateData")
	signer := trustDLL.NewProc("WTHelperGetProvSignerFromChain")
	cert := trustDLL.NewProc("WTHelperGetProvCertFromChain")
	certName := cryptoDLL.NewProc("CertGetNameStringW")
	readRecord := kernel.NewProc("ReadProcessMemory")
	for _, proc := range []*syscall.LazyProc{verify, provider, signer, cert, certName, readRecord} {
		if err := proc.Find(); err != nil {
			return trustAPI{}, err
		}
	}
	return trustAPI{verify, provider, signer, cert, certName, readRecord}, nil
})

// VerifyExecutableSignature authenticates only Antigravity.exe. Its adjacent
// ASAR is outside the executable's Authenticode signature.
func VerifyExecutableSignature(installation Installation) error {
	if installation.Platform != "windows" || !filepath.IsAbs(installation.Root) {
		return errors.New("需要本机 Windows 安装路径")
	}
	path, err := member(installation.Root, "Antigravity.exe")
	if err != nil {
		return err
	}
	name, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return err
	}

	api, err := loadTrust()
	if err != nil {
		return err
	}

	action := syscall.GUID{Data1: 0x00aac56b, Data2: 0xcd44, Data3: 0x11d0, Data4: [8]byte{0x8c, 0xc2, 0x00, 0xc0, 0x4f, 0xc2, 0x95, 0xee}}
	file := trustFile{path: name}
	file.size = uint32(unsafe.Sizeof(file))
	// WTD_UI_NONE, WTD_CHOICE_FILE, WTD_STATEACTION_VERIFY,
	// WTD_CACHE_ONLY_URL_RETRIEVAL | WTD_REVOCATION_CHECK_NONE.
	data := trustData{ui: 2, choice: 1, file: &file, action: 1, flags: 0x1010}
	data.size = uint32(unsafe.Sizeof(data))
	check := func() uintptr {
		code, _, _ := api.verify.Call(^uintptr(0), uintptr(unsafe.Pointer(&action)), uintptr(unsafe.Pointer(&data)))
		return code
	}
	code := check()
	defer func() {
		data.action = 2 // WTD_STATEACTION_CLOSE
		check()
		runtime.KeepAlive(name)
	}()
	if code != 0 {
		return fmt.Errorf("WinVerifyTrust returned 0x%08x", uint32(code))
	}
	state, _, _ := api.provider.Call(data.state)
	if state == 0 {
		return errors.New("WinTrust 未返回签名状态")
	}
	chain, _, _ := api.signer.Call(state, 0, 0, 0)
	if chain == 0 {
		return errors.New("WinTrust 未返回签名者")
	}
	leaf, _, _ := api.cert.Call(chain, 0)
	if leaf == 0 {
		return errors.New("WinTrust 未返回签名证书")
	}
	// Copy just the fixed-size prefix of the provider-owned structure. The
	// provider retains it until WTD_STATEACTION_CLOSE. Read through the
	// current-process pseudo handle so invalid records fail cleanly.
	var record providerCert
	var copied uintptr
	ok, _, err := api.readRecord.Call(^uintptr(0), leaf, uintptr(unsafe.Pointer(&record)), unsafe.Sizeof(record), uintptr(unsafe.Pointer(&copied)))
	if ok == 0 {
		return fmt.Errorf("read WinTrust certificate record: %w", err)
	}
	if copied != unsafe.Sizeof(record) || uintptr(record.size) < unsafe.Sizeof(record) || record.certificate == 0 {
		return errors.New("签名证书无效")
	}

	// Compare the verified leaf's organization attribute (OID 2.5.4.10).
	oid := []byte("2.5.4.10\x00")
	var org [256]uint16
	count, _, _ := api.certName.Call(record.certificate, 3, 0, uintptr(unsafe.Pointer(&oid[0])), uintptr(unsafe.Pointer(&org[0])), uintptr(len(org)))
	if count == 0 || count >= uintptr(len(org)) || syscall.UTF16ToString(org[:count]) != "Google LLC" {
		return errors.New("签名者并非 Google LLC")
	}
	return nil
}
