export { runInit, type InitOptions, type InitResult } from "./commands/init.js";
export {
  runSpecCreate,
  toFeatureSlug,
  type SpecCreateOptions,
  type SpecCreateResult,
} from "./commands/spec.js";
export { runGate, type GateOptions, type GateResult } from "./commands/gate.js";
export {
  runUpdate,
  type UpdateOptions,
  type UpdateResult,
} from "./commands/update.js";
export {
  runDoctor,
  type DoctorCheck,
  type DoctorResult,
} from "./commands/doctor.js";
export {
  detectProjectStack,
  renderConstitution,
  type StackInfo,
} from "./utils/stack-detector.js";
export {
  auditFeatureSpec,
  extractSpecIds,
  extractTasksInfo,
  parseFrontmatter,
  type AuditFinding,
  type FeatureAuditResult,
  type FrontmatterResult,
  type SpecMetadata,
  type TaskItem,
} from "./utils/markdown-parser.js";
export {
  EXPECTED_AGENTS,
  EXPECTED_COMMANDS,
  EXPECTED_SKILLS,
  HARNESS_VERSION,
} from "./utils/templates-locator.js";
export { runCli } from "./cli.js";
