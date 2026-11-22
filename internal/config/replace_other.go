//go:build !windows

package config

import "os"

func replaceConfig(source, destination string) error {
	return os.Rename(source, destination)
}
