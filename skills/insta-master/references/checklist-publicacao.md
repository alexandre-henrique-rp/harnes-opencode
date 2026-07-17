# Checklist de publicação (QA pré-postagem)

Rode antes de declarar qualquer conteúdo pronto para publicar. Marque a fase e ataque a primeira falha na ordem do funil.

## Contents

- 1. Estratégia (intenção × jornada)
- 2. Empacotamento de tema (gancho + capa + legenda)
- 3. Retenção (produção)
- 4. Sinais sociais (CTA)
- 5. Descoberta (SEO/busca)
- 6. Integridade / anti-shadowban
- 7. Pós-publicação (janela de teste)

---

## 1. Estratégia (intenção × jornada)
- [ ] O post tem **uma intenção única** (1 de COCA: Crescimento / Objeção / Conexão / Autoridade)?
- [ ] Está claro para qual **etapa da jornada** (descoberta / consideração / conversão)?
- [ ] O formato é coerente com a etapa (Reels=descoberta, carrossel/stories=consideração, live=conversão)?
- [ ] Respeita o **80/20** (valor × extração)? Não virou propaganda?
- [ ] Fala para a "bolha dentro da bolha" (persona específica), não para "todo mundo"?

## 2. Empacotamento de tema (gancho + capa + legenda)
- [ ] A **primeira frase** (gancho) está decidida e foi lida em voz alta?
- [ ] A informação mais forte / plot twist está perto do **final** (gera comentário + re-watch)?
- [ ] Há **1 CTA** só (pergunta ou "seguir"), não vários?
- [ ] A **capa** (se houver) tem info no centro, legível na grade/Explorar?
- [ ] A 1ª linha da **legenda** gera curiosidade (pergunta), não resume o vídeo?

## 3. Retenção (produção)
- [ ] Reels ≤60s (idealmente 29-59s)?
- [ ] Estimativa de retenção ≥33% / >15s? (use `scripts/retencao-check.py` no pós)
- [ ] Funciona **sem som** (legenda + contexto visual coerente)?
- [ ] Edição lo-fi com qualidade: áudio bom, respiros cortados, fonte/filtro fixos?
- [ ] Stories em **blocos de 3-5**, interação ativa só no MEIO, link por último?

## 4. Sinais sociais (CTA)
- [ ] O CTA pede **comentário via pergunta aberta** (não "comente aí", não "salve/compartilhe")?
- [ ] Em stories: pede **resposta em texto** (não só voto de enquete)?

## 5. Descoberta (SEO/busca)
- [ ] Legenda no template **Pergunta→Resposta** com palavras-chave do nicho?
- [ ] **3-5 hashtags** na legenda (não 30, não banidas, próximas entre si)?
- [ ] **1-2 tópicos** ao postar + **alt text** descritivo?
- [ ] (use `scripts/post-check.py "<legenda>"` para uma checagem rápida)

## 6. Integridade / anti-shadowban
- [ ] **Status da conta** verde (sem restrição/duplicador)?
- [ ] Áudio/música da **biblioteca do Instagram** (sem direitos de terceiros)?
- [ ] Sem marca d'água de outra rede; sem conteúdo republicado de terceiros?
- [ ] Sem isca de engajamento ("comente X para receber o link") nem sorteio com mecânica de comentário?
- [ ] Faceless/IA: consentimento + disclosure + direitos de imagem garantidos?
- [ ] Sem automação que vira spam / sem compra de seguidores/engajamento?

## 7. Pós-publicação (janela de teste)
- [ ] Acompanhar a **1ª hora** (40-60% do resultado acontece aí) respondendo comentários com perguntas.
- [ ] Diagnosticar na ordem do funil: Distribuição → **Retenção** → Sinais sociais → **Recomendação (% não-seguidores)** → Satisfação/Conexão.
- [ ] Se a retenção falhou → consertar o **começo** do vídeo (não a capa).
- [ ] Não apagar posts que floparam (podem viralizar depois + são dado).
- [ ] Registrar na planilha **30 dias depois** (dado estável) para a engenharia reversa com IA.
