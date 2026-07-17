#!/usr/bin/env python3
"""post-check.py — read-only / heurística.

Pontua a LEGENDA + hashtags de um post contra as heurísticas de descoberta
(SEO interno / AEO) extraídas de Rafael Kiso e Hyeser: legenda no template
Pergunta→Resposta, parágrafos curtos, 3-5 hashtags na legenda, hashtags não
empilhadas em excesso, e um CTA de pergunta. NÃO é juiz absoluto — é um tripwire
para revisar o post antes de publicar. Não altera arquivos.

Uso:
  python3 post-check.py "Como crescer no Instagram do zero?

  A resposta curta: foque em retenção e em um subnicho claro... #instagram #crescimento"
  python3 post-check.py --json "<legenda completa>"

Saída: relatório de sinais + nota (0-100) em stdout (exit 0); erro em stderr (exit 1).
"""
import argparse
import json
import re
import sys

HASHTAGS_BANIDAS_EXEMPLO = {"#followforfollow", "#seguidores", "#like4like", "#f4f", "#l4l", "#sdv"}


def main() -> int:
    p = argparse.ArgumentParser(description="Pontua a legenda+hashtags de um post contra as heurísticas insta-master.")
    p.add_argument("legenda", help="A legenda completa do post (entre aspas; pode ter quebras de linha).")
    p.add_argument("--json", action="store_true", help="Saída em JSON.")
    args = p.parse_args()

    texto = args.legenda.strip()
    if not texto:
        print("ERRO: legenda vazia.", file=sys.stderr)
        return 1

    linhas = [l for l in texto.splitlines() if l.strip()]
    primeira_linha = linhas[0] if linhas else ""
    hashtags = re.findall(r"#\w+", texto)
    n_hashtags = len(hashtags)
    n_paragrafos = len(linhas)
    n_chars = len(texto)

    sinais = {
        "primeira_linha_pergunta": primeira_linha.strip().endswith("?"),
        "tem_segundo_paragrafo": n_paragrafos >= 2,
        "n_hashtags": n_hashtags,
        "hashtags_na_faixa_3_5": 3 <= n_hashtags <= 5,
        "tem_cta_pergunta": texto.rstrip().endswith("?") or "?" in (linhas[-1] if linhas else ""),
        "legenda_de_uma_linha": n_paragrafos == 1,
        "hashtags_banidas_exemplo": sorted(h for h in hashtags if h.lower() in HASHTAGS_BANIDAS_EXEMPLO),
        "tamanho_caracteres": n_chars,
    }

    score = 0
    score += 25 if sinais["primeira_linha_pergunta"] else 0          # linha 1 = a pergunta que o público digita
    score += 20 if sinais["tem_segundo_paragrafo"] else 0           # parágrafo 2 = a resposta (snippet)
    score += 25 if sinais["hashtags_na_faixa_3_5"] else (10 if 1 <= n_hashtags <= 8 else 0)
    score += 15 if sinais["tem_cta_pergunta"] else 0                # CTA de comentário via pergunta
    score += 15 if not sinais["legenda_de_uma_linha"] else 0        # legenda de 1 linha = desperdício de indexação
    if sinais["hashtags_banidas_exemplo"]:
        score = max(0, score - 20)
    score = min(score, 100)

    dicas = []
    if not sinais["primeira_linha_pergunta"]:
        dicas.append("Linha 1 não é uma pergunta: comece com a PERGUNTA exata que o público digita no Google/ChatGPT (template P→R).")
    if not sinais["tem_segundo_paragrafo"]:
        dicas.append("Sem 2º parágrafo: adicione a RESPOSTA direta logo após a pergunta (vira snippet nos buscadores).")
    if n_hashtags == 0:
        dicas.append("Sem hashtags: use 3-5 relevantes NA LEGENDA (não 30, não nos comentários).")
    elif not sinais["hashtags_na_faixa_3_5"]:
        dicas.append(f"{n_hashtags} hashtags: a faixa recomendada é 3-5, próximas entre si (mesmo campo semântico), substituindo palavras da legenda.")
    if sinais["hashtags_banidas_exemplo"]:
        dicas.append("Hashtags genéricas/banidas detectadas (" + ", ".join(sinais["hashtags_banidas_exemplo"]) + "): remova — penalizam a entrega.")
    if not sinais["tem_cta_pergunta"]:
        dicas.append("Sem CTA de pergunta: peça COMENTÁRIO via pergunta aberta (não 'comente aí', não 'salve/compartilhe').")
    if sinais["legenda_de_uma_linha"]:
        dicas.append("Legenda de 1 linha: 'não é mais sobre as pessoas, é sobre os robôs' — Google/IA leem a legenda. Estruture em parágrafos curtos.")
    dicas.append("Lembrete: verifique tópicos (1-2) + alt text ao postar; confirme que as hashtags não estão banidas ('seguir hashtag' indisponível = banida).")

    if args.json:
        print(json.dumps({"score": score, "sinais": sinais, "hashtags": hashtags, "dicas": dicas}, ensure_ascii=False, indent=2))
        return 0

    print(f"Nota heurística da legenda: {score}/100")
    print(f"  Linha 1 é pergunta (template P→R): {'sim' if sinais['primeira_linha_pergunta'] else 'não'}")
    print(f"  Tem 2º parágrafo (resposta/snippet): {'sim' if sinais['tem_segundo_paragrafo'] else 'não'}")
    print(f"  Hashtags: {n_hashtags} {'(faixa 3-5 OK)' if sinais['hashtags_na_faixa_3_5'] else '(fora da faixa 3-5)'}")
    print(f"  CTA de pergunta: {'sim' if sinais['tem_cta_pergunta'] else 'não'}")
    print(f"  Parágrafos: {n_paragrafos} · Tamanho: {n_chars} caracteres")
    print("Dicas:")
    for d in dicas:
        print(f"  - {d}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
