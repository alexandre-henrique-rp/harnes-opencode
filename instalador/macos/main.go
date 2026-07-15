package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"golang.org/x/term"
)

const (
	HarnessVersion = "6.4.0"
	RepoZipURL     = "https://github.com/alexandre-henrique-rp/harnes-opencode/archive/refs/heads/main.zip"
	ZipRootFolder  = "harnes-opencode-main"
)

// Cores ANSI para formatação do terminal
var (
	ColorReset  = "\033[0m"
	ColorBold   = "\033[1m"
	ColorRed    = "\033[31m"
	ColorGreen  = "\033[32m"
	ColorYellow = "\033[33m"
	ColorBlue   = "\033[34m"
	ColorCyan   = "\033[36m"
)

func init() {
	if os.Getenv("TERM") == "dumb" {
		ColorReset = ""
		ColorBold = ""
		ColorRed = ""
		ColorGreen = ""
		ColorYellow = ""
		ColorBlue = ""
		ColorCyan = ""
	}
}

func main() {
	printBanner()

	// 1. Verificação de Pré-requisitos
	checkPrerequisites()

	// 2. Menu Interativo de Escolha de Ação (Seletor por Setas)
	fmt.Printf("\n%sSelecione a ação desejada:%s\n", ColorBold, ColorReset)
	options := []string{
		"Instalação Limpa (Fresh Install) — Sobrescreve core e configs padrão",
		"Atualização (Update) — Preserva customizações e faz merge inteligente de configs",
		"Desinstalação (Uninstall) — Remove o Harness e restaura backup",
		"Cancelar e Sair",
	}

	choiceIdx := selectOption(options)

	if choiceIdx == 3 {
		fmt.Println("Operação cancelada pelo usuário.")
		os.Exit(0)
	}

	// 3. Escolha do diretório de instalação
	defaultDir := GetDefaultInstallDir()
	fmt.Printf("\n%sConfiguração do Diretório de Destino:%s\n", ColorBold, ColorReset)
	fmt.Printf("Caminho padrão detectado para %s: %s%s%s\n", GetOSName(), ColorBlue, defaultDir, ColorReset)
	fmt.Printf("Pressione Enter para confirmar ou digite outro caminho completo: ")

	reader := bufio.NewReader(os.Stdin)
	userDirBytes, _, _ := reader.ReadLine()
	userDir := strings.TrimSpace(string(userDirBytes))

	installDir := defaultDir
	if userDir != "" {
		if strings.HasPrefix(userDir, "~") {
			home, _ := os.UserHomeDir()
			installDir = filepath.Join(home, userDir[1:])
		} else {
			installDir = filepath.Clean(userDir)
		}
	}

	installDir, _ = filepath.Abs(installDir)
	fmt.Printf("Diretório selecionado: %s%s%s\n", ColorGreen, installDir, ColorReset)

	// Inicia execução com base na escolha
	switch choiceIdx {
	case 0:
		runInstall(installDir, false)
	case 1:
		runInstall(installDir, true)
	case 2:
		runUninstall(installDir)
	}
}

func printBanner() {
	logo := `
██╗  ██╗ █████╗ ██████╗ ███╗   ██╗███████╗███████╗███████╗
██║  ██║██╔══██╗██╔══██╗████╗  ██║██╔════╝██╔════╝██╔════╝
███████║███████║██████╔╝██╔██╗ ██║█████╗  ███████╗███████╗
██╔══██║██╔══██║██╔══██╗██║╚██╗██║██╔══╝  ╚════██║╚════██║
██║  ██║██║  ██║██║  ██║██║ ╚████║███████╗███████║███████║
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝╚══════╝`

	fmt.Printf("%s%s%s\n", ColorCyan, logo, ColorReset)
	fmt.Printf("%s+--------------------------------------------------+%s\n", ColorBold, ColorReset)
	fmt.Printf("%s|  Harness v6 Installer (%-23s)  |%s\n", ColorBold, GetOSName()+"-Platform", ColorReset)
	fmt.Printf("%s|  Version: %-38s |%s\n", ColorBold, HarnessVersion, ColorReset)
	fmt.Printf("%s+--------------------------------------------------+%s\n", ColorBold, ColorReset)
}

