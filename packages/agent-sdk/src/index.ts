// @agent-trust/sdk — AI Agent SDK
//
// Request clearance certificates from the Agent Trust Station
// and interact with Agent Trust Gateways on any website.
//
// Usage:
//   import { createAgentClient } from '@agent-trust/sdk';
//
//   const agent = createAgentClient({
//     stationUrl: 'https://station.example.com',
//     apiKey: 'ats_xxxxx',
//     agentId: 'my-agent-001'
//   });
//
//   // Discover what a gateway offers
//   const gateway = await agent.discoverGateway('https://shop.example.com/agent-gateway');
//
//   // Execute an action
//   const result = await agent.executeAction(
//     'https://shop.example.com/agent-gateway',
//     'search_products',
//     { query: 'blue widgets' }
//   );

import { AgentClient } from './client';
import { AgentClientConfig } from './types';

export { AgentClient } from './client';

export type {
  AgentClientConfig,
  CertificateResponse,
  GatewayDiscovery,
  GatewayActionInfo,
  ActionResponse,
  StationInfo
} from './types';

/**
 * Factory function — creates an AgentClient instance.
 */
export function createAgentClient(config: AgentClientConfig): AgentClient {
  return new AgentClient(config);
}
