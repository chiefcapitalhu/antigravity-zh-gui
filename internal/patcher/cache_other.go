//go:build !windows

package patcher

// RemoveAll on Unix unlinks links encountered inside a real cache directory.
func checkCacheEntry(path string) error { return nil }
func checkCacheTree(path string) error  { return nil }
