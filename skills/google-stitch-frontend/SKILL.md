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
> **Injeção de Diretrizes no Prompt Único**: Dado que o **Google Stitch MCP** é o motor responsável por criar o layout e os tokens de UI, as diretrizes das skills locais **DEVEM ser incorporadas textualmente** no corpo do prompt consolidado (`.harness/ui-specs/[nome_da_feature]_mcp_prompt.md`):
> 1. **Injetar `web-design-guidelines`**: Leia e anexe as diretrizes de design premium (paleta HSL, contrastes adequados, dark mode e micro-animações) como regras e instruções para o Google Stitch MCP. Isso garante que o layout gerado atinja a fidelidade e estética rica planejadas.
> 2. **Injetar `impeccable`**: Leia e anexe as regras de qualidade estrutural e formatação impecável de documentos para que o Google Stitch MCP retorne a especificação de UI limpa, livre de placeholders e com diagramas ASCII perfeitos.

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
