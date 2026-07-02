'use client'

import { useState, useEffect } from 'react';
import { buscarTicketPorCodigo } from './actions';
import Chatbot from '../components/Chatbot';

// ----------------------------------------------------------------------------------
// 📸 CONSTANTES DE CONTENIDO (MANTENER AQUÍ PARA FACILITAR ACTUALIZACIONES)
// ----------------------------------------------------------------------------------

// 📹 GALERÍA DE CASOS DE ÉXITO RECIENTES (Adecuado a servicios para particulares)
const RECENT_WORK = [
  {
    id: 1,
    title: "Mantenimiento Integral & Thermal Repaste",
    description: "Limpieza profunda y cambio de pasta térmica en laptop gaming, reduciendo 25°C.",
    image: "https://images.unsplash.com/photo-1616440347437-b1c73416efc2?q=80&w=600&auto=format&fit=crop", // Cambia por tu archivo real
    tag: "Optimización"
  },
  {
    id: 2,
    title: "Upgrade Hardware: SSD y Memoria RAM",
    description: "Instalación de SSD de 1TB y 32GB RAM en MacBook Air, triplicando velocidad.",
    image: "https://images.unsplash.com/photo-1591405351990-4726e331f141?q=80&w=600&auto=format&fit=crop", // Cambia por tu archivo real
    tag: "Upgrade"
  },
  {
    id: 3,
    title: "Reparaciónexperta de Controles DualSense",
    description: "Solución definitiva al problema de drift en analógicos y limpieza de contactos.",
    image: "https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?q=80&w=600&auto=format&fit=crop", // Cambia por tu archivo real
    tag: "Consolas"
  }
];

