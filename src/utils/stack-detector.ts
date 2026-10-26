import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Informações detectadas sobre a stack tecnológica do projeto alvo.
 */
export interface StackInfo {
  projectName: string;
  language: string;
  framework: string;
  packageManager: string;
  testCommand: string;
  hasUi: boolean;
}

/**
 * Detecta automaticamente a stack predominante do repositório em `cwd`
 * inspecionando arquivos de manifesto comuns (package.json, pyproject.toml, go.mod, pubspec.yaml, etc.).
 */
export function detectProjectStack(cwd: string): StackInfo {
  const folderName = path.basename(path.resolve(cwd)) || "meu-projeto";
  const pkgJsonPath = path.join(cwd, "package.json");

  // 1. Projetos Node.js / TypeScript / JavaScript
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const raw = fs.readFileSync(pkgJsonPath, "utf-8");
      const pkg = JSON.parse(raw) as {
        name?: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      const allDeps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };

      const hasTs =
        Boolean(allDeps["typescript"]) ||
        fs.existsSync(path.join(cwd, "tsconfig.json"));

      const language = hasTs ? "TypeScript (Node.js)" : "JavaScript (Node.js)";

      // Detecta gerenciador de pacotes
      let packageManager = "npm";
      if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
        packageManager = "pnpm";
      } else if (
        fs.existsSync(path.join(cwd, "bun.lockb")) ||
        fs.existsSync(path.join(cwd, "bun.lock"))
      ) {
        packageManager = "bun";
      } else if (fs.existsSync(path.join(cwd, "yarn.lock"))) {
        packageManager = "yarn";
      }

      // Detecta framework e presença de UI
      let framework = "Node.js Standard / Library";
      let hasUi = false;

      if (allDeps["next"]) {
        framework = "Next.js";
        hasUi = true;
      } else if (allDeps["nuxt"]) {
        framework = "Nuxt";
        hasUi = true;
      } else if (allDeps["@angular/core"]) {
        framework = "Angular";
        hasUi = true;
      } else if (allDeps["svelte"] || allDeps["@sveltejs/kit"]) {
        framework = "Svelte / SvelteKit";
        hasUi = true;
      } else if (allDeps["vue"]) {
        framework = "Vue.js";
        hasUi = true;
      } else if (allDeps["react"] || allDeps["react-dom"]) {
        framework = "React";
        hasUi = true;
      } else if (allDeps["@nestjs/core"]) {
        framework = "NestJS";
        hasUi = false;
      } else if (allDeps["fastify"]) {
        framework = "Fastify";
        hasUi = false;
      } else if (allDeps["express"]) {
        framework = "Express";
        hasUi = false;
      }

      const testCommand = pkg.scripts?.test
        ? `${packageManager} test`
        : "npx vitest run";

      return {
        projectName: pkg.name || folderName,
        language,
        framework,
        packageManager,
        testCommand,
        hasUi,
      };
    } catch {
      // Fallback caso o package.json esteja malformado
    }
  }

  // 2. Projetos Flutter / Dart
  if (fs.existsSync(path.join(cwd, "pubspec.yaml"))) {
    const pubspec = fs.readFileSync(path.join(cwd, "pubspec.yaml"), "utf-8");
    const isFlutter = pubspec.includes("flutter:");
    return {
      projectName: folderName,
      language: "Dart",
      framework: isFlutter ? "Flutter" : "Dart CLI / Package",
      packageManager: isFlutter ? "flutter pub" : "dart pub",
      testCommand: isFlutter ? "flutter test" : "dart test",
      hasUi: isFlutter,
    };
  }

  // 3. Projetos Python
  if (
    fs.existsSync(path.join(cwd, "pyproject.toml")) ||
    fs.existsSync(path.join(cwd, "requirements.txt"))
  ) {
    return {
      projectName: folderName,
      language: "Python",
      framework: "Python Application / API",
      packageManager: fs.existsSync(path.join(cwd, "uv.lock")) ? "uv" : "pip",
      testCommand: "pytest",
      hasUi: false,
    };
  }

  // 4. Projetos Go
  if (fs.existsSync(path.join(cwd, "go.mod"))) {
    return {
      projectName: folderName,
      language: "Go",
      framework: "Go Standard / Module",
      packageManager: "go mod",
      testCommand: "go test ./...",
      hasUi: false,
    };
  }

  // 5. Fallback Genérico
  return {
    projectName: folderName,
    language: "TypeScript / Multi-stack",
    framework: "Custom Architecture",
    packageManager: "npm",
    testCommand: "npm test",
    hasUi: true,
  };
}

/**
 * Preenche o template de CONSTITUTION.md com os dados detectados da stack do projeto.
 */
export function renderConstitution(template: string, info: StackInfo): string {
  return template
    .replaceAll("{{PROJECT_NAME}}", info.projectName)
    .replaceAll("{{STACK_LANGUAGE}}", info.language)
    .replaceAll("{{STACK_FRAMEWORK}}", info.framework)
    .replaceAll("{{PACKAGE_MANAGER}}", info.packageManager)
    .replaceAll("{{TEST_COMMAND}}", info.testCommand)
    .replaceAll("{{HAS_UI}}", info.hasUi ? "Sim (Frontend/UI ativo)" : "Não (API / CLI / Backend puro)");
}
