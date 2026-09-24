'use client'

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { buscarTicketPorCodigo } from './actions';

// ----------------------------------------------------------------------------------
// 📸 CONSTANTES Y CONTENIDOS CENTRALIZADOS
// ----------------------------------------------------------------------------------

const WHATSAPP_NUMBER = '525546088200';

const RECENT_WORK = [
  {
    id: 1,
    title: "Mantenimiento Integral & Thermal Repaste",
    description: "Limpieza profunda y cambio de pasta térmica en equipos de cómputo.",
    image: "https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?q=80&w=600&auto=format&fit=crop",
    tag: "⚡ Optimización"
  },
  {
    id: 2,
    title: "Upgrade Hardware: SSD y Memoria RAM",
    description: "Instalación de SSD de 1TB y 32GB RAM, triplicando velocidad.",
    image: "https://images.unsplash.com/photo-1591238372338-22d30c883a86?q=80&w=600&auto=format&fit=crop",
    tag: "🚀 Upgrade"
  },
  {
    id: 3,
    title: "Reparación experta de Controles DualSense",
    description: "Solución definitiva al problema de drift en analógicos y limpieza de contactos.",
    image: "https://images.unsplash.com/photo-1567027757540-7b572280fa22?q=80&w=600&auto=format&fit=crop",
    tag: "🎮 Consolas"
  }
];

const TESTIMONIALS = [
  {
    id: 1,
    name: "Camilo Torres",
    device: "PlayStation 5 DualSense",
    text: "Rapidísimo repararon el drift de mis controles de PS5. Servicio súper transparente por WhatsApp. Un trato impecable.",
    rating: 5
  },
  {
    id: 2,
    name: "Sofía Trejo",
    device: "MacBook Pro M1",
    text: "El soporte remoto de Soltecot_ me salvó la vida con la configuración de mi impresora. Cifrado y seguro. Muy recomendados.",
    rating: 5
  },
  {
    id: 3,
    name: "Raúl Mendoza",
    device: "Impresora Brother",
    text: "Mantenimiento de impresión perfecto. Solucionaron el problema de atasco de papel en tiempo récord. Trato formal y directo.",
    rating: 5
  }
];

