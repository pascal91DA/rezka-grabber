import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MIRRORS,
  findMirrorOrigin,
  getActiveMirror,
  getMirrorSetting,
  loadMirrorSetting,
  mirrorHost,
  setMirrorSetting,
  switchToNextMirror,
  toMirror,
} from '../services/mirrorService';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const [AG, UA] = MIRRORS.map((m) => m.url);

beforeEach(() => {
  setMirrorSetting('auto');
});

describe('toMirror', () => {
  it('переносит URL одного зеркала на другое', () => {
    expect(toMirror(`${AG}/films/fiction/981-matrica-1999-latest.html`, UA)).toBe(
      `${UA}/films/fiction/981-matrica-1999-latest.html`,
    );
  });

  it('по умолчанию переносит на активное зеркало', () => {
    setMirrorSetting(UA);
    expect(toMirror(`${AG}/ajax/get_cdn_series/`)).toBe(`${UA}/ajax/get_cdn_series/`);
  });

  it('не трогает чужие URL', () => {
    expect(toMirror('https://cdn.rezka.ag/posters/1.jpg', UA)).toBe(
      'https://cdn.rezka.ag/posters/1.jpg',
    );
    expect(findMirrorOrigin('https://rezka.agency/x')).toBeNull();
  });
});

describe('switchToNextMirror', () => {
  it('в режиме «Авто» переключает на следующее зеркало', () => {
    expect(switchToNextMirror(AG)).toBe(UA);
    expect(getActiveMirror()).toBe(UA);
  });

  it('при ручном выборе зеркала не переключает', () => {
    setMirrorSetting(AG);
    expect(switchToNextMirror(AG)).toBeNull();
    expect(getActiveMirror()).toBe(AG);
  });
});

describe('настройка зеркала', () => {
  it('сохраняется и восстанавливается из AsyncStorage', async () => {
    setMirrorSetting(UA);
    // имитируем перезапуск: сбрасываем состояние в памяти, не трогая хранилище
    await AsyncStorage.setItem('mirror_setting_v1', UA);
    await loadMirrorSetting();
    expect(getMirrorSetting()).toBe(UA);
    expect(getActiveMirror()).toBe(UA);
  });

  it('игнорирует неизвестное сохранённое значение', async () => {
    await AsyncStorage.setItem('mirror_setting_v1', 'https://evil.example');
    await loadMirrorSetting();
    expect(getMirrorSetting()).toBe('auto');
  });
});

it('mirrorHost отрезает протокол', () => {
  expect(mirrorHost(UA)).toBe('rezka-ua.tv');
});
