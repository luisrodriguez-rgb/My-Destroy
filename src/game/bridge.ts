export type { WeaponId } from './weapons/types';
import type { WeaponId } from './weapons/types';

export type Preferences = { muted: boolean; reducedMotion: boolean };
export type SceneStats = {
  shots: number;
  hits: number;
  percent: number;
  paused: boolean;
  ready: boolean;
  weapon: WeaponId;
};
export type SceneControls = {
  reset(): void;
  pause(value: boolean): void;
  preferences(value: Preferences): void;
  focus(): void;
  setWeapon(id: WeaponId): void;
};
export type SceneCallbacks = { update(stats: SceneStats): void; toggleMute(): void };
export const EMPTY_STATS: SceneStats = { shots: 0, hits: 0, percent: 0, paused: false, ready: false, weapon: 'pistol' };
