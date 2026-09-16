import type { Options } from "prettier";

export interface FormatterSettings {
  formatOnSave: boolean;
  formatClosedFiles: boolean;
  debounceMs: number;
  maxFileSizeKb: number;
  printWidth: number;
  tabWidth: number;
  useTabs: boolean;
  proseWrap: "preserve" | "always" | "never";
  formatCodeBlocks: boolean;
  preserveFrontmatter: boolean;
  preserveObsidianSyntax: boolean;
  excludedPaths: string;
  customOptions: string;
  configPath: string;
}

export const DEFAULT_SETTINGS: FormatterSettings = {
  formatOnSave: true,
  formatClosedFiles: false,
  debounceMs: 700,
  maxFileSizeKb: 1024,
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  proseWrap: "preserve",
  formatCodeBlocks: false,
  preserveFrontmatter: true,
  preserveObsidianSyntax: true,
  excludedPaths: "",
  customOptions: "{}",
  configPath: "",
};

const optionValidators: Record<string, (value: unknown) => boolean> = {
  printWidth: (v) => integer(v, 1, 1000),
  tabWidth: (v) => integer(v, 1, 16),
  useTabs: (v) => typeof v === "boolean",
  proseWrap: (v) =>
    typeof v === "string" && ["always", "never", "preserve"].includes(v),
  endOfLine: (v) =>
    typeof v === "string" && ["lf", "crlf", "cr", "auto"].includes(v),
  embeddedLanguageFormatting: (v) =>
    typeof v === "string" && ["auto", "off"].includes(v),
  semi: (v) => typeof v === "boolean",
  singleQuote: (v) => typeof v === "boolean",
  jsxSingleQuote: (v) => typeof v === "boolean",
  trailingComma: (v) =>
    typeof v === "string" && ["all", "es5", "none"].includes(v),
  bracketSpacing: (v) => typeof v === "boolean",
  bracketSameLine: (v) => typeof v === "boolean",
  arrowParens: (v) => typeof v === "string" && ["always", "avoid"].includes(v),
  quoteProps: (v) =>
    typeof v === "string" &&
    ["as-needed", "consistent", "preserve"].includes(v),
  htmlWhitespaceSensitivity: (v) =>
    typeof v === "string" && ["css", "strict", "ignore"].includes(v),
  singleAttributePerLine: (v) => typeof v === "boolean",
  objectWrap: (v) =>
    typeof v === "string" && ["preserve", "collapse"].includes(v),
};

export function integer(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateOptions(value: unknown): Options {
  if (!isObject(value))
    throw new Error("Prettier設定はJSONオブジェクトで指定してください。");
  for (const [key, option] of Object.entries(value)) {
    const validate = Object.prototype.hasOwnProperty.call(optionValidators, key)
      ? optionValidators[key]
      : undefined;
    if (!validate) throw new Error(`未対応のPrettierオプション: ${key}`);
    if (!validate(option))
      throw new Error(`Prettierオプションの値が不正です: ${key}`);
  }
  return value as Options;
}

export function parseOptions(json: string): Options {
  return validateOptions(JSON.parse(json.trim() || "{}"));
}

export function loadSettings(data: unknown): FormatterSettings {
  const result = { ...DEFAULT_SETTINGS };
  if (!isObject(data)) return result;
  for (const key of Object.keys(
    DEFAULT_SETTINGS,
  ) as (keyof FormatterSettings)[]) {
    if (typeof data[key] === typeof DEFAULT_SETTINGS[key]) {
      Object.assign(result, { [key]: data[key] });
    }
  }
  for (const [key, min, max] of [
    ["debounceMs", 100, 10000],
    ["maxFileSizeKb", 1, 10240],
    ["printWidth", 1, 1000],
    ["tabWidth", 1, 16],
  ] as const) {
    if (!integer(result[key], min, max)) result[key] = DEFAULT_SETTINGS[key];
  }
  if (!["preserve", "always", "never"].includes(result.proseWrap))
    result.proseWrap = "preserve";
  return result;
}

/** Deliberately small glob dialect: *, ** and ?. Paths are vault-relative. */
export function matchesPath(path: string, pattern: string): boolean {
  pattern = pattern.trim().replace(/^\.\//, "").replace(/^\//, "");
  if (!pattern || pattern.startsWith("#")) return false;
  if (pattern.endsWith("/")) pattern += "**";
  let regex = "^";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]!;
    if (char === "*" && pattern[i + 1] === "*") {
      i++;
      if (pattern[i + 1] === "/") {
        regex += "(?:.*/)?";
        i++;
      } else regex += ".*";
    } else if (char === "*") regex += "[^/]*";
    else if (char === "?") regex += "[^/]";
    else regex += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(regex + "$").test(path);
}

export function isExcluded(path: string, patterns: string): boolean {
  return patterns.split(/\r?\n/).some((pattern) => matchesPath(path, pattern));
}

export function validateConfigPath(path: string): string {
  const normalized = path.trim().replace(/\\/g, "/");
  if (
    normalized &&
    (normalized.startsWith("/") ||
      normalized.includes(":") ||
      normalized
        .split("/")
        .some((segment) => segment === ".." || segment === ".") ||
      !normalized.endsWith(".json"))
  ) {
    throw new Error(
      "設定ファイルはVault内のJSONファイルを相対パスで指定してください。",
    );
  }
  return normalized;
}

export function resolveOptions(
  settings: FormatterSettings,
  path: string,
  configJson = "{}",
): Options {
  const config: unknown = JSON.parse(configJson);
  if (!isObject(config))
    throw new Error("設定ファイルはJSONオブジェクトで指定してください。");
  const { overrides, ...base } = config;
  const options: Options = {
    printWidth: settings.printWidth,
    tabWidth: settings.tabWidth,
    useTabs: settings.useTabs,
    proseWrap: settings.proseWrap,
    embeddedLanguageFormatting: settings.formatCodeBlocks ? "auto" : "off",
    endOfLine: "lf",
    ...parseOptions(settings.customOptions),
    ...validateOptions(base),
  };
  if (overrides !== undefined) {
    if (!Array.isArray(overrides))
      throw new Error("overridesは配列で指定してください。");
    for (const override of overrides) {
      if (
        !isObject(override) ||
        Object.keys(override).some(
          (k) => !["files", "excludeFiles", "options"].includes(k),
        )
      ) {
        throw new Error(
          "overridesにはfiles、excludeFiles、optionsを指定してください。",
        );
      }
      const patterns = (value: unknown): string[] => {
        if (typeof value === "string") return [value];
        if (Array.isArray(value) && value.every((v) => typeof v === "string"))
          return value;
        throw new Error(
          "files / excludeFilesには文字列または文字列配列を指定してください。",
        );
      };
      const files = patterns(override.files);
      const excluded =
        override.excludeFiles === undefined
          ? []
          : patterns(override.excludeFiles);
      const values = validateOptions(override.options);
      if (
        files.some((p) => matchesPath(path, p)) &&
        !excluded.some((p) => matchesPath(path, p))
      ) {
        Object.assign(options, values);
      }
    }
  }
  return options;
}
