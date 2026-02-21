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

  /** Behavioral tracking configuration (optional — enabled by default) */
  behavior?: BehaviorConfig;
}

// ─── Behavioral Tracking Configuration ───

export interface BehaviorConfig {
  /** Enable/disable behavioral tracking (default: true) */
  enabled?: boolean;

  /** Session timeout in ms — sessions expire after this idle time (default: 300000 = 5 min) */
  sessionTimeout?: number;

  /** Max actions per minute before flagging as rapid-fire (default: 30) */
  maxActionsPerMinute?: number;

  /** Max failed actions before flagging as probing (default: 5) */
  maxFailuresBeforeFlag?: number;

  /** Max unique action types per minute before flagging as enumeration (default: 10) */
  maxUniqueActionsPerMinute?: number;

  /** Max repeated identical actions per minute before flagging as automation (default: 10) */
  maxRepeatedActionsPerMinute?: number;

  /** Score penalty for each behavioral violation (0-100, default: 10) */
  violationPenalty?: number;

  /** Score threshold below which the agent is blocked mid-session (default: 20) */
  blockThreshold?: number;

  /** Callback when suspicious behavior is detected */
  onSuspiciousActivity?: (event: BehaviorEvent) => void;
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

/** Express request with attached agent certificate and behavior data */
export interface GatewayRequest extends Request {
  agentCertificate?: CertificatePayload;
  agentToken?: string;
  /** Live behavioral score for this agent session */
  behaviorScore?: number;
  /** Behavioral flags detected in this session */
  behaviorFlags?: BehaviorFlag[];
}

// ─── Behavioral Tracking Types ───

export type BehaviorFlag =
  | 'rapid_fire'           // Too many actions per minute
  | 'high_failure_rate'    // Many failed actions (probing/brute force)
  | 'action_enumeration'   // Trying many different action types (scanning)
  | 'repeated_action'      // Same action with same params (automation)
  | 'scope_violation'      // Attempted action above score threshold
  | 'session_anomaly'      // Unusual session pattern
  | 'burst_detected';      // Sudden spike after idle period

export interface BehaviorEvent {
  /** The agent ID */
  agentId: string;
  /** The agent's external ID */
  externalId: string;
  /** Which flag was triggered */
  flag: BehaviorFlag;
  /** Human-readable description */
  description: string;
  /** The behavioral score at time of event */
  behaviorScore: number;
  /** Session stats at time of event */
  sessionStats: SessionStats;
  /** Timestamp */
  timestamp: string;
}

export interface SessionStats {
  /** Total actions in this session */
  totalActions: number;
  /** Successful actions */
  successfulActions: number;
  /** Failed actions */
  failedActions: number;
  /** Actions in the last 60 seconds */
  actionsLastMinute: number;
  /** Unique action types in the last 60 seconds */
  uniqueActionsLastMinute: number;
  /** How long the session has been active (ms) */
  sessionDuration: number;
  /** Number of scope violations (tried actions above their score) */
  scopeViolations: number;
  /** Number of behavioral flags triggered */
  flagsTriggered: BehaviorFlag[];
}

export interface AgentSession {
  /** The agent's internal ID (from certificate sub) */
  agentId: string;
  /** The agent's external ID */
  externalId: string;
  /** Session start time */
  startedAt: number;
  /** Last activity time */
  lastActivityAt: number;
  /** Current behavioral score (starts at 100, decreases with violations) */
  behaviorScore: number;
  /** All actions performed in this session */
  actions: SessionAction[];
  /** Flags that have been triggered */
  flags: Set<BehaviorFlag>;
  /** Whether the agent has been blocked mid-session */
  blocked: boolean;
}

export interface SessionAction {
  /** Action name */
  actionName: string;
  /** Action parameters (hashed for comparison) */
  paramsHash: string;
  /** Whether it succeeded */
  success: boolean;
  /** Whether it was a scope violation */
  scopeViolation: boolean;
  /** Timestamp */
  timestamp: number;
}
