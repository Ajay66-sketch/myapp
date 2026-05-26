// src/config/vault.js
// HashiCorp Vault compatibility provider for secure production runtime secrets retrieval

const http = require('http');
const https = require('https');

/**
 * Dynamically loads secrets from HashiCorp Vault and injects them into process.env.
 * Fallbacks gracefully to environment variables if Vault is not configured.
 */
async function loadVaultSecrets() {
  const vaultAddr = process.env.VAULT_ADDR;
  const vaultToken = process.env.VAULT_TOKEN;
  const vaultPath = process.env.VAULT_SECRET_PATH || 'v1/secret/data/scholar-prod';

  if (!vaultAddr || !vaultToken) {
    console.log('   [Vault] Vault environment not configured. Relying on default environment configs.');
    return;
  }

  console.log(`   [Vault] Attempting dynamic secrets retrieval from HashiCorp Vault at: ${vaultAddr}/${vaultPath}`);

  return new Promise((resolve) => {
    const url = `${vaultAddr}/${vaultPath}`;
    const client = url.startsWith('https') ? https : http;

    const req = client.get(
      url,
      {
        headers: {
          'X-Vault-Token': vaultToken,
        },
        timeout: 5000,
      },
      (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              // HashiCorp Vault KV V2 returns secrets in data.data
              const secrets = parsed.data?.data || parsed.data || {};
              const injectedKeys = [];

              for (const [key, value] of Object.entries(secrets)) {
                process.env[key] = value;
                injectedKeys.push(key);
              }

              console.log(`   ✅ [Vault] Successfully loaded secrets from Vault: [${injectedKeys.join(', ')}]`);
            } catch (err) {
              console.error('   ❌ [Vault] Failed to parse secrets payload:', err.message);
            }
          } else {
            console.error(`   ❌ [Vault] Server responded with status code: ${res.statusCode}. Body: ${data}`);
          }
          resolve();
        });
      }
    );

    req.on('error', (err) => {
      console.error('   ❌ [Vault] Connection request failed:', err.message);
      console.warn('   [Vault] Continuing with fallback environment configurations.');
      resolve();
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('   ❌ [Vault] Connection timed out after 5000ms.');
      resolve();
    });
  });
}

module.exports = { loadVaultSecrets };
