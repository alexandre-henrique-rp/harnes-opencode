# Brief — sample-web-app

> Exemplo end-to-end do Harness v6. Demonstra como um projeto real passa pelas 6 fases. **Este brief é fictício e serve apenas como referência.**

## Problema

Pequenos comércios brasileiros perdem clientes porque o cadastro na plataforma é lento (5+ minutos), exige dados demais, e não valida o endereço automaticamente. Precisam de um sistema de cadastro de cliente em < 60 segundos, com validação automática de CEP via ViaCEP.

## Usuários primários

- **P-001 Dona Maria (lojista):** administra cadastro de clientes. Tem 50-200 clientes/mês. Não é técnica. Usa no balcão da loja enquanto o cliente está na frente.
- **P-002 Cliente final:** quer se cadastrar rápido pra usar a plataforma. Mobile-first. Não quer digitar endereço inteiro.

## Restrições

- **Stack:** Next.js 14 (frontend) + Node.js + Postgres (backend)
- **Prazo:** MVP em 6 semanas
- **Compliance:** LGPD obrigatória (coletamos CPF, nome, endereço)
- **Orçamento:** infra < $50/mês (Vercel + Supabase free tier)
- **Integrações:** ViaCEP (gratuita, pública)

## Critério de sucesso

- Tempo médio de cadastro **< 60 segundos** (medido de "abrir página" até "cliente criado")
- Taxa de conclusão **> 80%** dos que iniciam o cadastro
- **0 erros de validação de CPF** reportados por clientes

## Não-objetivos

- Não vamos fazer login social (Google, Facebook) na v1
- Não vamos fazer pagamento nesta sprint
- Não vamos mobile app nativo (apenas web responsiva)
