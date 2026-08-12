import React, { useState, useEffect } from 'react';
import { FiPackage, FiTruck, FiMapPin, FiCheckCircle, FiClock } from 'react-icons/fi';
import Swal from 'sweetalert2';
import api from '../utils/api';

export default function RiderDashboard({ user, lang }) {
  const [availableDeliveries, setAvailableDeliveries] = useState([]);
  const [myDeliveries, setMyDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('available'); // 'available' | 'claimed'

  // Completion Form State
  const [activeCompletingOrder, setActiveCompletingOrder] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [deliveryProofText, setDeliveryProofText] = useState('');

  const translate = (enText, neText) => {
    return lang === 'en' ? enText : neText;
  };

  useEffect(() => {
    if (user) {
      fetchRiderData();
    }
  }, [user]);

  const fetchRiderData = async () => {
    setLoading(true);
    try {
      // Fetch pending prepared orders that need delivery assignment
      const pendingRes = await api.get('/api/delivery/pending');
      setAvailableDeliveries(pendingRes.data);

      // Fetch rider's claimed deliveries
      const allOrdersRes = await api.get('/api/orders');
      const claimed = allOrdersRes.data.filter((o) => o.deliveryRiderId === user._id && o.status === 'dispatched');
      setMyDeliveries(claimed);

      setLoading(false);
    } catch (e) {
      console.log(e);
      setLoading(false);
    }
  };

  const handleClaimDelivery = async (orderId) => {
    try {
      await api.put(`/api/delivery/${orderId}/assign`, {}, {});
      Swal.fire({
        icon: 'success',
        title: translate('Delivery Claimed', 'डेलिभरी स्वीकार भयो'),
        text: translate('Assigned! Navigate details in Claimed tab.', 'डेलिभरी दावी सफल भयो। विवरण दावी गरिएको ट्याबमा हेर्नुहोस्।'),
      });
      fetchRiderData();
    } catch (e) {
      Swal.fire({ icon: 'error', text: 'Failed to claim delivery task.' });
    }
  };

  const handleCompleteDelivery = async (e) => {
    e.preventDefault();
    if (!otpInput) return;

    try {
      await api.put(
        `/api/delivery/${activeCompletingOrder._id}/complete`,
        { otp: otpInput, proof: deliveryProofText || 'OTP Confirmed Delivery' }
      );

      Swal.fire({
        icon: 'success',
        title: translate('Delivery Completed', 'डेलिभरी सम्पन्न भयो'),
        text: 'OTP verified successfully. Transaction closed.',
      });

      setOtpInput('');
      setDeliveryProofText('');
      setActiveCompletingOrder(null);
      fetchRiderData();
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: translate('Invalid OTP Code', 'गलत OTP कोड'),
        text: err.response?.data?.message || 'OTP verification failed.',
      });
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400 mx-auto"></div>
        <p className="mt-3 text-sm">{translate('Accessing courier portal...', 'ड्यासबोर्ड खोल्दैछ...')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 text-left">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-black text-white sm:text-3xl">{translate('Courier Delivery Board', 'डेलिभरी ड्यासबोर्ड')}</h2>
          <p className="text-xs text-slate-400 mt-1">{translate('Accept prepared local assignments and verify deliveries with customer OTP.', 'अर्डरहरू डेलिभर गर्नुहोस् र OTP रुजु गरी काम फत्ते गर्नुहोस्')}</p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-6 lg:flex-row">
        {/* Sidebar Tabs */}
        <aside className="w-full lg:w-64 space-y-1.5 flex-shrink-0">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/10 p-2 space-y-1">
            {[
              { key: 'available', label: `${translate('Available Deliveries', 'डेलिभरीका लागि उपलब्ध अर्डर')} (${availableDeliveries.length})`, icon: <FiPackage /> },
              { key: 'claimed', label: `${translate('My Active Tasks', 'मेरा सक्रिय डेलिभरीहरू')} (${myDeliveries.length})`, icon: <FiTruck /> },
            ].map((menu) => (
              <button
                key={menu.key}
                onClick={() => {
                  setActiveTab(menu.key);
                  setActiveCompletingOrder(null);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                  activeTab === menu.key
                    ? 'bg-amber-400/10 text-amber-300 border border-amber-400/20'
                    : 'text-slate-450 hover:bg-slate-900/60 hover:text-white'
                }`}
              >
                {menu.icon}
                <span>{menu.label}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Details Pane */}
        <main className="flex-1 space-y-4">
          {/* Active completing overlay drawer */}
          {activeCompletingOrder && (
            <form onSubmit={handleCompleteDelivery} className="rounded-[32px] border border-amber-400/20 bg-slate-905 p-5 space-y-4 animate-fade-in">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">{translate('Confirm Order Handover', 'अर्डर हस्तान्तरण रुजु')}</span>
                <button type="button" onClick={() => setActiveCompletingOrder(null)} className="text-xs text-rose-400">{translate('Cancel', 'रद्द गर्नुहोस्')}</button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-550">Delivery Address</span>
                  <p className="text-sm font-bold text-slate-200">{activeCompletingOrder.deliveryAddress.address}</p>
                  <p className="text-xs text-slate-400 mt-1">{activeCompletingOrder.deliveryAddress.name} • {activeCompletingOrder.deliveryAddress.phone}</p>
                </div>
                <div className="space-y-2">
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-550">
                    {translate('Enter Customer OTP (4-digits)', 'ग्राहकको OTP हाल्नुहोस्')}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1234"
                    maxLength="4"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-center font-mono text-lg font-bold tracking-widest text-white outline-none focus:border-amber-400"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-550">Delivery Signature Proof / Text Note</label>
                <input
                  type="text"
                  placeholder="e.g. Handed over to customer directly."
                  value={deliveryProofText}
                  onChange={(e) => setDeliveryProofText(e.target.value)}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-white outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/10"
              >
                Verify OTP & Complete Delivery
              </button>
            </form>
          )}

          {/* TAB A: Available deliveries list */}
          {activeTab === 'available' && !activeCompletingOrder && (
            <div className="space-y-3">
              <h3 className="text-lg font-extrabold text-white">{translate('Ready for Courier Dispatch', 'डेलिभरीका लागि तयारी सामान')}</h3>
              
              {availableDeliveries.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">
                  No pending prepared orders awaiting pickup.
                </div>
              ) : (
                availableDeliveries.map((d) => (
                  <div key={d._id} className="rounded-3xl border border-slate-850 bg-slate-900/30 p-4 flex flex-col justify-between sm:flex-row sm:items-center">
                    <div>
                      <span className="text-xs font-bold text-white font-mono">{d._id}</span>
                      <p className="text-xs text-slate-350 mt-1 flex items-center gap-1">
                        <FiMapPin className="text-rose-400" />
                        <span>Pickup: Lalitpur / Kathmandu (Vendor Shop)</span>
                      </p>
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        <FiMapPin className="text-emerald-400" />
                        <span>Delivery: {d.deliveryAddress.address}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => handleClaimDelivery(d._id)}
                      className="mt-4 sm:mt-0 rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300"
                    >
                      Accept Job
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB B: claimed active delivery tasks */}
          {activeTab === 'claimed' && !activeCompletingOrder && (
            <div className="space-y-3">
              <h3 className="text-lg font-extrabold text-white">{translate('Active Claimed Route Targets', 'मेरा डेलिभरी कामहरू')}</h3>
              
              {myDeliveries.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">
                  You have no active claimed deliveries in transit.
                </div>
              ) : (
                myDeliveries.map((d) => (
                  <div key={d._id} className="rounded-3xl border border-slate-850 bg-slate-900/30 p-4 space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-850">
                      <div>
                        <span className="text-xs font-bold text-white font-mono">{d._id}</span>
                        <p className="text-[10px] text-slate-400 mt-0.5">Contact Customer: {d.deliveryAddress.name} ({d.deliveryAddress.phone})</p>
                      </div>
                      <span className="rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-[9px] font-bold text-cyan-300 uppercase tracking-wider">
                        In Transit
                      </span>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-550">Delivery Route Directions</span>
                        <p className="text-xs text-slate-300">Target Address: **{d.deliveryAddress.address}**</p>
                        <p className="text-[10px] text-slate-450 leading-relaxed">Route calculation: Kathmandu center to Ring road to target destination.</p>
                      </div>

                      {/* Direction map mockup */}
                      <div className="relative h-20 w-full rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center">
                        {/* Map Grid mock grid */}
                        <div className="absolute inset-0 grid grid-cols-4 grid-rows-2 opacity-5">
                          {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="border border-white" />
                          ))}
                        </div>
                        {/* Direction path */}
                        <svg className="absolute inset-0 h-full w-full stroke-cyan-400 fill-none stroke-[2]" viewBox="0 0 100 50">
                          <path d="M10,25 C40,5 60,45 90,25" />
                        </svg>
                        <div className="absolute left-[10px] top-[21px] text-xs">🏪</div>
                        <div className="absolute right-[10px] top-[21px] text-xs">🏠</div>
                        <div className="absolute left-[40px] top-[14px] text-lg animate-bounce">🛵</div>
                      </div>
                    </div>

                    <button
                      onClick={() => setActiveCompletingOrder(d)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                    >
                      <FiCheckCircle />
                      <span>Complete Delivery (Input Customer OTP)</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
