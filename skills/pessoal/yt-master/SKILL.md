---
name: yt-master
description: Planeja, roteiriza, empacota (título + thumbnail) e otimiza vídeos do YouTube combinando duas metodologias complementares — Escola Para Youtubers (Caique Pereira — embrulho-primeiro, algoritmo, CTR) e Camilo Coutinho (veterano ~20 anos — SEO de busca/Google, sistema de produção sustentável, decisões de canal) — validadas por métricas reais de múltiplos canais. Aciona ao definir ideia/ângulo/nicho, gerar títulos e conceitos de thumbnail, escrever roteiro com gancho de retenção, diagnosticar CTR/retenção/algoritmo/SEO, otimizar descrição/capítulos/playlists, planejar monetização e crescimento (YouTube Shopping, YPP, Brand Connect, Shorts, copyright), montar sistema de conteúdo ("Fortaleza de Vídeos") e decidir nome/recomeço/migração de canal. Usa a pirâmide embrulho-primeiro, o funil de cinco etapas e checklists de publicação. Não usar para edição de vídeo, geração de imagem por modelo de IA, upload via API, métricas de TikTok, Instagram ou X, nem para parecer jurídico definitivo de direitos autorais.
metadata:
  author: Pedro Nauck
  github: https://github.com/pedronauck
  repository: https://github.com/pedronauck/skills
---

# YT Master — Criação de Vídeos no YouTube

Skill para planejar, empacotar, roteirizar e otimizar vídeos do YouTube. Destila **duas metodologias complementares**: o canal **Escola Para Youtubers** (Caique Pereira, 1.4M inscritos — 50 transcrições; eixo embrulho/algoritmo/novidade) e o canal **Camilo Coutinho** (veterano ~20 anos — 100 transcrições; eixo SEO de busca, sistema de produção e decisões de canal), validadas por métricas reais de 7 canais. A espinha continua sendo: **a embalagem do vídeo (título + thumbnail) é decidida ANTES do roteiro**, porque é a primeira coisa que o espectador consome — agora somada ao **SEO de busca**, ao sistema **"Fortaleza de Vídeos"** e às **decisões estruturais de canal**.

## O modelo mental (a espinha da skill)

**Pirâmide de produção "embrulho primeiro" (2026):**

```
Ideia → Thumbnail + Título → Roteiro → Gravação → Edição → Postagem
        └─────── EMBRULHO ───────┘
```

O espectador consome na ordem: **interesse → thumbnail → título → clique → assistir → engajar**. Logo, se a thumbnail e o título não vendem o vídeo, roteirizar/gravar/editar foi esforço desperdiçado. Gate inegociável: **se o embrulho não convence, não escreva o roteiro.**

O algoritmo do YouTube mede esse vídeo num **funil de 5 etapas** — `Impressão → CTR → Retenção → Satisfação → Sessão`. Cada etapa tem um sinal mensurável; o diagnóstico de performance sempre atribui a falha à etapa certa antes de sugerir mudança.

## Required Reading Router

Combine a tarefa com a linha abaixo. Leia os arquivos listados **por inteiro antes** de produzir qualquer saída. Eles não são apêndices — são a fonte da verdade. O conteúdo inline neste SKILL.md é um ponteiro, não um substituto.

| Tarefa | LER OBRIGATORIAMENTE |
| --- | --- |
| Planejar um vídeo do zero (ideia → publicação) | `references/piramide-e-ideia.md` + `assets/briefing-video.template.md` |
| Definir/validar a ideia, ângulo ou nicho | `references/piramide-e-ideia.md` |
| Gerar ou avaliar **títulos** | `references/titulos.md` |
| Gerar ou avaliar conceito de **thumbnail** | `references/thumbnails.md` |
| Escrever roteiro / projetar gancho / melhorar retenção / desbloquear gravação | `references/roteiro-e-retencao.md` |
| Diagnosticar CTR, retenção, distribuição; SEO de busca (descrição, capítulos, playlists), algoritmo | `references/algoritmo-e-ctr.md` + `assets/prompts-pergunte-ao-studio.md` |
| Monetização, Brand Connect, sistema de produção, comunidade, nicho, Shorts, dark, copyright | `references/monetizacao-e-crescimento.md` |
| Nomear, recomeçar, reorganizar ou migrar um canal (colisão de audiência) | `references/decisoes-de-canal.md` |
| Revisão final antes de publicar | `references/checklist-publicacao.md` |

## Reference Index

