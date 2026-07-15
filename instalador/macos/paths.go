package main

import (
	"os"
	"path/filepath"
)

// GetDefaultInstallDir retorna o caminho padrão para macOS (~/.config/opencode)
func GetDefaultInstallDir() string {
	home := os.Getenv("HOME")
	if home == "" {
		home = "/Users/shared"
	}
	return filepath.Join(home, ".config", "opencode")
}

// GetOSName retorna o nome amigável do sistema operacional
func GetOSName() string {
	return "macOS"
}
