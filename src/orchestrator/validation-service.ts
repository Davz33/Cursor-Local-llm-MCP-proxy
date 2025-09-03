import { LLM } from "llamaindex";

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  issues: string[];
  suggestions: string[];
  shouldFallback: boolean;
  metadata: Record<string, any>;
}

export interface ValidationOptions {
  minConfidence?: number;
  maxIssues?: number;
  enableFallback?: boolean;
  customValidators?: string[];
}

/**
 * Validation Service for evaluating LLM responses and deciding fallback strategies
 */
export class ValidationService {
  private llm: LLM;
  private defaultOptions: ValidationOptions;

  constructor(llm: LLM) {
    this.llm = llm;
    this.defaultOptions = {
      minConfidence: 0.7,
      maxIssues: 3,
      enableFallback: true,
      customValidators: []
    };
  }

  /**
   * Validate an LLM response
   */
  async validateResponse(
    prompt: string,
    response: string,
    context: Record<string, any> = {},
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const opts = { ...this.defaultOptions, ...options };
    
    try {
      // Run multiple validation checks
      const [
        coherenceCheck,
        accuracyCheck,
        completenessCheck,
        safetyCheck
      ] = await Promise.all([
        this.validateCoherence(prompt, response),
        this.validateAccuracy(prompt, response, context),
        this.validateCompleteness(prompt, response),
        this.validateSafety(response)
      ]);

      // Combine results
      const allIssues = [
        ...coherenceCheck.issues,
        ...accuracyCheck.issues,
        ...completenessCheck.issues,
        ...safetyCheck.issues
      ];

      const allSuggestions = [
        ...coherenceCheck.suggestions,
        ...accuracyCheck.suggestions,
        ...completenessCheck.suggestions,
        ...safetyCheck.suggestions
      ];

      // Calculate overall confidence
      const confidence = this.calculateOverallConfidence([
        coherenceCheck.confidence,
        accuracyCheck.confidence,
        completenessCheck.confidence,
        safetyCheck.confidence
      ]);

      // Determine if fallback is needed
      const shouldFallback = (opts.enableFallback ?? true) && (
        confidence < (opts.minConfidence ?? 0.7) ||
        allIssues.length > (opts.maxIssues ?? 3) ||
        safetyCheck.issues.length > 0
      );

      // Log validation results for fallback system
      if (shouldFallback) {
        console.error(`⚠️ VALIDATION WARNING: Response quality below threshold`);
        console.error(`⚠️ VALIDATION WARNING: Confidence: ${confidence.toFixed(2)} (min: ${opts.minConfidence ?? 0.7})`);
        console.error(`⚠️ VALIDATION WARNING: Issues count: ${allIssues.length} (max: ${opts.maxIssues ?? 3})`);
        console.error(`⚠️ VALIDATION WARNING: Safety issues: ${safetyCheck.issues.length}`);
        console.error(`⚠️ VALIDATION WARNING: Requesting fallback assistance for response quality improvement`);
      }

      return {
        isValid: confidence >= (opts.minConfidence ?? 0.7) && allIssues.length <= (opts.maxIssues ?? 3),
        confidence,
        issues: allIssues,
        suggestions: allSuggestions,
        shouldFallback,
        metadata: {
          coherence: coherenceCheck,
          accuracy: accuracyCheck,
          completeness: completenessCheck,
          safety: safetyCheck,
          validationOptions: opts
        }
      };
    } catch (error) {
      console.error("Validation Service: Error during validation:", (error as Error).message);
      
      return {
        isValid: false,
        confidence: 0,
        issues: [`Validation error: ${(error as Error).message}`],
        suggestions: ["Retry with different parameters or fallback to cursor"],
        shouldFallback: opts.enableFallback ?? true,
        metadata: { error: (error as Error).message }
      };
    }
  }

