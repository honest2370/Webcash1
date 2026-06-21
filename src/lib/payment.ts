// WebCash Payment Integration using Supabase Edge Functions
// All API calls go through Supabase functions - no CORS issues, keys stay server-side

import { supabase } from './supabase';

// Types
interface CollectResponse {
  success: boolean;
  transaction_id?: string;
  status?: string;
  message?: string;
  error?: string;
  otp_required?: boolean;
  reference?: string;
  price?: { amount: number; currency: string };
}

// Mobile Money Operators by Country — exact names as required by Ashtech Pay's API.
// This is the FALLBACK used only if the live ashtech-countries call fails;
// the live data (fetched below) is always preferred since it can't drift
// out of sync with what Ashtech actually supports.
export const MOBILE_MONEY_OPERATORS: Record<string, string[]> = {
  BJ: ['Moov Money', 'MTN Mobile Money'],
  BF: ['Moov Money', 'Orange Money'],
  CM: ['MTN Mobile Money', 'Orange Money'],
  CF: ['Orange Money'],
  CG: ['Airtel Money', 'MTN Mobile Money'],
  CI: ['Moov Money', 'MTN Mobile Money', 'Orange Money', 'Wave'],
  GA: ['Airtel Money', 'Moov Money'],
  GN: ['MTN Mobile Money', 'Orange Money'],
  GQ: ['Orange Money'],
  GW: ['Orange Money'],
  ML: ['Moov Money', 'Orange Money'],
  NE: ['Airtel Money'],
  CD: ['Afrimoney', 'Airtel Money', 'Orange Money', 'Vodacom M-Pesa'],
  SN: ['Free Money', 'Orange Money', 'Wave'],
  TD: ['Airtel Money', 'Moov Money'],
  TG: ['Flooz (Moov)', 'T-Money'],
};

// Currencies actually used by Ashtech Pay's supported countries.
export const CURRENCIES: Record<string, { code: string; symbol: string; rate: number; name: string }> = {
  XAF: { code: 'XAF', symbol: 'FCFA', rate: 1, name: 'CFA Franc (Central)' },
  XOF: { code: 'XOF', symbol: 'FCFA', rate: 1, name: 'CFA Franc (West)' },
  GNF: { code: 'GNF', symbol: 'FG', rate: 0.06, name: 'Guinean Franc' },
  CDF: { code: 'CDF', symbol: 'FC', rate: 0.33, name: 'Congolese Franc' },
};

