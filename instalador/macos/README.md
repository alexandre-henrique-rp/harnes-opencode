# Instruções de Compilação para macOS

Para compilar o instalador interativo em Go para o macOS:

### Executando a partir da pasta raiz `instalador/`:
```bash
# Compilar para macOS AMD64 (Macs baseados em Intel)
GOOS=darwin GOARCH=amd64 go build -o harness-installer-macos main.go macos/paths.go

# Compilar para macOS ARM64 (Apple Silicon M1/M2/M3/M4)
GOOS=darwin GOARCH=arm64 go build -o harness-installer-macos-arm64 main.go macos/paths.go
```

### Executando a partir da própria pasta `instalador/macos/`:
```bash
# Compilar para macOS ARM64
GOOS=darwin GOARCH=arm64 go build -o harness-installer-macos-arm64 ../main.go paths.go
```