- `references/piramide-e-ideia.md` — pirâmide invertida, categorização (Novidade / Aula / Lazer), regra do interesse, validação e seleção de nicho; **gate Famoso-vs-Rico**, **método VAR** e **Fortaleza de Vídeos** (Camilo).
- `references/titulos.md` — **8 fórmulas** de título com lacunas (provadas por overperformers); os **3 verbos** (encontrável/clicável/compartilhável); palavras magnéticas; brainstorm (gerar 10+); CAIXA ALTA; par título+thumbnail.
- `references/thumbnails.md` — thumbnail como embalagem; os 3 gatilhos (FOMO, dor+solução, quebra de objeção); checklist de composição; **iteração pós-publicação (troca por dados)**; ferramentas de IA; teste A/B.
- `references/roteiro-e-retencao.md` — gancho ≤30s com 2 funções; 7 técnicas de gancho; template por blocos; **eixo Problema vs Ambição**; **emoção = memória**; fluxo de escrita (descanso); **gate de desbloqueio** (brain dump, medo de câmera); diagnóstico de retenção.
- `references/algoritmo-e-ctr.md` — funil de 5 etapas; CTR relativo; mito × regra; janela de teste; **SEO em dois canais de descoberta** (funil interno + busca/Google: descrição em 5 blocos, capítulos, playlists, indexar≠ranquear, 7–9 vídeos/nicho); "views reais".
- `references/monetizacao-e-crescimento.md` — YPP; renda real ≠ AdSense; YouTube Shopping (BR); **Brand Connect operacional**; **sistema de produção sustentável** (agenda semanal, 52/ano, 40/40/20); **comunidade 15 min/dia**; dark/IA; copyright; canal do zero → monetizado.
- `references/decisoes-de-canal.md` — **(Camilo)** nome do canal (método das 4 colunas), **colisão de audiência**, recomeçar vs organizar vs migrar, 5 piores vídeos e erros estruturais ao começar.
- `references/checklist-publicacao.md` — QA pré-publicação cobrindo embrulho, roteiro, retenção, timing, SEO de busca, pós-publicação e desmonetização.

## Bundled Path Rule

Resolva todo helper relativo ao diretório que contém este `SKILL.md`. Quando um comando aparecer como `scripts/<nome>`, trate a invocação real como `<yt-master-dir>/scripts/<nome>` — expanda `<yt-master-dir>` para o diretório absoluto da skill antes de rodar.

## Pipeline operacional (Fases 0–4)

Trabalhe em fases. Não pule a Fase 1 (embrulho) para a Fase 2 (roteiro).

**Fase 0 — Ideia e ângulo.** Defina cedo o **objetivo do canal (Famoso vs Rico)** — alcance ou conversão muda o formato. Categorize a ideia em **Novidade / Aula(Tutorial) / Humor-Lazer**, defina o **interesse** que o vídeo gera para o público do nicho (não "o que eu quero fazer") e para QUEM o vídeo é. Rode o filtro **VAR** (Visão · Atração · Riqueza) na pauta. Valide o ângulo em aba anônima/canal-fake antes de prosseguir.

**STOP. Leia `references/piramide-e-ideia.md` por inteiro antes de definir ideia, ângulo ou nicho.** Ela contém a pirâmide, a categorização, a regra do interesse, o gate Famoso-vs-Rico, o método VAR e a Fortaleza de Vídeos. O resumo acima é um gatilho, não o contrato.

**Fase 1 — Embrulho (título + thumbnail).** Gere o título e o conceito de thumbnail **juntos, conectados**, antes de roteirizar. Gere **N variações de título distribuídas pelas 8 fórmulas** — nunca uma só. A thumbnail carrega ≥1 dos 3 gatilhos e comunica o interesse, não o conteúdo (simplicidade vence). Gate: se o embrulho não vende, volte à Fase 0 — **mas o gate é por qualidade, não paralisia: depois de bom o bastante, publique.**

Gist tripwires (a base que pega a maioria dos erros):

- Título e thumbnail são "um cara só": a thumbnail gera interesse, o título dá contexto **sem entregar a resposta**; nunca repetir o título inteiro na thumbnail.
- Thumbnail = embalagem (o interesse), não o conteúdo do vídeo.
- Use IA para brainstorm de título, mas **não 100%** — senão cai no mesmo cesto de todo mundo.

**STOP. Leia `references/titulos.md` e `references/thumbnails.md` por inteiro antes de gerar ou avaliar qualquer título ou thumbnail.** Elas contêm as 8 fórmulas com provas, os 3 verbos, as palavras magnéticas, os 3 gatilhos, o checklist de composição e a iteração pós-publicação. Os bullets acima são tripwires, não o contrato.

