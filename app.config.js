/**
 * Static `extra` — do NOT use `...config.extra` or merge with `(config)=>` /
 * dynamic `API_URL`; that can resurrect an old EAS projectId.
 */
export default {
  expo: {
    name: "Clinifly",
    slug: "clinifly-new",
    extra: {
      API_URL: "https://cliniflow-backend-clean-production.up.railway.app",
      eas: {
        projectId: "f970fe3c-b598-44e7-9f04-c938e4a4321d",
      },
    },
  },
};
