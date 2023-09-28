import express from 'express';
import promBundle from 'express-prom-bundle';
import heliaFetcher, { routeEntry } from './heliaServer.js';

const app = express();
const promMetricsMiddleware = promBundle({ includeMethod: true });

// Add the prometheus middleware
app.use(promMetricsMiddleware);

app.get('/', (req, res) => {
    res.send('Helia Docker, to fetch a page, call `/ipns/<path>` or `/ipfs/<cid>`');
});

await heliaFetcher.isReady;

heliaFetcher.routes.map(({ type, path, handler }: routeEntry) => app[type](path, handler))

app.get('/.+', (_req, res): Express.Response => res.send('404 Not Found'));

app.listen(3000, () => {
    console.log('Server listening on http://localhost:3000');
});