**Fase 2 — Roteiro e gancho.** Antes de escrever, faça o **brain dump** (descarregue tudo) — a causa nº1 de travar para gravar é não ter o conteúdo planejado, não a câmera. Escreva o gancho (0–30s) com exatamente 2 funções: relembrar a promessa do clique + prometer o payoff de continuar. Escolha ≥1 técnica de gancho nomeada. Calibre o payoff no eixo **Problema vs Ambição** e lembre que **emoção = memória** (faz a pessoa voltar). Segmente o roteiro por blocos com função e duração; ajuste o ritmo de edição à faixa etária.

**STOP. Leia `references/roteiro-e-retencao.md` por inteiro antes de escrever roteiro ou gancho.** Ela contém o limite de ≤30s, a biblioteca de 7 técnicas, o template por blocos, o eixo Problema vs Ambição, o fluxo de escrita e o gate de desbloqueio. O parágrafo acima é um gatilho, não o contrato.

**Fase 3 — Otimização e diagnóstico.** Diagnostique sempre na ordem do funil: `Impressão → CTR → Retenção → Satisfação → Sessão`. Avalie CTR contra a média de 90 dias do próprio canal (nunca "5% universal"). Trate as primeiras 12–48h como janela de teste; nas primeiras **8–24h, troque a thumbnail por dados** se o CTR ficar abaixo da faixa do canal (CTR boa não salva retenção ruim). Otimize **dois canais de descoberta**: o funil interno (embrulho/retenção) e a **busca/Google** — descrição em 5 blocos, capítulos rankeáveis e playlists valem para todos (indexar ≠ ranquear); SEO "hard" só se o tráfego principal vier de busca.

**STOP. Leia `references/algoritmo-e-ctr.md` por inteiro antes de qualquer diagnóstico de performance, CTR ou SEO.** Ela contém o funil com sinais, a tabela mito × regra real, a régua de benchmark relativo, os dois canais de descoberta e os prompts "Pergunte ao Studio". Os bullets acima são tripwires, não o contrato.

**Fase 4 — Monetização e crescimento.** Trate o canal como **negócio, não hobby**. Mapeie o papel (técnico/empreendedor/gerente) e o estágio (infância/adolescência/maturidade). Renda real raramente é AdSense — destrave produtos próprios, patrocínio, YouTube Shopping e **Brand Connect** (você define o preço). Estruture a produção como **sistema sustentável**: "Fortaleza de Vídeos" (editorias amarradas por keyword), agenda semanal por disciplina, **52 vídeos/ano (1/semana)** e mix 40/40/20 — não prometa "1/dia". Trate comentários como sistema (15 min/dia → banco de pautas). Antes de aprovar produção dark/IA, rode o gate anti-desmonetização (transformação significativa? estrutura repetitiva? AI slop?).

**STOP. Leia `references/monetizacao-e-crescimento.md` por inteiro antes de aconselhar monetização, nicho, Shorts, dark, sistema de produção ou copyright.** Ela contém a tabela de requisitos, o caminho canal-do-zero, Shopping/Brand Connect, o sistema de produção sustentável, os 3 erros que desmonetizam e a estratégia anti-copyright. O parágrafo acima é um gatilho, não o contrato.

**Decisões estruturais de canal (transversal).** Para **nomear, recomeçar, reorganizar ou migrar** um canal — e evitar a **colisão de audiência** (atrair Tema A e entregar Tema B → views caem e o criador culpa o algoritmo errado) — leia `references/decisoes-de-canal.md`. Não é uma fase do pipeline por-vídeo; é decisão de estrutura.

**Revisão final.** Antes de declarar um vídeo pronto para publicar, rode o checklist.

**STOP. Leia `references/checklist-publicacao.md` por inteiro antes de aprovar um vídeo para publicação.**

## Aviso de volatilidade (aplicar SEMPRE)

Parte da metodologia descreve recursos e regras de **2026** e do **mercado brasileiro**, e alguns números são **anedóticos (N=1)**. Sinalize sempre que:

