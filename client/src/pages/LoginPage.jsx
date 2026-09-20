export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="card p-10 w-full max-w-md text-center">
        <img src="/logo-full.png" alt="KSET" className="h-16 mx-auto mb-6" />
        <h1 className="text-2xl font-bold mb-8">Registar članova KSET-a</h1>
        <a href="/api/auth/google" className="block">
          <button className="btn-primary w-full py-3 text-base">
            Prijava putem Google računa
          </button>
        </a>
      </div>
    </div>
  );
}