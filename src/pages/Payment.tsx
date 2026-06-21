import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import {
  initiateCollect,
  checkPaymentStatus,
  loadLiveCountries,
  convertCurrency,
  formatPhoneForAPI,
  getCurrencyInfo,
  BASE_AMOUNT_XAF,
  COUNTRIES
} from '../lib/payment';
import { Button, Input, Card, Badge } from '../components/ui';
import {
  Wallet,
  ArrowLeft,
  ChevronRight,
  CheckCircle,
  Loader2,
  AlertCircle,
  Phone,
  CreditCard,
  Shield,
  KeyRound
} from 'lucide-react';

type LiveCountry = { code: string; name: string; currency: string; operators: string[] };

export const Payment: React.FC = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useApp();

  const [step, setStep] = useState<'country' | 'operator' | 'phone' | 'otp' | 'processing' | 'success' | 'error'>('country');
  const [countries, setCountries] = useState<LiveCountry[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedOperator, setSelectedOperator] = useState(''); // exact operator name, e.g. "MTN Mobile Money"
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [price, setPrice] = useState<{ amount: number; currency: string } | null>(null);

  const countryObj = countries.find(c => c.code === selectedCountry);
  const operators = countryObj?.operators || [];
  const currencyCode = countryObj?.currency || 'XAF';
  const amount = convertCurrency(BASE_AMOUNT_XAF, currencyCode);
  const currency = getCurrencyInfo(currencyCode);

  useEffect(() => {
    loadLiveCountries().then((data) => {
      setCountries(data);
      setLoadingCountries(false);
      if (user?.country && data.some(c => c.code === user.country)) {
        setSelectedCountry(user.country);
        setStep('operator');
      }
    });
  }, [user]);

  // Poll for payment status during processing
  useEffect(() => {
    if (step === 'processing' && transactionRef) {
      const pollInterval = setInterval(async () => {
        const result = await checkPaymentStatus({ reference: transactionRef });
        if (result.paid) {
          clearInterval(pollInterval);
          setStep('success');
          refreshUser();
        }
      }, 5000);
      return () => clearInterval(pollInterval);
    }
  }, [step, transactionRef, refreshUser]);

  const handlePayment = async () => {
    if (!phone || !selectedOperator || !selectedCountry) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formattedPhone = formatPhoneForAPI(phone, selectedCountry);
      
      const result = await initiateCollect({
        phone: formattedPhone,
        operator: selectedOperator, // exact name, e.g. "MTN Mobile Money" — required by Ashtech
        country_code: selectedCountry
      });

      if (result.success) {
        setTransactionRef(result.reference || '');
        setPrice(result.price || null);
        
        if (result.otp_required) {
          setStep('otp');
        } else {
          setStep('processing');
        }
      } else {
        setError(result.error || 'Payment failed');
      }
    } catch (err) {
      setError('Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async () => {
    if (!otp) {
      setError('Please enter the OTP sent to your phone');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await initiateCollect({
        phone: formatPhoneForAPI(phone, selectedCountry),
        operator: selectedOperator,
        country_code: selectedCountry,
        otp,
        reference: transactionRef
      });

      if (result.success) {
        setStep('processing');
      } else {
        setError(result.error || 'OTP verification failed');
      }
    } catch {
      setError('OTP verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setError('');
    switch (step) {
      case 'operator': setStep('country'); break;
      case 'phone': setStep('operator'); break;
      case 'otp': setStep('phone'); break;
      case 'error': setStep('phone'); break;
      default: navigate(-1);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#0a0a0f] border-b border-[#1e1e2d]">
        <div className="flex items-center gap-4 p-4">
          <button onClick={goBack} className="p-2 -ml-2 hover:bg-[#1e1e2d] rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-white">Complete Payment</h1>
            <p className="text-xs text-gray-400">
              {['country', 'operator', 'phone'].includes(step) && `Step ${['country', 'operator', 'phone'].indexOf(step) + 1} of 3`}
              {step === 'otp' && 'Verify OTP'}
              {step === 'processing' && 'Processing'}
              {step === 'success' && 'Success'}
              {step === 'error' && 'Error'}
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto p-4">
          {/* Amount Card */}
          {['country', 'operator', 'phone'].includes(step) && (
            <Card className="mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Subscription Fee</p>
                    <p className="text-white font-medium">30 Days Access</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-white">{currency?.symbol}{amount}</p>
                  <p className="text-gray-400 text-sm">{currencyCode}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Step Content */}
          {step === 'country' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Select Country</h2>
              {loadingCountries ? (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
                </div>
              ) : (
                <div className="space-y-2">
                  {countries.map((country) => {
                    const meta = COUNTRIES.find(c => c.code === country.code);
                    return (
                      <button
                        key={country.code}
                        onClick={() => { setSelectedCountry(country.code); setStep('operator'); }}
                        className="w-full flex items-center justify-between p-4 bg-[#0d0d12] border border-[#1e1e2d] rounded-xl hover:border-indigo-500/30 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{meta?.flag || '🌍'}</span>
                          <div className="text-left">
                            <span className="text-white font-medium">{country.name}</span>
                            <p className="text-gray-500 text-xs">{meta?.phonePrefix || ''}</p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 'operator' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Select Payment Method</h2>
              {operators.length > 0 ? (
                <div className="space-y-2">
                  {operators.map((operatorName) => (
                    <button
                      key={operatorName}
                      onClick={() => { setSelectedOperator(operatorName); setStep('phone'); }}
                      className="w-full flex items-center justify-between p-4 bg-[#0d0d12] border border-[#1e1e2d] rounded-xl hover:border-indigo-500/30 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-yellow-500 rounded-xl flex items-center justify-center">
                          <Wallet className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-white font-medium">{operatorName}</span>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
                  <p className="text-gray-400">No payment methods for this country</p>
                  <Button variant="outline" onClick={() => setStep('country')} className="mt-4">
                    Select Another Country
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === 'phone' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white mb-2">Enter Phone Number</h2>
                <p className="text-gray-400 text-sm">
                  Payment via {selectedOperator}
                </p>
              </div>

              <div className="flex gap-2">
                <div className="bg-[#1e1e2d] border border-[#2a2a3d] rounded-xl px-4 py-3 flex items-center">
                  <span className="text-gray-400">{COUNTRIES.find(c => c.code === selectedCountry)?.phonePrefix}</span>
                </div>
                <Input
                  type="tel"
                  placeholder="Enter phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  icon={<Phone className="w-5 h-5" />}
                  className="flex-1"
                />
              </div>

              <div className="bg-[#1e1e2d] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-indigo-400" />
                  <span className="text-indigo-400 text-sm font-medium">How it works</span>
                </div>
                <ol className="text-gray-400 text-sm space-y-1 list-decimal list-inside">
                  <li>Click "Pay Now" below</li>
                  <li>Receive a prompt on your phone</li>
                  <li>Enter your PIN to confirm</li>
                  <li>Wait for confirmation</li>
                </ol>
              </div>

              <Button
                onClick={handlePayment}
                className="w-full"
                size="lg"
                loading={loading}
                disabled={!phone || phone.length < 8}
              >
                Pay {currency?.symbol}{amount}
              </Button>
            </div>
          )}

          {step === 'otp' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <KeyRound className="w-8 h-8 text-indigo-400" />
                </div>
                <h2 className="text-lg font-semibold text-white mb-2">Enter OTP</h2>
                <p className="text-gray-400 text-sm">
                  Enter the OTP sent to your phone
                </p>
              </div>

              <Input
                type="text"
                placeholder="Enter OTP code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                icon={<KeyRound className="w-5 h-5" />}
              />

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('phone')} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleOtpSubmit} loading={loading} disabled={otp.length < 4} className="flex-1">
                  Verify OTP
                </Button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Processing Payment</h2>
              <p className="text-gray-400 mb-4">Check your phone for the payment prompt</p>
              <p className="text-gray-500 text-sm mb-4">Enter your PIN to complete</p>
              <Badge variant="info">Do not close this page</Badge>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Payment Successful</h2>
              <p className="text-gray-400 mb-4">Your subscription is now active for 30 days</p>
              {price && (
                <p className="text-sm text-gray-500 mb-2">Amount: {price.currency} {price.amount}</p>
              )}
              <p className="text-xs text-gray-500 mb-6">Ref: {transactionRef}</p>
              <Button onClick={() => navigate('/dashboard')} size="lg">
                Go to Dashboard
              </Button>
            </div>
          )}

          {step === 'error' && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Payment Failed</h2>
              <p className="text-gray-400 mb-6">{error}</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('phone')} className="flex-1">
                  Try Again
                </Button>
                <Button onClick={() => navigate('/support')} className="flex-1">
                  Contact Support
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
