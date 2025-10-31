import { spawn } from "child_process";
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
      this.initialized = true;
    } catch (error) {
      throw new Error(
        `LangGraph orchestrator not found at ${this.pythonPath}: ${(error as Error).message}`,
      );
    }
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

      const python = spawn("python3", [this.pythonPath], {
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
