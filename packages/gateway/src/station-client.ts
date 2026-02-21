import { GatewayReportPayload } from './types';

/**
 * HTTP client for communicating with the Agent Trust Station.
 * Handles public key caching and report submission.
 */
export class StationClient {
  private stationUrl: string;
  private apiKey: string;
  private cachedPublicKey: string | null = null;
  private publicKeyFetchedAt: number = 0;
  private refreshInterval: number;

  constructor(stationUrl: string, apiKey: string, refreshInterval: number) {
    // Strip trailing slash
    this.stationUrl = stationUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.refreshInterval = refreshInterval;
  }

  /**
   * Fetch the station's public key (PEM format).
   * Caches the key and only refreshes after the refresh interval expires.
   */
  async getPublicKey(): Promise<string> {
    const now = Date.now();

    // Return cached key if still fresh
    if (this.cachedPublicKey && (now - this.publicKeyFetchedAt) < this.refreshInterval) {
      return this.cachedPublicKey;
    }

    // Fetch from station
    const response = await fetch(`${this.stationUrl}/.well-known/station-keys`);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch station public key: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json() as { pem?: string };

    if (!data.pem) {
      throw new Error('Station response missing PEM public key');
    }

    this.cachedPublicKey = data.pem;
    this.publicKeyFetchedAt = now;

    return this.cachedPublicKey!;
  }

  /**
   * Submit a behavior report to the station.
   * Called after an agent performs actions through the gateway.
   */
  async submitReport(report: GatewayReportPayload): Promise<void> {
    const response = await fetch(`${this.stationUrl}/reports`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(report)
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new Error(`Failed to submit report to station: ${response.status} — ${errorBody}`);
    }
  }

  /**
   * Verify a certificate remotely via the station (fallback).
   * Prefer local verification using the public key for speed.
   */
  async verifyRemote(token: string): Promise<Record<string, unknown> | null> {
    const response = await fetch(
      `${this.stationUrl}/certificates/verify?token=${encodeURIComponent(token)}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { data?: { valid?: boolean; payload?: Record<string, unknown> } };
    return data.data?.valid ? data.data.payload ?? null : null;
  }
}
