const { resetDatabase, closePool, createUser, createProject, addMember, isoDay } = require('./helpers');

let owner;
let member;
let viewer;
let outsider;
let project;
let col;

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser();
  member = await createUser();
  viewer = await createUser();
  outsider = await createUser();
  project = await createProject(owner, { name: 'Naloge', key: 'NAL' });
  await addMember(owner, project.id, member);
  await addMember(owner, project.id, viewer, 'viewer');
  col = Object.fromEntries(project.columns.map((c) => [c.name, c.id]));
});
afterAll(closePool);

const newTask = (data = {}) => member.post('/api/tasks', { projectId: project.id, title: 'Naloga', ...data });

describe('naloge – CRUD in dovoljenja', () => {
  test('ustvarjanje dodeli zaporedno številko, privzeti stolpec in obvesti odgovorne', async () => {
    const res = await owner.post('/api/tasks', {
      projectId: project.id,
      title: '  Prva naloga  ',
      priority: 'high',
      assigneeIds: [member.user.id],
      labelIds: [project.labels[0].id],
    });
    expect(res.status).toBe(201);
    expect(res.body.task.key).toMatch(/^NAL-\d+$/);
    expect(res.body.task.title).toBe('Prva naloga');
    expect(res.body.task.status.category).toBe('todo');
    const notes = await member.get('/api/notifications');
    expect(notes.body.items.some((n) => n.type === 'task_assigned' && n.task.id === res.body.task.id)).toBe(true);
  });

  test('odgovorna oseba mora biti član projekta', async () => {
    const res = await newTask({ assigneeIds: [outsider.user.id] });
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('assigneeIds');
  });

  test('opazovalec ne more ustvarjati, lahko pa komentira; nečlan ne vidi naloge', async () => {
    const created = await newTask();
    expect((await viewer.post('/api/tasks', { projectId: project.id, title: 'X' })).status).toBe(403);
    expect((await viewer.patch(`/api/tasks/${created.body.task.id}`, { title: 'X' })).status).toBe(403);
    expect((await viewer.post(`/api/tasks/${created.body.task.id}/comments`, { body: 'Mnenje' })).status).toBe(201);
    expect((await outsider.get(`/api/tasks/${created.body.task.id}`)).status).toBe(404);
    expect((await outsider.post(`/api/tasks/${created.body.task.id}/comments`, { body: 'x' })).status).toBe(404);
  });

  test('urejanje beleži zgodovino sprememb', async () => {
    const created = await newTask({ title: 'Stari naslov' });
    const id = created.body.task.id;
    const res = await member.patch(`/api/tasks/${id}`, { title: 'Nov naslov', priority: 'urgent', dueDate: isoDay(3) });
    expect(res.status).toBe(200);
    expect(res.body.task.priority).toBe('urgent');
    const activity = await member.get(`/api/tasks/${id}/activity`);
    const update = activity.body.items.find((a) => a.action === 'task_updated');
    expect(update.details.changes.map((c) => c.field)).toEqual(expect.arrayContaining(['title', 'priority', 'dueDate']));
  });

  test('brisanje: član lahko izbriše svojo nalogo, tujo pa ne', async () => {
    const mine = await newTask();
    const theirs = await owner.post('/api/tasks', { projectId: project.id, title: 'Lastnikova' });
    expect((await member.delete(`/api/tasks/${theirs.body.task.id}`)).status).toBe(403);
    expect((await member.delete(`/api/tasks/${mine.body.task.id}`)).status).toBe(204);
    expect((await member.get(`/api/tasks/${mine.body.task.id}`)).status).toBe(404);
  });

  test('arhivirana naloga je skrita s table in je ni mogoče urejati do obnove', async () => {
    const created = await newTask({ title: 'Za arhiv' });
    const id = created.body.task.id;
    await member.post(`/api/tasks/${id}/archive`);
    const board = await member.get(`/api/projects/${project.id}/board`);
    expect(board.body.tasks.find((t) => t.id === id)).toBeUndefined();
    expect((await member.patch(`/api/tasks/${id}`, { title: 'X' })).status).toBe(409);
    const archived = await member.get(`/api/tasks?archived=true&projectId=${project.id}`);
    expect(archived.body.items.map((t) => t.id)).toContain(id);
    await member.post(`/api/tasks/${id}/restore`);
    expect((await member.patch(`/api/tasks/${id}`, { title: 'Obnovljena' })).status).toBe(200);
  });
});