// Countries Ashtech Pay actually supports (fallback only — see fetchCountries below).
export const COUNTRIES = [
  { code: 'BJ', name: 'Benin', flag: '🇧🇯', currency: 'XOF', phonePrefix: '+229' },
  { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫', currency: 'XOF', phonePrefix: '+226' },
  { code: 'CM', name: 'Cameroon', flag: '🇨🇲', currency: 'XAF', phonePrefix: '+237' },
  { code: 'CF', name: 'Central African Republic', flag: '🇨🇫', currency: 'XAF', phonePrefix: '+236' },
  { code: 'CG', name: 'Congo', flag: '🇨🇬', currency: 'XAF', phonePrefix: '+242' },
  { code: 'CI', name: 'Ivory Coast', flag: '🇨🇮', currency: 'XOF', phonePrefix: '+225' },
  { code: 'GA', name: 'Gabon', flag: '🇬🇦', currency: 'XAF', phonePrefix: '+241' },
  { code: 'GN', name: 'Guinea', flag: '🇬🇳', currency: 'GNF', phonePrefix: '+224' },
  { code: 'GQ', name: 'Equatorial Guinea', flag: '🇬🇶', currency: 'XAF', phonePrefix: '+240' },
  { code: 'GW', name: 'Guinea-Bissau', flag: '🇬🇼', currency: 'XOF', phonePrefix: '+245' },
  { code: 'ML', name: 'Mali', flag: '🇲🇱', currency: 'XOF', phonePrefix: '+223' },
  { code: 'NE', name: 'Niger', flag: '🇳🇪', currency: 'XOF', phonePrefix: '+227' },
  { code: 'CD', name: 'DR Congo', flag: '🇨🇩', currency: 'CDF', phonePrefix: '+243' },
  { code: 'SN', name: 'Senegal', flag: '🇸🇳', currency: 'XOF', phonePrefix: '+221' },
  { code: 'TD', name: 'Chad', flag: '🇹🇩', currency: 'XAF', phonePrefix: '+235' },
  { code: 'TG', name: 'Togo', flag: '🇹🇬', currency: 'XOF', phonePrefix: '+228' },
];

export const BASE_AMOUNT_XAF = 1800;

// Helper functions
export const convertCurrency = (amountXAF: number, toCurrency: string): number => {
  const currency = CURRENCIES[toCurrency];
  if (!currency) return amountXAF;
  return Math.round(amountXAF * currency.rate * 100) / 100;
};

export const formatPhoneForAPI = (phone: string, countryCode: string): string => {
  const country = COUNTRIES.find(c => c.code === countryCode);
  if (!country) return phone.replace(/\D/g, '');
  
  let cleanPhone = phone.replace(/\D/g, '');
  const prefix = country.phonePrefix.replace('+', '');
  
  if (cleanPhone.startsWith(prefix)) {
    cleanPhone = cleanPhone.substring(prefix.length);
  }
  if (cleanPhone.startsWith('0')) {
    cleanPhone = cleanPhone.substring(1);
  }
  
  return cleanPhone;
};

export const getOperatorsForCountry = (countryCode: string) => MOBILE_MONEY_OPERATORS[countryCode] || [];
export const getCountryInfo = (countryCode: string) => COUNTRIES.find(c => c.code === countryCode);
export const getCurrencyInfo = (currencyCode: string) => CURRENCIES[currencyCode] || CURRENCIES.XAF;

/**
 * Live country + operator list straight from Ashtech Pay, same pattern as
 * Vault/Sellizi. Falls back to the static list above only if this fails,
 * so the UI can never offer a country/operator combo Ashtech will reject.
 */
let _liveCountriesCache: { code: string; name: string; currency: string; operators: string[] }[] | null = null;

export const loadLiveCountries = async () => {
  if (_liveCountriesCache) return _liveCountriesCache;
  const SUPPORTED = ['BJ','BF','CM','CF','CG','CI','GA','GN','GQ','GW','ML','NE','CD','SN','TD','TG'];
  try {
    const { data, error } = await supabase.functions.invoke('ashtech-countries', { method: 'GET' });
    if (error) throw error;
    _liveCountriesCache = Array.isArray(data) ? data.filter((c: any) => SUPPORTED.includes(c.code)) : [];
  } catch {
    _liveCountriesCache = COUNTRIES.map(c => ({
      code: c.code, name: c.name, currency: c.currency, operators: MOBILE_MONEY_OPERATORS[c.code] || [],
    }));
  }
  return _liveCountriesCache;
};

/**
 * Fetch supported countries from Supabase Edge Function
 */
export const fetchCountries = async () => {
  try {
    const { data, error } = await supabase.functions.invoke('ashtech-countries', { method: 'GET' });
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: 'Failed to fetch countries' };
  }
};

/**
 * Fetch transaction fees from Supabase Edge Function
 */
export const fetchFees = async () => {
  try {
    const { data, error } = await supabase.functions.invoke('ashtech-fees', { method: 'GET' });
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: 'Failed to fetch fees' };
  }
};

/**
 * Initiate payment collection via Supabase Edge Function
 */
export const initiateCollect = async (params: {
  phone: string;
  operator: string;
  country_code: string;
  otp?: string;
  reference?: string;
  referrer_id?: string;
}): Promise<CollectResponse> => {
  try {
    const { data, error } = await supabase.functions.invoke('ashtech-collect', {
      body: params
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Payment request failed'
      };
    }

    return {
      success: data.success !== false,
      transaction_id: data.transaction_id,
      status: data.status || 'pending',
      message: data.message || 'Payment request sent. Check your phone.',
      otp_required: data.otp_required,
      reference: data.reference,
      price: data.price
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error'
    };
  }
};

/**
 * Check payment status via Supabase Edge Function
 */
export const checkPaymentStatus = async (params: {
  transaction_id?: string;
  reference?: string;
}): Promise<{
  success: boolean;
  status: string;
  paid: boolean;
  local_status?: string;
  ashtech_status?: string;
}> => {
  try {
    const queryParams = new URLSearchParams();
    if (params.transaction_id) {
      queryParams.set('transaction_id', params.transaction_id);
    }
    if (params.reference) {
      queryParams.set('reference', params.reference);
    }

    const { data, error } = await supabase.functions.invoke(
      `ashtech-status?${queryParams.toString()}`
    );

    if (error) {
      return { success: false, status: 'error', paid: false };
    }

    return {
      success: data.success,
      status: data.local_status || data.ashtech_status || 'unknown',
      paid: data.paid || false,
      local_status: data.local_status,
      ashtech_status: data.ashtech_status
    };
  } catch {
    return { success: false, status: 'unknown', paid: false };
  }
};

/**
 * Generate unique reference
 */
export const generateReference = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `WC-${timestamp}-${random}`.toUpperCase();
};
