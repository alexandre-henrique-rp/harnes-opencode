# UI SPEC — {{feature}}

```json
{
  "_type": "harness-ui-spec-v6",
  "id": "ui-spec-{{feature}}",
  "status": "draft",
  "project": "{{project}}",
  "createdAt": "{{createdAt}}"
}
```

---

## 4.1 GOOGLE STITCH MCP - DESIGN TOKENS VARIABLES
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

---

## 4.2 COMPORTAMENTO DO LAYOUT E RESPONSIVIDADE

* **Desktop Grid:** [Ex: 12 colunas, gaps de 24px, container máximo de 1440px]
* **Mobile Grid:** [Ex: 4 colunas, gaps de 16px, menu colapsado em hambúrguer ou bottom navigation]

---

## 4.3 REPRESENTAÇÃO DE WIREFRAME (MOCK TEXTUAL)

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

---

## 4.4 ARQUITETURA DE COMPONENTES DA PÁGINA

Mapeie a árvore de componentes da tela dividindo-os de forma granular:

* **Componentes Globais (Reutilizados):** `Button`, `InputText`, `Card`.
* **Componentes de Contexto (Locais da Página):** `FeatureTable`, `FilterBar`.

---

## 4.5 MATRIZ DE ESTADOS DA UI (ESTADOS CRÍTICOS)

Especifique o que o usuário vê em cada momento da requisição dos dados:

* **Ideal State:** [Descrição da tela populada]
* **Loading State:** [Indique onde os Skeletons animadas do Stitch MCP serão aplicados]
* **Empty State:** [Mensagem e comportamento se a resposta for um array vazio `[]`]
* **Error State:** [Tratamento visual e botão de retry para falhas de API `4xx/5xx`]

