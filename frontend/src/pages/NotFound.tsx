import { Link } from 'react-router-dom';

export function NotFoundPage({ title = 'Strani ni mogoče najti', message }: { title?: string; message?: string }) {
  return (
    <div className="system-page system-page-inline">
      <div className="system-card">
        <span className="system-code">404</span>
        <h1>{title}</h1>
        <p>{message ?? 'Povezava je morda zastarela ali pa do te vsebine nimate dostopa.'}</p>
        <div className="row gap-2">
          <Link className="btn btn-primary btn-md" to="/">
            Na nadzorno ploščo
          </Link>
          <Link className="btn btn-ghost btn-md" to="/projects">
            Vsi projekti
          </Link>
        </div>
      </div>
    </div>
  );
}
