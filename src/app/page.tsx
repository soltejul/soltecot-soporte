'use client' // Le dice a Next.js que esta página tendrá interactividad de React (estados, eventos, etc.)

import { useState } from 'react';
import { buscarTicketPorCodigo } from './actions';
import Chatbot from '../components/Chatbot';

const SERVICES = [
  {
    id: "mantenimiento",
    title: "Mantenimiento Avanzado",
    description: "Limpieza profunda, optimización térmica y reparación experta para tus equipos de cómputo, laptops y consolas de videojuegos.",
    icon: (
      <svg className="w-6 h-6 text-soltecot-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: "upgrade",
    title: "Upgrade de Hardware",
    description: "Maximiza la potencia instalando unidades de estado sólido (SSD) de alta velocidad, expansión de memoria RAM y componentes de última generación.",
    icon: (
      <svg className="w-6 h-6 text-soltecot-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: "software",
    title: "Sistemas y Software",
    description: "Instalación y configuración de sistemas operativos, paqueterías oficiales, optimización de rendimiento y eliminación garantizada de malware.",
    icon: (
      <svg className="w-6 h-6 text-soltecot-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: "remoto",
    title: "Soporte Remoto",
    description: "Solución inmediata a problemas de software, configuraciones de red y asistencia técnica a distancia con conexiones cifradas y seguras.",
    icon: (
      <svg className="w-6 h-6 text-soltecot-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9h18" />
      </svg>
    ),
  },
];

const PASOS_ESTADO = [
  { key: 'RECIBIDO', label: 'Recibido' },
  { key: 'EN_DIAGNOSTICO', label: 'En Diagnóstico' },
  { key: 'ESPERANDO_APROBACION', label: 'Presupuesto' },
  { key: 'EN_REPARACION', label: 'En Reparación' },
  { key: 'LISTO_PARA_ENTREGA', label: '¡Listo!' },
];

export default function Home() {
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [ticketData, setTicketData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setTicketData(null);

    if (!codigo.trim()) {
      setErrorMsg('Por favor, escribe un código de orden.');
      return;
    }

    setLoading(true);
    const res = await buscarTicketPorCodigo(codigo);
    setLoading(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else if (res.success) {
      setTicketData(res.data);
    }
  };

  const obtenerIndiceEstado = (currentEstado: string) => {
    if (currentEstado === 'ENTREGADO') return 5;
    return PASOS_ESTADO.findIndex(p => p.key === currentEstado);
  };

  return (
    <main className="min-h-screen bg-soltecot-dark text-slate-100 flex flex-col items-center p-6 md:p-12 font-montserrat relative overflow-hidden gap-16 md:gap-24">

      {/* Efectos de iluminación sutiles de fondo */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-soltecot-cyan/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-[30%] right-[-20%] w-[500px] h-[500px] bg-soltecot-cyan/5 rounded-full blur-[120px] pointer-events-none" />

      {/* NAVBAR */}
      <header className="w-full max-w-6xl flex justify-between items-center z-10">
        <div className="flex flex-col">
          <span className="font-poppins font-extrabold text-2xl tracking-wider text-white">
            SOLTECOT<span className="text-soltecot-cyan">_</span>
          </span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-soltecot-cyan font-semibold">
            Solutions & Technology on Time
          </span>
        </div>
        <span className="text-xs bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-slate-400 font-medium">
          Soporte Oficial
        </span>
      </header>

      {/* HERO SECTION & FORMULARIO */}
      <section className="w-full max-w-4xl text-center space-y-12 z-10">
        <div className="space-y-6">
          <h1 className="font-poppins font-black text-4xl sm:text-6xl tracking-tight text-white leading-tight">
            Impulsa el rendimiento <br />
            de tu equipo con <span className="text-soltecot-cyan bg-gradient-to-r from-soltecot-cyan to-teal-300 bg-clip-text text-transparent">Soporte Premium</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto font-light leading-relaxed">
            Atención personalizada diseñada para optimizar tus procesos, reducir costos y elevar tu productividad en PC, Laptops y Consolas.
          </p>
        </div>

        {/* CONTENEDOR DEL BUSCADOR */}
        <div className="max-w-lg mx-auto p-6 bg-soltecot-darker/60 backdrop-blur-md rounded-2xl border border-white/5 shadow-2xl space-y-4">
          <h3 className="text-sm font-semibold text-left text-slate-300 font-poppins">
            ¿Tienes un equipo en nuestro laboratorio?
          </h3>
          <form onSubmit={handleBuscar} className="flex gap-2">
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Ej: SOL-1001"
              className="flex-1 bg-soltecot-dark border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-soltecot-cyan transition-colors text-white placeholder-slate-600 font-mono uppercase"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-soltecot-cyan hover:bg-[#4bcbc0] disabled:bg-slate-700 disabled:text-slate-400 text-soltecot-dark font-poppins font-bold text-sm px-5 py-3 rounded-xl transition-all duration-200 shadow-lg shadow-soltecot-cyan/20 active:scale-95 flex items-center justify-center min-w-[120px]"
            >
              {loading ? 'Buscando...' : 'Buscar Estatus'}
            </button>
          </form>

          {/* MENSAJE DE ERROR */}
          {errorMsg && (
            <p className="text-xs text-red-400 font-medium text-left bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl animate-pulse">
              ⚠️ {errorMsg}
            </p>
          )}
        </div>

        {/* RESULTADO DE LA BÚSQUEDA */}
        {ticketData && (
          <div className="max-w-2xl mx-auto p-6 bg-soltecot-darker border border-soltecot-cyan/20 rounded-2xl shadow-2xl text-left space-y-6 transition-all duration-300">
            <div className="flex justify-between items-start border-b border-white/5 pb-4">
              <div>
                <span className="text-xs font-mono text-soltecot-cyan uppercase font-semibold tracking-wider">Orden {ticketData.numeroOrden}</span>
                <h4 className="font-poppins font-bold text-xl text-white mt-1">{ticketData.equipo}</h4>
                <p className="text-xs text-slate-400 mt-1">Cliente: <span className="text-slate-200 font-medium">{ticketData.cliente.nombre}</span></p>
              </div>
              <span className="text-[11px] bg-soltecot-cyan/10 text-soltecot-cyan px-3 py-1 rounded-full font-mono font-bold tracking-wide uppercase border border-soltecot-cyan/20">
                {ticketData.estado.replace('_', ' ')}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold font-poppins">Diagnóstico de Ingreso</span>
              <p className="text-xs text-slate-300 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5">
                {ticketData.fallaReportada}
              </p>
            </div>

            {/* LÍNEA DE TIEMPO INTERACTIVA */}
            <div className="space-y-4 pt-2">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold font-poppins">Progreso de Reparación</span>
              <div className="relative flex justify-between items-center w-full px-2">
                <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-white/10 -translate-y-1/2 z-0" />

                {PASOS_ESTADO.map((paso, index) => {
                  const indiceActual = obtenerIndiceEstado(ticketData.estado);
                  const estaCompletado = index <= indiceActual;
                  const esElActual = index === indiceActual;

                  return (
                    <div key={paso.key} className="flex flex-col items-center relative z-10 gap-2">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${esElActual
                        ? 'bg-soltecot-dark border-soltecot-cyan shadow-[0_0_12px_#5cddcf]'
                        : estaCompletado
                          ? 'bg-soltecot-cyan border-soltecot-cyan'
                          : 'bg-soltecot-darker border-white/20'
                        }`}>
                        {estaCompletado && !esElActual && (
                          <span className="text-[9px] text-soltecot-dark font-bold">✓</span>
                        )}
                        {esElActual && (
                          <div className="w-2 h-2 rounded-full bg-soltecot-cyan animate-ping" />
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
          </div>
        )}
      </section>

      {/* SECCIÓN DE SERVICIOS (GRID) */}
      <section className="w-full max-w-6xl z-10 space-y-12 pb-16">
        <div className="text-center md:text-left space-y-2">
          <h2 className="font-poppins font-bold text-2xl md:text-3xl text-white tracking-tight">
            Soluciones Especializadas
          </h2>
          <p className="text-sm text-slate-400 max-w-xl font-light">
            Infraestructura tecnológica y soporte técnico con estándares de alta fidelidad.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {SERVICES.map((service) => (
            <div
              key={service.id}
              className="group relative p-6 bg-soltecot-darker/40 backdrop-blur-sm rounded-2xl border border-white/5 hover:border-soltecot-cyan/30 transition-all duration-300 flex flex-col justify-between gap-6 hover:-translate-y-1 shadow-xl"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-soltecot-cyan/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl pointer-events-none" />

              <div className="space-y-4 relative z-10">
                <div className="w-12 h-12 rounded-xl bg-soltecot-cyan/10 border border-soltecot-cyan/20 flex items-center justify-center group-hover:bg-soltecot-cyan group-hover:text-soltecot-dark transition-all duration-300 shadow-inner">
                  {service.icon}
                </div>
                <h3 className="font-poppins font-semibold text-lg text-white group-hover:text-soltecot-cyan transition-colors duration-200">
                  {service.title}
                </h3>
                <p className="text-xs text-slate-400 font-light leading-relaxed">
                  {service.description}
                </p>
              </div>

              <div className="text-[11px] font-poppins font-medium text-soltecot-cyan/60 group-hover:text-soltecot-cyan flex items-center gap-1 mt-2 relative z-10 transition-colors duration-200">
                Saber más
                <span className="transform group-hover:translate-x-1 transition-transform duration-200">➔</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="w-full max-w-6xl text-center border-t border-white/5 pt-8 pb-4 z-10 mt-auto">
        <p className="text-xs text-slate-500">
          &copy; {new Date().getFullYear()} Soltecot. Todos los derechos reservados.
        </p>
      </footer>

      {/* AGENTE DE INTELIGENCIA ARTIFICIAL (CONECTADO Y COMPILADO) */}
      <Chatbot />
    </main>
  );
}