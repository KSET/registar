import { useEffect, useState } from 'react';
import { authHeaders } from '../api/auth';
import { PageContainer, Alert } from '../components/ui';
import PieChart from '../components/PieChart';
import { MEMBERSHIP_LEVEL_OPTIONS, DIET_TYPE_OPTIONS } from '../constants';

const MEMBERSHIP_LABELS = Object.fromEntries(MEMBERSHIP_LEVEL_OPTIONS.map((o) => [o.value, o.label]));
const DIET_LABELS = Object.fromEntries(DIET_TYPE_OPTIONS.map((o) => [o.value, o.label]));
const SHIRT_SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

// Card colours: narančasti (orange) = PUNOPRAVNO, plavi (blue) = PRIDRUZENO.
const MEMBERSHIP_COLORS = {
  PRIDRUZENO: '#3987e5', // blue
  PUNOPRAVNO: '#d95926', // orange
  POCASNO: '#199e70',
  STARO: '#c98500',
};

function relabel(data, labels) {
  return data.map((d) => ({ ...d, label: labels[d.label] || d.label }));
}

function orderBy(data, order) {
  return [...data].sort((a, b) => {
    const ia = order.indexOf(a.label);
    const ib = order.indexOf(b.label);
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
  });
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/members/stats', { headers: authHeaders() });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Greška pri dohvaćanju statistike.');
        }
        const data = await res.json();
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Mrežna greška.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <PageContainer title="Nadzorna ploča" maxWidth="max-w-6xl">
        <Alert kind="error">{error}</Alert>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Nadzorna ploča" maxWidth="max-w-6xl">
      {stats && (
        <p className="text-sm text-content-secondary mb-4">
          Ukupno aktivnih članova: <span className="text-content-primary font-semibold">{stats.total}</span>
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <PieChart
          title="Broj aktivnih članova po sekcijama"
          data={stats?.bySection || []}
          loading={loading}
          maxSlices={Infinity}
        />
        <PieChart
          title="Broj aktivnih članova po fakultetu"
          data={stats?.byFaculty || []}
          loading={loading}
        />
        <PieChart
          title="Raspodjela veličina majica"
          data={stats ? orderBy(stats.byShirtSize, SHIRT_SIZE_ORDER) : []}
          loading={loading}
        />
        <PieChart
          title="Broj aktivnih članova po timovima"
          data={stats?.byTeam || []}
          loading={loading}
        />
        <PieChart
          title="Broj aktivnih članova po iskaznici"
          data={stats ? relabel(stats.byMembershipLevel, MEMBERSHIP_LABELS) : []}
          colorFor={(label) => {
            const entry = Object.entries(MEMBERSHIP_LABELS).find(([, l]) => l === label);
            return (entry && MEMBERSHIP_COLORS[entry[0]]) || undefined;
          }}
          loading={loading}
        />
        <PieChart
          title="Broj narančastih po fakultetu"
          data={stats?.byFacultyPunopravno || []}
          loading={loading}
        />
        <PieChart
          title="Broj plavih po fakultetu"
          data={stats?.byFacultyPridruzeno || []}
          loading={loading}
        />
        <PieChart
          title="Članovi po prehrani"
          data={stats ? relabel(stats.byDiet, DIET_LABELS) : []}
          loading={loading}
        />
      </div>
    </PageContainer>
  );
}
