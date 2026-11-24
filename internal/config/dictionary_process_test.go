package config

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"testing"
	"time"
)

// Each child uses an independent Store and its own package-level mutexes.
// Remove preexisting entries as well as adding and replacing new entries.
func TestDictionaryAcrossProcesses(t *testing.T) {
	const workers, words = 4, 14
	if index := os.Getenv("AGZH_TEST_DICT_WORKER"); index != "" {
		s, err := Open(os.Getenv("AGZH_TEST_DICT_DIR"))
		if err != nil {
			t.Fatal(err)
		}
		if index == "exit-with-lock" {
			if _, err := s.lockDictionary(); err != nil {
				t.Fatal(err)
			}
			os.Exit(73) // No deferred release; the kernel must release the lock.
		}
		for j := 0; j < words; j++ {
			key := fmt.Sprintf("Term %s/%d", index, j)
			value := "初稿"
			if _, err := s.EditDictionary(key, &value); err != nil {
				t.Fatal(err)
			}
			value = "定稿"
			if _, err := s.EditDictionary(key, &value); err != nil {
				t.Fatal(err)
			}
			if _, err := s.EditDictionary("Remove "+key, nil); err != nil {
				t.Fatal(err)
			}
		}
		return
	}

	s := tempStore(t)
	seed := map[string]string{"Keep this": "保留"}
	for i := 0; i < workers; i++ {
		for j := 0; j < words; j++ {
			seed[fmt.Sprintf("Remove Term %d/%d", i, j)] = "移除"
		}
	}
	if err := s.SaveDictionary(seed); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	start := func(index string) ([]byte, error) {
		child := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestDictionaryAcrossProcesses$")
		child.Env = append(os.Environ(), "AGZH_TEST_DICT_WORKER="+index, "AGZH_TEST_DICT_DIR="+s.dir)
		return child.CombinedOutput()
	}
	msg, err := start("exit-with-lock")
	var exit *exec.ExitError
	if !errors.As(err, &exit) || exit.ExitCode() != 73 {
		t.Fatalf("lock holder: %s %v", msg, err)
	}
	results := make(chan error, workers)
	for i := 0; i < workers; i++ {
		go func(index int) {
			msg, err := start(strconv.Itoa(index))
			if err != nil {
				err = fmt.Errorf("writer %d: %s: %w", index, msg, err)
			}
			results <- err
		}(i)
	}
	for i := 0; i < workers; i++ {
		if err := <-results; err != nil {
			t.Error(err)
		}
	}
	final, err := s.LoadDictionary()
	if err != nil {
		t.Fatal(err)
	}
	if len(final) != workers*words+1 || final["Keep this"] != "保留" {
		t.Fatalf("expected %d saved entries, got %d", workers*words+1, len(final))
	}
	for i := 0; i < workers; i++ {
		for j := 0; j < words; j++ {
			key := fmt.Sprintf("Term %d/%d", i, j)
			if final[key] != "定稿" {
				t.Fatalf("lost edit: %s", key)
			}
		}
	}
}
