---
name: google-stitch-frontend
description: Orquestração de Frontend e integração com o Google Stitch MCP. Mapeia design tokens, grids de responsividade, wireframes ASCII e conceitos imutáveis (logo, shell de layout, biblioteca de ícones) para projetos novos ou evolução de páginas.
---

# SKILL: google-stitch-frontend

Esta skill orienta os agentes a agir como o **Agente Especialista em Arquitetura de Frontend e Orquestrador de UI**, automatizando a criação e adequação de páginas e componentes com suporte ao **Google Stitch MCP**.

---

## 1. GATILHO DE ATIVAÇÃO E VALIDAÇÃO (ORQUESTRAÇÃO)
Antes de escrever qualquer linha de código ou especificação de interface, avalie o escopo da solicitação:
- Se a tarefa exigir a criação, modificação ou evolução de qualquer elemento de interface (telas, componentes, fluxos de páginas), você DEVE interromper a execução imediatamente.
- Pergunte explicitamente ao usuário (via `question` ou mensagem): *"Identifiquei a necessidade de criar/alterar elementos de Frontend para esta feature. Deseja iniciar o fluxo de especificação técnica de UI utilizando o Google Stitch MCP?"*
- Prossiga apenas após a confirmação positiva do usuário.

---

## 1.1 REGRA CRÍTICA DO GOOGLE STITCH MCP: PROMPT ÚNICO CONSOLIDADO
> [!IMPORTANT]
> **Consolidação em Prompt Único (Múltiplas Páginas)**: O Google Stitch MCP não aceita múltiplos prompts sequenciais ou fragmentados. Se a sprint ou funcionalidade exigir a criação de **múltiplas páginas** (ex: criar 2 páginas de uma vez), você **DEVE**:
> 1. Escrever o detalhamento, wireframes ASCII, design tokens e regras de **todas as páginas envolvidas** de forma conjunta.
> 2. Salvar este prompt único completo na pasta do harness como `.harness/ui-specs/[nome_da_feature]_mcp_prompt.md`.
> 3. Enviar este arquivo de prompt consolidado de uma só vez para o **Google Stitch MCP** detalhando as duas (ou mais) páginas em conjunto para geração das variáveis.
> Nunca fracione a chamada do MCP enviando prompts separados por página, a fim de garantir consistência absoluta das variáveis de estilo e integridade do design.

---

## 1.2 INCORPORAÇÃO OBRIGATÓRIA DE SKILLS AUXILIARES NO PROMPT DO STITCH
> [!IMPORTANT]
> **Injeção de Diretrizes no Prompt Único**: Dado que o **Google Stitch MCP** é o motor responsible por criar o layout e os tokens de UI, as diretrizes das skills locais **DEVEM ser incorporadas textualmente** no corpo do prompt consolidado (`.harness/ui-specs/[nome_da_feature]_mcp_prompt.md`):
> 1. **Injetar `web-design-guidelines`**: Leia e anexe as diretrizes de design premium (paleta HSL, contrastes adequados, dark mode e micro-animações) como regras e instruções para o Google Stitch MCP. Isso garante que o layout gerado atinja a fidelidade e estética rica planejadas.
> 2. **Injetar `impeccable`**: Leia e anexe as regras de qualidade estrutural e formatação impecável de documentos para que o Google Stitch MCP retorne a especificação de UI limpa, livre de placeholders e com diagramas ASCII perfeitos.

---

## 1.3 FERRAMENTAS DISPONÍVEIS DO STITCH MCP (AVAILABLE TOOLS)
O assistente de IA possui acesso às seguintes ferramentas do Stitch MCP para gerenciar o fluxo de design:

### A. Gerenciamento de Projetos (Project Management)
* `create_project`: Cria um novo container de projeto para os designs de interface.
  - Parâmetros: `title` (string, obrigatório) - O nome de exibição do projeto.
* `get_project`: Obtém informações detalhadas de um projeto específico.
  - Parâmetros: `name` (string, obrigatório) - O nome do recurso do projeto.
* `list_projects`: Retorna uma lista de todos os projetos ativos.
  - Parâmetros: `filter` (string, opcional) - Filtra os projetos (proprietário ou compartilhados).

### B. Gerenciamento de Telas (Screen Management)
* `list_screens`: Obtém todas as telas pertencentes a um projeto.
  - Parâmetros: `projectId` (string, obrigatório) - O ID do projeto a ser inspecionado.
* `get_screen`: Retorna informações detalhadas de uma única tela.
  - Parâmetros: `name` (string, obrigatório) - O nome do recurso da tela.

