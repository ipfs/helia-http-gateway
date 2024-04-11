# Configuration

This folder is intended to contain various configuration files for the project.

## Metrics

### Using our provided grafana dashboard with prometheus and grafana

From inside this directory, you can run the following command to start up a grafana and prometheus instance with some default dashboards and datasources set up.

```sh
docker compose -f docker-compose.yml up -d
```

Then visit <http://localhost:9191/d/helia-http-gateway-default/helia-http-gateway-default-dashboard?orgId=1&refresh=5s> and login with the default credentials (admin:admin). The prometheus datasource and the dashboard should be automatically set up.

If you want to generate some metrics quickly, you can run `npm run debug:until-death` and you should start seeing metrics in the dashboard for the results of querying the gateway for the websites listed by <https://probelab.io/websites/>

If you need to reset the grafana database for whatever reason, you can try this command: `cd config && docker compose down && rm grafana/grafana.db  && docker compose rm -fsv && docker compose up -d`
