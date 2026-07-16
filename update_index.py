import re

with open('docs/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Hero
content = content.replace(
    '<h1 data-i18n="hero_title">Desenvolvimento Multi-Agente de Alta Fidelidade</h1>',
    '<h1 data-i18n="hero_title">A Primeira Equipe de Engenharia Autônoma na sua Máquina</h1>'
)
content = content.replace(
    '<p class="hero-subtitle" data-i18n="hero_desc">O harness estruturado para o OpenCode. 20 agentes especializados coordenados sob 6 fases rigidas baseadas em TDD, sandbox ai-jail e auditoria total.</p>',
    '<p class="hero-subtitle" data-i18n="hero_desc">Escale seu desenvolvimento em 10x. 20 agentes especialistas criando software do zero, com garantia de TDD, Design impecável e blindagem contra vazamento de dados.</p>\n      <div class="hero-cta" style="margin-bottom: 3rem;"><a href="#" class="btn-primary" onclick="document.querySelector(\'.terminal\').scrollIntoView({behavior: \'smooth\'}); return false;" data-i18n="hero_cta">Instale Agora - É Grátis</a></div>'
)

# 2. Add CSS
css_to_add = """
    /* ─── Commercial Enhancements ─── */
    .btn-primary {
      display: inline-block;
      background: linear-gradient(135deg, var(--primary), #e8d5b7);
      color: var(--bg);
      font-weight: 700;
      font-size: 1.1rem;
      padding: 1rem 2.5rem;
      border-radius: 50px;
      text-decoration: none;
      box-shadow: 0 10px 30px rgba(200, 168, 130, 0.3);
      transition: all 0.3s ease;
      font-family: 'Outfit', sans-serif;
    }
    .btn-primary:hover {
      transform: translateY(-3px);
      box-shadow: 0 15px 40px rgba(200, 168, 130, 0.5);
    }
    .ecosystem-strip {
      padding: 3rem 0;
      background: rgba(10, 10, 11, 0.5);
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: center;
      gap: 3rem;
      flex-wrap: wrap;
      opacity: 0.7;
    }
    .ecosystem-strip span {
      font-family: 'Outfit', sans-serif;
      font-weight: 600;
      font-size: 1.1rem;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .ecosystem-strip span svg { width: 24px; height: 24px; fill: currentColor; }
    
    .comparison-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
    }
    .comp-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 2.5rem;
      position: relative;
    }
    .comp-card.bad { border-top: 4px solid #ef4444; }
    .comp-card.good { border-top: 4px solid var(--success); background: linear-gradient(180deg, rgba(52, 211, 153, 0.05) 0%, var(--bg-card) 100%); }
    .comp-card h3 { font-family: 'Outfit', sans-serif; font-size: 1.5rem; margin-bottom: 1.5rem; }
    .comp-list { list-style: none; padding: 0; margin: 0; }
    .comp-list li { margin-bottom: 1rem; display: flex; align-items: flex-start; gap: 0.75rem; color: var(--text-secondary); }
    .comp-list li::before { content: '✖'; color: #ef4444; font-weight: bold; }
    .comp-card.good .comp-list li::before { content: '✔'; color: var(--success); }
    .comp-card.good .comp-list li { color: var(--text); }
    
    .team-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
    }
    .team-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.5rem;
      text-align: center;
      transition: all 0.3s ease;
    }
    .team-card:hover { border-color: var(--primary); transform: translateY(-5px); box-shadow: 0 10px 30px rgba(200, 168, 130, 0.1); }
    .team-icon { font-size: 2.5rem; margin-bottom: 1rem; }
    .team-card h4 { font-family: 'Outfit', sans-serif; font-size: 1.2rem; color: var(--text); margin-bottom: 0.5rem; }
    .team-card p { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; }

    @media (max-width: 768px) {
      .comparison-grid { grid-template-columns: 1fr; }
    }
"""
content = content.replace('</style>', css_to_add + '\n  </style>')

# 3. Add Ecosystem Strip and Sections
ecosystem_html = """
  <!-- Ecosystem -->
  <div class="ecosystem-strip">
    <span>Nativamente integrado com:</span>
    <span><svg viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg> GitHub</span>
    <span><svg viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12c0 5.522 4.477 10 10 10 5.522 0 10-4.478 10-10 0-5.523-4.478-10-10-10zm-1.8 14.5v-9h1.5v7.5h3.5v1.5h-5z"/></svg> OpenCode</span>
    <span><svg viewBox="0 0 24 24"><path d="M1.996 16.037L12 21.815l10.004-5.778V4.481L12-1.296 1.996 4.481v11.556zM12 1.018l8.006 4.622v9.243L12 19.505l-8.006-4.622V5.64L12 1.018zM12 17.15l6.002-3.466V6.757L12 3.291l-6.002 3.466v6.927L12 17.15zm0-11.545l4 2.31v4.62l-4 2.31-4-2.31v-4.62l4-2.31z"/></svg> TypeScript</span>
  </div>
"""
content = content.replace('  <div class="divider"></div>\n\n  <!-- Pillars -->', ecosystem_html + '\n  <div class="divider"></div>\n\n  <!-- Pillars -->')

comparison_and_team_html = """
  <!-- Comparison -->
  <section>
    <div class="container">
      <div class="section-header">
        <span class="section-label" data-i18n="comp_label">Por que mudar?</span>
        <h2 class="section-title" data-i18n="comp_title">Engenharia Tradicional vs OpenCode Harness</h2>
      </div>
      <div class="comparison-grid">
        <div class="comp-card bad">
          <h3 data-i18n="comp_bad_title">Sem Harness</h3>
          <ul class="comp-list">
            <li data-i18n="comp_bad_1">Backlog infinito e meses para entregar MVPs</li>
            <li data-i18n="comp_bad_2">"Depois eu faço os testes" (Débito Técnico)</li>
            <li data-i18n="comp_bad_3">Vulnerabilidades e falhas de LGPD em Produção</li>
            <li data-i18n="comp_bad_4">Equipes sobrecarregadas com trabalho braçal</li>
          </ul>
        </div>
        <div class="comp-card good">
          <h3 data-i18n="comp_good_title">Com OpenCode Harness</h3>
          <ul class="comp-list">
            <li data-i18n="comp_good_1">Software em Produção em poucos dias</li>
            <li data-i18n="comp_good_2">TDD Obrigatório (Nenhum código sem teste)</li>
            <li data-i18n="comp_good_3">Auditoria Jurídica Automática (DPO Agent)</li>
            <li data-i18n="comp_good_4">Devs focam na estratégia, Agentes codificam</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <div class="divider"></div>

  <!-- Use Cases -->
  <section>
    <div class="container">
      <div class="section-header">
        <span class="section-label" data-i18n="usecases_label">Aplicações</span>
        <h2 class="section-title" data-i18n="usecases_title">Para quem é o OpenCode Harness?</h2>
      </div>
      <div class="pillars-grid">
        <div class="pillar-card">
          <div class="pillar-icon">🚀</div>
          <h3 data-i18n="uc1_title">Startups & MVPs</h3>
          <p data-i18n="uc1_desc">Lançamento extremamente rápido. Da ideia ao código pronto em dias. Nossos agentes geram especificações (PRD) rigorosas e executam a arquitetura completa.</p>
        </div>
        <div class="pillar-card">
          <div class="pillar-icon">🏦</div>
          <h3 data-i18n="uc2_title">Enterprise & Bancos</h3>
          <p data-i18n="uc2_desc">Segurança Nível Kernel. O Sandbox ai-jail embutido e o agente DPO realizam varredura LGPD em cada linha de código, garantindo compliance absoluto.</p>
        </div>
        <div class="pillar-card">
          <div class="pillar-icon">⚡</div>
          <h3 data-i18n="uc3_title">Dev Shops & Consultorias</h3>
          <p data-i18n="uc3_desc">Qualidade sem refação. Código blindado por testes TDD obrigatórios e revisão humana apenas nos 'Gates' críticos. Escale suas entregas sem inchar a equipe.</p>
        </div>
      </div>
    </div>
  </section>

  <div class="divider"></div>

  <!-- The Team -->
  <section>
    <div class="container">
      <div class="section-header">
        <span class="section-label" data-i18n="team_label">O Produto</span>
        <h2 class="section-title" data-i18n="team_title">Conheça Seus Novos Funcionários</h2>
        <p class="section-desc" data-i18n="team_desc">Você não está instalando apenas um script. Está contratando 20 especialistas autônomos.</p>
      </div>
      <div class="team-grid">
        <div class="team-card">
          <div class="team-icon">🎼</div>
          <h4 data-i18n="team1_title">Agente Orchestrator</h4>
          <p data-i18n="team1_desc">Seu Tech Lead. Coordena os outros 19 agentes, garante o escopo e não deixa ninguém pular os testes.</p>
        </div>
        <div class="team-card">
          <div class="team-icon">⚖️</div>
          <h4 data-i18n="team2_title">Agente DPO</h4>
          <p data-i18n="team2_desc">Sua Advogada Digital. Inspeciona o schema do banco e a arquitetura para evitar vazamento de dados (LGPD).</p>
        </div>
        <div class="team-card">
          <div class="team-icon">🎨</div>
          <h4 data-i18n="team3_title">Agente Designer</h4>
          <p data-i18n="team3_desc">Seu UI/UX Senior. Projeta layouts lindos e componentiza o Frontend antes dos desenvolvedores tocarem no código.</p>
        </div>
        <div class="team-card">
          <div class="team-icon">🧪</div>
          <h4 data-i18n="team4_title">Agente Tester & QA</h4>
          <p data-i18n="team4_desc">A Barreira de Qualidade. Escrevem e validam testes de unidade e integração. Nada passa quebrado.</p>
        </div>
      </div>
    </div>
  </section>

  <div class="divider"></div>
"""

content = content.replace('  <!-- AI-Jail -->', comparison_and_team_html + '\n  <!-- AI-Jail -->')

# 4. Translations Updates (Portuguese)
translations_pt_inject = """
        hero_cta: "Instale Agora - É Grátis",
        comp_label: "Por que mudar?",
        comp_title: "Engenharia Tradicional vs OpenCode Harness",
        comp_bad_title: "Sem Harness",
        comp_bad_1: "Backlog infinito e meses para entregar MVPs",
        comp_bad_2: '"Depois eu faço os testes" (Débito Técnico)',
        comp_bad_3: "Vulnerabilidades e falhas de LGPD em Produção",
        comp_bad_4: "Equipes sobrecarregadas com trabalho braçal",
        comp_good_title: "Com OpenCode Harness",
        comp_good_1: "Software em Produção em poucos dias",
        comp_good_2: "TDD Obrigatório (Nenhum código sem teste)",
        comp_good_3: "Auditoria Jurídica Automática (DPO Agent)",
        comp_good_4: "Devs focam na estratégia, Agentes codificam",
        usecases_label: "Aplicações",
        usecases_title: "Para quem é o OpenCode Harness?",
        uc1_title: "Startups & MVPs",
        uc1_desc: "Lançamento extremamente rápido. Da ideia ao código pronto em dias. Nossos agentes geram especificações (PRD) rigorosas e executam a arquitetura completa.",
        uc2_title: "Enterprise & Bancos",
        uc2_desc: "Segurança Nível Kernel. O Sandbox ai-jail embutido e o agente DPO realizam varredura LGPD em cada linha de código, garantindo compliance absoluto.",
        uc3_title: "Dev Shops & Consultorias",
        uc3_desc: "Qualidade sem refação. Código blindado por testes TDD obrigatórios e revisão humana apenas nos 'Gates' críticos. Escale suas entregas sem inchar a equipe.",
        team_label: "O Produto",
        team_title: "Conheça Seus Novos Funcionários",
        team_desc: "Você não está instalando apenas um script. Está contratando 20 especialistas autônomos.",
        team1_title: "Agente Orchestrator",
        team1_desc: "Seu Tech Lead. Coordena os outros 19 agentes, garante o escopo e não deixa ninguém pular os testes.",
        team2_title: "Agente DPO",
        team2_desc: "Sua Advogada Digital. Inspeciona o schema do banco e a arquitetura para evitar vazamento de dados (LGPD).",
        team3_title: "Agente Designer",
        team3_desc: "Seu UI/UX Senior. Projeta layouts lindos e componentiza o Frontend antes dos desenvolvedores tocarem no código.",
        team4_title: "Agente Tester & QA",
        team4_desc: "A Barreira de Qualidade. Escrevem e validam testes de unidade e integração. Nada passa quebrado.",
"""

# 5. Translations Updates (English)
translations_en_inject = """
        hero_cta: "Install Now - It's Free",
        comp_label: "Why Switch?",
        comp_title: "Traditional Engineering vs OpenCode Harness",
        comp_bad_title: "Without Harness",
        comp_bad_1: "Endless backlog and months to deliver MVPs",
        comp_bad_2: '"I will write tests later" (Technical Debt)',
        comp_bad_3: "Vulnerabilities and privacy flaws in Production",
        comp_bad_4: "Teams overloaded with manual labor",
        comp_good_title: "With OpenCode Harness",
        comp_good_1: "Software in Production in days",
        comp_good_2: "Mandatory TDD (No untested code)",
        comp_good_3: "Automatic Legal Audit (DPO Agent)",
        comp_good_4: "Devs focus on strategy, Agents code",
        usecases_label: "Applications",
        usecases_title: "Who is OpenCode Harness for?",
        uc1_title: "Startups & MVPs",
        uc1_desc: "Extremely fast launches. From idea to code in days. Our agents generate rigorous specs (PRD) and execute the full architecture.",
        uc2_title: "Enterprise & Banks",
        uc2_desc: "Kernel-Level Security. Built-in ai-jail Sandbox and DPO agent scan every line of code for privacy compliance.",
        uc3_title: "Dev Shops & Consultancies",
        uc3_desc: "Quality without rework. Code protected by mandatory TDD tests and human review only at critical 'Gates'. Scale without bloating your team.",
        team_label: "The Product",
        team_title: "Meet Your New Employees",
        team_desc: "You are not just installing a script. You are hiring 20 autonomous experts.",
        team1_title: "Orchestrator Agent",
        team1_desc: "Your Tech Lead. Coordinates the other 19 agents, ensures scope, and strictly enforces testing.",
        team2_title: "DPO Agent",
        team2_desc: "Your Digital Lawyer. Inspects the DB schema and architecture to prevent data leaks (GDPR/LGPD).",
        team3_title: "Designer Agent",
        team3_desc: "Your UI/UX Senior. Designs beautiful layouts and components before devs touch the code.",
        team4_title: "Tester & QA Agent",
        team4_desc: "The Quality Gate. They write and validate unit/integration tests. Nothing broken passes.",
"""

content = content.replace('update_link: "Baixar agora",', 'update_link: "Baixar agora",\n' + translations_pt_inject)
content = content.replace('update_link: "Download now",', 'update_link: "Download now",\n' + translations_en_inject)

with open('docs/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