describe('Kanban premikanje', () => {
  test('premik med stolpci trajno spremeni status in čas dokončanja', async () => {
    const created = await newTask({ title: 'Premakni me' });
    const id = created.body.task.id;
    const moved = await member.post(`/api/tasks/${id}/move`, { columnId: col['Končano'], index: 0 });
    expect(moved.status).toBe(200);
    expect(moved.body.task.status.category).toBe('done');
    expect(moved.body.task.completedAt).not.toBeNull();

    const reloaded = await member.get(`/api/tasks/${id}`);
    expect(reloaded.body.task.columnId).toBe(col['Končano']);

    const back = await member.post(`/api/tasks/${id}/move`, { columnId: col['V teku'], index: 0 });
    expect(back.body.task.completedAt).toBeNull();
  });

  test('vrstni red znotraj stolpca se ohrani', async () => {
    const column = col['V pregledu'];
    const ids = [];
    for (const title of ['A', 'B', 'C']) {
      ids.push((await newTask({ title, columnId: column })).body.task.id);
    }
    await member.post(`/api/tasks/${ids[2]}/move`, { columnId: column, index: 0 });
    await member.post(`/api/tasks/${ids[0]}/move`, { columnId: column, index: 1 });
    const board = await member.get(`/api/projects/${project.id}/board`);
    const order = board.body.tasks.filter((t) => t.columnId === column).map((t) => t.title);
    expect(order).toEqual(['C', 'A', 'B']);
  });

  test('stolpec iz drugega projekta je zavrnjen', async () => {
    const other = await createProject(member, { name: 'Drugi' });
    const created = await newTask();
    const res = await member.post(`/api/tasks/${created.body.task.id}/move`, { columnId: other.columns[0].id, index: 0 });
    expect(res.status).toBe(400);
  });
});

describe('filtri, iskanje in razvrščanje', () => {
  let target;
  beforeAll(async () => {
    target = await owner.post('/api/tasks', {
      projectId: project.id,
      title: 'Kritičen popravek prijave',
      priority: 'high',
      dueDate: isoDay(3),
      assigneeIds: [member.user.id],
    });
    await owner.post('/api/tasks', { projectId: project.id, title: 'Daljni rok', priority: 'high', dueDate: isoDay(30), assigneeIds: [member.user.id] });
    await owner.post('/api/tasks', { projectId: project.id, title: 'Nizka', priority: 'low', dueDate: isoDay(2), assigneeIds: [member.user.id] });
    const done = await owner.post('/api/tasks', {
      projectId: project.id,
      title: 'Že končana',
      priority: 'high',
      dueDate: isoDay(1),
      assigneeIds: [member.user.id],
      columnId: col['Končano'],
    });
    expect(done.status).toBe(201);
  });

  test('kombinacija: visoka prioriteta, nedokončane, član, rok v 7 dneh', async () => {
    const res = await owner.get(
      `/api/tasks?priority=high&status=todo,in_progress&assignee=${member.user.id}&due=week`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.map((t) => t.title)).toEqual(['Kritičen popravek prijave']);
  });

  test('iskanje po naslovu in po oznaki naloge', async () => {
    const byTitle = await owner.get('/api/tasks?search=popravek');
    expect(byTitle.body.items[0].id).toBe(target.body.task.id);
    const byKey = await owner.get(`/api/tasks?search=${target.body.task.key}`);
    expect(byKey.body.items.map((t) => t.id)).toContain(target.body.task.id);
    const injection = await owner.get(`/api/tasks?search=${encodeURIComponent("' OR 1=1 --")}`);
    expect(injection.status).toBe(200);
    expect(injection.body.items).toHaveLength(0);
  });

  test('razvrščanje po roku in paginacija', async () => {
    const res = await owner.get('/api/tasks?sort=due&order=asc&pageSize=2&page=1&due=month');
    expect(res.body.pageSize).toBe(2);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBeGreaterThanOrEqual(4);
    const dates = res.body.items.map((t) => t.dueDate);
    expect([...dates].sort()).toEqual(dates);
    expect((await owner.get('/api/tasks?pageSize=1000')).status).toBe(400);
    expect((await owner.get('/api/tasks?priority=nevarno')).status).toBe(400);
  });

  test('nečlan v seznamu ne vidi nalog projekta', async () => {
    const res = await outsider.get('/api/tasks');
    expect(res.body.total).toBe(0);
  });
});