func checkPrerequisites() {
	fmt.Printf("\n%s[1/4] Verificando Pré-requisitos...%s\n", ColorBold, ColorReset)

	opencodeFound := false
	detectionMsg := ""

	if _, err := exec.LookPath("opencode"); err == nil {
		opencodeFound = true
		detectionMsg = "OpenCode CLI detectado no PATH."
	} else {
		defaultDir := GetDefaultInstallDir()
		if _, err := os.Stat(defaultDir); err == nil {
			opencodeFound = true
			detectionMsg = fmt.Sprintf("OpenCode detectado (Pasta de configuração ativa em %s).", defaultDir)
		} else {
			home, _ := os.UserHomeDir()
			localBin := filepath.Join(home, ".local", "bin", "opencode")
			if _, err := os.Stat(localBin); err == nil {
				opencodeFound = true
				detectionMsg = fmt.Sprintf("OpenCode CLI detectado em %s.", localBin)
			}
		}
	}

	if opencodeFound {
		fmt.Printf("  %s[OK]%s  %s\n", ColorGreen, ColorReset, detectionMsg)
	} else {
		fmt.Printf("  %s[AVISO]%s OpenCode não encontrado. Instale-o posteriormente via:\n", ColorYellow, ColorReset)
		fmt.Println("          curl -fsSL https://opencode.ai/install | bash")
	}

	if _, err := exec.LookPath("node"); err == nil {
		fmt.Printf("  %s[OK]%s  Node.js detectado no PATH.\n", ColorGreen, ColorReset)
	} else {
		fmt.Printf("  %s[AVISO]%s Node.js não foi encontrado. Necessário para executar os plugins e MCPs.\n", ColorYellow, ColorReset)
	}

	if _, err := exec.LookPath("npm"); err == nil {
		fmt.Printf("  %s[OK]%s  npm detectado no PATH.\n", ColorGreen, ColorReset)
	} else {
		fmt.Printf("  %s[AVISO]%s npm não foi encontrado. Necessário para instalar dependências de plugins.\n", ColorYellow, ColorReset)
	}
}

func runInstall(destDir string, isUpdate bool) {
	fmt.Printf("\n%s[2/4] Preparando Ambiente e Backup...%s\n", ColorBold, ColorReset)

	if err := os.MkdirAll(destDir, 0755); err != nil {
		fmt.Printf("%sErro ao criar diretório de destino: %v%s\n", ColorRed, err, ColorReset)
		os.Exit(1)
	}

	setupGitRestorePoint(destDir)

	timestamp := time.Now().Format("20060102_150405")
	backupDir := filepath.Join(destDir, "backup", "backup_"+timestamp)
	
	if hasExistingHarnessFiles(destDir) {
		fmt.Printf("  Copiando backup preventivo dos arquivos para: %s\n", backupDir)
		if err := copyDirectoryExcludeBackup(destDir, backupDir); err != nil {
			fmt.Printf("  %s[AVISO] Falha ao criar backup físico: %v. Continuando com o Git.%s\n", ColorYellow, err, ColorReset)
		} else {
			fmt.Printf("  %s[OK]%s Backup físico datado criado com sucesso.\n", ColorGreen, ColorReset)
		}
	}

	fmt.Printf("\n%s[3/4] Baixando e Extraindo os Arquivos do GitHub...%s\n", ColorBold, ColorReset)
	
	tempZipFile, err := downloadZip(RepoZipURL)
	if err != nil {
		fmt.Printf("%sErro no download: %v%s\n", ColorRed, err, ColorReset)
		os.Exit(1)
	}
	defer os.Remove(tempZipFile)

	foldersToCopy := []string{"agents", "commands", "examples", "plugins", "skills", "templates", "tools", "training"}
	filesToCopy := []string{
		"AGENTS.md", "GERAIS.md", "opencode.json", "package.json",
		"failure-protocol.json", "state-machine-lean.json", "state-machine.json",
	}

	if err := extractSelectedFiles(tempZipFile, destDir, foldersToCopy, filesToCopy, isUpdate); err != nil {
		fmt.Printf("%sErro ao extrair arquivos: %v%s\n", ColorRed, err, ColorReset)
		os.Exit(1)
	}
	fmt.Printf("  %s[OK]%s Arquivos de estrutura copiados com sucesso.\n", ColorGreen, ColorReset)

	fmt.Printf("\n%s[4/4] Instalando Dependências e Configurando MCPs...%s\n", ColorBold, ColorReset)

	installNpmDependencies(destDir)

	commitGitRestorePoint(destDir, "Instalação/Atualização concluída com sucesso")

	fmt.Printf("\n%s+--------------------------------------------------+%s\n", ColorGreen, ColorReset)
	fmt.Printf("%s|  Instalação/Atualização concluída com sucesso!     |%s\n", ColorGreen, ColorReset)
	fmt.Printf("%s+--------------------------------------------------+%s\n", ColorGreen, ColorReset)
	fmt.Printf("Destino: %s\n", destDir)
	fmt.Println("Proximos Passos:")
	fmt.Println("  1. Reinicie a sua CLI do OpenCode para carregar os novos plugins.")
	fmt.Println("  2. Em qualquer projeto, use '/harness' para iniciar o fluxo.")
}

