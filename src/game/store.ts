import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE, type Transaction } from '@capgo/native-purchases';

/**
 * Versão completa: compra adicional única (não consumível) que libera falta, goleiro, todas as
 * seleções e times e o "Meu craque". O download (pago) já inclui pênalti como batedor com um time.
 * O mesmo identificador precisa ser cadastrado no App Store Connect e no Google Play Console.
 */
export const PRODUCT_ID = 'com.arial.goldeplaca.completo';
/** Único time do download, sem escolha. */
export const FREE_TEAM = 'sharks';

const KEY = 'gol.unlocked.v1';
const native = Capacitor.isNativePlatform();

export type BuyResult = 'ok' | 'cancel' | 'error';

let unlocked = readFlag();
let price: string | undefined;
/** Motivo da última falha de compra (mostrado junto da mensagem de erro, para diagnóstico). */
let lastError = '';
const listeners = new Set<() => void>();

function readFlag(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function setUnlocked(on: boolean): void {
  const changed = unlocked !== on;
  unlocked = on;
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  if (changed) listeners.forEach((fn) => fn());
}

function owns(purchases: Transaction[]): boolean {
  return purchases.some(
    (p) =>
      p.productIdentifier === PRODUCT_ID &&
      !p.revocationDate &&
      // no Android, "1" = comprado (0/2 = pendente/indefinido)
      (p.purchaseState === undefined || p.purchaseState === '1'),
  );
}

async function checkOwned(): Promise<boolean> {
  const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP, onlyCurrentEntitlements: true });
  return owns(purchases);
}

export const store = {
  /** Na web (navegador/testes) não há loja: a compra é simulada para desenvolvimento. */
  native,

  isUnlocked(): boolean {
    return unlocked;
  },

  /** Preço já formatado na moeda da loja do usuário (ex.: "R$ 14,90"), quando disponível. */
  price(): string | undefined {
    return price;
  },

  /** Motivo técnico da última compra que falhou (ex.: "Product not found"). */
  lastError(): string {
    return lastError;
  },

  onChange(fn: () => void): void {
    listeners.add(fn);
  },

  /** Ao abrir o app: busca o preço e confere se a compra já foi feita (outro aparelho, reinstalação). */
  async init(): Promise<void> {
    if (!native) return;
    try {
      const { isBillingSupported } = await NativePurchases.isBillingSupported();
      if (!isBillingSupported) return;
      const { products } = await NativePurchases.getProducts({ productIdentifiers: [PRODUCT_ID], productType: PURCHASE_TYPE.INAPP });
      price = products.find((p) => p.identifier === PRODUCT_ID)?.priceString;
      if (await checkOwned()) setUnlocked(true);
      listeners.forEach((fn) => fn());
    } catch (e) {
      console.warn('Loja indisponível:', e);
    }
  },

  async buy(): Promise<BuyResult> {
    if (!native) {
      setUnlocked(true);
      return 'ok';
    }
    lastError = '';
    // Se o preço ainda não veio (produto recém-criado na loja), tenta buscar de novo antes de comprar.
    if (!price) await this.init();
    try {
      const tx = await NativePurchases.purchaseProduct({ productIdentifier: PRODUCT_ID, productType: PURCHASE_TYPE.INAPP });
      if (owns([tx]) || (await checkOwned())) {
        setUnlocked(true);
        return 'ok';
      }
      lastError = `state ${tx.purchaseState ?? '?'}`;
      return 'error';
    } catch (e) {
      const raw = String((e as { message?: string })?.message ?? e);
      lastError = raw.slice(0, 80);
      return raw.toLowerCase().includes('cancel') ? 'cancel' : 'error';
    }
  },

  /** Restaura a compra feita com a mesma conta Apple/Google. */
  async restore(): Promise<boolean> {
    if (!native) return unlocked;
    try {
      await NativePurchases.restorePurchases();
      const ok = await checkOwned();
      if (ok) setUnlocked(true);
      return ok;
    } catch {
      return false;
    }
  },
};
