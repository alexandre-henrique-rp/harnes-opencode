#!/usr/bin/env python3
"""retencao-check.py — read-only / cálculo.

Calcula a retenção de um Reel/vídeo a partir da duração e do tempo médio
assistido, e compara com as réguas extraídas dos canais Hyeser (regra dos 33%)
e Rafael Kiso (limiares absolutos por superfície: Feed 10s / Explorar 11s /
aba Reels 15s). Reforça que "retenção é o motor da distribuição" e que os
números são heurísticas DATADAS (2024-2026), não leis. Não altera arquivos.

Uso:
  python3 retencao-check.py --duracao 45 --media 18
  python3 retencao-check.py --duracao 60 --media 12 --json

Saída: relatório + veredito em stdout (exit 0); erro em stderr (exit 1).
"""
import argparse
import json
import sys

# Limiares absolutos de retenção (segundos) para entrega a NÃO seguidores.
# Números 2024-2026 citados por Rafael Kiso — voláteis, confirmar na fonte.
LIMIARES = {"Feed": 10.0, "Explorar": 11.0, "aba Reels": 15.0}
REGRA_PERCENTUAL = 1 / 3  # heurística mental de Hyeser: ~1/3 do tempo


def main() -> int:
    p = argparse.ArgumentParser(description="Calcula retenção e compara com as réguas insta-master.")
    p.add_argument("--duracao", type=float, required=True, help="Duração do vídeo em segundos.")
    p.add_argument("--media", type=float, required=True, help="Tempo médio assistido em segundos.")
    p.add_argument("--json", action="store_true", help="Saída em JSON.")
    args = p.parse_args()

    if args.duracao <= 0:
        print("ERRO: --duracao deve ser > 0.", file=sys.stderr)
        return 1
    if args.media < 0:
        print("ERRO: --media não pode ser negativa.", file=sys.stderr)
        return 1
    if args.media > args.duracao:
        print("ERRO: tempo médio (--media) não pode ser maior que a duração (--duracao).", file=sys.stderr)
        return 1

    pct = args.media / args.duracao
    alvo_33 = args.duracao * REGRA_PERCENTUAL
    passou_33 = args.media >= alvo_33
    superficies = {nome: args.media >= seg for nome, seg in LIMIARES.items()}

    dicas = []
    if not passou_33:
        dicas.append(
            f"Abaixo da regra dos 33%: precisa de ~{alvo_33:.0f}s médios (tem {args.media:.0f}s). "
            "Conserte o COMEÇO (primeira frase / mova a melhor parte para a frente / corte os respiros)."
        )
    nao_passou = [n for n, ok in superficies.items() if not ok]
    if nao_passou:
        dicas.append(
            "Não bate o limiar de: " + ", ".join(nao_passou) +
            ". Mire >15s para cobrir todas as superfícies (Feed/Explorar/aba Reels)."
        )
    if args.duracao > 60:
        dicas.append("Vídeo >60s: <60s concentra 80-86% do crescimento. Considere encurtar.")
    if passou_33 and not nao_passou:
        dicas.append("Retenção saudável pelas duas réguas. Verifique então os SINAIS SOCIAIS (CTA de pergunta / final com gancho).")
    dicas.append("Lembrete: limiares são heurísticas datadas (2024-2026). A régua durável é 'retenção é o motor'; compare com a média do PRÓPRIO perfil.")

    if args.json:
        print(json.dumps({
            "duracao_s": args.duracao,
            "media_s": args.media,
            "retencao_pct": round(pct * 100, 1),
            "alvo_33pct_s": round(alvo_33, 1),
            "passou_regra_33": passou_33,
            "limiares_superficie": superficies,
            "dicas": dicas,
        }, ensure_ascii=False, indent=2))
        return 0

    print(f"Duração: {args.duracao:.0f}s · Tempo médio assistido: {args.media:.0f}s")
    print(f"Retenção: {pct * 100:.1f}%")
    print(f"  Regra dos 33% (Hyeser): alvo ~{alvo_33:.0f}s → {'OK' if passou_33 else 'ABAIXO'}")
    print("  Limiares por superfície (Kiso, p/ não-seguidores):")
    for nome, seg in LIMIARES.items():
        print(f"    {nome} (≥{seg:.0f}s): {'OK' if superficies[nome] else 'ABAIXO'}")
    print("Dicas:")
    for d in dicas:
        print(f"  - {d}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