### C. Geração de Telas com IA (AI Generation)
* `generate_screen_from_text`: Cria um novo design/tela a partir de um prompt em texto.
  - Parâmetros:
    - `projectId` (string, obrigatório) - O ID do projeto.
    - `prompt` (string, obrigatório) - Instruções em texto detalhando a tela a ser gerada.
    - `modelId` (string, opcional) - O modelo de IA (`GEMINI_3_FLASH` ou `GEMINI_3_1_PRO`).
* `edit_screens`: Edita uma ou mais telas existentes usando instruções textuais.
  - Parâmetros:
    - `projectId` (string, obrigatório) - O ID do projeto.
    - `selectedScreenIds` (array de strings, obrigatório) - Os IDs das telas a editar.
    - `prompt` (string, obrigatório) - Instrução textual de edição.
* `generate_variants`: Cria variações visuais de telas existentes.
  - Parâmetros:
    - `projectId` (string, obrigatório) - O ID do projeto.
    - `selectedScreenIds` (array de strings, obrigatório) - Os IDs das telas a variar.
    - `prompt` (string, obrigatório) - Instruções guiando a geração das variantes.
    - `variantOptions` (object, opcional) - Opções como quantidade, fator de criatividade, etc.

### D. Sistemas de Design (Design Systems)
* `create_design_system`: Cria um novo design system com tokens fundamentais.
  - Parâmetros:
    - `designSystem` (object, obrigatório) - Configurações do design system (nome, tema).
    - `projectId` (string, opcional) - Projeto a ser associado.
* `update_design_system`: Updates an existing design system.
  - Parâmetros:
    - `name` (string, obrigatório) - Nome do recurso do design system.
    - `projectId` (string, obrigatório) - ID do projeto.
    - `designSystem` (object, obrigatório) - Conteúdo atualizado.
* `list_design_systems`: Lista todos os design systems de um projeto.
  - Parâmetros: `projectId` (string, opcional) - ID do projeto.
* `apply_design_system`: Aplica um design system a uma ou mais telas.
  - Parâmetros:
    - `projectId` (string, obrigatório) - ID do projeto.
    - `selectedScreenInstances` (array, obrigatório) - Telas a atualizar (retornadas em `get_project`).
    - `assetId` (string, obrigatório) - ID do design system.

---

## 1.4 PLANO DE UTILIZAÇÃO E EXECUÇÃO ASSÍNCRONA
Para garantir a maior fidelidade na geração de UI e evitar perda de contexto pelo Stitch, o agente deve seguir rigorosamente as diretivas abaixo:

1. **Planejamento Detalhado Prévio (Contexto Abundante):**
   - O Stitch processa e otimiza a geração pensando em padrões de **HTML, JavaScript e Tailwind CSS**.
   - Forneça descrições extremamente detalhadas das páginas, especificando a hierarquia estrutural e wireframes em ASCII estruturados. Quanto mais preciso for o mapeamento, melhor o resultado.
2. **Estratégia de Envio de Prompts (Consolidado vs. Granular):**
   - **Tentativa 1 (Lote Consolidado):** Se houver múltiplas telas, tente sempre estruturar e enviar todas juntas em um único prompt consolidado. Isso garante consistência máxima de design system entre as telas.
   - **Tentativa 2 (Página por Página - Fallback):** Caso o envio em lote falhe, apresente timeouts ou retorne resultados insatisfatórios, divida a geração enviando **página por página** sequencialmente.
3. **Injeção Moderada de Código e Diretrizes:**
   - É permitido injetar pequenos trechos de código reais e guidelines estéticos (como as regras do Impeccable) no prompt do Stitch para guiar a estrutura visual.
   - **Atenção:** Mantenha os trechos de código curtos e diretos para não sobrecarregar ou confundir a IA do Stitch.
4. **Execução Assíncrona Não-Bloqueante:**
   - O processamento de geração do Stitch MCP é pesado e pode demorar de segundos a alguns minutos.
   - **Nunca** faça loops de polling ou aguarde a resposta ativamente. Inicie a tarefa em background e libere a execução para outras atividades ou encerre a chamada. O sistema utilizará o mecanismo reativo de notificação automática assim que o Stitch concluir a requisição.

---

## 2. ANÁLISE DE CENÁRIOS: NOVO PROJETO VS. EVOLUÇÃO
Antes de gerar o output, identifique em qual cenário a tarefa se enquadra:

### CENÁRIO A: Novo Projeto / Nova Página
- Crie a arquitetura visual do zero seguindo o template de entrega `templates/UI-SPEC-TEMPLATE.md`.
- Defina os tokens base que serão consumidos pelo Stitch MCP.
- Pergunte ao usuário se ele tem layouts pré-definidos (imagens/mockups/Figma). Se sim, solicite que ele salve as imagens em `.harness/design/assets/` e use-as como referência. Caso contrário, use as ferramentas de design do Stitch MCP para propor o visual do zero.

