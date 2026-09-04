import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: 'txt-reader',
    appBundleId: 'local.moodu.txtreader',
    icon: undefined,
    ignore: [
      /^\/(?:coverage|docs|out|playwright-report|scripts|test-results|tests)(?:\/|$)/,
      /^\/(?:\.gitignore|AGENTS\.md|PRODUCT_DESIGN\.md|README\.md|eslint\.config\.mjs|forge\.config\.ts|index\.html|package-lock\.json|playwright\.config\.ts|tsconfig\.json|vite\..+\.config\.ts|vitest\.config\.ts)$/,
      /^\/node_modules\/\.vite(?:\/|$)/,
      /^\/src(?:\/|$)/,
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'moodu_txt_reader',
      setupExe: 'TXT-Reader-Setup.exe',
    }),
    new MakerZIP({}, ['win32']),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
