const config = require('./config');
const app = require('./app');

app.listen(config.port, () => {
  console.log(`[api] MasterTask API posluša na http://localhost:${config.port}/api`);
});
