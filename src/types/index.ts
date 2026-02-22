export interface Developer {
  id: string;
  email: string;
  companyName: string;
  apiKey: string;
  plan: 'free' | 'starter' | 'pro';
  createdAt: Date;
}

export interface Agent {
  id: string;
  externalId: string;
  developerId: string;
  identityVerified: boolean;
  reputationScore: number;
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  stakeAmount: number;
  status: 'active' | 'suspended' | 'banned';
  createdAt: Date;
}

export interface Vouch {
  id: string;
  voucherAgentId: string;
  vouchedAgentId: string;
  weight: number;
  createdAt: Date;
}

export interface Action {
  id: string;
  agentId: string;
  actionType: string;
  decision: 'allowed' | 'denied';
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ReputationEvent {
  id: string;
  agentId: string;
  eventType: 'success' | 'failure' | 'vouch_received' | 'stake_added' | 'abuse_reported';
  scoreChange: number;
  createdAt: Date;
}

export interface VerifyRequest {
  agentId: string;
  actionType: string;
  context?: Record<string, unknown>;
}

export interface VerifyResponse {
  allowed: boolean;
  score: number;
  reason: string;
  actionId: string;
}

export interface ReportRequest {
  agentId: string;
  actionId: string;
  outcome: 'success' | 'failure';
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Certificate Types ───

export interface CertificatePayload {
  sub: string;              // Internal agent UUID
  agentExternalId: string;
  developerId: string;
  score: number;
  identityVerified: boolean;
  status: string;
  totalActions: number;
  successRate: number | null;
  /** Declared scope/purpose manifest — limits which actions this certificate authorizes */
  scope?: string[];
  iat: number;
  exp: number;
  iss: string;
  jti: string;
}

export interface CertificateResult {
  token: string;
  expiresAt: Date;
  score: number;
}

// ─── Gateway Report Types ───

export interface GatewayReportAction {
  actionType: string;
  outcome: 'success' | 'failure';
  metadata?: Record<string, unknown>;
  performedAt: string;
}

export interface GatewayReportRequest {
  agentId: string;          // Internal agent UUID (from certificate sub)
  gatewayId: string;
  actions: GatewayReportAction[];
  certificateJti: string;
}
