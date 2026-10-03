/**
 * CLI plumbing for the crawler, following tools/firestore's conventions: the
 * environment is baked into each npm script as the first argument, options go
 * after a bare `--`, and nothing is written without `--apply`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cert, initializeApp, type Credential } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  DEFAULT_LLM_PROVIDER,
  LLM_PROVIDERS,
  isLlmProvider,
  isPeakHour,
  llmSettingsError,
  pruneUndefined,
  type LlmProvider,
  type LlmSettings,
} from '@pantry-finder/shared';
import { consoleLogger, type Logger } from './logger.js';

export const ENVS = ['dev01', 'dev02', 'prod'] as const;
export type Env = (typeof ENVS)[number];

export function requireEnvArg(): Env {
  const env = process.argv[2];
  if (!(ENVS as readonly string[]).includes(env)) {
    throw new Error(
      `Expected one of ${ENVS.join(', ')} as the first argument (got ${JSON.stringify(env)}). ` +
        'Run this via the npm scripts (crawl:<env>, compare-tiers:<env>).',
    );
  }
  return env as Env;
}

/** Value of `--name <value>`, or undefined. */
export function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function intFlag(name: string): number | undefined {
  const raw = flag(name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${name} must be a positive integer (got ${raw}).`);
  return n;
}

/**
 * The exact command to re-run the current npm script with --apply. Spelled out
 * because `npm run <script> --apply` (without the separating `--`) silently
 * drops the flag.
 */
export function applyCommand(): string {
  const script = process.env.npm_lifecycle_event ?? '<script>';
  const args = process.argv.slice(3).filter((a) => a !== '--apply');
  return ['npm run', script, '--', ...args, '--apply'].join(' ');
}

export function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to tools/crawler/.env.<env> (see .env.example).`);
  return value;
}

function loadCredential(): { credential: Credential; projectId: string } {
  const credentialPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (credentialPath) {
    const json = JSON.parse(fs.readFileSync(path.resolve(credentialPath), 'utf8'));
    return { credential: cert(json), projectId: json.project_id };
  }
  const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (credentialJson) {
    const json = JSON.parse(Buffer.from(credentialJson, 'base64').toString('utf8'));
    return { credential: cert(json), projectId: json.project_id };
  }
  throw new Error(
    'No credentials. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON ' +
      'in tools/crawler/.env.<env> (see .env.example).',
  );
}

export function initFirestore(): { db: Firestore; projectId: string } {
  const { credential, projectId } = loadCredential();
  initializeApp({ credential });
  return { db: getFirestore(), projectId };
}

/** The provider named by `--llm` (default DeepSeek). */
export function llmFlag(): LlmProvider {
  const raw = flag('llm') ?? DEFAULT_LLM_PROVIDER;
  if (!isLlmProvider(raw)) throw new Error(`--llm must be one of ${LLM_PROVIDERS.join(', ')} (got ${raw}).`);
  return raw;
}

/** `--model`, `--thinking` (DeepSeek) and `--effort` (Gemini) for the provider. */
export function llmSettingsFlags(provider: LlmProvider): LlmSettings {
  const settings = pruneUndefined({
    model: flag('model'),
    thinking: flag('thinking'),
    reasoningEffort: flag('effort'),
  }) as LlmSettings;
  const error = llmSettingsError(provider, settings);
  // The message names the setting (reasoningEffort = --effort).
  if (error) throw new Error(`--model / --thinking / --effort: ${error}`);
  return settings;
}

/** DeepSeek prices double at peak time (`isPeakHour`); runs are best started outside it. */
export function peakHourWarning(provider: LlmProvider, logger: Logger = consoleLogger): void {
  if (provider === 'deepseek' && isPeakHour()) {
    logger.warn('WARNING: this is DeepSeek peak time (Mon–Fri 01–04 / 06–10 UTC), when prices double.');
  }
}
