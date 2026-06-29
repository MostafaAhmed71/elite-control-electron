import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

/* ── Toast Context ── */
const ToastContext = createContext(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
};

/* ── Toast Item ── */
const ICONS = {
  success: { icon: CheckCircle2, bg: 'bg-emerald-50', border: 'border-emerald-200', icon_color: 'text-emerald-600', bar: 'bg-emerald-500' },
  error:   { icon: XCircle,      bg: 'bg-rose-50',    border: 'border-rose-200',    icon_color: 'text-rose-600',    bar: 'bg-rose-500' },
  warning: { icon: AlertTriangle, bg: 'bg-amber-50',  border: 'border-amber-200',   icon_color: 'text-amber-600',  bar: 'bg-amber-500' },
  info:    { icon: Info,          bg: 'bg-indigo-50',  border: 'border-indigo-200',  icon_color: 'text-indigo-600', bar: 'bg-indigo-500' },
};

const ToastItem = ({ toast, onRemove }) => {
  const config = ICONS[toast.type] || ICONS.info;
  const Icon = config.icon;

  return (
    <div
      className={`flex items-start gap-4 p-4 pr-5 rounded-2xl border shadow-xl shadow-black/5 backdrop-blur-sm
        ${config.bg} ${config.border}
        animate-in slide-in-from-right-10 fade-in duration-300`}
      style={{ minWidth: 0, width: 'min(100vw - 2rem, 420px)' }}
    >
      {/* Left color bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-r-full ${config.bar}`} style={{ position: 'absolute' }} />

      <div className={`shrink-0 mt-0.5 ${config.icon_color}`}>
        <Icon size={20} />
      </div>

      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="text-sm font-black text-slate-800 leading-tight">{toast.title}</p>
        )}
        {toast.message && (
          <p className={`text-xs font-bold text-slate-500 leading-relaxed ${toast.title ? 'mt-1' : ''}`}>
            {toast.message}
          </p>
        )}
      </div>

      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 p-1 text-slate-300 hover:text-slate-500 rounded-lg hover:bg-white/60 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
};

/* ── Toast Provider ── */
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback(({ type = 'info', title, message, duration = 4000 }) => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    setToasts(prev => [...prev, { id, type, title, message }]);
    if (duration > 0) {
      setTimeout(() => remove(id), duration);
    }
    return id;
  }, [remove]);

  // Convenience helpers
  const toast = {
    success: (message, title)  => show({ type: 'success', title, message }),
    error:   (message, title)  => show({ type: 'error',   title, message, duration: 6000 }),
    warning: (message, title)  => show({ type: 'warning', title, message }),
    info:    (message, title)  => show({ type: 'info',    title, message }),
    show,
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}

      {/* Toast Container */}
      <div
        className="fixed bottom-6 left-6 z-[9999] flex flex-col gap-3"
        dir="rtl"
        aria-live="polite"
        aria-label="إشعارات النظام"
      >
        {toasts.map(t => (
          <div key={t.id} className="relative">
            <ToastItem toast={t} onRemove={remove} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
