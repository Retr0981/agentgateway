import { Router, Response } from 'express';
import { authenticateApiKey, AuthenticatedRequest } from '../middleware/auth';
import { verifyAgent, reportOutcome } from '../services/verification';

const router = Router();

// Verify an agent action
router.post('/verify', authenticateApiKey, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const developerId = req.developer!.id;
    const { agentId, actionType, threshold, context } = req.body;

    if (!agentId) {
      res.status(400).json({ success: false, error: 'agentId required' });
      return;
    }

    if (!actionType) {
      res.status(400).json({ success: false, error: 'actionType required' });
      return;
    }

    const result = await verifyAgent({
      agentId,
      actionType,
      developerId,
      threshold: threshold ?? 50,
      context: context ?? {}
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

// Report action outcome
router.post('/report', authenticateApiKey, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const developerId = req.developer!.id;
    const { actionId, outcome } = req.body;

    if (!actionId) {
      res.status(400).json({ success: false, error: 'actionId required' });
      return;
    }

    if (!outcome || !['success', 'failure'].includes(outcome)) {
      res.status(400).json({ success: false, error: 'outcome must be "success" or "failure"' });
      return;
    }

    const result = await reportOutcome(actionId, developerId, outcome);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Report failed';
    console.error('Report error:', error);
    res.status(400).json({ success: false, error: message });
  }
});

export default router;
