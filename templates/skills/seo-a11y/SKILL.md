---
name: seo-a11y
description: Melhores práticas de SEO Técnico, HTML5 Semântico, Core Web Vitals e Acessibilidade Web (WCAG AA) para agentes de Design e Frontend.
---

# Skill: Melhores Práticas de SEO & Acessibilidade (a11y)

Esta skill estabelece os padrões obrigatórios para qualquer interface web projetada pelo `designer` ou implementada pelo `frontend`.

## 1. SEO Técnico e Semântica HTML5
1. **Estrutura Semântica Obrigatória:**
   - Utilize marcos semânticos nativos: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<aside>` e `<footer>`. Evite "div soup" (`<div>` genérica para elementos estruturais).
2. **Hierarquia Rigorosa de Headings:**
   - Toda página deve possuir exatamente **um `<h1>`** descrevendo o tema principal da página.
   - Subseções devem seguir ordem lógica (`<h2>` $\rightarrow$ `<h3>`) sem saltar níveis apenas por estética visual.
3. **Metadados e Indexabilidade:**
   - Páginas roteáveis devem configurar `<title>` descritivo e único (50–60 caracteres) e `<meta name="description">` persuasiva (120–160 caracteres).
   - Configure tags Open Graph (`og:title`, `og:description`, `og:type`, `og:image`) e `rel="canonical"` em páginas públicas.
   - Utilize links reais `<a href="...">` para navegação entre rotas (permitindo rastreamento por crawlers) em vez de `<div onClick>` ou `<button>` para mudança de URL.
4. **Otimização de Imagens e Mídia:**
   - Toda tag `<img>` deve conter atributo `alt` descritivo (ou `alt=""` se puramente decorativa), além de dimensões explícitas (`width` e `height`) para evitar *Cumulative Layout Shift* (CLS).
   - Utilize `loading="lazy"` para imagens abaixo da dobra e priorize o carregamento da imagem principal (LCP).

## 2. Acessibilidade Web (WCAG 2.1 AA)
1. **Formulários Acessíveis:**
   - Todo `<input>`, `<select>` ou `<textarea>` deve estar associado a um `<label htmlFor="...">` visível ou `aria-label` claro.
   - Mensagens de erro de validação devem ser vinculadas ao campo via `aria-invalid="true"` e `aria-describedby`, usando `role="alert"` ou `aria-live="polite"`.
2. **Navegação por Teclado e Foco:**
   - Todos os elementos interativos devem ser alcançáveis via `Tab` e acionáveis via `Enter`/`Space`.
   - Nunca remova o indicador de foco (`outline: none`) sem fornecer um estilo `:focus-visible` nítido.
3. **Estados Dinâmicos:**
   - Botões em carregamento devem refletir `disabled` ou `aria-busy="true"` para evitar submissões duplicadas.
