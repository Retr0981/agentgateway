import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { StationClient } from '../station-client';
import { CertificatePayload, GatewayRequest } from '../types';

/**
 * Extract the JWT token from the request.
 * Supports Authorization: Bearer header and X-Agent-Certificate header.
 */
function extractToken(req: GatewayRequest): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check custom header
  const certHeader = req.headers['x-agent-certificate'] as string | undefined;
  if (certHeader) {
    return certHeader;
  }

  return null;
}

/**
 * Create Express middleware that validates agent certificates.
 * Verifies the JWT signature locally using the station's cached public key.
 * Attaches the decoded certificate payload to req.agentCertificate.
 */
export function createCertificateMiddleware(stationClient: StationClient) {
  return async (req: GatewayRequest, res: Response, next: NextFunction) => {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Agent certificate required — pass JWT in Authorization: Bearer header'
      });
      return;
    }

    try {
      // Fetch the station's public key (cached)
      const publicKey = await stationClient.getPublicKey();

      // Verify the JWT locally
      const payload = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        issuer: 'agent-trust-station'
      }) as CertificatePayload;

      // Check agent status
      if (payload.status === 'banned' || payload.status === 'suspended') {
        res.status(403).json({
          success: false,
          error: `Agent is ${payload.status}`
        });
        return;
      }

      // Attach to request
      req.agentCertificate = payload;
      req.agentToken = token;
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          success: false,
          error: 'Certificate expired — request a new one from the station'
        });
        return;
      }

      if (error instanceof jwt.JsonWebTokenError) {
        res.status(401).json({
          success: false,
          error: 'Invalid certificate — signature verification failed'
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Certificate validation failed'
      });
    }
  };
}