func runUninstall(destDir string) {
	fmt.Printf("\n%s[1/3] Preparando Desinstalação...%s\n", ColorBold, ColorReset)

	if !hasExistingHarnessFiles(destDir) {
		fmt.Printf("%sNenhuma instalação do Harness v6 detectada em %s.%s\n", ColorYellow, destDir, ColorReset)
		return
	}

	fmt.Printf("Tem certeza que deseja remover o Harness v6 de %s? [y/N]: ", destDir)
	var resp string
	fmt.Scanln(&resp)
	resp = strings.ToLower(strings.TrimSpace(resp))
	if resp != "y" && resp != "yes" {
		fmt.Println("Desinstalação cancelada.")
		return
	}

	restored := restoreOldestBackup(destDir)

	if !restored {
		fmt.Println("  Removendo pastas e arquivos principais do Harness...")
		itemsToRemove := []string{"agents", "commands", "templates", "tools", "plugins", "examples", "skills", "GERAIS.md", "state-machine.json", "state-machine-lean.json", "failure-protocol.json", "HARNESS-README.md"}
		for _, item := range itemsToRemove {
			p := filepath.Join(destDir, item)
			if err := os.RemoveAll(p); err == nil {
				fmt.Printf("    Removido: %s\n", item)
			}
		}
	}

	revertGitState(destDir)

	fmt.Printf("\n%sDesinstalação concluída com sucesso!%s\n", ColorGreen, ColorReset)
}

func setupGitRestorePoint(dir string) {
	gitDir := filepath.Join(dir, ".git")
	if !fsExists(gitDir) {
		fmt.Println("  Iniciando repositório Git preventivo para versionamento...")
		runCmd("git", []string{"init"}, dir)
		
		gitignore := filepath.Join(dir, ".gitignore")
		if !fsExists(gitignore) {
			os.WriteFile(gitignore, []byte("backup/\ntmp/\nnode_modules/\n"), 0644)
		}
	}

	runCmd("git", []string{"add", "."}, dir)
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	runCmd("git", []string{"commit", "-m", "Backup harness-v6 antes da alteracao: " + timestamp}, dir)
}

func commitGitRestorePoint(dir, message string) {
	runCmd("git", []string{"add", "."}, dir)
	runCmd("git", []string{"commit", "-m", "harness-v6: " + message}, dir)
}

func revertGitState(dir string) {
	gitDir := filepath.Join(dir, ".git")
	if fsExists(gitDir) {
		fmt.Println("  Revertendo modificações via Git...")
		runCmd("git", []string{"reset", "--hard", "HEAD~1"}, dir)
	}
}

func hasExistingHarnessFiles(dir string) bool {
	criticalFiles := []string{"agents/orchestrator.md", "GERAIS.md", "state-machine.json"}
	for _, file := range criticalFiles {
		if fsExists(filepath.Join(dir, file)) {
			return true
		}
	}
	return false
}

