import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../db/prisma';

export interface AuthenticatedRequest extends Request {
  developer?: {
    id: string;
    email: string;
    companyName: string;
    plan: string;
  };
}

export async function authenticateApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
    return;
  }

  const apiKey = authHeader.substring(7);

  if (!apiKey) {
    res.status(401).json({ success: false, error: 'API key required' });
    return;
  }

  try {
    // Find all developers and check API key
    // In production, you'd want to optimize this with a key prefix lookup
    const developers = await prisma.developer.findMany();

    for (const developer of developers) {
      const isValid = await bcrypt.compare(apiKey, developer.apiKeyHash);
      if (isValid) {
        req.developer = {
          id: developer.id,
          email: developer.email,
          companyName: developer.companyName,
          plan: developer.plan
        };
        next();
        return;
      }
    }

    res.status(401).json({ success: false, error: 'Invalid API key' });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
}

export function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'ats_'; // agent trust service prefix
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function hashApiKey(apiKey: string): Promise<string> {
  return bcrypt.hash(apiKey, 10);
}
