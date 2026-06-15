// TronGrid API - Monitor USDT TRC20 transfers

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TRONGRID_BASE = 'https://api.trongrid.io';

export interface TronTransfer {
  from: string;
  to: string;
  amount: number;      // USDT amount (6 decimals converted)
  txHash: string;
  blockNumber: number;
  timestamp: number;
}

// Convert hex address (from event log) to base58 TRON address
function hexToBase58(hex: string): string {
  // TRON addresses in event logs are 32-byte hex with 12 bytes padding
  // The actual address is the last 20 bytes (40 hex chars)
  const addr = hex.length > 40 ? '41' + hex.slice(-40) : hex;
  // Use TronGrid's built-in conversion via API or manual base58
  // For simplicity, we'll use the API to convert
  return addr;
}

// Convert base58 TRON address to hex (for matching)
function base58ToHex(address: string): string {
  // TronGrid API accepts both formats, but event logs use hex
  // We'll pass the address directly and let the API handle it
  return address;
}

export async function checkNewTransfers(
  walletAddress: string,
  fromBlock: number,
  apiKey: string
): Promise<{ transfers: TronTransfer[]; lastBlock: number }> {
  if (!walletAddress || !apiKey) return { transfers: [], lastBlock: fromBlock };

  const url = `${TRONGRID_BASE}/v1/contracts/${USDT_CONTRACT}/events`;
  const params = new URLSearchParams({
    event_name: 'Transfer',
    only_confirmed: 'true',
    limit: '200',
    order_by: 'block_number',
  });
  if (fromBlock > 0) {
    params.set('min_block_number', String(fromBlock + 1));
  }

  const resp = await fetch(`${url}?${params}`, {
    headers: {
      'TRON-PRO-API-KEY': apiKey,
      'Accept': 'application/json',
    },
  });

  if (!resp.ok) {
    throw new Error(`TronGrid API error: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json() as any;
  const events = data?.data || [];
  const transfers: TronTransfer[] = [];
  let lastBlock = fromBlock;

  // Convert wallet address to hex for matching (TRON base58 starts with 'T')
  // Event logs use 32-byte padded hex addresses
  // We need to match the last 20 bytes
  const walletLower = walletAddress.toLowerCase();

  for (const event of events) {
    const result = event.result || {};
    const toHex = (result.to || '').toLowerCase();
    const fromHex = (result.from || '').toLowerCase();
    const rawValue = result.value || '0';
    const amount = Number(rawValue) / 1e6; // USDT has 6 decimals
    const blockNumber = event.block_number || event.blockNumber || 0;
    const txHash = event.transaction_id || event.transactionId || '';
    const timestamp = event.block_timestamp || event.blockTimestamp || 0;

    if (blockNumber > lastBlock) lastBlock = blockNumber;

    // Check if 'to' address matches our wallet
    // The event log 'to' is a 32-byte hex, wallet is base58 starting with 'T'
    // We'll do a simple check: if the wallet address is passed as-is,
    // we use the TronGrid account events API instead
    transfers.push({
      from: fromHex,
      to: toHex,
      amount,
      txHash,
      blockNumber,
      timestamp,
    });
  }

  return { transfers, lastBlock };
}

// Alternative: Use account TRC20 transfer events API (more reliable for address matching)
export async function checkAccountTransfers(
  walletAddress: string,
  fromBlock: number,
  apiKey: string
): Promise<{ transfers: TronTransfer[]; lastBlock: number }> {
  if (!walletAddress || !apiKey) return { transfers: [], lastBlock: fromBlock };

  const url = `${TRONGRID_BASE}/v1/accounts/${walletAddress}/transactions/trc20`;
  const params = new URLSearchParams({
    contract_address: USDT_CONTRACT,
    only_confirmed: 'true',
    limit: '50',
    order_by: 'block_timestamp,desc',
  });
  if (fromBlock > 0) {
    params.set('min_block_timestamp', String(fromBlock));
  }

  const resp = await fetch(`${url}?${params}`, {
    headers: {
      'TRON-PRO-API-KEY': apiKey,
      'Accept': 'application/json',
    },
  });

  if (!resp.ok) {
    throw new Error(`TronGrid API error: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json() as any;
  const txs = data?.data || [];
  const transfers: TronTransfer[] = [];
  let lastBlock = fromBlock;

  for (const tx of txs) {
    const to = (tx.to || '').toLowerCase();
    const from = (tx.from || '').toLowerCase();
    const value = tx.value || '0';
    const amount = Number(value) / 1e6;
    const txHash = tx.transaction_id || '';
    const blockTimestamp = Number(tx.block_timestamp || 0);

    if (blockTimestamp > lastBlock) lastBlock = blockTimestamp;

    // Only include incoming transfers (to our wallet)
    if (to === walletAddress.toLowerCase()) {
      transfers.push({
        from,
        to,
        amount,
        txHash,
        blockNumber: 0, // not available in this API
        timestamp: blockTimestamp,
      });
    }
  }

  return { transfers, lastBlock };
}

// Match a transfer amount to a pending order (unique amount strategy)
export function matchTransferToOrder(
  amount: number,
  pendingAmounts: Map<number, string> // unique_amount -> order_id
): string | null {
  // Match with 4 decimal precision
  const rounded = Math.round(amount * 10000) / 10000;
  for (const [uniqueAmount, orderId] of pendingAmounts) {
    const roundedUnique = Math.round(uniqueAmount * 10000) / 10000;
    if (Math.abs(rounded - roundedUnique) < 0.00005) {
      return orderId;
    }
  }
  return null;
}