  /**
   * Validate response coherence - simple heuristic-based validation
   */
  private async validateCoherence(prompt: string, response: string): Promise<ValidationResult> {
    try {
      const issues: string[] = [];
      const suggestions: string[] = [];
      let confidence = 1.0;

      // Check for error indicators
      if (response.includes("Error:") || response.includes("Failed:") || response.includes("❌")) {
        issues.push("Response contains error indicators");
        confidence -= 0.4;
      }

      // Check for expressions of inability
      const inabilityPatterns = [
        /I cannot/i,
        /I can't/i,
        /I'm unable to/i,
        /I don't have access to/i,
        /I don't have permission to/i,
        /I'm not able to/i,
        /I cannot access/i,
        /I cannot find/i,
        /I cannot locate/i,
        /I don't know how to/i,
        /I'm not sure how to/i,
        /I don't have the ability to/i
      ];

      const hasInability = inabilityPatterns.some(pattern => pattern.test(response));
      if (hasInability) {
        issues.push("Response expresses inability to perform requested action");
        confidence -= 0.3;
        suggestions.push("Consider using fallback system for better capability");
      }

      // Check if response is too short (less than 50 characters for most requests)
      if (response.trim().length < 50) {
        issues.push("Response is too short to be comprehensive");
        confidence -= 0.2;
        suggestions.push("Response should provide more detail");
      }

      // Check for basic coherence (response should contain some substance)
      if (response.trim().length < 20) {
        issues.push("Response is extremely short");
        confidence -= 0.5;
      }

      return {
        isValid: confidence >= 0.7,
        confidence: Math.max(0, confidence),
        issues,
        suggestions,
        shouldFallback: confidence < 0.7,
        metadata: { type: "coherence", hasInability, responseLength: response.length }
      };
    } catch (error) {
      return {
        isValid: false,
        confidence: 0.5,
        issues: [`Coherence validation failed: ${(error as Error).message}`],
        suggestions: ["Manual review recommended"],
        shouldFallback: true,
        metadata: { type: "coherence", error: (error as Error).message }
      };
    }
  }

  /**
   * Validate response accuracy - simple heuristic-based validation
   */
  private async validateAccuracy(
    prompt: string,
    response: string,
    context: Record<string, any>
  ): Promise<ValidationResult> {
    try {
      const issues: string[] = [];
      const suggestions: string[] = [];
      let confidence = 1.0;

      // Check for obvious inaccuracies or contradictions
      if (response.includes("I don't know") || response.includes("I'm not sure")) {
        issues.push("Response contains uncertainty about facts");
        confidence -= 0.2;
      }

      // Check if response contradicts context
      if (context && Object.keys(context).length > 0) {
        // Simple check: if context has specific data but response doesn't reference it
        const contextKeys = Object.keys(context);
        const hasContextReference = contextKeys.some(key => 
          response.toLowerCase().includes(key.toLowerCase())
        );
        
        if (!hasContextReference && contextKeys.length > 0) {
          issues.push("Response doesn't reference provided context");
          confidence -= 0.1;
        }
      }

      // Check for placeholder or template responses
      if (response.includes("[PLACEHOLDER]") || response.includes("TODO") || response.includes("FIXME")) {
        issues.push("Response contains placeholder or incomplete content");
        confidence -= 0.3;
      }

      return {
        isValid: confidence >= 0.7,
        confidence: Math.max(0, confidence),
        issues,
        suggestions,
        shouldFallback: confidence < 0.7,
        metadata: { type: "accuracy", hasContextReference: context && Object.keys(context).length > 0 }
      };
    } catch (error) {
      return {
        isValid: false,
        confidence: 0.5,
        issues: [`Accuracy validation failed: ${(error as Error).message}`],
        suggestions: ["Manual review recommended"],
        shouldFallback: true,
        metadata: { type: "accuracy", error: (error as Error).message }
      };
    }
  }

