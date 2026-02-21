// @agent-trust/gateway — AI Agent Gateway middleware for Express
//
// Install on any Express app to let trusted AI agents interact with your site.
// Agents present cryptographically signed certificates from the Agent Trust Station.
// The gateway verifies the certificate, checks the agent's reputation score,
// and executes the requested action if the agent is trusted.

export { AgentGateway, createGateway } from './gateway';
export { StationClient } from './station-client';
export { ActionRegistry } from './action-registry';

export type {
  GatewayConfig,
  ActionDefinition,
  ParameterDefinition,
  ActionHandler,
  AgentContext,
  ActionResult,
  PublicActionInfo,
  DiscoveryPayload,
  GatewayRequest
} from './types';
