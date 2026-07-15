# Instruções de Compilação para Windows

Para compilar o instalador interativo em Go para o Windows:

### Executando a partir da pasta raiz `instalador/`:
```bash
# Compilar para Windows AMD64 (64-bit)
GOOS=windows GOARCH=amd64 go build -o harness-installer.exe main.go windows/paths.go

# Compilar para Windows 386 (32-bit)
GOOS=windows GOARCH=386 go build -o harness-installer-x86.exe main.go windows/paths.go
```

### Executando a partir da própria pasta `instalador/windows/`:
```bash
# Compilar para Windows AMD64
GOOS=windows GOARCH=amd64 go build -o harness-installer.exe ../main.go paths.go
```
