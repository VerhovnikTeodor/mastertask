import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth';
import { ApiError } from '../../lib/api';
import { Button, Field, Input } from '../../components/ui';
import { BrandMark } from '../../layout/AppShell';

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-panel">
        <Link to="/" className="brand auth-brand">
          <BrandMark />
          <span>MasterTask</span>
        </Link>
        <div className="auth-form-wrap">
          <h1 className="auth-title">{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>
          {children}
          <p className="auth-footer">{footer}</p>
        </div>
        <p className="auth-legal">Podatki so shranjeni v vaši PostgreSQL bazi. Seja je zaščitena s piškotkom HttpOnly.</p>
      </div>
      <AuthShowcase />
    </div>
  );
}

function AuthShowcase() {
  const columns = [
    { name: 'Za narediti', color: '#8B8D98', cards: [['Raziskava uporabnikov', 'medium', 'Dizajn'], ['Načrt migracije', 'low', '']] },
    { name: 'V teku', color: '#3E63DD', cards: [['Nov proces plačila', 'urgent', 'Funkcionalnost'], ['Mobilni meni', 'high', 'Napaka']] },
    { name: 'Končano', color: '#30A46C', cards: [['Pristajalna stran', 'medium', 'Dizajn']] },
  ];
  return (
    <div className="auth-showcase" aria-hidden="true">
      <div className="showcase-copy">
        <span className="showcase-eyebrow">Projekti · Ekipa · Naloge</span>
        <h2>Jasen pregled nad delom vaše ekipe.</h2>
        <p>Kanban table, roki, obremenjenost članov in aktivnost projektov – posodobljeno v realnem času iz ene baze.</p>
      </div>
      <div className="showcase-board">
        {columns.map((c) => (
          <div key={c.name} className="showcase-col">
            <div className="showcase-col-head">
              <span className="status-dot" style={{ background: c.color }} />
              {c.name}
              <span className="showcase-count">{c.cards.length}</span>
            </div>
            {c.cards.map(([title, prio, label]) => (
              <div key={title} className="showcase-card">
                <span className={`prio prio-${prio} prio-compact`}>
                  <span className="prio-bars"><i /><i /><i /></span>
                </span>
                <strong>{title}</strong>
                {label && <span className="showcase-label">{label}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFields({});
    setLoading(true);
    try {
      await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      setError(err instanceof Error ? err.message : 'Prijava ni uspela.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Dobrodošli nazaj"
      subtitle="Prijavite se za dostop do svojih projektov in nalog."
      footer={
        <>
          Še nimate računa? <Link to="/register">Ustvarite račun</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit} noValidate>
        {error && !Object.keys(fields).length && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <Field label="E-poštni naslov" htmlFor="email" error={fields.email}>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus invalid={Boolean(fields.email)} />
        </Field>
        <Field label="Geslo" htmlFor="password" error={fields.password}>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required invalid={Boolean(fields.password)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={loading}>
          Prijava
        </Button>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const passwordHint =
    form.password.length === 0
      ? 'Vsaj 8 znakov, vsaj ena črka in ena števka.'
      : form.password.length < 8 || !/\d/.test(form.password) || !/[a-zA-ZčšžČŠŽ]/.test(form.password)
        ? 'Geslo še ni dovolj močno.'
        : 'Geslo ustreza zahtevam.';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFields({});
    setLoading(true);
    try {
      await register(form);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      setError(err instanceof Error ? err.message : 'Registracija ni uspela.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Ustvarite račun"
      subtitle="Začnite organizirati projekte in naloge svoje ekipe."
      footer={
        <>
          Že imate račun? <Link to="/login">Prijava</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit} noValidate>
        {error && !Object.keys(fields).length && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <div className="form-grid-2">
          <Field label="Ime" htmlFor="firstName" error={fields.firstName}>
            <Input id="firstName" autoComplete="given-name" value={form.firstName} onChange={set('firstName')} autoFocus invalid={Boolean(fields.firstName)} />
          </Field>
          <Field label="Priimek" htmlFor="lastName" error={fields.lastName}>
            <Input id="lastName" autoComplete="family-name" value={form.lastName} onChange={set('lastName')} invalid={Boolean(fields.lastName)} />
          </Field>
        </div>
        <Field label="E-poštni naslov" htmlFor="email" error={fields.email}>
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} invalid={Boolean(fields.email)} />
        </Field>
        <Field label="Geslo" htmlFor="password" error={fields.password} hint={passwordHint}>
          <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} invalid={Boolean(fields.password)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={loading}>
          Ustvari račun
        </Button>
      </form>
    </AuthLayout>
  );
}
