import type { FinancingProvider } from '@elsewhere/shared';

export interface FinancingProviderOffer {
  providerName: FinancingProvider;
  months: number;
  aprPercent: number;
  monthlyAmount: number;
}

export interface FinancingProviderCheckoutResult {
  checkoutId: string;
  providerReference: string;
  status: string;
}

export interface FinancingProviderAdapter {
  getOffers(totalAmount: number, travelerCount: number): Promise<FinancingProviderOffer[]>;
  checkout(offerId: string, totalAmount: number, idempotencyKey: string): Promise<FinancingProviderCheckoutResult>;
}

// Mock adapter — returns realistic 0% APR offers from three providers
export class MockFinancingAdapter implements FinancingProviderAdapter {
  async getOffers(totalAmount: number, _travelerCount: number): Promise<FinancingProviderOffer[]> {
    return [
      {
        providerName: 'uplift',
        months: 3,
        aprPercent: 0,
        monthlyAmount: Math.ceil((totalAmount / 3) * 100) / 100,
      },
      {
        providerName: 'klarna',
        months: 6,
        aprPercent: 0,
        monthlyAmount: Math.ceil((totalAmount / 6) * 100) / 100,
      },
      {
        providerName: 'affirm',
        months: 12,
        aprPercent: 0,
        monthlyAmount: Math.ceil((totalAmount / 12) * 100) / 100,
      },
    ];
  }

  async checkout(
    _offerId: string,
    _totalAmount: number,
    idempotencyKey: string,
  ): Promise<FinancingProviderCheckoutResult> {
    return {
      checkoutId: `mock-checkout-${Date.now()}`,
      providerReference: `mock-ref-${idempotencyKey}`,
      status: 'approved',
    };
  }
}

export function getFinancingAdapter(): FinancingProviderAdapter {
  // In production, select adapter based on provider name or environment
  return new MockFinancingAdapter();
}
