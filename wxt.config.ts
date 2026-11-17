import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'Lichess Crazyhouse Click-to-Drop',
    description: 'Click a crazyhouse pocket piece, then a square, to drop it on lichess.org.',
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: { id: 'zh-click-drop@example.com', data_collection_permissions: { required: ['none'] } },
      },
    }),
  }),
});