const SERVICES = [
  {
    id: "mantenimiento_computo",
    title: "Mantenimiento PCs & Laptops",
    description: "Limpieza profunda de componentes, optimización térmica profesional y diagnóstico de hardware experto.",
    icon: (
      <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    whatsapp_cta: `https://wa.me/${WHATSAPP_NUMBER}?text=¡Hola%20Soltecot_!%20Me%20interesa%20el%20Mantenimiento%20para%20mi%20laptop/PC`
  },
  {
    id: "remoto",
    title: "Soporte Técnico Remoto",
    description: "Solución inmediata a problemas de software, configuraciones, virus y asistencia técnica a distancia 100% segura.",
    icon: (
      <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    whatsapp_cta: `https://wa.me/${WHATSAPP_NUMBER}?text=¡Hola%20Soltecot_!%20Necesito%20el%20Soporte%20Remoto%20urgente%20para%20mi%20equipo`
  },
  {
    id: "upgrade",
    title: "Upgrade de Hardware",
    description: "Maximiza la potencia instalando unidades de estado sólido (SSD) de alta velocidad y expansión de memoria RAM de última generación.",
    icon: (
      <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    whatsapp_cta: `https://wa.me/${WHATSAPP_NUMBER}?text=¡Hola%20Soltecot_!%20Me%20interesa%20un%20Upgrade%20de%20Hardware%20para%20mi%20equipo`
  },
  {
    id: "software",
    title: "Instalación de Software",
    description: "Instalación profesional de sistemas operativos, antivirus, paquetería corporativa y configuraciones de red personalizadas.",
    icon: (
      <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    whatsapp_cta: `https://wa.me/${WHATSAPP_NUMBER}?text=¡Hola%20Soltecot_!%20Me%20interesa%20la%20Instalación%20de%20Software/Paquetería`
  },
  {
    id: "mantenimiento_consolas",
    title: "Mantenimiento de Consolas",
    description: "Limpieza avanzada, optimización térmica y reparación experta para tus consolas de videojuegos de todas las generaciones.",
    icon: (
      <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 009 11a13.916 13.916 0 00-3.136-8.442l-.054-.09M21 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 0015 11a13.916 13.916 0 00-3.136-8.442l-.054-.09M9 11h6" />
      </svg>
    ),
    whatsapp_cta: `https://wa.me/${WHATSAPP_NUMBER}?text=¡Hola%20Soltecot_!%20Me%20interesa%20el%20Mantenimiento%20para%20mi%20consola`
  },
  {
    id: "reparacion_controles",
    title: "Reparación de Controles",
    description: "Servicio de limpieza y reparación experta para controles de videojuegos. Solución definitiva al drift de analógicos.",
    icon: (
      <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442a.562.562 0 01.308.975l-4.143 3.633a.563.563 0 00-.172.528l1.1 5.38a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.98 20.53a.562.562 0 01-.84-.61l1.1-5.38a.563.563 0 00-.172-.528L2.925 10.4a.562.562 0 01.308-.975l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    ),
    whatsapp_cta: `https://wa.me/${WHATSAPP_NUMBER}?text=¡Hola%20Soltecot_!%20Me%20interesa%20la%20Reparación%20para%20mi%20control`
  },
  {
    id: "mantenimiento_impresion",
    title: "Equipos de Impresión",
    description: "Mantenimiento integral profundo y reparación experta para tus equipos de impresión y multifuncionales.",
    icon: (
      <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
      </svg>
    ),
    whatsapp_cta: `https://wa.me/${WHATSAPP_NUMBER}?text=¡Hola%20Soltecot_!%20Me%20interesa%20el%20Mantenimiento%20para%20mi%20impresora`
  }
];

const PASOS_ESTADO = [
  { key: 'RECIBIDO', label: 'Recibido' },
  { key: 'EN_DIAGNOSTICO', label: 'Diagnóstico' },
  { key: 'ESPERANDO_APROBACION', label: 'Presupuesto' },
  { key: 'EN_REPARACION', label: 'Reparación' },
  { key: 'LISTO_PARA_ENTREGA', label: '¡Listo!' },
];

export default function Home() {
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [ticketData, setTicketData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const folioUrl = params.get('folio');
      if (folioUrl) {
        setCodigo(folioUrl.toUpperCase());
        ejecutarBusquedaAutomatica(folioUrl.toUpperCase());
      }

      const handleScroll = () => {
        if (window.scrollY > 120) setIsScrolled(true);
        else setIsScrolled(false);
      };

      window.addEventListener('scroll', handleScroll);
      return () => window.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const ejecutarBusquedaAutomatica = async (folioId: string) => {
    setLoading(true);
    setErrorMsg('');
    const res = await buscarTicketPorCodigo(folioId);
    setLoading(false);
    if (res.success) setTicketData(res.data);
  };

  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setTicketData(null);

    if (!codigo.trim()) {
      setErrorMsg('Por favor, escribe un código de orden.');
      return;
    }

    setLoading(true);
    const res = await buscarTicketPorCodigo(codigo.trim().toUpperCase());
    setLoading(false);

    if (res.error) setErrorMsg(res.error);
    else if (res.success) setTicketData(res.data);
  };

  const obtenerIndiceEstado = (currentEstado: string) => {
    if (currentEstado === 'ENTREGADO') return 5;
    if (currentEstado === 'RECHAZADO') return 2;
    return PASOS_ESTADO.findIndex(p => p.key === currentEstado);
  };

  const mapearEstiloEstado = (estado: string) => {
    const estilos: Record<string, string> = {
      'RECIBIDO': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      'EN_DIAGNOSTICO': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      'ESPERANDO_APROBACION': 'bg-orange-500/15 text-orange-400 border-orange-500/30 animate-pulse',
      'EN_REPARACION': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      'LISTO_PARA_ENTREGA': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      'ENTREGADO': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      'RECHAZADO': 'bg-red-500/10 text-red-400 border-red-500/20',
    };
    return estilos[estado] || 'bg-slate-500/10 text-slate-400';
  };

  return (
    <main className="min-h-screen bg-black text-slate-100 flex flex-col items-center p-6 md:p-12 font-sans relative overflow-hidden gap-20 md:gap-28 selection:bg-emerald-500 selection:text-black">

      {/* 🌐 TEXTURA DOT MATRIX */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04] z-0"
        style={{
          backgroundImage: `radial-gradient(circle, #10b981 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      {/* 🔮 AURORAS DE FONDO */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] sm:w-[900px] h-[600px] sm:h-[900px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none mix-blend-screen z-0" />
      <div className="absolute top-[35%] right-[-15%] w-[500px] sm:w-[800px] h-[500px] sm:h-[800px] bg-teal-500/10 rounded-full blur-[150px] pointer-events-none mix-blend-screen z-0" />

      {/* 🛸 NAVBAR STICKY GLASSMORPHIC */}
      <header className={`fixed top-0 left-0 right-0 w-full flex justify-center z-50 transition-all duration-500 ease-in-out px-6 md:px-12 
        ${isScrolled
          ? 'py-3 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/80 shadow-2xl shadow-black/50 translate-y-0 opacity-100'
          : 'py-4 bg-transparent border-b border-transparent -translate-y-4 opacity-0 pointer-events-none'}`}
      >
        <div className="w-full max-w-6xl flex items-center justify-between relative">
          <div className="w-36 hidden sm:block pointer-events-none" />
          <div className="relative h-9 md:h-11 w-44">
            <Image
              src="/logo-soltecot.png"
              alt="Logo Soltecot"
              fill
              className="object-contain"
              priority
            />
          </div>
          <div className="w-36 flex justify-end">
            <span className="text-[10px] sm:text-xs bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-full text-emerald-400 font-semibold tracking-wide shadow-lg">
              Soporte Particular 🧑‍💻
            </span>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="w-full max-w-4xl text-center z-10 pt-10 sm:pt-14 md:pt-16 flex flex-col items-center gap-8">

        {/* LOGO PRINCIPAL */}
        <div className="w-full flex justify-center transition-all duration-500 transform hover:scale-[1.02]">
          <div className="relative w-full max-w-[280px] sm:max-w-[450px] md:max-w-[600px] h-28 sm:h-36 md:h-44 drop-shadow-[0_0_50px_rgba(16,185,129,0.2)]">
            <Image
              src="/logo-soltecot.png"
              alt="Logo Soltecot Principal"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>

        <div className="space-y-6">
          <h1 className="font-bold text-3xl sm:text-5xl md:text-6xl tracking-tight text-white leading-[1.15]">
            Impulsa el rendimiento <br />
            de tu equipo <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-white bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(16,185,129,0.4)]">sin salir de casa</span>
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto font-light leading-relaxed">
            Soporte por software inmediato 100% remoto, o recolección programada a domicilio para mantenimiento físico de hardware.
          </p>
        </div>

        {/* CONTENEDOR DEL BUSCADOR DE RASTREO */}
        <div className="w-full max-w-xl mx-auto p-6 bg-zinc-950/80 backdrop-blur-xl rounded-2xl border border-zinc-800 shadow-2xl shadow-black/80 space-y-4 hover:border-emerald-500/30 transition-all duration-300 group">
          <h3 className="text-sm font-semibold text-left text-zinc-200 flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            Consulta el estado de tu reparación en tiempo real
          </h3>
          <form onSubmit={handleBuscar} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Introduce tu Folio (Ej: SOL-1001)"
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-white placeholder-zinc-600 font-mono uppercase shadow-inner"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold text-sm px-6 py-3 rounded-xl transition-all duration-300 shadow-lg hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] active:scale-95 flex items-center justify-center min-w-[145px]"
            >
              {loading ? 'Buscando...' : 'Rastrear Equipo'}
            </button>
          </form>

          {errorMsg && (
            <p className="text-xs text-rose-400 font-medium text-left bg-rose-500/10 border border-rose-500/20 px-4 py-2.5 rounded-xl">
              ⚠️ {errorMsg}
            </p>
          )}

          <div className="pt-3 border-t border-zinc-900 flex items-center justify-center gap-1.5 text-[10px] text-zinc-500 font-mono tracking-wide">
            <svg className="w-3.5 h-3.5 text-emerald-400/60 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Precios netos con IVA incluido • Facturación CFDI 4.0 autorizada</span>
          </div>
        </div>

        {/* RESULTADO DE LA BÚSQUEDA */}
        {ticketData && (
          <div className="w-full max-w-2xl mx-auto p-6 bg-zinc-950/90 border border-emerald-500/30 rounded-2xl shadow-2xl shadow-black text-left space-y-6 transition-all duration-300 animate-fade-in backdrop-blur-md">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-zinc-900 pb-4">
              <div>
                <span className="text-xs font-mono text-emerald-400 uppercase font-bold tracking-wider">Folio Oficial: {ticketData.numeroOrden}</span>
                <h4 className="font-bold text-xl text-white mt-1">{ticketData.equipo}</h4>
                <p className="text-xs text-zinc-400 mt-0.5">Propietario: <span className="text-zinc-200 font-medium">{ticketData.cliente?.nombre}</span></p>
              </div>
              <span className={`text-[10px] px-3 py-1.5 rounded-full font-mono font-bold tracking-wide uppercase border ${mapearEstiloEstado(ticketData.estado)}`}>
                {ticketData.estado.replace(/_/g, ' ')}
              </span>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Falla Reportada en Recepción</span>
              <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-900 p-3 rounded-xl border border-zinc-800 font-light">
                {ticketData.fallaReportada}
              </p>
            </div>

            {/* PANEL DE PRESUPUESTO */}
            {ticketData.estado === 'ESPERANDO_APROBACION' && ticketData.costoReparacion != null && (
              <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4 space-y-3 shadow-inner">
                <div className="flex justify-between items-center border-b border-amber-500/10 pb-2">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">💼 Presupuesto Técnico Listo</span>
                  <span className="text-base font-black text-white font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">${ticketData.costoReparacion} MXN</span>
                </div>
                {ticketData.notasDiagnostico && (
                  <div className="space-y-1">
                    <span className="text-[9px] text-zinc-500 uppercase font-bold">Nota del Técnico:</span>
                    <p className="text-xs text-zinc-300 font-light italic">"{ticketData.notasDiagnostico}"</p>
                  </div>
                )}
                <p className="text-[10px] text-amber-400/90 leading-relaxed pt-1 bg-amber-500/5 px-2.5 py-2 rounded-lg border border-amber-500/10 font-medium">
                  💡 <strong>¿Cómo autorizar?</strong> Responde al chat de WhatsApp con la palabra <span className="underline font-bold">Aceptar</span> para iniciar la reparación, o <span className="underline font-bold">Rechazar</span> para devolución.
                </p>
              </div>
            )}

            {/* LÍNEA DE TIEMPO INTERACTIVA */}
            <div className="space-y-5 pt-2">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Línea de Progreso en Laboratorio</span>
              <div className="relative flex justify-between items-center w-full px-2">
                <div className="absolute left-0 right-0 top-1/2 h-[2px] bg-zinc-800 -translate-y-1/2 z-0" />

                {PASOS_ESTADO.map((paso, index) => {
                  const indiceActual = obtenerIndiceEstado(ticketData.estado);
                  const estaCompletado = index <= indiceActual;
                  const esElActual = index === indiceActual;

                  return (
                    <div key={paso.key} className="flex flex-col items-center relative z-10 gap-2">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${esElActual
                        ? 'bg-black border-emerald-400 shadow-[0_0_20px_#10b981]'
                        : estaCompletado
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'bg-zinc-900 border-zinc-800'
                        }`}>
                        {estaCompletado && !esElActual && (
                          <span className="text-[10px] text-black font-black">✓</span>
                        )}
                        {esElActual && (
                          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        )}
                      </div>
                      <span className={`text-[10px] font-medium whitespace-nowrap hidden sm:block ${esElActual ? 'text-emerald-400 font-bold' : estaCompletado ? 'text-zinc-300' : 'text-zinc-600'}`}>
                        {paso.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="text-[10px] text-center text-zinc-600 font-mono pt-2 border-t border-zinc-900">
              Última actualización técnica: {new Date(ticketData.updatedAt).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        )}
      </section>

      {/* 🚀 LOGÍSTICA DE ATENCIÓN */}
      <section className="w-full max-w-5xl z-10 space-y-8 bg-zinc-950/60 backdrop-blur-md p-8 rounded-2xl border border-zinc-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="text-center space-y-2">
          <h2 className="font-bold text-xl md:text-2xl text-white tracking-tight">
            ¿Cómo resolvemos tu problema sin que salgas de casa?
          </h2>
          <p className="text-xs text-zinc-400 max-w-xl mx-auto font-light">
            Diseñamos dos canales de atención cómodos y transparentes adaptados a tus tiempos.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
          <div className="p-5 bg-zinc-900/40 rounded-xl border border-zinc-800 space-y-3 hover:border-emerald-500/20 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center font-bold text-emerald-400 text-sm font-mono">
                01
              </div>
              <h4 className="font-semibold text-white text-sm md:text-base">Soporte de Software (Remoto Inmediato)</h4>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed font-light">
              Problemas de lentitud, virus, instalaciones o configuraciones se resuelven de forma remota. Te conectas mediante software cifrado bajo tu estricta supervisión. <strong>Fricción cero.</strong>
            </p>
          </div>

          <div className="p-5 bg-zinc-900/40 rounded-xl border border-zinc-800 space-y-3 hover:border-emerald-500/20 transition-colors relative">
            <span className="absolute top-3 right-3 text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono px-2 py-0.5 rounded-md uppercase font-bold tracking-wide">
              Fines de Semana
            </span>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center font-bold text-emerald-400 text-sm font-mono">
                02
              </div>
              <h4 className="font-semibold text-white text-sm md:text-base">Mantenimiento Físico (Recolección VIP)</h4>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed font-light">
              Para fallas de hardware, consolas o limpieza profunda: agendamos la <strong>recolección en tu domicilio los Sábados y Domingos</strong>. Nos llevamos tu equipo al laboratorio y lo regresamos impecable.
            </p>
          </div>
        </div>
      </section>

      {/* 📸 GALERÍA DE CASOS DE ÉXITO */}
      <section className="w-full max-w-6xl z-10 space-y-8">
        <div className="text-center md:text-left space-y-2">
          <h2 className="font-bold text-2xl md:text-3xl text-white tracking-tight">
            ¿En qué nos especializamos?
          </h2>
          <p className="text-sm text-zinc-400 max-w-xl font-light leading-relaxed">
            Casos reales de hardware complejo resueltos con precisión milimétrica en laboratorio.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {RECENT_WORK.map((work) => (
            <div key={work.id} className="bg-zinc-950/60 backdrop-blur-md border border-zinc-800 rounded-2xl overflow-hidden group hover:border-emerald-500/30 transition-all duration-500 shadow-xl hover:-translate-y-2">
              <div className="h-48 overflow-hidden relative">
                <Image
                  src={work.image}
                  alt={work.title}
                  fill
                  unoptimized
                  className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                />
                <span className="absolute bottom-3 left-3 bg-black/90 text-emerald-400 border border-emerald-500/30 font-mono text-[9px] font-bold px-2.5 py-1 rounded-md uppercase z-20 shadow-md">
                  {work.tag}
                </span>
              </div>
              <div className="p-5 space-y-2">
                <h4 className="font-semibold text-base text-white group-hover:text-emerald-400 transition-colors duration-300">
                  {work.title}
                </h4>
                <p className="text-xs text-zinc-400 font-light leading-relaxed">
                  {work.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 🛠️ BENTO GRID DE SERVICIOS */}
      <section className="w-full max-w-6xl z-10 space-y-12">
        <div className="text-center md:text-left space-y-2">
          <h2 className="font-bold text-2xl md:text-3xl text-white tracking-tight">
            Servicios de Laboratorio
          </h2>
          <p className="text-sm text-zinc-400 max-w-xl font-light leading-relaxed">
            Asistencia profesional directa con triage inteligente y reportes transparentes vía WhatsApp.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {SERVICES.map((service, index) => (
            <div
              key={service.id}
              className={`group relative p-6 bg-zinc-950/80 backdrop-blur-xl rounded-2xl border border-zinc-800 hover:border-emerald-500/40 transition-all duration-500 flex flex-col justify-between gap-6 hover:-translate-y-2 shadow-xl 
              ${index === 1 ? 'md:col-span-2 border-emerald-500/20' : ''}`}
            >
              <div className="space-y-4 relative z-10">
                <div className={`w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black group-hover:scale-110 transition-all duration-500 shadow-inner
                  ${index === 1 ? 'bg-emerald-500 text-black' : ''}`}>
                  {service.icon}
                </div>
                <h3 className="font-semibold text-lg text-white group-hover:text-emerald-400 transition-colors duration-300">
                  {service.title}
                </h3>
                <p className={`text-xs text-zinc-400 font-light leading-relaxed ${index === 1 ? 'text-zinc-300' : ''}`}>
                  {service.description}
                </p>
              </div>

              <a
                href={service.whatsapp_cta}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-semibold text-emerald-400/80 group-hover:text-emerald-400 flex items-center gap-1.5 mt-2 relative z-10 transition-colors duration-300 cursor-pointer w-fit font-mono"
              >
                Consultar soporte técnico
                <span className="transform group-hover:translate-x-1.5 transition-transform duration-300 text-xs">➔</span>
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* 💬 TESTIMONIOS */}
      <section className="w-full max-w-6xl z-10 space-y-8 pb-8">
        <div className="text-center md:text-left space-y-2">
          <h2 className="font-bold text-2xl md:text-3xl text-white tracking-tight">
            Opiniones de Usuarios
          </h2>
          <p className="text-sm text-zinc-400 max-w-xl font-light leading-relaxed">
            La confianza de nuestra comunidad respalda el rigor de nuestro laboratorio técnico.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.id} className="p-6 bg-zinc-950/60 backdrop-blur-md border border-zinc-800 rounded-2xl flex flex-col justify-between gap-5 shadow-xl hover:border-zinc-700 transition-all duration-300 group">
              <div className="space-y-3">
                <div className="flex gap-1 text-amber-400 text-[10px]">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <span key={i} className="group-hover:scale-110 transition-transform duration-300">★</span>
                  ))}
                </div>
                <p className="text-xs text-zinc-300 font-light leading-relaxed italic">
                  "{t.text}"
                </p>
              </div>
              <div className="border-t border-zinc-900 pt-3">
                <h5 className="font-semibold text-sm text-white">{t.name}</h5>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10 mt-1 inline-block">{t.device}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="w-full max-w-6xl text-center border-t border-zinc-900 pt-8 pb-4 z-10 mt-auto">
        <p className="text-xs text-zinc-600 font-light font-mono">
          &copy; {new Date().getFullYear()} SOLTECOT_. Todos los derechos reservados. Solutions & Technology on Time.
        </p>
      </footer>

      {/* 💬 BOTÓN FLOTANTE VIP DE WHATSAPP CON RADAR */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center justify-center">
        <span className="absolute w-full h-full rounded-full bg-[#25D366]/40 animate-ping pointer-events-none" />

        <a
          href={`https://wa.me/${WHATSAPP_NUMBER}?text=¡Hola%20Soltecot_!%20Vengo%20de%20la%20página%20web%20y%20me%20gustaría%20cotizar%20o%20agendar%20una%20reparación.`}
          target="_blank"
          rel="noopener noreferrer"
          className="relative flex items-center gap-2.5 bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold text-xs sm:text-sm px-5 py-3.5 rounded-full shadow-[0_4px_25px_rgba(37,211,102,0.4)] hover:shadow-[0_4px_35px_rgba(37,211,102,0.7)] hover:scale-105 active:scale-95 transition-all duration-300 group select-none border border-white/10"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.713-1.457L0 24zm6.59-4.846c1.66.986 3.288 1.48 4.921 1.481 5.482 0 9.94-4.461 9.943-9.94.002-2.654-1.029-5.148-2.902-7.023C16.73 1.8 14.238.767 11.595.767c-5.485 0-9.946 4.463-9.948 9.943-.001 1.777.49 3.493 1.42 5.04L2.081 21.9l6.236-1.636zM17.513 14.4c-.29-.145-1.722-.85-1.99-.948-.266-.1-.462-.146-.656.146-.196.29-.757.948-.927 1.14-.17.19-.34.21-.63.064-1.127-.566-1.917-1.01-2.69-2.333-.203-.347.203-.322.58-.1.34-.2.373-.03.553-.1.18-.07.09-.145-.045-.29-.136-.29-.462-1.114-.634-1.53-.168-.406-.339-.35-.463-.356-.12-.006-.258-.007-.396-.007-.138 0-.363.05-.554.258-.19.208-.73.713-.73 1.74s.747 2.02.85 2.16c.1.135 1.47 2.246 3.563 3.148.498.215.886.343 1.19.439.5.158.955.135 1.317.08.404-.06 1.722-.703 1.963-1.385.24-.683.24-1.27.168-1.386-.073-.12-.266-.192-.556-.337z" />
          </svg>
          <span>💬 Cotizar o Agendar Reparación por WhatsApp</span>
        </a>
      </div>

    </main>
  );
}