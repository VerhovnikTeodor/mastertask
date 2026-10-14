import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminUpdateUser, useTeam } from '../../api/hooks';
import { useCurrentUser } from '../../context/auth';
import { useFeedback } from '../../context/feedback';
import { PageHeader, StatCard } from '../../components/common';
import { Menu } from '../../components/overlays';
import { Avatar, Badge, Checkbox, EmptyState, ErrorBlock, IconButton, Input, Segmented, Skeleton } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { fullName, timeAgo } from '../../lib/format';
import { useDebounced } from '../../lib/useDebounced';
import type { TeamMember } from '../../lib/types';

/** Prag, nad katerim član velja za preobremenjenega (odprte naloge v skupnih projektih). */
const HEAVY_LOAD = 8;

type Sort = 'load' | 'name' | 'overdue';

export default function TeamPage() {
  const me = useCurrentUser();
  const isAdmin = me.role === 'admin';
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [sort, setSort] = useState<Sort>('load');
  const debounced = useDebounced(search, 250);
  const team = useTeam({ search: debounced.trim() || undefined, includeInactive });

  const members = useMemo(() => {
    const list = [...(team.data ?? [])];
    if (sort === 'name') list.sort((a, b) => fullName(a).localeCompare(fullName(b), 'sl'));
    else if (sort === 'overdue') list.sort((a, b) => b.workload.overdue - a.workload.overdue || b.workload.openTasks - a.workload.openTasks);
    else list.sort((a, b) => b.workload.openTasks - a.workload.openTasks);
    return list;
  }, [team.data, sort]);

  const active = members.filter((m) => m.isActive);
  const totalOpen = active.reduce((s, m) => s + m.workload.openTasks, 0);
  const heavy = active.filter((m) => m.workload.openTasks >= HEAVY_LOAD || m.workload.overdue >= 3).length;
  const idle = active.filter((m) => m.workload.openTasks === 0 && m.workload.sharedProjects > 0).length;
  const max = Math.max(HEAVY_LOAD, ...members.map((m) => m.workload.openTasks));

  return (
    <div className="page">
      <PageHeader title="Ekipa" description="Obremenjenost upošteva naloge v projektih, ki jih delite s sodelavci." />
      <div className="stat-grid">
        <StatCard label="Aktivni člani" value={active.length} />
        <StatCard label="Odprte dodeljene naloge" value={totalOpen} tone="accent" />
        <StatCard label="Preobremenjeni" value={heavy} tone={heavy ? 'warning' : 'neutral'} hint={`${HEAVY_LOAD}+ odprtih ali 3+ zamujene`} />
        <StatCard label="Brez odprtih nalog" value={idle} hint="Na voljo za novo delo" />
      </div>

      <div className="toolbar">
        <div className="search-input">
          <Icon name="search" size={14} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Išči po imenu ali e-pošti" aria-label="Išči člane" />
        </div>
        <Segmented<Sort>
          label="Razvrsti"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'load', label: 'Obremenjenost' },
            { value: 'overdue', label: 'Zamude' },
            { value: 'name', label: 'Ime' },
          ]}
        />
        <span className="grow" />
        {isAdmin && <Checkbox checked={includeInactive} onChange={setIncludeInactive} label="Prikaži neaktivne" />}
      </div>

      {team.error ? (
        <ErrorBlock message={errorMessage(team.error)} onRetry={() => team.refetch()} />
      ) : team.isPending ? (
        <div className="card stack gap-2 card-pad">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} height={44} />
          ))}
        </div>
      ) : members.length === 0 ? (
        <EmptyState art="search" title="Ni članov, ki ustrezajo iskanju" description="Poskusite z drugim imenom ali e-poštnim naslovom." />
      ) : (
        <div className="card card-flush">
          <ul className="team-list">
            {members.map((m) => (
              <TeamRow key={m.id} member={m} max={max} isAdmin={isAdmin} isMe={m.id === me.id} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TeamRow({ member: m, max, isAdmin, isMe }: { member: TeamMember; max: number; isAdmin: boolean; isMe: boolean }) {
  const update = useAdminUpdateUser();
  const { success, error, confirm } = useFeedback();
  const w = m.workload;
  const heavy = w.openTasks >= HEAVY_LOAD || w.overdue >= 3;

  const setActive = async (isActive: boolean) => {
    if (!isActive) {
      const ok = await confirm({
        title: `Deaktiviraj ${fullName(m)}`,
        description:
          'Uporabnik se ne bo mogel več prijaviti, obstoječe seje bodo preklicane. Naloge, komentarji in zgodovina ostanejo ohranjeni; dodelitve lahko po potrebi spremenite ročno.',
        confirmLabel: 'Deaktiviraj',
      });
      if (!ok) return;
    }
    update.mutate({ id: m.id, isActive }, { onSuccess: () => success(isActive ? 'Račun ponovno aktiviran' : 'Račun deaktiviran', fullName(m)), onError: (err) => error(err) });
  };

  const setRole = async (role: 'admin' | 'member') => {
    if (role === 'admin') {
      const ok = await confirm({
        title: 'Dodeli skrbniške pravice',
        description: `${fullName(m)} bo lahko upravljal(a) uporabniške račune in vloge v celotnem sistemu.`,
        confirmLabel: 'Dodeli',
        tone: 'primary',
      });
      if (!ok) return;
    }
    update.mutate({ id: m.id, role }, { onSuccess: () => success('Vloga posodobljena'), onError: (err) => error(err) });
  };

  return (
    <li className={`team-row${m.isActive ? '' : ' is-inactive'}`}>
      <Avatar user={m} size={36} />
      <div className="team-main">
        <div className="row gap-2 wrap">
          <Link to={`/team/${m.id}`} className="strong">
            {fullName(m)}
          </Link>
          {isMe && <Badge tone="accent">vi</Badge>}
          {m.role === 'admin' && <Badge>skrbnik</Badge>}
          {!m.isActive && <Badge tone="danger">neaktiven</Badge>}
        </div>
        <span className="muted small truncate">
          {m.jobTitle ? `${m.jobTitle} · ` : ''}
          {m.email}
        </span>
      </div>
      <div className="team-load" title={`${w.openTasks} odprtih · ${w.inProgress} v teku · ${w.overdue} zamuja`}>
        <div className="row gap-2">
          <span className={`tabular strong${heavy ? ' text-warning' : ''}`}>{w.openTasks}</span>
          <span className="muted small">odprtih</span>
          {w.overdue > 0 && <span className="text-danger small tabular">{w.overdue} zamuja</span>}
        </div>
        <span className="load-bar" aria-hidden="true">
          <span className="load-bar-progress" style={{ width: `${(w.inProgress / max) * 100}%` }} />
          <span className="load-bar-open" style={{ width: `${((w.openTasks - w.inProgress) / max) * 100}%` }} />
        </span>
      </div>
      <div className="team-meta small">
        <span>
          <span className="tabular strong">{w.dueSoon}</span> <span className="muted">z rokom v 7 dneh</span>
        </span>
        <span>
          <span className="tabular strong">{w.sharedProjects}</span> <span className="muted">skupnih projektov</span>
        </span>
      </div>
      <div className="team-seen muted small">{m.lastLoginAt ? `Aktiven ${timeAgo(m.lastLoginAt)}` : 'Še ni bil prijavljen'}</div>
      <div className="team-actions">
        {isAdmin && !isMe ? (
          <Menu
            trigger={(props) => <IconButton icon="more" size="sm" label={`Upravljaj ${fullName(m)}`} {...props} />}
            items={[
              m.role === 'admin' ? { label: 'Odvzemi skrbniške pravice', onSelect: () => setRole('member') } : { label: 'Dodeli skrbniške pravice', onSelect: () => setRole('admin') },
              'divider',
              m.isActive
                ? { label: 'Deaktiviraj račun', tone: 'danger', onSelect: () => setActive(false) }
                : { label: 'Ponovno aktiviraj račun', onSelect: () => setActive(true) },
            ]}
          />
        ) : (
          <span className="icon-btn-placeholder" />
        )}
      </div>
    </li>
  );
}
