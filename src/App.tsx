import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wifi, CheckCircle2, AlertCircle, ArrowRight, Loader2, Lock, Smartphone, ShieldCheck, Headphones } from 'lucide-react';
import { supabase } from './supabase';

// Types
interface RegistrationData {
  fullName: string;
  email: string;
  phoneNumber: string;
}

interface PortalParams {
  id: string | null; // MAC Address
  ap: string | null; // AP MAC
  ssid: string | null;
  url: string | null; // Original URL
}

export default function App() {
  const [params, setParams] = useState<PortalParams>({ id: null, ap: null, ssid: null, url: null });
  const [formData, setFormData] = useState<RegistrationData>({ fullName: '', email: '', phoneNumber: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Parse URL parameters from UniFi redirect
    const urlParams = new URLSearchParams(window.location.search);
    setParams({
      id: urlParams.get('id'),
      ap: urlParams.get('ap'),
      ssid: urlParams.get('ssid'),
      url: urlParams.get('url'),
    });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Save to Supabase
      const { error: supabaseError } = await supabase
        .from('registrations')
        .insert([
          {
            full_name: formData.fullName,
            email: formData.email,
            phone_number: formData.phoneNumber,
            mac_address: params.id || 'unknown',
            ap_mac: params.ap || 'unknown',
            ssid: params.ssid || 'unknown',
          }
        ]);

      if (supabaseError) throw new Error(supabaseError.message);

      // 2. Call Backend API to authorize in UniFi
      const response = await fetch('/api/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          macAddress: params.id || 'unknown',
          minutes: 60, // Default 1 hour
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao autorizar no UniFi');
      }

      setIsSuccess(true);
      
      // Redirect after success if original URL exists
      if (params.url) {
        setTimeout(() => {
          window.location.href = params.url!;
        }, 3000);
      }
    } catch (err: any) {
      console.error('Registration Error:', err);
      setError(err.message || 'Ocorreu um erro inesperado. Por favor, tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10 text-center border border-slate-100"
        >
          <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
            <CheckCircle2 className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4">Conectado!</h1>
          <p className="text-slate-600 mb-8 leading-relaxed">
            Seu acesso de alta velocidade está ativo. Você será redirecionado em breve para o seu destino.
          </p>
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 mb-6">
            <p className="text-blue-700 text-sm font-medium">Sessão ativa por 60 minutos</p>
          </div>
          <button 
            onClick={() => window.location.href = params.url || 'https://google.com'}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-md active:scale-95"
          >
            Ir para a Web
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Wifi className="text-white w-5 h-5" />
          </div>
          <span className="font-bold text-lg tracking-tight">Wi-Fi Grátis</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full border border-blue-100">
          <Lock className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Protegendo...</span>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-6 py-8">
        {/* Hero Section */}
        <section className="mb-10">
          <p className="text-blue-600 font-bold text-xs uppercase tracking-widest mb-3">Conectividade Premium</p>
          <h1 className="text-[42px] leading-[1.1] font-bold tracking-tight mb-6">
            Experimente <span className="text-blue-600">Acesso</span> Ilimitado.
          </h1>
          <p className="text-slate-500 text-lg leading-relaxed">
            Junte-se à nossa rede de alta velocidade. O cadastro é rápido, seguro e garante conectividade imediata pronta para 5G.
          </p>
        </section>

        {/* Speed Badge */}
        <div className="bg-slate-100/80 rounded-2xl p-5 flex items-center gap-5 mb-10 border border-slate-200/50">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
            <Smartphone className="text-white w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Velocidades Gigabit</h3>
            <p className="text-slate-500 text-sm">Otimizado para streaming e chamadas de vídeo.</p>
          </div>
        </div>

        {/* Registration Form */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-white rounded-[32px] shadow-2xl shadow-slate-200/60 p-8 border border-slate-100 mb-10"
        >
          <h2 className="text-2xl font-bold mb-8">Cadastro de Rede</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
              <input 
                required
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleInputChange}
                placeholder="Alex Rivers"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Endereço de E-mail</label>
              <input 
                required
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="alex.rivers@modernui.com"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Número de Telefone</label>
              <input 
                required
                type="tel"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                placeholder="+55 (11) 00000-0000"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none"
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-600 font-medium leading-tight">{error}</p>
              </div>
            )}

            <button 
              type="submit"
              disabled={isSubmitting}
              className="w-full py-5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-200 active:scale-95 mt-4"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  CADASTRAR E CONECTAR
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-[10px] text-slate-400 mt-8 leading-relaxed">
            Ao conectar, você concorda com nossos <span className="text-blue-600 font-medium cursor-pointer">Termos de Serviço</span> e <span className="text-blue-600 font-medium cursor-pointer">Política de Privacidade</span>.
          </p>
        </motion.div>
      </main>

      {/* Bottom Nav */}
      <nav className="bg-white border-t border-slate-100 px-6 py-4 flex items-center justify-around sticky bottom-0 z-50">
        <button className="flex flex-col items-center gap-1 text-blue-600">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Smartphone className="text-white w-5 h-5" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest">Acesso</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-slate-400">
          <ShieldCheck className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Termos</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-slate-400">
          <Headphones className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Ajuda</span>
        </button>
      </nav>
    </div>
  );
}
