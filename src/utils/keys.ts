import crypto from 'crypto';

let cachedPrivateKey: string | null = null;
let cachedPublicKey: string | null = null;

export function loadPrivateKey(): string {
  if (cachedPrivateKey) return cachedPrivateKey;

  const key = process.env.STATION_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      'STATION_PRIVATE_KEY not set. Run "npm run generate-keys" to create a key pair.'
    );
  }

  cachedPrivateKey = key.replace(/\\n/g, '\n');
  return cachedPrivateKey;
}

export function loadPublicKey(): string {
  if (cachedPublicKey) return cachedPublicKey;

  const key = process.env.STATION_PUBLIC_KEY;
  if (!key) {
    throw new Error(
      'STATION_PUBLIC_KEY not set. Run "npm run generate-keys" to create a key pair.'
    );
  }

  cachedPublicKey = key.replace(/\\n/g, '\n');
  return cachedPublicKey;
}

export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return { publicKey, privateKey };
}

// When run directly, generate and print keys for .env
if (require.main === module) {
  const keys = generateKeyPair();
  console.log('Add these to your .env file:\n');
  console.log(`STATION_PRIVATE_KEY="${keys.privateKey.replace(/\n/g, '\\n')}"`);
  console.log('');
  console.log(`STATION_PUBLIC_KEY="${keys.publicKey.replace(/\n/g, '\\n')}"`);
}