// 💬 TESTIMONIOS (Enfocados a experiencias de particulares)
const TESTIMONIALS = [
  {
    id: 1,
    name: "Camilo Torres",
    device: "Asus TUF Gaming",
    text: "En dos horas repararon el drift de mis controles de PS5. Servicio súper transparente por WhatsApp. Un trato impecable.",
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

// 🛠️ LOS 7 SERVICIOS PARA PARTICULARES CON ENLACES A WHATSAPP
const SERVICES = [
  {
    id: "mantenimiento_computo",
    title: "Mantenimiento PCs & Laptops",
    description: "Limpieza profunda de componentes, optimización térmica profesional y diagnóstico de hardware experto.",
    icon: (
      <svg className="w-6 h-6 text-soltecot-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    whatsapp_cta: "https://wa.me/525546088200?text=¡Hola%20Soltecot_!%20Me%20interesa%20el%20Mantenimiento%20para%20mi%20laptop/PC"
  },
  {
    id: "remoto",
    title: "Soporte Técnico Remoto",
    description: "Solución inmediata a problemas de software, configuraciones, virus y asistencia técnica a distancia 100% segura.",
    icon: (
      <svg className="w-6 h-6 text-soltecot-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9h18" />
      </svg>
    ),
    whatsapp_cta: "https://wa.me/525546088200?text=¡Hola%20Soltecot_!%20Necesito%20el%20Soporte%20Remoto%20urgente%20para%20mi%20equipo"
  },
  {
    id: "upgrade",
    title: "Upgrade de Hardware",
    description: "Maximiza la potencia instalando unidades de estado sólido (SSD) de alta velocidad y expansión de memoria RAM de última generación.",
    icon: (
      <svg className="w-6 h-6 text-soltecot-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    whatsapp_cta: "https://wa.me/525546088200?text=¡Hola%20Soltecot_!%20Me%20interesa%20un%20Upgrade%20de%20Hardware%20para%20mi%20equipo"
  },
  {
    id: "software",
    title: "Instalación de Software",
    description: "Instalación profesional de sistemas operativos, antivirus, paquetería corporativa y configuraciones de red personalizadas.",
    icon: (
      <svg className="w-6 h-6 text-soltecot-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    whatsapp_cta: "https://wa.me/525546088200?text=¡Hola%20Soltecot_!%20Me%20interesa%20la%20Instalación%20de%20Software/Paquetería"
  },
  {
    id: "mantenimiento_consolas",
    title: "Mantenimiento de Consolas",
    description: "Limpieza avanzada, optimización térmica y reparación experta para tus consolas de videojuegos de todas las generaciones.",
    icon: (
      <svg className="w-6 h-6 text-soltecot-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      </svg>
    ),
    whatsapp_cta: "https://wa.me/525546088200?text=¡Hola%20Soltecot_!%20Me%20interesa%20el%20Mantenimiento%20para%20mi%20consola"
  },
  {
    id: "reparacion_controles",
    title: "Reparación de Controles",
    description: "Servicio de limpieza y reparaciónexperta para controles de videojuegos. Solución definitiva al drift de analógicos.",
    icon: (
      <svg className="w-6 h-6 text-soltecot-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    whatsapp_cta: "https://wa.me/525546088200?text=¡Hola%20Soltecot_!%20Me%20interesa%20la%20Reparación%20para%20mi%20control"
  },
  {
    id: "mantenimiento_impresion",
    title: "Equipos de Impresión",
    description: "Mantenimiento integral profundo y reparaciónexperta para tus equipos de impresión y multifuncionales.",
    icon: (
      <svg className="w-6 h-6 text-soltecot-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 12h-1.586a1 1 0 01-.707-.293l-5.414-5.414a1 1 0 01-.293-.707V19a2 2 0 01-2 2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V12a2 2 0 012 2H19z" />
      </svg>
    ),
    whatsapp_cta: "https://wa.me/525546088200?text=¡Hola%20Soltecot_!%20Me%20interesa%20el%20Mantenimiento%20para%20mi%20impresora"
  }
];

// ----------------------------------------------------------------------------------
// 🧩 COMPONENTE DE LA PÁGINA (ESTRUCTURA DE RASTREO CONSERVADA)
// ----------------------------------------------------------------------------------

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

  // Lógica de búsqueda automática por URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const folioUrl = params.get('folio');
      if (folioUrl) {
        setCodigo(folioUrl.toUpperCase());
        ejecutarBusquedaAutomatica(folioUrl.toUpperCase());
      }
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

    if (res.error) {
      setErrorMsg(res.error);
    } else if (res.success) {
      setTicketData(res.data);
    }
  };

  // Mapeo de estilos y estados (CONSERVADO)
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
      'EN_REPARACION': 'bg-soltecot-cyan/10 text-soltecot-cyan border-soltecot-cyan/20',
      'LISTO_PARA_ENTREGA': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      'ENTREGADO': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      'RECHAZADO': 'bg-red-500/10 text-red-400 border-red-500/20',
    };
    return estilos[estado] || 'bg-slate-500/10 text-slate-400';
  };

  return (
    <main className="min-h-screen bg-soltecot-dark text-slate-100 flex flex-col items-center p-6 md:p-12 font-montserrat relative overflow-hidden gap-20 md:gap-28">

      {/* Efectos de iluminación sutiles de fondo (Motor UI) */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-soltecot-cyan/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-[30%] right-[-20%] w-[500px] h-[500px] bg-soltecot-cyan/5 rounded-full blur-[120px] pointer-events-none" />

      {/* NAVBAR CON SOPORTE PARA LOGOTIPO (Conservado y pulido) */}
      <header className="w-full max-w-6xl flex justify-between items-center z-10 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          {/* Reemplaza este SVG por tu <img src="/logo.png" /> */}
          <div className="w-10 h-10 bg-gradient-to-br from-soltecot-cyan to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-soltecot-cyan/20 border border-white/10">
            <svg className="w-5 h-5 text-soltecot-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 5h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="font-poppins font-extrabold text-2xl tracking-wider text-white leading-none">
              SOLTECOT<span className="text-soltecot-cyan">_</span>
            </span>
            <span className="text-[9px] uppercase tracking-[0.2em] text-soltecot-cyan font-bold mt-1">
              Solutions & Technology on Time
            </span>
          </div>
        </div>
        <span className="text-xs bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-slate-400 font-medium hidden sm:inline-block">
          Atención a Particulares 🧑‍💻
        </span>
      </header>

      {/* HERO SECTION & FORMULARIO DE RASTREO (Pulido al millón) */}
      <section className="w-full max-w-4xl text-center space-y-12 z-10 mt-10 md:mt-16">
        <div className="space-y-6">
          <h1 className="font-poppins font-black text-4xl sm:text-6xl tracking-tight text-white leading-tight">
            Impulsa el rendimiento <br />
            de tu equipo <span className="bg-gradient-to-r from-soltecot-cyan via-teal-200 to-white bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(92,221,207,0.35)]">sin salir de casa</span>
          </h1>
          <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto font-light leading-relaxed">
            Especialistas en mantenimiento integral. Actualización de PCs y laptops. Consolas de videojuegos y controles. Soporte técnico remoto y transparente.
          </p>
        </div>

        {/* CONTENEDOR DEL BUSCADOR (SOFT UI) */}
        <div className="max-w-lg mx-auto p-6 bg-soltecot-darker/60 backdrop-blur-md rounded-2xl border border-white/5 shadow-2xl shadow-soltecot-darker/50 space-y-4 hover:border-soltecot-cyan/10 transition-colors">
          <h3 className="text-sm font-semibold text-left text-slate-300 font-poppins flex items-center gap-2">
            🎯 Consulta el estado de tu reparación en tiempo real
          </h3>
          <form onSubmit={handleBuscar} className="flex gap-2">
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Introduce tu Folio (Ej: SOL-1001)"
              className="flex-1 bg-soltecot-dark border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-soltecot-cyan transition-colors text-white placeholder-slate-600 font-mono uppercase shadow-inner"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-soltecot-cyan hover:bg-[#4bcbc0] disabled:bg-slate-700 disabled:text-slate-400 text-soltecot-dark font-poppins font-bold text-sm px-5 py-3 rounded-xl transition-all duration-200 shadow-lg shadow-soltecot-cyan/20 active:scale-95 flex items-center justify-center min-w-[120px]"
            >
              {loading ? 'Buscando...' : 'Rastrear Equipo'}
            </button>
          </form>

          {errorMsg && (
            <p className="text-xs text-red-400 font-medium text-left bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl">
              ⚠️ {errorMsg}
            </p>
          )}
        </div>

        {/* RESULTADO DE LA BÚSQUEDA (CONSERVADO INTACTO) */}
        {ticketData && (
          <div className="max-w-2xl mx-auto p-6 bg-soltecot-darker border border-white/5 rounded-2xl shadow-2xl text-left space-y-6 transition-all duration-300 animate-fade-in shadow-soltecot-darker/50">
            <div className="flex justify-between items-start border-b border-white/5 pb-4">
              <div>
                <span className="text-xs font-mono text-soltecot-cyan uppercase font-semibold tracking-wider">Folio Oficial: {ticketData.numeroOrden}</span>
                <h4 className="font-poppins font-bold text-xl text-white mt-1">{ticketData.equipo}</h4>
                <p className="text-xs text-slate-400 mt-0.5">Propietario: <span className="text-slate-200 font-medium">{ticketData.cliente.nombre}</span></p>
              </div>
              <span className={`text-[10px] px-3 py-1 rounded-full font-mono font-bold tracking-wide uppercase border ${mapearEstiloEstado(ticketData.estado)}`}>
                {ticketData.estado.replace('_', ' ')}
              </span>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold font-poppins">Falla Reportada en Recepción</span>
              <p className="text-xs text-slate-300 leading-relaxed bg-soltecot-dark p-3 rounded-xl border border-white/5 font-light">
                {ticketData.fallaReportada}
              </p>
            </div>

            {/* PANEL DE PRESUPUESTO (CONSERVADO INTACTO) */}
            {ticketData.estado === 'ESPERANDO_APROBACION' && ticketData.costoReparacion && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3 shadow-inner">
                <div className="flex justify-between items-center border-b border-amber-500/10 pb-2">
                  <span className="text-xs font-bold text-amber-400 font-poppins uppercase tracking-wider">💼 Presupuesto Técnico Listo</span>
                  <span className="text-base font-black text-white font-mono">${ticketData.costoReparacion} MXN</span>
                </div>
                {ticketData.notasDiagnostico && (
                  <div className="space-y-1">
                    <span className="text-[9px] text-zinc-500 uppercase font-bold">Nota Técnica del Ingeniero:</span>
                    <p className="text-xs text-slate-300 font-light italic">"{ticketData.notasDiagnostico}"</p>
                  </div>
                )}
                <p className="text-[10px] text-amber-400/80 leading-relaxed pt-1 bg-amber-500/5 px-2.5 py-2 rounded-lg border border-amber-500/10 font-medium">
                  💡 *¿Cómo autorizar?* Por favor, abre el chat de WhatsApp con nuestro laboratorio y responde con la palabra *Aceptar* para iniciar la instalación de refacciones, o *Rechazar* para preparar su devolución.
                </p>
              </div>
            )}

            {/* LÍNEA DE TIEMPO INTERACTIVA (CONSERVADO INTACTO) */}
            <div className="space-y-5 pt-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold font-poppins">Línea de Progreso en Laboratorio</span>
              <div className="relative flex justify-between items-center w-full px-2">
                <div className="absolute left-0 right-0 top-1/2 h-[2px] bg-white/5 -translate-y-1/2 z-0" />

                {PASOS_ESTADO.map((paso, index) => {
                  const indiceActual = obtenerIndiceEstado(ticketData.estado);
                  const estaCompletado = index <= indiceActual;
                  const esElActual = index === indiceActual;

                  return (
                    <div key={paso.key} className="flex flex-col items-center relative z-10 gap-2">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${esElActual
                        ? 'bg-soltecot-dark border-soltecot-cyan shadow-[0_0_15px_#5cddcf]'
                        : estaCompletado
                          ? 'bg-soltecot-cyan border-soltecot-cyan'
                          : 'bg-soltecot-darker border-white/10'
                        }`}>
                        {estaCompletado && !esElActual && (
                          <span className="text-[9px] text-soltecot-dark font-bold">✓</span>
                        )}
                        {esElActual && (
                          <div className="w-1.5 h-1.5 rounded-full bg-soltecot-cyan animate-ping" />
                        )}
                      </div>
                      <span className={`text-[10px] font-medium font-poppins whitespace-nowrap hidden sm:block ${esElActual ? 'text-soltecot-cyan font-bold' : estaCompletado ? 'text-slate-300' : 'text-slate-600'
                        }`}>
                        {paso.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="text-[10px] text-center text-slate-600 font-mono pt-2 border-t border-white/5">
              Última actualización técnica: {new Date(ticketData.updatedAt).toLocaleString('es-MX')}
            </div>
          </div>
        )}
      </section>

      {/* 📸 SECCIÓN: GALERÍA DE CASOS DE ÉXITO RECIENTES (Pulida) */}
      <section className="w-full max-w-6xl z-10 space-y-8">
        <div className="text-center md:text-left space-y-2">
          <h2 className="font-poppins font-bold text-2xl md:text-3xl text-white tracking-tight">
            Evidencia de Laboratorio
          </h2>
          <p className="text-sm text-slate-400 max-w-xl font-light leading-relaxed">
            Casos reales de mantenimiento y upgrade avanzados solucionados en nuestros bancos de trabajo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {RECENT_WORK.map((work) => (
            <div key={work.id} className="bg-soltecot-darker/60 border border-white/5 rounded-2xl overflow-hidden group hover:border-soltecot-cyan/30 transition-all duration-300 shadow-xl hover:-translate-y-1">
              <div className="h-48 overflow-hidden relative">
                {/* Capa de tinte cyan al pasar el mouse */}
                <div className="absolute inset-0 bg-soltecot-cyan/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none" />
                <img
                  src={work.image}
                  alt={work.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <span className="absolute bottom-3 left-3 bg-soltecot-dark/80 text-soltecot-cyan border border-soltecot-cyan/30 font-mono text-[9px] font-bold px-2 py-0.5 rounded-md uppercase z-20">
                  {work.tag}
                </span>
              </div>
              <div className="p-5 space-y-2">
                <h4 className="font-poppins font-semibold text-base text-white group-hover:text-soltecot-cyan transition-colors">
                  {work.title}
                </h4>
                <p className="text-xs text-slate-400 font-light leading-relaxed">
                  {work.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 🛠️ NUEVA SECCIÓN: BENTO BOX GRID DE SERVICIOS (EL CAMBIO CLAVE) */}
      <section className="w-full max-w-6xl z-10 space-y-12">
        <div className="text-center md:text-left space-y-2">
          <h2 className="font-poppins font-bold text-2xl md:text-3xl text-white tracking-tight">
            Servicios para tu Hogar
          </h2>
          <p className="text-sm text-slate-400 max-w-xl font-light leading-relaxed">
            Soluciones expertas y formalidad para tus equipos del día a día, con triage inteligente por WhatsApp.
          </p>
        </div>

        {/* 🧱 BENTO GRID LAYOUT */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {SERVICES.map((service, index) => (
            <div
              key={service.id}
              className={`group relative p-6 bg-soltecot-darker/40 backdrop-blur-sm rounded-2xl border border-white/5 hover:border-soltecot-cyan/30 transition-all duration-300 flex flex-col justify-between gap-6 hover:-translate-y-1 shadow-xl hover:shadow-soltecot-cyan/5 
              ${index === 1 ? 'md:col-span-2 border-soltecot-cyan/20 shadow-soltecot-cyan/10' : ''}`} // Mantenimiento Computo y Soporte Remoto resaltados
            >
              <div className="absolute inset-0 bg-gradient-to-b from-soltecot-cyan/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl pointer-events-none" />

              {/* Contenido superior de la tarjeta */}
              <div className="space-y-4 relative z-10">
                <div className={`w-12 h-12 rounded-xl bg-soltecot-cyan/10 border border-soltecot-cyan/20 flex items-center justify-center group-hover:bg-soltecot-cyan group-hover:text-soltecot-dark transition-all duration-300 shadow-inner
                  ${index === 1 ? 'bg-soltecot-cyan text-soltecot-dark shadow-soltecot-cyan/30' : ''}`}>
                  {service.icon}
                </div>
                <h3 className="font-poppins font-semibold text-lg text-white group-hover:text-soltecot-cyan transition-colors duration-200">
                  {service.title}
                </h3>
                <p className={`text-xs text-slate-400 font-light leading-relaxed ${index === 1 ? 'text-slate-300' : ''}`}>
                  {service.description}
                </p>
              </div>

              {/* Botón de Conversión CTA a WhatsApp */}
              <a
                href={service.whatsapp_cta}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-poppins font-medium text-soltecot-cyan/60 group-hover:text-soltecot-cyan flex items-center gap-1.5 mt-2 relative z-10 transition-colors duration-200 cursor-pointer w-fit"
              >
                Consultar soporte técnico
                <span className="transform group-hover:translate-x-1 transition-transform duration-200 text-xs">➔</span>
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* 💬 SECCIÓN: TESTIMONIOS (Pulida) */}
      <section className="w-full max-w-6xl z-10 space-y-8 pb-8">
        <div className="text-center md:text-left space-y-2">
          <h2 className="font-poppins font-bold text-2xl md:text-3xl text-white tracking-tight">
            Opiniones de Usuarios
          </h2>
          <p className="text-sm text-slate-400 max-w-xl font-light leading-relaxed">
            La confianza de nuestros clientes particulares respalda la formalidad de nuestro laboratorio.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.id} className="p-6 bg-soltecot-darker/30 backdrop-blur-sm border border-white/5 rounded-2xl flex flex-col justify-between gap-4 shadow-xl hover:border-white/10 transition-colors shadow-soltecot-darker/50">
              <div className="space-y-3">
                {/* Estrellas doradas minimalistas */}
                <div className="flex gap-1 text-amber-400 text-xs">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <span key={i}>★</span>
                  ))}
                </div>
                <p className="text-xs text-slate-300 font-light leading-relaxed italic shadow-inner">
                  "{t.text}"
                </p>
              </div>
              <div className="border-t border-white/5 pt-3 mt-1">
                <h5 className="font-poppins font-semibold text-sm text-white">{t.name}</h5>
                <span className="text-[10px] font-mono text-soltecot-cyan">{t.device}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="w-full max-w-6xl text-center border-t border-white/5 pt-8 pb-4 z-10 mt-auto">
        <p className="text-xs text-slate-500 font-light">
          &copy; {new Date().getFullYear()} SOLTECOT_. Todos los derechos reservados. Solutions & Technology on Time.
        </p>
      </footer>

      <Chatbot />
    </main>
  );
}