import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { configureSettings } from "../config/llm-config.js";

export type DiffScope = "staged" | "unstaged" | "all" | "branch";

export interface GenerateCommitMessageOptions {
  repoPath?: string;
  diffScope?: DiffScope;
  baseBranch?: string;
  maxTokens?: number;
  temperature?: number;
  includeRecentCommits?: boolean;
  maxDiffChars?: number;
}

export interface GenerateCommitMessageResult {
  commitMessage: string;
  subject: string;
  body: string;
  diffScope: DiffScope;
  branch: string;
  baseBranch?: string;
  filesChanged: string[];
  diffStat: string;
  recentCommitStyle: string[];
}

interface GitRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function runGit(repoPath: string, args: string[]): GitRunResult {
  const result = spawnSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  const stderr = (result.stderr ?? "").trim();
  const stdout = (result.stdout ?? "").trim();

  if (result.error) {
    return { ok: false, stdout, stderr: result.error.message };
  }

  if (result.status !== 0) {
    return { ok: false, stdout, stderr: stderr || `git exited with code ${result.status}` };
  }

  return { ok: true, stdout, stderr };
}

function truncateDiff(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n[diff truncated at ${maxChars} characters]`;
}

export class GitCommitService {
  resolveRepoPath(repoPath?: string): string {
    const resolved = resolve(repoPath?.trim() || process.cwd());

    if (!existsSync(resolved)) {
      throw new Error(`Repository path does not exist: ${resolved}`);
    }

    const insideWorkTree = runGit(resolved, ["rev-parse", "--is-inside-work-tree"]);
    if (!insideWorkTree.ok || insideWorkTree.stdout !== "true") {
      throw new Error(`Not a git repository: ${resolved}`);
    }

    return resolved;
  }

  private currentBranch(repoPath: string): string {
    const branch = runGit(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!branch.ok) {
      throw new Error(`Failed to read current branch: ${branch.stderr}`);
    }
    return branch.stdout;
  }

  private collectDiff(
    repoPath: string,
    diffScope: DiffScope,
    baseBranch?: string,
  ): { diff: string; diffStat: string; filesChanged: string[]; baseBranch?: string } {
    let diffArgs: string[];
    let statArgs: string[];
    let nameArgs: string[];
    let resolvedBase: string | undefined;

    switch (diffScope) {
      case "staged":
        diffArgs = ["diff", "--cached"];
        statArgs = ["diff", "--cached", "--stat"];
        nameArgs = ["diff", "--cached", "--name-only"];
        break;
      case "unstaged":
        diffArgs = ["diff"];
        statArgs = ["diff", "--stat"];
        nameArgs = ["diff", "--name-only"];
        break;
      case "all":
        diffArgs = ["diff", "HEAD"];
        statArgs = ["diff", "HEAD", "--stat"];
        nameArgs = ["diff", "HEAD", "--name-only"];
        break;
      case "branch": {
        resolvedBase = baseBranch?.trim() || "main";
        diffArgs = ["diff", `${resolvedBase}...HEAD`];
        statArgs = ["diff", `${resolvedBase}...HEAD`, "--stat"];
        nameArgs = ["diff", `${resolvedBase}...HEAD`, "--name-only"];
        break;
      }
      default:
        throw new Error(`Unsupported diff scope: ${diffScope satisfies never}`);
    }

    const diff = runGit(repoPath, diffArgs);
    if (!diff.ok) {
      throw new Error(`Failed to collect git diff: ${diff.stderr}`);
    }

    const stat = runGit(repoPath, statArgs);
    const names = runGit(repoPath, nameArgs);

    const filesChanged = names.ok
      ? names.stdout.split("\n").map((line) => line.trim()).filter(Boolean)
      : [];

    const payload: {
      diff: string;
      diffStat: string;
      filesChanged: string[];
      baseBranch?: string;
    } = {
      diff: diff.stdout,
      diffStat: stat.ok ? stat.stdout : "",
      filesChanged,
    };

    if (resolvedBase) {
      payload.baseBranch = resolvedBase;
    }

    return payload;
  }

  private recentCommitSubjects(repoPath: string, count = 8): string[] {
    const result = runGit(repoPath, [
      "log",
      `-n`,
      String(count),
      "--format=%s",
    ]);
    if (!result.ok) {
      return [];
    }
    return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  }

  private buildPrompt(input: {
    branch: string;
    diffScope: DiffScope;
    baseBranch?: string;
    filesChanged: string[];
    diffStat: string;
    diff: string;
    recentCommits: string[];
  }): string {
    const scopeLabel =
      input.diffScope === "branch"
        ? `branch changes (${input.baseBranch ?? "main"}...HEAD)`
        : `${input.diffScope} changes`;

    const recentSection =
      input.recentCommits.length > 0
        ? input.recentCommits.map((line) => `- ${line}`).join("\n")
        : "- (no recent commits found)";

    return [
      "You write git commit messages for this repository.",
      "",
      "Requirements:",
      "- Match the tone and style of recent commits when possible.",
      "- Subject line: imperative mood, concise, no trailing period, ideally under 72 characters.",
      "- Body: explain why the change matters, not a file-by-file inventory.",
      "- Use complete sentences and good grammar.",
      "",
      "Return ONLY valid JSON with this shape:",
      '{"subject":"...","body":"...","commit_message":"subject plus optional blank line plus body"}',
      "",
      `Current branch: ${input.branch}`,
      `Diff scope: ${scopeLabel}`,
      "",
      "Recent commit subjects:",
      recentSection,
      "",
      "Files changed:",
      input.filesChanged.length > 0
        ? input.filesChanged.map((file) => `- ${file}`).join("\n")
        : "- (none)",
      "",
      "Diff stat:",
      input.diffStat || "(empty)",
      "",
      "Patch:",
      input.diff || "(empty diff — describe that there are no changes in this scope)",
    ].join("\n");
  }

  private parseModelResponse(raw: string): { subject: string; body: string; commitMessage: string } {
    const stripped = raw
      .split("\n")
      .filter((line) => !/^\s*co-authored-by:/i.test(line))
      .join("\n");
    const trimmed = stripped.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : trimmed;

    try {
      const parsed = JSON.parse(jsonText) as {
        subject?: string;
        body?: string;
        commit_message?: string;
      };

      const subject = (parsed.subject ?? "").trim();
      const body = (parsed.body ?? "").trim();
      const commitMessage =
        (parsed.commit_message ?? "").trim() ||
        (body ? `${subject}\n\n${body}` : subject);

      const cleaned = commitMessage
        .split("\n")
        .filter((line) => !/^\s*co-authored-by:/i.test(line))
        .join("\n")
        .trim();

      if (!subject && !commitMessage) {
        throw new Error("Missing subject");
      }

      return {
        subject: subject || cleaned.split("\n")[0]?.trim() || cleaned,
        body,
        commitMessage: cleaned,
      };
    } catch {
      const lines = trimmed.split("\n");
      const subject = lines[0]?.trim() ?? trimmed;
      const body = lines.slice(1).join("\n").trim();
      return {
        subject,
        body,
        commitMessage: body ? `${subject}\n\n${body}` : subject,
      };
    }
  }

  async generateCommitMessage(
    options: GenerateCommitMessageOptions = {},
  ): Promise<GenerateCommitMessageResult> {
    const repoPath = this.resolveRepoPath(options.repoPath);
    const diffScope = options.diffScope ?? "staged";
    const maxDiffChars = options.maxDiffChars ?? 48_000;
    const includeRecentCommits = options.includeRecentCommits ?? true;

    if (diffScope === "branch" && !options.baseBranch?.trim()) {
      const mainExists = runGit(repoPath, ["rev-parse", "--verify", "main"]);
      if (!mainExists.ok) {
        const masterExists = runGit(repoPath, ["rev-parse", "--verify", "master"]);
        if (!masterExists.ok) {
          throw new Error(
            "diff_scope=branch requires base_branch when neither main nor master exists",
          );
        }
      }
    }

    const branch = this.currentBranch(repoPath);
    const { diff, diffStat, filesChanged, baseBranch } = this.collectDiff(
      repoPath,
      diffScope,
      options.baseBranch,
    );

    if (!diff.trim() && filesChanged.length === 0) {
      throw new Error(
        `No changes found for diff_scope=${diffScope}${baseBranch ? ` against ${baseBranch}` : ""}`,
      );
    }

    const recentCommitStyle = includeRecentCommits
      ? this.recentCommitSubjects(repoPath)
      : [];

    const promptInput: {
      branch: string;
      diffScope: DiffScope;
      baseBranch?: string;
      filesChanged: string[];
      diffStat: string;
      diff: string;
      recentCommits: string[];
    } = {
      branch,
      diffScope,
      filesChanged,
      diffStat,
      diff: truncateDiff(diff, maxDiffChars),
      recentCommits: recentCommitStyle,
    };

    if (baseBranch) {
      promptInput.baseBranch = baseBranch;
    }

    const prompt = this.buildPrompt(promptInput);

    const { llm } = configureSettings();
    const response = await llm.chat({
      messages: [
        {
          role: "system",
          content:
            "You are a senior engineer writing excellent git commit messages. Respond with JSON only.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw =
      typeof response.message.content === "string"
        ? response.message.content
        : String(response.message.content ?? "");

    const parsed = this.parseModelResponse(raw);

    const result: GenerateCommitMessageResult = {
      commitMessage: parsed.commitMessage,
      subject: parsed.subject,
      body: parsed.body,
      diffScope,
      branch,
      filesChanged,
      diffStat,
      recentCommitStyle,
    };

    if (baseBranch) {
      result.baseBranch = baseBranch;
    }

    return result;
  }
}
