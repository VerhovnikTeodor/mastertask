const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { query } = require('./db/pool');
const { authenticate } = require('./middleware/auth');
const { requireCsrfHeader, noStore } = require('./middleware/security');
const { notFoundHandler, errorHandler } = require('./middleware/errors');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

const api = express.Router();
api.use(noStore);
api.use(requireCsrfHeader);

api.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: 'ok' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'unavailable' });
  }
});

api.use('/auth', require('./routes/auth'));
api.use('/users', authenticate, require('./routes/users'));
api.use('/projects', authenticate, require('./routes/projects'));
api.use('/tasks', authenticate, require('./routes/tasks'));
api.use('/comments', authenticate, require('./routes/comments'));
api.use('/dashboard', authenticate, require('./routes/dashboard'));
api.use('/notifications', authenticate, require('./routes/notifications'));
api.use('/search', authenticate, require('./routes/search'));
api.use('/views', authenticate, require('./routes/views'));
api.use(notFoundHandler);

app.use('/api', api);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
