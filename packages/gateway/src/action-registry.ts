import {
  ActionDefinition,
  ActionResult,
  AgentContext,
  PublicActionInfo
} from './types';

/**
 * Manages action definitions and handles execution.
 * Validates parameters, checks score thresholds, and runs handler functions.
 */
export class ActionRegistry {
  private actions: Map<string, ActionDefinition>;

  constructor(actions: Record<string, ActionDefinition>) {
    this.actions = new Map(Object.entries(actions));
  }

  /** Get an action definition by name */
  getAction(name: string): ActionDefinition | undefined {
    return this.actions.get(name);
  }

  /** Get all action names */
  getActionNames(): string[] {
    return Array.from(this.actions.keys());
  }

  /**
   * Get the public discovery payload (schemas without handler functions).
   * This is safe to expose to external agents.
   */
  getDiscoveryPayload(): Record<string, PublicActionInfo> {
    const payload: Record<string, PublicActionInfo> = {};

    for (const [name, def] of this.actions) {
      payload[name] = {
        description: def.description,
        minScore: def.minScore,
        parameters: def.parameters
      };
    }

    return payload;
  }

  /**
   * Validate parameters against an action's schema.
   * Returns an array of error messages (empty if valid).
   */
  validateParams(actionName: string, params: Record<string, unknown>): string[] {
    const action = this.actions.get(actionName);
    if (!action) {
      return [`Action "${actionName}" not found`];
    }

    const errors: string[] = [];

    // Check required parameters
    for (const [paramName, paramDef] of Object.entries(action.parameters)) {
      const value = params[paramName];

      if (paramDef.required && (value === undefined || value === null)) {
        errors.push(`Parameter "${paramName}" is required`);
        continue;
      }

      if (value !== undefined && value !== null) {
        // Type checking
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== paramDef.type) {
          errors.push(
            `Parameter "${paramName}" must be of type ${paramDef.type}, got ${actualType}`
          );
        }
      }
    }

    // Check for unknown parameters
    const knownParams = new Set(Object.keys(action.parameters));
    for (const paramName of Object.keys(params)) {
      if (!knownParams.has(paramName)) {
        errors.push(`Unknown parameter "${paramName}"`);
      }
    }

    return errors;
  }

  /**
   * Execute an action.
   * Checks score threshold, validates params, then calls the handler.
   */
  async execute(
    actionName: string,
    params: Record<string, unknown>,
    agentContext: AgentContext
  ): Promise<ActionResult> {
    const action = this.actions.get(actionName);

    if (!action) {
      return {
        success: false,
        error: `Action "${actionName}" not found`
      };
    }

    // Check minimum score
    if (agentContext.score < action.minScore) {
      return {
        success: false,
        error: `Insufficient reputation score: ${agentContext.score} < ${action.minScore} required`
      };
    }

    // Validate parameters
    const validationErrors = this.validateParams(actionName, params);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: `Parameter validation failed: ${validationErrors.join(', ')}`
      };
    }

    // Execute the handler
    try {
      const data = await action.handler(params, agentContext);
      return { success: true, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action execution failed';
      return { success: false, error: message };
    }
  }
}