func copyDirectoryExcludeBackup(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}

		if rel == "." {
			return nil
		}

		if strings.HasPrefix(rel, "backup") || strings.HasPrefix(rel, ".git") || strings.HasPrefix(rel, "tmp") || strings.HasPrefix(rel, "node_modules") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		targetPath := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(targetPath, info.Mode())
		}

		return copyFile(path, targetPath)
	})
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err = io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}

func restoreOldestBackup(dir string) bool {
	backupRoot := filepath.Join(dir, "backup")
	if !fsExists(backupRoot) {
		return false
	}

	files, err := os.ReadDir(backupRoot)
	if err != nil || len(files) == 0 {
		return false
	}

	var oldestFolder string
	for _, file := range files {
		if file.IsDir() && strings.HasPrefix(file.Name(), "backup_") {
			if oldestFolder == "" || file.Name() < oldestFolder {
				oldestFolder = file.Name()
			}
		}
	}

	if oldestFolder == "" {
		return false
	}

	oldestPath := filepath.Join(backupRoot, oldestFolder)
	fmt.Printf("  [RESTAURAÇÃO] Encontrado backup físico mais antigo em: %s\n", oldestFolder)
	fmt.Print("  Deseja restaurar para este backup? [Y/n]: ")
	var resp string
	fmt.Scanln(&resp)
	resp = strings.ToLower(strings.TrimSpace(resp))
	if resp != "" && resp != "y" && resp != "yes" {
		return false
	}

	itemsToRemove := []string{"agents", "commands", "templates", "tools", "plugins", "examples", "skills", "GERAIS.md", "state-machine.json", "state-machine-lean.json", "failure-protocol.json", "HARNESS-README.md"}
	for _, item := range itemsToRemove {
		os.RemoveAll(filepath.Join(dir, item))
	}

	err = filepath.Walk(oldestPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(oldestPath, path)
		if rel == "." {
			return nil
		}
		target := filepath.Join(dir, rel)
		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		return copyFile(path, target)
	})

	if err != nil {
		fmt.Printf("  %sErro ao restaurar backup: %v%s\n", ColorRed, err, ColorReset)
		return false
	}

	fmt.Println("  ✓ Restauração do backup físico datado concluída.")
	return true
}

func downloadZip(url string) (string, error) {
	fmt.Println("  Baixando pacote do GitHub...")
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("bad status code: %d", resp.StatusCode)
	}

	tempFile, err := os.CreateTemp("", "harness-*.zip")
	if err != nil {
		return "", err
	}
	defer tempFile.Close()

	if _, err = io.Copy(tempFile, resp.Body); err != nil {
		return "", err
	}

	return tempFile.Name(), nil
}

func extractSelectedFiles(zipPath, destDir string, folders []string, files []string, isUpdate bool) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	rootPrefix := ZipRootFolder + "/"

	for _, f := range r.File {
		if !strings.HasPrefix(f.Name, rootPrefix) {
			continue
		}

		relPath := strings.TrimPrefix(f.Name, rootPrefix)
		if relPath == "" {
			continue
		}

		copyAllowed := false
		for _, folder := range folders {
			if strings.HasPrefix(relPath, folder+"/") {
				copyAllowed = true
				break
			}
		}

		if !copyAllowed {
			for _, file := range files {
				if relPath == file {
					copyAllowed = true
					break
				}
			}
		}

		if !copyAllowed {
			continue
		}

		targetPath := filepath.Join(destDir, relPath)

		if f.FileInfo().IsDir() {
			os.MkdirAll(targetPath, f.Mode())
			continue
		}

		if isUpdate && (relPath == "opencode.json" || relPath == "opencode.jsonc") && fsExists(targetPath) {
			fmt.Printf("  Mesclando configuração inteligente para: %s\n", relPath)
			if err := smartMergeJSONFiles(targetPath, f); err != nil {
				fmt.Printf("  %s[AVISO] Falha ao mesclar JSON: %v. Substituindo.%s\n", ColorYellow, err, ColorReset)
				if err := writeZipFile(f, targetPath); err != nil {
					return err
				}
			}
			continue
		}

		os.MkdirAll(filepath.Dir(targetPath), 0755)
		if err := writeZipFile(f, targetPath); err != nil {
			return err
		}
	}

	return nil
}

