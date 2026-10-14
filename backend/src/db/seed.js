const bcrypt = require('bcryptjs');
const config = require('../config');
const { withTransaction, closePool } = require('./pool');
const { createProject } = require('../services/projects');
const { createTask, moveTask } = require('../services/tasks');

const PASSWORD = 'Demo1234';

const PEOPLE = [
  ['ana.novak@mastertask.si', 'Ana', 'Novak', 'Produktna vodja', '#3E63DD', 'admin'],
  ['marko.kranjc@mastertask.si', 'Marko', 'Kranjc', 'Full-stack razvijalec', '#0D9488', 'member'],
  ['eva.horvat@mastertask.si', 'Eva', 'Horvat', 'UI/UX oblikovalka', '#C2255C', 'member'],
  ['luka.zupan@mastertask.si', 'Luka', 'Zupan', 'Backend razvijalec', '#E67700', 'member'],
  ['nina.kos@mastertask.si', 'Nina', 'Kos', 'QA inženirka', '#7C3AED', 'member'],
];

function day(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function seed() {
  if (config.isProduction && !process.argv.includes('--force')) {
    throw new Error('Seed je namenjen lokalnemu razvoju. V produkciji ga ne zaganjajte.');
  }
  await withTransaction(async (db) => {
    const { rows: existing } = await db.query('SELECT count(*) AS n FROM users');
    if (existing[0].n > 0) {
      console.log('[seed] Baza že vsebuje uporabnike – preskakujem.');
      return;
    }
    const hash = await bcrypt.hash(PASSWORD, config.bcryptRounds);
    const users = [];
    for (const [email, first, last, title, color, role] of PEOPLE) {
      const { rows } = await db.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, job_title, avatar_color, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [email, hash, first, last, title, color, role],
      );
      users.push(rows[0].id);
    }
    const [ana, marko, eva, luka, nina] = users;

    const web = await createProject(db, {
      actorId: ana,
      data: {
        name: 'Prenova spletne strani',
        key: 'WEB',
        description: 'Nova predstavitvena stran z blogom, ceniki in prenovljenim procesom registracije.',
        priority: 'high',
        color: '#3E63DD',
        startDate: day(-21),
        dueDate: day(24),
        memberIds: [marko, eva, nina],
      },
    });
    const app = await createProject(db, {
      actorId: ana,
      data: {
        name: 'Mobilna aplikacija',
        key: 'MOB',
        description: 'Prva različica mobilne aplikacije za iOS in Android.',
        priority: 'urgent',
        color: '#D6409F',
        startDate: day(-40),
        dueDate: day(5),
        memberIds: [marko, luka, eva],
      },
    });
    const ops = await createProject(db, {
      actorId: luka,
      data: {
        name: 'Infrastruktura 2026',
        key: 'OPS',
        description: 'Selitev na upravljano PostgreSQL bazo in avtomatizacija varnostnih kopij.',
        status: 'planning',
        priority: 'medium',
        color: '#12A594',
        dueDate: day(60),
        memberIds: [ana, marko],
      },
    });

    const { rows: cols } = await db.query(
      'SELECT id, project_id, category, position FROM board_columns WHERE project_id = ANY($1::uuid[]) ORDER BY position',
      [[web, app, ops]],
    );
    const { rows: labels } = await db.query('SELECT id, project_id, name FROM labels WHERE project_id = ANY($1::uuid[])', [
      [web, app, ops],
    ]);
    const col = (projectId, position) => cols.filter((c) => c.project_id === projectId)[position].id;
    const label = (projectId, name) => labels.find((l) => l.project_id === projectId && l.name === name).id;

    const plan = [
      [web, ana, 'Pripravi informacijsko arhitekturo strani', 3, 'high', -10, [eva], ['Dizajn']],
      [web, eva, 'Oblikuj nov sistem komponent', 1, 'high', 4, [eva], ['Dizajn']],
      [web, marko, 'Implementiraj stran s ceniki', 1, 'medium', 6, [marko], ['Funkcionalnost']],
      [web, ana, 'Popravi prelom glave na mobilnih napravah', 0, 'urgent', -2, [marko], ['Napaka']],
      [web, nina, 'Testni scenariji za registracijo', 2, 'medium', 2, [nina], []],
      [web, ana, 'Optimizacija slik in hitrosti nalaganja', 0, 'low', 14, [], ['Izboljšava']],
      [web, eva, 'Ilustracije za domačo stran', 0, 'medium', 9, [eva], ['Dizajn']],
      [web, marko, 'Integracija analitike', 3, 'low', -5, [marko], ['Funkcionalnost']],
      [app, ana, 'Prijava z e-pošto in geslom', 3, 'high', -8, [luka], ['Funkcionalnost']],
      [app, luka, 'Potisna obvestila', 1, 'urgent', 1, [luka, marko], ['Funkcionalnost']],
      [app, eva, 'Zaslon za uvajanje novih uporabnikov', 2, 'high', 3, [eva], ['Dizajn']],
      [app, marko, 'Sesutje ob odpiranju profila brez slike', 0, 'urgent', -1, [marko], ['Napaka']],
      [app, ana, 'Objava v App Store', 0, 'high', 5, [ana], []],
      [app, luka, 'Predpomnjenje podatkov brez povezave', 0, 'medium', null, [], ['Izboljšava']],
      [ops, luka, 'Ocena ponudnikov PostgreSQL', 1, 'medium', 10, [luka], ['Dokumentacija']],
      [ops, luka, 'Načrt varnostnih kopij', 0, 'high', 20, [ana], []],
    ];

    for (const [projectId, actorId, title, columnPos, priority, due, assignees, labelNames] of plan) {
      const task = await createTask(db, {
        projectId,
        actorId,
        data: {
          title,
          description: 'Opis naloge z ključnimi zahtevami in merili sprejemljivosti.',
          columnId: col(projectId, 0),
          priority,
          dueDate: due === null ? null : day(due),
          assigneeIds: assignees,
          labelIds: labelNames.map((n) => label(projectId, n)),
        },
      });
      if (columnPos > 0) {
        await moveTask(db, {
          task: { id: task.id, projectId, number: task.number },
          actorId,
          columnId: col(projectId, columnPos),
          index: 0,
        });
      }
      if (title.startsWith('Potisna')) {
        for (const [i, item] of ['Registracija naprave', 'Strežniški API', 'Nastavitve obvestil'].entries()) {
          await db.query('INSERT INTO checklist_items (task_id, content, is_done, position) VALUES ($1, $2, $3, $4)', [
            task.id,
            item,
            i === 0,
            i,
          ]);
        }
        await db.query('INSERT INTO comments (task_id, author_id, body) VALUES ($1, $2, $3)', [
          task.id,
          marko,
          'Strežniški del je pripravljen za testiranje na staging okolju.',
        ]);
      }
    }
    console.log(`[seed] Ustvarjenih ${users.length} uporabnikov, 3 projekti in ${plan.length} nalog.`);
    console.log(`[seed] Prijava: ana.novak@mastertask.si / ${PASSWORD}`);
  });
}

seed()
  .catch((err) => {
    console.error('[seed]', err.message);
    process.exitCode = 1;
  })
  .finally(closePool);
