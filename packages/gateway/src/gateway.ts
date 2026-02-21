import { Router } from 'express';
import { StationClient } from './station-client';
import { ActionRegistry } from './action-registry';
import { createCertificateMiddleware } from './middleware/certificate';
import {
  GatewayConfig,
  GatewayRequest,
  AgentContext,
  DiscoveryPayload
} from './types';

/**
 * AgentGateway — the core class that website owners instantiate.
 * Creates an Express router with discovery, authentication, and action execution.
 *
 * Usage:
 *   const gateway = new AgentGateway({ ... });
 *   app.use('/agent-gateway', gateway.router());
 */
export class AgentGateway {
  private stationClient: StationClient;
  private actionRegistry: ActionRegistry;
  private config: GatewayConfig;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.stationClient = new StationClient(
      config.stationUrl,
      config.stationApiKey,
      config.publicKeyRefreshInterval ?? 3600000 // 1 hour default
    );
    this.actionRegistry = new ActionRegistry(config.actions);
  }

  /**
   * Create and return the Express router for this gateway.
   * Mount it on any path: app.use('/agent-gateway', gateway.router())
   */
  router(): Router {
    const router = Router();

    // ─── Discovery Endpoints ───

    /**
     * GET /.well-known/agent-gateway
     * Machine-readable manifest of available actions.
     * Agents call this to discover what this gateway offers.
     */
    router.get('/.well-known/agent-gateway', (_req, res) => {
      const payload: DiscoveryPayload = {
        gatewayId: this.config.gatewayId,
        actions: this.actionRegistry.getDiscoveryPayload(),
        certificateIssuer: 'agent-trust-station',
        version: '1.0.0'
      };
      res.json(payload);
    });

    /**
     * GET /actions
     * Alternative discovery endpoint — list available actions.
     */
    router.get('/actions', (_req, res) => {
      res.json({
        gatewayId: this.config.gatewayId,
        actions: this.actionRegistry.getDiscoveryPayload()
      });
    });

    // ─── Protected Action Endpoints ───

    // Certificate validation middleware
    const validateCert = createCertificateMiddleware(this.stationClient);

    /**
     * POST /actions/:actionName
     * Execute an action. Requires a valid agent certificate.
     * The gateway checks the agent's score against the action's minimum.
     * After execution, a behavior report is sent to the station.
     */
    router.post('/actions/:actionName', validateCert, async (req: GatewayRequest, res) => {
      const { actionName } = req.params;
      const params = req.body.params || {};
      const certificate = req.agentCertificate!;

      // Check if action exists
      const action = this.actionRegistry.getAction(actionName);
      if (!action) {
        res.status(404).json({
          success: false,
          error: `Action "${actionName}" not found`,
          availableActions: this.actionRegistry.getActionNames()
        });
        return;
      }

      // Build agent context from certificate
      const agentContext: AgentContext = {
        agentId: certificate.sub,
        externalId: certificate.agentExternalId,
        developerId: certificate.developerId,
        score: certificate.score,
        identityVerified: certificate.identityVerified
      };

      // Execute the action
      const result = await this.actionRegistry.execute(actionName, params, agentContext);

      // Submit report to station asynchronously (fire-and-forget)
      this.stationClient.submitReport({
        agentId: certificate.sub,
        gatewayId: this.config.gatewayId,
        certificateJti: certificate.jti,
        actions: [{
          actionType: actionName,
          outcome: result.success ? 'success' : 'failure',
          metadata: { params },
          performedAt: new Date().toISOString()
        }]
      }).catch(err => {
        console.error(`[@agent-trust/gateway] Failed to submit report to station:`, err.message);
      });

      // Return result to the agent
      if (result.success) {
        res.json(result);
      } else {
        res.status(403).json(result);
      }
    });

    return router;
  }
}

/**
 * Factory function — creates an AgentGateway instance.
 *
 * Example:
 *   const gateway = createGateway({
 *     stationUrl: 'https://station.example.com',
 *     gatewayId: 'my-site',
 *     stationApiKey: 'ats_xxxxx',
 *     actions: {
 *       'search': {
 *         description: 'Search products',
 *         minScore: 30,
 *         parameters: { query: { type: 'string', required: true } },
 *         handler: async (params) => db.search(params.query)
 *       }
 *     }
 *   });
 *   app.use('/agent-gateway', gateway.router());
 */
export function createGateway(config: GatewayConfig): AgentGateway {
  return new AgentGateway(config);
}
