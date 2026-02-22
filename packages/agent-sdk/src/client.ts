import {
  AgentClientConfig,
  CertificateResponse,
  GatewayDiscovery,
  ActionResponse,
  StationInfo
} from './types';

/**
 * AgentClient — the main class agents use to interact with the trust system.
 *
 * Handles:
 * - Requesting clearance certificates from the station
 * - Discovering gateway capabilities
 * - Executing actions on gateways with automatic certificate management
 *
 * Usage:
 *   const agent = new AgentClient({
 *     stationUrl: 'https://station.example.com',
 *     apiKey: 'ats_xxxxx',
 *     agentId: 'my-agent-001'
 *   });
 *
 *   const result = await agent.executeAction(
 *     'https://shop.example.com/agent-gateway',
 *     'search_products',
 *     { query: 'blue widgets' }
 *   );
 */
export class AgentClient {
  private stationUrl: string;
  private apiKey: string;
  private agentId: string;

  // Certificate caching
  private currentCertificate: string | null = null;
  private certificateExpiry: number = 0;
  private currentScope: string[] | undefined;

  constructor(config: AgentClientConfig) {
    this.stationUrl = config.stationUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.agentId = config.agentId;
  }

  // ─── Station Interaction ───

  /**
   * Request a clearance certificate from the station.
   * Caches the certificate and reuses it until 30 seconds before expiry.
   * @param forceRefresh - Force a new certificate even if cached one is valid
   * @param scope - Optional scope/purpose manifest — limits which gateway actions this certificate authorizes.
   *                Example: ["product-search", "view-inventory"] restricts the agent to only those actions.
   *                If omitted, the certificate has no scope restrictions (wildcard).
   */
  async getCertificate(forceRefresh = false, scope?: string[] | null): Promise<string> {
    // If scope is explicitly passed (including null to clear), update the stored scope
    // If scope is not passed (undefined), keep using the existing stored scope
    // Pass null to explicitly clear scope, pass undefined (or omit) to keep current scope
    const effectiveScope = scope === undefined ? this.currentScope : (scope === null ? undefined : scope);
    const scopeChanged = JSON.stringify(effectiveScope) !== JSON.stringify(this.currentScope);

    // Return cached certificate if still valid (with 30s buffer) and scope hasn't changed
    if (
      !forceRefresh &&
      !scopeChanged &&
      this.currentCertificate &&
      Date.now() < this.certificateExpiry - 30_000
    ) {
      return this.currentCertificate;
    }

    const body: Record<string, unknown> = { agentId: this.agentId };
    if (effectiveScope && effectiveScope.length > 0) {
      body.scope = effectiveScope;
    }

    const response = await fetch(`${this.stationUrl}/certificates/request`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
      throw new Error(`Certificate request failed: ${error.error || response.statusText}`);
    }

    const { data } = await response.json() as { data: CertificateResponse };

    this.currentCertificate = data.token;
    this.certificateExpiry = new Date(data.expiresAt).getTime();
    this.currentScope = effectiveScope;

    return data.token;
  }

  /**
   * Get information about the station.
   */
  async getStationInfo(): Promise<StationInfo> {
    const response = await fetch(`${this.stationUrl}/.well-known/station-info`);

    if (!response.ok) {
      throw new Error(`Failed to get station info: ${response.statusText}`);
    }

    return response.json() as Promise<StationInfo>;
  }

  /**
   * Get the agent's current reputation score from the certificate.
   * Requests a fresh certificate to get the latest score.
   */
  async getScore(): Promise<number> {
    const response = await fetch(`${this.stationUrl}/certificates/request`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ agentId: this.agentId })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
      throw new Error(`Failed to get score: ${error.error || response.statusText}`);
    }

    const { data } = await response.json() as { data: CertificateResponse };

    // Update cache while we're at it
    this.currentCertificate = data.token;
    this.certificateExpiry = new Date(data.expiresAt).getTime();

    return data.score;
  }

  // ─── Gateway Interaction ───

  /**
   * Discover what actions a gateway supports.
   * @param gatewayUrl - Base URL of the gateway (e.g., "https://shop.example.com/agent-gateway")
   */
  async discoverGateway(gatewayUrl: string): Promise<GatewayDiscovery> {
    const url = gatewayUrl.replace(/\/+$/, '');
    const response = await fetch(`${url}/.well-known/agent-gateway`);

    if (!response.ok) {
      throw new Error(`Gateway discovery failed: ${response.statusText}`);
    }

    return response.json() as Promise<GatewayDiscovery>;
  }

  /**
   * Execute an action on a gateway.
   * Automatically manages the certificate (requests/caches/refreshes).
   *
   * @param gatewayUrl - Base URL of the gateway
   * @param actionName - Name of the action to execute
   * @param params - Parameters for the action
   */
  async executeAction(
    gatewayUrl: string,
    actionName: string,
    params: Record<string, unknown> = {}
  ): Promise<ActionResponse> {
    const url = gatewayUrl.replace(/\/+$/, '');
    const certificate = await this.getCertificate();

    const response = await fetch(`${url}/actions/${encodeURIComponent(actionName)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${certificate}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ params })
    });

    const result = await response.json() as ActionResponse;

    // If certificate expired, retry once with a fresh certificate
    if (response.status === 401) {
      const freshCertificate = await this.getCertificate(true);

      const retryResponse = await fetch(`${url}/actions/${encodeURIComponent(actionName)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freshCertificate}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ params })
      });

      return retryResponse.json() as Promise<ActionResponse>;
    }

    return result;
  }

  /**
   * Execute multiple actions on a gateway in sequence.
   * Uses the same certificate for all actions (if it doesn't expire mid-batch).
   */
  async executeBatch(
    gatewayUrl: string,
    actions: Array<{ actionName: string; params?: Record<string, unknown> }>
  ): Promise<ActionResponse[]> {
    const results: ActionResponse[] = [];

    for (const action of actions) {
      const result = await this.executeAction(
        gatewayUrl,
        action.actionName,
        action.params || {}
      );
      results.push(result);

      // Stop on first failure if needed
      if (!result.success) {
        break;
      }
    }

    return results;
  }

  // ─── Scope Management ───

  /**
   * Set a default scope for all future certificate requests.
   * The scope restricts which gateway actions this agent can perform.
   * Pass undefined to clear the scope (wildcard access).
   *
   * Example:
   *   agent.setScope(['product-search', 'view-inventory']);
   */
  setScope(scope: string[] | undefined): void {
    if (JSON.stringify(scope) !== JSON.stringify(this.currentScope)) {
      this.currentScope = scope;
      // Invalidate cached certificate since scope changed
      this.currentCertificate = null;
      this.certificateExpiry = 0;
    }
  }

  /**
   * Get the current scope set on this client.
   */
  getScope(): string[] | undefined {
    return this.currentScope;
  }

  // ─── Utility ───

  /** Clear the cached certificate */
  clearCertificateCache(): void {
    this.currentCertificate = null;
    this.certificateExpiry = 0;
  }

  /** Check if there's a valid cached certificate */
  hasCachedCertificate(): boolean {
    return this.currentCertificate !== null && Date.now() < this.certificateExpiry - 30_000;
  }
}
