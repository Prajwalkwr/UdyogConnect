import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import Swal from 'sweetalert2';

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const orderId = searchParams.get('orderId');
    if (!sessionId || !orderId) {
      Swal.fire({ icon: 'error', text: 'Missing payment information.' });
      navigate('/checkout');
      return;
    }

    (async () => {
      try {
        const resp = await api.post('/api/payment/verify-session', { sessionId, orderId });
        if (resp.data && resp.data.paid) {
          Swal.fire({ icon: 'success', title: 'Payment successful', text: 'Your payment was confirmed.' });
          localStorage.removeItem('cart');
          navigate('/customer');
          return;
        }
        Swal.fire({ icon: 'error', text: 'Payment verification failed.' });
        navigate('/checkout');
      } catch (e) {
        Swal.fire({ icon: 'error', text: 'Payment verification error.' });
        navigate('/checkout');
      } finally {
        setLoading(false);
      }
    })();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h3 className="text-lg font-bold">{loading ? 'Verifying payment...' : 'Redirecting...'}</h3>
      </div>
    </div>
  );
}
