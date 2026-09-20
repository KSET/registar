export function PageContainer({ title, children, maxWidth = 'max-w-3xl' }) {
  return (
    <div className="px-6 py-8">
      <div className={`${maxWidth} mx-auto`}>
        {title && <h1 className="text-2xl font-semibold mb-6">{title}</h1>}
        {children}
      </div>
    </div>
  );
}

export function Card({ title, children, className = '' }) {
  return (
    <div className={`card p-6 mb-6 ${className}`}>
      {title && <h2 className="text-lg font-semibold mb-4">{title}</h2>}
      {children}
    </div>
  );
}

export function Alert({ kind = 'info', children }) {
  const styles = {
    info: 'bg-surface-overlay border-surface-border text-content-secondary',
    error: 'bg-state-error/10 border-state-error/40 text-state-error',
    success: 'bg-state-success/10 border-state-success/40 text-state-success',
  };
  return (
    <div className={`border rounded-md px-4 py-3 text-sm mb-4 ${styles[kind]}`}>
      {children}
    </div>
  );
}

export function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="card p-6 w-full max-w-sm">
        {title && <h3 className="text-lg font-semibold mb-2">{title}</h3>}
        <p className="text-content-secondary text-sm mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary">Odustani</button>
          <button onClick={onConfirm} className="btn-primary">Potvrdi</button>
        </div>
      </div>
    </div>
  );
}