func writeZipFile(f *zip.File, targetPath string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()

	out, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err = io.Copy(out, rc); err != nil {
		return err
	}
	return nil
}

func smartMergeJSONFiles(targetPath string, f *zip.File) error {
	oldData, err := os.ReadFile(targetPath)
	if err != nil {
		return err
	}

	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	newData, err := io.ReadAll(rc)
	if err != nil {
		return err
	}

	var oldMap, newMap map[string]interface{}
	oldClean := removeJSONComments(oldData)
	newClean := removeJSONComments(newData)

	if err := json.Unmarshal(oldClean, &oldMap); err != nil {
		return err
	}
	if err := json.Unmarshal(newClean, &newMap); err != nil {
		return err
	}

	mergedMap := deepMergeMaps(oldMap, newMap)

	mergedJSON, err := json.MarshalIndent(mergedMap, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(targetPath, mergedJSON, 0644)
}

func removeJSONComments(data []byte) []byte {
	lines := strings.Split(string(data), "\n")
	var cleanLines []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "//") {
			continue
		}
		cleanLines = append(cleanLines, line)
	}
	return []byte(strings.Join(cleanLines, "\n"))
}

func deepMergeMaps(base, update map[string]interface{}) map[string]interface{} {
	for k, v := range update {
		if baseVal, exists := base[k]; exists {
			if baseMap, baseOk := baseVal.(map[string]interface{}); baseOk {
				if updateMap, updateOk := v.(map[string]interface{}); updateOk {
					base[k] = deepMergeMaps(baseMap, updateMap)
					continue
				}
			}
			if baseList, baseOk := baseVal.([]interface{}); baseOk {
				if updateList, updateOk := v.([]interface{}); updateOk {
					base[k] = mergeListsNoDup(baseList, updateList)
					continue
				}
			}
		}
		base[k] = v
	}
	return base
}

func mergeListsNoDup(listA, listB []interface{}) []interface{} {
	seen := make(map[string]bool)
	var result []interface{}

	for _, item := range listA {
		key := fmt.Sprintf("%v", item)
		if !seen[key] {
			seen[key] = true
			result = append(result, item)
		}
	}
	for _, item := range listB {
		key := fmt.Sprintf("%v", item)
		if !seen[key] {
			seen[key] = true
			result = append(result, item)
		}
	}
	return result
}

func installNpmDependencies(dir string) {
	fmt.Println("  Instalando dependências do node_modules...")

	packageManager := "npm"
	if _, err := exec.LookPath("bun"); err == nil {
		packageManager = "bun"
	}

	fmt.Printf("    Executando '%s install' em %s...\n", packageManager, dir)
	if packageManager == "bun" {
		runCmd("bun", []string{"install"}, dir)
	} else {
		runCmd("npm", []string{"install"}, dir)
	}

	installLocallyConfiguredMCPs(dir, packageManager)
}

