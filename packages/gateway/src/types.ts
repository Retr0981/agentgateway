import { Request } from 'express';

// ─── Gateway Configuration ───

export interface GatewayConfig {
  /** URL of the Agent Trust Station (e.g., "https://station.example.com") */
  stationUrl: string;

  /** Unique identifier for this gateway (e.g., "my-ecommerce-site") */
  gatewayId: string;

  /** Developer API key for authenticating with the station */
  stationApiKey: string;

  /** Map of action names to their definitions */
  actions: Record<string, ActionDefinition>;

  /** How often to refresh the station's public key, in ms (default: 3600000 = 1 hour) */
  publicKeyRefreshInterval?: number;
}

// ─── Action Definitions ───

export interface ActionDefinition {
  /** Human-readable description of what this action does */
  description: string;

  /** Minimum reputation score required to use this action (0-100) */
  minScore: number;

  /** Parameter schema for this action */
  parameters: Record<string, ParameterDefinition>;

  /** Handler function that executes the action */
  handler: ActionHandler;
}

export interface ParameterDefinition {
  /** Parameter type */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';

  /** Whether this parameter is required */
  required: boolean;

  /** Human-readable description */
  description?: string;
}

/** The handler function receives validated params and agent context */
export type ActionHandler = (
  params: Record<string, unknown>,
  agent: AgentContext
) => Promise<unknown>;

// ─── Agent Context (decoded from certificate) ───

export interface AgentContext {
  /** Internal agent UUID (from certificate "sub" claim) */
  agentId: string;

  /** Agent's external ID as registered by the developer */
  externalId: string;

  /** Developer ID who owns this agent */
  developerId: string;

  /** Agent's reputation score at time of certificate issuance */
  score: number;

  /** Whether the agent's identity has been verified */
  identityVerified: boolean;
}

// ─── Action Results ───

export interface ActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ─── Discovery Payload (public, no handlers) ───

export interface PublicActionInfo {
  description: string;
  minScore: number;
  parameters: Record<string, ParameterDefinition>;
}

export interface DiscoveryPayload {
  gatewayId: string;
  actions: Record<string, PublicActionInfo>;
  certificateIssuer: string;
  version: string;
}

// ─── Internal Types ───

export interface CertificatePayload {
  sub: string;
  agentExternalId: string;
  developerId: string;
  score: number;
  identityVerified: boolean;
  status: string;
  totalActions: number;
  successRate: number | null;
  iat: number;
  exp: number;
  iss: string;
  jti: string;
}

export interface GatewayReportPayload {
  agentId: string;
  gatewayId: string;
  actions: Array<{
    actionType: string;
    outcome: 'success' | 'failure';
    metadata?: Record<string, unknown>;
    performedAt: string;
  }>;
  certificateJti: string;
}

/** Express request with attached agent certificate */
export interface GatewayRequest extends Request {
  agentCertificate?: CertificatePayload;
  agentToken?: string;
}
