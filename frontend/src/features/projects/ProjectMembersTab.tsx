import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMemberMutations, useTeam } from '../../api/hooks';
import { useCurrentUser } from '../../context/auth';
import { useFeedback } from '../../context/feedback';
import { Menu, Picker } from '../../components/overlays';
import { Avatar, Badge, Button, IconButton, Select, SectionCard } from '../../components/ui';
import { formatDate, fullName, plural } from '../../lib/format';
import { ROLES, ROLE_LABEL } from '../../lib/meta';
import type { ProjectMember, ProjectRole } from '../../lib/types';
import { useProjectContext } from './ProjectLayout';

const ASSIGNABLE: ProjectRole[] = ['manager', 'member', 'viewer'];

export default function ProjectMembersTab() {
  const { project, canManage, isOwner } = useProjectContext();
  const me = useCurrentUser();
  const navigate = useNavigate();
  const team = useTeam();
  const { add, changeRole, remove } = useMemberMutations(project.id);
  const { success, error, confirm } = useFeedback();
  const [newRole, setNewRole] = useState<ProjectRole>('member');
  const archived = Boolean(project.archivedAt);
  const myRole = project.myRole;

  const memberIds = new Set(project.members.map((m) => m.id));
  const candidates = (team.data ?? []).filter((u) => u.isActive && !memberIds.has(u.id));
  const members = [...project.members].sort(
    (a, b) => ROLES.findIndex((r) => r.value === a.role) - ROLES.findIndex((r) => r.value === b.role) || fullName(a).localeCompare(fullName(b), 'sl'),
  );

  /** Strežnik je vir resnice; tukaj samo skrijemo dejanja, ki bi jih zavrnil. */
  const canAlter = (m: ProjectMember) =>
    canManage && m.id !== me.id && m.role !== 'owner' && (isOwner || roleRank(m.role) < roleRank(myRole));

  const addMembers = async (ids: string[]) => {
    for (const userId of ids) {
      try {
        await add.mutateAsync({ userId, role: newRole });
        const u = candidates.find((c) => c.id === userId);
        success('Član dodan', u ? `${fullName(u)} · ${ROLE_LABEL[newRole]}` : undefined);
      } catch (err) {
        error(err, 'Člana ni bilo mogoče dodati');
      }
    }
  };

  const setRole = (m: ProjectMember, role: ProjectRole) =>
    changeRole.mutate({ userId: m.id, role }, { onSuccess: () => success('Vloga posodobljena', `${fullName(m)} · ${ROLE_LABEL[role]}`), onError: (err) => error(err) });

  const transfer = async (m: ProjectMember) => {
    const ok = await confirm({
      title: 'Prenesi lastništvo',
      description: (
        <>
          <strong>{fullName(m)}</strong> bo postal(a) lastnik projekta in bo lahko projekt arhiviral(a) ali izbrisal(a). Vaša vloga se spremeni v
          »Vodja«. Lastništva si ne morete vrniti sami.
        </>
      ),
      confirmLabel: 'Prenesi lastništvo',
      typeToConfirm: project.key,
    });
    if (!ok) return;
    changeRole.mutate({ userId: m.id, role: 'owner' }, { onSuccess: () => success('Lastništvo preneseno', fullName(m)), onError: (err) => error(err) });
  };

  const removeMember = async (m: ProjectMember) => {
    const ok = await confirm({
      title: `Odstrani ${fullName(m)}`,
      description: (
        <>
          Član izgubi dostop do projekta in je odstranjen z{' '}
          {m.openTasks ? (
            <strong>
              {m.openTasks} {plural(m.openTasks, ['odprte naloge', 'odprtih nalog', 'odprtih nalog', 'odprtih nalog'])}
            </strong>
          ) : (
            'odprtih nalog'
          )}
          . Dokončane naloge, komentarji in zgodovina sprememb ostanejo ohranjeni.
        </>
      ),
      confirmLabel: 'Odstrani člana',
    });
    if (!ok) return;
    try {
      const res = await remove.mutateAsync(m.id);
      success('Član odstranjen', res.unassignedTasks ? `Razdodeljenih nalog: ${res.unassignedTasks}` : undefined);
    } catch (err) {
      error(err);
    }
  };

  const leave = async () => {
    const ok = await confirm({
      title: 'Zapusti projekt',
      description: 'Izgubili boste dostop do projekta in odstranjeni boste z odprtih nalog. Vaši komentarji in zgodovina ostanejo.',
      confirmLabel: 'Zapusti projekt',
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(me.id);
      success('Projekt zapuščen', project.name);
      navigate('/projects');
    } catch (err) {
      error(err);
    }
  };

  return (
    <div className="project-body members-layout">
      <SectionCard
        title={`Člani projekta · ${project.members.length}`}
        flush
        action={
          canManage && (
            <div className="row gap-2">
              <Select size_="sm" aria-label="Vloga novih članov" value={newRole} onChange={(e) => setNewRole(e.target.value as ProjectRole)}>
                {ASSIGNABLE.filter((r) => isOwner || roleRank(r) < roleRank(myRole)).map((r) => (
                  <option key={r} value={r}>
                    kot {ROLE_LABEL[r].toLowerCase()}
                  </option>
                ))}
              </Select>
              <Picker
                options={candidates.map((u) => ({
                  value: u.id,
                  label: `${fullName(u)} ${u.email}`,
                  render: (
                    <span className="row gap-2 truncate">
                      <Avatar user={u} size={22} />
                      <span className="stack truncate">
                        <span className="truncate">{fullName(u)}</span>
                        <span className="muted truncate small">{u.jobTitle || u.email}</span>
                      </span>
                    </span>
                  ),
                }))}
                value={[]}
                onChange={addMembers}
                multiple={false}
                align="end"
                width={320}
                placeholder="Poišči sodelavca …"
                emptyText={team.isPending ? 'Nalagam …' : 'Vsi aktivni uporabniki so že člani.'}
                trigger={(props) => (
                  <Button size="sm" variant="primary" icon="plus" loading={add.isPending} {...props}>
                    Dodaj člana
                  </Button>
                )}
              />
            </div>
          )
        }
      >
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.id} className="member-row">
              <Avatar user={m} size={34} />
              <div className="member-main">
                <div className="row gap-2 wrap">
                  <Link to={`/team/${m.id}`} className="strong">
                    {fullName(m)}
                  </Link>
                  {m.id === me.id && <Badge tone="accent">vi</Badge>}
                  {!m.isActive && <Badge>neaktiven račun</Badge>}
                </div>
                <span className="muted small truncate">
                  {m.jobTitle ? `${m.jobTitle} · ` : ''}
                  {m.email} · član od {formatDate(m.joinedAt)}
                </span>
              </div>
              <div className="member-load">
                <span className="tabular strong">{m.openTasks}</span> <span className="muted">odprtih</span>
                {m.overdueTasks > 0 && <span className="text-danger tabular"> · {m.overdueTasks} zamuja</span>}
              </div>
              <div className="member-role">
                {canAlter(m) ? (
                  <Select size_="sm" aria-label={`Vloga za ${fullName(m)}`} value={m.role} onChange={(e) => setRole(m, e.target.value as ProjectRole)}>
                    {ASSIGNABLE.filter((r) => isOwner || roleRank(r) < roleRank(myRole)).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span className={`role-pill role-${m.role}`}>{ROLE_LABEL[m.role]}</span>
                )}
              </div>
              <div className="member-actions">
                {canAlter(m) || (isOwner && !archived && m.id !== me.id && m.isActive) ? (
                  <Menu
                    trigger={(props) => <IconButton icon="more" size="sm" label={`Dejanja za ${fullName(m)}`} {...props} />}
                    items={[
                      ...(isOwner && !archived && m.isActive ? [{ label: 'Prenesi lastništvo', onSelect: () => transfer(m) }] : []),
                      ...(canAlter(m) ? ['divider' as const, { label: 'Odstrani iz projekta', tone: 'danger' as const, onSelect: () => removeMember(m) }] : []),
                    ].filter((item, i, arr) => !(item === 'divider' && (i === 0 || i === arr.length - 1)))}
                  />
                ) : (
                  <span className="icon-btn-placeholder" />
                )}
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      <aside className="stack gap-4">
        <SectionCard title="Vloge in pravice">
          <dl className="role-legend card-pad">
            {ROLES.map((r) => (
              <div key={r.value}>
                <dt>
                  <span className={`role-pill role-${r.value}`}>{r.label}</span>
                </dt>
                <dd>{r.description}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
        {!isOwner && !archived && (
          <SectionCard title="Zapusti projekt">
            <div className="card-pad stack gap-3">
              <p className="secondary">Ko zapustite projekt, vas odstranimo z odprtih nalog. Zgodovina vaših sprememb ostane.</p>
              <div>
                <Button variant="danger-ghost" onClick={leave} loading={remove.isPending}>
                  Zapusti projekt
                </Button>
              </div>
            </div>
          </SectionCard>
        )}
      </aside>
    </div>
  );
}

function roleRank(role: ProjectRole) {
  return { viewer: 1, member: 2, manager: 3, owner: 4 }[role];
}
