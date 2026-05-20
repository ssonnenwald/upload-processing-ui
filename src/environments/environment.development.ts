export const environment = {
  production: false,
  // Empty base: requests go through the Angular CLI proxy (proxy.conf.json)
  // which forwards /api and /hubs to the .NET API on localhost:5099.
  apiBaseUrl: '',
  hubUrl: '/hubs/run-status',
};