### CENÁRIO B: Adequação / Melhoria / Adição de Páginas
- Você deve LER obrigatoriamente o histórico de prompts e as especificações já enviadas no contexto localizadas no diretório `.harness/ui-specs/`.
- Extraia os pontos críticos, os Design Tokens existentes e os conceitos visuais já estabelecidos.
- Crie o prompt/spec da nova página garantindo simetria arquitetural, estendendo os tokens atuais sem sobrescrever variáveis globais de forma destrutiva.

---

## 3. DIRETRIZES DE DESIGN E CONCEITOS IMUTÁVEIS
Você deve proteger a consistência da marca e do ecossistema de design. São considerados **IMUTÁVEIS** e não podem ser alterados, a menos que o usuário dê uma ordem direta e explícita:
1. **Logo da Aplicação:** Mantém-se na mesma posição anatômica (ex: Top-Left do Header ou Sidebar), proporção e comportamento de clique.
2. **Layout Geral (Shell/Skel):** O grid principal (ex: Sidebar fixa + Topbar de ações + Viewport de conteúdo com scroll independente) deve ser herdado em todas as novas páginas.
3. **Biblioteca de Ícones:** Mantenha a mesma família de ícones já definida no projeto (ex: Lucide React, Phosphor Icons). Nunca misture styles.

---

## 4. ESTRUTURA OBRIGATÓRIA DA ESPECIFICAÇÃO DE FRONTEND
Toda saída aprovada para o frontend deve ser estruturada exatamente conforme o template e salva no diretório `.harness/ui-specs/` com o nome `[nome-da-feature].md`.

### 4.1 GOOGLE STITCH MCP - DESIGN TOKENS VARIABLES
Gere o bloco de variáveis exato para injeção no Stitch MCP, mapeando todas as propriedades visuais:
```json
{
  "theme": {
    "colors": {
      "brand": { "primary": "#HEX", "secondary": "#HEX" },
      "feedback": { "success": "#HEX", "error": "#HEX", "warning": "#HEX", "info": "#HEX" },
      "neutral": { "background": "#HEX", "surface": "#HEX", "text": "#HEX", "border": "#HEX" }
    },
    "spacing": { "xs": "4px", "sm": "8px", "md": "16px", "lg": "24px", "xl": "32px" },
    "radii": { "sm": "4px", "md": "8px", "lg": "12px", "full": "9999px" },
    "shadows": { "sm": "0 1px 2px rgba(0,0,0,0.05)", "md": "0 4px 6px rgba(0,0,0,0.1)" }
  }
}
```

### 4.2 COMPORTAMENTO DO LAYOUT E RESPONSIVIDADE
* **Desktop Grid:** [Ex: 12 colunas, gaps de 24px, container máximo de 1440px]
* **Mobile Grid:** [Ex: 4 colunas, gaps de 16px, menu colapsado em hambúrguer ou bottom navigation]

### 4.3 REPRESENTAÇÃO DE WIREFRAME (MOCK TEXTUAL)
Desenhe o layout da página usando blocos textuais e ASCII estruturados para guiar o entendimento imediato da distribuição espacial.
*Exemplo:*
```text
+-----------------------------------------------------------------------+
|  [LOGO]  | Pesquisar...                      |  (Notificação) [Avatar] | -> Header (Fixo)
+-----------------------------------------------------------------------+
| (i) Home |  **Título da Página**              [Botão Ação Primária]  |
| (x) Perf |  --------------------------------------------------------  |
|          |  +-----------------------+   +---------------------------+ |
|          |  | [Componente: Filtros] |   | [Componente: Gráfico]     | |
|          |  +-----------------------+   +---------------------------+ |
|          |  | [Tabela de Dados     ] |                               | |
+----------+------------------------------------------------------------+
```

### 4.4 ARQUITETURA DE COMPONENTES DA PÁGINA
Mapeie a árvore de componentes da tela dividindo-os de forma granular:
* **Componentes Globais (Reutilizados):** `Button`, `InputText`, `Card`.
* **Componentes de Contexto (Locais da Página):** `FeatureTable`, `FilterBar`.

### 4.5 MATRIZ DE ESTADOS DA UI (ESTADOS CRÍTICOS)
Especifique o que o usuário vê em cada momento da requisição dos dados:
* **Ideal State:** [Descrição da tela populada]
* **Loading State:** [Indique onde os Skeletons animadas do Stitch MCP serão aplicados]
* **Empty State:** [Mensagem e comportamento se a resposta for um array vazio `[]`]
* **Error State:** [Tratamento visual e botão de retry para falhas de API `4xx/5xx`]

---

## 5. EXECUÇÃO E PERSISTÊNCIA
Após estruturar o documento acima e receber a aprovação do usuário, salve o resultado no arquivo físico dentro de `.harness/ui-specs/[nome_da_feature].md` usando as ferramentas de escrita do sistema.
