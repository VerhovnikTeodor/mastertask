const { app, request, resetDatabase, closePool, createUser } = require('./helpers');

beforeAll(resetDatabase);
afterAll(closePool);

const csrf = { 'X-Requested-With': 'MasterTask' };

describe('avtentikacija', () => {
  test('prvi uporabnik postane skrbnik, naslednji so člani', async () => {
    const first = await createUser();
    const second = await createUser();
    expect(first.user.role).toBe('admin');
    expect(second.user.role).toBe('member');
    expect(first.user).not.toHaveProperty('passwordHash');
    expect(first.user).not.toHaveProperty('tokenVersion');
  });

  test('sejni piškotek je httpOnly in SameSite=Lax', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set(csrf)
      .send({ email: 'cookie@example.com', password: 'Geslo1234', firstName: 'A', lastName: 'B' });
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  test('podvojen e-poštni naslov (ne glede na velike črke) vrne 409', async () => {
    await createUser({ email: 'dup@example.com' });
    const res = await request(app)
      .post('/api/auth/register')
      .set(csrf)
      .send({ email: 'DUP@example.com', password: 'Geslo1234', firstName: 'A', lastName: 'B' });
    expect(res.status).toBe(409);
  });

  test('šibko geslo in manjkajoča polja vrnejo napake po poljih', async () => {
    const res = await request(app).post('/api/auth/register').set(csrf).send({ email: 'x@example.com', password: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('password');
    expect(res.body.fields).toHaveProperty('firstName');
  });

  test('prijava, /me in odjava', async () => {
    await createUser({ email: 'login@example.com' });
    const agent = request.agent(app);
    const bad = await agent.post('/api/auth/login').set(csrf).send({ email: 'login@example.com', password: 'Napacno123' });
    expect(bad.status).toBe(401);
    const ok = await agent.post('/api/auth/login').set(csrf).send({ email: 'LOGIN@example.com', password: 'Geslo1234' });
    expect(ok.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    await agent.post('/api/auth/logout').set(csrf);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  test('zahteve brez CSRF glave so zavrnjene', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'x' });
    expect(res.status).toBe(403);
  });

  test('ponarejen ali spremenjen žeton je zavrnjen', async () => {
    const res = await request(app).get('/api/projects').set('Cookie', 'mt_session=eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.');
    expect(res.status).toBe(401);
  });

  test('sprememba gesla razveljavi druge seje', async () => {
    const user = await createUser();
    const other = request.agent(app);
    await other.post('/api/auth/login').set(csrf).send({ email: user.user.email, password: user.password });
    expect((await other.get('/api/auth/me')).status).toBe(200);

    const wrong = await user.post('/api/auth/change-password', { currentPassword: 'Napacno1', newPassword: 'NovoGeslo1' });
    expect(wrong.status).toBe(400);
    const res = await user.post('/api/auth/change-password', { currentPassword: user.password, newPassword: 'NovoGeslo1' });
    expect(res.status).toBe(200);

    expect((await user.get('/api/auth/me')).status).toBe(200);
    expect((await other.get('/api/auth/me')).status).toBe(401);
  });

  test('po preveč neuspešnih poskusih je prijava začasno zaklenjena', async () => {
    const user = await createUser({ email: 'locked@example.com' });
    for (let i = 0; i < 8; i += 1) {
      await request(app).post('/api/auth/login').set(csrf).send({ email: 'locked@example.com', password: 'Napacno123' });
    }
    const res = await request(app).post('/api/auth/login').set(csrf).send({ email: 'locked@example.com', password: user.password });
    expect(res.status).toBe(429);
  });

  test('profil in nastavitve se trajno shranijo', async () => {
    const user = await createUser();
    const res = await user.patch('/api/auth/me', { jobTitle: 'Razvijalec', preferences: { theme: 'dark' } });
    expect(res.status).toBe(200);
    const me = await user.get('/api/auth/me');
    expect(me.body.user.jobTitle).toBe('Razvijalec');
    expect(me.body.user.preferences.theme).toBe('dark');
    const invalid = await user.patch('/api/auth/me', { role: 'admin' });
    expect(invalid.status).toBe(400);
  });
});

describe('upravljanje uporabnikov', () => {
  test('samo skrbnik lahko deaktivira; deaktiviran uporabnik izgubi sejo', async () => {
    await resetDatabase();
    const admin = await createUser();
    const member = await createUser();
    expect((await member.patch(`/api/users/${admin.user.id}`, { isActive: false })).status).toBe(403);
    expect((await admin.patch(`/api/users/${admin.user.id}`, { isActive: false })).status).toBe(400);
    expect((await admin.patch(`/api/users/${member.user.id}`, { isActive: false })).status).toBe(200);
    expect((await member.get('/api/auth/me')).status).toBe(401);
  });
});
