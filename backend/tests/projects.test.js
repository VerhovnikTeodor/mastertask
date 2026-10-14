const { resetDatabase, closePool, createUser, createProject, addMember, query } = require('./helpers');

let owner;
let member;
let outsider;

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser();
  member = await createUser();
  outsider = await createUser();
});
afterAll(closePool);

describe('projekti', () => {
  test('nov projekt dobi lastnika, privzete stolpce, oznake in samodejno oznako', async () => {
    const project = await createProject(owner, { name: 'Čarobna prenova strani' });
    expect(project.key).toBe('CPS');
    expect(project.myRole).toBe('owner');
    expect(project.columns.map((c) => c.category)).toEqual(['todo', 'in_progress', 'in_progress', 'done']);
    expect(project.labels.length).toBeGreaterThan(0);
    expect(project.members).toHaveLength(1);
  });

  test('neveljavni podatki in rok pred začetkom so zavrnjeni', async () => {
    expect((await owner.post('/api/projects', { name: '' })).status).toBe(400);
    const res = await owner.post('/api/projects', { name: 'X', startDate: '2026-05-10', dueDate: '2026-05-01' });
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('dueDate');
    expect((await owner.post('/api/projects', { name: 'Y', key: '1AB' })).status).toBe(400);
  });

  test('nečlan projekta ne vidi in ne more spreminjati', async () => {
    const project = await createProject(owner);
    expect((await outsider.get(`/api/projects/${project.id}`)).status).toBe(404);
    expect((await outsider.patch(`/api/projects/${project.id}`, { name: 'Vdor' })).status).toBe(404);
    expect((await outsider.get(`/api/projects/${project.id}/board`)).status).toBe(404);
    const list = await outsider.get('/api/projects');
    expect(list.body.items.find((p) => p.id === project.id)).toBeUndefined();
    expect((await outsider.get('/api/projects/not-a-uuid')).status).toBe(404);
  });

  test('član ne more urejati projekta, vodja lahko', async () => {
    const project = await createProject(owner);
    await addMember(owner, project.id, member);
    expect((await member.patch(`/api/projects/${project.id}`, { name: 'Novo' })).status).toBe(403);
    await owner.patch(`/api/projects/${project.id}/members/${member.user.id}`, { role: 'manager' });
    const res = await member.patch(`/api/projects/${project.id}`, { name: 'Novo ime', status: 'on_hold' });
    expect(res.status).toBe(200);
    expect(res.body.project.name).toBe('Novo ime');
    expect(res.body.project.health).toBe('paused');
  });

  test('seznam podpira iskanje, filter po statusu in statistiko', async () => {
    const a = await createProject(owner, { name: 'Iskalni alfa', status: 'planning' });
    await owner.post('/api/tasks', { projectId: a.id, title: 'Naloga', dueDate: '2000-01-01' });
    const res = await owner.get('/api/projects?search=alfa&status=planning');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].stats).toMatchObject({ total: 1, open: 1, overdue: 1 });
    expect(res.body.items[0].health).toBe('at_risk');
  });

  test('odstranitev člana ohrani zgodovino in zaključene naloge, odprte razdodeli', async () => {
    const project = await createProject(owner);
    const leaving = await createUser();
    await addMember(owner, project.id, leaving);
    const doneColumn = project.columns.find((c) => c.category === 'done').id;
    const open = await owner.post('/api/tasks', { projectId: project.id, title: 'Odprta', assigneeIds: [leaving.user.id] });
    const done = await owner.post('/api/tasks', {
      projectId: project.id,
      title: 'Zaključena',
      columnId: doneColumn,
      assigneeIds: [leaving.user.id],
    });

    const res = await owner.delete(`/api/projects/${project.id}/members/${leaving.user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.unassignedTasks).toBe(1);

    const openTask = await owner.get(`/api/tasks/${open.body.task.id}`);
    const doneTask = await owner.get(`/api/tasks/${done.body.task.id}`);
    expect(openTask.body.task.assignees).toHaveLength(0);
    expect(doneTask.body.task.assignees.map((a) => a.id)).toContain(leaving.user.id);
    expect((await leaving.get(`/api/projects/${project.id}`)).status).toBe(404);
    const { rows } = await query('SELECT count(*) AS n FROM users WHERE id = $1', [leaving.user.id]);
    expect(rows[0].n).toBe(1);
  });

  test('lastnika ni mogoče odstraniti; prenos lastništva deluje', async () => {
    const project = await createProject(owner);
    const next = await createUser();
    await addMember(owner, project.id, next, 'manager');
    expect((await next.delete(`/api/projects/${project.id}/members/${owner.user.id}`)).status).toBe(400);
    const res = await owner.patch(`/api/projects/${project.id}/members/${next.user.id}`, { role: 'owner' });
    expect(res.status).toBe(200);
    const roles = Object.fromEntries(res.body.members.map((m) => [m.id, m.role]));
    expect(roles[next.user.id]).toBe('owner');
    expect(roles[owner.user.id]).toBe('manager');
  });

  test('arhiviran projekt je samo za branje; brisanje zahteva arhiv', async () => {
    const project = await createProject(owner);
    expect((await owner.delete(`/api/projects/${project.id}`)).status).toBe(409);
    expect((await owner.post(`/api/projects/${project.id}/archive`)).status).toBe(200);
    const write = await owner.post('/api/tasks', { projectId: project.id, title: 'Ne sme' });
    expect(write.status).toBe(409);
    const archived = await owner.get('/api/projects?archived=true');
    expect(archived.body.items.map((p) => p.id)).toContain(project.id);
    expect((await owner.post(`/api/projects/${project.id}/restore`)).status).toBe(200);
    await owner.post(`/api/projects/${project.id}/archive`);
    expect((await owner.delete(`/api/projects/${project.id}`)).status).toBe(204);
  });

  test('stolpci: dodajanje, preurejanje in brisanje s premikom nalog', async () => {
    const project = await createProject(owner);
    const added = await owner.post(`/api/projects/${project.id}/columns`, { name: 'Blokirano', category: 'in_progress' });
    expect(added.status).toBe(201);
    const cols = added.body.project.columns;
    const blocked = cols.find((c) => c.name === 'Blokirano');
    const reversed = [...cols].reverse().map((c) => c.id);
    const reordered = await owner.put(`/api/projects/${project.id}/columns/order`, { columnIds: reversed });
    expect(reordered.body.project.columns.map((c) => c.id)).toEqual(reversed);

    await owner.post('/api/tasks', { projectId: project.id, title: 'V blokiranem', columnId: blocked.id });
    expect((await owner.delete(`/api/projects/${project.id}/columns/${blocked.id}`)).status).toBe(400);
    const todo = cols.find((c) => c.category === 'todo');
    const removed = await owner.delete(`/api/projects/${project.id}/columns/${blocked.id}?moveTo=${todo.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.project.columns.find((c) => c.id === todo.id).taskCount).toBe(1);
  });
});
