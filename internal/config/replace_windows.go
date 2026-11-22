package config

import (
	"errors"
	"os"
	"syscall"
	"time"
)

// An independent reader (e.g. a second copy of the tool or an indexer) can
// briefly hold the destination without FILE_SHARE_DELETE. Retry the same
// rename; the old config remains in place if the conflict outlasts the budget.
func replaceConfig(source, destination string) error {
	const sharingViolation = syscall.Errno(32)
	const lockViolation = syscall.Errno(33)
	delays := [...]time.Duration{10, 20, 40, 80, 160, 250}
	for attempt := 0; ; attempt++ {
		err := os.Rename(source, destination)
		if err == nil || attempt == len(delays) {
			return err
		}
		if !errors.Is(err, syscall.ERROR_ACCESS_DENIED) && !errors.Is(err, sharingViolation) && !errors.Is(err, lockViolation) {
			return err
		}
		time.Sleep(delays[attempt] * time.Millisecond)
	}
}
