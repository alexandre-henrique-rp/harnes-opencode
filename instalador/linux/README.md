# Instruções de Compilação para Linux

Para compilar o instalador interativo em Go para sistemas Linux (64-bit e ARM):

### Executando a partir da pasta raiz `instalador/`:
```bash
# Compilar para Linux AMD64
go build -o harness-installer main.go linux/paths.go

# Compilar para Linux ARM64
GOOS=linux GOARCH=arm64 go build -o harness-installer-arm64 main.go linux/paths.go
```

### Executando a partir da própria pasta `instalador/linux/`:
```bash
# Compilar para Linux AMD64
go build -o harness-installer-linux ../main.go paths.go
```