  /**
   * Validate response completeness - simple heuristic-based validation
   */
  private async validateCompleteness(prompt: string, response: string): Promise<ValidationResult> {
    try {
      const issues: string[] = [];
      const suggestions: string[] = [];
      let confidence = 1.0;

      // Check if response is too short for the prompt complexity
      const promptWords = prompt.split(/\s+/).length;
      const responseWords = response.split(/\s+/).length;
      
      // If prompt is complex (many words) but response is very short
      if (promptWords > 20 && responseWords < 30) {
        issues.push("Response is too short for a complex prompt");
        confidence -= 0.3;
        suggestions.push("Response should provide more comprehensive coverage");
      }

      // Check for incomplete sentences or cut-off responses
      if (response.endsWith("...") || response.endsWith("etc.") || response.endsWith("and so on")) {
        issues.push("Response appears to be cut off or incomplete");
        confidence -= 0.2;
      }

      // Check if response addresses key prompt elements
      const promptLower = prompt.toLowerCase();
      const responseLower = response.toLowerCase();
      
      // Look for question words in prompt
      const questionWords = ["what", "how", "why", "when", "where", "which", "who"];
      const hasQuestions = questionWords.some(word => promptLower.includes(word));
      
      if (hasQuestions && !responseLower.includes("answer") && !responseLower.includes("response")) {
        issues.push("Response may not fully address questions in prompt");
        confidence -= 0.1;
      }

      return {
        isValid: confidence >= 0.7,
        confidence: Math.max(0, confidence),
        issues,
        suggestions,
        shouldFallback: confidence < 0.7,
        metadata: { type: "completeness", promptWords, responseWords, hasQuestions }
      };
    } catch (error) {
      return {
        isValid: false,
        confidence: 0.5,
        issues: [`Completeness validation failed: ${(error as Error).message}`],
        suggestions: ["Manual review recommended"],
        shouldFallback: true,
        metadata: { type: "completeness", error: (error as Error).message }
      };
    }
  }

  /**
   * Validate response safety - simple heuristic-based validation
   */
  private async validateSafety(response: string): Promise<ValidationResult> {
    try {
      const issues: string[] = [];
      const suggestions: string[] = [];
      let confidence = 1.0;

      // Check for obvious safety issues
      const safetyKeywords = [
        "hack", "exploit", "vulnerability", "backdoor", "malware", "virus",
        "illegal", "unlawful", "harmful", "dangerous", "risky"
      ];

      const responseLower = response.toLowerCase();
      const hasSafetyIssues = safetyKeywords.some(keyword => responseLower.includes(keyword));
      
      if (hasSafetyIssues) {
        issues.push("Response contains potentially unsafe content");
        confidence -= 0.3;
        suggestions.push("Review response for safety concerns");
      }

      // Check for inappropriate content indicators
      if (response.includes("***") || response.includes("[REDACTED]") || response.includes("[CENSORED]")) {
        issues.push("Response contains censored or inappropriate content");
        confidence -= 0.2;
      }

      // Check for system manipulation attempts
      if (responseLower.includes("sudo") || responseLower.includes("rm -rf") || responseLower.includes("format")) {
        issues.push("Response contains potentially dangerous system commands");
        confidence -= 0.4;
        suggestions.push("Avoid executing dangerous system commands");
      }

      return {
        isValid: confidence >= 0.7,
        confidence: Math.max(0, confidence),
        issues,
        suggestions,
        shouldFallback: confidence < 0.7,
        metadata: { type: "safety", hasSafetyIssues }
      };
    } catch (error) {
      return {
        isValid: false,
        confidence: 0.5,
        issues: [`Safety validation failed: ${(error as Error).message}`],
        suggestions: ["Manual review recommended"],
        shouldFallback: true,
        metadata: { type: "safety", error: (error as Error).message }
      };
    }
  }

  /**
   * Calculate overall confidence from multiple validation results
   */
  private calculateOverallConfidence(confidences: number[]): number {
    if (confidences.length === 0) return 0;
    
    // Weighted average with safety having higher weight
    const weights = [0.2, 0.3, 0.2, 0.3]; // coherence, accuracy, completeness, safety
    const weightedSum = confidences.reduce((sum, conf, index) => {
      return sum + (conf * (weights[index] || 0.25));
    }, 0);
    
    return Math.min(1, Math.max(0, weightedSum));
  }

  /**
   * Quick validation for simple responses
   */
  async quickValidate(response: string): Promise<boolean> {
    // Simple heuristics for quick validation
    if (!response || response.trim().length === 0) return false;
    if (response.length < 10) return false;
    if (response.includes("Error:") || response.includes("Failed:")) return false;
    
    return true;
  }

  /**
   * Get validation statistics
   */
  getValidationStats(): {
    totalValidations: number;
    averageConfidence: number;
    fallbackRate: number;
  } {
    // TODO: Implement statistics tracking
    return {
      totalValidations: 0,
      averageConfidence: 0,
      fallbackRate: 0
    };
  }
}
