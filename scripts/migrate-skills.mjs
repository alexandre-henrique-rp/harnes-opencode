#!/usr/bin/env node
/**
 * migrate-skills.mjs
 * 
 * Reorganiza o diretório skills/ por setores:
 *   skills/frontend/    → React, TanStack, Tailwind, Shadcn, Storybook, Remotion, etc.
 *   skills/backend/     → Node, NestJS, Go, Laravel, Rust, Drizzle, Sentry, etc.
 *   skills/design/      → Stitch, UI Craft, Design MD, Impeccable, etc.
 *   skills/harness/     → Skills meta do harness (agentes, QA, review, etc.)
 *   skills/geral/       → Git, Shell, Tooling, Docs, TypeScript, Context, etc.
 *   skills/seguranca/   → Segurança, pentest, reverse-shell
 *   skills/pessoal/     → Skills fora de escopo (a mover para repo pessoal)
 * 
 * Atualiza skills-lock.json com os novos paths.
 * Gera docs/SKILLS_INDEX.md com o índice por setor.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── MAPEAMENTO: skill → setor ───────────────────────────────────────────────

const SECTOR_MAP = {
  // FRONTEND
  "react":                        "frontend",
  "react-router-v7":              "frontend",
  "react-router-v7-expert":       "frontend",
  "tanstack":                     "frontend",
  "tanstack-config":              "frontend",
  "tanstack-form":                "frontend",
  "tanstack-query":               "frontend",
  "tanstack-query-best-practices":"frontend",
  "tanstack-router":              "frontend",
  "tanstack-router-best-practices":"frontend",
  "tanstack-start":               "frontend",
  "tailwindcss":                  "frontend",
  "shadcn-ui":                    "frontend",
  "storybook-stories":            "frontend",
  "remotion":                     "frontend",
  "app-renderer-systems":         "frontend",
  "typescript-advanced":          "frontend",

  // BACKEND
  "nestjs-best-practices":        "backend",
  "nestjs-expert":                "backend",
  "nestjs-patterns":              "backend",
  "laravel-patterns":             "backend",
  "laravel-plugin-discovery":     "backend",
  "laravel-security":             "backend",
  "laravel-specialist":           "backend",
  "laravel-tdd":                  "backend",
  "laravel-verification":         "backend",
  "golang-code-style":            "backend",
  "golang-design-patterns":       "backend",
  "golang-documentation":         "backend",
  "golang-performance":           "backend",
  "golang-security":              "backend",
  "golang-testing":               "backend",
  "rust-best-practices":          "backend",
  "drizzle-safe-migrations":      "backend",
  "bubbletea":                    "backend",
  "sentry-create-alert":          "backend",
  "sentry-debug-issue":           "backend",
  "sentry-feature-setup":         "backend",
  "sentry-get-started":           "backend",
  "sentry-instrument":            "backend",
  "sentry-otel-exporter-setup":   "backend",
  "sentry-pr-code-review":        "backend",
  "sentry-sdk-upgrade":           "backend",
  "sentry-setup-ai-monitoring":   "backend",
  "sentry-snapshots-cocoa":       "backend",
  "sentry-workflow":              "backend",

  // DESIGN
  "stitch-code-to-design":        "design",
  "stitch-extract-design-md":     "design",
  "stitch-extract-static-html":   "design",
  "stitch-generate-design":       "design",
  "stitch-loop":                  "design",
  "stitch-manage-design-system":  "design",
  "stitch-react-components":      "design",
  "stitch-react-native":          "design",
  "stitch-upload-to-stitch":      "design",
  "google-stitch-frontend":       "design",
  "design-md":                    "design",
  "taste-design":                 "design",
  "impeccable":                   "design",
  "ui-craft":                     "design",
  "web-design-guidelines":        "design",
  "tech-logos":                   "design",
  "enhance-prompt":               "design",

  // HARNESS (meta-harness: agentes, QA, review)
  "qa-execution":                 "harness",
  "qa-report":                    "harness",
  "impl-peer-review":             "harness",
  "spec-peer-review":             "harness",
  "deep-review":                  "harness",
  "refactoring-analysis":         "harness",
  "agent-browser":                "harness",
  "agent-exploration":            "harness",
  "agent-output-audit":           "harness",
  "herdr-orchestration":          "harness",
  "writing-agents-md":            "harness",
  "skill-creator":                "harness",
  "architectural-analysis":       "harness",
  "deslop":                       "harness",
  "no-workarounds":               "harness",
  "testing-boss":                 "harness",
  "grill-me":                     "harness",
  "grill-with-docs":              "harness",

  // GERAL (tooling, docs, git, contexto)
  "git-rebase":                   "geral",
  "ship-pr":                      "geral",
  "shell":                        "geral",
  "shellcheck-configuration":     "geral",
  "context7-mcp":                 "geral",
  "find-docs":                    "geral",
  "to-prompt":                    "geral",
  "writing-skills":               "geral",
  "writing-tech-post":            "geral",

  // SEGURANÇA
  "reverse-shell-techniques":     "seguranca",

  // PESSOAL (fora de escopo — mover para repo separado)
  "yc-apply":                     "pessoal",
  "kb-yt-channel":                "pessoal",
  "insta-master":                 "pessoal",
  "yt-master":                    "pessoal",
  "tweetsmash-api":               "pessoal",
};

// Setores com descrições
const SECTOR_INFO = {
  frontend:  { emoji: "🎨", label: "Frontend", desc: "React, TanStack, Tailwind, Storybook, TypeScript" },
  backend:   { emoji: "⚙️",  label: "Backend",  desc: "NestJS, Laravel, Go, Rust, Drizzle, Sentry" },
  design:    { emoji: "✏️",  label: "Design",   desc: "Google Stitch, UI Craft, Design System, Assets" },
  harness:   { emoji: "🤖", label: "Harness",  desc: "Meta-harness: agentes, QA, revisão de código, análise" },
  geral:     { emoji: "🔧", label: "Geral",    desc: "Git, Shell, Contexto, Documentação, Tooling" },
  seguranca: { emoji: "🔐", label: "Segurança","desc": "Pentest, auditoria de segurança, técnicas ofensivas" },
  pessoal:   { emoji: "📁", label: "Pessoal",  desc: "Skills pessoais do autor — fora do escopo do harness" },
};

// ─── FUNÇÕES ─────────────────────────────────────────────────────────────────

function moveSkill(skillName, fromDir, toSectorDir) {
  const src = path.join(fromDir, skillName);
  const dst = path.join(toSectorDir, skillName);

  if (!fs.existsSync(src)) {
    console.warn(`  ⚠️  SKILL NÃO ENCONTRADA: ${skillName} (pulando)`);
    return false;
  }
  if (fs.existsSync(dst)) {
    console.log(`  ↩️  Já existe: ${skillName} → ${path.relative(ROOT, toSectorDir)}/`);
    return true;
  }

  fs.renameSync(src, dst);
  console.log(`  ✅ ${skillName} → ${path.relative(ROOT, toSectorDir)}/`);
  return true;
}

function updateSkillsLock(lockPath, sectorMap) {
  if (!fs.existsSync(lockPath)) {
    console.warn("  ⚠️  skills-lock.json não encontrado — pulando atualização");
    return;
  }

  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));

  for (const [skillName, skillData] of Object.entries(lock.skills)) {
    const sector = sectorMap[skillName];
    if (!sector) continue;

    // Atualiza o skillPath para incluir o setor
    if (skillData.skillPath && skillData.skillPath.startsWith("skills/")) {
      skillData.skillPath = skillData.skillPath.replace(
        /^skills\//,
        `skills/${sector}/`
      );
    }
  }

  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
  console.log("  ✅ skills-lock.json atualizado");
}

function generateSkillsIndex(skillsDir, sectorMap, sectorInfo, outputPath) {
  // Coleta as skills em cada setor
  const sectors = {};
  for (const [skill, sector] of Object.entries(sectorMap)) {
    if (!sectors[sector]) sectors[sector] = [];
    const skillDir = path.join(skillsDir, sector, skill);
    const skillMd = path.join(skillDir, "SKILL.md");
    
    let description = "";
    if (fs.existsSync(skillMd)) {
      const content = fs.readFileSync(skillMd, "utf8");
      const match = content.match(/^description:\s*(.+)$/m);
      if (match) description = match[1].trim().substring(0, 100) + (match[1].length > 100 ? "…" : "");
    }
    sectors[sector].push({ name: skill, description });
  }

  let md = `# 📚 Índice de Skills por Setor

> Gerado automaticamente por \`scripts/migrate-skills.mjs\`  
> Total: **${Object.keys(sectorMap).length} skills** em **${Object.keys(sectors).length} setores**

---

`;

  for (const [sectorKey, info] of Object.entries(sectorInfo)) {
    const skills = sectors[sectorKey] || [];
    md += `## ${info.emoji} ${info.label}\n\n`;
    md += `> ${info.desc}\n\n`;
    md += `**Pasta:** \`skills/${sectorKey}/\`  |  **Skills:** ${skills.length}\n\n`;

    if (skills.length > 0) {
      md += `| Skill | Descrição |\n`;
      md += `|-------|----------|\n`;
      for (const s of skills.sort((a, b) => a.name.localeCompare(b.name))) {
        md += `| \`${s.name}\` | ${s.description || "—"} |\n`;
      }
    } else {
      md += `*(nenhuma skill neste setor ainda)*\n`;
    }
    md += `\n---\n\n`;
  }

  // Skills sem setor mapeado
  const allSkills = fs.existsSync(path.join(skillsDir, "..")) 
    ? [] : [];

  fs.writeFileSync(outputPath, md);
  console.log(`  ✅ Índice gerado: ${path.relative(ROOT, outputPath)}`);
}

// ─── EXECUÇÃO ─────────────────────────────────────────────────────────────────

async function main() {
  const skillsDir = path.join(ROOT, "skills");
  const lockPath = path.join(ROOT, "skills-lock.json");
  const indexPath = path.join(ROOT, "docs", "SKILLS_INDEX.md");

  console.log("🚀 Iniciando migração de skills por setor...\n");

  // 1. Criar pastas de setores
  console.log("📁 Criando diretórios de setores...");
  for (const sector of Object.keys(SECTOR_INFO)) {
    const dir = path.join(skillsDir, sector);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`  ✅ Criado: skills/${sector}/`);
    } else {
      console.log(`  ↩️  Já existe: skills/${sector}/`);
    }
  }
  console.log();

  // 2. Mover skills para seus setores
  console.log("📦 Movendo skills para setores...");
  let moved = 0;
  for (const [skillName, sector] of Object.entries(SECTOR_MAP)) {
    const sectorDir = path.join(skillsDir, sector);
    if (moveSkill(skillName, skillsDir, sectorDir)) moved++;
  }
  console.log(`\n  Total movidas: ${moved}/${Object.keys(SECTOR_MAP).length}\n`);

  // 3. Atualizar skills-lock.json
  console.log("🔒 Atualizando skills-lock.json...");
  updateSkillsLock(lockPath, SECTOR_MAP);
  console.log();

  // 4. Gerar índice por setor
  console.log("📄 Gerando docs/SKILLS_INDEX.md...");
  generateSkillsIndex(skillsDir, SECTOR_MAP, SECTOR_INFO, indexPath);
  console.log();

  // 5. Verificar skills sem mapeamento
  const allDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !Object.keys(SECTOR_INFO).includes(d.name))
    .map(d => d.name);
  
  if (allDirs.length > 0) {
    console.log("⚠️  Skills sem setor mapeado (ainda na raiz de skills/):");
    allDirs.forEach(d => console.log(`   - ${d}`));
    console.log("   → Adicione-as ao SECTOR_MAP em scripts/migrate-skills.mjs\n");
  }

  console.log("✅ Migração concluída!");
  console.log("\n📋 Próximos passos:");
  console.log("  1. Revisar skills/pessoal/ → mover para repositório separado");
  console.log("  2. Verificar skills/seguranca/reverse-shell-techniques (avaliar manutenção)");
  console.log("  3. Commitar: git add -A && git commit -m 'chore: reorganiza skills/ por setor (PRD-02)'");
}

main().catch(console.error);
