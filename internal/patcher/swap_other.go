//go:build !darwin

package patcher

import "errors"

func swapBundle(stage, live string) error { return errors.New("整包原子交换仅适用于 macOS") }