func installLocallyConfiguredMCPs(dir, pm string) {
	opencodeJSONPath := filepath.Join(dir, "opencode.json")
	if !fsExists(opencodeJSONPath) {
		opencodeJSONPath = filepath.Join(dir, "opencode.jsonc")
		if !fsExists(opencodeJSONPath) {
			return
		}
	}

	data, err := os.ReadFile(opencodeJSONPath)
	if err != nil {
		return
	}

	var config struct {
		MCP map[string]struct {
			Command []string `json:"command"`
		} `json:"mcp"`
	}

	cleanData := removeJSONComments(data)
	if err := json.Unmarshal(cleanData, &config); err != nil {
		return
	}

	packagesToInstall := []string{}
	for _, mcpInfo := range config.MCP {
		for _, cmdArg := range mcpInfo.Command {
			if strings.Contains(cmdArg, "node_modules/.bin/") {
				parts := strings.Split(filepath.ToSlash(cmdArg), "/")
				pkgName := parts[len(parts)-1]
				
				npmPackage := pkgName
				switch pkgName {
				case "playwright-mcp":
					npmPackage = "playwright-mcp"
				case "chrome-devtools-mcp":
					npmPackage = "chrome-devtools-mcp"
				case "drawio-mcp":
					npmPackage = "drawio-mcp"
				case "ddg-search-mcp":
					npmPackage = "ddg-search-mcp"
				}

				if npmPackage != "" && !listContains(packagesToInstall, npmPackage) {
					packagesToInstall = append(packagesToInstall, npmPackage)
				}
			}
		}
	}

	if len(packagesToInstall) > 0 {
		fmt.Printf("    Detectados %d MCPs locais configurados. Instalando pacotes...\n", len(packagesToInstall))
		for _, pkg := range packagesToInstall {
			fmt.Printf("      Instalando %s...\n", pkg)
			if pm == "bun" {
				runCmd("bun", []string{"add", pkg, "--save-dev"}, dir)
			} else {
				runCmd("npm", []string{"install", pkg, "--save-dev"}, dir)
			}
		}
	}
}

func fsExists(path string) bool {
	_, err := os.Stat(path)
	return !os.IsNotExist(err)
}

func listContains(list []string, item string) bool {
	for _, x := range list {
		if x == item {
			return true
		}
	}
	return false
}

func runCmd(name string, args []string, dir string) error {
	var stderr bytes.Buffer
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Stderr = &stderr
	
	err := cmd.Run()
	if err != nil {
		return fmt.Errorf("%s: %s", err, stderr.String())
	}
	return nil
}

// selectOption exibe um menu de seleção interativo usando setas direcionais.
// Caso o terminal não seja compatível, realiza o fallback para digitação numérica.
func selectOption(options []string) int {
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return selectOptionFallback(options)
	}

	oldState, err := term.MakeRaw(int(os.Stdin.Fd()))
	if err != nil {
		return selectOptionFallback(options)
	}
	defer term.Restore(int(os.Stdin.Fd()), oldState)

	selected := 0
	optionsCount := len(options)

	fmt.Print("\033[?25l")
	defer fmt.Print("\033[?25h")

	renderMenu := func() {
		fmt.Print("\r")
		for i := 0; i < optionsCount; i++ {
			if i == selected {
				fmt.Printf("  %s❯ %s%s\r\n", ColorGreen, options[i], ColorReset)
			} else {
				fmt.Printf("    %s\r\n", options[i])
			}
		}
		fmt.Printf("\033[%dA", optionsCount)
	}

	renderMenu()

	buf := make([]byte, 3)
	for {
		n, err := os.Stdin.Read(buf)
		if err != nil || n == 0 {
			continue
		}

		if buf[0] == 13 || buf[0] == 10 {
			break
		}

		if buf[0] == 27 {
			if n >= 3 && buf[1] == 91 {
				if buf[2] == 65 {
					selected = (selected - 1 + optionsCount) % optionsCount
					renderMenu()
				} else if buf[2] == 66 {
					selected = (selected + 1) % optionsCount
					renderMenu()
				}
			}
		}

		if buf[0] == 3 {
			term.Restore(int(os.Stdin.Fd()), oldState)
			fmt.Print("\033[?25h\r\n")
			fmt.Println("Operação cancelada pelo usuário (Ctrl+C).")
			os.Exit(0)
		}
	}

	fmt.Printf("\033[%dB\r", optionsCount)
	return selected
}

func selectOptionFallback(options []string) int {
	for i, opt := range options {
		fmt.Printf("  %d. %s\n", i+1, opt)
	}
	var choice int
	for {
		fmt.Printf("\nDigite o número da sua opção (1-%d): ", len(options))
		var input string
		fmt.Scanln(&input)
		input = strings.TrimSpace(input)
		val, err := strconv.Atoi(input)
		if err == nil && val >= 1 && val <= len(options) {
			choice = val - 1
			break
		}
		fmt.Printf("%sOpção inválida! Escolha um número válido.%s\n", ColorRed, ColorReset)
	}
	return choice
}
