import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wifi, CheckCircle2, AlertCircle, ArrowRight, Loader2, Lock, Smartphone, ShieldCheck, Headphones, Download, Table, Users, Search, RefreshCw, LogOut, Key, X } from 'lucide-react';
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom';
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

interface RegistrationRecord {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  mac_address: string;
  ap_mac: string;
  ssid: string;
  registered_at: string;
}

// --- Login Page Component ---
function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Falha no login');
      }

      navigate('/admin');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-[32px] shadow-2xl p-10 border border-slate-100"
      >
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
          <Lock className="text-white w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-center mb-2">Acesso Restrito</h1>
        <p className="text-slate-500 text-center mb-8 text-sm">Entre com suas credenciais de administrador</p>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Usuário</label>
            <input 
              required
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Senha</label>
            <input 
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none"
            />
          </div>

          {error && (
            <div className="p-3.5 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-600 font-medium">{error}</p>
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ENTRAR NO PAINEL'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// --- Admin Page Component ---
function AdminPage() {
  const [registrations, setRegistrations] = useState<RegistrationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isChangePassOpen, setIsChangePassOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);
  const navigate = useNavigate();

  const fetchRegistrations = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/registrations');
      if (response.status === 401) {
        navigate('/login');
        return;
      }
      if (!response.ok) throw new Error('Falha ao carregar registros');
      const data = await response.json();
      setRegistrations(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistrations();
  }, []);

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    navigate('/login');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPass(true);
    try {
      const response = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Falha ao alterar senha');
      }

      setIsChangePassOpen(false);
      setNewPassword('');
      alert('Senha alterada com sucesso!');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setChangingPass(false);
    }
  };

  const exportToCSV = () => {
    if (registrations.length === 0) return;

    const headers = ['ID', 'Nome', 'Email', 'Telefone', 'MAC Cliente', 'MAC AP', 'SSID', 'Data Registro'];
    const rows = registrations.map(r => [
      r.id,
      r.full_name,
      r.email,
      r.phone_number,
      r.mac_address,
      r.ap_mac,
      r.ssid,
      new Date(r.registered_at).toLocaleString('pt-BR')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `registros_wifi_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredRegistrations = registrations.filter(r => 
    r.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.mac_address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 px-8 py-6 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl">
              <Users className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Painel Administrativo</h1>
              <p className="text-slate-500 text-sm">Gerencie os cadastros do portal cativo</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={fetchRegistrations}
              className="p-2.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
              title="Atualizar"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button 
              onClick={() => setIsChangePassOpen(true)}
              className="p-2.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
              title="Alterar Senha"
            >
              <Key className="w-5 h-5" />
            </button>
            <button 
              onClick={handleLogout}
              className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
              title="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
            <button 
              onClick={exportToCSV}
              disabled={registrations.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-100 ml-2"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-10">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text"
                placeholder="Buscar por nome, email ou MAC..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none text-sm"
              />
            </div>
            <div className="text-sm text-slate-500 font-medium">
              Total: <span className="text-slate-900">{filteredRegistrations.length}</span> registros
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Data</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Nome</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Email</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Telefone</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">MAC</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">SSID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={6} className="px-6 py-8"><div className="h-4 bg-slate-100 rounded w-full"></div></td>
                    </tr>
                  ))
                ) : filteredRegistrations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center text-slate-400 italic">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredRegistrations.map((reg) => (
                    <tr key={reg.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">
                        {new Date(reg.registered_at).toLocaleDateString('pt-BR')}
                        <span className="block text-[10px] opacity-60">{new Date(reg.registered_at).toLocaleTimeString('pt-BR')}</span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-900">{reg.full_name}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{reg.email}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{reg.phone_number}</td>
                      <td className="px-6 py-4 text-sm font-mono text-slate-400 text-xs uppercase">{reg.mac_address}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{reg.ssid}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Change Password Modal */}
      <AnimatePresence>
        {isChangePassOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsChangePassOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl p-8 border border-slate-100"
            >
              <button 
                onClick={() => setIsChangePassOpen(false)}
                className="absolute right-6 top-6 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-6">
                <Key className="text-blue-600 w-6 h-6" />
              </div>
              
              <h2 className="text-xl font-bold mb-2">Alterar Senha</h2>
              <p className="text-slate-500 text-sm mb-6">Defina uma nova senha para o acesso administrativo.</p>
              
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nova Senha</label>
                  <input 
                    required
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none"
                  />
                </div>
                
                <button 
                  type="submit"
                  disabled={changingPass}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-100 flex items-center justify-center gap-2 mt-2"
                >
                  {changingPass ? <Loader2 className="w-5 h-5 animate-spin" /> : 'SALVAR NOVA SENHA'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Portal Component (Original Home) ---
function Portal() {
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
      // Call Backend API to register AND authorize in UniFi
      // We move registration to the server because the client might not have 
      // internet access to reach Supabase directly while in the captive portal.
      const response = await fetch('/api/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          macAddress: params.id || 'unknown',
          fullName: formData.fullName,
          email: formData.email,
          phoneNumber: formData.phoneNumber,
          apMac: params.ap || 'unknown',
          ssid: params.ssid || 'unknown',
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Portal />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
