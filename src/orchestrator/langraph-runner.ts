import { spawn, spawnSync } from "child_process";
import path from "path";

interface LangGraphPlanResult {
  prompt: string;
  plan: Array<{
    tool: string;
    parameters: Record<string, any>;
  }>;
  artifacts: string[];
}

export class LangGraphRunner {
  private pythonPath: string;
  private pythonExecutable: string | null = null;
  private initialized = false;

  constructor() {
    this.pythonPath = path.join(process.cwd(), "langraph", "orchestrator.py");
  }

  async ensureReady(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Verify Python script exists
    const fs = await import("fs/promises");
    try {
      await fs.access(this.pythonPath);
      this.resolvePythonExecutable();
      this.initialized = true;
    } catch (error) {
      throw new Error(
        `LangGraph orchestrator not found at ${this.pythonPath}: ${(error as Error).message}`,
      );
    }
  }

  private resolvePythonExecutable(): string {
    if (this.pythonExecutable) {
      return this.pythonExecutable;
    }

    const candidates = [
      process.env.PYTHON_EXECUTABLE,
      process.env.PYTHON,
      process.env.PYTHON_PATH,
      "python3",
      "python",
      "py",
    ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);

    for (const candidate of candidates) {
      const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });

      if (!result.error) {
        this.pythonExecutable = candidate;
        return candidate;
      }
    }

    throw new Error(
      `Unable to locate a Python executable. Checked: ${candidates.join(", ") || "none"}`,
    );
  }

  async buildPlan(
    prompt: string,
    context: Record<string, any> = {},
  ): Promise<LangGraphPlanResult> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        prompt,
        context,
      });

      const python = spawn(this.resolvePythonExecutable(), [this.pythonPath], {
        cwd: process.cwd(),
      });

      let stdout = "";
      let stderr = "";

      python.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      python.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      python.on("close", (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `LangGraph orchestrator failed with code ${code}:\n${stderr}`,
            ),
          );
          return;
        }

        try {
          const parsed = JSON.parse(stdout.trim()) as LangGraphPlanResult;
          resolve(parsed);
        } catch (error) {
          reject(
            new Error(
              `Failed to parse LangGraph output: ${(error as Error).message}\nOutput: ${stdout}`,
            ),
          );
        }
      });

      python.stdin.write(payload);
      python.stdin.end();
    });
  }
}
