/**
 * 코드에서 쓰는 에셋 키. 모든 키는 `manifest.json`에 있어야 한다 (`tests/manifest.test.ts`).
 */
import manifestJson from './manifest.json';
import type { AssetManifest } from '../core/assets/manifest';

export const MANIFEST = manifestJson as AssetManifest;

export type ThemeId = 'cave' | 'ruins' | 'abyss';
export type RoleId = 'warrior' | 'rogue' | 'archer' | 'mage';
export type BgLayer = 'far' | 'mid' | 'near';

export const AssetKey = {
  player: (role: RoleId) => `player_${role}`,
  monster: (id: string) => `monster_${id}`,
  boss: (id: string) => `boss_${id}`,
  tiles: (theme: ThemeId) => `tiles_${theme}`,
  bg: (theme: ThemeId, layer: BgLayer) => `bg_${theme}_${layer}`,
  fg: (theme: ThemeId) => `fg_${theme}`,
  portalBlue: 'portal_blue',
  portalRed: 'portal_red',
  chest: 'chest',
  altar: 'altar',
  slash: 'fx_slash',
  particle: 'fx_particle',
  arrow: 'proj_arrow',
  orb: 'proj_orb',
  enemyShot: 'proj_enemy',
  bossShot: 'proj_boss',
  heal: 'pickup_heal',
} as const;
