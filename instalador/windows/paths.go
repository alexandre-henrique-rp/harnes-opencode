package main

import (
	"os"
	"path/filepath"
)

// GetDefaultInstallDir retorna o caminho padrão para Windows (%APPDATA%\opencode)
func GetDefaultInstallDir() string {
	appdata := os.Getenv("APPDATA")
	if appdata == "" {
		home := os.Getenv("USERPROFILE")
		if home == "" {
			home = "C:\\"
		}
		return filepath.Join(home, ".config", "opencode")
	}
	return filepath.Join(appdata, "opencode")
}

// GetOSName retorna o nome amigável do sistema operacional
func GetOSName() string {
	return "Windows"
}