- A regra depende de UI/feature do YouTube de 2026 (IA de thumbnail do Studio, "Discover with Previews", links em Shorts, "views reais") → **a regra durável é o princípio; a feature é perecível. Confirmar na documentação oficial no momento de uso.**
- O número é específico do Brasil (YouTube Shopping com Mercado Livre/Shopee, Creators by Husk/Nomad, MEI/CNPJ, IOF, Fair Use como "área cinzenta") → **assume-se Brasil como default; sinalizar se o usuário estiver fora do BR.**
- O benchmark é de um canal específico ou estudo antigo (CTR 6,2%; "1M de views em 5 dias"; "R$184 em Shopping"; "60% da intenção de clique vem da thumbnail"; "CTR saudável 2,5–9%", estudos de 2019 citados por Camilo) → **ilustração datada, nunca meta garantida; a régua durável é comparar com a média do próprio canal.**
- A fonte tem viés de afiliação (Caique é parceiro pago de ferramentas que cita; **Camilo vende livro/mentoria e cita ferramentas**) → **apresentar ferramentas/produtos como opções, nunca embutir um fornecedor único, link de afiliado ou o produto do autor.**

## Scripts (helpers read-only)

- `scripts/ctr-baseline.py` — **read-only / cálculo.** Calcula o CTR a partir de impressões e cliques e compara com uma baseline (a média de 90 dias do próprio canal). Reforça a regra "CTR é relativo, não um alvo universal". Uso: `python3 <yt-master-dir>/scripts/ctr-baseline.py --impressoes 540000 --cliques 33000 --baseline 6.2`.
- `scripts/title-check.py` — **read-only / heurística.** Pontua um título contra as heurísticas extraídas (fórmula reconhecida, palavra magnética, palavra-chave em CAIXA ALTA, especificidade entre parênteses, tamanho). Uso: `python3 <yt-master-dir>/scripts/title-check.py "A NOVA monetização do YouTube é melhor que TODAS!"`.

Ambos escrevem em stdout (sucesso) e stderr (erro) para auto-correção; nenhum altera arquivos.

## Glossário nativo (br)

empacotamento/embalagem (o par título+thumbnail) · embrulho · CTR / taxa de cliques · impressões · público quente/frio · retenção / watch time / minutos assistidos · funil de entrega · origens de tráfego (início/home, sugeridos, busca, notificação, página do canal) · buraco/gancho de curiosidade · gatilho (FOMO, dor, quebra de objeção) · pirâmide de conteúdo · YPP (Programa de Parcerias) · YouTube Shopping · Brand Connect · canal dark/automático · AI slop · co-viewing / views reais · "Pergunte ao Studio" · **SEO de busca · descrição Lego (5 blocos) · capítulos rankeáveis · conteúdo episódico · indexar ≠ ranquear · Fortaleza de Vídeos · método VAR (Visão/Atração/Riqueza) · gate Famoso-vs-Rico · colisão de audiência · brain dump · mix 40/40/20 · eixo Problema vs Ambição** (eixo Camilo Coutinho).

## Quando NÃO usar

- **Editar o vídeo em si** (cortes, color, áudio em DAW/NLE) — esta skill planeja e empacota, não edita mídia.
- **Gerar a imagem da thumbnail por modelo de IA** — esta skill define o *conceito* e o checklist; a geração de pixels é outra ferramenta.
- **Upload/automação via YouTube Data API** — fora de escopo.
- **Métricas de outras plataformas** (TikTok, Instagram, X) — o modelo de algoritmo aqui é específico do YouTube.
- **Parecer jurídico de direitos autorais** — a skill dá heurísticas de risco, não aconselhamento legal.

## Error Handling

- **Usuário pede roteiro antes de ter título/thumbnail:** recuse avançar; volte à Fase 1 e produza o embrulho primeiro (gate da pirâmide).
- **Usuário pede um "CTR bom" absoluto:** não cravar número; peça/estime a média de 90 dias do canal e compare relativo (`scripts/ctr-baseline.py`).
- **Regra citada parece datada (feature de 2026):** aplique o Aviso de volatilidade — entregue o princípio durável e marque a feature como "confirmar na fonte oficial".
- **Nicho fora do Brasil:** sinalize que parceiros/impostos/Shopping são BR-específicos e generalize só o framework.
- **Ideia depende de conteúdo de terceiros (filme/jogo/notícia):** acione a estratégia "Conteúdo Original Infinito" em `references/monetizacao-e-crescimento.md` antes de aprovar.
- **Usuário quer mudar o nicho/tema do canal:** alerte sobre **colisão de audiência** e aplique a régua de `references/decisoes-de-canal.md` (mesma categoria → reaproveita o canal; mudança drástica → canal novo).
- **Criador travado para gravar ("tenho medo/vergonha"):** trate como **gate de desbloqueio** (brain dump + conteúdo de segurança + espelho), não como problema de equipamento — ver `references/roteiro-e-retencao.md`.
