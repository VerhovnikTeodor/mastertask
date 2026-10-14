const request = require('supertest');
const app = require('../src/app');
const { query, closePool } = require('../src/db/pool');
const { migrate } = require('../src/db/migrate');

async function resetDatabase() {
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
}

let counter = 0;

/** Registrira uporabnika in vrne agenta s sejnim piškotkom ter CSRF glavo. */
async function createUser(overrides = {}) {
  counter += 1;
  const agent = request.agent(app);
  const body = {
    email: `user${counter}-${Date.now()}@example.com`,
    password: 'Geslo1234',
    firstName: `Ime${counter}`,
    lastName: 'Priimek',
    ...overrides,
  };
  const res = await agent.post('/api/auth/register').set('X-Requested-With', 'MasterTask').send(body);
  if (res.status !== 201) throw new Error(`Registracija ni uspela: ${res.status} ${JSON.stringify(res.body)}`);
  const api = {
    agent,
    user: res.body.user,
    password: body.password,
    get: (url) => agent.get(url),
    post: (url, data) => agent.post(url).set('X-Requested-With', 'MasterTask').send(data),
    patch: (url, data) => agent.patch(url).set('X-Requested-With', 'MasterTask').send(data),
    put: (url, data) => agent.put(url).set('X-Requested-With', 'MasterTask').send(data),
    delete: (url) => agent.delete(url).set('X-Requested-With', 'MasterTask'),
  };
  return api;
}

async function createProject(owner, data = {}) {
  const res = await owner.post('/api/projects', { name: 'Testni projekt', ...data });
  if (res.status !== 201) throw new Error(`Projekt ni ustvarjen: ${JSON.stringify(res.body)}`);
  return res.body.project;
}

async function addMember(owner, projectId, user, role = 'member') {
  const res = await owner.post(`/api/projects/${projectId}/members`, { userId: user.user.id, role });
  if (res.status !== 201) throw new Error(`Član ni dodan: ${JSON.stringify(res.body)}`);
}

function isoDay(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

module.exports = { app, request, query, resetDatabase, closePool, createUser, createProject, addMember, isoDay };
