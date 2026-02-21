import { Router, Request, Response } from 'express';
import { getStationPublicKey } from '../services/certificates';

const router = Router();

/**
 * GET /.well-known/station-keys
 * Public endpoint — returns the station's public key.
 * Gateways use this to verify certificates locally without round-tripping to the station.
 */
router.get('/station-keys', (_req: Request, res: Response) => {
  try {
    const publicKey = getStationPublicKey();

    res.json({
      pem: publicKey,
      algorithm: 'RS256',
      use: 'sig',
      issuer: 'agent-trust-station'
    });
  } catch (error) {
    console.error('Station keys error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve public key' });
  }
});

/**
 * GET /.well-known/station-info
 * Public endpoint — returns metadata about this station instance.
 * Agents and gateways use this for service discovery.
 */
router.get('/station-info', (_req: Request, res: Response) => {
  res.json({
    name: 'Agent Trust Station',
    version: '2.0.0',
    endpoints: {
      certificateRequest: '/certificates/request',
      certificateVerify: '/certificates/verify',
      reportSubmit: '/reports',
      stationKeys: '/.well-known/station-keys',
      developerRegister: '/developers/register'
    },
    certificateConfig: {
      algorithm: 'RS256',
      issuer: 'agent-trust-station',
      defaultExpirySeconds: parseInt(process.env.CERTIFICATE_EXPIRY_SECONDS || '300', 10)
    }
  });
});

export default router;
