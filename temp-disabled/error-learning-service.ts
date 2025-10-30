import fs from "fs/promises";
import path from "path";

export interface ErrorPattern {
  id: string;
  errorType: string;
  errorMessage: string;
  codeContext: string;
  solution: string;
  frequency: number;
  successRate: number;
  lastOccurred: Date;
  tags: string[];
  relatedFiles: string[];
  complexity: number;
  resolutionTime: number; // in minutes
}

export interface ErrorContext {
  filePath: string;
  functionName?: string;
  className?: string;
  lineNumber: number;
  stackTrace: string;
  variables: Record<string, any>;
  imports: string[];
}

export interface SolutionPattern {
  id: string;
  errorPatternId: string;
  solution: string;
  explanation: string;
  codeChanges: CodeChange[];
  verificationSteps: string[];
  successRate: number;
  usageCount: number;
}

export interface CodeChange {
  type: "add" | "remove" | "modify";
  filePath: string;
  lineNumber: number;
  oldCode?: string;
  newCode: string;
  reason: string;
}

export class ErrorLearningService {
  private errorPatterns: Map<string, ErrorPattern> = new Map();
  private solutionPatterns: Map<string, SolutionPattern> = new Map();
  private storagePath: string;
  private instanceId: string;

  constructor(storagePath: string = "./error-learning-storage") {
    this.storagePath = path.resolve(storagePath);
    this.instanceId = `ErrorLearning_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async initialize(): Promise<void> {
    try {
      await this.loadStorage();
      console.error(
        `Error Learning Service [${this.instanceId}]: Initialized successfully`,
      );
    } catch (error) {
      console.error(
        `Error Learning Service [${this.instanceId}]: Failed to initialize:`,
        (error as Error).message,
      );
    }
  }

  /**
   * Learn from a new error-solution pair
   */
  async learnFromError(
    error: Error,
    context: ErrorContext,
    solution: string,
    codeChanges: CodeChange[] = [],
  ): Promise<void> {
    const errorId = this.generateErrorId(error.message, context);
    const existingPattern = this.errorPatterns.get(errorId);

    if (existingPattern) {
      // Update existing pattern
      existingPattern.frequency += 1;
      existingPattern.lastOccurred = new Date();
      existingPattern.successRate = (existingPattern.successRate + 1) / 2;

      // Add new solution if different
      if (solution !== existingPattern.solution) {
        await this.addSolutionPattern(errorId, solution, codeChanges);
      }
    } else {
      // Create new pattern
      const newPattern: ErrorPattern = {
        id: errorId,
        errorType: this.categorizeError(error.message),
        errorMessage: error.message,
        codeContext: this.extractCodeContext(context),
        solution,
        frequency: 1,
        successRate: 1.0,
        lastOccurred: new Date(),
        tags: this.extractTags(error.message, context),
        relatedFiles: [context.filePath],
        complexity: this.calculateComplexity(context),
        resolutionTime: 0, // Will be updated when solution is applied
      };

      this.errorPatterns.set(errorId, newPattern);
      await this.addSolutionPattern(errorId, solution, codeChanges);
    }

    await this.saveStorage();
  }

  /**
   * Find similar error patterns
   */
  findSimilarErrors(
    errorMessage: string,
    context: ErrorContext,
    threshold: number = 0.7,
  ): ErrorPattern[] {
    const similarPatterns: ErrorPattern[] = [];
    const errorLower = errorMessage.toLowerCase();

    for (const pattern of this.errorPatterns.values()) {
      const similarity = this.calculateErrorSimilarity(
        errorLower,
        pattern,
        context,
      );
      if (similarity >= threshold) {
        similarPatterns.push(pattern);
      }
    }

    return similarPatterns.sort(
      (a, b) =>
        this.calculateErrorSimilarity(errorLower, b, context) -
        this.calculateErrorSimilarity(errorLower, a, context),
    );
  }

  /**
   * Get solution recommendations for an error
   */
  async getSolutionRecommendations(
    errorMessage: string,
    context: ErrorContext,
  ): Promise<{
    primarySolution: string;
    alternativeSolutions: string[];
    confidence: number;
    reasoning: string[];
  }> {
    const similarErrors = this.findSimilarErrors(errorMessage, context);

    if (similarErrors.length === 0) {
      return {
        primarySolution:
          "No similar errors found. Manual investigation required.",
        alternativeSolutions: [],
        confidence: 0.1,
        reasoning: ["No historical data available for this error type"],
      };
    }

    const bestMatch = similarErrors[0];
    if (!bestMatch) {
      return {
        primarySolution: "No similar errors found",
        alternativeSolutions: [],
        confidence: 0.1,
        reasoning: ["No similar error patterns found"],
      };
    }

    const solutionPatterns = this.getSolutionPatternsForError(bestMatch.id);

    const reasoning: string[] = [];
    reasoning.push(`Found ${similarErrors.length} similar error patterns`);
    reasoning.push(
      `Best match: ${bestMatch.errorType} (${bestMatch.frequency} occurrences)`,
    );
    reasoning.push(
      `Success rate: ${(bestMatch.successRate * 100).toFixed(1)}%`,
    );

    if (solutionPatterns.length > 0) {
      const bestSolution = solutionPatterns[0];
      if (bestSolution) {
        reasoning.push(
          `Solution used ${bestSolution.usageCount} times with ${(bestSolution.successRate * 100).toFixed(1)}% success rate`,
        );
      }
    }

    return {
      primarySolution: bestMatch.solution,
      alternativeSolutions: solutionPatterns.slice(1, 4).map((s) => s.solution),
      confidence: this.calculateConfidence(similarErrors, context),
      reasoning,
    };
  }

  /**
   * Update solution success rate
   */
  async updateSolutionSuccess(
    solutionId: string,
    wasSuccessful: boolean,
  ): Promise<void> {
    const solution = this.solutionPatterns.get(solutionId);
    if (solution) {
      solution.usageCount += 1;
      solution.successRate =
        (solution.successRate + (wasSuccessful ? 1 : 0)) / 2;
      await this.saveStorage();
    }
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(): {
    totalErrors: number;
    uniqueErrorTypes: number;
    averageResolutionTime: number;
    mostCommonErrors: Array<{ errorType: string; frequency: number }>;
    successRate: number;
  } {
    const patterns = Array.from(this.errorPatterns.values());
    const errorTypes = new Map<string, number>();

    let totalResolutionTime = 0;
    let totalSuccessRate = 0;

    patterns.forEach((pattern) => {
      const count = errorTypes.get(pattern.errorType) || 0;
      errorTypes.set(pattern.errorType, count + pattern.frequency);
      totalResolutionTime += pattern.resolutionTime;
      totalSuccessRate += pattern.successRate;
    });

    const mostCommonErrors = Array.from(errorTypes.entries())
      .map(([type, freq]) => ({ errorType: type, frequency: freq }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    return {
      totalErrors: patterns.reduce((sum, p) => sum + p.frequency, 0),
      uniqueErrorTypes: errorTypes.size,
      averageResolutionTime:
        patterns.length > 0 ? totalResolutionTime / patterns.length : 0,
      mostCommonErrors,
      successRate: patterns.length > 0 ? totalSuccessRate / patterns.length : 0,
    };
  }

  private async addSolutionPattern(
    errorPatternId: string,
    solution: string,
    codeChanges: CodeChange[],
  ): Promise<void> {
    const solutionId = `${errorPatternId}_${Date.now()}`;
    const solutionPattern: SolutionPattern = {
      id: solutionId,
      errorPatternId,
      solution,
      explanation: this.generateExplanation(solution, codeChanges),
      codeChanges,
      verificationSteps: this.generateVerificationSteps(codeChanges),
      successRate: 1.0,
      usageCount: 1,
    };

    this.solutionPatterns.set(solutionId, solutionPattern);
  }

  private generateErrorId(errorMessage: string, context: ErrorContext): string {
    const key = `${errorMessage.slice(0, 100)}_${context.filePath}_${context.lineNumber}`;
    return key.replace(/[^a-zA-Z0-9]/g, "_");
  }

  private categorizeError(errorMessage: string): string {
    if (errorMessage.includes("TypeError")) return "type_error";
    if (errorMessage.includes("ReferenceError")) return "reference_error";
    if (errorMessage.includes("SyntaxError")) return "syntax_error";
    if (errorMessage.includes("RangeError")) return "range_error";
    if (errorMessage.includes("EvalError")) return "eval_error";
    if (errorMessage.includes("URIError")) return "uri_error";
    if (errorMessage.includes("Cannot read property"))
      return "property_access_error";
    if (errorMessage.includes("is not a function"))
      return "function_call_error";
    if (errorMessage.includes("is not defined"))
      return "undefined_variable_error";
    if (errorMessage.includes("Unexpected token")) return "syntax_token_error";
    return "unknown_error";
  }

  private extractCodeContext(context: ErrorContext): string {
    return `${context.filePath}:${context.lineNumber} in ${context.functionName || "anonymous"}`;
  }

  private extractTags(errorMessage: string, context: ErrorContext): string[] {
    const tags: string[] = [];

    // Extract error type tags
    if (errorMessage.includes("async")) tags.push("async");
    if (errorMessage.includes("promise")) tags.push("promise");
    if (errorMessage.includes("import")) tags.push("import");
    if (errorMessage.includes("export")) tags.push("export");
    if (errorMessage.includes("class")) tags.push("class");
    if (errorMessage.includes("function")) tags.push("function");

    // Extract context tags
    if (context.className) tags.push("class_method");
    if (context.functionName) tags.push("function_scope");
    if (context.imports.length > 0) tags.push("has_imports");

    return tags;
  }

  private calculateComplexity(context: ErrorContext): number {
    let complexity = 1;

    // Increase complexity based on context
    if (context.className) complexity += 1;
    if (context.functionName) complexity += 1;
    if (context.imports.length > 5) complexity += 1;
    if (Object.keys(context.variables).length > 10) complexity += 1;

    return complexity;
  }

  private calculateErrorSimilarity(
    errorMessage: string,
    pattern: ErrorPattern,
    context: ErrorContext,
  ): number {
    let similarity = 0;

    // Error message similarity (40% weight)
    const messageSimilarity = this.calculateStringSimilarity(
      errorMessage,
      pattern.errorMessage,
    );
    similarity += messageSimilarity * 0.4;

    // Error type similarity (30% weight)
    const typeSimilarity =
      pattern.errorType === this.categorizeError(errorMessage) ? 1 : 0;
    similarity += typeSimilarity * 0.3;

    // Context similarity (20% weight)
    const contextSimilarity = this.calculateContextSimilarity(context, pattern);
    similarity += contextSimilarity * 0.2;

    // Tag similarity (10% weight)
    const tagSimilarity = this.calculateTagSimilarity(context, pattern);
    similarity += tagSimilarity * 0.1;

    return similarity;
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);

    const intersection = words1.filter((word) => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];

    return intersection.length / union.length;
  }

  private calculateContextSimilarity(
    context: ErrorContext,
    pattern: ErrorPattern,
  ): number {
    let similarity = 0;

    // File path similarity
    if (pattern.relatedFiles.includes(context.filePath)) {
      similarity += 0.5;
    }

    // Function/class name similarity
    if (
      pattern.codeContext.includes(context.functionName || "") ||
      pattern.codeContext.includes(context.className || "")
    ) {
      similarity += 0.3;
    }

    // Import similarity
    const patternImports = pattern.tags.filter((tag) =>
      tag.includes("import"),
    ).length;
    const contextImports = context.imports.length;
    if (patternImports > 0 && contextImports > 0) {
      similarity += 0.2;
    }

    return Math.min(1, similarity);
  }

  private calculateTagSimilarity(
    context: ErrorContext,
    pattern: ErrorPattern,
  ): number {
    const contextTags = this.extractTags("", context);
    const intersection = contextTags.filter((tag) =>
      pattern.tags.includes(tag),
    );
    const union = [...new Set([...contextTags, ...pattern.tags])];

    return union.length > 0 ? intersection.length / union.length : 0;
  }

  private calculateConfidence(
    similarErrors: ErrorPattern[],
    context: ErrorContext,
  ): number {
    if (similarErrors.length === 0) return 0.1;

    const bestMatch = similarErrors[0];
    if (!bestMatch) return 0.1;

    let confidence = bestMatch.successRate;

    // Increase confidence based on frequency
    confidence += Math.min(0.2, bestMatch.frequency * 0.05);

    // Increase confidence based on recency
    const daysSinceLastOccurrence =
      (Date.now() - bestMatch.lastOccurred.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastOccurrence < 7) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }

  private getSolutionPatternsForError(
    errorPatternId: string,
  ): SolutionPattern[] {
    return Array.from(this.solutionPatterns.values())
      .filter((solution) => solution.errorPatternId === errorPatternId)
      .sort((a, b) => b.successRate - a.successRate);
  }

  private generateExplanation(
    solution: string,
    codeChanges: CodeChange[],
  ): string {
    let explanation = `Solution: ${solution}\n\n`;

    if (codeChanges.length > 0) {
      explanation += "Code changes:\n";
      codeChanges.forEach((change, index) => {
        explanation += `${index + 1}. ${change.type} in ${change.filePath}:${change.lineNumber}\n`;
        explanation += `   Reason: ${change.reason}\n`;
      });
    }

    return explanation;
  }

  private generateVerificationSteps(codeChanges: CodeChange[]): string[] {
    const steps: string[] = [];

    steps.push("1. Review the error message and context");
    steps.push("2. Apply the suggested code changes");

    if (codeChanges.some((c) => c.type === "add")) {
      steps.push("3. Verify new code compiles without errors");
    }

    if (codeChanges.some((c) => c.type === "modify")) {
      steps.push("4. Test the modified functionality");
    }

    steps.push("5. Run the application to confirm the error is resolved");

    return steps;
  }

  private async loadStorage(): Promise<void> {
    try {
      const patternsFile = path.join(this.storagePath, "error-patterns.json");
      const solutionsFile = path.join(
        this.storagePath,
        "solution-patterns.json",
      );

      if (await this.fileExists(patternsFile)) {
        const patternsData = await fs.readFile(patternsFile, "utf-8");
        const patterns = JSON.parse(patternsData);
        patterns.forEach((pattern: any) => {
          pattern.lastOccurred = new Date(pattern.lastOccurred);
          this.errorPatterns.set(pattern.id, pattern);
        });
      }

      if (await this.fileExists(solutionsFile)) {
        const solutionsData = await fs.readFile(solutionsFile, "utf-8");
        const solutions = JSON.parse(solutionsData);
        solutions.forEach((solution: any) => {
          this.solutionPatterns.set(solution.id, solution);
        });
      }
    } catch (error) {
      console.error(
        "Failed to load error learning storage:",
        (error as Error).message,
      );
    }
  }

  private async saveStorage(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });

      const patternsFile = path.join(this.storagePath, "error-patterns.json");
      const solutionsFile = path.join(
        this.storagePath,
        "solution-patterns.json",
      );

      const patterns = Array.from(this.errorPatterns.values());
      const solutions = Array.from(this.solutionPatterns.values());

      await fs.writeFile(patternsFile, JSON.stringify(patterns, null, 2));
      await fs.writeFile(solutionsFile, JSON.stringify(solutions, null, 2));
    } catch (error) {
      console.error(
        "Failed to save error learning storage:",
        (error as Error).message,
      );
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