describe('podnaloge, odvisnosti in komentarji', () => {
  test('kontrolni seznam se šteje na kartici', async () => {
    const created = await newTask();
    const id = created.body.task.id;
    const item = await member.post(`/api/tasks/${id}/checklist`, { content: 'Korak 1' });
    await member.post(`/api/tasks/${id}/checklist`, { content: 'Korak 2' });
    await member.patch(`/api/tasks/${id}/checklist/${item.body.item.id}`, { isDone: true });
    const detail = await member.get(`/api/tasks/${id}`);
    expect(detail.body.task.checklist).toEqual({ total: 2, done: 1 });
    expect(detail.body.task.checklistItems).toHaveLength(2);
  });

  test('krožne odvisnosti so preprečene', async () => {
    const a = (await newTask({ title: 'A' })).body.task.id;
    const b = (await newTask({ title: 'B' })).body.task.id;
    const c = (await newTask({ title: 'C' })).body.task.id;
    expect((await member.post(`/api/tasks/${b}/dependencies`, { blockedById: a })).status).toBe(201);
    expect((await member.post(`/api/tasks/${c}/dependencies`, { blockedById: b })).status).toBe(201);
    expect((await member.post(`/api/tasks/${a}/dependencies`, { blockedById: c })).status).toBe(409);
    const detail = await member.get(`/api/tasks/${c}`);
    expect(detail.body.task.openBlockers).toBe(1);
    expect(detail.body.task.blockedBy[0].id).toBe(b);
  });

  test('komentar lahko ureja samo avtor in obvesti odgovorne', async () => {
    const created = await owner.post('/api/tasks', { projectId: project.id, title: 'Razprava', assigneeIds: [member.user.id] });
    const id = created.body.task.id;
    const comment = await owner.post(`/api/tasks/${id}/comments`, { body: '<script>alert(1)</script> Kaj menite?' });
    expect(comment.status).toBe(201);
    expect(comment.body.comment.body).toContain('<script>');
    expect((await member.patch(`/api/comments/${comment.body.comment.id}`, { body: 'Ponaredek' })).status).toBe(403);
    expect((await owner.patch(`/api/comments/${comment.body.comment.id}`, { body: 'Popravljeno' })).body.comment.editedAt).not.toBeNull();
    const notes = await member.get('/api/notifications?unread=true');
    expect(notes.body.items.some((n) => n.type === 'comment_added')).toBe(true);
    await member.post('/api/notifications/read', { all: true });
    expect((await member.get('/api/notifications/unread-count')).body.unreadCount).toBe(0);
  });
});

describe('nadzorna plošča in iskanje', () => {
  test('nadzorna plošča vrne podatke iz baze', async () => {
    const res = await member.get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.stats.myOpen).toBeGreaterThan(0);
    expect(res.body.throughput).toHaveLength(14);
    expect(res.body.projects.length).toBeGreaterThan(0);
  });

  test('nadzorna plošča ne razkrije tujih projektov', async () => {
    const res = await outsider.get('/api/dashboard');
    expect(res.status).toBe(200);
    for (const list of ['myTasks', 'upcoming', 'overdue', 'recentlyUpdated', 'projects', 'activity']) {
      expect(res.body[list]).toEqual([]);
    }
    expect(res.body.stats.teamOverdue).toBe(0);
    expect(res.body.throughput.every((d) => d.completed === 0 && d.created === 0)).toBe(true);
  });

  test('globalno iskanje upošteva dostop', async () => {
    const mine = await member.get('/api/search?q=Razprava');
    expect(mine.body.tasks.length).toBe(1);
    const theirs = await outsider.get('/api/search?q=Razprava');
    expect(theirs.body.tasks.length).toBe(0);
  });

  test('shranjeni pogledi so zasebni', async () => {
    const view = await member.post('/api/views', { name: 'Moje nujne', filters: { priority: ['urgent'], assignee: ['me'] } });
    expect(view.status).toBe(201);
    expect((await outsider.delete(`/api/views/${view.body.view.id}`)).status).toBe(404);
    expect((await member.get('/api/views')).body.items).toHaveLength(1);
  });
});
